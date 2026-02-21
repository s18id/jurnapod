import "./load-env.mjs";
import bcrypt from "bcryptjs";
import mysql from "mysql2/promise";

const BCRYPT_COST = 12;

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
    ownerPassword: process.env.JP_OWNER_PASSWORD ?? "ChangeMe123!"
  };
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

async function upsertFeatureFlag(connection, companyId, flagKey, enabled, configJson) {
  await connection.execute(
    `INSERT INTO feature_flags (company_id, \`key\`, enabled, config_json)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       enabled = VALUES(enabled),
       config_json = VALUES(config_json),
       updated_at = CURRENT_TIMESTAMP`,
    [companyId, flagKey, enabled ? 1 : 0, configJson]
  );
}

async function main() {
  const dbConfig = dbConfigFromEnv();
  const seedConfig = seedConfigFromEnv();
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
      ["OWNER", "Owner"],
      ["ADMIN", "Admin"],
      ["CASHIER", "Cashier"],
      ["ACCOUNTANT", "Accountant"]
    ];

    let ownerRoleId = 0;
    for (const [roleCode, roleName] of roleDefinitions) {
      const roleId = await upsertRole(connection, roleCode, roleName);
      if (roleCode === "OWNER") {
        ownerRoleId = roleId;
      }
    }

    if (!ownerRoleId) {
      throw new Error("OWNER role id not found after seed upsert");
    }

    const ownerPasswordHash = await bcrypt.hash(
      seedConfig.ownerPassword,
      BCRYPT_COST
    );
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

    const featureFlags = [
      ["pos.enabled", true, "{}"],
      ["sales.enabled", true, "{}"],
      ["inventory.enabled", true, "{\"level\":0}"],
      ["purchasing.enabled", false, "{}"]
    ];

    for (const [flagKey, enabled, configJson] of featureFlags) {
      await upsertFeatureFlag(connection, companyId, flagKey, enabled, configJson);
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
