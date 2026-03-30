// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Kysely factory functions for Jurnapod.
 * 
 * Provides two patterns:
 * 1. createKysely(config) - Create new instance (you manage lifecycle)
 * 2. getKysely(config)    - Singleton pattern (cached instance)
 */

import { Kysely, MysqlDialect } from 'kysely';
import type { DB } from './schema.js';
import { createDbPool, type DbPoolConfig } from '../pool.js';

// Singleton instance cache
let singletonInstance: Kysely<DB> | null = null;
let singletonConfigKey: string | null = null;

/**
 * Create a new Kysely instance with internal pool management.
 * 
 * @param config - Database connection configuration
 * @returns Kysely instance with internally-managed pool
 * 
 * @example
 * ```typescript
 * import { createKysely } from '@jurnapod/db';
 * 
 * const db = createKysely({
 *   uri: 'mysql://user:pass@localhost:3306/jurnapod?charset=utf8mb4'
 * });
 * 
 * const accounts = await db
 *   .selectFrom('accounts')
 *   .where('company_id', '=', 1)
 *   .selectAll()
 *   .execute();
 * 
 * // Clean up when done
 * await db.destroy();
 * ```
 */
export function createKysely(config: DbPoolConfig): Kysely<DB> {
  const pool = createDbPool(config);
  
  return new Kysely<DB>({
    dialect: new MysqlDialect({
      pool: pool as any  // mysql2 callback pool compatible
    })
  });
}

/**
 * Get or create a singleton Kysely instance.
 * 
 * Creates instance on first call, returns cached instance on subsequent calls.
 * Different configs create different singletons (keyed by config hash).
 * 
 * Use this for API server pattern where you want a single DB connection
 * throughout the application lifecycle.
 * 
 * @param config - Database connection configuration
 * @returns Cached or new Kysely instance
 * 
 * @example
 * ```typescript
 * import { getKysely } from '@jurnapod/db';
 * 
 * // In application initialization
 * const db = getKysely({ uri: process.env.DATABASE_URL! });
 * 
 * // In routes/controllers - same instance
 * const sameDb = getKysely({ uri: process.env.DATABASE_URL! });
 * 
 * // On shutdown
 * await db.destroy();
 * ```
 */
export function getKysely(config: DbPoolConfig): Kysely<DB> {
  const configKey = config.uri || 
    `${config.host}:${config.port}:${config.database}`;
  
  if (!singletonInstance || singletonConfigKey !== configKey) {
    singletonInstance = createKysely(config);
    singletonConfigKey = configKey;
  }
  
  return singletonInstance;
}

// Re-export types for convenience
export type { DB } from './schema.js';
export type { Kysely } from 'kysely';
