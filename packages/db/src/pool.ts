// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Database pool factory for Jurnapod.
 * 
 * This module provides the MySQL connection pool creation.
 * Use createDbPool() to create a new pool, or pass config
 * to DbConn constructor.
 */

import mysql from "mysql2/promise";
import type { Pool } from "mysql2/promise";

/**
 * Configuration for creating a database pool
 */
export interface DbPoolConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  charset?: string;
  connectionLimit?: number;
  dateStrings?: boolean;
}

/**
 * Normalize collation to base charset
 */
function normalizeDbCharset(collation: string | null | undefined): string | undefined {
  if (!collation) {
    return undefined;
  }
  const trimmed = collation.trim();
  if (trimmed.length === 0) {
    return undefined;
  }
  const baseCharset = trimmed.split("_")[0];
  return baseCharset.length > 0 ? baseCharset : undefined;
}

/**
 * Creates a MySQL connection pool.
 * 
 * @param config - Database connection configuration
 * @returns A MySQL connection pool
 * 
 * @example
 * ```typescript
 * import { createDbPool } from '@jurnapod/db';
 * 
 * const pool = createDbPool({
 *   host: 'localhost',
 *   port: 3306,
 *   user: 'root',
 *   password: 'password',
 *   database: 'jurnapod',
 *   connectionLimit: 10
 * });
 * ```
 */
export function createDbPool(config: DbPoolConfig): Pool {
  return mysql.createPool({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    charset: normalizeDbCharset(config.charset),
    waitForConnections: true,
    connectionLimit: config.connectionLimit ?? 10,
    queueLimit: 0,
    dateStrings: config.dateStrings ?? true
  });
}

/**
 * Closes a database pool.
 * 
 * @param pool - The pool to close
 */
export async function closeDbPool(pool: Pool): Promise<void> {
  await pool.end();
}
