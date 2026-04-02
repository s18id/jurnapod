// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Service Sessions Module - Lifecycle Operations
 *
 * Session lifecycle operations: getSession, listSessions, lockSessionForPayment, closeSession.
 */

import { sql } from "kysely";
import { getKysely } from "@jurnapod/db";
import type { KyselySchema } from "@jurnapod/db";
import {
  ServiceSessionStatus,
  TableEventType,
  TableOccupancyStatus,
} from "@jurnapod/shared";

import type {
  ServiceSession,
  SessionLine,
  ListSessionsParams,
  ListSessionsResult,
  LockSessionInput,
  CloseSessionInput,
  ServiceSessionDbRow,
  SessionLineDbRow,
} from "./types.js";
import {
  SessionNotFoundError,
  SessionConflictError,
  SessionValidationError,
  InvalidSessionStatusError,
} from "./types.js";

import {
  mapDbRowToServiceSession,
  mapDbRowToSessionLine,
  checkClientTxIdExists,
  getSessionWithConnection,
  getSessionLinesWithConnection,
  logSessionEvent,
  syncSnapshotLinesFromSession,
} from "./session-utils.js";

// ============================================================================
// READ-SIDE QUERIES
// ============================================================================

/**
 * Get a single service session by ID with lines
 * Strict company_id + outlet_id scoping enforced
 */
export async function getSession(
  db: KyselySchema,
  companyId: bigint,
  outletId: bigint,
  sessionId: bigint
): Promise<ServiceSession | null> {
  // Get session with table info - scoped to company + outlet
  const sessionRows = await sql<ServiceSessionDbRow>`
    SELECT 
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
    WHERE s.id = ${sessionId}
      AND s.company_id = ${companyId}
      AND s.outlet_id = ${outletId}
    LIMIT 1
  `.execute(db);

  if (sessionRows.rows.length === 0) {
    return null;
  }

  const sessionRow = sessionRows.rows[0];

  // Get session lines
  const lines = await getSessionLines(db, sessionId);

  return mapDbRowToServiceSession(sessionRow, lines);
}

/**
 * Get lines for a specific session
 * Scoped to session_id (company/outlet scoping via session lookup)
 */
export async function getSessionLines(
  db: KyselySchema,
  sessionId: bigint
): Promise<SessionLine[]> {
  const rows = await sql<SessionLineDbRow>`
    SELECT 
      id,
      session_id,
      line_number,
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
    WHERE session_id = ${sessionId}
    ORDER BY line_number ASC, id ASC
  `.execute(db);

  return rows.rows.map(mapDbRowToSessionLine);
}

/**
 * List service sessions with filtering and pagination
 * Strict company_id + outlet_id scoping enforced
 */
export async function listSessions(
  db: KyselySchema,
  params: ListSessionsParams
): Promise<ListSessionsResult> {
  const limit = params.limit ?? 20;
  const offset = params.offset ?? 0;

  // Build base WHERE clause parts
  const baseWhere = sql`s.company_id = ${params.companyId} AND s.outlet_id = ${params.outletId}`;
  
  // Build optional filter clauses
  let statusClause = sql``;
  if (params.statusId !== undefined) {
    statusClause = sql` AND s.status_id = ${params.statusId}`;
  }

  let tableClause = sql``;
  if (params.tableId !== undefined) {
    tableClause = sql` AND s.table_id = ${params.tableId}`;
  }

  let fromDateClause = sql``;
  if (params.fromDate !== undefined) {
    fromDateClause = sql` AND s.started_at >= ${params.fromDate}`;
  }

  let toDateClause = sql``;
  if (params.toDate !== undefined) {
    toDateClause = sql` AND s.started_at <= ${params.toDate}`;
  }

  // Count query
  const countResult = await sql<{ total: number }>`
    SELECT COUNT(*) as total 
    FROM table_service_sessions s 
    WHERE ${baseWhere}
      ${statusClause}
      ${tableClause}
      ${fromDateClause}
      ${toDateClause}
  `.execute(db);
  const total = Number(countResult.rows[0]?.total ?? 0);

  // List query
  const sessionRows = await sql<ServiceSessionDbRow>`
    SELECT 
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
    WHERE ${baseWhere}
      ${statusClause}
      ${tableClause}
      ${fromDateClause}
      ${toDateClause}
    ORDER BY s.started_at DESC, s.id DESC
    LIMIT ${limit} OFFSET ${offset}
  `.execute(db);

  // Fetch lines for all sessions
  const sessions: ServiceSession[] = [];
  for (const row of sessionRows.rows) {
    const lines = await getSessionLines(db, BigInt(row.id));
    sessions.push(mapDbRowToServiceSession(row, lines));
  }

  return {
    sessions,
    total,
    limit,
    offset
  };
}

