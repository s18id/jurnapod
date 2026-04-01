// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Sync Duplicate Detection Library
 *
 * Lightweight duplicate checking for client transaction IDs.
 * These functions have zero HTTP knowledge.
 *
 * ## Semantic Boundary (CRITICAL)
 *
 * This library provides preflight-only duplicate detection.
 *
 * IMPORTANT:
 * - This is NOT the authoritative idempotency check
 * - Authoritative idempotency lives in sync push processing
 * - This function is read-only; it does not acquire locks or modify state
 * - Results may be stale due to replication lag
 * - Callers must still handle the case where push returns DUPLICATE
 *
 * Used for simple duplicate detection without full idempotency hashing.
 */

import { getDb } from "../db.js";
import type { KyselySchema } from "@jurnapod/db";

// =============================================================================
// Types
// =============================================================================

export interface DuplicateCheckResult {
  /** Whether this is a duplicate transaction */
  isDuplicate: boolean;
  /** Existing transaction ID if duplicate */
  existingId?: number;
  /** When the existing transaction was created */
  createdAt?: Date;
}

// =============================================================================
// Main Function
// =============================================================================

/**
 * Check if a client transaction ID already exists (duplicate detection)
 * 
 * Queries the pos_transactions table to check for existing transactions
 * with the same company_id and client_tx_id.
 * 
 * @param companyId - Company ID
 * @param clientTxId - Client transaction ID (UUID from POS)
 * @param connection - Optional Kysely connection for transactions
 * @returns Duplicate check result with existing transaction details if found
 */
export async function checkDuplicateClientTx(
  companyId: number,
  clientTxId: string,
  connection?: KyselySchema
): Promise<DuplicateCheckResult> {
  const db = connection || getDb();

  const row = await db
    .selectFrom("pos_transactions")
    .select(["id", "created_at"])
    .where("company_id", "=", companyId)
    .where("client_tx_id", "=", clientTxId)
    .executeTakeFirst();

  if (!row) {
    return {
      isDuplicate: false
    };
  }

  return {
    isDuplicate: true,
    existingId: row.id,
    createdAt: new Date(row.created_at)
  };
}
