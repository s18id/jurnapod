#!/usr/bin/env node
/**
 * Fix Duplicate Role Assignments
 * 
 * One-time script to clean up duplicate role assignments in user_role_assignments table.
 * Duplicates can occur because MySQL's unique constraint treats NULL != NULL.
 * 
 * Usage: npm run fix:duplicate-roles
 */

import { getDb, closeDbPool } from "../lib/db";
import { sql } from "kysely";

async function fixDuplicateRoleAssignments() {
  const db = getDb();
  
  console.log("🔍 Checking for duplicate role assignments...");
  
  try {
    // Find duplicate global roles (outlet_id IS NULL)
    const globalDuplicates = await sql<{ user_id: number; role_id: number; count: number }>`
      SELECT user_id, role_id, COUNT(*) as count
      FROM user_role_assignments
      WHERE outlet_id IS NULL
      GROUP BY user_id, role_id
      HAVING COUNT(*) > 1
    `.execute(db);

    console.log(`Found ${globalDuplicates.rows.length} users with duplicate global roles`);
    
    // Delete duplicates keeping only the oldest (lowest id)
    for (const dup of globalDuplicates.rows) {
      // Get the minimum id to keep
      const minIdResult = await db
        .selectFrom("user_role_assignments")
        .where("user_id", "=", dup.user_id)
        .where("role_id", "=", dup.role_id)
        .where("outlet_id", "is", null)
        .select((eb) => eb.fn.min("id").as("min_id"))
        .executeTakeFirst();

      const minId = minIdResult?.min_id;
      if (!minId) continue;

      await db
        .deleteFrom("user_role_assignments")
        .where("user_id", "=", dup.user_id)
        .where("role_id", "=", dup.role_id)
        .where("outlet_id", "is", null)
        .where("id", "!=", minId)
        .execute();

      console.log(`  Cleaned up duplicate global role(s) for user ${dup.user_id}`);
    }
    
    // Find duplicate outlet-scoped roles
    const outletDuplicates = await sql<{ user_id: number; outlet_id: number; role_id: number; count: number }>`
      SELECT user_id, outlet_id, role_id, COUNT(*) as count
      FROM user_role_assignments
      WHERE outlet_id IS NOT NULL
      GROUP BY user_id, outlet_id, role_id
      HAVING COUNT(*) > 1
    `.execute(db);
    
    console.log(`Found ${outletDuplicates.rows.length} users with duplicate outlet roles`);
    
    // Delete duplicates keeping only the oldest (lowest id)
    for (const dup of outletDuplicates.rows) {
      const minIdResult = await db
        .selectFrom("user_role_assignments")
        .where("user_id", "=", dup.user_id)
        .where("outlet_id", "=", dup.outlet_id)
        .where("role_id", "=", dup.role_id)
        .select((eb) => eb.fn.min("id").as("min_id"))
        .executeTakeFirst();

      const minId = minIdResult?.min_id;
      if (!minId) continue;

      await db
        .deleteFrom("user_role_assignments")
        .where("user_id", "=", dup.user_id)
        .where("outlet_id", "=", dup.outlet_id)
        .where("role_id", "=", dup.role_id)
        .where("id", "!=", minId)
        .execute();
      
      console.log(`  Cleaned up duplicate outlet role(s) for user ${dup.user_id}, outlet ${dup.outlet_id}`);
    }
    
    console.log("✅ Duplicate role assignment cleanup complete!");
    
  } catch (error) {
    console.error("❌ Error fixing duplicate role assignments:", error);
    process.exit(1);
  } finally {
    await closeDbPool();
  }
}

fixDuplicateRoleAssignments();