// ============================================================================
// SESSION CONTROL OPERATIONS
// ============================================================================

/**
 * Lock a session for payment
 * Transitions: ACTIVE (1) -> LOCKED_FOR_PAYMENT (2)
 * Logs SESSION_LOCKED event to table_events
 * Idempotent: duplicate clientTxId returns existing session without mutation
 */
export async function lockSessionForPayment(
  db: KyselySchema,
  params: LockSessionInput
): Promise<ServiceSession> {
  return await db.transaction().execute(async (trx) => {
    // 1. Check idempotency - duplicate clientTxId?
    const isDuplicate = await checkClientTxIdExists(trx, params.companyId, params.outletId, params.clientTxId);
    if (isDuplicate) {
      // Return current session state (idempotency - return same result for same request)
      const sessionRow = await getSessionWithConnection(
        trx,
        params.companyId,
        params.outletId,
        params.sessionId
      );

      if (!sessionRow) {
        throw new SessionNotFoundError(params.sessionId);
      }

      const lines = await getSessionLinesWithConnection(trx, params.sessionId);

      return mapDbRowToServiceSession(sessionRow, lines);
    }

    // 2. Get current session with strict company/outlet scoping
    const sessionRow = await getSessionWithConnection(
      trx,
      params.companyId,
      params.outletId,
      params.sessionId
    );

    if (!sessionRow) {
      throw new SessionNotFoundError(params.sessionId);
    }

    const currentStatus = sessionRow.status_id;

    // 3. Validate status transition - must be ACTIVE
    if (currentStatus !== ServiceSessionStatus.ACTIVE) {
      throw new InvalidSessionStatusError(
        currentStatus,
        ServiceSessionStatus.ACTIVE,
        `Session must be ACTIVE to lock for payment. Current status: ${currentStatus}`
      );
    }

    // 4. Update session status to LOCKED_FOR_PAYMENT
    // Preserve existing snapshot link when not explicitly provided (COALESCE pattern)
    await sql`
      UPDATE table_service_sessions
       SET status_id = ${ServiceSessionStatus.LOCKED_FOR_PAYMENT},
           locked_at = NOW(),
           updated_at = NOW(),
           updated_by = ${params.updatedBy},
           notes = COALESCE(${params.notes ?? null}, notes),
           pos_order_snapshot_id = COALESCE(${params.posOrderSnapshotId ?? null}, pos_order_snapshot_id)
       WHERE id = ${params.sessionId}
         AND company_id = ${params.companyId}
         AND outlet_id = ${params.outletId}
         AND status_id = ${ServiceSessionStatus.ACTIVE}
    `.execute(trx);

    // 5. Log SESSION_LOCKED event to table_events
    await logSessionEvent(trx, {
      companyId: params.companyId,
      outletId: params.outletId,
      tableId: BigInt(sessionRow.table_id),
      sessionId: params.sessionId,
      eventTypeId: TableEventType.SESSION_LOCKED,
      clientTxId: params.clientTxId,
      eventData: {
        reason: "Session locked for payment",
        previousStatus: ServiceSessionStatus.ACTIVE,
        newStatus: ServiceSessionStatus.LOCKED_FOR_PAYMENT,
        notes: params.notes
      },
      createdBy: params.updatedBy
    });

    // 6. Return updated session with lines
    const lines = await getSessionLinesWithConnection(trx, params.sessionId);

    // Fetch updated session row
    const updatedRow = await getSessionWithConnection(
      trx,
      params.companyId,
      params.outletId,
      params.sessionId
    );

    if (!updatedRow) {
      throw new SessionNotFoundError(params.sessionId);
    }

    return mapDbRowToServiceSession(updatedRow, lines);
  });
}

/**
 * Close a session
 * Transitions: ACTIVE (1) or LOCKED_FOR_PAYMENT (2) -> CLOSED (3)
 * Atomic transaction that:
 * 1. Checks idempotency (duplicate clientTxId) and returns existing closed session if found
 * 2. Updates session status to CLOSED
 * 3. Finalizes pos_order_snapshots (persisted linkage from session state)
 * 4. Syncs session lines to pos_order_snapshot_lines
 * 5. Releases table occupancy
 * 6. Logs SESSION_CLOSED event
 */
