#!/usr/bin/env node
/**
 * Fix user_outlets table by syncing it with user_role_assignments
 * This ensures users with global roles get access to all outlets
 */

import mysql from 'mysql2/promise';
import { config } from 'dotenv';
import path from 'path';

// Load environment variables
config({ path: path.join(process.cwd(), '../../.env') });

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'jurnapod',
  charset: 'utf8mb4'
};

async function syncUserOutletsFromRoles(connection, userId) {
  console.log(`🔄 Syncing outlets for user ID ${userId}`);
  
  // First, delete all existing user_outlets for this user to start fresh
  await connection.execute(
    `DELETE FROM user_outlets WHERE user_id = ?`,
    [userId]
  );

  // Insert outlet-specific role assignments
  const [outletSpecific] = await connection.execute(
    `INSERT IGNORE INTO user_outlets (user_id, outlet_id)
     SELECT DISTINCT user_id, outlet_id
     FROM user_role_assignments
     WHERE user_id = ?
       AND outlet_id IS NOT NULL`,
    [userId]
  );

  // Insert ALL outlets for users with global roles
  const [globalRoles] = await connection.execute(
    `INSERT IGNORE INTO user_outlets (user_id, outlet_id)
     SELECT DISTINCT u.id, o.id
     FROM users u
     CROSS JOIN outlets o
     WHERE u.id = ?
       AND o.company_id = u.company_id
       AND EXISTS (
         SELECT 1
         FROM user_role_assignments ura
         INNER JOIN roles r ON r.id = ura.role_id
         WHERE ura.user_id = u.id
           AND r.is_global = 1
           AND ura.outlet_id IS NULL
       )`,
    [userId]
  );

  console.log(`   ✅ Added ${outletSpecific.affectedRows} outlet-specific assignments`);
  console.log(`   ✅ Added ${globalRoles.affectedRows} global role outlet assignments`);
}

async function main() {
  console.log('🔧 Fixing user_outlets table...\n');
  
  const connection = await mysql.createConnection(dbConfig);
  
  try {
    // Get all users
    const [users] = await connection.execute(
      `SELECT id, email FROM users WHERE is_active = 1 ORDER BY id`
    );
    
    console.log(`📊 Found ${users.length} active users\n`);
    
    // Sync outlets for each user
    for (const user of users) {
      await syncUserOutletsFromRoles(connection, user.id);
    }
    
    console.log('\n✅ All user outlets synced successfully!');
    
    // Verify the results
    console.log('\n📊 Verification:');
    const [verification] = await connection.execute(`
      SELECT 
        u.email,
        COUNT(uo.outlet_id) as outlet_count,
        GROUP_CONCAT(o.code ORDER BY o.code) as outlets
      FROM users u
      LEFT JOIN user_outlets uo ON u.id = uo.user_id
      LEFT JOIN outlets o ON uo.outlet_id = o.id
      WHERE u.is_active = 1
      GROUP BY u.id, u.email
      ORDER BY u.email
    `);
    
    for (const row of verification) {
      console.log(`   📧 ${row.email}: ${row.outlet_count} outlets (${row.outlets || 'none'})`);
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await connection.end();
  }
}

main().catch(console.error);