// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Credit Note Service
 *
 * CRUD and lifecycle operations for sales credit notes.
 */

import type { ResultSetHeader, RowDataPacket } from "mysql2";
import type { PoolConnection } from "mysql2/promise";
import { getDbPool } from "../db";
import {
  postCreditNoteToJournal,
  voidCreditNoteToJournal
} from "../sales-posting";
import {
  DOCUMENT_TYPES,
  type DocumentType
} from "../numbering";
import { toRfc3339Required } from "@jurnapod/shared";
import {
  normalizeMoney,
  withTransaction,
  getNumberWithConflictMapping,
  ensureCompanyOutletExists,
  ensureUserHasOutletAccess,
  formatDateOnly,
  isMysqlError,
  MYSQL_DUPLICATE_ERROR_CODE,
  type QueryExecutor,
  DatabaseConflictError,
  DatabaseForbiddenError,
  DatabaseReferenceError
} from "@/lib/shared/common-utils";
import type {
  SalesCreditNoteRow,
  SalesCreditNoteLineRow,
  SalesCreditNoteDetail,
  CreditNoteLineInput,
  CreditNoteListFilters,
  MutationActor
} from "./types";

// Re-export types for convenience
export type {
  SalesCreditNoteDetail,
  CreditNoteLineInput,
  CreditNoteListFilters,
  MutationActor,
  SalesCreditNoteStatus
} from "./types";

// Re-export error classes for backward compatibility
export {
  DatabaseConflictError,
  DatabaseForbiddenError,
  DatabaseReferenceError
} from "@/lib/shared/common-utils";

// ============================================================================
// Helper Functions
// ============================================================================

// Note: Uses shared normalizeMoney, withTransaction, getNumberWithConflictMapping,
// ensureCompanyOutletExists, ensureUserHasOutletAccess, formatDateOnly, isMysqlError, MYSQL_DUPLICATE_ERROR_CODE

// ============================================================================
// Credit Note Database Operations
// ============================================================================

async function findCreditNoteByIdWithExecutor(
  connection: PoolConnection,
  companyId: number,
  creditNoteId: number,
  options?: { forUpdate?: boolean }
): Promise<SalesCreditNoteRow | null> {
  const [rows] = await connection.execute<SalesCreditNoteRow[]>(
    `SELECT id, company_id, outlet_id, invoice_id, credit_note_no, credit_note_date,
            client_ref, status, reason, notes, amount, created_by_user_id, updated_by_user_id,
            created_at, updated_at
     FROM sales_credit_notes
     WHERE company_id = ? AND id = ?${options?.forUpdate ? " FOR UPDATE" : ""}`,
    [companyId, creditNoteId]
  );
  return rows[0] || null;
}

async function findCreditNoteLinesWithExecutor(
  connection: PoolConnection,
  creditNoteId: number
): Promise<SalesCreditNoteLineRow[]> {
  const [rows] = await connection.execute<SalesCreditNoteLineRow[]>(
    `SELECT id, credit_note_id, line_no, description, qty, unit_price, line_total
     FROM sales_credit_note_lines
     WHERE credit_note_id = ?
     ORDER BY line_no`,
    [creditNoteId]
  );
  return rows;
}

async function findCreditNoteDetailWithExecutor(
  connection: PoolConnection,
  companyId: number,
  creditNoteId: number
): Promise<SalesCreditNoteDetail | null> {
  const creditNote = await findCreditNoteByIdWithExecutor(connection, companyId, creditNoteId);
  if (!creditNote) {
    return null;
  }

  const lines = await findCreditNoteLinesWithExecutor(connection, creditNoteId);

  return {
    id: creditNote.id,
    company_id: creditNote.company_id,
    outlet_id: creditNote.outlet_id,
    invoice_id: creditNote.invoice_id,
    credit_note_no: creditNote.credit_note_no,
    credit_note_date: formatDateOnly(creditNote.credit_note_date),
    client_ref: creditNote.client_ref ?? null,
    status: creditNote.status,
    reason: creditNote.reason ?? null,
    notes: creditNote.notes ?? null,
    amount: Number(creditNote.amount),
    created_by_user_id: creditNote.created_by_user_id ?? null,
    updated_by_user_id: creditNote.updated_by_user_id ?? null,
    created_at: creditNote.created_at,
    updated_at: creditNote.updated_at,
    lines: lines.map((line) => ({
      id: line.id,
      credit_note_id: line.credit_note_id,
      line_no: line.line_no,
      description: line.description,
      qty: Number(line.qty),
      unit_price: Number(line.unit_price),
      line_total: Number(line.line_total)
    }))
  };
}

