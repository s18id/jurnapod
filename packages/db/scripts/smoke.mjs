import "./load-env.mjs";
import { hash as argon2HashFn, verify as argon2Verify } from "@node-rs/argon2";
import bcrypt from "bcryptjs";
import mysql from "mysql2/promise";

const REQUIRED_TRANSACTIONAL_TABLES = ["companies", "outlets", "items", "item_prices"];
const MYSQL_WRITE_PERMISSION_ERRNOS = new Set([1044, 1045, 1142]);

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
    database: process.env.DB_NAME ?? "jurnapod",
    multipleStatements: true
  };
}

function smokeConfigFromEnv() {
  return {
    companyCode: process.env.JP_COMPANY_CODE ?? "JP",
    outletCode: process.env.JP_OUTLET_CODE ?? "MAIN",
    ownerEmail: process.env.JP_OWNER_EMAIL ?? "owner@local",
    ownerPassword: process.env.JP_OWNER_PASSWORD ?? "ChangeMe123!"
  };
}

function parseConfigJson(rawValue, moduleCode) {
  if (rawValue == null) {
    return {};
  }

  if (typeof rawValue === "object") {
    return rawValue;
  }

  try {
    return JSON.parse(rawValue);
  } catch {
    throw new Error(`module ${moduleCode} has invalid config_json`);
  }
}

function buildRunId() {
  return `${Date.now().toString(36)}${Math.floor(Math.random() * 0xffff)
    .toString(36)
    .padStart(3, "0")}`;
}

async function verifyOwnerPassword(plainPassword, passwordHash) {
  if (typeof passwordHash !== "string" || passwordHash.length === 0) {
    return false;
  }

  if (passwordHash.startsWith("$argon2")) {
    try {
      return await argon2Verify(passwordHash, plainPassword);
    } catch {
      return false;
    }
  }

  try {
    return await bcrypt.compare(plainPassword, passwordHash);
  } catch {
    return false;
  }
}

function isWritePermissionError(error) {
  return MYSQL_WRITE_PERMISSION_ERRNOS.has(Number(error?.errno));
}

async function assertTransactionalTableEngines(connection) {
  const placeholders = REQUIRED_TRANSACTIONAL_TABLES.map(() => "?").join(", ");
  const env = dbConfigFromEnv(); // for side-effect of validating DB_NAME presence and format
  const [tableRows] = await connection.execute(
    `SELECT table_name as 'table_name', engine as 'engine'
     FROM information_schema.tables
     WHERE table_schema = '${env.database}' AND table_name IN (${placeholders})`,
    REQUIRED_TRANSACTIONAL_TABLES
  );

  const tablePairs = tableRows.map((row) => [row.table_name, row.engine]);
  const tableNames = tableRows.map((row) => row.table_name);
  const tableEngineByName = new Map(tablePairs);

  const missingTables = REQUIRED_TRANSACTIONAL_TABLES.filter(
    (tableName) => !tableEngineByName.has(tableName)
  );
  if (missingTables.length > 0) {
    throw new Error(
      `smoke prerequisites failed: required tables missing (${missingTables.join(", ")}) found (${tableNames.join(", ")}). run db:migrate first`
    );
  }

  const nonTransactionalTables = REQUIRED_TRANSACTIONAL_TABLES.filter(
    (tableName) => tableEngineByName.get(tableName)?.toUpperCase() !== "INNODB"
  );
  if (nonTransactionalTables.length > 0) {
    throw new Error(
      `smoke prerequisites failed: required InnoDB tables (${nonTransactionalTables.join(", ")})`
    );
  }
}

async function assertWritePermissionAndRollback(connection) {
  let transactionStarted = false;

  try {
    await connection.beginTransaction();
    transactionStarted = true;

    await connection.execute(
      "CREATE TEMPORARY TABLE smoke_write_probe (id INT PRIMARY KEY)"
    );
    await connection.execute(
      "INSERT INTO smoke_write_probe (id) VALUES (1)"
    );

    const [rows] = await connection.execute(
      "SELECT COUNT(*) AS total FROM smoke_write_probe"
    );
    if (Number(rows[0].total) !== 1) {
      throw new Error("smoke prerequisites failed: write probe did not persist in temp table");
    }
  } catch (error) {
    if (isWritePermissionError(error)) {
      throw new Error(
        "smoke prerequisites failed: TEMP TABLE privilege required for write probe"
      );
    }

    throw error;
  } finally {
    if (transactionStarted) {
      await connection.rollback();
    }
  }
}

