#!/usr/bin/env node
// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)
//
// Database Reset Helper - Clean slate for migration reset

import "./load-env.mjs";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";
import readline from "node:readline";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.resolve(__dirname, "../migrations");

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const force = args.includes("--force");

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

async function confirm(message) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(`${message} (yes/no): `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === "yes" || answer.toLowerCase() === "y");
    });
  });
}

async function listTables(connection, database) {
  const [rows] = await connection.query(
    `SELECT table_name 
     FROM information_schema.tables 
     WHERE table_schema = ? 
     AND table_type = 'BASE TABLE'
     ORDER BY table_name`,
    [database]
  );
  return rows.map(r => r.table_name || r.TABLE_NAME);
}

async function listViews(connection, database) {
  const [rows] = await connection.query(
    `SELECT table_name 
     FROM information_schema.tables 
     WHERE table_schema = ? 
     AND table_type = 'VIEW'
     ORDER BY table_name`,
    [database]
  );
  return rows.map(r => r.table_name || r.TABLE_NAME);
}

async function main() {
  console.log("🗑️  Database Reset Helper");
  console.log("========================\n");

  if (dryRun) {
    console.log("📝 DRY RUN MODE - No changes will be made\n");
  }

  const config = dbConfigFromEnv();
  console.log(`Target database: ${config.database}`);
  console.log(`Host: ${config.host}:${config.port}\n`);

  // Connect to database
  let connection;
  try {
    connection = await mysql.createConnection(config);
  } catch (err) {
    if (err.code === "ER_BAD_DB_ERROR") {
      console.log("✓ Database does not exist - nothing to reset");
      console.log("\nYou can create a fresh database with:");
      console.log("  npm run db:migrate");
      return;
    }
    throw err;
  }

  try {
    // List existing tables and views
    const tables = await listTables(connection, config.database);
    const views = await listViews(connection, config.database);

    if (tables.length === 0 && views.length === 0) {
      console.log("✓ Database is empty - nothing to reset");
      console.log("\nYou can run migrations with:");
      console.log("  npm run db:migrate");
      return;
    }

    console.log(`Found ${tables.length} tables and ${views.length} views:\n`);
    
    if (views.length > 0) {
      console.log("Views:");
      views.forEach(v => console.log(`  - ${v}`));
      console.log();
    }
    
    console.log("Tables:");
    tables.forEach(t => console.log(`  - ${t}`));
    console.log();

    // Safety check
    if (!force && !dryRun) {
      const confirmed = await confirm(
        `⚠️  WARNING: This will DROP ALL tables and views in ${config.database}.\n   ALL DATA WILL BE LOST. Proceed?`
      );
      
      if (!confirmed) {
        console.log("\n❌ Aborted.");
        return;
      }
    }

    if (dryRun) {
      console.log("\n📝 DRY RUN - Would execute:");
      console.log("  SET FOREIGN_KEY_CHECKS = 0;");
      
      // Drop views first (in reverse order)
      for (const view of views.reverse()) {
        console.log(`  DROP VIEW IF EXISTS ${escapeIdentifier(view)};`);
      }
      
      // Drop tables (in reverse order to handle FKs)
      for (const table of tables.reverse()) {
        console.log(`  DROP TABLE IF EXISTS ${escapeIdentifier(table)};`);
      }
      
      console.log("  SET FOREIGN_KEY_CHECKS = 1;");
      console.log("\n✓ Dry run complete");
      return;
    }

    // Execute reset
    console.log("\n🗑️  Resetting database...\n");
    
    await connection.query("SET FOREIGN_KEY_CHECKS = 0");
    
    // Drop views
    for (const view of views.reverse()) {
      await connection.query(`DROP VIEW IF EXISTS ${escapeIdentifier(view)}`);
      console.log(`  ✓ Dropped view: ${view}`);
    }
    
    // Drop tables
    for (const table of tables.reverse()) {
      await connection.query(`DROP TABLE IF EXISTS ${escapeIdentifier(table)}`);
      console.log(`  ✓ Dropped table: ${table}`);
    }
    
    await connection.query("SET FOREIGN_KEY_CHECKS = 1");
    
    console.log("\n✅ Database reset complete!");
    console.log("\nNext steps:");
    console.log("  npm run db:migrate  # Run fresh migrations");
    
  } finally {
    await connection.end();
  }
}

main().catch(err => {
  console.error("\n❌ Error:", err.message);
  process.exit(1);
});
