#!/usr/bin/env node
// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)
//
// Compatibility Test - Verify migrations work on MySQL 8.0+ and MariaDB 11.8+

import "./load-env.mjs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";
import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.resolve(__dirname, "../migrations");

const args = process.argv.slice(2);
const keepContainers = args.includes("--keep");

// Test configurations
const testConfigs = [
  {
    name: "MySQL 8.0",
    container: "mysql:8.0",
    port: 3307,
    env: {
      MYSQL_ROOT_PASSWORD: "test",
      MYSQL_DATABASE: "jurnapod"
    }
  },
  {
    name: "MariaDB 11.8",
    container: "mariadb:11.8",
    port: 3308,
    env: {
      MARIADB_ROOT_PASSWORD: "test",
      MARIADB_DATABASE: "jurnapod"
    }
  }
];

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runCommand(command, description) {
  console.log(`  $ ${description || command}`);
  try {
    const { stdout, stderr } = await execAsync(command);
    if (stderr && !stderr.includes("WARNING")) {
      console.log(`    stderr: ${stderr}`);
    }
    return stdout;
  } catch (err) {
    throw new Error(`Command failed: ${command}\n${err.message}`);
  }
}

async function startContainer(config) {
  console.log(`\n🐳 Starting ${config.name}...`);
  
  const containerName = `jurnapod-test-${config.name.toLowerCase().replace(/[^a-z0-9]/g, "-")}`;
  
  // Stop existing container if any
  try {
    await runCommand(`docker stop ${containerName} 2>/dev/null || true`, "Stop existing container");
    await runCommand(`docker rm ${containerName} 2>/dev/null || true`, "Remove existing container");
  } catch {
    // Ignore errors
  }
  
  // Start new container
  const envVars = Object.entries(config.env)
    .map(([k, v]) => `-e ${k}=${v}`)
    .join(" ");
  
  await runCommand(
    `docker run -d --name ${containerName} ${envVars} -p ${config.port}:3306 ${config.container}`,
    `Start ${config.name} container`
  );
  
  // Wait for database to be ready
  console.log(`  ⏳ Waiting for ${config.name} to be ready...`);
  let attempts = 0;
  const maxAttempts = 60;
  
  while (attempts < maxAttempts) {
    try {
      const connection = await mysql.createConnection({
        host: "127.0.0.1",
        port: config.port,
        user: "root",
        password: "test",
        database: "jurnapod"
      });
      await connection.query("SELECT 1");
      await connection.end();
      console.log(`  ✓ ${config.name} is ready! (${attempts}s)`);
      return containerName;
    } catch {
      attempts++;
      if (attempts % 10 === 0) {
        console.log(`    ... still waiting (${attempts}/${maxAttempts}s)`);
      }
      await delay(1000);
    }
  }
  
  throw new Error(`${config.name} failed to start after ${maxAttempts} seconds`);
}

async function stopContainer(containerName) {
  if (keepContainers) {
    console.log(`  ⏸️  Keeping container: ${containerName}`);
    return;
  }
  
  try {
    await runCommand(`docker stop ${containerName} 2>/dev/null || true`, "Stop container");
    await runCommand(`docker rm ${containerName} 2>/dev/null || true`, "Remove container");
  } catch {
    // Ignore errors
  }
}

async function listMigrationFiles() {
  const entries = await readdir(migrationsDir, { withFileTypes: true });
  return entries
    .filter(e => e.isFile() && e.name.endsWith(".sql") && !e.name.startsWith("archive"))
    .map(e => e.name)
    .sort();
}

