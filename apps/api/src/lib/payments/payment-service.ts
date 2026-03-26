// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Payment Service
 * 
 * Payment CRUD operations extracted from sales.ts
 */

import type { RowDataPacket, ResultSetHeader, PoolConnection } from "mysql2/promise";
import { getDbPool } from "@/lib/db";
import { toMysqlDateTime, toMysqlDateTimeFromDateLike } from "@/lib/date-helpers";
import { toRfc3339Required } from "@jurnapod/shared";
import {
  DOCUMENT_TYPES,
  type DocumentType
} from "@/lib/numbering";
import { postSalesPaymentToJournal } from "@/lib/sales-posting";
import type { SalesPayment, SalesInvoice } from "@/lib/sales";
import {
  PaymentStatusError,
  PaymentAllocationError
} from "@/lib/sales";
import type { PaymentListFilters, QueryExecutor, MutationActor } from "./types";
import type { SalesPaymentRow } from "./types";
import {
  normalizePayment,
  fetchPaymentSplits,
  fetchPaymentSplitsForMultiple,
  attachSplitsToPayment,
  buildCanonicalInput,
  buildCanonicalFromExisting,
  canonicalPaymentsEqual,
  hasMoreThanTwoDecimals
} from "./payment-allocation";
import {
  normalizeMoney,
  withTransaction,
  getNumberWithConflictMapping,
  ensureCompanyOutletExists,
  ensureUserHasOutletAccess,
  isMysqlError,
  DatabaseConflictError,
  DatabaseReferenceError
} from "@/lib/shared/common-utils";

async function findInvoiceByIdWithExecutor(
  executor: QueryExecutor,
  companyId: number,
  invoiceId: number,
  options?: { forUpdate?: boolean }
): Promise<SalesInvoice | null> {
  const forUpdateClause = options?.forUpdate ? " FOR UPDATE" : "";
  const [rows] = await executor.execute<RowDataPacket[]>(
    `SELECT id, company_id, outlet_id, invoice_no, client_ref, invoice_date, due_date, status, payment_status,
            subtotal, tax_amount, grand_total, paid_total,
            approved_by_user_id, approved_at,
            created_by_user_id, updated_by_user_id, created_at, updated_at
     FROM sales_invoices
     WHERE company_id = ?
       AND id = ?
     LIMIT 1${forUpdateClause}`,
    [companyId, invoiceId]
  );

  if (!rows[0]) {
    return null;
  }

  const row = rows[0] as RowDataPacket & {
    id: number;
    company_id: number;
    outlet_id: number;
    invoice_no: string;
    client_ref?: string | null;
    invoice_date: string;
    due_date?: Date | string | null;
    status: "DRAFT" | "APPROVED" | "POSTED" | "VOID";
    payment_status: "UNPAID" | "PARTIAL" | "PAID";
    subtotal: string | number;
    tax_amount: string | number;
    grand_total: string | number;
    paid_total: string | number;
    approved_by_user_id?: number | null;
    approved_at?: Date | string | null;
    created_by_user_id?: number | null;
    updated_by_user_id?: number | null;
    created_at: string;
    updated_at: string;
  };

  return {
    id: Number(row.id),
    company_id: Number(row.company_id),
    outlet_id: Number(row.outlet_id),
    invoice_no: row.invoice_no,
    client_ref: row.client_ref ?? null,
    invoice_date: row.invoice_date.slice(0, 10),
    due_date: row.due_date ? String(row.due_date).slice(0, 10) : null,
    status: row.status,
    payment_status: row.payment_status,
    subtotal: Number(row.subtotal),
    tax_amount: Number(row.tax_amount),
    grand_total: Number(row.grand_total),
    paid_total: Number(row.paid_total),
    approved_by_user_id: row.approved_by_user_id ? Number(row.approved_by_user_id) : null,
    approved_at: row.approved_at ? toMysqlDateTimeFromDateLike(row.approved_at.toString()) : null,
    created_by_user_id: row.created_by_user_id ? Number(row.created_by_user_id) : null,
    updated_by_user_id: row.updated_by_user_id ? Number(row.updated_by_user_id) : null,
    created_at: toRfc3339Required(row.created_at),
    updated_at: toRfc3339Required(row.updated_at)
  };
}

