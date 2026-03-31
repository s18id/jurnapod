// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { sql } from "kysely";
import { getDb, type KyselySchema } from "@/lib/db";
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
  SessionValidationError,
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
  const db = getDb();

  return await db.transaction().execute(async (trx) => {
    // 1. Check idempotency - duplicate clientTxId?
    const isDuplicate = await checkClientTxIdExists(trx, input.companyId, input.outletId, input.clientTxId);
    if (isDuplicate) {
      // Deterministic replay: resolve original line_id from the original
      // SESSION_LINE_ADDED event payload for this exact session.
      const eventRows = await sql<{ line_id: number }>`
        SELECT CAST(JSON_UNQUOTE(JSON_EXTRACT(e.event_data, '$.lineId')) AS UNSIGNED) AS line_id
        FROM table_events e
        WHERE e.company_id = ${input.companyId}
          AND e.outlet_id = ${input.outletId}
          AND e.client_tx_id = ${input.clientTxId}
          AND e.service_session_id = ${input.sessionId}
          AND e.event_type_id = ${TableEventType.SESSION_LINE_ADDED}
        LIMIT 1
      `.execute(trx);

      if (eventRows.rows.length === 0) {
        throw new SessionConflictError("Duplicate transaction belongs to a different session");
      }

      const originalLineId = eventRows.rows[0]?.line_id;
      if (originalLineId === undefined || originalLineId === null) {
        throw new SessionConflictError("Duplicate transaction found but original line reference missing");
      }

      const existingRows = await sql<SessionLineDbRow>`
        SELECT * FROM table_service_session_lines
        WHERE id = ${originalLineId} AND session_id = ${input.sessionId}
        LIMIT 1
      `.execute(trx);

      if (existingRows.rows.length > 0) {
        return mapDbRowToSessionLine(existingRows.rows[0]);
      }

      throw new SessionConflictError("Duplicate transaction found but original line not found");
    }

    // 2. Get session with company/outlet scoping
    const sessionRow = await getSessionWithConnection(
      trx,
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
    const productRows = await sql<{ id: number }>`
      SELECT id FROM items WHERE id = ${input.productId} AND company_id = ${input.companyId} LIMIT 1
    `.execute(trx);

    if (productRows.rows.length === 0) {
      throw new SessionValidationError("Product not found or not accessible");
    }

    // 5. Calculate line total
    const quantity = input.quantity;
    const unitPrice = input.unitPrice;
    const discountAmount = input.discountAmount ?? 0;
    const taxAmount = input.taxAmount ?? 0;
    const lineTotal = (quantity * unitPrice) - discountAmount + taxAmount;

    // 6. Get next line number for this session
    const lineNumberRows = await sql<{ next_line_number: number }>`
      SELECT COALESCE(MAX(line_number), 0) + 1 as next_line_number
      FROM table_service_session_lines
      WHERE session_id = ${input.sessionId}
    `.execute(trx);
    const lineNumber = lineNumberRows.rows[0]?.next_line_number ?? 1;

    // 7. Insert the line
    const insertResult = await sql`
      INSERT INTO table_service_session_lines
       (session_id, line_number, product_id, product_name, product_sku,
        quantity, unit_price, discount_amount, tax_amount, line_total,
        notes, is_voided, created_at, updated_at)
       VALUES (
         ${input.sessionId},
         ${lineNumber},
         ${input.productId},
         ${input.productName},
         ${input.productSku ?? null},
         ${quantity},
         ${unitPrice},
         ${discountAmount},
         ${taxAmount},
         ${lineTotal},
         ${input.notes ?? null},
         0,
         NOW(),
         NOW()
       )
    `.execute(trx);

    const lineId = BigInt(insertResult.insertId ?? 0n);

    // 8. Log the event
    await logTableEventWithConnection(trx, {
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

    // 9. Return the created line
    const lineRows = await sql<SessionLineDbRow>`
      SELECT * FROM table_service_session_lines WHERE id = ${lineId}
    `.execute(trx);

    if (lineRows.rows.length === 0) {
      throw new Error("Failed to retrieve created line");
    }

    return mapDbRowToSessionLine(lineRows.rows[0]);
  });
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
  const db = getDb();

  return await db.transaction().execute(async (trx) => {
    const isDuplicate = await checkClientTxIdExists(trx, input.companyId, input.outletId, input.clientTxId);
    if (isDuplicate) {
      const existingOnRetry = await getSessionLineWithConnection(
        trx,
        input.companyId,
        input.outletId,
        input.sessionId,
        input.lineId
      );

      if (!existingOnRetry) {
        throw new SessionConflictError("Duplicate update transaction but line not found");
      }
      return mapDbRowToSessionLine(existingOnRetry);
    }

    // 1. Get session with company/outlet scoping
    const sessionRow = await getSessionWithConnection(
      trx,
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
      trx,
      input.companyId,
      input.outletId,
      input.sessionId,
      input.lineId
    );

    if (!existingLine) {
      throw new SessionNotFoundError(`Line ${input.lineId} in session ${input.sessionId}`);
    }

    // 4. Build update fields
    const eventData: Record<string, unknown> = { lineId: input.lineId.toString() };
    let needsLineTotalRecalc = false;
    let newQuantity = existingLine.quantity;
    let newUnitPrice = parseFloat(existingLine.unit_price);
    let newDiscountAmount = parseFloat(existingLine.discount_amount);
    let newTaxAmount = parseFloat(existingLine.tax_amount);

    if (input.quantity !== undefined) {
      newQuantity = input.quantity;
      eventData.quantity = input.quantity;
      needsLineTotalRecalc = true;
    }

    if (input.unitPrice !== undefined) {
      newUnitPrice = input.unitPrice;
      eventData.unitPrice = input.unitPrice;
      needsLineTotalRecalc = true;
    }

    if (input.discountAmount !== undefined) {
      newDiscountAmount = input.discountAmount;
      eventData.discountAmount = input.discountAmount;
      needsLineTotalRecalc = true;
    }

    if (input.taxAmount !== undefined) {
      newTaxAmount = input.taxAmount;
      eventData.taxAmount = input.taxAmount;
      needsLineTotalRecalc = true;
    }

    if (input.notes !== undefined) {
      eventData.notes = input.notes;
    }

    if (input.isVoided !== undefined) {
      eventData.isVoided = input.isVoided;
    }

    if (input.voidReason !== undefined) {
      eventData.voidReason = input.voidReason;
    }

    // Recalculate line total if price-related fields changed
    let newLineTotal: number | undefined;
    if (needsLineTotalRecalc) {
      newLineTotal = (newQuantity * newUnitPrice) - newDiscountAmount + newTaxAmount;
      eventData.lineTotal = newLineTotal;
    }

    // 5. Execute update
    // Build dynamic UPDATE using individual assignments
    if (input.quantity !== undefined) {
      await sql`UPDATE table_service_session_lines SET quantity = ${newQuantity} WHERE id = ${input.lineId}`.execute(trx);
    }
    if (input.unitPrice !== undefined) {
      await sql`UPDATE table_service_session_lines SET unit_price = ${newUnitPrice} WHERE id = ${input.lineId}`.execute(trx);
    }
    if (input.discountAmount !== undefined) {
      await sql`UPDATE table_service_session_lines SET discount_amount = ${newDiscountAmount} WHERE id = ${input.lineId}`.execute(trx);
    }
    if (input.taxAmount !== undefined) {
      await sql`UPDATE table_service_session_lines SET tax_amount = ${newTaxAmount} WHERE id = ${input.lineId}`.execute(trx);
    }
    if (input.notes !== undefined) {
      await sql`UPDATE table_service_session_lines SET notes = ${input.notes} WHERE id = ${input.lineId}`.execute(trx);
    }
    if (input.isVoided !== undefined) {
      const voidAt = input.isVoided ? new Date().toISOString() : null;
      await sql`UPDATE table_service_session_lines SET is_voided = ${input.isVoided ? 1 : 0}, voided_at = ${voidAt} WHERE id = ${input.lineId}`.execute(trx);
    }
    if (input.voidReason !== undefined) {
      await sql`UPDATE table_service_session_lines SET void_reason = ${input.voidReason} WHERE id = ${input.lineId}`.execute(trx);
    }
    if (newLineTotal !== undefined) {
      await sql`UPDATE table_service_session_lines SET line_total = ${newLineTotal} WHERE id = ${input.lineId}`.execute(trx);
    }
    await sql`UPDATE table_service_session_lines SET updated_at = NOW() WHERE id = ${input.lineId}`.execute(trx);

    // 6. Log the event
    await logTableEventWithConnection(trx, {
      companyId: input.companyId,
      outletId: input.outletId,
      tableId: BigInt(sessionRow.table_id),
      eventTypeId: TableEventType.SESSION_LINE_UPDATED,
      clientTxId: input.clientTxId,
      serviceSessionId: input.sessionId,
      eventData,
      createdBy: input.updatedBy
    });

    // 7. Return updated line
    const lineRows = await sql<SessionLineDbRow>`
      SELECT * FROM table_service_session_lines WHERE id = ${input.lineId}
    `.execute(trx);

    if (lineRows.rows.length === 0) {
      throw new Error("Failed to retrieve updated line");
    }

    return mapDbRowToSessionLine(lineRows.rows[0]);
  });
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
  const db = getDb();

  return await db.transaction().execute(async (trx) => {
    const isDuplicate = await checkClientTxIdExists(trx, input.companyId, input.outletId, input.clientTxId);
    if (isDuplicate) {
      return { success: true, lineId: input.lineId };
    }

    // 1. Get session with company/outlet scoping
    const sessionRow = await getSessionWithConnection(
      trx,
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
      trx,
      input.companyId,
      input.outletId,
      input.sessionId,
      input.lineId
    );

    if (!existingLine) {
      throw new SessionNotFoundError(`Line ${input.lineId} in session ${input.sessionId}`);
    }

    // 4. Delete the line
    await sql`
      DELETE FROM table_service_session_lines WHERE id = ${input.lineId}
    `.execute(trx);

    // 5. Log the event
    await logTableEventWithConnection(trx, {
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

    return { success: true, lineId: input.lineId };
  });
}
