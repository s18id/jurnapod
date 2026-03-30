// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Jurnapod Database Package - Kysely Edition
 * 
 * Pure Kysely interface for type-safe SQL queries.
 * No wrapper abstractions - use Kysely directly.
 * 
 * @example
 * ```typescript
 * import { createKysely, sql } from '@jurnapod/db';
 * 
 * const db = createKysely({ uri: 'mysql://...' });
 * 
 * // Type-safe query
 * const accounts = await db
 *   .selectFrom('accounts')
 *   .where('company_id', '=', companyId)
 *   .selectAll()
 *   .execute();
 * 
 * // Raw SQL with type safety
 * const result = await sql`SELECT * FROM accounts`.execute(db);
 * 
 * // Transaction
 * await db.transaction().execute(async (trx) => {
 *   await trx.insertInto('accounts').values({ ... }).execute();
 * });
 * 
 * // Cleanup
 * await db.destroy();
 * ```
 */

// Core Kysely - re-export for convenience
export { Kysely, sql } from 'kysely';
export type { Transaction, Sql } from 'kysely';

// Schema types
export type { DB as DatabaseSchema } from './kysely/schema.js';

// Factory functions
export { createKysely, getKysely } from './kysely/index.js';

// Config type for passing to createKysely
export type { DbPoolConfig } from './pool.js';

// SQL helper utilities
export { buildQuery } from './sql-helpers.js';

// Kysely adapter for raw SQL with ? placeholders
export { KyselyAdapter, type ExecuteResult, type TransactionAdapter } from './adapters/kysely-adapter.js';
