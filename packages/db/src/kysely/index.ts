// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Kysely instance factory for Jurnapod.
 * 
 * This module provides a type-safe query builder that reuses the existing
 * mysql2 connection pool singleton from apps/api/src/lib/db.ts.
 * 
 * Key features:
 * - Reuses existing mysql2 pool (no new connections)
 * - Type-safe SQL with compile-time column/table validation
 * - Compatible with MySQL 8.0+ and MariaDB
 * - dateStrings: true is preserved (dates returned as strings)
 */

import { Kysely, MysqlDialect } from 'kysely';
import type { Pool } from 'mysql2/promise';
import type { DB } from './schema';

/**
 * Creates a Kysely instance that reuses the existing mysql2 pool.
 * 
 * @param pool - The mysql2 connection pool (from getDbPool())
 * @returns A Kysely instance configured for Jurnapod's database
 * 
 * @example
 * ```typescript
 * import { getDbPool } from '@/lib/db';
 * import { createKysely } from '@jurnapod/db/kysely';
 * 
 * const pool = getDbPool();
 * const db = createKysely(pool);
 * 
 * // Type-safe query
 * const accounts = await db
 *   .selectFrom('accounts')
 *   .where('company_id', '=', 1)
 *   .select(['id', 'code', 'name'])
 *   .execute();
 * ```
 */
export function createKysely(pool: Pool): Kysely<DB> {
  return new Kysely<DB>({
    dialect: new MysqlDialect({
      pool
    })
  });
}

// Re-export types for consumers
export type { DB } from './schema';
export type { Kysely } from 'kysely';