export async function findPaymentByIdWithExecutor(
  executor: QueryExecutor,
  companyId: number,
  paymentId: number,
  options?: { forUpdate?: boolean; includeSplits?: boolean }
): Promise<SalesPayment | null> {
  const forUpdateClause = options?.forUpdate ? " FOR UPDATE" : "";
  const [rows] = await executor.execute<SalesPaymentRow[]>(
    `SELECT sp.id, sp.company_id, sp.outlet_id, sp.invoice_id, sp.payment_no, sp.client_ref, sp.payment_at,
            sp.account_id, a.name as account_name, sp.method, sp.status,
            sp.amount, sp.invoice_amount_idr, sp.payment_amount_idr, sp.payment_delta_idr,
            sp.shortfall_settled_as_loss, sp.shortfall_reason, sp.shortfall_settled_by_user_id, sp.shortfall_settled_at,
            sp.created_by_user_id, sp.updated_by_user_id, sp.created_at, sp.updated_at
     FROM sales_payments sp
     LEFT JOIN accounts a ON a.id = sp.account_id AND a.company_id = sp.company_id
     WHERE sp.company_id = ?
       AND sp.id = ?
     LIMIT 1${forUpdateClause}`,
    [companyId, paymentId]
  );

  if (!rows[0]) {
    return null;
  }

  const payment = normalizePayment(rows[0]);

  // Phase 8: Fetch splits if requested
  if (options?.includeSplits !== false) {
    const splits = await fetchPaymentSplits(executor, companyId, paymentId);
    if (splits.length > 0) {
      return attachSplitsToPayment(payment, splits);
    }
  }

  return payment;
}

export async function findPaymentByClientRefWithExecutor(
  executor: QueryExecutor,
  companyId: number,
  clientRef: string
): Promise<SalesPayment | null> {
  const [rows] = await executor.execute<RowDataPacket[]>(
    `SELECT id
     FROM sales_payments
     WHERE company_id = ?
       AND client_ref = ?
     LIMIT 1`,
    [companyId, clientRef]
  );

  if (!rows[0]) {
    return null;
  }

  return findPaymentByIdWithExecutor(executor, companyId, Number(rows[0].id));
}

function buildPaymentWhereClause(companyId: number, filters: PaymentListFilters) {
  const conditions: string[] = ["sp.company_id = ?"];
  const values: Array<string | number> = [companyId];

  if (filters.outletIds) {
    if (filters.outletIds.length === 0) {
      return { clause: "", values: [], isEmpty: true };
    }
    const placeholders = filters.outletIds.map(() => "?").join(", ");
    conditions.push(`sp.outlet_id IN (${placeholders})`);
    values.push(...filters.outletIds);
  }

  if (filters.status) {
    conditions.push("sp.status = ?");
    values.push(filters.status);
  }

  // Handle timezone conversion for date range
  let dateFrom = filters.dateFrom;
  let dateTo = filters.dateTo;

  if (dateFrom && dateTo && filters.timezone && filters.timezone !== 'UTC') {
    const range = toDateTimeRangeWithTimezone(dateFrom, dateTo, filters.timezone);
    // Convert to date-only format for comparison
    dateFrom = range.fromStartUTC.slice(0, 10);
    dateTo = range.toEndUTC.slice(0, 10);
  }

  if (dateFrom) {
    conditions.push("sp.payment_at >= ?");
    values.push(dateFrom);
  }

  if (dateTo) {
    conditions.push("sp.payment_at <= ?");
    values.push(dateTo);
  }

  return { clause: conditions.join(" AND "), values, isEmpty: false };
}

function toDateTimeRangeWithTimezone(dateFrom: string, dateTo: string, timezone: string) {
  // Simple implementation - in production this would use a proper timezone library
  return {
    fromStartUTC: dateFrom,
    toEndUTC: dateTo
  };
}

