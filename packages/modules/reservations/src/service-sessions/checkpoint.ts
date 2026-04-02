// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Service Sessions Module - Checkpoint Operations
 *
 * Batch checkpoint operations: finalizeSessionBatch, adjustSessionLine.
 */

import { sql } from "kysely";
import { getKysely } from "@jurnapod/db";
import type { KyselySchema } from "@jurnapod/db";
import {
  ServiceSessionStatus,
  ServiceSessionLineState,
  TableEventType,
} from "@jurnapod/shared";

import type {
  SessionLine,
  FinalizeSessionBatchInput,
  FinalizeSessionBatchResult,
  AdjustSessionLineInput,
  AdjustSessionLineResult,
} from "./types.js";
import {
  SessionNotFoundError,
  SessionConflictError,
  SessionValidationError,
  InvalidSessionStatusError,
} from "./types.js";

import {
  mapDbRowToSessionLine,
  checkClientTxIdExists,
  getSessionWithConnection,
  getSessionLineWithConnection,
  logSessionEvent,
  getSessionVersionWithConnection,
  syncSnapshotLinesFromSession,
} from "./session-utils.js";

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
  db: KyselySchema,
  input: FinalizeSessionBatchInput
): Promise<FinalizeSessionBatchResult> {
  return await db.transaction().execute(async (trx) => {
    const existingCheckpointRows = await sql<{ session_id: number; batch_no: number }>`
      SELECT session_id, batch_no
      FROM table_service_session_checkpoints
      WHERE company_id = ${input.companyId}
        AND outlet_id = ${input.outletId}
        AND client_tx_id = ${input.clientTxId}
      LIMIT 1
    `.execute(trx);

    if (existingCheckpointRows.rows.length > 0) {
      const batchNo = Number(existingCheckpointRows.rows[0].batch_no);
      const sessionVersion = await getSessionVersionWithConnection(
        trx,
        input.companyId,
        input.outletId,
        BigInt(existingCheckpointRows.rows[0].session_id)
      );
      const countResult = await sql<{ count: number }>`
        SELECT COUNT(*) AS count
        FROM table_service_session_lines
        WHERE session_id = ${input.sessionId}
          AND batch_no = ${batchNo}
          AND is_voided = 0
      `.execute(trx);

      return {
        sessionId: input.sessionId,
        batchNo,
        sessionVersion,
        syncedLinesCount: Number(countResult.rows[0]?.count ?? 0)
      };
    }

    const sessionRow = await getSessionWithConnection(
      trx,
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

    const batchResult = await sql<{ next_batch_no: number }>`
      SELECT COALESCE(last_finalized_batch_no, 0) + 1 AS next_batch_no
      FROM table_service_sessions
      WHERE id = ${input.sessionId}
        AND company_id = ${input.companyId}
        AND outlet_id = ${input.outletId}
      LIMIT 1
    `.execute(trx);
    const nextBatchNo = Number(batchResult.rows[0]?.next_batch_no ?? 1);

    const finalizeResult = await sql`
      UPDATE table_service_session_lines
       SET batch_no = ${nextBatchNo},
           line_state = ${ServiceSessionLineState.FINALIZED},
           updated_at = NOW()
       WHERE session_id = ${input.sessionId}
         AND is_voided = 0
         AND COALESCE(line_state, ${ServiceSessionLineState.OPEN}) = ${ServiceSessionLineState.OPEN}
    `.execute(trx);

    if (Number(finalizeResult.numAffectedRows ?? 0n) === 0) {
      throw new SessionValidationError("No open lines to finalize");
    }

    const syncedLinesCount = await syncSnapshotLinesFromSession(trx, {
      snapshotId,
      companyId: input.companyId,
      outletId: input.outletId,
      sessionId: input.sessionId,
      onlyFinalized: true,
    });

    await sql`
      INSERT INTO table_service_session_checkpoints
       (company_id, outlet_id, session_id, batch_no, snapshot_id, finalized_at, finalized_by, client_tx_id)
       VALUES (
         ${input.companyId},
         ${input.outletId},
         ${input.sessionId},
         ${nextBatchNo},
         ${snapshotId},
         NOW(),
         ${input.updatedBy},
         ${input.clientTxId}
       )
    `.execute(trx);

    await sql`
      UPDATE table_service_sessions
       SET last_finalized_batch_no = ${nextBatchNo},
           session_version = COALESCE(session_version, 1) + 1,
           updated_at = NOW(),
           updated_by = ${input.updatedBy}
       WHERE id = ${input.sessionId}
         AND company_id = ${input.companyId}
         AND outlet_id = ${input.outletId}
    `.execute(trx);

    const sessionVersion = await getSessionVersionWithConnection(
      trx,
      input.companyId,
      input.outletId,
      input.sessionId
    );

    await logSessionEvent(trx, {
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

    return {
      sessionId: input.sessionId,
      batchNo: nextBatchNo,
      sessionVersion,
      syncedLinesCount,
    };
  });
}

/**
 * Adjust a session line quantity
 * - CANCEL: void the line entirely
 * - REDUCE_QTY: reduce quantity by qtyDelta (qtyDelta must be < current quantity)
 * - Idempotent: duplicate clientTxId returns existing line state
 */
export async function adjustSessionLine(
  db: KyselySchema,
  input: AdjustSessionLineInput
): Promise<AdjustSessionLineResult> {
  return await db.transaction().execute(async (trx) => {
    const isDuplicate = await checkClientTxIdExists(trx, input.companyId, input.outletId, input.clientTxId);
    if (isDuplicate) {
      const lineOnRetry = await getSessionLineWithConnection(
        trx,
        input.companyId,
        input.outletId,
        input.sessionId,
        input.lineId
      );
      const sessionVersion = await getSessionVersionWithConnection(
        trx,
        input.companyId,
        input.outletId,
        input.sessionId
      );

      if (!lineOnRetry) {
        throw new SessionConflictError("Duplicate adjust transaction but line not found");
      }
      return {
        line: mapDbRowToSessionLine(lineOnRetry),
        sessionVersion,
      };
    }

    const sessionRow = await getSessionWithConnection(
      trx,
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
      trx,
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
      await sql`
        UPDATE table_service_session_lines
         SET is_voided = 1,
             voided_at = NOW(),
             void_reason = ${input.reason},
             line_state = ${ServiceSessionLineState.VOIDED},
             updated_at = NOW()
         WHERE id = ${input.lineId}
      `.execute(trx);
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

      await sql`
        UPDATE table_service_session_lines
         SET quantity = ${newQuantity},
             discount_amount = ${newDiscount},
             tax_amount = ${newTax},
             line_total = ${newLineTotal},
             updated_at = NOW()
         WHERE id = ${input.lineId}
      `.execute(trx);
    }

    await sql`
      UPDATE table_service_sessions
       SET session_version = COALESCE(session_version, 1) + 1,
           updated_at = NOW(),
           updated_by = ${input.updatedBy}
       WHERE id = ${input.sessionId}
         AND company_id = ${input.companyId}
         AND outlet_id = ${input.outletId}
    `.execute(trx);

    const snapshotId = sessionRow.pos_order_snapshot_id;
    if (snapshotId && currentLineState === ServiceSessionLineState.FINALIZED) {
      await syncSnapshotLinesFromSession(trx, {
        snapshotId,
        companyId: input.companyId,
        outletId: input.outletId,
        sessionId: input.sessionId,
        onlyFinalized: true,
      });
    }

    const sessionVersion = await getSessionVersionWithConnection(
      trx,
      input.companyId,
      input.outletId,
      input.sessionId
    );

    await logSessionEvent(trx, {
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

    const updatedLine = await getSessionLineWithConnection(
      trx,
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
  });
}