async function assertPasswordVerifierPaths() {
  const plainPassword = "SmokeHashPath-2026!";
  const wrongPassword = "SmokeHashPath-2026?-wrong";

  const bcryptHash = await bcrypt.hash(plainPassword, 4);
  const argon2Hash = await argon2HashFn(plainPassword, {
    algorithm: 2,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1
  });

  if (!(await verifyOwnerPassword(plainPassword, bcryptHash))) {
    throw new Error("password verification self-check failed for bcrypt hash path");
  }

  if (!(await verifyOwnerPassword(plainPassword, argon2Hash))) {
    throw new Error("password verification self-check failed for argon2 hash path");
  }

  if (await verifyOwnerPassword(wrongPassword, bcryptHash)) {
    throw new Error("password verification self-check accepted invalid bcrypt password");
  }

  if (await verifyOwnerPassword(wrongPassword, argon2Hash)) {
    throw new Error("password verification self-check accepted invalid argon2 password");
  }
}

function isForeignKeyViolation(error) {
  return Number(error?.errno) === 1452;
}

async function assertItemPricesCompanyScopedForeignKeys(connection) {
  const runId = buildRunId();

  await connection.beginTransaction();

  try {
    const [companyAResult] = await connection.execute(
      `INSERT INTO companies (code, name)
       VALUES (?, ?)`,
      [`SMK${runId}A`.slice(0, 32).toUpperCase(), `Smoke FK Company A ${runId}`]
    );
    const companyAId = Number(companyAResult.insertId);

    const [companyBResult] = await connection.execute(
      `INSERT INTO companies (code, name)
       VALUES (?, ?)`,
      [`SMK${runId}B`.slice(0, 32).toUpperCase(), `Smoke FK Company B ${runId}`]
    );
    const companyBId = Number(companyBResult.insertId);

    const [outletAResult] = await connection.execute(
      `INSERT INTO outlets (company_id, code, name)
       VALUES (?, ?, ?)`,
      [companyAId, `SMK${runId}A`.slice(0, 32).toUpperCase(), `Smoke FK Outlet A ${runId}`]
    );
    const outletAId = Number(outletAResult.insertId);

    const [outletBResult] = await connection.execute(
      `INSERT INTO outlets (company_id, code, name)
       VALUES (?, ?, ?)`,
      [companyBId, `SMK${runId}B`.slice(0, 32).toUpperCase(), `Smoke FK Outlet B ${runId}`]
    );
    const outletBId = Number(outletBResult.insertId);

    const [itemAResult] = await connection.execute(
      `INSERT INTO items (company_id, sku, name, item_type, is_active)
       VALUES (?, ?, ?, 'PRODUCT', 1)`,
      [companyAId, `SMK-ITEM-A-${runId}`.slice(0, 64), `Smoke FK Item A ${runId}`]
    );
    const itemAId = Number(itemAResult.insertId);

    const [itemBResult] = await connection.execute(
      `INSERT INTO items (company_id, sku, name, item_type, is_active)
       VALUES (?, ?, ?, 'PRODUCT', 1)`,
      [companyBId, `SMK-ITEM-B-${runId}`.slice(0, 64), `Smoke FK Item B ${runId}`]
    );
    const itemBId = Number(itemBResult.insertId);

    let crossCompanyItemRejected = false;
    try {
      await connection.execute(
        `INSERT INTO item_prices (company_id, outlet_id, item_id, price, is_active)
         VALUES (?, ?, ?, 1000, 1)`,
        [companyAId, outletAId, itemBId]
      );
    } catch (error) {
      if (isForeignKeyViolation(error)) {
        crossCompanyItemRejected = true;
      } else {
        throw error;
      }
    }

    if (!crossCompanyItemRejected) {
      throw new Error("item_prices allows cross-company item reference");
    }

    let crossCompanyOutletRejected = false;
    try {
      await connection.execute(
        `INSERT INTO item_prices (company_id, outlet_id, item_id, price, is_active)
         VALUES (?, ?, ?, 1000, 1)`,
        [companyAId, outletBId, itemAId]
      );
    } catch (error) {
      if (isForeignKeyViolation(error)) {
        crossCompanyOutletRejected = true;
      } else {
        throw error;
      }
    }

    if (!crossCompanyOutletRejected) {
      throw new Error("item_prices allows cross-company outlet reference");
    }
  } finally {
    await connection.rollback();
  }
}

