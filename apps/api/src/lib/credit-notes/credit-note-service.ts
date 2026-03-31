// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Credit Note Service
 *
 * CRUD and lifecycle operations for sales credit notes.
 */

import { getDb, type KyselySchema } from "@/lib/db";
import { sql } from "kysely";
import {
  postCreditNoteToJournal,
  voidCreditNoteToJournal
} from "../sales-posting";
import {
  DOCUMENT_TYPES,
  type DocumentType
} from "@/lib/numbering";
import { toRfc3339Required } from "@jurnapod/shared";
import {
  normalizeMoney,
  getNumberWithConflictMapping,
  ensureCompanyOutletExists,
  ensureUserHasOutletAccess,
  formatDateOnly,
  isMysqlError,
  MYSQL_DUPLICATE_ERROR_CODE,
  DatabaseConflictError,
  DatabaseForbiddenError,
  DatabaseReferenceError
} from "@/lib/shared/common-utils";
import type {
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
// Transaction Helper
// ============================================================================

async function withTransaction<T>(operation: (db: KyselySchema) => Promise<T>): Promise<T> {
  const db = getDb();
  return db.transaction().execute(operation);
}

// ============================================================================
// Credit Note Database Operations
// ============================================================================

interface CreditNoteRow {
  id: number;
  company_id: number;
  outlet_id: number;
  invoice_id: number;
  credit_note_no: string;
  credit_note_date: string;
  client_ref: string | null;
  status: string;
  reason: string | null;
  notes: string | null;
  amount: string | number;
  created_by_user_id: number | null;
  updated_by_user_id: number | null;
  created_at: string;
  updated_at: string;
}

interface CreditNoteLineRow {
  id: number;
  credit_note_id: number;
  line_no: number;
  description: string;
  qty: string | number;
  unit_price: string | number;
  line_total: string | number;
}

async function findCreditNoteByIdWithExecutor(
  db: KyselySchema,
  companyId: number,
  creditNoteId: number,
  options?: { forUpdate?: boolean }
): Promise<CreditNoteRow | null> {
  const forUpdateClause = options?.forUpdate ? sql` FOR UPDATE` : sql``;
  const rows = await sql`SELECT id, company_id, outlet_id, invoice_id, credit_note_no, credit_note_date,
          client_ref, status, reason, notes, amount, created_by_user_id, updated_by_user_id,
          created_at, updated_at
   FROM sales_credit_notes
   WHERE company_id = ${companyId} AND id = ${creditNoteId}
   ${forUpdateClause}
   LIMIT 1`.execute(db);

  if (rows.rows.length === 0) {
    return null;
  }
  return rows.rows[0] as CreditNoteRow;
}

async function findCreditNoteLinesWithExecutor(
  db: KyselySchema,
  creditNoteId: number
): Promise<CreditNoteLineRow[]> {
  const rows = await sql`SELECT id, credit_note_id, line_no, description, qty, unit_price, line_total
   FROM sales_credit_note_lines
   WHERE credit_note_id = ${creditNoteId}
   ORDER BY line_no`.execute(db);

  return rows.rows as CreditNoteLineRow[];
}

async function findCreditNoteDetailWithExecutor(
  db: KyselySchema,
  companyId: number,
  creditNoteId: number
): Promise<SalesCreditNoteDetail | null> {
  const creditNote = await findCreditNoteByIdWithExecutor(db, companyId, creditNoteId);
  if (!creditNote) {
    return null;
  }

  const lines = await findCreditNoteLinesWithExecutor(db, creditNoteId);

  return {
    id: creditNote.id,
    company_id: creditNote.company_id,
    outlet_id: creditNote.outlet_id,
    invoice_id: creditNote.invoice_id,
    credit_note_no: creditNote.credit_note_no,
    credit_note_date: formatDateOnly(creditNote.credit_note_date),
    client_ref: creditNote.client_ref ?? null,
    status: creditNote.status as "DRAFT" | "POSTED" | "VOID",
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

interface InvoiceForCreditCheck {
  id: number;
  grand_total: number;
  paid_total: number;
  payment_status: string;
}

async function ensureInvoiceExistsAndPosted(
  db: KyselySchema,
  companyId: number,
  outletId: number,
  invoiceId: number
): Promise<InvoiceForCreditCheck> {
  const rows = await sql`SELECT id, grand_total, paid_total, payment_status
   FROM sales_invoices
   WHERE company_id = ${companyId} AND outlet_id = ${outletId} AND id = ${invoiceId} AND status = 'POSTED'
   LIMIT 1`.execute(db);

  if (rows.rows.length === 0) {
    throw new DatabaseReferenceError("Invoice not found or not posted");
  }
  const row = rows.rows[0] as InvoiceForCreditCheck;
  return {
    id: row.id,
    grand_total: Number(row.grand_total),
    paid_total: Number(row.paid_total),
    payment_status: row.payment_status
  };
}

async function findCreditNoteByClientRef(
  db: KyselySchema,
  companyId: number,
  clientRef: string
): Promise<CreditNoteRow | null> {
  const rows = await sql`SELECT id, company_id, outlet_id, invoice_id, credit_note_no, credit_note_date,
          client_ref, status, reason, notes, amount, created_by_user_id, updated_by_user_id,
          created_at, updated_at
   FROM sales_credit_notes
   WHERE company_id = ${companyId} AND client_ref = ${clientRef}
   LIMIT 1`.execute(db);

  if (rows.rows.length === 0) {
    return null;
  }
  return rows.rows[0] as CreditNoteRow;
}

/**
 * Compute remaining credit capacity for an invoice.
 * Returns remaining amount that can still be credited.
 * Uses FOR UPDATE locking on invoice and credit notes to prevent race over-crediting.
 */
async function getRemainingCreditCapacity(
  db: KyselySchema,
  companyId: number,
  invoiceId: number,
  excludeCreditNoteId?: number
): Promise<{ grand_total: number; already_credited: number; remaining: number }> {
  // Lock the invoice row first
  const invoiceRows = await sql`SELECT grand_total FROM sales_invoices
   WHERE company_id = ${companyId} AND id = ${invoiceId} AND status = 'POSTED'
   FOR UPDATE`.execute(db);

  if (invoiceRows.rows.length === 0) {
    throw new DatabaseReferenceError("Invoice not found or not posted");
  }

  const grandTotal = Number((invoiceRows.rows[0] as { grand_total: string | number }).grand_total);

  // Lock individual credit note rows (not using FOR UPDATE with aggregates)
  const excludeClause = excludeCreditNoteId ? sql` AND id != ${excludeCreditNoteId}` : sql``;
  const lockParams = excludeCreditNoteId
    ? [companyId, invoiceId, excludeCreditNoteId]
    : [companyId, invoiceId];

  await sql`SELECT id FROM sales_credit_notes
   WHERE company_id = ${companyId} AND invoice_id = ${invoiceId} AND status = 'POSTED'
   ${excludeClause}
   FOR UPDATE`.execute(db);

  // Now calculate the sum without FOR UPDATE
  const creditRows = await sql`SELECT COALESCE(SUM(amount), 0) as total
   FROM sales_credit_notes
   WHERE company_id = ${companyId} AND invoice_id = ${invoiceId} AND status = 'POSTED'
   ${excludeClause}`.execute(db);

  const alreadyCredited = Number((creditRows.rows[0] as { total: string | number }).total ?? 0);
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
  const result = await withTransaction(async (db) => {
    await ensureUserHasOutletAccess(actor?.userId ?? 0, companyId, input.outlet_id);
    await ensureCompanyOutletExists(db, companyId, input.outlet_id);

    // Idempotency: return existing credit note if client_ref matches
    if (input.client_ref) {
      const existingCreditNote = await findCreditNoteByClientRef(db, companyId, input.client_ref);
      if (existingCreditNote) {
        if (actor) {
          await ensureUserHasOutletAccess(actor.userId, companyId, existingCreditNote.outlet_id);
        }
        return findCreditNoteDetailWithExecutor(db, companyId, existingCreditNote.id);
      }
    }

    await ensureInvoiceExistsAndPosted(db, companyId, input.outlet_id, input.invoice_id);

    // Validate invoice exists with locking; compute cumulative credit capacity
    const { grand_total: grandTotal, remaining } = await getRemainingCreditCapacity(
      db,
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
      const insertResult = await sql`INSERT INTO sales_credit_notes (
          company_id, outlet_id, invoice_id, credit_note_no, credit_note_date,
          status, client_ref, reason, notes, amount, created_by_user_id, updated_by_user_id
        ) VALUES (${companyId}, ${input.outlet_id}, ${input.invoice_id}, ${creditNoteNo}, ${input.credit_note_date},
          'DRAFT', ${input.client_ref ?? null}, ${input.reason ?? null}, ${input.notes ?? null},
          ${normalizedAmount}, ${actor?.userId ?? null}, ${actor?.userId ?? null})`.execute(db);

      const creditNoteId = Number(insertResult.insertId);

      for (let i = 0; i < input.lines.length; i++) {
        const line = input.lines[i];
        const lineTotal = normalizeMoney(line.qty * line.unit_price);
        await sql`INSERT INTO sales_credit_note_lines (
            credit_note_id, company_id, outlet_id, line_no, description, qty, unit_price, line_total
          ) VALUES (${creditNoteId}, ${companyId}, ${input.outlet_id}, ${i + 1},
            ${line.description}, ${line.qty}, ${normalizeMoney(line.unit_price)}, ${lineTotal})`.execute(db);
      }

      return findCreditNoteDetailWithExecutor(db, companyId, creditNoteId);
    } catch (error) {
      // Idempotency race handling: if client_ref provided and unique index conflict, fetch and return existing
      if (input.client_ref && isMysqlError(error) && error.errno === MYSQL_DUPLICATE_ERROR_CODE) {
        const existingCreditNote = await findCreditNoteByClientRef(db, companyId, input.client_ref);
        if (existingCreditNote) {
          if (actor) {
            await ensureUserHasOutletAccess(actor.userId, companyId, existingCreditNote.outlet_id);
          }
          return findCreditNoteDetailWithExecutor(db, companyId, existingCreditNote.id);
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
  return withTransaction(async (db) => {
    const creditNote = await findCreditNoteByIdWithExecutor(db, companyId, creditNoteId);
    if (!creditNote) {
      return null;
    }

    if (actor) {
      await ensureUserHasOutletAccess(actor.userId, companyId, creditNote.outlet_id);
    }

    return findCreditNoteDetailWithExecutor(db, companyId, creditNoteId);
  });
}

export async function listCreditNotes(
  companyId: number,
  filters: CreditNoteListFilters
): Promise<{ total: number; credit_notes: SalesCreditNoteDetail[] }> {
  return withTransaction(async (db) => {
    const conditions: Array<ReturnType<typeof sql>> = [sql`company_id = ${companyId}`];

    if (filters.outletIds && filters.outletIds.length > 0) {
      conditions.push(sql`outlet_id IN (${sql.join(filters.outletIds.map(id => sql`${id}`), sql`, `)})`);
    }

    if (filters.invoiceId) {
      conditions.push(sql`invoice_id = ${filters.invoiceId}`);
    }

    if (filters.status) {
      conditions.push(sql`status = ${filters.status}`);
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
      conditions.push(sql`credit_note_date >= ${dateFrom}`);
    }

    if (dateTo) {
      conditions.push(sql`credit_note_date <= ${dateTo}`);
    }

    const whereClause = sql.join(conditions, sql` AND `);

    const countResult = await sql`SELECT COUNT(*) as total FROM sales_credit_notes WHERE ${whereClause}`.execute(db);

    const limit = filters.limit ?? 50;
    const offset = filters.offset ?? 0;

    const rows = await sql`SELECT id, company_id, outlet_id, invoice_id, credit_note_no, credit_note_date,
            client_ref, status, reason, notes, amount, created_by_user_id, updated_by_user_id,
            created_at, updated_at
     FROM sales_credit_notes
     WHERE ${whereClause}
     ORDER BY id DESC
     LIMIT ${limit} OFFSET ${offset}`.execute(db);

    const creditNotes: SalesCreditNoteDetail[] = [];
    for (const row of rows.rows as CreditNoteRow[]) {
      const lines = await findCreditNoteLinesWithExecutor(db, row.id);
      creditNotes.push({
        id: row.id,
        company_id: row.company_id,
        outlet_id: row.outlet_id,
        invoice_id: row.invoice_id,
        credit_note_no: row.credit_note_no,
        credit_note_date: formatDateOnly(row.credit_note_date),
        client_ref: row.client_ref ?? null,
        status: row.status as "DRAFT" | "POSTED" | "VOID",
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

    return { total: Number((countResult.rows[0] as { total: string | number }).total), credit_notes: creditNotes };
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
  return withTransaction(async (db) => {
    const creditNote = await findCreditNoteByIdWithExecutor(db, companyId, creditNoteId, {
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

    const updates: Array<ReturnType<typeof sql>> = [sql`updated_by_user_id = ${actor?.userId ?? null}`, sql`updated_at = CURRENT_TIMESTAMP`];

    if (input.credit_note_date) {
      updates.push(sql`credit_note_date = ${input.credit_note_date}`);
    }

    if (input.reason !== undefined) {
      updates.push(sql`reason = ${input.reason ?? null}`);
    }

    if (input.notes !== undefined) {
      updates.push(sql`notes = ${input.notes ?? null}`);
    }

    if (input.amount !== undefined) {
      // Validate that new amount doesn't exceed cumulative credit capacity, excluding this note
      const { grand_total: grandTotal, remaining } = await getRemainingCreditCapacity(
        db,
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

      updates.push(sql`amount = ${normalizedAmount}`);
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

    await sql`UPDATE sales_credit_notes SET ${sql.join(updates, sql`, `)} WHERE company_id = ${companyId} AND id = ${creditNoteId}`.execute(db);

    if (input.lines) {
      await sql`DELETE FROM sales_credit_note_lines WHERE credit_note_id = ${creditNoteId}`.execute(db);

      for (let i = 0; i < input.lines.length; i++) {
        const line = input.lines[i];
        const lineTotal = normalizeMoney(line.qty * line.unit_price);
        await sql`INSERT INTO sales_credit_note_lines (
            credit_note_id, company_id, outlet_id, line_no, description, qty, unit_price, line_total
          ) VALUES (${creditNoteId}, ${companyId}, ${creditNote.outlet_id}, ${i + 1},
            ${line.description}, ${line.qty}, ${normalizeMoney(line.unit_price)}, ${lineTotal})`.execute(db);
      }
    }

    return findCreditNoteDetailWithExecutor(db, companyId, creditNoteId);
  });
}

export async function postCreditNote(
  companyId: number,
  creditNoteId: number,
  actor?: MutationActor
): Promise<SalesCreditNoteDetail | null> {
  return withTransaction(async (db) => {
    const creditNote = await findCreditNoteByIdWithExecutor(db, companyId, creditNoteId, {
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
      db,
      companyId,
      creditNote.invoice_id
    );
    const creditNoteAmount = normalizeMoney(Number(creditNote.amount));
    if (creditNoteAmount > remainingCapacity.remaining) {
      throw new DatabaseConflictError(
        `Credit note amount (${creditNoteAmount}) exceeds remaining credit capacity (${remainingCapacity.remaining}) for invoice total ${remainingCapacity.grand_total}`
      );
    }

    await postCreditNoteToJournal(db, {
      id: creditNote.id,
      company_id: creditNote.company_id,
      outlet_id: creditNote.outlet_id,
      invoice_id: creditNote.invoice_id,
      credit_note_no: creditNote.credit_note_no,
      credit_note_date: formatDateOnly(creditNote.credit_note_date),
      amount: Number(creditNote.amount),
      updated_at: creditNote.updated_at
    });

    await sql`UPDATE sales_credit_notes
     SET status = 'POSTED',
         updated_by_user_id = ${actor?.userId ?? null},
         updated_at = CURRENT_TIMESTAMP
     WHERE company_id = ${companyId} AND id = ${creditNoteId}`.execute(db);

    const invoiceResult = await sql`SELECT paid_total, payment_status, grand_total FROM sales_invoices
     WHERE company_id = ${companyId} AND id = ${creditNote.invoice_id}
     LIMIT 1`.execute(db);

    if (invoiceResult.rows.length > 0) {
      const row = invoiceResult.rows[0] as { paid_total: string | number; payment_status: string; grand_total: string | number };
      const currentPaidTotal = Number(row.paid_total);
      const grandTotal = Number(row.grand_total);
      const newPaidTotal = Math.max(0, currentPaidTotal - Number(creditNote.amount));

      let newPaymentStatus: string;
      if (newPaidTotal <= 0) {
        newPaymentStatus = "UNPAID";
      } else if (newPaidTotal >= grandTotal) {
        newPaymentStatus = "PAID";
      } else {
        newPaymentStatus = "PARTIAL";
      }

      await sql`UPDATE sales_invoices
       SET paid_total = ${normalizeMoney(newPaidTotal)}, payment_status = ${newPaymentStatus}, updated_at = CURRENT_TIMESTAMP
       WHERE company_id = ${companyId} AND id = ${creditNote.invoice_id}`.execute(db);
    }

    return findCreditNoteDetailWithExecutor(db, companyId, creditNoteId);
  });
}

export async function voidCreditNote(
  companyId: number,
  creditNoteId: number,
  actor?: MutationActor
): Promise<SalesCreditNoteDetail | null> {
  return withTransaction(async (db) => {
    const creditNote = await findCreditNoteByIdWithExecutor(db, companyId, creditNoteId, {
      forUpdate: true
    });
    if (!creditNote) {
      return null;
    }

    if (actor) {
      await ensureUserHasOutletAccess(actor.userId, companyId, creditNote.outlet_id);
    }

    if (creditNote.status === "VOID") {
      return findCreditNoteDetailWithExecutor(db, companyId, creditNoteId);
    }

    await sql`UPDATE sales_credit_notes
     SET status = 'VOID',
         updated_by_user_id = ${actor?.userId ?? null},
         updated_at = CURRENT_TIMESTAMP
     WHERE company_id = ${companyId} AND id = ${creditNoteId}`.execute(db);

    if (creditNote.status === "POSTED") {
      // Create reversing journal entry
      await voidCreditNoteToJournal(db, {
        id: creditNote.id,
        company_id: creditNote.company_id,
        outlet_id: creditNote.outlet_id,
        invoice_id: creditNote.invoice_id,
        credit_note_no: creditNote.credit_note_no,
        credit_note_date: formatDateOnly(creditNote.credit_note_date),
        amount: Number(creditNote.amount),
        updated_at: creditNote.updated_at
      });

      const invoiceResult = await sql`SELECT paid_total, payment_status, grand_total FROM sales_invoices
       WHERE company_id = ${companyId} AND id = ${creditNote.invoice_id}
       LIMIT 1`.execute(db);

      if (invoiceResult.rows.length > 0) {
        const row = invoiceResult.rows[0] as { paid_total: string | number; payment_status: string; grand_total: string | number };
        const currentPaidTotal = Number(row.paid_total);
        const grandTotal = Number(row.grand_total);
        const newPaidTotal = Math.min(grandTotal, currentPaidTotal + Number(creditNote.amount));

        let newPaymentStatus: string;
        if (newPaidTotal <= 0) {
          newPaymentStatus = "UNPAID";
        } else if (newPaidTotal >= grandTotal) {
          newPaymentStatus = "PAID";
        } else {
          newPaymentStatus = "PARTIAL";
        }

        await sql`UPDATE sales_invoices
         SET paid_total = ${normalizeMoney(newPaidTotal)}, payment_status = ${newPaymentStatus}, updated_at = CURRENT_TIMESTAMP
         WHERE company_id = ${companyId} AND id = ${creditNote.invoice_id}`.execute(db);
      }
    }

    return findCreditNoteDetailWithExecutor(db, companyId, creditNoteId);
  });
}
