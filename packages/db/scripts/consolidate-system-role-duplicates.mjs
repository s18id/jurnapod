// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import "./load-env.mjs";
import mysql from "mysql2/promise";

const SYSTEM_ROLE_CODES = [
  "SUPER_ADMIN",
  "OWNER",
  "COMPANY_ADMIN",
  "ADMIN",
  "CASHIER",
  "ACCOUNTANT"
];

const args = process.argv.slice(2);
const dryRun = !args.includes("--apply");

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

async function findDuplicateSystemRoles(connection) {
  const [rows] = await connection.execute(
    `SELECT code, COUNT(*) AS cnt, GROUP_CONCAT(id ORDER BY id ASC) AS role_ids
     FROM roles
     WHERE company_id IS NULL
       AND code IN (${SYSTEM_ROLE_CODES.map(() => "?").join(",")})
     GROUP BY code
     HAVING COUNT(*) > 1`,
    SYSTEM_ROLE_CODES
  );
  return rows;
}

async function consolidateRoleDuplicates(connection, code, roleIds, dryRun) {
  const canonicalId = roleIds[0];
  const duplicateIds = roleIds.slice(1);

  console.log(`\n--- Consolidating ${code} ---`);
  console.log(`  Canonical role_id: ${canonicalId}`);
  console.log(`  Duplicates to remove: [${duplicateIds.join(", ")}]`);

  if (dryRun) {
    console.log(`  [DRY-RUN] Would consolidate ${duplicateIds.length} duplicate(s)`);
    return;
  }

  await connection.beginTransaction();

  try {
    for (const dupId of duplicateIds) {
      console.log(`  Processing duplicate role_id=${dupId}...`);

      const [moduleRoles] = await connection.execute(
        `SELECT company_id, module, permission_mask
         FROM module_roles
         WHERE role_id = ?`,
        [dupId]
      );

      for (const mr of moduleRoles) {
        const [result] = await connection.execute(
          `INSERT IGNORE INTO module_roles (company_id, role_id, module, permission_mask)
           VALUES (?, ?, ?, ?)`,
          [mr.company_id, canonicalId, mr.module, mr.permission_mask]
        );
        if (result.affectedRows > 0) {
          console.log(`    - Moved module_roles: company=${mr.company_id}, module=${mr.module}`);
        } else {
          console.log(`    - Kept canonical module_roles: company=${mr.company_id}, module=${mr.module}`);
        }
      }

      await connection.execute(
        `DELETE FROM module_roles WHERE role_id = ?`,
        [dupId]
      );

      const [assignments] = await connection.execute(
        `SELECT user_id, outlet_id FROM user_role_assignments WHERE role_id = ?`,
        [dupId]
      );

      for (const ass of assignments) {
        const [existing] = await connection.execute(
          `SELECT id
           FROM user_role_assignments
           WHERE user_id = ?
             AND outlet_id <=> ?
             AND role_id = ?
           LIMIT 1`,
          [ass.user_id, ass.outlet_id, canonicalId]
        );

        if (existing.length > 0) {
          console.log(`    - Skip user=${ass.user_id}, outlet=${ass.outlet_id}: canonical already has assignment`);
        } else {
          await connection.execute(
            `INSERT INTO user_role_assignments (user_id, outlet_id, role_id)
             VALUES (?, ?, ?)`,
            [ass.user_id, ass.outlet_id, canonicalId]
          );
          console.log(`    - Moved user_role_assignment: user=${ass.user_id}, outlet=${ass.outlet_id}`);
        }
      }

      await connection.execute(
        `DELETE FROM user_role_assignments WHERE role_id = ?`,
        [dupId]
      );

      await connection.execute(`DELETE FROM roles WHERE id = ?`, [dupId]);
      console.log(`    - Deleted duplicate role_id=${dupId}`);
    }

    await connection.commit();
    console.log(`  ✓ Consolidated ${code} successfully`);
  } catch (error) {
    await connection.rollback();
    throw error;
  }
}

async function main() {
  const config = dbConfigFromEnv();
  const connection = await mysql.createConnection(config);

  console.log("=== System Role Duplicate Consolidation ===\n");
  console.log(`Mode: ${dryRun ? "DRY-RUN (no changes)" : "APPLY (will modify database)"}`);
  console.log("");

  try {
    const duplicates = await findDuplicateSystemRoles(connection);

    if (duplicates.length === 0) {
      console.log("No duplicate system roles found. Nothing to consolidate.");
      process.exitCode = 0;
      return;
    }

    console.log(`Found ${duplicates.length} role code(s) with duplicates:\n`);
    for (const row of duplicates) {
      const ids = row.role_ids.split(",");
      console.log(`  ${row.code}: ${ids.join(" -> ")}`);
    }
    console.log("");

    for (const row of duplicates) {
      const roleIds = row.role_ids.split(",").map(Number);
      await consolidateRoleDuplicates(connection, row.code, roleIds, dryRun);
    }

    if (dryRun) {
      console.log("\n=== DRY-RUN COMPLETE ===");
      console.log("Run with --apply to execute the consolidation:");
      console.log("  repo root: node packages/db/scripts/consolidate-system-role-duplicates.mjs --apply");
      console.log("  npm script: npm run db:consolidate:system-roles -- --apply");
    } else {
      console.log("\n=== CONSOLIDATION COMPLETE ===");
    }

    const remaining = await findDuplicateSystemRoles(connection);
    if (remaining.length === 0) {
      console.log("✓ All duplicate system roles have been resolved.");
    } else {
      console.log(`⚠ ${remaining.length} duplicate(s) still remain!`);
      process.exitCode = 1;
    }
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error("Consolidation failed:", error.message);
  process.exitCode = 1;
});