export async function listPayments(companyId: number, filters: PaymentListFilters) {
  const pool = getDbPool();
  const limit = filters.limit ?? 50;
  const offset = filters.offset ?? 0;
  const where = buildPaymentWhereClause(companyId, filters);

  if (where.isEmpty) {
    return { total: 0, payments: [] };
  }

  const [countRows] = await pool.execute<RowDataPacket[]>(
    `SELECT COUNT(*) as total
     FROM sales_payments sp
     WHERE ${where.clause}`,
    where.values
  );
  const total = Number(countRows[0]?.total ?? 0);

  const [rows] = await pool.execute<SalesPaymentRow[]>(
    `SELECT sp.id, sp.company_id, sp.outlet_id, sp.invoice_id, sp.payment_no, sp.client_ref, sp.payment_at,
            sp.account_id, a.name as account_name, sp.method, sp.status,
            sp.amount, sp.invoice_amount_idr, sp.payment_amount_idr, sp.payment_delta_idr,
            sp.shortfall_settled_as_loss, sp.shortfall_reason, sp.shortfall_settled_by_user_id, sp.shortfall_settled_at,
            sp.created_by_user_id, sp.updated_by_user_id, sp.created_at, sp.updated_at
     FROM sales_payments sp
     LEFT JOIN accounts a ON a.id = sp.account_id AND a.company_id = sp.company_id
     WHERE ${where.clause}
     ORDER BY sp.payment_at DESC, sp.id DESC
     LIMIT ? OFFSET ?`,
    [...where.values, limit, offset]
  );

  // Phase 8: Batch fetch splits for all payments
  const paymentIds = rows.map(r => Number(r.id));
  const splitsByPaymentId = await fetchPaymentSplitsForMultiple(pool, companyId, paymentIds);

  const payments = rows.map(row => {
    const payment = normalizePayment(row);
    const splits = splitsByPaymentId.get(payment.id);
    if (splits && splits.length > 0) {
      return attachSplitsToPayment(payment, splits);
    }
    return payment;
  });

  return { total, payments };
}

export async function getPayment(companyId: number, paymentId: number) {
  const pool = getDbPool();
  return findPaymentByIdWithExecutor(pool, companyId, paymentId);
}

