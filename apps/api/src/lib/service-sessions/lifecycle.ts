// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { getDbPool } from "../db";
import {
  ServiceSessionStatus,
  TableEventType,
  TableOccupancyStatus,
} from "@jurnapod/shared";

// Import types and error classes from types module
import type {
  ServiceSession,
  SessionLine,
  ListSessionsParams,
  ListSessionsResult,
  LockSessionInput,
  CloseSessionInput,
  ServiceSessionDbRow,
  SessionLineDbRow,
} from "./types";
import {
  SessionNotFoundError,
  SessionConflictError,
  SessionValidationError,
  InvalidSessionStatusError,
} from "./types";

// Re-export canonical helpers from session-utils (single source of truth)
export {
  mapDbRowToServiceSession,
  mapDbRowToSessionLine,
  checkClientTxIdExists,
  getSessionWithConnection,
  getSessionLineWithConnection,
  getSessionLinesWithConnection,
  logTableEventWithConnection,
  logSessionEvent,
  getSessionVersionWithConnection,
  syncSnapshotLinesFromSession,
  getSessionEvents,
  validateSessionModifiable,
  isValidSessionStateTransition,
  type SessionEvent,
} from "./session-utils";

// Import helpers for use within this module
import {
  mapDbRowToServiceSession,
  mapDbRowToSessionLine,
  checkClientTxIdExists,
  getSessionWithConnection,
  getSessionLinesWithConnection,
  logSessionEvent,
  syncSnapshotLinesFromSession,
} from "./session-utils";

// ============================================================================
// READ-SIDE QUERIES
// ============================================================================

/**
 * Get a single service session by ID with lines
 * Strict company_id + outlet_id scoping enforced
 */
