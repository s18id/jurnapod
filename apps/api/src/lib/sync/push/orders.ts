// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Sync Push Order Processing
 * 
 * Order sync functions for sync push: processActiveOrders, processOrderUpdates, processItemCancellations.
 * These functions have zero HTTP knowledge.
 * 
 * Uses Kysely for idempotency SELECT queries.
 * INSERT ... ON DUPLICATE KEY UPDATE patterns preserve raw SQL (financial-critical).
 * Timestamp columns use canonical conversions from date-helpers to preserve client-authored semantics.
 */

import type { PoolConnection } from "mysql2/promise";
import type { Kysely } from "kysely";
import type { DB } from "@jurnapod/db";
import { newKyselyConnection } from "@jurnapod/db";
import type { QueryExecutor } from "./types.js";
import type { ActiveOrder, OrderUpdate, ItemCancellation, OrderUpdateResult, ItemCancellationResult } from "./types.js";
import { toMysqlDateTime, toUtcInstant } from "../../date-helpers.js";
import { toEpochMs } from "../../date-helpers.js";

// ============================================================================
// Timestamp helpers (local to lib/sync/push to avoid circular deps)
// ============================================================================

function toMysqlDateTimeStrict(value: string, fieldName: string = "datetime"): string {
  try {
    return toMysqlDateTime(value);
  } catch {
    throw new Error(`Invalid ${fieldName}`);
  }
}

function toTimestampMs(value: string, fieldName: string = "datetime"): number {
  return toEpochMs(toUtcInstant(value));
}

// ============================================================================
// processActiveOrders
// ============================================================================

/**
 * Process active orders (order snapshot finalization)
 * 
 * Uses INSERT ... ON DUPLICATE KEY UPDATE for idempotency on the header.
 * Preserves raw SQL for complex upsert + snapshot line delete/insert.
 * 
 * Timestamp authority:
 * - opened_at / opened_at_ts: CLIENT-authoritative
 * - closed_at / closed_at_ts: CLIENT-authoritative  
 * - updated_at / updated_at_ts: CLIENT-authoritative (for lines: snapshot freshness)
 * - created_at: SERVER-authoritative (DB default)
 */
