// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import "./load-env.mjs";
import { hash as argon2Hash } from "@node-rs/argon2";
import bcrypt from "bcryptjs";
import mysql from "mysql2/promise";

const DEFAULT_PASSWORD_ALGO = "argon2id";
const DEFAULT_BCRYPT_ROUNDS = 12;
const DEFAULT_ARGON2_MEMORY_KB = 65536;
const DEFAULT_ARGON2_TIME_COST = 3;
const DEFAULT_ARGON2_PARALLELISM = 1;

function parsePositiveInt(value, fallback, key) {
  if (value == null || value.length === 0) {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${key} must be a positive integer`);
  }

  return parsed;
}

function parsePasswordAlgorithm(value, fallback, key) {
  if (value == null || value.length === 0) {
    return fallback;
  }

  if (value === "argon2id" || value === "bcrypt") {
    return value;
  }

  throw new Error(`${key} must be "argon2id" or "bcrypt"`);
}

function dbConfigFromEnv() {
  const port = Number(process.env.DB_PORT ?? "3306");
  if (Number.isNaN(port)) {
    throw new Error("DB_PORT must be a number");
  }

  return {
    host: process.env.DB_HOST ?? "127.0.0.1",
    port,
    user: process.env.DB_USER ?? "root",
    password: process.env.DB_PASSWORD ?? "",
    database: process.env.DB_NAME ?? "jurnapod"
  };
}

function seedConfigFromEnv() {
  return {
    companyCode: process.env.JP_COMPANY_CODE ?? "JP",
    companyName: process.env.JP_COMPANY_NAME ?? "Jurnapod Demo",
    outletCode: process.env.JP_OUTLET_CODE ?? "MAIN",
    outletName: process.env.JP_OUTLET_NAME ?? "Main Outlet",
    ownerEmail: process.env.JP_OWNER_EMAIL ?? "owner@local",
    ownerPassword: process.env.JP_OWNER_PASSWORD ?? "ChangeMe123!",
    superAdminEmail: process.env.JP_SUPER_ADMIN_EMAIL ?? null,
    superAdminPassword: process.env.JP_SUPER_ADMIN_PASSWORD ?? null
  };
}

function passwordPolicyFromEnv() {
  return {
    defaultAlgorithm: parsePasswordAlgorithm(
      process.env.AUTH_PASSWORD_ALGO_DEFAULT,
      DEFAULT_PASSWORD_ALGO,
      "AUTH_PASSWORD_ALGO_DEFAULT"
    ),
    bcryptRounds: parsePositiveInt(
      process.env.AUTH_BCRYPT_ROUNDS,
      DEFAULT_BCRYPT_ROUNDS,
      "AUTH_BCRYPT_ROUNDS"
    ),
    argon2MemoryKb: parsePositiveInt(
      process.env.AUTH_ARGON2_MEMORY_KB,
      DEFAULT_ARGON2_MEMORY_KB,
      "AUTH_ARGON2_MEMORY_KB"
    ),
    argon2TimeCost: parsePositiveInt(
      process.env.AUTH_ARGON2_TIME_COST,
      DEFAULT_ARGON2_TIME_COST,
      "AUTH_ARGON2_TIME_COST"
    ),
    argon2Parallelism: parsePositiveInt(
      process.env.AUTH_ARGON2_PARALLELISM,
      DEFAULT_ARGON2_PARALLELISM,
      "AUTH_ARGON2_PARALLELISM"
    )
  };
}

const PERMISSION_BITS = {
  create: 1,
  read: 2,
  update: 4,
  delete: 8
};

async function hashOwnerPassword(password, policy) {
  if (policy.defaultAlgorithm === "bcrypt") {
    return bcrypt.hash(password, policy.bcryptRounds);
  }

  return argon2Hash(password, {
    algorithm: 2,
    memoryCost: policy.argon2MemoryKb,
    timeCost: policy.argon2TimeCost,
    parallelism: policy.argon2Parallelism
  });
}

async function upsertCompany(connection, companyCode, companyName) {
  const [result] = await connection.execute(
    `INSERT INTO companies (code, name)
     VALUES (?, ?)
     ON DUPLICATE KEY UPDATE
       name = VALUES(name),
       id = LAST_INSERT_ID(id),
       updated_at = CURRENT_TIMESTAMP`,
    [companyCode, companyName]
  );

  return Number(result.insertId);
}

async function upsertOutlet(connection, companyId, outletCode, outletName) {
  const [result] = await connection.execute(
    `INSERT INTO outlets (company_id, code, name)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE
       name = VALUES(name),
       id = LAST_INSERT_ID(id),
       updated_at = CURRENT_TIMESTAMP`,
    [companyId, outletCode, outletName]
  );

  return Number(result.insertId);
}

async function upsertRole(connection, roleCode, roleName) {
  const [result] = await connection.execute(
    `INSERT INTO roles (code, name)
     VALUES (?, ?)
     ON DUPLICATE KEY UPDATE
       name = VALUES(name),
       id = LAST_INSERT_ID(id),
       updated_at = CURRENT_TIMESTAMP`,
    [roleCode, roleName]
  );

  return Number(result.insertId);
}

async function upsertModuleRolePermission(
  connection,
  companyId,
  roleId,
  module,
  permissionMask
) {
  await connection.execute(
    `INSERT INTO module_roles (company_id, role_id, module, permission_mask)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       permission_mask = VALUES(permission_mask),
       updated_at = CURRENT_TIMESTAMP`,
    [companyId, roleId, module, permissionMask]
  );
}

async function upsertOwner(connection, companyId, ownerEmail, passwordHash) {
  const [result] = await connection.execute(
    `INSERT INTO users (company_id, email, password_hash, is_active)
     VALUES (?, ?, ?, 1)
     ON DUPLICATE KEY UPDATE
       password_hash = VALUES(password_hash),
       is_active = 1,
       id = LAST_INSERT_ID(id),
       updated_at = CURRENT_TIMESTAMP`,
    [companyId, ownerEmail, passwordHash]
  );

  return Number(result.insertId);
}

async function upsertModule(connection, code, name, description) {
  const [result] = await connection.execute(
    `INSERT INTO modules (code, name, description)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE
       id = LAST_INSERT_ID(id),
       name = VALUES(name),
       description = VALUES(description),
       updated_at = CURRENT_TIMESTAMP`,
    [code, name, description]
  );

  return Number(result.insertId);
}

async function upsertCompanyModule(
  connection,
  companyId,
  moduleId,
  enabled,
  configJson,
  userId
) {
  await connection.execute(
    `INSERT INTO company_modules (
       company_id,
       module_id,
       enabled,
       config_json,
       created_by_user_id,
       updated_by_user_id
     ) VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       enabled = VALUES(enabled),
       config_json = VALUES(config_json),
       updated_by_user_id = VALUES(updated_by_user_id),
       updated_at = CURRENT_TIMESTAMP`,
    [
      companyId,
      moduleId,
      enabled ? 1 : 0,
      configJson,
      userId,
      userId
    ]
  );
}

async function main() {
  const dbConfig = dbConfigFromEnv();
  const seedConfig = seedConfigFromEnv();
  const passwordPolicy = passwordPolicyFromEnv();
  const connection = await mysql.createConnection(dbConfig);

  try {
    await connection.beginTransaction();

    const companyId = await upsertCompany(
      connection,
      seedConfig.companyCode,
      seedConfig.companyName
    );
    const outletId = await upsertOutlet(
      connection,
      companyId,
      seedConfig.outletCode,
      seedConfig.outletName
    );

    const roleDefinitions = [
      ["SUPER_ADMIN", "Super Admin"],
      ["OWNER", "Owner"],
      ["ADMIN", "Admin"],
      ["CASHIER", "Cashier"],
      ["ACCOUNTANT", "Accountant"]
    ];

    let ownerRoleId = 0;
    let roleIds = {};
    for (const [roleCode, roleName] of roleDefinitions) {
      const roleId = await upsertRole(connection, roleCode, roleName);
      roleIds[roleCode] = roleId;
      if (roleCode === "OWNER") {
        ownerRoleId = roleId;
      }
    }

    if (!ownerRoleId) {
      throw new Error("OWNER role id not found after seed upsert");
    }

    // Seed default module permissions
    const modulePermissions = [
      // SUPER_ADMIN - full access to all modules
      { roleCode: "SUPER_ADMIN", module: "companies", create: 1, read: 1, update: 1, delete: 1 },
      { roleCode: "SUPER_ADMIN", module: "users", create: 1, read: 1, update: 1, delete: 1 },
      { roleCode: "SUPER_ADMIN", module: "roles", create: 1, read: 1, update: 1, delete: 1 },
      { roleCode: "SUPER_ADMIN", module: "outlets", create: 1, read: 1, update: 1, delete: 1 },
      { roleCode: "SUPER_ADMIN", module: "accounts", create: 1, read: 1, update: 1, delete: 1 },
      { roleCode: "SUPER_ADMIN", module: "journals", create: 1, read: 1, update: 1, delete: 1 },
      { roleCode: "SUPER_ADMIN", module: "sales", create: 1, read: 1, update: 1, delete: 1 },
      { roleCode: "SUPER_ADMIN", module: "inventory", create: 1, read: 1, update: 1, delete: 1 },
      { roleCode: "SUPER_ADMIN", module: "purchasing", create: 1, read: 1, update: 1, delete: 1 },
      { roleCode: "SUPER_ADMIN", module: "reports", create: 1, read: 1, update: 1, delete: 1 },
      { roleCode: "SUPER_ADMIN", module: "settings", create: 1, read: 1, update: 1, delete: 1 },
      // OWNER - full access
      { roleCode: "OWNER", module: "companies", create: 1, read: 1, update: 1, delete: 1 },
      { roleCode: "OWNER", module: "users", create: 1, read: 1, update: 1, delete: 1 },
      { roleCode: "OWNER", module: "roles", create: 1, read: 1, update: 1, delete: 1 },
      { roleCode: "OWNER", module: "outlets", create: 1, read: 1, update: 1, delete: 1 },
      { roleCode: "OWNER", module: "accounts", create: 1, read: 1, update: 1, delete: 1 },
      { roleCode: "OWNER", module: "journals", create: 1, read: 1, update: 1, delete: 1 },
      { roleCode: "OWNER", module: "sales", create: 1, read: 1, update: 1, delete: 1 },
      { roleCode: "OWNER", module: "inventory", create: 1, read: 1, update: 1, delete: 1 },
      { roleCode: "OWNER", module: "purchasing", create: 1, read: 1, update: 1, delete: 1 },
      { roleCode: "OWNER", module: "reports", create: 1, read: 1, update: 1, delete: 1 },
      { roleCode: "OWNER", module: "settings", create: 1, read: 1, update: 1, delete: 1 },
      // ADMIN - same as owner
      { roleCode: "ADMIN", module: "companies", create: 0, read: 1, update: 0, delete: 0 },
      { roleCode: "ADMIN", module: "users", create: 1, read: 1, update: 1, delete: 1 },
      { roleCode: "ADMIN", module: "roles", create: 0, read: 1, update: 0, delete: 0 },
      { roleCode: "ADMIN", module: "outlets", create: 1, read: 1, update: 1, delete: 1 },
      { roleCode: "ADMIN", module: "accounts", create: 1, read: 1, update: 1, delete: 1 },
      { roleCode: "ADMIN", module: "journals", create: 1, read: 1, update: 1, delete: 1 },
      { roleCode: "ADMIN", module: "sales", create: 1, read: 1, update: 1, delete: 1 },
      { roleCode: "ADMIN", module: "inventory", create: 1, read: 1, update: 1, delete: 1 },
      { roleCode: "ADMIN", module: "purchasing", create: 1, read: 1, update: 1, delete: 1 },
      { roleCode: "ADMIN", module: "reports", create: 0, read: 1, update: 0, delete: 0 },
      { roleCode: "ADMIN", module: "settings", create: 0, read: 1, update: 1, delete: 0 },
      // CASHIER - limited access
      { roleCode: "CASHIER", module: "companies", create: 0, read: 0, update: 0, delete: 0 },
      { roleCode: "CASHIER", module: "users", create: 0, read: 0, update: 0, delete: 0 },
      { roleCode: "CASHIER", module: "roles", create: 0, read: 0, update: 0, delete: 0 },
      { roleCode: "CASHIER", module: "outlets", create: 0, read: 1, update: 0, delete: 0 },
      { roleCode: "CASHIER", module: "accounts", create: 0, read: 0, update: 0, delete: 0 },
      { roleCode: "CASHIER", module: "journals", create: 0, read: 0, update: 0, delete: 0 },
      { roleCode: "CASHIER", module: "sales", create: 1, read: 1, update: 0, delete: 0 },
      { roleCode: "CASHIER", module: "inventory", create: 0, read: 1, update: 0, delete: 0 },
      { roleCode: "CASHIER", module: "purchasing", create: 0, read: 0, update: 0, delete: 0 },
      { roleCode: "CASHIER", module: "reports", create: 0, read: 1, update: 0, delete: 0 },
      { roleCode: "CASHIER", module: "settings", create: 0, read: 0, update: 0, delete: 0 },
      // ACCOUNTANT - read mostly
      { roleCode: "ACCOUNTANT", module: "companies", create: 0, read: 0, update: 0, delete: 0 },
      { roleCode: "ACCOUNTANT", module: "users", create: 0, read: 0, update: 0, delete: 0 },
      { roleCode: "ACCOUNTANT", module: "roles", create: 0, read: 0, update: 0, delete: 0 },
      { roleCode: "ACCOUNTANT", module: "outlets", create: 0, read: 1, update: 0, delete: 0 },
      { roleCode: "ACCOUNTANT", module: "accounts", create: 0, read: 1, update: 0, delete: 0 },
      { roleCode: "ACCOUNTANT", module: "journals", create: 0, read: 1, update: 0, delete: 0 },
      { roleCode: "ACCOUNTANT", module: "sales", create: 0, read: 1, update: 0, delete: 0 },
      { roleCode: "ACCOUNTANT", module: "inventory", create: 0, read: 0, update: 0, delete: 0 },
      { roleCode: "ACCOUNTANT", module: "purchasing", create: 0, read: 1, update: 0, delete: 0 },
      { roleCode: "ACCOUNTANT", module: "reports", create: 0, read: 1, update: 0, delete: 0 },
      { roleCode: "ACCOUNTANT", module: "settings", create: 0, read: 0, update: 0, delete: 0 }
    ];

    for (const perm of modulePermissions) {
      const roleId = roleIds[perm.roleCode];
      if (roleId) {
        const permissionMask =
          (perm.create ? PERMISSION_BITS.create : 0) |
          (perm.read ? PERMISSION_BITS.read : 0) |
          (perm.update ? PERMISSION_BITS.update : 0) |
          (perm.delete ? PERMISSION_BITS.delete : 0);
        await upsertModuleRolePermission(
          connection,
          companyId,
          roleId,
          perm.module,
          permissionMask
        );
      }
    }

    const ownerPasswordHash = await hashOwnerPassword(seedConfig.ownerPassword, passwordPolicy);
    const ownerUserId = await upsertOwner(
      connection,
      companyId,
      seedConfig.ownerEmail,
      ownerPasswordHash
    );

    await connection.execute(
      `INSERT INTO user_roles (user_id, role_id)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE user_id = VALUES(user_id)`,
      [ownerUserId, ownerRoleId]
    );

    await connection.execute(
      `INSERT INTO user_outlets (user_id, outlet_id)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE user_id = VALUES(user_id)`,
      [ownerUserId, outletId]
    );

    // Create SUPER_ADMIN user if configured
    if (seedConfig.superAdminEmail && seedConfig.superAdminPassword) {
      const [superAdminRoleRows] = await connection.execute(
        `SELECT id FROM roles WHERE code = ?`,
        ["SUPER_ADMIN"]
      );
      const superAdminRoleId = superAdminRoleRows[0]?.id;
      if (!superAdminRoleId) {
        console.warn("SUPER_ADMIN role not found, skipping super admin user creation");
      } else {
        const superAdminPasswordHash = await hashOwnerPassword(
          seedConfig.superAdminPassword,
          passwordPolicy
        );
        const [superAdminResult] = await connection.execute(
          `INSERT INTO users (company_id, email, password_hash, is_active)
           VALUES (?, ?, ?, 1)
           ON DUPLICATE KEY UPDATE
             password_hash = VALUES(password_hash),
             is_active = 1,
             updated_at = CURRENT_TIMESTAMP`,
          [companyId, seedConfig.superAdminEmail.toLowerCase(), superAdminPasswordHash]
        );
        const superAdminUserId = superAdminResult.insertId;

        await connection.execute(
          `INSERT INTO user_roles (user_id, role_id)
           VALUES (?, ?)
           ON DUPLICATE KEY UPDATE role_id = VALUES(role_id)`,
          [superAdminUserId, superAdminRoleId]
        );
        console.log(`superadmin=${seedConfig.superAdminEmail}`);
      }
    }

    const moduleCatalog = [
      {
        code: "platform",
        name: "Platform",
        description: "Core platform services"
      },
      {
        code: "pos",
        name: "POS",
        description: "Point of sale"
      },
      {
        code: "sales",
        name: "Sales",
        description: "Sales invoices"
      },
      {
        code: "inventory",
        name: "Inventory",
        description: "Stock movements and recipes"
      },
      {
        code: "purchasing",
        name: "Purchasing",
        description: "Purchasing and payables"
      },
      {
        code: "reports",
        name: "Reports",
        description: "Reporting and analytics"
      },
      {
        code: "settings",
        name: "Settings",
        description: "Settings and configuration"
      },
      {
        code: "accounts",
        name: "Accounts",
        description: "Chart of accounts"
      },
      {
        code: "journals",
        name: "Journals",
        description: "Journal entries and posting"
      }
    ];

    const moduleIds = {};
    for (const moduleEntry of moduleCatalog) {
      const moduleId = await upsertModule(
        connection,
        moduleEntry.code,
        moduleEntry.name,
        moduleEntry.description
      );
      moduleIds[moduleEntry.code] = moduleId;
    }

    const companyModules = [
      { code: "platform", enabled: true, config: {} },
      { code: "pos", enabled: true, config: { payment_methods: ["CASH"] } },
      { code: "sales", enabled: true, config: {} },
      { code: "inventory", enabled: true, config: { level: 0 } },
      { code: "purchasing", enabled: false, config: {} },
      { code: "reports", enabled: true, config: {} },
      { code: "settings", enabled: true, config: {} },
      { code: "accounts", enabled: true, config: {} },
      { code: "journals", enabled: true, config: {} }
    ];

    for (const moduleEntry of companyModules) {
      const moduleId = moduleIds[moduleEntry.code];
      if (!moduleId) {
        throw new Error(`module id not found for ${moduleEntry.code}`);
      }

      await upsertCompanyModule(
        connection,
        companyId,
        moduleId,
        moduleEntry.enabled,
        JSON.stringify(moduleEntry.config ?? {}),
        ownerUserId
      );
    }

    await connection.commit();
    console.log("seed completed");
    console.log(`company=${seedConfig.companyCode} owner=${seedConfig.ownerEmail}`);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error("seed failed");
  console.error(error.message);
  process.exitCode = 1;
});