export async function createPayment(
  companyId: number,
  input: {
    outlet_id: number;
    invoice_id: number;
    client_ref?: string;
    payment_no?: string;
    payment_at: string;
    account_id?: number;
    method?: "CASH" | "QRIS" | "CARD";
    amount: number;
    actual_amount_idr?: number;
    splits?: Array<{ account_id: number; amount: number }>;
  },
  actor?: MutationActor
): Promise<SalesPayment> {
  return withTransaction(async (connection) => {
    // Phase 8: Handle splits - determine effective account_id and validate splits
    const hasSplits = input.splits && input.splits.length > 0;
    let effectiveAccountId: number;
    let splitData: Array<{ account_id: number; amount: number }> = [];

    if (hasSplits) {
      // Validate splits
      if (input.splits!.length > 10) {
        throw new PaymentAllocationError("Maximum 10 splits allowed");
      }

      // Check for duplicate account_ids
      const accountIds = input.splits!.map(s => s.account_id);
      if (new Set(accountIds).size !== accountIds.length) {
        throw new PaymentAllocationError("Duplicate account_ids not allowed in splits");
      }

      // Patch 1: Validate precision - max 2 decimal places
      if (hasMoreThanTwoDecimals(input.amount)) {
        throw new PaymentAllocationError("Amount must have at most 2 decimal places");
      }
      for (const split of input.splits!) {
        if (hasMoreThanTwoDecimals(split.amount)) {
          throw new PaymentAllocationError("Split amount must have at most 2 decimal places");
        }
      }

      // Patch B: Validate split sum equals total amount (cent-exact)
      const splitSumMinor = input.splits!.reduce((sum, s) => sum + Math.round(s.amount * 100), 0);
      const amountMinor = Math.round(input.amount * 100);
      if (splitSumMinor !== amountMinor) {
        throw new PaymentAllocationError("Sum of split amounts must equal payment amount");
      }

      // Validate each split account is payable and belongs to company
      for (const split of input.splits!) {
        const [accountRows] = await connection.execute<RowDataPacket[]>(
          `SELECT id FROM accounts
           WHERE id = ? AND company_id = ? AND is_payable = 1
           LIMIT 1`,
          [split.account_id, companyId]
        );
        if (accountRows.length === 0) {
          throw new DatabaseReferenceError(`Account ${split.account_id} not found or not payable`);
        }
      }

      // Use first split's account_id as header account_id
      effectiveAccountId = input.splits![0].account_id;
      splitData = input.splits!;

      // Validate header account_id matches first split if provided
      if (input.account_id !== undefined && input.account_id !== effectiveAccountId) {
        throw new PaymentAllocationError("Header account_id must equal splits[0].account_id");
      }

      // Scope 1: Guard - when splits provided, actual_amount_idr must equal amount (same minor units)
      if (typeof input.actual_amount_idr === "number") {
        if (Math.round(input.actual_amount_idr * 100) !== Math.round(input.amount * 100)) {
          throw new PaymentAllocationError("When splits are provided, actual_amount_idr must equal amount");
        }
      }
    } else {
      // No splits: require account_id
      if (input.account_id === undefined) {
        throw new DatabaseReferenceError("account_id is required when splits not provided");
      }

      // Patch 1: Validate precision for non-split payments
      if (hasMoreThanTwoDecimals(input.amount)) {
        throw new PaymentAllocationError("Amount must have at most 2 decimal places");
      }

      effectiveAccountId = input.account_id;
      // Create single split from header data
      splitData = [{ account_id: effectiveAccountId, amount: input.amount }];
    }

    if (input.client_ref) {
      const existing = await findPaymentByClientRefWithExecutor(
        connection,
        companyId,
        input.client_ref
      );
      if (existing) {
        // Phase 8: Enforce idempotency contract - compare canonical payloads
        const incomingCanonical = buildCanonicalInput(input);
        const existingCanonical = buildCanonicalFromExisting(existing);

        if (!canonicalPaymentsEqual(incomingCanonical, existingCanonical)) {
          throw new DatabaseConflictError("Idempotency conflict: payload mismatch");
        }

        if (actor) {
          await ensureUserHasOutletAccess(actor.userId, companyId, existing.outlet_id);
        }
        return existing;
      }
    }

    await ensureCompanyOutletExists(connection, companyId, input.outlet_id);
    if (actor) {
      await ensureUserHasOutletAccess(actor.userId, companyId, input.outlet_id);
    }

    // Verify header account exists, belongs to company, and is payable
    const [accountRows] = await connection.execute<RowDataPacket[]>(
      `SELECT id FROM accounts
       WHERE id = ? AND company_id = ? AND is_payable = 1
       LIMIT 1`,
      [effectiveAccountId, companyId]
    );
    if (accountRows.length === 0) {
      throw new DatabaseReferenceError("Account not found or not payable");
    }

    const invoice = await findInvoiceByIdWithExecutor(connection, companyId, input.invoice_id);
    if (!invoice) {
      throw new DatabaseReferenceError("Invoice not found");
    }

    if (invoice.outlet_id !== input.outlet_id) {
      throw new DatabaseReferenceError("Invoice outlet mismatch");
    }

    const amount = normalizeMoney(input.amount);
    const effectivePaymentAmount = normalizeMoney(input.actual_amount_idr ?? input.amount);
    const paymentAt = toMysqlDateTime(input.payment_at);

    const paymentNo = await getNumberWithConflictMapping(
      companyId,
      input.outlet_id,
      DOCUMENT_TYPES.SALES_PAYMENT,
      input.payment_no
    );

    try {
      const [result] = await connection.execute<ResultSetHeader>(
        `INSERT INTO sales_payments (
           company_id,
           outlet_id,
           invoice_id,
           payment_no,
           client_ref,
           payment_at,
           account_id,
           method,
           status,
           amount,
           payment_amount_idr,
           created_by_user_id,
           updated_by_user_id
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT', ?, ?, ?, ?)`,
        [
          companyId,
          input.outlet_id,
          input.invoice_id,
          paymentNo,
          input.client_ref ?? null,
          paymentAt,
          effectiveAccountId,
          input.method ?? null,
          amount,
          effectivePaymentAmount,
          actor?.userId ?? null,
          actor?.userId ?? null
        ]
      );

      const paymentId = Number(result.insertId);

      // Phase 8: Insert split rows
      for (let i = 0; i < splitData.length; i++) {
        const split = splitData[i];
        await connection.execute<ResultSetHeader>(
          `INSERT INTO sales_payment_splits (
             payment_id, company_id, outlet_id, split_index, account_id, amount
           ) VALUES (?, ?, ?, ?, ?, ?)`,
          [
            paymentId,
            companyId,
            input.outlet_id,
            i,
            split.account_id,
            normalizeMoney(split.amount)
          ]
        );
      }

      const payment = await findPaymentByIdWithExecutor(connection, companyId, paymentId);
      if (!payment) {
        throw new Error("Created payment not found");
      }

      return payment;
    } catch (error) {
      if (isMysqlError(error) && error.errno === 1062) {
        if (input.client_ref) {
          const existing = await findPaymentByClientRefWithExecutor(
            connection,
            companyId,
            input.client_ref
          );
          if (existing) {
            // Phase 8: Enforce idempotency contract - compare canonical payloads
            const incomingCanonical = buildCanonicalInput(input);
            const existingCanonical = buildCanonicalFromExisting(existing);

            if (!canonicalPaymentsEqual(incomingCanonical, existingCanonical)) {
              throw new DatabaseConflictError("Idempotency conflict: payload mismatch");
            }

            if (actor) {
              await ensureUserHasOutletAccess(
                actor.userId,
                companyId,
                existing.outlet_id
              );
            }
            return existing;
          }
        }
        throw new DatabaseConflictError("Duplicate payment");
      }

      throw error;
    }
  });
}

