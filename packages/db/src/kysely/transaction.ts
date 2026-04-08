// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Transaction helper utilities for Kysely.
 * 
 * These are optional thin wrappers around Kysely's native transaction API
 * for consumers who prefer a function-based approach.
 */

import type { Transaction as TS } from 'kysely';
import type { DB } from './schema.js';
import { KyselySchema } from './index.js';

export type Transaction = TS<DB>

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
  db: KyselySchema,
  callback: (trx: Transaction) => Promise<T>
): Promise<T> {
  return db.transaction().execute(callback);
}

/**
 * MySQL deadlock error code.
 */
const ER_LOCK_DEADLOCK = 'ER_LOCK_DEADLOCK';

/**
 * Default maximum retry attempts for deadlock handling.
 */
const DEFAULT_MAX_ATTEMPTS = 3;

/**
 * Execute a callback within a transaction, retrying on MySQL deadlocks.
 * 
 * Uses exponential backoff between retries. All other errors propagate normally.
 * The transaction is rolled back automatically on any error (including deadlock)
 * before retry, so the callback can be re-executed safely.
 * 
 * @param db - Kysely instance
 * @param callback - Async function to execute within transaction
 * @param options - Retry options (maxAttempts, initialDelayMs)
 * @returns Result of the callback
 * 
 * @example
 * ```typescript
 * import { withTransactionRetry } from '@jurnapod/db/kysely';
 * 
 * const result = await withTransactionRetry(db, async (trx) => {
 *   const batch = await trx.insertInto('journal_batches')...
 *   await trx.insertInto('journal_entries')...
 *   return batch;
 * });
 * ```
 */
export async function withTransactionRetry<T>(
  db: KyselySchema,
  callback: (trx: Transaction) => Promise<T>,
  options?: { maxAttempts?: number; initialDelayMs?: number }
): Promise<T> {
  const maxAttempts = options?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const initialDelayMs = options?.initialDelayMs ?? 50;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await db.transaction().execute(callback);
    } catch (error: unknown) {
      // Only retry on ER_LOCK_DEADLOCK and only if we have retries left
      if (
        attempt < maxAttempts - 1 &&
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code?: string }).code === ER_LOCK_DEADLOCK
      ) {
        // Exponential backoff: 50ms, 100ms, 200ms
        const delay = initialDelayMs * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      // All other errors (including remaining deadlock attempts) propagate
      throw error;
    }
  }
  // Should not be reached, but satisfy TypeScript
  return db.transaction().execute(callback);
}