async function testMigrations(config, containerName) {
  console.log(`\n🧪 Testing migrations on ${config.name}...`);
  
  const connection = await mysql.createConnection({
    host: "127.0.0.1",
    port: config.port,
    user: "root",
    password: "test",
    database: "jurnapod",
    multipleStatements: true
  });
  
  const errors = [];
  const migrations = await listMigrationFiles();
  
  console.log(`  Found ${migrations.length} migration files`);
  
  for (const migration of migrations) {
    const sql = await readFile(path.join(migrationsDir, migration), "utf8");
    
    try {
      await connection.query(sql);
      console.log(`  ✓ ${migration}`);
    } catch (err) {
      console.error(`  ✗ ${migration}: ${err.message}`);
      errors.push({ migration, error: err.message });
    }
  }
  
  // Validate schema
  console.log("\n  Validating schema...");
  
  // Check tables
  const [tables] = await connection.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = ? AND table_type = 'BASE TABLE'",
    ["jurnapod"]
  );
  
  // Check views
  const [views] = await connection.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = ? AND table_type = 'VIEW'",
    ["jurnapod"]
  );
  
  // Check foreign keys
  const [fks] = await connection.query(
    `SELECT table_name, column_name, referenced_table_name 
     FROM information_schema.key_column_usage 
     WHERE table_schema = ? AND referenced_table_name IS NOT NULL`,
    ["jurnapod"]
  );
  
  console.log(`  ✓ Tables created: ${tables.length}`);
  console.log(`  ✓ Views created: ${views.length}`);
  console.log(`  ✓ Foreign keys: ${fks.length}`);
  
  await connection.end();
  
  if (errors.length > 0) {
    throw new Error(`\n${errors.length} migration(s) failed on ${config.name}`);
  }
  
  return { tables: tables.length, views: views.length, fks: fks.length };
}

async function compareResults(mysqlResults, mariadbResults) {
  console.log("\n📊 Compatibility Comparison");
  console.log("============================");
  
  const checks = [
    { name: "Tables", mysql: mysqlResults.tables, mariadb: mariadbResults.tables },
    { name: "Views", mysql: mysqlResults.views, mariadb: mariadbResults.views },
    { name: "Foreign Keys", mysql: mysqlResults.fks, mariadb: mariadbResults.fks }
  ];
  
  let allMatch = true;
  
  for (const check of checks) {
    const match = check.mysql === check.mariadb;
    const icon = match ? "✓" : "✗";
    console.log(`${icon} ${check.name}: MySQL=${check.mysql}, MariaDB=${check.mariadb}`);
    if (!match) allMatch = false;
  }
  
  return allMatch;
}

async function main() {
  console.log("🧪 Migration Compatibility Test");
  console.log("===============================\n");
  console.log("Testing migrations on:");
  console.log("  - MySQL 8.0");
  console.log("  - MariaDB 11.8");
  console.log();
  
  if (keepContainers) {
    console.log("⏸️  --keep flag set: containers will not be removed\n");
  }
  
  const containers = [];
  const results = {};
  
  try {
    // Test MySQL
    const mysqlContainer = await startContainer(testConfigs[0]);
    containers.push({ config: testConfigs[0], name: mysqlContainer });
    results.mysql = await testMigrations(testConfigs[0], mysqlContainer);
    
    // Test MariaDB
    const mariadbContainer = await startContainer(testConfigs[1]);
    containers.push({ config: testConfigs[1], name: mariadbContainer });
    results.mariadb = await testMigrations(testConfigs[1], mariadbContainer);
    
    // Compare results
    const match = await compareResults(results.mysql, results.mariadb);
    
    if (match) {
      console.log("\n✅ All migrations are compatible with both MySQL 8.0 and MariaDB 11.8!");
    } else {
      console.log("\n⚠️  Schema differences detected between MySQL and MariaDB");
      process.exitCode = 1;
    }
    
  } catch (err) {
    console.error("\n❌ Test failed:", err.message);
    process.exitCode = 1;
  } finally {
    // Cleanup
    console.log("\n🧹 Cleaning up...");
    for (const { name } of containers) {
      await stopContainer(name);
    }
  }
  
  console.log("\n✅ Compatibility test complete!");
}

main().catch(err => {
  console.error("\n❌ Fatal error:", err.message);
  console.error(err.stack);
  process.exit(1);
});
