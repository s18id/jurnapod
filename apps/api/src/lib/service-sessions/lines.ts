// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { getDbPool } from "@/lib/db";
import {
  ServiceSessionStatus,
  TableEventType,
} from "@jurnapod/shared";

import type {
  SessionLine,
  AddSessionLineInput,
  UpdateSessionLineInput,
  RemoveSessionLineInput,
  SessionLineDbRow,
} from "./types";
import {
  SessionNotFoundError,
  SessionConflictError,
  InvalidSessionStatusError,
} from "./types";

// Import canonical helpers from session-utils (single source of truth)
import {
  mapDbRowToSessionLine,
  checkClientTxIdExists,
  getSessionWithConnection,
  getSessionLineWithConnection,
  logTableEventWithConnection,
} from "./session-utils";

// Re-export helpers for external use
export {
  mapDbRowToSessionLine,
  checkClientTxIdExists,
  getSessionWithConnection,
  getSessionLineWithConnection,
  logTableEventWithConnection,
} from "./session-utils";

// ============================================================================
// SESSION LINE MUTATIONS
// ============================================================================

/**
 * Add a line to a service session
 * - Checks session status is ACTIVE
 * - Idempotent via clientTxId check
 * - Inserts into table_service_session_lines
 * - Logs SESSION_LINE_ADDED event
 * - Lines are synced to pos_order_snapshot_lines on session close
 */