export async function processActiveOrders(
  executor: QueryExecutor,
  orders: ActiveOrder[],
  correlationId: string
): Promise<OrderUpdateResult[]> {
  if (!orders || orders.length === 0) {
    return [];
  }

  console.info("Processing active orders", { correlation_id: correlationId, count: orders.length });

  const results: OrderUpdateResult[] = [];

  for (const order of orders) {
    try {
      // Canonical timestamps from client-authored values
      const openedAtMysql = toMysqlDateTimeStrict(order.opened_at, "opened_at");
      const openedAtTs = toTimestampMs(order.opened_at, "opened_at");
      const closedAtMysql = order.closed_at ? toMysqlDateTimeStrict(order.closed_at, "closed_at") : null;
      const closedAtTs = order.closed_at ? toTimestampMs(order.closed_at, "closed_at") : null;
      const updatedAtMysql = toMysqlDateTimeStrict(order.updated_at, "updated_at");
      const updatedAtTs = toTimestampMs(order.updated_at, "updated_at");

      // Upsert the order snapshot header
      // Note: created_at_ts was removed per ADR-0001 / Story 18.1.
      // created_at is retained and populated by the DB default CURRENT_TIMESTAMP on INSERT.
      await executor.execute(
        `INSERT INTO pos_order_snapshots (
           order_id, company_id, outlet_id, service_type, source_flow, settlement_flow,
           table_id, reservation_id, guest_count, is_finalized, order_status, order_state,
           paid_amount, opened_at, opened_at_ts, closed_at, closed_at_ts, notes, updated_at, updated_at_ts
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
            service_type = VALUES(service_type),
            source_flow = VALUES(source_flow),
            settlement_flow = VALUES(settlement_flow),
            table_id = VALUES(table_id),
            reservation_id = VALUES(reservation_id),
            guest_count = VALUES(guest_count),
            is_finalized = VALUES(is_finalized),
            order_status = VALUES(order_status),
            order_state = VALUES(order_state),
            paid_amount = VALUES(paid_amount),
            closed_at = VALUES(closed_at),
            closed_at_ts = VALUES(closed_at_ts),
            notes = VALUES(notes),
            updated_at = VALUES(updated_at),
            updated_at_ts = VALUES(updated_at_ts)`,
        [
          order.order_id,
          order.company_id,
          order.outlet_id,
          order.service_type,
          order.source_flow ?? null,
          order.settlement_flow ?? null,
          order.table_id ?? null,
          order.reservation_id ?? null,
          order.guest_count ?? null,
          order.is_finalized ? 1 : 0,
          order.order_status,
          order.order_state,
          order.paid_amount,
          openedAtMysql,
          openedAtTs,
          closedAtMysql,
          closedAtTs,
          order.notes ?? null,
          updatedAtMysql,
          updatedAtTs
        ]
      );

      // Delete existing snapshot lines and re-insert (simpler than diffing)
      // Timestamp semantics for snapshot lines:
      // - updated_at_ts: snapshot freshness/update time (from line's updated_at)
      // - created_at_ts: removed per ADR-0001 / Story 18.1
      await executor.execute(
        `DELETE FROM pos_order_snapshot_lines WHERE order_id = ? AND company_id = ?`,
        [order.order_id, order.company_id]
      );

      if (order.lines.length > 0) {
        const lineValues = order.lines.map((line) => [
          order.order_id,
          order.company_id,
          order.outlet_id,
          line.item_id,
          line.variant_id ?? null,
          line.sku_snapshot ?? null,
          line.name_snapshot,
          line.item_type_snapshot,
          line.unit_price_snapshot,
          line.qty,
          line.discount_amount,
          toMysqlDateTimeStrict(line.updated_at, "updated_at"),
          toTimestampMs(line.updated_at)
        ]);

        const placeholders = lineValues.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").join(", ");
        const flatValues = lineValues.flat();

        await executor.execute(
          `INSERT INTO pos_order_snapshot_lines (
             order_id, company_id, outlet_id, item_id, variant_id, sku_snapshot,
             name_snapshot, item_type_snapshot, unit_price_snapshot, qty,
             discount_amount, updated_at, updated_at_ts
           ) VALUES ${placeholders}`,
          flatValues
        );
      }

      results.push({ update_id: order.order_id, result: "OK" });
    } catch (error) {
      console.error("Failed to process active order", {
        correlation_id: correlationId,
        order_id: order.order_id,
        error
      });
      results.push({
        update_id: order.order_id,
        result: "ERROR",
        message: error instanceof Error ? error.message : "Failed to process order"
      });
    }
  }

  return results;
}

// ============================================================================
// processOrderUpdates
// ============================================================================

/**
 * Check if order update already exists (Kysely)
 */
async function checkOrderUpdateExists(
  kysely: Kysely<DB>,
  updateId: string
): Promise<boolean> {
  const row = await kysely
    .selectFrom('pos_order_updates')
    .where('update_id', '=', updateId)
    .select(['update_id'])
    .executeTakeFirst();

  return row !== undefined;
}

/**
 * Process order updates (event-based order updates)
 * 
 * Uses Kysely for idempotency check SELECT.
 * Preserves raw SQL for INSERT operation.
 * 
 * Timestamp authority:
 * - base_order_updated_at / base_order_updated_at_ts: VERSION MARKER METADATA (client-authored)
 * - event_at / event_at_ts: CLIENT-authoritative event timestamp
 * - created_at: SERVER-authoritative (DB default)
 */
