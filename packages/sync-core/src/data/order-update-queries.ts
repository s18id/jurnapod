// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.

import { sql } from "kysely";
import type { KyselySchema } from "@jurnapod/db";

// ============================================================================
// Query Result Types
// ============================================================================

export type OrderUpdateQueryResult = {
  sequence_no: number;
  update_id: string;
  order_id: string;
  company_id: number;
  outlet_id: number;
  base_order_updated_at: Date | null;
  base_order_updated_at_ts: number | null;
  event_type: string;
  delta_json: string;
  actor_user_id: number | null;
  device_id: string;
  event_at: Date;
  event_at_ts: number;
  created_at: Date;
};

// ============================================================================
// Input Types (for inserts)
// ============================================================================

export type OrderUpdateInsertInput = {
  update_id: string;
  order_id: string;
  company_id: number;
  outlet_id: number;
  base_order_updated_at?: string | null;
  base_order_updated_at_ts?: number | null;
  event_type: string;
  delta_json: string;
  actor_user_id?: number | null;
  device_id: string;
  event_at: string;
  event_at_ts: number;
};

// ============================================================================
// Query Functions
// ============================================================================

/**
 * Insert a new order update into pos_order_updates.
 * The unique constraint on (update_id, company_id) ensures idempotency.
 * 
 * Timestamp authority:
 * - base_order_updated_at / base_order_updated_at_ts: VERSION MARKER METADATA (client-authored)
 * - event_at / event_at_ts: CLIENT-authoritative event timestamp
 * - created_at: SERVER-authoritative (DB default)
 */
export async function insertOrderUpdate(
  db: KyselySchema,
  update: OrderUpdateInsertInput
): Promise<void> {
  await sql`
    INSERT INTO pos_order_updates (
       update_id, order_id, company_id, outlet_id,
       base_order_updated_at, base_order_updated_at_ts,
       event_type, delta_json, actor_user_id, device_id,
       event_at, event_at_ts
     ) VALUES (
       ${update.update_id},
       ${update.order_id},
       ${update.company_id},
       ${update.outlet_id},
       ${update.base_order_updated_at ?? null},
       ${update.base_order_updated_at_ts ?? null},
       ${update.event_type},
       ${update.delta_json},
       ${update.actor_user_id ?? null},
       ${update.device_id},
       ${update.event_at},
       ${update.event_at_ts}
     )
  `.execute(db);
}

/**
 * Check if an order update exists by update_id + company_id.
 * Used for idempotency checks in sync push.
 * 
 * Note: The unique key is on update_id alone (uq_pos_order_updates_update_id),
 * but company_id is included for proper tenant scoping.
 */
export async function checkOrderUpdateExists(
  db: KyselySchema,
  updateId: string,
  companyId: number
): Promise<boolean> {
  const result = await sql`
    SELECT update_id FROM pos_order_updates WHERE update_id = ${updateId} AND company_id = ${companyId} LIMIT 1
  `.execute(db);

  return result.rows.length > 0;
}

/**
 * Batch check which order updates exist by update_id + company_id.
 * Used for idempotency checks when processing multiple updates.
 * Returns an array of update_ids that already exist.
 */
export async function batchCheckOrderUpdatesExist(
  db: KyselySchema,
  updateIds: string[],
  companyId: number
): Promise<string[]> {
  if (updateIds.length === 0) {
    return [];
  }

  const result = await sql`
    SELECT update_id FROM pos_order_updates 
    WHERE update_id IN (${sql.join(updateIds.map(id => sql`${id}`), sql`, `)}) AND company_id = ${companyId}
  `.execute(db);

  return result.rows.map((row) => (row as any).update_id as string);
}