export async function updatePayment(
  companyId: number,
  paymentId: number,
  input: {
    outlet_id?: number;
    invoice_id?: number;
    payment_no?: string;
    payment_at?: string;
    account_id?: number;
    method?: "CASH" | "QRIS" | "CARD";
    amount?: number;
    actual_amount_idr?: number;
    splits?: Array<{ account_id: number; amount: number }>;
  },
  actor?: MutationActor
): Promise<SalesPayment | null> {
  return withTransaction(async (connection) => {
    const current = await findPaymentByIdWithExecutor(connection, companyId, paymentId, {
      forUpdate: true
    });
    if (!current) {
      return null;
    }

    if (current.status !== "DRAFT") {
      throw new PaymentStatusError("Payment is not editable");
    }

    if (actor) {
      await ensureUserHasOutletAccess(actor.userId, companyId, current.outlet_id);
    }

    if (typeof input.outlet_id === "number") {
      await ensureCompanyOutletExists(connection, companyId, input.outlet_id);
      if (actor) {
        await ensureUserHasOutletAccess(actor.userId, companyId, input.outlet_id);
      }
    }

    // Phase 8: Handle splits update
    const hasSplits = input.splits && input.splits.length > 0;
    let nextAccountId = input.account_id ?? current.account_id;
    let nextAmount = typeof input.amount === "number" ? normalizeMoney(input.amount) : current.amount;
    let nextPaymentAmountIdr = typeof input.actual_amount_idr === "number" 
      ? normalizeMoney(input.actual_amount_idr) 
      : current.payment_amount_idr ?? current.amount;

    if (hasSplits) {
      // Validate splits
      if (input.splits!.length > 10) {
        throw new PaymentAllocationError("Maximum 10 splits allowed");
      }

      // Check for duplicate account_ids
      const accountIds = input.splits!.map(s => s.account_id);
      if (new Set(accountIds).size !== accountIds.length) {
        throw new PaymentAllocationError("Duplicate account_ids not allowed in splits");
      }

      // Patch 1: Validate precision - max 2 decimal places
      if (typeof input.amount === "number" && hasMoreThanTwoDecimals(input.amount)) {
        throw new PaymentAllocationError("Amount must have at most 2 decimal places");
      }
      for (const split of input.splits!) {
        if (hasMoreThanTwoDecimals(split.amount)) {
          throw new PaymentAllocationError("Split amount must have at most 2 decimal places");
        }
      }

      // Patch B: Validate split sum equals total amount (cent-exact)
      const splitSumMinor = input.splits!.reduce((sum, s) => sum + Math.round(s.amount * 100), 0);
      if (typeof input.amount === "number") {
        const nextAmountMinor = Math.round(nextAmount * 100);
        if (splitSumMinor !== nextAmountMinor) {
          throw new PaymentAllocationError("Sum of split amounts must equal payment amount");
        }
      } else {
        nextAmount = normalizeMoney(splitSumMinor / 100);
      }

      // Validate each split account is payable and belongs to company
      for (const split of input.splits!) {
        const [accountRows] = await connection.execute<RowDataPacket[]>(
          `SELECT id FROM accounts
           WHERE id = ? AND company_id = ? AND is_payable = 1
           LIMIT 1`,
          [split.account_id, companyId]
        );
        if (accountRows.length === 0) {
          throw new DatabaseReferenceError(`Account ${split.account_id} not found or not payable`);
        }
      }

      // Use first split's account_id as header account_id
      nextAccountId = input.splits![0].account_id;

      // Validate header account_id matches first split if provided
      if (input.account_id !== undefined && input.account_id !== nextAccountId) {
        throw new PaymentAllocationError("Header account_id must equal splits[0].account_id");
      }

      // Scope 1: Guard - when splits provided, actual_amount_idr must equal split total (same minor units)
      if (typeof input.actual_amount_idr === "number") {
        const actualMinor = Math.round(input.actual_amount_idr * 100);
        const effectiveAmountMinor = Math.round(nextAmount * 100);
        if (actualMinor !== effectiveAmountMinor) {
          throw new PaymentAllocationError("When splits are provided, actual_amount_idr must equal amount");
        }
      }

      // Ensure payment_amount_idr matches split total to prevent posting imbalance
      nextPaymentAmountIdr = nextAmount;
    } else {
      // Patch 1: Validate precision for non-split payment updates
      if (typeof input.amount === "number" && hasMoreThanTwoDecimals(input.amount)) {
        throw new PaymentAllocationError("Amount must have at most 2 decimal places");
      }
    }

    // Verify account if provided (and not already validated via splits)
    if (!hasSplits && typeof input.account_id === "number") {
      const [accountRows] = await connection.execute<RowDataPacket[]>(
        `SELECT id FROM accounts
         WHERE id = ? AND company_id = ? AND is_payable = 1
         LIMIT 1`,
        [input.account_id, companyId]
      );
      if (accountRows.length === 0) {
        throw new DatabaseReferenceError("Account not found or not payable");
      }
    }

    const nextOutletId = input.outlet_id ?? current.outlet_id;
    const nextInvoiceId = input.invoice_id ?? current.invoice_id;
    const nextPaymentNo = input.payment_no ?? current.payment_no;
    const nextPaymentAt = input.payment_at
      ? toMysqlDateTime(input.payment_at)
      : toMysqlDateTimeFromDateLike(current.payment_at);
    const nextMethod = input.method ?? current.method;

    if (typeof input.invoice_id === "number" || typeof input.outlet_id === "number") {
      const invoice = await findInvoiceByIdWithExecutor(connection, companyId, nextInvoiceId);
      if (!invoice) {
        throw new DatabaseReferenceError("Invoice not found");
      }

      if (invoice.outlet_id !== nextOutletId) {
        throw new DatabaseReferenceError("Invoice outlet mismatch");
      }
    }

    try {
      await connection.execute<ResultSetHeader>(
        `UPDATE sales_payments
         SET outlet_id = ?,
             invoice_id = ?,
             payment_no = ?,
             payment_at = ?,
             account_id = ?,
             method = ?,
             amount = ?,
             payment_amount_idr = ?,
             updated_by_user_id = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE company_id = ?
           AND id = ?`,
        [
          nextOutletId,
          nextInvoiceId,
          nextPaymentNo,
          nextPaymentAt,
          nextAccountId,
          nextMethod ?? null,
          nextAmount,
          nextPaymentAmountIdr,
          actor?.userId ?? null,
          companyId,
          paymentId
        ]
      );

      // Phase 8: Update splits if provided
      if (hasSplits) {
        // Delete existing splits
        await connection.execute(
          `DELETE FROM sales_payment_splits
           WHERE company_id = ? AND payment_id = ?`,
          [companyId, paymentId]
        );

        // Insert new splits
        for (let i = 0; i < input.splits!.length; i++) {
          const split = input.splits![i];
          await connection.execute<ResultSetHeader>(
            `INSERT INTO sales_payment_splits (
               payment_id, company_id, outlet_id, split_index, account_id, amount
             ) VALUES (?, ?, ?, ?, ?, ?)`,
            [
              paymentId,
              companyId,
              nextOutletId,
              i,
              split.account_id,
              normalizeMoney(split.amount)
            ]
          );
        }
      }

      return findPaymentByIdWithExecutor(connection, companyId, paymentId);
    } catch (error) {
      if (isMysqlError(error) && error.errno === 1062) {
        throw new DatabaseConflictError("Duplicate payment");
      }

      throw error;
    }
  });
}