async function ensureInvoiceExistsAndPosted(
  connection: PoolConnection,
  companyId: number,
  outletId: number,
  invoiceId: number
): Promise<{ id: number; grand_total: number; paid_total: number; payment_status: string }> {
  const [rows] = await connection.execute<RowDataPacket[]>(
    `SELECT id, grand_total, paid_total, payment_status
     FROM sales_invoices
     WHERE company_id = ? AND outlet_id = ? AND id = ? AND status = 'POSTED'`,
    [companyId, outletId, invoiceId]
  );
  if (!rows[0]) {
    throw new DatabaseReferenceError("Invoice not found or not posted");
  }
  return {
    id: rows[0].id,
    grand_total: Number(rows[0].grand_total),
    paid_total: Number(rows[0].paid_total),
    payment_status: rows[0].payment_status
  };
}

async function findCreditNoteByClientRef(
  connection: PoolConnection,
  companyId: number,
  clientRef: string
): Promise<SalesCreditNoteRow | null> {
  const [rows] = await connection.execute<SalesCreditNoteRow[]>(
    `SELECT id, company_id, outlet_id, invoice_id, credit_note_no, credit_note_date,
            client_ref, status, reason, notes, amount, created_by_user_id, updated_by_user_id,
            created_at, updated_at
     FROM sales_credit_notes
     WHERE company_id = ? AND client_ref = ?`,
    [companyId, clientRef]
  );
  return rows[0] || null;
}

/**
 * Compute remaining credit capacity for an invoice.
 * Returns remaining amount that can still be credited.
 * Uses FOR UPDATE locking on invoice and credit notes to prevent race over-crediting.
 */
async function getRemainingCreditCapacity(
  connection: PoolConnection,
  companyId: number,
  invoiceId: number,
  excludeCreditNoteId?: number
): Promise<{ grand_total: number; already_credited: number; remaining: number }> {
  // Lock the invoice row first
  const [invoiceRows] = await connection.execute<RowDataPacket[]>(
    `SELECT grand_total FROM sales_invoices
     WHERE company_id = ? AND id = ? AND status = 'POSTED'
     FOR UPDATE`,
    [companyId, invoiceId]
  );

  if (!invoiceRows[0]) {
    throw new DatabaseReferenceError("Invoice not found or not posted");
  }

  const grandTotal = Number(invoiceRows[0].grand_total);

  // Lock individual credit note rows (not using FOR UPDATE with aggregates)
  const excludeClause = excludeCreditNoteId ? " AND id != ?" : "";
  const lockParams = excludeCreditNoteId
    ? [companyId, invoiceId, excludeCreditNoteId]
    : [companyId, invoiceId];

  await connection.execute<RowDataPacket[]>(
    `SELECT id FROM sales_credit_notes
     WHERE company_id = ? AND invoice_id = ? AND status = 'POSTED'${excludeClause}
     FOR UPDATE`,
    lockParams
  );

  // Now calculate the sum without FOR UPDATE
  const sumParams = excludeCreditNoteId
    ? [companyId, invoiceId, excludeCreditNoteId]
    : [companyId, invoiceId];

  const [creditRows] = await connection.execute<RowDataPacket[]>(
    `SELECT COALESCE(SUM(amount), 0) as total
     FROM sales_credit_notes
     WHERE company_id = ? AND invoice_id = ? AND status = 'POSTED'${excludeClause}`,
    sumParams
  );

  const alreadyCredited = Number(creditRows[0]?.total ?? 0);
  const remaining = Math.max(0, grandTotal - alreadyCredited);

  return { grand_total: grandTotal, already_credited: alreadyCredited, remaining };
}

/**
 * Convert money to cents (minor units) for exact comparison.
 * Returns integer cents to avoid floating point issues.
 */
function moneyToCents(value: number): number {
  return Math.round(value * 100);
}

/**
 * Check if two money amounts are exactly equal (to the cent).
 */
function moneyEquals(a: number, b: number): boolean {
  return moneyToCents(a) === moneyToCents(b);
}

// ============================================================================
// Public API
// ============================================================================

