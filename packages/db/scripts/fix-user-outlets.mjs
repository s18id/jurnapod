#!/usr/bin/env node
/**
 * Legacy compatibility script.
 *
 * `user_outlets` is retired. Outlet access is represented by
 * `user_role_assignments` (`outlet_id` scoped) and global-role rows (`outlet_id IS NULL`).
 *
 * This script now performs a lightweight audit instead of writing to legacy tables.
 */

import mysql from 'mysql2/promise';
import { config } from 'dotenv';
import path from 'path';

config({ path: path.join(process.cwd(), '../../.env') });

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'jurnapod',
  charset: 'utf8mb4'
};

async function main() {
  console.log('ℹ user_outlets is retired; auditing user_role_assignments instead...\n');

  const connection = await mysql.createConnection(dbConfig);
  try {
    const [rows] = await connection.execute(`
      SELECT
        u.email,
        SUM(CASE WHEN ura.outlet_id IS NULL THEN 1 ELSE 0 END) AS global_role_rows,
        SUM(CASE WHEN ura.outlet_id IS NOT NULL THEN 1 ELSE 0 END) AS outlet_role_rows
      FROM users u
      LEFT JOIN user_role_assignments ura ON ura.user_id = u.id
      WHERE u.is_active = 1
      GROUP BY u.id, u.email
      ORDER BY u.email
    `);

    for (const row of rows) {
      console.log(
        `- ${row.email}: global_role_rows=${row.global_role_rows ?? 0}, outlet_role_rows=${row.outlet_role_rows ?? 0}`
      );
    }

    console.log('\n✅ Audit complete. No legacy user_outlets writes performed.');
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error('❌ Error:', error.message);
  process.exit(1);
});
