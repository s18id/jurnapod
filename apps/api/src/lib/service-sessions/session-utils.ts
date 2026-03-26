// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Service Sessions Shared Utilities
 *
 * Single source of truth for all helper functions used across service-sessions sub-modules.
 * Contains canonical mappers and shared transaction helpers.
 */

import type { ResultSetHeader, RowDataPacket } from "mysql2";
import type { PoolConnection } from "mysql2/promise";
import {
  ServiceSessionStatus,
  ServiceSessionLineState,
  TableEventTypeLabels,
  type ServiceSessionStatusType,
} from "@jurnapod/shared";
import type {
  ServiceSession,
  SessionLine,
  ServiceSessionDbRow,
  SessionLineDbRow,
} from "./types";
import {
  SessionNotFoundError,
  SessionConflictError,
} from "./types";

// ============================================================================
// CANONICAL MAPPERS (single source of truth)
// ============================================================================

/**
 * Map a database row to a ServiceSession object with type conversions.
 * DB dates are strings, session lines are provided separately.
 */
export function mapDbRowToServiceSession(
  row: ServiceSessionDbRow,
  lines: SessionLine[]
): ServiceSession {
  const statusLabels: Record<number, string> = {
    [ServiceSessionStatus.ACTIVE]: "Active",
    [ServiceSessionStatus.LOCKED_FOR_PAYMENT]: "Locked for Payment",
    [ServiceSessionStatus.CLOSED]: "Closed"
  };

  return {
    id: BigInt(row.id),
    companyId: BigInt(row.company_id),
    outletId: BigInt(row.outlet_id),
    tableId: BigInt(row.table_id),
    tableCode: row.table_code,
    tableName: row.table_name,
    statusId: row.status_id as ServiceSessionStatusType,
    statusLabel: statusLabels[row.status_id] || "Unknown",
    startedAt: new Date(row.started_at),
    lockedAt: row.locked_at ? new Date(row.locked_at) : null,
    closedAt: row.closed_at ? new Date(row.closed_at) : null,
    guestCount: row.guest_count,
    guestName: row.guest_name,
    notes: row.notes,
    posOrderSnapshotId: row.pos_order_snapshot_id,
    reservationId: row.reservation_id ? BigInt(row.reservation_id) : null,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    lines
  };
}

/**
 * Map a database row to a SessionLine object with type conversions.
 * DB DECIMAL values come as strings and need parseFloat conversion.
 */
export function mapDbRowToSessionLine(row: SessionLineDbRow): SessionLine {
  return {
    id: BigInt(row.id),
    sessionId: BigInt(row.session_id),
    lineNumber: row.line_number,
    lineState: row.line_state ?? ServiceSessionLineState.OPEN,
    productId: BigInt(row.product_id),
    productName: row.product_name,
    productSku: row.product_sku,
    quantity: row.quantity,
    unitPrice: parseFloat(row.unit_price),
    discountAmount: parseFloat(row.discount_amount),
    taxAmount: parseFloat(row.tax_amount),
    lineTotal: parseFloat(row.line_total),
    notes: row.notes,
    isVoided: row.is_voided === 1,
    voidedAt: row.voided_at ? new Date(row.voided_at) : null,
    voidReason: row.void_reason,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at)
  };
}

// ============================================================================
// SESSION EVENT TYPES
// ============================================================================

export interface SessionEvent {
  id: bigint;
  eventTypeId: number;
  eventTypeLabel: string;
  clientTxId: string;
  eventData: Record<string, unknown> | null;
  occurredAt: Date;
  createdBy: string;
}

interface SessionEventDbRow extends RowDataPacket {
  id: number;
  event_type_id: number;
  client_tx_id: string;
  event_data: string | null;
  occurred_at: string;
  created_by: string;
}

// ============================================================================
// IDEMPOTENCY HELPERS
// ============================================================================

/**
 * Check if a client transaction ID already exists in table_events.
 * Used for idempotency - duplicate clientTxId means this operation was already processed.
 */
