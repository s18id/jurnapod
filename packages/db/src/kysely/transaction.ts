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
 * MySQL deadlock errno.
 */
const MYSQL_ERRNO_DEADLOCK = 1213;

/**
 * MySQL lock wait timeout error code.
 */
const ER_LOCK_WAIT_TIMEOUT = 'ER_LOCK_WAIT_TIMEOUT';

/**
 * MySQL lock wait timeout errno.
 */
const MYSQL_ERRNO_LOCK_WAIT_TIMEOUT = 1205;

/**
 * Phrase that appears in lock wait timeout messages.
 */
const LOCK_WAIT_TIMEOUT_PHRASE = 'lock wait timeout exceeded';

/**
 * Default maximum retry attempts for deadlock handling.
 */
const DEFAULT_MAX_ATTEMPTS = 5;

/**
 * Default initial delay in milliseconds for deadlock retry backoff.
 * Higher values help reduce contention under heavy parallel load.
 */
const DEFAULT_INITIAL_DELAY_MS = 100;

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
  const initialDelayMs = options?.initialDelayMs ?? DEFAULT_INITIAL_DELAY_MS;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await db.transaction().execute(callback);
    } catch (error: unknown) {
      // Retry on deadlock and only if we have retries left.
      // Kysely/mysql2 errors can be wrapped (e.g. under `cause`),
      // so we walk the error chain and check code/errno/message.
      if (attempt < maxAttempts - 1 && isDeadlockError(error)) {
        // Exponential backoff: 100ms, 200ms, 400ms, ...
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

export function isDeadlockError(error: unknown): boolean {
  const visited = new Set<unknown>();
  let current: unknown = error;

  while (typeof current === 'object' && current !== null && !visited.has(current)) {
    visited.add(current);

    const err = current as {
      code?: unknown;
      errno?: unknown;
      message?: unknown;
      cause?: unknown;
      originalError?: unknown;
    };

    if (typeof err.code === 'string' && err.code === ER_LOCK_DEADLOCK) {
      return true;
    }

    if (typeof err.code === 'string' && err.code === ER_LOCK_WAIT_TIMEOUT) {
      return true;
    }

    if (typeof err.errno === 'number' && err.errno === MYSQL_ERRNO_DEADLOCK) {
      return true;
    }

    if (typeof err.errno === 'number' && err.errno === MYSQL_ERRNO_LOCK_WAIT_TIMEOUT) {
      return true;
    }

    if (typeof err.message === 'string' && err.message.toLowerCase().includes('deadlock found')) {
      return true;
    }

    if (typeof err.message === 'string' && err.message.toLowerCase().includes(LOCK_WAIT_TIMEOUT_PHRASE)) {
      return true;
    }

    if (err.cause !== undefined) {
      current = err.cause;
      continue;
    }

    if (err.originalError !== undefined) {
      current = err.originalError;
      continue;
    }

    break;
  }

  return false;
}