async function main() {
  const dbConfig = dbConfigFromEnv();
  const smokeConfig = smokeConfigFromEnv();
  const connection = await mysql.createConnection(dbConfig);

  try {
    await assertPasswordVerifierPaths();
    await assertTransactionalTableEngines(connection);
    await assertWritePermissionAndRollback(connection);

    const [ownerRows] = await connection.execute(
      `SELECT u.id, u.password_hash, c.id AS company_id
       FROM users u
       INNER JOIN companies c ON c.id = u.company_id
       WHERE c.code = ? AND u.email = ?
       LIMIT 1`,
      [smokeConfig.companyCode, smokeConfig.ownerEmail]
    );

    const owner = ownerRows[0];
    if (!owner) {
      throw new Error("owner row not found for configured company/email");
    }

    const passwordMatches = await verifyOwnerPassword(smokeConfig.ownerPassword, owner.password_hash);
    if (!passwordMatches) {
      throw new Error("owner password hash does not match configured password");
    }

    const [ownerRoleRows] = await connection.execute(
      `SELECT 1
       FROM user_roles ur
       INNER JOIN roles r ON r.id = ur.role_id
       WHERE ur.user_id = ? AND r.code = 'OWNER'
       LIMIT 1`,
      [owner.id]
    );
    if (ownerRoleRows.length === 0) {
      throw new Error("user_roles relation missing OWNER membership");
    }

    const [ownerOutletRows] = await connection.execute(
      `SELECT 1
       FROM user_outlets uo
       INNER JOIN outlets o ON o.id = uo.outlet_id
       WHERE uo.user_id = ? AND o.company_id = ? AND o.code = ?
       LIMIT 1`,
      [owner.id, owner.company_id, smokeConfig.outletCode]
    );
    if (ownerOutletRows.length === 0) {
      throw new Error("user_outlets relation missing default outlet membership");
    }

    const [moduleRows] = await connection.execute(
      `SELECT m.code, cm.enabled, cm.config_json
       FROM company_modules cm
       INNER JOIN modules m ON m.id = cm.module_id
       WHERE cm.company_id = ?`,
      [owner.company_id]
    );

    const modulesByCode = new Map(
      moduleRows.map((row) => [row.code, row])
    );
    const requiredModules = [
      ["pos", true],
      ["sales", true],
      ["inventory", true],
      ["purchasing", false]
    ];

    for (const [moduleCode, expectedEnabled] of requiredModules) {
      const row = modulesByCode.get(moduleCode);
      if (!row) {
        throw new Error(`required module missing: ${moduleCode}`);
      }

      if (Boolean(row.enabled) !== expectedEnabled) {
        throw new Error(`module ${moduleCode} must be ${expectedEnabled}`);
      }
    }

    const inventoryModule = modulesByCode.get("inventory");
    const inventoryConfig = parseConfigJson(
      inventoryModule.config_json,
      "inventory"
    );

    if (inventoryConfig.level !== 0) {
      throw new Error("module inventory config_json.level must be 0");
    }

    await assertItemPricesCompanyScopedForeignKeys(connection);

    console.log("smoke checks passed");
    console.log(`owner=${smokeConfig.ownerEmail} company=${smokeConfig.companyCode}`);
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error("smoke checks failed");
  console.error(error.message);
  process.exitCode = 1;
});
