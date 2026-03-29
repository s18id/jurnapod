// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Generate Kysely schema types from database introspection.
 * 
 * This script uses kysely-codegen to introspect the database and generate
 * TypeScript type definitions for all tables.
 * 
 * Usage:
 *   npm run db:generate:schema -w @jurnapod/db
 *   or: node scripts/generate-schema.mjs
 * 
 * Environment:
 *   - DATABASE_URL: MySQL connection URI (recommended)
 *   - DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME: Fallback individual params
 * 
 * Output:
 *   packages/db/src/kysely/schema.ts (replaces existing file)
 * 
 * Tables excluded:
 *   - schema_migrations (system table)
 *   - sync_audit_events_archive (archive/historical table)
 */

import "./load-env.mjs";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../../..");

/**
 * Build MySQL connection URL from environment variables.
 * Uses DATABASE_URL if set, otherwise constructs from individual params.
 */
function buildDatabaseUrl() {
  // Check for DATABASE_URL first (recommended)
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (databaseUrl && databaseUrl.length > 0) {
    return databaseUrl;
  }

  // Fallback: construct from individual params
  const host = process.env.DB_HOST ?? "127.0.0.1";
  const port = process.env.DB_PORT ?? "3306";
  const user = process.env.DB_USER ?? "root";
  const password = process.env.DB_PASSWORD ?? "";
  const database = process.env.DB_NAME ?? "jurnapod";

  // URL-encode password to handle special characters
  const encodedPassword = encodeURIComponent(password);

  return `mysql://${user}:${encodedPassword}@${host}:${port}/${database}`;
}

/**
 * Tables to exclude from schema generation.
 * These are system tables, archives, or temp tables that shouldn't be typed.
 */
const EXCLUDED_TABLES = [
  // System migration tracking
  "schema_migrations",
  // Archive tables (historical data)
  "sync_audit_events_archive",
];

/**
 * Run kysely-codegen with the configured database URL.
 */
async function generateSchema() {
  const dbUrl = buildDatabaseUrl();
  // Directly replace schema.ts with generated types
  const outFile = path.resolve(repoRoot, "packages/db/src/kysely/schema.ts");

  console.log("Generating Kysely schema types...");
  console.log(`Database URL: ${dbUrl.replace(/:([^:@]+)@/, ":***@")}`); // Mask password
  console.log(`Output file: ${outFile}`);

  // Build exclude pattern
  const excludePattern = EXCLUDED_TABLES.join("|");

  // Build kysely-codegen arguments
  // Note: NOT using --camel-case because the codebase uses snake_case column names
  // in SQL queries (e.g., .where('company_id', '=', value))
  const args = [
    "--url", dbUrl,
    "--dialect", "mysql",
    "--out-file", outFile,
    "--type-only-imports",
    "--exclude-pattern", `(${excludePattern})`,
  ];

  console.log(`\nRunning: npx kysely-codegen ${args.join(" ")}`);

  return new Promise((resolve, reject) => {
    // Use sh -c to properly handle the npx command with arguments
    const cmd = `npx kysely-codegen ${args.map(a => `'${a}'`).join(" ")}`;
    console.log(`Running: ${cmd.replace(/'--url', '.*?'/, "'--url', '...'").replace(/'mysql:\/\/[^']+'/, "'mysql://...'")}`);
    
    const child = spawn(cmd, {
      stdio: "inherit",
      shell: true,
      cwd: repoRoot,
    });

    child.on("close", (code) => {
      if (code === 0) {
        console.log("\nSchema generation complete!");
        resolve();
      } else {
        reject(new Error(`kysely-codegen exited with code ${code}`));
      }
    });

    child.on("error", (error) => {
      reject(new Error(`Failed to spawn kysely-codegen: ${error.message}`));
    });
  });
}

generateSchema().catch((error) => {
  console.error("\nSchema generation failed:");
  console.error(error.message);
  process.exitCode = 1;
});