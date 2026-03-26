// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { getDbPool } from "../db";
import {
  ServiceSessionStatus,
  ServiceSessionLineState,
  TableEventType,
} from "@jurnapod/shared";

// Import types and error classes from types module
import type {
  SessionLine,
  FinalizeSessionBatchInput,
  FinalizeSessionBatchResult,
  AdjustSessionLineInput,
  AdjustSessionLineResult,
} from "./types";
import {
  SessionNotFoundError,
  SessionConflictError,
  SessionValidationError,
  InvalidSessionStatusError,
} from "./types";

// Import canonical helpers from session-utils (single source of truth)
import {
  mapDbRowToSessionLine,
  checkClientTxIdExists,
  getSessionWithConnection,
  getSessionLineWithConnection,
  logSessionEvent,
  getSessionVersionWithConnection,
  syncSnapshotLinesFromSession,
} from "./session-utils";

// Re-export helpers for external use
export {
  mapDbRowToSessionLine,
  checkClientTxIdExists,
  getSessionWithConnection,
  getSessionLineWithConnection,
  logSessionEvent,
  getSessionVersionWithConnection,
  syncSnapshotLinesFromSession,
} from "./session-utils";

// ============================================================================
// CHECKPOINT OPERATIONS
// ============================================================================

/**
 * Finalize a batch of session lines
 * - Marks open lines as finalized
 * - Syncs to pos_order_snapshot_lines
 * - Logs SESSION_BATCH_FINALIZED event
 * - Idempotent: duplicate clientTxId returns existing checkpoint
 */