export async function postPayment(
  companyId: number,
  paymentId: number,
  actor?: MutationActor,
  options?: {
    settle_shortfall_as_loss?: boolean;
    shortfall_reason?: string;
  }
): Promise<SalesPayment | null> {
  return withTransaction(async (connection) => {
    const payment = await findPaymentByIdWithExecutor(connection, companyId, paymentId, {
      forUpdate: true
    });
    if (!payment) {
      return null;
    }

    if (actor) {
      await ensureUserHasOutletAccess(actor.userId, companyId, payment.outlet_id);
    }

    if (payment.status === "POSTED") {
      return findPaymentByIdWithExecutor(connection, companyId, paymentId);
    }

    if (payment.status !== "DRAFT") {
      throw new PaymentStatusError("Payment cannot be posted");
    }

    const invoice = await findInvoiceByIdWithExecutor(connection, companyId, payment.invoice_id, {
      forUpdate: true
    });
    if (!invoice) {
      throw new PaymentAllocationError("Invoice not found");
    }

    if (invoice.status === "VOID") {
      throw new PaymentAllocationError("Invoice is void");
    }

    if (invoice.status !== "POSTED") {
      throw new PaymentAllocationError("Invoice is not posted");
    }

    const outstanding = normalizeMoney(invoice.grand_total - invoice.paid_total);
    if (outstanding <= 0) {
      throw new PaymentAllocationError("Invoice is fully paid");
    }

    const paymentAmount = payment.payment_amount_idr ?? payment.amount;
    const isUnderpayment = paymentAmount < outstanding;
    
    if (options?.settle_shortfall_as_loss && !isUnderpayment) {
      throw new PaymentAllocationError("Cannot settle shortfall as loss for exact or overpayment");
    }

    if (options?.settle_shortfall_as_loss && isUnderpayment && !options.shortfall_reason?.trim()) {
      throw new PaymentAllocationError("shortfall_reason is required when settle_shortfall_as_loss is true");
    }

    let invoiceAmountApplied: number;
    let delta: number;

    if (isUnderpayment && options?.settle_shortfall_as_loss) {
      invoiceAmountApplied = outstanding;
      delta = normalizeMoney(paymentAmount - outstanding);
    } else {
      invoiceAmountApplied = Math.min(paymentAmount, outstanding);
      delta = normalizeMoney(paymentAmount - invoiceAmountApplied);
    }

    const userId = actor?.userId ?? null;
    const shortfallSettledAt = options?.settle_shortfall_as_loss ? new Date() : null;

    await connection.execute<ResultSetHeader>(
      `UPDATE sales_payments
       SET status = 'POSTED',
           invoice_amount_idr = ?,
           payment_delta_idr = ?,
           shortfall_settled_as_loss = ?,
           shortfall_reason = ?,
           shortfall_settled_by_user_id = ?,
           shortfall_settled_at = ?,
           updated_by_user_id = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE company_id = ?
         AND id = ?`,
      [
        invoiceAmountApplied,
        delta,
        options?.settle_shortfall_as_loss ? 1 : 0,
        options?.shortfall_reason ?? null,
        options?.settle_shortfall_as_loss ? userId : null,
        shortfallSettledAt,
        userId,
        companyId,
        paymentId
      ]
    );

    const newPaidTotal = normalizeMoney(Math.min(invoice.grand_total, invoice.paid_total + invoiceAmountApplied));
    const newPaymentStatus =
      newPaidTotal >= invoice.grand_total
        ? "PAID"
        : newPaidTotal > 0
          ? "PARTIAL"
          : "UNPAID";

    await connection.execute<ResultSetHeader>(
      `UPDATE sales_invoices
       SET paid_total = ?,
           payment_status = ?,
           updated_by_user_id = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE company_id = ?
         AND id = ?`,
      [newPaidTotal, newPaymentStatus, userId, companyId, invoice.id]
    );

    const postedPayment = await findPaymentByIdWithExecutor(connection, companyId, paymentId);
    if (!postedPayment) {
      throw new Error("Posted payment not found");
    }

    await postSalesPaymentToJournal(connection, postedPayment, invoice.invoice_no);

    return postedPayment;
  });
}
