// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.

import type { DbConn } from "@jurnapod/db";
import type { RowDataPacket } from "mysql2";

// ============================================================================
// Query Result Types
// ============================================================================

export type ItemCancellationQueryResult = {
  id: number;
  cancellation_id: string;
  company_id: number;
  outlet_id: number;
  order_id: string;
  update_id: string | null;
  item_id: number;
  variant_id: number | null;
  cancelled_quantity: number;
  reason: string;
  cancelled_by_user_id: number | null;
  cancelled_at: Date;
  cancelled_at_ts: number;
  created_at: Date;
};

// ============================================================================
// Input Types (for inserts)
// ============================================================================

export type ItemCancellationInsertInput = {
  cancellation_id: string;
  order_id: string;
  item_id: number;
  variant_id?: number | null;
  company_id: number;
  outlet_id: number;
  cancelled_quantity: number;
  reason: string;
  cancelled_by_user_id?: number | null;
  cancelled_at: string;
  cancelled_at_ts: number;
};

// ============================================================================
// Query Functions
// ============================================================================

/**
 * Insert a new item cancellation into pos_item_cancellations.
 * The unique constraint on (cancellation_id, company_id) ensures idempotency.
 * 
 * Timestamp authority:
 * - cancelled_at / cancelled_at_ts: CLIENT-authoritative cancellation timestamp
 * - created_at: SERVER-authoritative (DB default)
 */
export async function insertItemCancellation(
  db: DbConn,
  cancellation: ItemCancellationInsertInput
): Promise<void> {
  await db.execute(
    `INSERT INTO pos_item_cancellations (
       cancellation_id, order_id, item_id, variant_id,
       company_id, outlet_id, cancelled_quantity, reason,
       cancelled_by_user_id, cancelled_at, cancelled_at_ts
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      cancellation.cancellation_id,
      cancellation.order_id,
      cancellation.item_id,
      cancellation.variant_id ?? null,
      cancellation.company_id,
      cancellation.outlet_id,
      cancellation.cancelled_quantity,
      cancellation.reason,
      cancellation.cancelled_by_user_id ?? null,
      cancellation.cancelled_at,
      cancellation.cancelled_at_ts
    ]
  );
}

/**
 * Check if an item cancellation exists by cancellation_id + company_id.
 * Used for idempotency checks in sync push.
 */
export async function checkItemCancellationExists(
  db: DbConn,
  cancellationId: string,
  companyId: number
): Promise<boolean> {
  const rows = await db.queryAll<RowDataPacket>(
    `SELECT cancellation_id FROM pos_item_cancellations WHERE cancellation_id = ? AND company_id = ? LIMIT 1`,
    [cancellationId, companyId]
  );

  return rows.length > 0;
}

/**
 * Batch check which item cancellations exist by cancellation_id + company_id.
 * Used for idempotency checks when processing multiple cancellations.
 * Returns an array of cancellation_ids that already exist.
 */
export async function batchCheckItemCancellationsExist(
  db: DbConn,
  cancellationIds: string[],
  companyId: number
): Promise<string[]> {
  if (cancellationIds.length === 0) {
    return [];
  }

  const placeholders = cancellationIds.map(() => "?").join(", ");
  const rows = await db.queryAll<RowDataPacket>(
    `SELECT cancellation_id FROM pos_item_cancellations WHERE cancellation_id IN (${placeholders}) AND company_id = ?`,
    [...cancellationIds, companyId]
  );

  return rows.map((row) => row.cancellation_id as string);
}
