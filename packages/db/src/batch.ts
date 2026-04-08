// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Batch operation utilities for Kysely.
 * 
 * Provides reusable batch insert operations for high-throughput scenarios
 * like imports, syncs, and bulk data loading.
 * 
 * Note: For full type safety, prefer service-specific batch methods that
 * use Kysely's typed insertInto with literal table names.
 */

import { withTransactionRetry } from './kysely/transaction.js';

/**
 * Maximum number of rows to insert in a single batch operation.
 * MySQL's max_allowed_packet and lock contention considerations.
 */
export const BATCH_MAX_SIZE = 500;

/**
 * Insert multiple records in a single transaction.
 * 
 * Uses a single transaction with deadlock retry for atomicity.
 * All records insert or all rollback on error.
 * 
 * @param db - Kysely instance
 * @param tableName - Table name (string, not type-safe)
 * @param records - Array of records (max 500)
 * @returns Number of records inserted
 * 
 * @example
 * ```typescript
 * const count = await batchInsert(db, 'item_prices', [
 *   { company_id: 1, item_id: 10, price: 10000 },
 *   { company_id: 1, item_id: 20, price: 20000 },
 * ]);
 * ```
 */
export async function batchInsert(
  db: Parameters<typeof withTransactionRetry>[0],
  tableName: string,
  records: Record<string, unknown>[],
): Promise<number> {
  if (records.length === 0) {
    return 0;
  }

  if (records.length > BATCH_MAX_SIZE) {
    throw new Error(`Batch size exceeds maximum of ${BATCH_MAX_SIZE} records`);
  }

  return withTransactionRetry(db, async (trx) => {
    const result = await trx
      .insertInto(tableName as never)
      .values(records as never[])
      .executeTakeFirst();

    return Number(result.insertId ?? 0);
  });
}

/**
 * Insert multiple records with chunking for large batches.
 * 
 * Splits large batches into chunks of BATCH_MAX_SIZE (500) and
 * processes sequentially with deadlock retry on each chunk.
 * 
 * @param db - Kysely instance  
 * @param tableName - Table name
 * @param records - All records to insert
 * @returns Total number of records inserted
 */
export async function batchInsertWithChunking(
  db: Parameters<typeof withTransactionRetry>[0],
  tableName: string,
  records: Record<string, unknown>[],
): Promise<number> {
  if (records.length === 0) {
    return 0;
  }

  let totalInserted = 0;

  for (let i = 0; i < records.length; i += BATCH_MAX_SIZE) {
    const chunk = records.slice(i, i + BATCH_MAX_SIZE);
    const inserted = await batchInsert(db, tableName, chunk);
    totalInserted += inserted;
  }

  return totalInserted;
}