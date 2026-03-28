// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Sync Duplicate Detection Library
 * 
 * Lightweight duplicate checking for client transaction IDs.
 * These functions have zero HTTP knowledge.
 * 
 * Used for simple duplicate detection without full idempotency hashing.
 */

import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import { getDbPool } from "../db.js";

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
// Internal Types
// =============================================================================

interface PosTransactionRow extends RowDataPacket {
  id: number;
  created_at: Date;
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
 * @param connection - Optional database connection for transactions
 * @returns Duplicate check result with existing transaction details if found
 */
export async function checkDuplicateClientTx(
  companyId: number,
  clientTxId: string,
  connection?: PoolConnection
): Promise<DuplicateCheckResult> {
  const db = connection || getDbPool();

  const query = `
    SELECT id, created_at
    FROM pos_transactions
    WHERE company_id = ?
      AND client_tx_id = ?
    LIMIT 1
  `;

  const [rows] = await db.execute<PosTransactionRow[]>(query, [companyId, clientTxId]);

  if (rows.length === 0) {
    return {
      isDuplicate: false
    };
  }

  const row = rows[0];
  return {
    isDuplicate: true,
    existingId: row.id,
    createdAt: new Date(row.created_at)
  };
}
