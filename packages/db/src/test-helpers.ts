// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Test helpers for @jurnapod/db package.
 * 
 * Provides utilities for creating test database connections
 * using environment variables from the repo root .env file.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDbPool, DbConn } from './index.js';
import type { Pool } from 'mysql2';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../../..');

/**
 * Load environment variables from repo root .env file.
 */
export async function loadTestEnv(): Promise<void> {
  // Use dynamic import for ESM compatibility
  const envPath = path.join(repoRoot, '.env');
  const { config } = await import('dotenv');
  config({ path: envPath });
}

/**
 * Get test database configuration from environment variables.
 */
function getTestDbConfig() {
  return {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'jurnapod'
  };
}

/**
 * Create a database pool for testing.
 * Uses DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME from .env.
 */
export function getTestDbPool(): Pool {
  const config = getTestDbConfig();
  return createDbPool({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    connectionLimit: 5
  });
}

/**
 * Close a test database pool.
 */
export async function closeTestDbPool(pool: Pool): Promise<void> {
  await pool.end();
}

/**
 * Create a DbConn instance for testing.
 */
export function getTestDbConn(pool: Pool): DbConn {
  return new DbConn(pool);
}

/**
 * Execute a callback within a test transaction.
 * Automatically rolls back after the callback completes.
 * 
 * @param pool - The database pool
 * @param callback - Function to execute within the transaction
 * @returns The result of the callback
 */
export async function withTestTransaction<T>(
  pool: Pool,
  callback: (conn: DbConn) => Promise<T>
): Promise<T> {
  const conn = new DbConn(pool);
  await conn.beginTransaction();
  try {
    return await callback(conn);
  } finally {
    // Rollback if still in transaction
    try {
      await conn.rollback();
    } catch {
      // Ignore rollback errors if already committed
    }
  }
}