export async function createCreditNote(
  companyId: number,
  input: {
    outlet_id: number;
    invoice_id: number;
    credit_note_date: string;
    client_ref?: string;
    reason?: string;
    notes?: string;
    amount: number;
    lines: CreditNoteLineInput[];
  },
  actor?: MutationActor
): Promise<SalesCreditNoteDetail> {
  const result = await withTransaction(async (connection) => {
    await ensureUserHasOutletAccess(actor?.userId ?? 0, companyId, input.outlet_id);
    await ensureCompanyOutletExists(connection, companyId, input.outlet_id);

    // Idempotency: return existing credit note if client_ref matches
    if (input.client_ref) {
      const existingCreditNote = await findCreditNoteByClientRef(connection, companyId, input.client_ref);
      if (existingCreditNote) {
        if (actor) {
          await ensureUserHasOutletAccess(actor.userId, companyId, existingCreditNote.outlet_id);
        }
        return findCreditNoteDetailWithExecutor(connection, companyId, existingCreditNote.id);
      }
    }

    await ensureInvoiceExistsAndPosted(connection, companyId, input.outlet_id, input.invoice_id);

    // Validate invoice exists with locking; compute cumulative credit capacity
    const { grand_total: grandTotal, remaining } = await getRemainingCreditCapacity(
      connection,
      companyId,
      input.invoice_id
    );

    const normalizedAmount = normalizeMoney(input.amount);
    if (normalizedAmount > remaining) {
      throw new DatabaseConflictError(
        `Credit note amount (${normalizedAmount}) exceeds remaining credit capacity (${remaining}) for invoice total ${grandTotal}`
      );
    }

    // Validate that sum of line totals exactly equals credit note amount (cent-exact)
    const lineTotalsSum = input.lines.reduce((sum, line) => sum + (line.qty * line.unit_price), 0);
    const normalizedLineSum = normalizeMoney(lineTotalsSum);

    if (!moneyEquals(normalizedLineSum, normalizedAmount)) {
      throw new DatabaseConflictError(
        `Line totals sum (${normalizedLineSum}) does not exactly match credit note amount (${normalizedAmount})`
      );
    }

    const creditNoteNo = await getNumberWithConflictMapping(
      companyId,
      input.outlet_id,
      DOCUMENT_TYPES.CREDIT_NOTE
    );

    try {
      const [insertResult] = await connection.execute<ResultSetHeader>(
        `INSERT INTO sales_credit_notes (
          company_id, outlet_id, invoice_id, credit_note_no, credit_note_date,
          status, client_ref, reason, notes, amount, created_by_user_id, updated_by_user_id
        ) VALUES (?, ?, ?, ?, ?, 'DRAFT', ?, ?, ?, ?, ?, ?)`,
        [
          companyId,
          input.outlet_id,
          input.invoice_id,
          creditNoteNo,
          input.credit_note_date,
          input.client_ref ?? null,
          input.reason ?? null,
          input.notes ?? null,
          normalizedAmount,
          actor?.userId ?? null,
          actor?.userId ?? null
        ]
      );

      const creditNoteId = insertResult.insertId;

      for (let i = 0; i < input.lines.length; i++) {
        const line = input.lines[i];
        const lineTotal = normalizeMoney(line.qty * line.unit_price);
        await connection.execute<ResultSetHeader>(
          `INSERT INTO sales_credit_note_lines (
            credit_note_id, company_id, outlet_id, line_no, description, qty, unit_price, line_total
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            creditNoteId,
            companyId,
            input.outlet_id,
            i + 1,
            line.description,
            line.qty,
            normalizeMoney(line.unit_price),
            lineTotal
          ]
        );
      }

      return findCreditNoteDetailWithExecutor(connection, companyId, creditNoteId);
    } catch (error) {
      // Idempotency race handling: if client_ref provided and unique index conflict, fetch and return existing
      if (input.client_ref && isMysqlError(error) && error.errno === MYSQL_DUPLICATE_ERROR_CODE) {
        const existingCreditNote = await findCreditNoteByClientRef(connection, companyId, input.client_ref);
        if (existingCreditNote) {
          if (actor) {
            await ensureUserHasOutletAccess(actor.userId, companyId, existingCreditNote.outlet_id);
          }
          return findCreditNoteDetailWithExecutor(connection, companyId, existingCreditNote.id);
        }
      }
      throw error;
    }
  });

  if (!result) {
    throw new Error("Failed to create credit note");
  }
  return result;
}

export async function getCreditNote(
  companyId: number,
  creditNoteId: number,
  actor?: MutationActor
): Promise<SalesCreditNoteDetail | null> {
  return withTransaction(async (connection) => {
    const creditNote = await findCreditNoteByIdWithExecutor(connection, companyId, creditNoteId);
    if (!creditNote) {
      return null;
    }

    if (actor) {
      await ensureUserHasOutletAccess(actor.userId, companyId, creditNote.outlet_id);
    }

    return findCreditNoteDetailWithExecutor(connection, companyId, creditNoteId);
  });
}

export async function listCreditNotes(
  companyId: number,
  filters: CreditNoteListFilters
): Promise<{ total: number; credit_notes: SalesCreditNoteDetail[] }> {
  return withTransaction(async (connection) => {
    const conditions: string[] = ["company_id = ?"];
    const params: (string | number)[] = [companyId];

    if (filters.outletIds && filters.outletIds.length > 0) {
      conditions.push(`outlet_id IN (${filters.outletIds.map(() => "?").join(", ")})`);
      params.push(...filters.outletIds);
    }

    if (filters.invoiceId) {
      conditions.push("invoice_id = ?");
      params.push(filters.invoiceId);
    }

    if (filters.status) {
      conditions.push("status = ?");
      params.push(filters.status);
    }

    // Handle timezone conversion for date range
    let dateFrom = filters.dateFrom;
    let dateTo = filters.dateTo;

    if (dateFrom && dateTo && filters.timezone && filters.timezone !== 'UTC') {
      // Simple timezone conversion - in a real scenario, use a proper timezone library
      // For now, we'll use the dates as-is since dateFrom/dateTo are already in date-only format
      dateFrom = dateFrom;
      dateTo = dateTo;
    }

    if (dateFrom) {
      conditions.push("credit_note_date >= ?");
      params.push(dateFrom);
    }

    if (dateTo) {
      conditions.push("credit_note_date <= ?");
      params.push(dateTo);
    }

    const whereClause = conditions.join(" AND ");

    const [countResult] = await connection.execute<RowDataPacket[]>(
      `SELECT COUNT(*) as total FROM sales_credit_notes WHERE ${whereClause}`,
      params
    );

    const limit = filters.limit ?? 50;
    const offset = filters.offset ?? 0;

    const [rows] = await connection.execute<SalesCreditNoteRow[]>(
      `SELECT id, company_id, outlet_id, invoice_id, credit_note_no, credit_note_date,
              client_ref, status, reason, notes, amount, created_by_user_id, updated_by_user_id,
              created_at, updated_at
       FROM sales_credit_notes
       WHERE ${whereClause}
       ORDER BY id DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const creditNotes: SalesCreditNoteDetail[] = [];
    for (const row of rows) {
      const lines = await findCreditNoteLinesWithExecutor(connection, row.id);
      creditNotes.push({
        id: row.id,
        company_id: row.company_id,
        outlet_id: row.outlet_id,
        invoice_id: row.invoice_id,
        credit_note_no: row.credit_note_no,
        credit_note_date: formatDateOnly(row.credit_note_date),
        client_ref: row.client_ref ?? null,
        status: row.status,
        reason: row.reason ?? null,
        notes: row.notes ?? null,
        amount: Number(row.amount),
        created_by_user_id: row.created_by_user_id ?? null,
        updated_by_user_id: row.updated_by_user_id ?? null,
        created_at: toRfc3339Required(row.created_at),
        updated_at: toRfc3339Required(row.updated_at),
        lines: lines.map((line) => ({
          id: line.id,
          credit_note_id: line.credit_note_id,
          line_no: line.line_no,
          description: line.description,
          qty: Number(line.qty),
          unit_price: Number(line.unit_price),
          line_total: Number(line.line_total)
        }))
      });
    }

    return { total: Number(countResult[0].total), credit_notes: creditNotes };
  });
}

export async function updateCreditNote(
  companyId: number,
  creditNoteId: number,
  input: {
    credit_note_date?: string;
    reason?: string;
    notes?: string;
    amount?: number;
    lines?: CreditNoteLineInput[];
  },
  actor?: MutationActor
): Promise<SalesCreditNoteDetail | null> {
  return withTransaction(async (connection) => {
    const creditNote = await findCreditNoteByIdWithExecutor(connection, companyId, creditNoteId, {
      forUpdate: true
    });
    if (!creditNote) {
      return null;
    }

    if (actor) {
      await ensureUserHasOutletAccess(actor.userId, companyId, creditNote.outlet_id);
    }

    if (creditNote.status !== "DRAFT") {
      throw new DatabaseForbiddenError("Only DRAFT credit notes can be updated");
    }

    const updates: string[] = ["updated_by_user_id = ?", "updated_at = CURRENT_TIMESTAMP"];
    const params: (string | number | null)[] = [actor?.userId ?? null];

    if (input.credit_note_date) {
      updates.push("credit_note_date = ?");
      params.push(input.credit_note_date);
    }

    if (input.reason !== undefined) {
      updates.push("reason = ?");
      params.push(input.reason ?? null);
    }

    if (input.notes !== undefined) {
      updates.push("notes = ?");
      params.push(input.notes ?? null);
    }

    if (input.amount !== undefined) {
      // Validate that new amount doesn't exceed cumulative credit capacity, excluding this note
      const { grand_total: grandTotal, remaining } = await getRemainingCreditCapacity(
        connection,
        companyId,
        creditNote.invoice_id,
        creditNoteId
      );

      const normalizedAmount = normalizeMoney(input.amount);
      if (normalizedAmount > remaining) {
        throw new DatabaseConflictError(
          `Updated credit note amount (${normalizedAmount}) exceeds remaining credit capacity (${remaining}) for invoice total ${grandTotal}`
        );
      }

      updates.push("amount = ?");
      params.push(normalizedAmount);
    }

    // Validate that sum of line totals exactly equals credit note amount (cent-exact)
    if (input.lines) {
      const newAmount = input.amount ?? Number(creditNote.amount);
      const lineTotalsSum = input.lines.reduce((sum, line) => sum + (line.qty * line.unit_price), 0);
      const normalizedLineSum = normalizeMoney(lineTotalsSum);
      const normalizedAmount = normalizeMoney(newAmount);

      if (!moneyEquals(normalizedLineSum, normalizedAmount)) {
        throw new DatabaseConflictError(
          `Line totals sum (${normalizedLineSum}) does not exactly match credit note amount (${normalizedAmount})`
        );
      }
    }

    params.push(companyId, creditNoteId);

    await connection.execute<ResultSetHeader>(
      `UPDATE sales_credit_notes SET ${updates.join(", ")} WHERE company_id = ? AND id = ?`,
      params
    );

    if (input.lines) {
      await connection.execute<ResultSetHeader>(
        "DELETE FROM sales_credit_note_lines WHERE credit_note_id = ?",
        [creditNoteId]
      );

      for (let i = 0; i < input.lines.length; i++) {
        const line = input.lines[i];
        const lineTotal = normalizeMoney(line.qty * line.unit_price);
        await connection.execute<ResultSetHeader>(
          `INSERT INTO sales_credit_note_lines (
            credit_note_id, company_id, outlet_id, line_no, description, qty, unit_price, line_total
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            creditNoteId,
            companyId,
            creditNote.outlet_id,
            i + 1,
            line.description,
            line.qty,
            normalizeMoney(line.unit_price),
            lineTotal
          ]
        );
      }
    }

    return findCreditNoteDetailWithExecutor(connection, companyId, creditNoteId);
  });
}

export async function postCreditNote(
  companyId: number,
  creditNoteId: number,
  actor?: MutationActor
): Promise<SalesCreditNoteDetail | null> {
  return withTransaction(async (connection) => {
    const creditNote = await findCreditNoteByIdWithExecutor(connection, companyId, creditNoteId, {
      forUpdate: true
    });
    if (!creditNote) {
      return null;
    }

    if (actor) {
      await ensureUserHasOutletAccess(actor.userId, companyId, creditNote.outlet_id);
    }

    if (creditNote.status !== "DRAFT") {
      throw new DatabaseForbiddenError("Only DRAFT credit notes can be posted");
    }

    const remainingCapacity = await getRemainingCreditCapacity(
      connection,
      companyId,
      creditNote.invoice_id
    );
    const creditNoteAmount = normalizeMoney(Number(creditNote.amount));
    if (creditNoteAmount > remainingCapacity.remaining) {
      throw new DatabaseConflictError(
        `Credit note amount (${creditNoteAmount}) exceeds remaining credit capacity (${remainingCapacity.remaining}) for invoice total ${remainingCapacity.grand_total}`
      );
    }

    await postCreditNoteToJournal(connection, {
      id: creditNote.id,
      company_id: creditNote.company_id,
      outlet_id: creditNote.outlet_id,
      invoice_id: creditNote.invoice_id,
      credit_note_no: creditNote.credit_note_no,
      credit_note_date: formatDateOnly(creditNote.credit_note_date),
      amount: Number(creditNote.amount),
      updated_at: creditNote.updated_at
    });

    await connection.execute<ResultSetHeader>(
      `UPDATE sales_credit_notes
       SET status = 'POSTED',
           updated_by_user_id = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE company_id = ? AND id = ?`,
      [actor?.userId ?? null, companyId, creditNoteId]
    );

    const [invoiceResult] = await connection.execute<RowDataPacket[]>(
      `SELECT paid_total, payment_status, grand_total FROM sales_invoices
       WHERE company_id = ? AND id = ?`,
      [companyId, creditNote.invoice_id]
    );

    if (invoiceResult[0]) {
      const currentPaidTotal = Number(invoiceResult[0].paid_total);
      const grandTotal = Number(invoiceResult[0].grand_total);
      const newPaidTotal = Math.max(0, currentPaidTotal - Number(creditNote.amount));

      let newPaymentStatus: string;
      if (newPaidTotal <= 0) {
        newPaymentStatus = "UNPAID";
      } else if (newPaidTotal >= grandTotal) {
        newPaymentStatus = "PAID";
      } else {
        newPaymentStatus = "PARTIAL";
      }

      await connection.execute<ResultSetHeader>(
        `UPDATE sales_invoices
         SET paid_total = ?, payment_status = ?, updated_at = CURRENT_TIMESTAMP
         WHERE company_id = ? AND id = ?`,
        [normalizeMoney(newPaidTotal), newPaymentStatus, companyId, creditNote.invoice_id]
      );
    }

    return findCreditNoteDetailWithExecutor(connection, companyId, creditNoteId);
  });
}

export async function voidCreditNote(
  companyId: number,
  creditNoteId: number,
  actor?: MutationActor
): Promise<SalesCreditNoteDetail | null> {
  return withTransaction(async (connection) => {
    const creditNote = await findCreditNoteByIdWithExecutor(connection, companyId, creditNoteId, {
      forUpdate: true
    });
    if (!creditNote) {
      return null;
    }

    if (actor) {
      await ensureUserHasOutletAccess(actor.userId, companyId, creditNote.outlet_id);
    }

    if (creditNote.status === "VOID") {
      return findCreditNoteDetailWithExecutor(connection, companyId, creditNoteId);
    }

    await connection.execute<ResultSetHeader>(
      `UPDATE sales_credit_notes
       SET status = 'VOID',
           updated_by_user_id = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE company_id = ? AND id = ?`,
      [actor?.userId ?? null, companyId, creditNoteId]
    );

    if (creditNote.status === "POSTED") {
      // Create reversing journal entry
      await voidCreditNoteToJournal(connection, {
        id: creditNote.id,
        company_id: creditNote.company_id,
        outlet_id: creditNote.outlet_id,
        invoice_id: creditNote.invoice_id,
        credit_note_no: creditNote.credit_note_no,
        credit_note_date: formatDateOnly(creditNote.credit_note_date),
        amount: Number(creditNote.amount),
        updated_at: creditNote.updated_at
      });

      const [invoiceResult] = await connection.execute<RowDataPacket[]>(
        `SELECT paid_total, payment_status, grand_total FROM sales_invoices
         WHERE company_id = ? AND id = ?`,
        [companyId, creditNote.invoice_id]
      );

      if (invoiceResult[0]) {
        const currentPaidTotal = Number(invoiceResult[0].paid_total);
        const grandTotal = Number(invoiceResult[0].grand_total);
        const newPaidTotal = Math.min(grandTotal, currentPaidTotal + Number(creditNote.amount));

        let newPaymentStatus: string;
        if (newPaidTotal <= 0) {
          newPaymentStatus = "UNPAID";
        } else if (newPaidTotal >= grandTotal) {
          newPaymentStatus = "PAID";
        } else {
          newPaymentStatus = "PARTIAL";
        }

        await connection.execute<ResultSetHeader>(
          `UPDATE sales_invoices
           SET paid_total = ?, payment_status = ?, updated_at = CURRENT_TIMESTAMP
           WHERE company_id = ? AND id = ?`,
          [normalizeMoney(newPaidTotal), newPaymentStatus, companyId, creditNote.invoice_id]
        );
      }
    }

    return findCreditNoteDetailWithExecutor(connection, companyId, creditNoteId);
  });
}
