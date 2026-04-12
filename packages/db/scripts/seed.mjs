// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import "./load-env.mjs";
import { hash as argon2Hash } from "@node-rs/argon2";
import bcrypt from "bcryptjs";
import mysql from "mysql2/promise";

// Epic 39 canonical permission bits (from @jurnapod/shared)
// Bit layout: READ=1, CREATE=2, UPDATE=4, DELETE=8, ANALYZE=16, MANAGE=32
const PERMISSION_BITS = {
  read: 1,     // 0b000001
  create: 2,   // 0b000010
  update: 4,   // 0b000100
  delete: 8,   // 0b001000
  analyze: 16, // 0b010000
  manage: 32   // 0b100000
};

// Composite masks
const MASKS = {
  CRUD: 15,      // 1+2+4+8 - read+create+update+delete
  CRUDA: 31,     // +16 - CRUD+analyze
  CRUDAM: 63     // +32 - CRUDA+manage
};

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
  // First check if company exists
  const [existing] = await connection.execute(
    `SELECT id FROM companies WHERE code = ? LIMIT 1`,
    [companyCode]
  );
  
  if (existing.length > 0) {
    // Update name if it changed
    await connection.execute(
      `UPDATE companies SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE code = ?`,
      [companyName, companyCode]
    );
    return Number(existing[0].id);
  }
  
  // Insert new company
  const [result] = await connection.execute(
    `INSERT INTO companies (code, name) VALUES (?, ?)`,
    [companyCode, companyName]
  );

  return Number(result.insertId);
}

async function upsertOutlet(connection, companyId, outletCode, outletName) {
  // First check if outlet exists
  const [existing] = await connection.execute(
    `SELECT id FROM outlets WHERE company_id = ? AND code = ? LIMIT 1`,
    [companyId, outletCode]
  );
  
  if (existing.length > 0) {
    // Update name if it changed
    await connection.execute(
      `UPDATE outlets SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE company_id = ? AND code = ?`,
      [outletName, companyId, outletCode]
    );
    return Number(existing[0].id);
  }
  
  // Insert new outlet
  const [result] = await connection.execute(
    `INSERT INTO outlets (company_id, code, name) VALUES (?, ?, ?)`,
    [companyId, outletCode, outletName]
  );

  return Number(result.insertId);
}

async function upsertRole(connection, roleCode, roleName, isGlobal, roleLevel) {
  // Resolve only system role rows (company_id IS NULL)
  const [existing] = await connection.execute(
    `SELECT id
     FROM roles
     WHERE code = ?
       AND company_id IS NULL
     ORDER BY id ASC
     LIMIT 1`,
    [roleCode]
  );

  if (existing.length > 0) {
    return Number(existing[0].id);
  }

  // Insert as explicit system role when missing
  const [result] = await connection.execute(
    `INSERT INTO roles (company_id, code, name, is_global, role_level)
     VALUES (NULL, ?, ?, ?, ?)`,
    [roleCode, roleName, isGlobal ? 1 : 0, roleLevel]
  );

  return Number(result.insertId);
}