export async function addSessionLine(
  input: AddSessionLineInput
): Promise<SessionLine> {
  const pool = getDbPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // 1. Check idempotency - duplicate clientTxId?
    const isDuplicate = await checkClientTxIdExists(connection, input.companyId, input.outletId, input.clientTxId);
    if (isDuplicate) {
      // Deterministic replay: resolve original line_id from the original
      // SESSION_LINE_ADDED event payload for this exact session.
      const [eventRows] = await connection.execute<RowDataPacket[]>(
        `SELECT CAST(JSON_UNQUOTE(JSON_EXTRACT(e.event_data, '$.lineId')) AS UNSIGNED) AS line_id
         FROM table_events e
         WHERE e.company_id = ?
           AND e.outlet_id = ?
           AND e.client_tx_id = ?
           AND e.service_session_id = ?
           AND e.event_type_id = ?
         LIMIT 1`,
        [
          input.companyId,
          input.outletId,
          input.clientTxId,
          input.sessionId,
          TableEventType.SESSION_LINE_ADDED,
        ]
      );

      await connection.commit();

      if (eventRows.length === 0) {
        throw new SessionConflictError("Duplicate transaction belongs to a different session");
      }

      const originalLineId = eventRows[0]?.line_id;
      if (originalLineId === undefined || originalLineId === null) {
        throw new SessionConflictError("Duplicate transaction found but original line reference missing");
      }

      const [existingRows] = await pool.execute<SessionLineDbRow[]>(
        `SELECT * FROM table_service_session_lines
         WHERE id = ? AND session_id = ?
         LIMIT 1`,
        [originalLineId, input.sessionId]
      );

      if (existingRows.length > 0) {
        return mapDbRowToSessionLine(existingRows[0]);
      }

      throw new SessionConflictError("Duplicate transaction found but original line not found");
    }

    // 2. Get session with company/outlet scoping
    const sessionRow = await getSessionWithConnection(
      connection,
      input.companyId,
      input.outletId,
      input.sessionId
    );

    if (!sessionRow) {
      throw new SessionNotFoundError(input.sessionId);
    }

    // 3. Check session status is ACTIVE
    if (sessionRow.status_id !== ServiceSessionStatus.ACTIVE) {
      throw new InvalidSessionStatusError(
        sessionRow.status_id,
        ServiceSessionStatus.ACTIVE,
        `Cannot add line to session with status ${sessionRow.status_id}`
      );
    }

    // 4. Validate product belongs to company (tenant isolation)
    const [productRows] = await connection.execute<RowDataPacket[]>(
      `SELECT id FROM items WHERE id = ? AND company_id = ? LIMIT 1`,
      [input.productId, input.companyId]
    );

    if (productRows.length === 0) {
      throw new SessionConflictError("Product not found or not accessible");
    }

    // 5. Calculate line total
    const quantity = input.quantity;
    const unitPrice = input.unitPrice;
    const discountAmount = input.discountAmount ?? 0;
    const taxAmount = input.taxAmount ?? 0;
    const lineTotal = (quantity * unitPrice) - discountAmount + taxAmount;

    // 6. Get next line number for this session
    const [lineNumberRows] = await connection.execute<RowDataPacket[]>(
      `SELECT COALESCE(MAX(line_number), 0) + 1 as next_line_number
       FROM table_service_session_lines
       WHERE session_id = ?`,
      [input.sessionId]
    );
    const lineNumber = lineNumberRows[0]?.next_line_number ?? 1;

    // 7. Insert the line
    const [insertResult] = await connection.execute<ResultSetHeader>(
      `INSERT INTO table_service_session_lines
       (session_id, line_number, product_id, product_name, product_sku,
        quantity, unit_price, discount_amount, tax_amount, line_total,
        notes, is_voided, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NOW(), NOW())`,
      [
        input.sessionId,
        lineNumber,
        input.productId,
        input.productName,
        input.productSku ?? null,
        quantity,
        unitPrice,
        discountAmount,
        taxAmount,
        lineTotal,
        input.notes ?? null
      ]
    );

    const lineId = BigInt(insertResult.insertId);

    // 8. Log the event
    await logTableEventWithConnection(connection, {
      companyId: input.companyId,
      outletId: input.outletId,
      tableId: BigInt(sessionRow.table_id),
      eventTypeId: TableEventType.SESSION_LINE_ADDED,
      clientTxId: input.clientTxId,
      serviceSessionId: input.sessionId,
      eventData: {
        lineId: lineId.toString(),
        productId: input.productId.toString(),
        productName: input.productName,
        quantity,
        unitPrice,
        lineTotal
      },
      createdBy: input.createdBy
    });

    await connection.commit();

    // 9. Return the created line
    const [lineRows] = await connection.execute<SessionLineDbRow[]>(
      `SELECT * FROM table_service_session_lines WHERE id = ?`,
      [lineId]
    );

    if (lineRows.length === 0) {
      throw new Error("Failed to retrieve created line");
    }

    return mapDbRowToSessionLine(lineRows[0]);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Update a session line
 * - Checks session status is ACTIVE
 * - Updates table_service_session_lines
 * - Logs SESSION_LINE_UPDATED event
 * - Changes are synced to pos_order_snapshot_lines on session close
 */
export async function updateSessionLine(
  input: UpdateSessionLineInput
): Promise<SessionLine> {
  const pool = getDbPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const isDuplicate = await checkClientTxIdExists(connection, input.companyId, input.outletId, input.clientTxId);
    if (isDuplicate) {
      const existingOnRetry = await getSessionLineWithConnection(
        connection,
        input.companyId,
        input.outletId,
        input.sessionId,
        input.lineId
      );

      await connection.commit();

      if (!existingOnRetry) {
        throw new SessionConflictError("Duplicate update transaction but line not found");
      }
      return mapDbRowToSessionLine(existingOnRetry);
    }

    // 1. Get session with company/outlet scoping
    const sessionRow = await getSessionWithConnection(
      connection,
      input.companyId,
      input.outletId,
      input.sessionId
    );

    if (!sessionRow) {
      throw new SessionNotFoundError(input.sessionId);
    }

    // 2. Check session status is ACTIVE
    if (sessionRow.status_id !== ServiceSessionStatus.ACTIVE) {
      throw new InvalidSessionStatusError(
        sessionRow.status_id,
        ServiceSessionStatus.ACTIVE,
        `Cannot update line in session with status ${sessionRow.status_id}`
      );
    }

    // 3. Get the existing line with scoping
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

    // 4. Build update fields
    const updates: string[] = [];
    const values: (string | number | bigint | boolean | null)[] = [];
    const eventData: Record<string, unknown> = { lineId: input.lineId.toString() };

    if (input.quantity !== undefined) {
      updates.push("quantity = ?");
      values.push(input.quantity);
      eventData.quantity = input.quantity;
    }

    if (input.unitPrice !== undefined) {
      updates.push("unit_price = ?");
      values.push(input.unitPrice);
      eventData.unitPrice = input.unitPrice;
    }

    if (input.discountAmount !== undefined) {
      updates.push("discount_amount = ?");
      values.push(input.discountAmount);
      eventData.discountAmount = input.discountAmount;
    }

    if (input.taxAmount !== undefined) {
      updates.push("tax_amount = ?");
      values.push(input.taxAmount);
      eventData.taxAmount = input.taxAmount;
    }

    if (input.notes !== undefined) {
      updates.push("notes = ?");
      values.push(input.notes);
      eventData.notes = input.notes;
    }

    if (input.isVoided !== undefined) {
      updates.push("is_voided = ?, voided_at = ?");
      values.push(input.isVoided ? 1 : 0);
      values.push(input.isVoided ? new Date().toISOString() : null);
      eventData.isVoided = input.isVoided;
    }

    if (input.voidReason !== undefined) {
      updates.push("void_reason = ?");
      values.push(input.voidReason);
      eventData.voidReason = input.voidReason;
    }

    // Recalculate line total if price-related fields changed
    if (input.quantity !== undefined || input.unitPrice !== undefined ||
        input.discountAmount !== undefined || input.taxAmount !== undefined) {
      const quantity = input.quantity ?? existingLine.quantity;
      const unitPrice = input.unitPrice ?? parseFloat(existingLine.unit_price);
      const discountAmount = input.discountAmount ?? parseFloat(existingLine.discount_amount);
      const taxAmount = input.taxAmount ?? parseFloat(existingLine.tax_amount);
      const lineTotal = (quantity * unitPrice) - discountAmount + taxAmount;

      updates.push("line_total = ?");
      values.push(lineTotal);
      eventData.lineTotal = lineTotal;
    }

    updates.push("updated_at = NOW()");

    // 5. Execute update
    if (updates.length > 1) { // > 1 because we always add updated_at
      values.push(input.lineId);
      await connection.execute(
        `UPDATE table_service_session_lines
         SET ${updates.join(", ")}
         WHERE id = ?`,
        values
      );
    }

    // 6. Log the event
    await logTableEventWithConnection(connection, {
      companyId: input.companyId,
      outletId: input.outletId,
      tableId: BigInt(sessionRow.table_id),
      eventTypeId: TableEventType.SESSION_LINE_UPDATED,
      clientTxId: input.clientTxId,
      serviceSessionId: input.sessionId,
      eventData,
      createdBy: input.updatedBy
    });

    await connection.commit();

    // 7. Return updated line
    const [lineRows] = await connection.execute<SessionLineDbRow[]>(
      `SELECT * FROM table_service_session_lines WHERE id = ?`,
      [input.lineId]
    );

    if (lineRows.length === 0) {
      throw new Error("Failed to retrieve updated line");
    }

    return mapDbRowToSessionLine(lineRows[0]);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Remove a session line
 * - Checks session status is ACTIVE
 * - Deletes from table_service_session_lines
 * - Logs SESSION_LINE_REMOVED event
 * - Changes are synced to pos_order_snapshot_lines on session close
 */
export async function removeSessionLine(
  input: RemoveSessionLineInput
): Promise<{ success: boolean; lineId: bigint }> {
  const pool = getDbPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const isDuplicate = await checkClientTxIdExists(connection, input.companyId, input.outletId, input.clientTxId);
    if (isDuplicate) {
      await connection.commit();
      return { success: true, lineId: input.lineId };
    }

    // 1. Get session with company/outlet scoping
    const sessionRow = await getSessionWithConnection(
      connection,
      input.companyId,
      input.outletId,
      input.sessionId
    );

    if (!sessionRow) {
      throw new SessionNotFoundError(input.sessionId);
    }

    // 2. Check session status is ACTIVE
    if (sessionRow.status_id !== ServiceSessionStatus.ACTIVE) {
      throw new InvalidSessionStatusError(
        sessionRow.status_id,
        ServiceSessionStatus.ACTIVE,
        `Cannot remove line from session with status ${sessionRow.status_id}`
      );
    }

    // 3. Verify the line exists with scoping
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

    // 4. Delete the line
    await connection.execute(
      `DELETE FROM table_service_session_lines WHERE id = ?`,
      [input.lineId]
    );

    // 5. Log the event
    await logTableEventWithConnection(connection, {
      companyId: input.companyId,
      outletId: input.outletId,
      tableId: BigInt(sessionRow.table_id),
      eventTypeId: TableEventType.SESSION_LINE_REMOVED,
      clientTxId: input.clientTxId,
      serviceSessionId: input.sessionId,
      eventData: {
        lineId: input.lineId.toString(),
        productId: existingLine.product_id.toString(),
        productName: existingLine.product_name,
        quantity: existingLine.quantity,
        lineTotal: parseFloat(existingLine.line_total)
      },
      createdBy: input.updatedBy
    });

    await connection.commit();

    return { success: true, lineId: input.lineId };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}