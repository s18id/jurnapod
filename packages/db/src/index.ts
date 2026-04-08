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

// Schema types
export type { DB as DatabaseSchema } from './kysely/schema.js';

// Factory functions
export { createKysely, getKysely, type KyselySchema } from './kysely/index.js';

export { withTransaction, withTransactionRetry } from './kysely/transaction.js';
export type { Transaction } from './kysely/transaction.js';

// Batch operations
export { batchInsert, batchInsertWithChunking, BATCH_MAX_SIZE } from './batch.js';

// Config type for passing to createKysely
export type { DbPoolConfig } from './pool.js';