export async function checkClientTxIdExists(
  connection: PoolConnection,
  companyId: bigint,
  outletId: bigint,
  clientTxId: string
): Promise<boolean> {
  const [rows] = await connection.execute<RowDataPacket[]>(
    `SELECT id FROM table_events WHERE company_id = ? AND outlet_id = ? AND client_tx_id = ? LIMIT 1`,
    [companyId, outletId, clientTxId]
  );
  return rows.length > 0;
}

// ============================================================================
// SESSION SCOPING HELPERS (transaction-aware)
// ============================================================================

/**
 * Get session DB row within a transaction context.
 * Strict company_id + outlet_id scoping enforced.
 * Uses outlet_tables JOIN to get table info.
 */
export async function getSessionWithConnection(
  connection: PoolConnection,
  companyId: bigint,
  outletId: bigint,
  sessionId: bigint
): Promise<ServiceSessionDbRow | null> {
  const [rows] = await connection.execute<ServiceSessionDbRow[]>(
    `SELECT 
      s.id,
      s.company_id,
      s.outlet_id,
      s.table_id,
      ot.code as table_code,
      ot.name as table_name,
      s.status_id,
      s.started_at,
      s.locked_at,
      s.closed_at,
      s.guest_count,
      s.guest_name,
      s.notes,
      s.pos_order_snapshot_id,
      s.reservation_id,
      s.created_by,
      s.updated_by,
      s.created_at,
      s.updated_at
    FROM table_service_sessions s
    LEFT JOIN outlet_tables ot ON s.table_id = ot.id
      AND s.company_id = ot.company_id
      AND s.outlet_id = ot.outlet_id
    WHERE s.id = ?
      AND s.company_id = ?
      AND s.outlet_id = ?
    LIMIT 1`,
    [sessionId, companyId, outletId]
  );

  return rows.length > 0 ? rows[0] : null;
}

/**
 * Get session line with connection for transaction context.
 * Scoped to session_id with company/outlet scoping via JOIN on table_service_sessions.
 */
export async function getSessionLineWithConnection(
  connection: PoolConnection,
  companyId: bigint,
  outletId: bigint,
  sessionId: bigint,
  lineId: bigint
): Promise<SessionLineDbRow | null> {
  const [rows] = await connection.execute<SessionLineDbRow[]>(
    `SELECT 
      l.id,
      l.session_id,
      l.line_number,
      l.line_state,
      l.product_id,
      l.product_name,
      l.product_sku,
      l.quantity,
      l.unit_price,
      l.discount_amount,
      l.tax_amount,
      l.line_total,
      l.notes,
      l.is_voided,
      l.voided_at,
      l.void_reason,
      l.created_at,
      l.updated_at
    FROM table_service_session_lines l
    INNER JOIN table_service_sessions s ON l.session_id = s.id
      AND s.company_id = ?
      AND s.outlet_id = ?
    WHERE l.id = ?
      AND l.session_id = ?
    LIMIT 1`,
    [companyId, outletId, lineId, sessionId]
  );

  return rows.length > 0 ? rows[0] : null;
}

/**
 * Get all session lines within a transaction context.
 * Returns all lines for a session (no line_id filter).
 */
export async function getSessionLinesWithConnection(
  connection: PoolConnection,
  sessionId: bigint
): Promise<SessionLine[]> {
  const [rows] = await connection.execute<SessionLineDbRow[]>(
    `SELECT 
      id,
      session_id,
      line_number,
      line_state,
      product_id,
      product_name,
      product_sku,
      quantity,
      unit_price,
      discount_amount,
      tax_amount,
      line_total,
      notes,
      is_voided,
      voided_at,
      void_reason,
      created_at,
      updated_at
    FROM table_service_session_lines
    WHERE session_id = ?
    ORDER BY line_number ASC, id ASC`,
    [sessionId]
  );

  return rows.map(mapDbRowToSessionLine);
}

// ============================================================================
// EVENT LOGGING HELPERS
// ============================================================================