export async function finalizeSessionBatch(
  input: FinalizeSessionBatchInput
): Promise<FinalizeSessionBatchResult> {
  const pool = getDbPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [existingCheckpointRows] = await connection.execute<RowDataPacket[]>(
      `SELECT session_id, batch_no
       FROM table_service_session_checkpoints
       WHERE company_id = ?
         AND outlet_id = ?
         AND client_tx_id = ?
       LIMIT 1`,
      [input.companyId, input.outletId, input.clientTxId]
    );

    if (existingCheckpointRows.length > 0) {
      const batchNo = Number(existingCheckpointRows[0].batch_no);
      const sessionVersion = await getSessionVersionWithConnection(
        connection,
        input.companyId,
        input.outletId,
        BigInt(existingCheckpointRows[0].session_id)
      );
      const [countRows] = await connection.execute<RowDataPacket[]>(
        `SELECT COUNT(*) AS count
         FROM table_service_session_lines
         WHERE session_id = ?
           AND batch_no = ?
           AND is_voided = 0`,
        [input.sessionId, batchNo]
      );

      await connection.commit();
      return {
        sessionId: input.sessionId,
        batchNo,
        sessionVersion,
        syncedLinesCount: Number(countRows[0]?.count ?? 0)
      };
    }

    const sessionRow = await getSessionWithConnection(
      connection,
      input.companyId,
      input.outletId,
      input.sessionId
    );

    if (!sessionRow) {
      throw new SessionNotFoundError(input.sessionId);
    }

    if (sessionRow.status_id !== ServiceSessionStatus.ACTIVE) {
      throw new InvalidSessionStatusError(
        sessionRow.status_id,
        ServiceSessionStatus.ACTIVE,
        `Session must be ACTIVE to finalize batch. Current status: ${sessionRow.status_id}`
      );
    }

    const snapshotId = sessionRow.pos_order_snapshot_id;
    if (!snapshotId) {
      throw new SessionValidationError("Cannot finalize batch without linked pos order snapshot");
    }

    const [batchRows] = await connection.execute<RowDataPacket[]>(
      `SELECT COALESCE(last_finalized_batch_no, 0) + 1 AS next_batch_no
       FROM table_service_sessions
       WHERE id = ?
         AND company_id = ?
         AND outlet_id = ?
       LIMIT 1`,
      [input.sessionId, input.companyId, input.outletId]
    );
    const nextBatchNo = Number(batchRows[0]?.next_batch_no ?? 1);

    const [finalizeResult] = await connection.execute<ResultSetHeader>(
      `UPDATE table_service_session_lines
       SET batch_no = ?,
           line_state = ?,
           updated_at = NOW()
       WHERE session_id = ?
         AND is_voided = 0
         AND COALESCE(line_state, ?) = ?`,
      [
        nextBatchNo,
        ServiceSessionLineState.FINALIZED,
        input.sessionId,
        ServiceSessionLineState.OPEN,
        ServiceSessionLineState.OPEN
      ]
    );

    if (finalizeResult.affectedRows === 0) {
      throw new SessionValidationError("No open lines to finalize");
    }

    const syncedLinesCount = await syncSnapshotLinesFromSession(connection, {
      snapshotId,
      companyId: input.companyId,
      outletId: input.outletId,
      sessionId: input.sessionId,
      onlyFinalized: true,
    });

    await connection.execute(
      `INSERT INTO table_service_session_checkpoints
       (company_id, outlet_id, session_id, batch_no, snapshot_id, finalized_at, finalized_by, client_tx_id)
       VALUES (?, ?, ?, ?, ?, NOW(), ?, ?)`,
      [
        input.companyId,
        input.outletId,
        input.sessionId,
        nextBatchNo,
        snapshotId,
        input.updatedBy,
        input.clientTxId
      ]
    );

    await connection.execute(
      `UPDATE table_service_sessions
       SET last_finalized_batch_no = ?,
           session_version = COALESCE(session_version, 1) + 1,
           updated_at = NOW(),
           updated_by = ?
       WHERE id = ?
         AND company_id = ?
         AND outlet_id = ?`,
      [nextBatchNo, input.updatedBy, input.sessionId, input.companyId, input.outletId]
    );

    const sessionVersion = await getSessionVersionWithConnection(
      connection,
      input.companyId,
      input.outletId,
      input.sessionId
    );

    await logSessionEvent(connection, {
      companyId: input.companyId,
      outletId: input.outletId,
      tableId: BigInt(sessionRow.table_id),
      sessionId: input.sessionId,
      eventTypeId: TableEventType.SESSION_BATCH_FINALIZED,
      clientTxId: input.clientTxId,
      eventData: {
        batchNo: nextBatchNo,
        syncedLinesCount,
        snapshotId,
        notes: input.notes ?? null,
      },
      createdBy: input.updatedBy,
    });

    await connection.commit();

    return {
      sessionId: input.sessionId,
      batchNo: nextBatchNo,
      sessionVersion,
      syncedLinesCount,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Adjust a session line quantity
 * - CANCEL: void the line entirely
 * - REDUCE_QTY: reduce quantity by qtyDelta (qtyDelta must be < current quantity)
 * - Idempotent: duplicate clientTxId returns existing line state
 */
export async function adjustSessionLine(
  input: AdjustSessionLineInput
): Promise<AdjustSessionLineResult> {
  const pool = getDbPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const isDuplicate = await checkClientTxIdExists(connection, input.companyId, input.outletId, input.clientTxId);
    if (isDuplicate) {
      const lineOnRetry = await getSessionLineWithConnection(
        connection,
        input.companyId,
        input.outletId,
        input.sessionId,
        input.lineId
      );
      const sessionVersion = await getSessionVersionWithConnection(
        connection,
        input.companyId,
        input.outletId,
        input.sessionId
      );

      await connection.commit();

      if (!lineOnRetry) {
        throw new SessionConflictError("Duplicate adjust transaction but line not found");
      }
      return {
        line: mapDbRowToSessionLine(lineOnRetry),
        sessionVersion,
      };
    }

    const sessionRow = await getSessionWithConnection(
      connection,
      input.companyId,
      input.outletId,
      input.sessionId
    );

    if (!sessionRow) {
      throw new SessionNotFoundError(input.sessionId);
    }

    if (sessionRow.status_id !== ServiceSessionStatus.ACTIVE) {
      throw new InvalidSessionStatusError(
        sessionRow.status_id,
        ServiceSessionStatus.ACTIVE,
        `Cannot adjust line in session with status ${sessionRow.status_id}`
      );
    }

    const existingLine = await getSessionLineWithConnection(
      connection,
      input.companyId,
      input.outletId,
      input.sessionId,
      input.lineId
    );

    if (!existingLine) {
      throw new SessionNotFoundError(`Line ${input.lineId} in session ${input.sessionId}`);
    }

    if (existingLine.is_voided === 1) {
      throw new SessionValidationError("Cannot adjust a voided line");
    }

    const currentLineState = Number(existingLine.line_state ?? ServiceSessionLineState.OPEN);

    if (input.action === "CANCEL") {
      await connection.execute(
        `UPDATE table_service_session_lines
         SET is_voided = 1,
             voided_at = NOW(),
             void_reason = ?,
             line_state = ?,
             updated_at = NOW()
         WHERE id = ?`,
        [input.reason, ServiceSessionLineState.VOIDED, input.lineId]
      );
    } else {
      if (!input.qtyDelta || input.qtyDelta <= 0) {
        throw new SessionValidationError("qtyDelta is required for REDUCE_QTY adjustment");
      }
      if (input.qtyDelta >= existingLine.quantity) {
        throw new SessionValidationError("qtyDelta must be less than current quantity");
      }

      const newQuantity = existingLine.quantity - input.qtyDelta;
      const unitPrice = parseFloat(existingLine.unit_price);
      const currentDiscount = parseFloat(existingLine.discount_amount);
      const currentTax = parseFloat(existingLine.tax_amount);
      const perUnitDiscount = currentDiscount / existingLine.quantity;
      const perUnitTax = currentTax / existingLine.quantity;
      const newDiscount = perUnitDiscount * newQuantity;
      const newTax = perUnitTax * newQuantity;
      const newLineTotal = (newQuantity * unitPrice) - newDiscount + newTax;

      await connection.execute(
        `UPDATE table_service_session_lines
         SET quantity = ?,
             discount_amount = ?,
             tax_amount = ?,
             line_total = ?,
             updated_at = NOW()
         WHERE id = ?`,
        [newQuantity, newDiscount, newTax, newLineTotal, input.lineId]
      );
    }

    await connection.execute(
      `UPDATE table_service_sessions
       SET session_version = COALESCE(session_version, 1) + 1,
           updated_at = NOW(),
           updated_by = ?
       WHERE id = ?
         AND company_id = ?
         AND outlet_id = ?`,
      [input.updatedBy, input.sessionId, input.companyId, input.outletId]
    );

    const snapshotId = sessionRow.pos_order_snapshot_id;
    if (snapshotId && currentLineState === ServiceSessionLineState.FINALIZED) {
      await syncSnapshotLinesFromSession(connection, {
        snapshotId,
        companyId: input.companyId,
        outletId: input.outletId,
        sessionId: input.sessionId,
        onlyFinalized: true,
      });
    }

    const sessionVersion = await getSessionVersionWithConnection(
      connection,
      input.companyId,
      input.outletId,
      input.sessionId
    );

    await logSessionEvent(connection, {
      companyId: input.companyId,
      outletId: input.outletId,
      tableId: BigInt(sessionRow.table_id),
      sessionId: input.sessionId,
      eventTypeId: TableEventType.SESSION_LINE_UPDATED,
      clientTxId: input.clientTxId,
      eventData: {
        lineId: input.lineId.toString(),
        action: input.action,
        ...(input.action === "CANCEL" && { reason: input.reason }),
        ...(input.action === "REDUCE_QTY" && { qtyDelta: input.qtyDelta }),
      },
      createdBy: input.updatedBy,
    });

    await connection.commit();

    const updatedLine = await getSessionLineWithConnection(
      connection,
      input.companyId,
      input.outletId,
      input.sessionId,
      input.lineId
    );

    if (!updatedLine) {
      throw new SessionNotFoundError(`Line ${input.lineId} in session ${input.sessionId}`);
    }

    return {
      line: mapDbRowToSessionLine(updatedLine),
      sessionVersion,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}