export async function closeSession(
  db: KyselySchema,
  params: CloseSessionInput
): Promise<ServiceSession> {
  return await db.transaction().execute(async (trx) => {
    // 1. Check idempotency - duplicate clientTxId?
    const isDuplicate = await checkClientTxIdExists(trx, params.companyId, params.outletId, params.clientTxId);
    if (isDuplicate) {
      // Return existing closed session (idempotency - return same result for same request)
      const sessionRow = await getSessionWithConnection(
        trx,
        params.companyId,
        params.outletId,
        params.sessionId
      );

      if (!sessionRow) {
        throw new SessionNotFoundError(params.sessionId);
      }

      // Session already closed, return stable result
      if (sessionRow.status_id === ServiceSessionStatus.CLOSED) {
        const lines = await getSessionLinesWithConnection(trx, params.sessionId);
        return mapDbRowToServiceSession(sessionRow, lines);
      }

      // Duplicate transaction but session not closed - this is an error
      throw new SessionConflictError("Duplicate transaction but session not in CLOSED state");
    }

    // 2. Get current session with strict company/outlet scoping
    const sessionRow = await getSessionWithConnection(
      trx,
      params.companyId,
      params.outletId,
      params.sessionId
    );

    if (!sessionRow) {
      throw new SessionNotFoundError(params.sessionId);
    }

    const currentStatus = sessionRow.status_id;
    const validCloseStatuses: number[] = [ServiceSessionStatus.ACTIVE, ServiceSessionStatus.LOCKED_FOR_PAYMENT];

    // 3. Validate status transition - must be ACTIVE or LOCKED_FOR_PAYMENT
    if (!validCloseStatuses.includes(currentStatus)) {
      throw new InvalidSessionStatusError(
        currentStatus,
        validCloseStatuses,
        `Session must be ACTIVE or LOCKED_FOR_PAYMENT to close. Current status: ${currentStatus}`
      );
    }

    const snapshotId = sessionRow.pos_order_snapshot_id;

    // Validate that session has a persisted snapshot before closing
    // This ensures lock-payment was called and snapshot was created
    if (!snapshotId) {
      throw new SessionValidationError("Session must be locked with a finalized snapshot before closing");
    }

    // 4. Update session status to CLOSED
    await sql`
      UPDATE table_service_sessions
       SET status_id = ${ServiceSessionStatus.CLOSED},
           closed_at = NOW(),
           updated_at = NOW(),
           updated_by = ${params.updatedBy},
           notes = COALESCE(${params.notes ?? null}, notes)
       WHERE id = ${params.sessionId}
         AND company_id = ${params.companyId}
         AND outlet_id = ${params.outletId}
    `.execute(trx);

    // 5. Finalize pos_order_snapshots and sync lines if snapshot exists
    if (snapshotId) {
      // 5a. Finalize the snapshot header
      const snapshotUpdateResult = await sql`
        UPDATE pos_order_snapshots
         SET is_finalized = 1,
             order_state = 'CLOSED',
             order_status = 'COMPLETED',
             closed_at = NOW(),
             updated_at = NOW()
         WHERE order_id = ${snapshotId}
           AND company_id = ${params.companyId}
           AND outlet_id = ${params.outletId}
      `.execute(trx);

      if (Number(snapshotUpdateResult.numAffectedRows ?? 0n) === 0) {
        throw new SessionValidationError("Linked pos order snapshot not found for finalization");
      }

      // 5b. Sync session lines to pos_order_snapshot_lines
      await syncSnapshotLinesFromSession(trx, {
        snapshotId,
        companyId: params.companyId,
        outletId: params.outletId,
        sessionId: params.sessionId,
        onlyFinalized: false,
      });
    }

    // 6. Update table_occupancy to AVAILABLE and clear session reference
    await sql`
      UPDATE table_occupancy
       SET status_id = ${TableOccupancyStatus.AVAILABLE},
           service_session_id = NULL,
           guest_count = NULL,
           occupied_at = NULL,
           updated_at = NOW(),
           updated_by = ${params.updatedBy}
       WHERE table_id = ${sessionRow.table_id}
         AND company_id = ${params.companyId}
         AND outlet_id = ${params.outletId}
    `.execute(trx);

    // 7. Log SESSION_CLOSED event to table_events
    await logSessionEvent(trx, {
      companyId: params.companyId,
      outletId: params.outletId,
      tableId: BigInt(sessionRow.table_id),
      sessionId: params.sessionId,
      eventTypeId: TableEventType.SESSION_CLOSED,
      clientTxId: params.clientTxId,
      eventData: {
        reason: "Session closed",
        previousStatus: currentStatus,
        newStatus: ServiceSessionStatus.CLOSED,
        notes: params.notes,
        posOrderSnapshotId: snapshotId
      },
      createdBy: params.updatedBy
    });

    // 8. Return closed session with lines
    const lines = await getSessionLinesWithConnection(trx, params.sessionId);

    // Fetch updated session row
    const updatedRow = await getSessionWithConnection(
      trx,
      params.companyId,
      params.outletId,
      params.sessionId
    );

    if (!updatedRow) {
      throw new SessionNotFoundError(params.sessionId);
    }

    return mapDbRowToServiceSession(updatedRow, lines);
  });
}
