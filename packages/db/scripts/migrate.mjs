// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import "./load-env.mjs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.resolve(__dirname, "../migrations");
const lockTimeoutSeconds = Number(process.env.DB_MIGRATE_LOCK_TIMEOUT ?? "60");

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

function escapeIdentifier(identifier) {
  return `\`${String(identifier).replace(/`/g, "``")}\``;
}

async function ensureDatabaseExists(config) {
  const bootstrapConnection = await mysql.createConnection({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password
  });

  try {
    await bootstrapConnection.query(
      `CREATE DATABASE IF NOT EXISTS ${escapeIdentifier(config.database)}`
    );
  } finally {
    await bootstrapConnection.end();
  }
}

async function schemaMigrationsExists(connection, databaseName) {
  const [rows] = await connection.query(
    `SELECT 1
     FROM information_schema.tables
     WHERE table_schema = ? AND table_name = 'schema_migrations'
     LIMIT 1`,
    [databaseName]
  );
  return rows.length > 0;
}

async function readAppliedVersions(connection, databaseName) {
  const exists = await schemaMigrationsExists(connection, databaseName);
  if (!exists) {
    return new Set();
  }

  const [rows] = await connection.query("SELECT version FROM schema_migrations");
  return new Set(rows.map((row) => row.version));
}

async function listMigrationFiles() {
  const entries = await readdir(migrationsDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
}

async function main() {
  const config = dbConfigFromEnv();
  await ensureDatabaseExists(config);
  const connection = await mysql.createConnection(config);
  const lockName = `jurnapod:${config.database}:migrations`;
  let activeMigration = null;

  try {
    const [lockRows] = await connection.query(
      "SELECT GET_LOCK(?, ?) AS acquired",
      [lockName, lockTimeoutSeconds]
    );

    if (Number(lockRows[0]?.acquired) !== 1) {
      throw new Error(`unable to acquire migration lock ${lockName}`);
    }

    const files = await listMigrationFiles();
    const appliedVersions = await readAppliedVersions(connection, config.database);

    for (const fileName of files) {
      if (appliedVersions.has(fileName)) {
        console.log(`skip ${fileName}`);
        continue;
      }

      activeMigration = fileName;

      const fullPath = path.join(migrationsDir, fileName);
      const sql = await readFile(fullPath, "utf8");

      if (!sql.trim()) {
        throw new Error(`migration file is empty: ${fileName}`);
      }

      await connection.query(sql);
      await connection.query(
        "INSERT INTO schema_migrations (version) VALUES (?)",
        [fileName]
      );

      console.log(`applied ${fileName}`);
      activeMigration = null;
    }
  } catch (error) {
    if (activeMigration) {
      console.error(`migration failed while applying ${activeMigration}`);
      console.error(
        "MySQL DDL is non-atomic: a failed migration can partially apply changes before schema_migrations is written"
      );
      console.error(
        "After fixing the root cause, rerun npm run db:migrate; migration files are expected to be rerunnable/idempotent"
      );
    }

    throw error;
  } finally {
    try {
      await connection.query("SELECT RELEASE_LOCK(?)", [lockName]);
    } finally {
      await connection.end();
    }
  }
}

main().catch((error) => {
  console.error("migration failed");
  console.error(error.message);
  process.exitCode = 1;
});