async function upsertModuleRolePermission(
  connection,
  companyId,
  roleId,
  module,
  permissionMask,
  resource = null
) {
  await connection.execute(
    `INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       permission_mask = VALUES(permission_mask),
       updated_at = CURRENT_TIMESTAMP`,
    [companyId, roleId, module, resource, permissionMask]
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
      { code: "SUPER_ADMIN", name: "Super Admin", isGlobal: true, roleLevel: 100 },
      { code: "OWNER", name: "Owner", isGlobal: true, roleLevel: 90 },
      { code: "COMPANY_ADMIN", name: "Company Admin", isGlobal: true, roleLevel: 80 },
      { code: "ADMIN", name: "Admin", isGlobal: false, roleLevel: 60 },
      { code: "ACCOUNTANT", name: "Accountant", isGlobal: false, roleLevel: 40 },
      { code: "CASHIER", name: "Cashier", isGlobal: false, roleLevel: 20 }
    ];

    let ownerRoleId = 0;
    let roleIds = {};
    for (const roleDef of roleDefinitions) {
      const roleId = await upsertRole(
        connection,
        roleDef.code,
        roleDef.name,
        roleDef.isGlobal,
        roleDef.roleLevel
      );
      roleIds[roleDef.code] = roleId;
      if (roleDef.code === "OWNER") {
        ownerRoleId = roleId;
      }
    }

    if (!ownerRoleId) {
      throw new Error("OWNER role id not found after seed upsert");
    }

    // Seed default module permissions (Epic 39 resource-level ACL format)
    // Format: module.resource (e.g., "platform.users")
    // Masks use canonical bits: READ=1, CREATE=2, UPDATE=4, DELETE=8, ANALYZE=16, MANAGE=32
    const modulePermissions = [
      // SUPER_ADMIN - full CRUDAM access to all modules/resources
      { roleCode: "SUPER_ADMIN", module: "platform.companies", mask: MASKS.CRUDAM },
      { roleCode: "SUPER_ADMIN", module: "platform.users", mask: MASKS.CRUDAM },
      { roleCode: "SUPER_ADMIN", module: "platform.roles", mask: MASKS.CRUDAM },
      { roleCode: "SUPER_ADMIN", module: "platform.outlets", mask: MASKS.CRUDAM },
      { roleCode: "SUPER_ADMIN", module: "platform.settings", mask: MASKS.CRUDAM },
      { roleCode: "SUPER_ADMIN", module: "accounting.accounts", mask: MASKS.CRUDAM },
      { roleCode: "SUPER_ADMIN", module: "accounting.journals", mask: MASKS.CRUDAM },
      { roleCode: "SUPER_ADMIN", module: "accounting.fiscal_years", mask: MASKS.CRUDAM },
      { roleCode: "SUPER_ADMIN", module: "accounting.reports", mask: MASKS.CRUDAM },
      { roleCode: "SUPER_ADMIN", module: "treasury.transactions", mask: MASKS.CRUDAM },
      { roleCode: "SUPER_ADMIN", module: "treasury.accounts", mask: MASKS.CRUDAM },
      { roleCode: "SUPER_ADMIN", module: "sales.invoices", mask: MASKS.CRUDAM },
      { roleCode: "SUPER_ADMIN", module: "sales.orders", mask: MASKS.CRUDAM },
      { roleCode: "SUPER_ADMIN", module: "sales.payments", mask: MASKS.CRUDAM },
      { roleCode: "SUPER_ADMIN", module: "inventory.items", mask: MASKS.CRUDAM },
      { roleCode: "SUPER_ADMIN", module: "inventory.stock", mask: MASKS.CRUDAM },
      { roleCode: "SUPER_ADMIN", module: "inventory.costing", mask: MASKS.CRUDAM },
      { roleCode: "SUPER_ADMIN", module: "pos.transactions", mask: MASKS.CRUDAM },
      { roleCode: "SUPER_ADMIN", module: "pos.config", mask: MASKS.CRUDAM },
      { roleCode: "SUPER_ADMIN", module: "reservations.bookings", mask: MASKS.CRUDAM },
      { roleCode: "SUPER_ADMIN", module: "reservations.tables", mask: MASKS.CRUDAM },

      // OWNER - full CRUDAM access to all modules/resources except companies (create/delete reserved for SUPER_ADMIN)
      { roleCode: "OWNER", module: "platform.companies", mask: PERMISSION_BITS.read | PERMISSION_BITS.update }, // 5 - read + update only
      { roleCode: "OWNER", module: "platform.users", mask: MASKS.CRUDAM },
      { roleCode: "OWNER", module: "platform.roles", mask: MASKS.CRUDAM },
      { roleCode: "OWNER", module: "platform.outlets", mask: MASKS.CRUDAM },
      { roleCode: "OWNER", module: "platform.settings", mask: MASKS.CRUDAM },
      { roleCode: "OWNER", module: "accounting.accounts", mask: MASKS.CRUDAM },
      { roleCode: "OWNER", module: "accounting.journals", mask: MASKS.CRUDAM },
      { roleCode: "OWNER", module: "accounting.fiscal_years", mask: MASKS.CRUDAM },
      { roleCode: "OWNER", module: "accounting.reports", mask: MASKS.CRUDAM },
      { roleCode: "OWNER", module: "treasury.transactions", mask: MASKS.CRUDAM },
      { roleCode: "OWNER", module: "treasury.accounts", mask: MASKS.CRUDAM },
      { roleCode: "OWNER", module: "sales.invoices", mask: MASKS.CRUDAM },
      { roleCode: "OWNER", module: "sales.orders", mask: MASKS.CRUDAM },
      { roleCode: "OWNER", module: "sales.payments", mask: MASKS.CRUDAM },
      { roleCode: "OWNER", module: "inventory.items", mask: MASKS.CRUDAM },
      { roleCode: "OWNER", module: "inventory.stock", mask: MASKS.CRUDAM },
      { roleCode: "OWNER", module: "inventory.costing", mask: MASKS.CRUDAM },
      { roleCode: "OWNER", module: "pos.transactions", mask: MASKS.CRUDAM },
      { roleCode: "OWNER", module: "pos.config", mask: MASKS.CRUDAM },
      { roleCode: "OWNER", module: "reservations.bookings", mask: MASKS.CRUDAM },
      { roleCode: "OWNER", module: "reservations.tables", mask: MASKS.CRUDAM },

      // COMPANY_ADMIN - module-specific permissions per permission matrix
      { roleCode: "COMPANY_ADMIN", module: "platform.companies", mask: 0 },
      { roleCode: "COMPANY_ADMIN", module: "platform.users", mask: MASKS.CRUDA },
      { roleCode: "COMPANY_ADMIN", module: "platform.roles", mask: 0 },
      { roleCode: "COMPANY_ADMIN", module: "platform.outlets", mask: MASKS.CRUDA },
      { roleCode: "COMPANY_ADMIN", module: "platform.settings", mask: MASKS.CRUDA },
      { roleCode: "COMPANY_ADMIN", module: "accounting.accounts", mask: PERMISSION_BITS.read | PERMISSION_BITS.manage }, // 33 - Structural: manage+read
      { roleCode: "COMPANY_ADMIN", module: "accounting.journals", mask: MASKS.CRUDA },
      { roleCode: "COMPANY_ADMIN", module: "accounting.fiscal_years", mask: PERMISSION_BITS.read | PERMISSION_BITS.manage }, // 33 - Structural: manage+read
      { roleCode: "COMPANY_ADMIN", module: "accounting.reports", mask: MASKS.CRUDA },
      { roleCode: "COMPANY_ADMIN", module: "treasury.transactions", mask: MASKS.CRUDA },
      { roleCode: "COMPANY_ADMIN", module: "treasury.accounts", mask: PERMISSION_BITS.read | PERMISSION_BITS.manage }, // 33 - Structural: manage+read
      { roleCode: "COMPANY_ADMIN", module: "sales.invoices", mask: MASKS.CRUDA },
      { roleCode: "COMPANY_ADMIN", module: "sales.orders", mask: MASKS.CRUDA },
      { roleCode: "COMPANY_ADMIN", module: "sales.payments", mask: MASKS.CRUDA },
      { roleCode: "COMPANY_ADMIN", module: "inventory.items", mask: MASKS.CRUD },
      { roleCode: "COMPANY_ADMIN", module: "inventory.stock", mask: MASKS.CRUD },
      { roleCode: "COMPANY_ADMIN", module: "inventory.costing", mask: PERMISSION_BITS.read | PERMISSION_BITS.manage }, // 33 - Structural: manage+read
      { roleCode: "COMPANY_ADMIN", module: "pos.transactions", mask: MASKS.CRUDA },
      { roleCode: "COMPANY_ADMIN", module: "pos.config", mask: MASKS.CRUDA },
      { roleCode: "COMPANY_ADMIN", module: "reservations.bookings", mask: MASKS.CRUDA },
      { roleCode: "COMPANY_ADMIN", module: "reservations.tables", mask: MASKS.CRUDA },

      // ADMIN - moderate access
      { roleCode: "ADMIN", module: "platform.companies", mask: 0 },
      { roleCode: "ADMIN", module: "platform.users", mask: PERMISSION_BITS.read },
      { roleCode: "ADMIN", module: "platform.roles", mask: PERMISSION_BITS.read },
      { roleCode: "ADMIN", module: "platform.outlets", mask: PERMISSION_BITS.read },
      { roleCode: "ADMIN", module: "platform.settings", mask: PERMISSION_BITS.read },
      { roleCode: "ADMIN", module: "accounting.accounts", mask: PERMISSION_BITS.read }, // Structural: read only
      { roleCode: "ADMIN", module: "accounting.journals", mask: MASKS.CRUDA },
      { roleCode: "ADMIN", module: "accounting.fiscal_years", mask: PERMISSION_BITS.read }, // Structural: read only
      { roleCode: "ADMIN", module: "accounting.reports", mask: PERMISSION_BITS.read }, // Analytical: read only
      { roleCode: "ADMIN", module: "treasury.transactions", mask: MASKS.CRUDA },
      { roleCode: "ADMIN", module: "treasury.accounts", mask: PERMISSION_BITS.read }, // Structural: read only
      { roleCode: "ADMIN", module: "sales.invoices", mask: MASKS.CRUDA },
      { roleCode: "ADMIN", module: "sales.orders", mask: MASKS.CRUDA },
      { roleCode: "ADMIN", module: "sales.payments", mask: MASKS.CRUDA },
      { roleCode: "ADMIN", module: "inventory.items", mask: MASKS.CRUDA },
      { roleCode: "ADMIN", module: "inventory.stock", mask: MASKS.CRUDA },
      { roleCode: "ADMIN", module: "inventory.costing", mask: PERMISSION_BITS.read }, // Structural: read only
      { roleCode: "ADMIN", module: "pos.transactions", mask: MASKS.CRUDA },
      { roleCode: "ADMIN", module: "pos.config", mask: MASKS.CRUDA },
      { roleCode: "ADMIN", module: "reservations.bookings", mask: MASKS.CRUDA },
      { roleCode: "ADMIN", module: "reservations.tables", mask: PERMISSION_BITS.read }, // Structural: read only

      // CASHIER - minimal access (POS and reservations only)
      { roleCode: "CASHIER", module: "platform.companies", mask: 0 },
      { roleCode: "CASHIER", module: "platform.users", mask: 0 },
      { roleCode: "CASHIER", module: "platform.roles", mask: 0 },
      { roleCode: "CASHIER", module: "platform.outlets", mask: PERMISSION_BITS.read },
      { roleCode: "CASHIER", module: "platform.settings", mask: 0 },
      { roleCode: "CASHIER", module: "accounting.accounts", mask: 0 },
      { roleCode: "CASHIER", module: "accounting.journals", mask: 0 },
      { roleCode: "CASHIER", module: "accounting.fiscal_years", mask: 0 },
      { roleCode: "CASHIER", module: "accounting.reports", mask: 0 },
      { roleCode: "CASHIER", module: "treasury.transactions", mask: 0 },
      { roleCode: "CASHIER", module: "treasury.accounts", mask: PERMISSION_BITS.read }, // Structural: read only
      { roleCode: "CASHIER", module: "sales.invoices", mask: MASKS.CRUDA },
      { roleCode: "CASHIER", module: "sales.orders", mask: MASKS.CRUDA },
      { roleCode: "CASHIER", module: "sales.payments", mask: MASKS.CRUDA },
      { roleCode: "CASHIER", module: "inventory.items", mask: PERMISSION_BITS.read },
      { roleCode: "CASHIER", module: "inventory.stock", mask: 0 },
      { roleCode: "CASHIER", module: "pos.transactions", mask: MASKS.CRUDA },
      { roleCode: "CASHIER", module: "pos.config", mask: 0 },
      { roleCode: "CASHIER", module: "reservations.bookings", mask: MASKS.CRUDA },
      { roleCode: "CASHIER", module: "reservations.tables", mask: MASKS.CRUDA },

      // ACCOUNTANT - accounting-focused access
      { roleCode: "ACCOUNTANT", module: "platform.companies", mask: 0 },
      { roleCode: "ACCOUNTANT", module: "platform.users", mask: PERMISSION_BITS.read },
      { roleCode: "ACCOUNTANT", module: "platform.roles", mask: 0 },
      { roleCode: "ACCOUNTANT", module: "platform.outlets", mask: PERMISSION_BITS.read },
      { roleCode: "ACCOUNTANT", module: "platform.settings", mask: 0 },
      { roleCode: "ACCOUNTANT", module: "accounting.accounts", mask: PERMISSION_BITS.read }, // Structural: read only
      { roleCode: "ACCOUNTANT", module: "accounting.journals", mask: MASKS.CRUDA },
      { roleCode: "ACCOUNTANT", module: "accounting.fiscal_years", mask: PERMISSION_BITS.read }, // Structural: read only
      { roleCode: "ACCOUNTANT", module: "accounting.reports", mask: MASKS.CRUDA }, // Analytical: analyze allowed
      { roleCode: "ACCOUNTANT", module: "treasury.transactions", mask: PERMISSION_BITS.read },
      { roleCode: "ACCOUNTANT", module: "treasury.accounts", mask: PERMISSION_BITS.read }, // Structural: read only
      { roleCode: "ACCOUNTANT", module: "sales.invoices", mask: PERMISSION_BITS.read },
      { roleCode: "ACCOUNTANT", module: "sales.orders", mask: PERMISSION_BITS.read },
      { roleCode: "ACCOUNTANT", module: "sales.payments", mask: PERMISSION_BITS.read },
      { roleCode: "ACCOUNTANT", module: "inventory.items", mask: PERMISSION_BITS.read },
      { roleCode: "ACCOUNTANT", module: "inventory.stock", mask: PERMISSION_BITS.read },
      { roleCode: "ACCOUNTANT", module: "inventory.costing", mask: PERMISSION_BITS.read }, // Structural: read only
      { roleCode: "ACCOUNTANT", module: "pos.transactions", mask: 0 },
      { roleCode: "ACCOUNTANT", module: "pos.config", mask: 0 },
      { roleCode: "ACCOUNTANT", module: "reservations.bookings", mask: 0 },
      { roleCode: "ACCOUNTANT", module: "reservations.tables", mask: 0 }
    ];

    for (const perm of modulePermissions) {
      const roleId = roleIds[perm.roleCode];
      if (roleId) {
        // Parse module.resource format
        const [mod, resource] = perm.module.split('.');
        await upsertModuleRolePermission(
          connection,
          companyId,
          roleId,
          mod,
          perm.mask,
          resource
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
      `INSERT INTO user_role_assignments (user_id, role_id, company_id, outlet_id)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE user_id = VALUES(user_id)`,
      [ownerUserId, ownerRoleId, companyId, outletId]
    );

    // Create SUPER_ADMIN user if configured
    if (seedConfig.superAdminEmail && seedConfig.superAdminPassword) {
      const [superAdminRoleRows] = await connection.execute(
        `SELECT id
         FROM roles
         WHERE code = ?
           AND company_id IS NULL
         ORDER BY id ASC
         LIMIT 1`,
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
          `INSERT INTO user_role_assignments (user_id, role_id, company_id, outlet_id)
           VALUES (?, ?, ?, NULL)
           ON DUPLICATE KEY UPDATE role_id = VALUES(role_id)`,
          [superAdminUserId, superAdminRoleId, companyId]
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

    const numberingTemplates = [
      { doc_type: "SALES_INVOICE", pattern: "INV/{{yy}}{{mm}}/{{seq4}}", reset_period: "MONTHLY" },
      { doc_type: "SALES_PAYMENT", pattern: "PAY/{{yy}}{{mm}}/{{seq4}}", reset_period: "MONTHLY" },
      { doc_type: "SALES_ORDER", pattern: "SO/{{yy}}{{mm}}/{{seq4}}", reset_period: "MONTHLY" },
      { doc_type: "CREDIT_NOTE", pattern: "CN/{{yy}}{{mm}}/{{seq4}}", reset_period: "MONTHLY" }
    ];

    for (const tmpl of numberingTemplates) {
      await connection.execute(
        `INSERT INTO numbering_templates (company_id, outlet_id, scope_key, doc_type, pattern, reset_period, current_value, is_active)
         VALUES (?, NULL, 0, ?, ?, ?, 0, 1)
         ON DUPLICATE KEY UPDATE
           pattern = VALUES(pattern),
           reset_period = VALUES(reset_period),
           updated_at = CURRENT_TIMESTAMP`,
        [companyId, tmpl.doc_type, tmpl.pattern, tmpl.reset_period]
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