export async function getSession(
  companyId: bigint,
  outletId: bigint,
  sessionId: bigint
): Promise<ServiceSession | null> {
  const pool = getDbPool();

  // Get session with table info - scoped to company + outlet
  const [sessionRows] = await pool.execute<ServiceSessionDbRow[]>(
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

  if (sessionRows.length === 0) {
    return null;
  }

  const sessionRow = sessionRows[0];

  // Get session lines
  const lines = await getSessionLines(sessionId);

  return mapDbRowToServiceSession(sessionRow, lines);
}

/**
 * List service sessions with filtering and pagination
 * Strict company_id + outlet_id scoping enforced
 */
export async function listSessions(
  params: ListSessionsParams
): Promise<ListSessionsResult> {
  const pool = getDbPool();

  const limit = params.limit ?? 20;
  const offset = params.offset ?? 0;

  // Build WHERE conditions with mandatory company + outlet scoping
  const whereConditions: string[] = [
    "s.company_id = ?",
    "s.outlet_id = ?"
  ];
  const queryParams: (bigint | number | string | Date)[] = [
    params.companyId,
    params.outletId
  ];

  // Optional filters
  if (params.statusId !== undefined) {
    whereConditions.push("s.status_id = ?");
    queryParams.push(params.statusId);
  }

  if (params.tableId !== undefined) {
    whereConditions.push("s.table_id = ?");
    queryParams.push(params.tableId);
  }

  if (params.fromDate !== undefined) {
    whereConditions.push("s.started_at >= ?");
    queryParams.push(params.fromDate);
  }

  if (params.toDate !== undefined) {
    whereConditions.push("s.started_at <= ?");
    queryParams.push(params.toDate);
  }

  // Get total count with same scoping
  const countSql = `
    SELECT COUNT(*) as total 
    FROM table_service_sessions s 
    WHERE ${whereConditions.join(" AND ")}
  `;
  const [countRows] = await pool.execute<RowDataPacket[]>(countSql, queryParams);
  const total = Number(countRows[0]?.total ?? 0);

  // Get sessions with pagination
  const dataParams = [...queryParams, limit, offset];
  const [sessionRows] = await pool.execute<ServiceSessionDbRow[]>(
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
    WHERE ${whereConditions.join(" AND ")}
    ORDER BY s.started_at DESC, s.id DESC
    LIMIT ? OFFSET ?`,
    dataParams
  );

  // Fetch lines for all sessions
  const sessions: ServiceSession[] = [];
  for (const row of sessionRows) {
    const lines = await getSessionLines(BigInt(row.id));
    sessions.push(mapDbRowToServiceSession(row, lines));
  }

  return {
    sessions,
    total,
    limit,
    offset
  };
}

/**
 * Get lines for a specific session
 * Scoped to session_id (company/outlet scoping via session lookup)
 */
export async function getSessionLines(sessionId: bigint): Promise<SessionLine[]> {
  const pool = getDbPool();

  const [rows] = await pool.execute<SessionLineDbRow[]>(
    `SELECT 
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
    WHERE session_id = ?
    ORDER BY line_number ASC, id ASC`,
    [sessionId]
  );

  return rows.map(mapDbRowToSessionLine);
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
  params: LockSessionInput
): Promise<ServiceSession> {
  const pool = getDbPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // 1. Check idempotency - duplicate clientTxId?
    const isDuplicate = await checkClientTxIdExists(connection, params.companyId, params.outletId, params.clientTxId);
    if (isDuplicate) {
      // Return current session state (idempotency - return same result for same request)
      const sessionRow = await getSessionWithConnection(
        connection,
        params.companyId,
        params.outletId,
        params.sessionId
      );

      if (!sessionRow) {
        throw new SessionNotFoundError(params.sessionId);
      }

      const lines = await getSessionLinesWithConnection(connection, params.sessionId);

      await connection.commit();

      return mapDbRowToServiceSession(sessionRow, lines);
    }

    // 2. Get current session with strict company/outlet scoping
    const sessionRow = await getSessionWithConnection(
      connection,
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
    await connection.execute<ResultSetHeader>(
      `UPDATE table_service_sessions
       SET status_id = ?,
           locked_at = NOW(),
           updated_at = NOW(),
           updated_by = ?,
           notes = COALESCE(?, notes),
           pos_order_snapshot_id = COALESCE(?, pos_order_snapshot_id)
       WHERE id = ?
         AND company_id = ?
         AND outlet_id = ?
         AND status_id = ?`,
      [
        ServiceSessionStatus.LOCKED_FOR_PAYMENT,
        params.updatedBy,
        params.notes ?? null,
        params.posOrderSnapshotId ?? null,
        params.sessionId,
        params.companyId,
        params.outletId,
        ServiceSessionStatus.ACTIVE
      ]
    );

    // 5. Log SESSION_LOCKED event to table_events
    await logSessionEvent(connection, {
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

    await connection.commit();

    // 6. Return updated session with lines
    const lines = await getSessionLinesWithConnection(connection, params.sessionId);

    // Fetch updated session row
    const updatedRow = await getSessionWithConnection(
      connection,
      params.companyId,
      params.outletId,
      params.sessionId
    );

    if (!updatedRow) {
      throw new SessionNotFoundError(params.sessionId);
    }

    return mapDbRowToServiceSession(updatedRow, lines);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
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
  params: CloseSessionInput
): Promise<ServiceSession> {
  const pool = getDbPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // 1. Check idempotency - duplicate clientTxId?
    const isDuplicate = await checkClientTxIdExists(connection, params.companyId, params.outletId, params.clientTxId);
    if (isDuplicate) {
      // Return existing closed session (idempotency - return same result for same request)
      const sessionRow = await getSessionWithConnection(
        connection,
        params.companyId,
        params.outletId,
        params.sessionId
      );

      if (!sessionRow) {
        throw new SessionNotFoundError(params.sessionId);
      }

      // Session already closed, return stable result
      if (sessionRow.status_id === ServiceSessionStatus.CLOSED) {
        const lines = await getSessionLinesWithConnection(connection, params.sessionId);
        await connection.commit();
        return mapDbRowToServiceSession(sessionRow, lines);
      }

      // Duplicate transaction but session not closed - this is an error
      throw new SessionConflictError("Duplicate transaction but session not in CLOSED state");
    }

    // 2. Get current session with strict company/outlet scoping
    const sessionRow = await getSessionWithConnection(
      connection,
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
    await connection.execute<ResultSetHeader>(
      `UPDATE table_service_sessions
       SET status_id = ?,
           closed_at = NOW(),
           updated_at = NOW(),
           updated_by = ?,
           notes = COALESCE(?, notes)
       WHERE id = ?
         AND company_id = ?
         AND outlet_id = ?`,
      [
        ServiceSessionStatus.CLOSED,
        params.updatedBy,
        params.notes ?? null,
        params.sessionId,
        params.companyId,
        params.outletId
      ]
    );

    // 5. Finalize pos_order_snapshots and sync lines if snapshot exists
    if (snapshotId) {
      // 5a. Finalize the snapshot header
      const [snapshotUpdateResult] = await connection.execute<ResultSetHeader>(
        `UPDATE pos_order_snapshots
         SET is_finalized = 1,
             order_state = 'CLOSED',
             order_status = 'COMPLETED',
             closed_at = NOW(),
             updated_at = NOW()
         WHERE order_id = ?
           AND company_id = ?
           AND outlet_id = ?`,
        [
          snapshotId,
          params.companyId,
          params.outletId
        ]
      );

      if (snapshotUpdateResult.affectedRows === 0) {
        throw new SessionValidationError("Linked pos order snapshot not found for finalization");
      }

      // 5b. Sync session lines to pos_order_snapshot_lines
      await syncSnapshotLinesFromSession(connection, {
        snapshotId,
        companyId: params.companyId,
        outletId: params.outletId,
        sessionId: params.sessionId,
        onlyFinalized: false,
      });
    }

    // 6. Update table_occupancy to AVAILABLE and clear session reference
    await connection.execute<ResultSetHeader>(
      `UPDATE table_occupancy
       SET status_id = ?,
           service_session_id = NULL,
           guest_count = NULL,
           occupied_at = NULL,
           updated_at = NOW(),
           updated_by = ?
       WHERE table_id = ?
         AND company_id = ?
         AND outlet_id = ?`,
      [
        TableOccupancyStatus.AVAILABLE,
        params.updatedBy,
        sessionRow.table_id,
        params.companyId,
        params.outletId
      ]
    );

    // 7. Log SESSION_CLOSED event to table_events
    await logSessionEvent(connection, {
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

    await connection.commit();

    // 8. Return closed session with lines
    const lines = await getSessionLinesWithConnection(connection, params.sessionId);

    // Fetch updated session row
    const updatedRow = await getSessionWithConnection(
      connection,
      params.companyId,
      params.outletId,
      params.sessionId
    );

    if (!updatedRow) {
      throw new SessionNotFoundError(params.sessionId);
    }

    return mapDbRowToServiceSession(updatedRow, lines);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}