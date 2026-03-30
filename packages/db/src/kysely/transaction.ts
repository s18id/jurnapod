// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Transaction helper utilities for Kysely.
 * 
 * These are optional thin wrappers around Kysely's native transaction API
 * for consumers who prefer a function-based approach.
 */

import type { Kysely, Transaction } from 'kysely';
import type { DB } from './schema.js';

/**
 * Execute a callback within a transaction.
 * Rolls back on error, commits on success.
 * 
 * This is a thin wrapper around Kysely's transaction API
 * for consumers who prefer a function-based approach.
 * 
 * @param db - Kysely instance
 * @param callback - Async function to execute within transaction
 * @returns Result of the callback
 * 
 * @example
 * ```typescript
 * import { withTransaction } from '@jurnapod/db/kysely';
 * 
 * const result = await withTransaction(db, async (trx) => {
 *   const batch = await trx.insertInto('journal_batches')...
 *   await trx.insertInto('journal_entries')...
 *   return batch;
 * });
 * ```
 */
export async function withTransaction<T>(
  db: Kysely<DB>,
  callback: (trx: Transaction<DB>) => Promise<T>
): Promise<T> {
  return db.transaction().execute(callback);
}
