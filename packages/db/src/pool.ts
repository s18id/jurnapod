// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Database pool factory for Jurnapod.
 * 
 * This module provides the MySQL connection pool creation using callback-based mysql2.
 * Use createDbPool() to create a new pool.
 */

import mysql from "mysql2";
import type { Pool } from "mysql2";

/**
 * Configuration for creating a database pool
 */
export interface DbPoolConfig {
  uri?: string;
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  database?: string;
  charset?: string;
  connectionLimit?: number;
  dateStrings?: boolean;
  enableKeepAlive?: boolean;
  keepAliveInitialDelay?: number;
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
  const poolOptions = {
    waitForConnections: true,
    connectionLimit: config.connectionLimit ?? 10,
    queueLimit: 0,
    enableKeepAlive: config.enableKeepAlive ?? true,
    keepAliveInitialDelay: config.keepAliveInitialDelay ?? 10000,
    dateStrings: config.dateStrings ?? true
  };

  if (config.uri) {
    // URI mode: mysql2 parses host, port, user, password, database from URI
    return mysql.createPool(config.uri);
  }

  // Individual params mode
  return mysql.createPool({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    charset: normalizeDbCharset(config.charset),
    ...poolOptions
  });
}