/**
 * Log a table event within a transaction.
 * Used for session line mutations (add/update/remove).
 */
export async function logTableEventWithConnection(
  connection: PoolConnection,
  event: {
    companyId: bigint;
    outletId: bigint;
    tableId: bigint;
    eventTypeId: number;
    clientTxId: string;
    serviceSessionId: bigint;
    eventData: Record<string, unknown> | null;
    createdBy: string;
  }
): Promise<void> {
  await connection.execute(
    `INSERT INTO table_events
     (company_id, outlet_id, table_id, event_type_id, client_tx_id,
      service_session_id, event_data, occurred_at, created_at, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW(), ?)`,
    [
      event.companyId,
      event.outletId,
      event.tableId,
      event.eventTypeId,
      event.clientTxId,
      event.serviceSessionId,
      event.eventData ? JSON.stringify(event.eventData) : null,
      event.createdBy
    ]
  );
}

/**
 * Log a session event within a transaction.
 * Used for lifecycle operations (lock, close, batch finalize).
 */
export async function logSessionEvent(
  connection: PoolConnection,
  event: {
    companyId: bigint;
    outletId: bigint;
    tableId: bigint;
    sessionId: bigint;
    eventTypeId: number;
    clientTxId: string;
    eventData: Record<string, unknown> | null;
    createdBy: string;
  }
): Promise<void> {
  await connection.execute(
    `INSERT INTO table_events
     (company_id, outlet_id, table_id, event_type_id, client_tx_id,
      service_session_id, event_data, occurred_at, created_at, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW(), ?)`,
    [
      event.companyId,
      event.outletId,
      event.tableId,
      event.eventTypeId,
      event.clientTxId,
      event.sessionId,
      event.eventData ? JSON.stringify(event.eventData) : null,
      event.createdBy
    ]
  );
}

// ============================================================================
// VERSION HELPERS
// ============================================================================

/**
 * Get session version for optimistic concurrency control.
 */
export async function getSessionVersionWithConnection(
  connection: PoolConnection,
  companyId: bigint,
  outletId: bigint,
  sessionId: bigint
): Promise<number> {
  const [rows] = await connection.execute<RowDataPacket[]>(
    `SELECT COALESCE(session_version, 1) AS session_version
     FROM table_service_sessions
     WHERE id = ?
       AND company_id = ?
       AND outlet_id = ?
     LIMIT 1`,
    [sessionId, companyId, outletId]
  );

  return rows.length > 0 ? Number(rows[0].session_version) : 1;
}

// ============================================================================
// SNAPSHOT SYNC HELPERS
// ============================================================================

/**
 * Sync session lines to pos_order_snapshot_lines.
 * Called during batch finalization and session close.
 */
export async function syncSnapshotLinesFromSession(
  connection: PoolConnection,
  params: {
    snapshotId: string;
    companyId: bigint;
    outletId: bigint;
    sessionId: bigint;
    onlyFinalized: boolean;
  }
): Promise<number> {
  await connection.execute(
    `DELETE FROM pos_order_snapshot_lines
     WHERE order_id = ?
       AND company_id = ?
       AND outlet_id = ?`,
    [params.snapshotId, params.companyId, params.outletId]
  );

  const finalizedFilter = params.onlyFinalized ? "AND COALESCE(l.line_state, 1) = ?" : "";
  // Snapshot-line timestamp semantics for service-session aggregation:
  // - updated_at / updated_at_ts: snapshot freshness, derived from the latest source line update
  // - created_at_ts: removed per ADR-0001 / Story 18.1 (created_at is retained)
  //
  // This path does not have source `_ts` columns, but it does have source `updated_at` DATETIME.
  // We therefore derive freshness from MAX(l.updated_at) rather than fabricating chronology.
  const [insertResult] = await connection.execute<ResultSetHeader>(
    `INSERT INTO pos_order_snapshot_lines
     (order_id, company_id, outlet_id, item_id, sku_snapshot, name_snapshot,
      item_type_snapshot, unit_price_snapshot, qty, discount_amount, updated_at, updated_at_ts)
     SELECT
       ? AS order_id,
       ? AS company_id,
       ? AS outlet_id,
       l.product_id AS item_id,
       MAX(l.product_sku) AS sku_snapshot,
       MAX(l.product_name) AS name_snapshot,
       'PRODUCT' AS item_type_snapshot,
       ROUND(MAX(l.unit_price), 2) AS unit_price_snapshot,
       SUM(l.quantity) AS qty,
       ROUND(SUM(l.discount_amount), 2) AS discount_amount,
       MAX(l.updated_at) AS updated_at,
       UNIX_TIMESTAMP(MAX(l.updated_at)) * 1000 AS updated_at_ts
     FROM table_service_session_lines l
     WHERE l.session_id = ?
       AND l.is_voided = 0
       ${finalizedFilter}
     GROUP BY l.product_id`,
    [
      params.snapshotId,
      params.companyId,
      params.outletId,
      params.sessionId,
      ...(params.onlyFinalized ? [ServiceSessionLineState.FINALIZED] : [])
    ]
  );

  return insertResult.affectedRows;
}

