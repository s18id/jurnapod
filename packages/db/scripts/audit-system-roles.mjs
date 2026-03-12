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

function inClausePlaceholders(values) {
  return values.map(() => "?").join(",");
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

async function main() {
  const config = dbConfigFromEnv();
  const connection = await mysql.createConnection(config);

  try {
    console.log("=== System Role Duplicate Audit ===\n");

    const [duplicateRows] = await connection.execute(
      `SELECT code, COUNT(*) AS cnt, GROUP_CONCAT(id ORDER BY id ASC) AS role_ids
       FROM roles
       WHERE company_id IS NULL
         AND code IN (${SYSTEM_ROLE_CODES.map(() => "?").join(",")})
       GROUP BY code
       HAVING COUNT(*) > 1`,
      SYSTEM_ROLE_CODES
    );

    if (duplicateRows.length === 0) {
      console.log("PASS: No duplicate system roles found.");
      console.log("\nSystem roles are unique per code - audit passed.");
      process.exitCode = 0;
      return;
    }

    console.log("WARNING: Duplicate system roles detected!\n");
    console.log("| code           | count | role_ids              |");
    console.log("|----------------|-------|-----------------------|");
    for (const row of duplicateRows) {
      console.log(
        `| ${row.code.padEnd(14)} | ${String(row.cnt).padEnd(5)} | ${row.role_ids} |`
      );
    }
    console.log("");

    for (const row of duplicateRows) {
      const roleIds = row.role_ids.split(",").map(Number);
      const canonicalId = roleIds[0];
      const duplicateIds = roleIds.slice(1);

      console.log(`\n--- Analysis for ${row.code} ---`);
      console.log(`Canonical role_id (lowest): ${canonicalId}`);
      console.log(`Duplicate role_ids to remove: [${duplicateIds.join(", ")}]`);

      const [moduleRoleRows] = await connection.execute(
        `SELECT role_id, company_id, permission_mask, module
         FROM module_roles
         WHERE role_id IN (${inClausePlaceholders(roleIds)})`,
        roleIds
      );

      const refsByDuplicate = new Map();
      for (const dupId of duplicateIds) {
        const refs = moduleRoleRows.filter((r) => Number(r.role_id) === dupId);
        if (refs.length > 0) {
          refsByDuplicate.set(dupId, refs);
        }
      }

      if (refsByDuplicate.size > 0) {
        console.log(`\nmodule_roles references on duplicates:`);
        for (const [dupId, refs] of refsByDuplicate) {
          console.log(`  role_id=${dupId}: ${refs.length} rows`);
          for (const ref of refs.slice(0, 3)) {
            console.log(
              `    - company_id=${ref.company_id}, module=${ref.module}, mask=${ref.permission_mask}`
            );
          }
          if (refs.length > 3) {
            console.log(`    ... and ${refs.length - 3} more`);
          }
        }
      } else {
        console.log("\nNo module_roles references on duplicates (safe to remove).");
      }

      const [assignmentRows] = await connection.execute(
        `SELECT COUNT(*) as cnt
         FROM user_role_assignments
         WHERE role_id IN (${inClausePlaceholders(roleIds)})`,
        roleIds
      );

      const totalAssignments = assignmentRows[0]?.cnt ?? 0;
      console.log(`\nTotal user_role_assignments: ${totalAssignments}`);
    }

    console.log("\n=== RECOMMENDATION ===");
    console.log("Run consolidation tool to merge duplicates:");
    console.log("  dry-run (repo root): node packages/db/scripts/consolidate-system-role-duplicates.mjs");
    console.log("  apply   (repo root): node packages/db/scripts/consolidate-system-role-duplicates.mjs --apply");
    console.log("  workspace script:    npm run db:consolidate:system-roles");

    process.exitCode = 1;
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error("Audit failed:", error.message);
  process.exitCode = 1;
});
