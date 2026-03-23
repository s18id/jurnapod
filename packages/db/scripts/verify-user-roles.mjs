// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Verification script for user role assignments
 * 
 * This script verifies that users have been correctly assigned roles
 * and can access appropriate outlets based on their role assignments.
 * 
 * Usage:
 *   node verify-user-roles.mjs
 * 
 * Environment variables:
 *   JP_COMPANY_CODE - Target company (default: JP)
 */

import "./load-env.mjs";
import mysql from "mysql2/promise";

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

async function verifyUserRoles(connection, companyCode = "JP") {
  console.log(`🔍 Verifying user role assignments for company: ${companyCode}\n`);

  // Get company ID
  const [companyRows] = await connection.execute(
    `SELECT id, name FROM companies WHERE code = ?`,
    [companyCode]
  );
  
  if (companyRows.length === 0) {
    throw new Error(`Company not found: ${companyCode}`);
  }
  
  const companyId = companyRows[0].id;
  const companyName = companyRows[0].name;
  
  console.log(`📊 Company: ${companyName} (ID: ${companyId})`);

  // Get all users with their role assignments
  const [userRows] = await connection.execute(`
    SELECT 
      u.id,
      u.email,
      u.is_active,
      r.code as role_code,
      r.name as role_name,
      r.is_global,
      ura.outlet_id,
      o.code as outlet_code,
      o.name as outlet_name
    FROM users u
    LEFT JOIN user_role_assignments ura ON u.id = ura.user_id
    LEFT JOIN roles r ON ura.role_id = r.id
    LEFT JOIN outlets o ON ura.outlet_id = o.id
    WHERE u.company_id = ?
    ORDER BY u.email, r.role_level DESC, o.code
  `, [companyId]);

  // Get user outlet access using role-based logic (same as findUserOutlets in auth.ts)
  const [outletAccessRows] = await connection.execute(`
    SELECT DISTINCT
      u.id as user_id,
      u.email,
      o.id as outlet_id,
      o.code as outlet_code,
      o.name as outlet_name
    FROM users u
    JOIN outlets o ON o.company_id = u.company_id
    WHERE u.company_id = ?
      AND (
        -- Global roles get access to all outlets
        EXISTS (
          SELECT 1
          FROM user_role_assignments ura
          INNER JOIN roles r ON r.id = ura.role_id
          WHERE ura.user_id = u.id
            AND r.is_global = 1
            AND ura.outlet_id IS NULL
        )
        OR
        -- Outlet-specific roles get access to specific outlets
        EXISTS (
          SELECT 1
          FROM user_role_assignments ura
          WHERE ura.user_id = u.id
            AND ura.outlet_id = o.id
        )
      )
    ORDER BY u.email, o.code
  `, [companyId]);

  // Process data
  const users = {};
  
  // Process role assignments
  for (const row of userRows) {
    if (!users[row.email]) {
      users[row.email] = {
        id: row.id,
        email: row.email,
        is_active: row.is_active,
        roles: [],
        outlet_access: []
      };
    }
    
    if (row.role_code) {
      users[row.email].roles.push({
        code: row.role_code,
        name: row.role_name,
        is_global: row.is_global,
        outlet_id: row.outlet_id,
        outlet_code: row.outlet_code,
        outlet_name: row.outlet_name
      });
    }
  }
  
  // Process outlet access
  for (const row of outletAccessRows) {
    if (users[row.email]) {
      users[row.email].outlet_access.push({
        outlet_id: row.outlet_id,
        outlet_code: row.outlet_code,
        outlet_name: row.outlet_name
      });
    }
  }

  // Display results
  const userList = Object.values(users);
  console.log(`\n👥 Found ${userList.length} users\n`);

  let globalUserCount = 0;
  let outletUserCount = 0;
  let ownerCount = 0;

  for (const user of userList) {
    const hasGlobalRole = user.roles.some(r => r.is_global);
    const hasOwnerRole = user.roles.some(r => r.code === 'OWNER');
    
    if (hasGlobalRole) globalUserCount++;
    if (hasOwnerRole) ownerCount++;
    if (!hasGlobalRole) outletUserCount++;

    console.log(`📧 ${user.email} ${user.is_active ? '✅' : '❌'}`);
    
    // Show roles
    if (user.roles.length > 0) {
      console.log(`   🔑 Roles:`);
      for (const role of user.roles) {
        if (role.is_global) {
          console.log(`      • ${role.code} (Global)`);
        } else {
          console.log(`      • ${role.code} (${role.outlet_code || 'Unknown Outlet'})`);
        }
      }
    } else {
      console.log(`   🔑 Roles: None assigned`);
    }
    
    // Show outlet access
    if (user.outlet_access.length > 0) {
      console.log(`   🏪 Outlet Access: ${user.outlet_access.map(o => o.outlet_code).join(', ')}`);
    } else {
      console.log(`   🏪 Outlet Access: None`);
    }
    
    // Validation checks
    const issues = [];
    
    if (hasGlobalRole && user.outlet_access.length === 0) {
      issues.push("Global user has no outlet access");
    }
    
    if (hasOwnerRole && user.outlet_access.length === 0) {
      issues.push("Owner has no outlet access");
    }
    
    if (!hasGlobalRole && user.roles.length > 0 && user.outlet_access.length === 0) {
      issues.push("Outlet-specific user has roles but no outlet access");
    }
    
    if (issues.length > 0) {
      console.log(`   ⚠️  Issues: ${issues.join(', ')}`);
    }
    
    console.log();
  }

  // Summary
  console.log(`📊 Summary:`);
  console.log(`   • Total users: ${userList.length}`);
  console.log(`   • Global users: ${globalUserCount}`);
  console.log(`   • Outlet-specific users: ${outletUserCount}`);
  console.log(`   • Owners: ${ownerCount}`);
  
  // Check if owners can see all outlets
  if (ownerCount > 0) {
    const [outletCount] = await connection.execute(
      `SELECT COUNT(*) as count FROM outlets WHERE company_id = ?`,
      [companyId]
    );
    const totalOutlets = outletCount[0].count;
    
    console.log(`\n🏪 Outlet visibility check:`);
    console.log(`   • Total outlets in company: ${totalOutlets}`);
    
    for (const user of userList) {
      const hasOwnerRole = user.roles.some(r => r.code === 'OWNER');
      if (hasOwnerRole) {
        const canSeeAllOutlets = user.outlet_access.length >= totalOutlets;
        console.log(`   • ${user.email}: Can see ${user.outlet_access.length}/${totalOutlets} outlets ${canSeeAllOutlets ? '✅' : '❌'}`);
      }
    }
  }
}

async function main() {
  const dbConfig = dbConfigFromEnv();
  const connection = await mysql.createConnection(dbConfig);

  try {
    await verifyUserRoles(connection, process.env.JP_COMPANY_CODE ?? "JP");
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error("\n❌ Verification failed:");
  console.error(error.message);
  if (process.env.NODE_ENV === "development") {
    console.error(error.stack);
  }
  process.exitCode = 1;
});