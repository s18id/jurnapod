#!/usr/bin/env node
/**
 * Fix Duplicate Role Assignments
 * 
 * One-time script to clean up duplicate role assignments in user_role_assignments table.
 * Duplicates can occur because MySQL's unique constraint treats NULL != NULL.
 * 
 * Usage: npm run fix:duplicate-roles
 */

import { getDbPool } from "../lib/db";

async function fixDuplicateRoleAssignments() {
  const pool = getDbPool();
  
  console.log("🔍 Checking for duplicate role assignments...");
  
  try {
    // Find duplicate global roles (outlet_id IS NULL)
    const [globalDuplicates] = await pool.execute(`
      SELECT user_id, role_id, COUNT(*) as count
      FROM user_role_assignments
      WHERE outlet_id IS NULL
      GROUP BY user_id, role_id
      HAVING COUNT(*) > 1
    `);
    
    console.log(`Found ${(globalDuplicates as any[]).length} users with duplicate global roles`);
    
    // Delete duplicates keeping only the oldest (lowest id)
    for (const dup of globalDuplicates as any[]) {
      const [result] = await pool.execute(`
        DELETE FROM user_role_assignments
        WHERE user_id = ? AND role_id = ? AND outlet_id IS NULL
        AND id NOT IN (
          SELECT min_id FROM (
            SELECT MIN(id) as min_id
            FROM user_role_assignments
            WHERE user_id = ? AND role_id = ? AND outlet_id IS NULL
          ) as temp
        )
      `, [dup.user_id, dup.role_id, dup.user_id, dup.role_id]);
      
      console.log(`  Cleaned up ${(result as any).affectedRows} duplicate global role(s) for user ${dup.user_id}`);
    }
    
    // Find duplicate outlet-scoped roles
    const [outletDuplicates] = await pool.execute(`
      SELECT user_id, outlet_id, role_id, COUNT(*) as count
      FROM user_role_assignments
      WHERE outlet_id IS NOT NULL
      GROUP BY user_id, outlet_id, role_id
      HAVING COUNT(*) > 1
    `);
    
    console.log(`Found ${(outletDuplicates as any[]).length} users with duplicate outlet roles`);
    
    // Delete duplicates keeping only the oldest (lowest id)
    for (const dup of outletDuplicates as any[]) {
      const [result] = await pool.execute(`
        DELETE FROM user_role_assignments
        WHERE user_id = ? AND outlet_id = ? AND role_id = ?
        AND id NOT IN (
          SELECT min_id FROM (
            SELECT MIN(id) as min_id
            FROM user_role_assignments
            WHERE user_id = ? AND outlet_id = ? AND role_id = ?
          ) as temp
        )
      `, [dup.user_id, dup.outlet_id, dup.role_id, dup.user_id, dup.outlet_id, dup.role_id]);
      
      console.log(`  Cleaned up ${(result as any).affectedRows} duplicate outlet role(s) for user ${dup.user_id}, outlet ${dup.outlet_id}`);
    }
    
    console.log("✅ Duplicate role assignment cleanup complete!");
    
  } catch (error) {
    console.error("❌ Error fixing duplicate role assignments:", error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

fixDuplicateRoleAssignments();