// ============================================================================
// SESSION EVENTS QUERY
// ============================================================================

/**
 * Get recent events for a specific session.
 * Returns last N events ordered by occurred_at DESC.
 */
export async function getSessionEvents(
  companyId: bigint,
  outletId: bigint,
  sessionId: bigint,
  limit: number = 20
): Promise<SessionEvent[]> {
  const { getDbPool } = await import("../db");
  const pool = getDbPool();

  const [rows] = await pool.execute<SessionEventDbRow[]>(
    `SELECT 
      id,
      event_type_id,
      client_tx_id,
      event_data,
      occurred_at,
      created_by
    FROM table_events
    WHERE company_id = ? 
      AND outlet_id = ? 
      AND service_session_id = ?
    ORDER BY occurred_at DESC, id DESC
    LIMIT ?`,
    [companyId, outletId, sessionId, limit]
  );

  return rows.map(row => ({
    id: BigInt(row.id),
    eventTypeId: row.event_type_id,
    eventTypeLabel: TableEventTypeLabels[row.event_type_id as keyof typeof TableEventTypeLabels] || "Unknown",
    clientTxId: row.client_tx_id,
    eventData: row.event_data ? JSON.parse(row.event_data) : null,
    occurredAt: new Date(row.occurred_at),
    createdBy: row.created_by
  }));
}

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

/**
 * Validate that a session can be modified (not locked or closed).
 * Throws appropriate errors if validation fails.
 */
export function validateSessionModifiable(
  session: ServiceSession,
  operation: string
): void {
  if (session.statusId === ServiceSessionStatus.LOCKED_FOR_PAYMENT) {
    throw new SessionConflictError(
      `Cannot ${operation}: Session is locked for payment`
    );
  }

  if (session.statusId === ServiceSessionStatus.CLOSED) {
    throw new SessionConflictError(
      `Cannot ${operation}: Session is closed`
    );
  }
}

/**
 * Validate session state transition.
 * Returns true if transition is valid, false otherwise.
 */
export function isValidSessionStateTransition(
  fromStatus: number,
  toStatus: number
): boolean {
  // ACTIVE -> LOCKED_FOR_PAYMENT -> CLOSED is the normal flow
  // ACTIVE can also go directly to CLOSED

  if (fromStatus === ServiceSessionStatus.ACTIVE) {
    return toStatus === ServiceSessionStatus.LOCKED_FOR_PAYMENT ||
           toStatus === ServiceSessionStatus.CLOSED;
  }

  if (fromStatus === ServiceSessionStatus.LOCKED_FOR_PAYMENT) {
    return toStatus === ServiceSessionStatus.CLOSED ||
           toStatus === ServiceSessionStatus.ACTIVE; // Unlock
  }

  // CLOSED is terminal
  if (fromStatus === ServiceSessionStatus.CLOSED) {
    return false;
  }

  return false;
}