export async function processOrderUpdates(
  executor: QueryExecutor,
  dbConnection: PoolConnection,
  updates: OrderUpdate[],
  correlationId: string
): Promise<OrderUpdateResult[]> {
  if (!updates || updates.length === 0) {
    return [];
  }

  console.info("Processing order updates", { correlation_id: correlationId, count: updates.length });

  // Create Kysely instance for idempotency checks
  const kysely = newKyselyConnection(dbConnection);
  const results: OrderUpdateResult[] = [];

  for (const update of updates) {
    try {
      // Check if update already exists (idempotency by update_id) - uses Kysely
      const exists = await checkOrderUpdateExists(kysely, update.update_id);

      if (exists) {
        results.push({ update_id: update.update_id, result: "DUPLICATE" });
        continue;
      }

      // Canonical timestamps from client-authored values
      const baseOrderUpdatedAtMysql = update.base_order_updated_at
        ? toMysqlDateTimeStrict(update.base_order_updated_at, "base_order_updated_at")
        : null;
      const baseOrderUpdatedAtTs = update.base_order_updated_at
        ? toTimestampMs(update.base_order_updated_at, "base_order_updated_at")
        : null;
      const eventAtMysql = toMysqlDateTimeStrict(update.event_at, "event_at");
      const eventAtTs = toTimestampMs(update.event_at, "event_at");

      // Insert new order update - raw SQL
      await executor.execute(
        `INSERT INTO pos_order_updates (
           update_id, order_id, company_id, outlet_id, base_order_updated_at, base_order_updated_at_ts,
           event_type, delta_json, actor_user_id, device_id, event_at, event_at_ts
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          update.update_id,
          update.order_id,
          update.company_id,
          update.outlet_id,
          baseOrderUpdatedAtMysql,
          baseOrderUpdatedAtTs,
          update.event_type,
          update.delta_json,
          update.actor_user_id ?? null,
          update.device_id,
          eventAtMysql,
          eventAtTs
        ]
      );

      results.push({ update_id: update.update_id, result: "OK" });
    } catch (error) {
      console.error("Failed to process order update", {
        correlation_id: correlationId,
        update_id: update.update_id,
        error
      });
      results.push({
        update_id: update.update_id,
        result: "ERROR",
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }
  }

  return results;
}

// ============================================================================
// processItemCancellations
// ============================================================================

/**
 * Check if item cancellation already exists (Kysely)
 */
async function checkItemCancellationExists(
  kysely: Kysely<DB>,
  cancellationId: string
): Promise<boolean> {
  const row = await kysely
    .selectFrom('pos_item_cancellations')
    .where('cancellation_id', '=', cancellationId)
    .select(['cancellation_id'])
    .executeTakeFirst();

  return row !== undefined;
}

/**
 * Process item cancellations
 * 
 * Uses Kysely for idempotency check SELECT.
 * Preserves raw SQL for INSERT operation.
 * 
 * Timestamp authority:
 * - cancelled_at / cancelled_at_ts: CLIENT-authoritative cancellation timestamp
 * - created_at: SERVER-authoritative (DB default)
 */
export async function processItemCancellations(
  executor: QueryExecutor,
  dbConnection: PoolConnection,
  cancellations: ItemCancellation[],
  correlationId: string
): Promise<ItemCancellationResult[]> {
  if (!cancellations || cancellations.length === 0) {
    return [];
  }

  console.info("Processing item cancellations", { correlation_id: correlationId, count: cancellations.length });

  // Create Kysely instance for idempotency checks
  const kysely = newKyselyConnection(dbConnection);
  const results: ItemCancellationResult[] = [];

  for (const cancellation of cancellations) {
    try {
      // Check if cancellation already exists (idempotency by cancellation_id) - uses Kysely
      const exists = await checkItemCancellationExists(kysely, cancellation.cancellation_id);

      if (exists) {
        results.push({ cancellation_id: cancellation.cancellation_id, result: "DUPLICATE" });
        continue;
      }

      // Canonical timestamps from client-authored values
      const cancelledAtMysql = toMysqlDateTimeStrict(cancellation.cancelled_at, "cancelled_at");
      const cancelledAtTs = toTimestampMs(cancellation.cancelled_at, "cancelled_at");

      // Insert new cancellation - raw SQL
      await executor.execute(
        `INSERT INTO pos_item_cancellations (
           cancellation_id, update_id, order_id, item_id, variant_id,
           company_id, outlet_id, cancelled_quantity, reason,
           cancelled_by_user_id, cancelled_at, cancelled_at_ts
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          cancellation.cancellation_id,
          cancellation.update_id ?? null,
          cancellation.order_id,
          cancellation.item_id,
          cancellation.variant_id ?? null,
          cancellation.company_id,
          cancellation.outlet_id,
          cancellation.cancelled_quantity,
          cancellation.reason,
          cancellation.cancelled_by_user_id ?? null,
          cancelledAtMysql,
          cancelledAtTs
        ]
      );

      results.push({ cancellation_id: cancellation.cancellation_id, result: "OK" });
    } catch (error) {
      console.error("Failed to process item cancellation", {
        correlation_id: correlationId,
        cancellation_id: cancellation.cancellation_id,
        error
      });
      results.push({
        cancellation_id: cancellation.cancellation_id,
        result: "ERROR",
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }
  }

  return results;
}
