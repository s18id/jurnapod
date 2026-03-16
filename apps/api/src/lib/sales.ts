// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import type { ResultSetHeader, RowDataPacket } from "mysql2";
import type { PoolConnection } from "mysql2/promise";
import { getDbPool } from "./db";
import { calculateTaxLines, listCompanyDefaultTaxRates } from "./taxes";
import { postCreditNoteToJournal, postSalesInvoiceToJournal, postSalesPaymentToJournal, voidCreditNoteToJournal } from "./sales-posting";
import {
  DOCUMENT_TYPES,
  getNextDocumentNumber,
  NumberingConflictError,
  NumberingTemplateNotFoundError
} from "./numbering";
import type { DocumentType } from "./numbering";
import { toDateTimeRangeWithTimezone, toRfc3339 } from "./date-helpers";

type SalesInvoiceRow = RowDataPacket & {
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

type SalesInvoiceLineRow = RowDataPacket & {
  id: number;
  invoice_id: number;
  line_no: number;
  line_type: "SERVICE" | "PRODUCT";
  item_id: number | null;
  description: string;
  qty: string | number;
  unit_price: string | number;
  line_total: string | number;
};

type SalesInvoiceTaxRow = RowDataPacket & {
  id: number;
  invoice_id: number;
  tax_rate_id: number;
  amount: string | number;
};

type AccessCheckRow = RowDataPacket & {
  id: number;
};

type IdRow = RowDataPacket & {
  id: number;
};

type QueryExecutor = {
  execute: PoolConnection["execute"];
};

type MutationActor = {
  userId: number;
};

type InvoiceLineInput = {
  line_type?: "SERVICE" | "PRODUCT";
  item_id?: number;
  description: string;
  qty: number;
  unit_price: number;
};

type InvoiceTaxInput = {
  tax_rate_id: number;
  amount: number;
};

type PreparedInvoiceLine = {
  line_no: number;
  line_type: "SERVICE" | "PRODUCT";
  item_id: number | null;
  description: string;
  qty: number;
  unit_price: number;
  line_total: number;
};

type InvoiceListFilters = {
  outletIds?: readonly number[];
  status?: "DRAFT" | "APPROVED" | "POSTED" | "VOID";
  paymentStatus?: "UNPAID" | "PARTIAL" | "PAID";
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  offset?: number;
  timezone?: string;
};

type PaymentListFilters = {
  outletIds?: readonly number[];
  status?: "DRAFT" | "POSTED" | "VOID";
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  offset?: number;
  timezone?: string;
};

export type SalesInvoice = {
  id: number;
  company_id: number;
  outlet_id: number;
  invoice_no: string;
  client_ref?: string | null;
  invoice_date: string;
  due_date?: string | null;
  status: "DRAFT" | "APPROVED" | "POSTED" | "VOID";
  payment_status: "UNPAID" | "PARTIAL" | "PAID";
  subtotal: number;
  tax_amount: number;
  grand_total: number;
  paid_total: number;
  approved_by_user_id?: number | null;
  approved_at?: string | null;
  created_by_user_id?: number | null;
  updated_by_user_id?: number | null;
  created_at: string;
  updated_at: string;
};

export type SalesInvoiceLine = {
  id: number;
  invoice_id: number;
  line_no: number;
  line_type: "SERVICE" | "PRODUCT";
  item_id: number | null;
  description: string;
  qty: number;
  unit_price: number;
  line_total: number;
};

export type SalesInvoiceTax = {
  id: number;
  invoice_id: number;
  tax_rate_id: number;
  amount: number;
};

export type SalesInvoiceDetail = SalesInvoice & {
  lines: SalesInvoiceLine[];
  taxes: SalesInvoiceTax[];
};

type SalesPaymentSplitRow = RowDataPacket & {
  id: number;
  payment_id: number;
  company_id: number;
  outlet_id: number;
  split_index: number;
  account_id: number;
  account_name?: string;
  amount: string | number;
};

type SalesPaymentRow = RowDataPacket & {
  id: number;
  company_id: number;
  outlet_id: number;
  invoice_id: number;
  payment_no: string;
  client_ref?: string | null;
  payment_at: string;
  account_id: number;
  account_name?: string;
  method?: "CASH" | "QRIS" | "CARD";
  status: "DRAFT" | "POSTED" | "VOID";
  amount: string | number;
  invoice_amount_idr?: string | number | null;
  payment_amount_idr?: string | number | null;
  payment_delta_idr?: string | number;
  shortfall_settled_as_loss?: number;
  shortfall_reason?: string | null;
  shortfall_settled_by_user_id?: number | null;
  shortfall_settled_at?: Date | string | null;
  created_by_user_id?: number | null;
  updated_by_user_id?: number | null;
  created_at: string;
  updated_at: string;
};

export type SalesPaymentSplit = {
  id: number;
  payment_id: number;
  company_id: number;
  outlet_id: number;
  split_index: number;
  account_id: number;
  account_name?: string;
  amount: number;
};

export type SalesPayment = {
  id: number;
  company_id: number;
  outlet_id: number;
  invoice_id: number;
  payment_no: string;
  client_ref?: string | null;
  payment_at: string;
  account_id: number;
  account_name?: string;
  method?: "CASH" | "QRIS" | "CARD";
  status: "DRAFT" | "POSTED" | "VOID";
  amount: number;
  actual_amount_idr?: number | null;
  invoice_amount_idr?: number | null;
  payment_amount_idr?: number | null;
  payment_delta_idr?: number;
  shortfall_settled_as_loss?: boolean;
  shortfall_reason?: string | null;
  shortfall_settled_by_user_id?: number | null;
  shortfall_settled_at?: string | null;
  splits?: SalesPaymentSplit[];
  created_by_user_id?: number | null;
  updated_by_user_id?: number | null;
  created_at: string;
  updated_at: string;
};

export class DatabaseConflictError extends Error {}
export class DatabaseReferenceError extends Error {}
export class DatabaseForbiddenError extends Error {}
export class InvoiceStatusError extends Error {}
export class PaymentStatusError extends Error {}
export class PaymentAllocationError extends Error {}

const mysqlDuplicateErrorCode = 1062;

const MONEY_SCALE = 100;

const INVOICE_DUE_TERM_DAYS = {
  NET_0: 0,
  NET_7: 7,
  NET_14: 14,
  NET_15: 15,
  NET_20: 20,
  NET_30: 30,
  NET_45: 45,
  NET_60: 60,
  NET_90: 90
} as const;

type InvoiceDueTerm = keyof typeof INVOICE_DUE_TERM_DAYS;

function normalizeMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * MONEY_SCALE) / MONEY_SCALE;
}

function sumMoney(values: readonly number[]): number {
  let total = 0;
  for (const value of values) {
    total += value;
  }
  return normalizeMoney(total);
}

// Patch 1: Service precision guard - check if value has more than 2 decimal places
function hasMoreThanTwoDecimals(value: number): boolean {
  const str = value.toFixed(10);
  const decimalPart = str.split(".")[1];
  if (!decimalPart) return false;
  return decimalPart.slice(2).split("").some((d) => d !== "0");
}

function formatDateOnly(value: Date | string): string {
  if (typeof value === "string") {
    return value.slice(0, 10);
  }

  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDaysToDateOnly(dateOnly: string, days: number): string {
  const baseDate = new Date(`${dateOnly}T00:00:00.000Z`);
  if (Number.isNaN(baseDate.getTime())) {
    throw new Error("Invalid date");
  }

  baseDate.setUTCDate(baseDate.getUTCDate() + days);
  return baseDate.toISOString().slice(0, 10);
}

function resolveInvoiceDueDate(input: {
  invoiceDate: string;
  dueDate?: string;
  dueTerm?: InvoiceDueTerm;
}): string {
  if (input.dueDate) {
    return input.dueDate;
  }

  const term = input.dueTerm ?? "NET_30";
  return addDaysToDateOnly(input.invoiceDate, INVOICE_DUE_TERM_DAYS[term]);
}

function toMysqlDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid datetime");
  }

  return date.toISOString().slice(0, 19).replace("T", " ");
}

function normalizeInvoice(row: SalesInvoiceRow): SalesInvoice {
  return {
    id: Number(row.id),
    company_id: Number(row.company_id),
    outlet_id: Number(row.outlet_id),
    invoice_no: row.invoice_no,
    client_ref: row.client_ref ?? null,
    invoice_date: formatDateOnly(row.invoice_date),
    due_date: row.due_date ? formatDateOnly(row.due_date) : null,
    status: row.status,
    payment_status: row.payment_status,
    subtotal: Number(row.subtotal),
    tax_amount: Number(row.tax_amount),
    grand_total: Number(row.grand_total),
    paid_total: Number(row.paid_total),
    approved_by_user_id: row.approved_by_user_id ? Number(row.approved_by_user_id) : null,
    approved_at: row.approved_at ? toMysqlDateTime(row.approved_at.toString()) : null,
    created_by_user_id: row.created_by_user_id ? Number(row.created_by_user_id) : null,
    updated_by_user_id: row.updated_by_user_id ? Number(row.updated_by_user_id) : null,
    created_at: toRfc3339(row.created_at),
    updated_at: toRfc3339(row.updated_at)
  };
}

function normalizeInvoiceLine(row: SalesInvoiceLineRow): SalesInvoiceLine {
  return {
    id: Number(row.id),
    invoice_id: Number(row.invoice_id),
    line_no: Number(row.line_no),
    line_type: row.line_type,
    item_id: row.item_id !== null ? Number(row.item_id) : null,
    description: row.description,
    qty: Number(row.qty),
    unit_price: Number(row.unit_price),
    line_total: Number(row.line_total)
  };
}

function buildInvoiceLines(
  lines: readonly InvoiceLineInput[],
  itemLookups: Map<number, ItemLookup>
): {
  lineRows: PreparedInvoiceLine[];
  subtotal: number;
} {
  const lineRows: PreparedInvoiceLine[] = [];

  for (const [index, line] of lines.entries()) {
    const lineType = line.line_type ?? "SERVICE";
    const itemId = line.item_id ?? null;

    let description = line.description;
    let unitPrice = line.unit_price;

    // Auto-populate from item if PRODUCT and fields are missing/empty
    if (lineType === "PRODUCT" && itemId !== null) {
      const item = itemLookups.get(itemId);
      if (item) {
        // Only auto-fill if description is empty or whitespace
        if (!description || description.trim() === "") {
          description = item.name;
        }
        // Only auto-fill if unit_price is 0 or not provided
        if (unitPrice === 0 && item.default_price !== null) {
          unitPrice = item.default_price;
        }
      }
    }

    const lineTotal = normalizeMoney(line.qty * unitPrice);
    lineRows.push({
      line_no: index + 1,
      line_type: lineType,
      item_id: itemId,
      description: description.trim(),
      qty: line.qty,
      unit_price: unitPrice,
      line_total: lineTotal
    });
  }

  const subtotal = sumMoney(lineRows.map((line) => line.line_total));
  return { lineRows, subtotal };
}

function isMysqlError(error: unknown): error is { errno?: number } {
  return typeof error === "object" && error !== null && "errno" in error;
}

async function withTransaction<T>(operation: (connection: PoolConnection) => Promise<T>): Promise<T> {
  const pool = getDbPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    const result = await operation(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function getNumberWithConflictMapping(
  companyId: number,
  outletId: number | null,
  docType: DocumentType,
  requestedNumber?: string | null
): Promise<string> {
  try {
    return await getNextDocumentNumber(companyId, outletId, docType, requestedNumber);
  } catch (error) {
    if (error instanceof NumberingConflictError) {
      throw new DatabaseConflictError(error.message);
    }
    if (error instanceof NumberingTemplateNotFoundError) {
      throw new DatabaseReferenceError("Numbering template not configured");
    }
    throw error;
  }
}

async function ensureCompanyOutletExists(
  executor: QueryExecutor,
  companyId: number,
  outletId: number
): Promise<void> {
  const [rows] = await executor.execute<RowDataPacket[]>(
    `SELECT id
     FROM outlets
     WHERE id = ?
       AND company_id = ?
     LIMIT 1`,
    [outletId, companyId]
  );

  if (rows.length === 0) {
    throw new DatabaseReferenceError("Outlet not found for company");
  }
}

async function ensureUserHasOutletAccess(
  executor: QueryExecutor,
  userId: number,
  companyId: number,
  outletId: number
): Promise<void> {
  const [rows] = await executor.execute<AccessCheckRow[]>(
    `SELECT 1
     FROM users u
     WHERE u.id = ?
       AND u.company_id = ?
       AND u.is_active = 1
       AND (
         EXISTS (
           SELECT 1
           FROM user_role_assignments ura
           INNER JOIN roles r ON r.id = ura.role_id
           WHERE ura.user_id = u.id
             AND r.is_global = 1
             AND ura.outlet_id IS NULL
         )
         OR EXISTS (
           SELECT 1
           FROM user_role_assignments ura
           WHERE ura.user_id = u.id
             AND ura.outlet_id = ?
         )
       )
     LIMIT 1`,
    [userId, companyId, outletId]
  );

  if (rows.length === 0) {
    throw new DatabaseForbiddenError("User cannot access outlet");
  }
}

type ItemLookup = {
  id: number;
  name: string;
  sku: string | null;
  type: string;
  default_price: number | null;
};

async function findItemByIdWithExecutor(
  executor: QueryExecutor,
  companyId: number,
  itemId: number
): Promise<ItemLookup | null> {
  const [rows] = await executor.execute<RowDataPacket[]>(
    `SELECT i.id, i.name, i.sku, i.item_type as type,
            (SELECT price FROM item_prices
             WHERE item_id = i.id AND company_id = i.company_id
             ORDER BY outlet_id IS NULL DESC, is_active DESC, id ASC
             LIMIT 1) as default_price
     FROM items i
     WHERE i.id = ? AND i.company_id = ? AND i.is_active = 1
     LIMIT 1`,
    [itemId, companyId]
  );
  return rows[0] ? {
    id: Number(rows[0].id),
    name: rows[0].name,
    sku: rows[0].sku,
    type: rows[0].type,
    default_price: rows[0].default_price !== null ? Number(rows[0].default_price) : null
  } : null;
}

async function validateAndGetItemForLine(
  executor: QueryExecutor,
  companyId: number,
  itemId: number | undefined,
  lineType: "SERVICE" | "PRODUCT"
): Promise<ItemLookup | null> {
  if (lineType !== "PRODUCT") {
    return null;
  }

  if (typeof itemId !== "number" || itemId <= 0) {
    throw new DatabaseReferenceError("Product lines require a valid item_id");
  }

  const item = await findItemByIdWithExecutor(executor, companyId, itemId);
  if (!item) {
    throw new DatabaseReferenceError("Item not found or not active");
  }

  return item;
}

async function findInvoiceByIdWithExecutor(
  executor: QueryExecutor,
  companyId: number,
  invoiceId: number,
  options?: { forUpdate?: boolean }
): Promise<SalesInvoice | null> {
  const forUpdateClause = options?.forUpdate ? " FOR UPDATE" : "";
  const [rows] = await executor.execute<SalesInvoiceRow[]>(
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

  return normalizeInvoice(rows[0]);
}

async function findInvoiceByClientRefWithExecutor(
  executor: QueryExecutor,
  companyId: number,
  clientRef: string
): Promise<SalesInvoiceDetail | null> {
  const [rows] = await executor.execute<IdRow[]>(
    `SELECT id
     FROM sales_invoices
     WHERE company_id = ?
       AND client_ref = ?
     LIMIT 1`,
    [companyId, clientRef]
  );

  if (!rows[0]) {
    return null;
  }

  return findInvoiceDetailWithExecutor(executor, companyId, Number(rows[0].id));
}

async function listInvoiceLinesWithExecutor(
  executor: QueryExecutor,
  companyId: number,
  invoiceId: number
): Promise<SalesInvoiceLine[]> {
  const [rows] = await executor.execute<SalesInvoiceLineRow[]>(
    `SELECT id, invoice_id, line_no, line_type, item_id, description, qty, unit_price, line_total
     FROM sales_invoice_lines
     WHERE company_id = ?
       AND invoice_id = ?
     ORDER BY line_no ASC`,
    [companyId, invoiceId]
  );

  return rows.map(normalizeInvoiceLine);
}

function normalizeInvoiceTax(row: SalesInvoiceTaxRow): SalesInvoiceTax {
  return {
    id: Number(row.id),
    invoice_id: Number(row.invoice_id),
    tax_rate_id: Number(row.tax_rate_id),
    amount: Number(row.amount)
  };
}

async function listInvoiceTaxesWithExecutor(
  executor: QueryExecutor,
  companyId: number,
  invoiceId: number
): Promise<SalesInvoiceTax[]> {
  const [rows] = await executor.execute<SalesInvoiceTaxRow[]>(
    `SELECT id, sales_invoice_id AS invoice_id, tax_rate_id, amount
     FROM sales_invoice_taxes
     WHERE company_id = ?
       AND sales_invoice_id = ?
     ORDER BY id ASC`,
    [companyId, invoiceId]
  );

  return rows.map(normalizeInvoiceTax);
}

async function findInvoiceDetailWithExecutor(
  executor: QueryExecutor,
  companyId: number,
  invoiceId: number
): Promise<SalesInvoiceDetail | null> {
  const invoice = await findInvoiceByIdWithExecutor(executor, companyId, invoiceId);
  if (!invoice) {
    return null;
  }

  const [lines, taxes] = await Promise.all([
    listInvoiceLinesWithExecutor(executor, companyId, invoiceId),
    listInvoiceTaxesWithExecutor(executor, companyId, invoiceId)
  ]);
  return { ...invoice, lines, taxes };
}

function buildInvoiceWhereClause(companyId: number, filters: InvoiceListFilters) {
  const conditions: string[] = ["company_id = ?"];
  const values: Array<string | number> = [companyId];

  if (filters.outletIds) {
    if (filters.outletIds.length === 0) {
      return { clause: "", values: [], isEmpty: true };
    }
    const placeholders = filters.outletIds.map(() => "?").join(", ");
    conditions.push(`outlet_id IN (${placeholders})`);
    values.push(...filters.outletIds);
  }

  if (filters.status) {
    conditions.push("status = ?");
    values.push(filters.status);
  }

  if (filters.paymentStatus) {
    conditions.push("payment_status = ?");
    values.push(filters.paymentStatus);
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
    conditions.push("invoice_date >= ?");
    values.push(dateFrom);
  }

  if (dateTo) {
    conditions.push("invoice_date <= ?");
    values.push(dateTo);
  }

  return { clause: conditions.join(" AND "), values, isEmpty: false };
}

export async function listInvoices(companyId: number, filters: InvoiceListFilters) {
  const pool = getDbPool();
  const limit = filters.limit ?? 50;
  const offset = filters.offset ?? 0;
  const where = buildInvoiceWhereClause(companyId, filters);

  if (where.isEmpty) {
    return { total: 0, invoices: [] };
  }

  const [countRows] = await pool.execute<RowDataPacket[]>(
    `SELECT COUNT(*) as total
     FROM sales_invoices
     WHERE ${where.clause}`,
    where.values
  );
  const total = Number(countRows[0]?.total ?? 0);

  const [rows] = await pool.execute<SalesInvoiceRow[]>(
    `SELECT id, company_id, outlet_id, invoice_no, client_ref, invoice_date, due_date, status, payment_status,
            subtotal, tax_amount, grand_total, paid_total,
            approved_by_user_id, approved_at,
            created_by_user_id, updated_by_user_id, created_at, updated_at
     FROM sales_invoices
     WHERE ${where.clause}
     ORDER BY invoice_date DESC, id DESC
     LIMIT ? OFFSET ?`,
    [...where.values, limit, offset]
  );

  return { total, invoices: rows.map(normalizeInvoice) };
}

export async function getInvoice(companyId: number, invoiceId: number) {
  const pool = getDbPool();
  return findInvoiceDetailWithExecutor(pool, companyId, invoiceId);
}

export async function createInvoice(
  companyId: number,
  input: {
    outlet_id: number;
    client_ref?: string;
    invoice_no?: string;
    invoice_date: string;
    due_date?: string;
    due_term?: InvoiceDueTerm;
    tax_amount: number;
    lines: InvoiceLineInput[];
    taxes?: InvoiceTaxInput[];
  },
  actor?: MutationActor
): Promise<SalesInvoiceDetail> {
  return withTransaction(async (connection) => {
    if (input.client_ref) {
      const existing = await findInvoiceByClientRefWithExecutor(
        connection,
        companyId,
        input.client_ref
      );
      if (existing) {
        if (actor) {
          await ensureUserHasOutletAccess(connection, actor.userId, companyId, existing.outlet_id);
        }
        return existing;
      }
    }

    await ensureCompanyOutletExists(connection, companyId, input.outlet_id);
    if (actor) {
      await ensureUserHasOutletAccess(connection, actor.userId, companyId, input.outlet_id);
    }

    // Validate and fetch items for PRODUCT lines
    const itemLookups = new Map<number, ItemLookup>();
    for (const line of input.lines) {
      const lineType = line.line_type ?? "SERVICE";
      if (lineType === "PRODUCT") {
        const item = await validateAndGetItemForLine(connection, companyId, line.item_id, lineType);
        if (item) {
          itemLookups.set(item.id, item);
        }
      }
    }

    const invoiceNo = await getNumberWithConflictMapping(
      companyId,
      input.outlet_id,
      DOCUMENT_TYPES.SALES_INVOICE,
      input.invoice_no
    );
    const dueDate = resolveInvoiceDueDate({
      invoiceDate: input.invoice_date,
      dueDate: input.due_date,
      dueTerm: input.due_term
    });

    const { lineRows, subtotal } = buildInvoiceLines(input.lines, itemLookups);
    let taxAmount = normalizeMoney(input.tax_amount);
    let taxLines: Array<{ tax_rate_id: number; amount: number }> = [];

    if (input.taxes && input.taxes.length > 0) {
      const taxRateIds = input.taxes.map((tax) => tax.tax_rate_id);
      const placeholders = taxRateIds.map(() => "?").join(", ");
      const [rows] = await connection.execute<RowDataPacket[]>(
        `SELECT id
         FROM tax_rates
         WHERE company_id = ?
           AND is_active = 1
           AND id IN (${placeholders})`,
        [companyId, ...taxRateIds]
      );

      const matched = new Set((rows as Array<{ id?: number }>).map((row) => Number(row.id)));
      if (matched.size !== taxRateIds.length) {
        throw new DatabaseReferenceError("Invalid tax rate");
      }

      taxLines = input.taxes.map((tax) => ({
        tax_rate_id: tax.tax_rate_id,
        amount: normalizeMoney(tax.amount)
      })).filter((tax) => tax.tax_rate_id > 0 && tax.amount > 0);
      taxAmount = normalizeMoney(taxLines.reduce((acc, tax) => acc + tax.amount, 0));
    } else {
      const defaultTaxRates = await listCompanyDefaultTaxRates(connection, companyId);
      if (defaultTaxRates.length > 0) {
        taxLines = calculateTaxLines({ grossAmount: subtotal, rates: defaultTaxRates }).filter(
          (tax) => tax.tax_rate_id > 0 && tax.amount > 0 
        );
        taxAmount = normalizeMoney(taxLines.reduce((acc, tax) => acc + tax.amount, 0));
      }
    }

    const grandTotal = normalizeMoney(subtotal + taxAmount);

    try {
      const [result] = await connection.execute<ResultSetHeader>(
          `INSERT INTO sales_invoices (
            company_id,
            outlet_id,
            invoice_no,
            invoice_date,
            due_date,
            client_ref,
            status,
            payment_status,
            subtotal,
           tax_amount,
           grand_total,
           paid_total,
           created_by_user_id,
           updated_by_user_id
          ) VALUES (?, ?, ?, ?, ?, ?, 'DRAFT', 'UNPAID', ?, ?, ?, 0, ?, ?)`,
        [
          companyId,
          input.outlet_id,
          invoiceNo,
          input.invoice_date,
          dueDate,
          input.client_ref ?? null,
          subtotal,
          taxAmount,
          grandTotal,
          actor?.userId ?? null,
          actor?.userId ?? null
        ]
      );

      const invoiceId = Number(result.insertId);

      if (lineRows.length > 0) {
        const placeholders = lineRows.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").join(", ");
        const values: Array<string | number | null> = [];
        for (const line of lineRows) {
          values.push(
            invoiceId,
            companyId,
            input.outlet_id,
            line.line_no,
            line.line_type,
            line.item_id,
            line.description,
            line.qty,
            line.unit_price,
            line.line_total
          );
        }

        await connection.execute(
          `INSERT INTO sales_invoice_lines (
             invoice_id,
             company_id,
             outlet_id,
             line_no,
             line_type,
             item_id,
             description,
             qty,
             unit_price,
             line_total
           ) VALUES ${placeholders}`,
          values
        );
      }

      if (taxLines.length > 0) {
        const placeholders = taxLines.map(() => "(?, ?, ?, ?, ?)").join(", ");
        const values = taxLines.flatMap((tax) => [
          invoiceId,
          companyId,
          input.outlet_id,
          tax.tax_rate_id,
          tax.amount
        ]);

        await connection.execute(
          `INSERT INTO sales_invoice_taxes (
             sales_invoice_id,
             company_id,
             outlet_id,
             tax_rate_id,
             amount
           ) VALUES ${placeholders}`,
          values
        );
      }

      const invoice = await findInvoiceDetailWithExecutor(connection, companyId, invoiceId);
      if (!invoice) {
        throw new Error("Created invoice not found");
      }

      return invoice;
    } catch (error) {
      if (isMysqlError(error) && error.errno === mysqlDuplicateErrorCode) {
        if (input.client_ref) {
          const existing = await findInvoiceByClientRefWithExecutor(
            connection,
            companyId,
            input.client_ref
          );
          if (existing) {
            if (actor) {
              await ensureUserHasOutletAccess(
                connection,
                actor.userId,
                companyId,
                existing.outlet_id
              );
            }
            return existing;
          }
        }
        throw new DatabaseConflictError("Duplicate invoice");
      }

      throw error;
    }
  });
}

export async function updateInvoice(
  companyId: number,
  invoiceId: number,
  input: {
    outlet_id?: number;
    invoice_no?: string;
    invoice_date?: string;
    due_date?: string;
    due_term?: InvoiceDueTerm;
    tax_amount?: number;
    lines?: InvoiceLineInput[];
    taxes?: InvoiceTaxInput[];
  },
  actor?: MutationActor
): Promise<SalesInvoiceDetail | null> {
  return withTransaction(async (connection) => {
    const current = await findInvoiceByIdWithExecutor(connection, companyId, invoiceId, {
      forUpdate: true
    });
    if (!current) {
      return null;
    }

    if (current.status !== "DRAFT") {
      throw new InvoiceStatusError("Invoice is not editable");
    }

    if (actor) {
      await ensureUserHasOutletAccess(connection, actor.userId, companyId, current.outlet_id);
    }

    if (typeof input.outlet_id === "number") {
      await ensureCompanyOutletExists(connection, companyId, input.outlet_id);
      if (actor) {
        await ensureUserHasOutletAccess(connection, actor.userId, companyId, input.outlet_id);
      }
    }

    const nextOutletId = input.outlet_id ?? current.outlet_id;
    const nextInvoiceNo = input.invoice_no ?? current.invoice_no;
    const nextInvoiceDate = input.invoice_date ?? current.invoice_date;
    const nextDueDate =
      typeof input.due_date === "string"
        ? input.due_date
        : input.due_term
          ? resolveInvoiceDueDate({
              invoiceDate: nextInvoiceDate,
              dueTerm: input.due_term
            })
          : current.due_date ?? null;

    // Validate and fetch items for PRODUCT lines
    const itemLookups = new Map<number, ItemLookup>();
    if (input.lines) {
      for (const line of input.lines) {
        const lineType = line.line_type ?? "SERVICE";
        if (lineType === "PRODUCT") {
          const item = await validateAndGetItemForLine(connection, companyId, line.item_id, lineType);
          if (item) {
            itemLookups.set(item.id, item);
          }
        }
      }
    }

    let lineRows: PreparedInvoiceLine[] | null = null;
    let subtotal = current.subtotal;

    if (input.lines) {
      const computed = buildInvoiceLines(input.lines, itemLookups);
      lineRows = computed.lineRows;
      subtotal = computed.subtotal;
    } else if (nextOutletId !== current.outlet_id) {
      const existingLines = await listInvoiceLinesWithExecutor(connection, companyId, invoiceId);
      const inputs = existingLines.map((line) => ({
        line_type: line.line_type,
        item_id: line.item_id ?? undefined,
        description: line.description,
        qty: line.qty,
        unit_price: line.unit_price
      }));
      const computed = buildInvoiceLines(inputs, itemLookups);
      lineRows = computed.lineRows;
      subtotal = computed.subtotal;
    }

    let taxAmount =
      typeof input.tax_amount === "number"
        ? normalizeMoney(input.tax_amount)
        : current.tax_amount;
    let taxLines: Array<{ tax_rate_id: number; amount: number }> | null = null;

    if (input.taxes !== undefined) {
      if (input.taxes.length > 0) {
        const taxRateIds = input.taxes.map((tax) => tax.tax_rate_id);
        const placeholders = taxRateIds.map(() => "?").join(", ");
        const [rows] = await connection.execute<RowDataPacket[]>(
          `SELECT id
           FROM tax_rates
           WHERE company_id = ?
             AND is_active = 1
             AND id IN (${placeholders})`,
          [companyId, ...taxRateIds]
        );

        const matched = new Set((rows as Array<{ id?: number }>).map((row) => Number(row.id)));
        if (matched.size !== taxRateIds.length) {
          throw new DatabaseReferenceError("Invalid tax rate");
        }

        taxLines = input.taxes.map((tax) => ({
          tax_rate_id: tax.tax_rate_id,
          amount: normalizeMoney(tax.amount)
        })).filter((tax) => tax.amount > 0);
        taxAmount = normalizeMoney(taxLines.reduce((acc, tax) => acc + tax.amount, 0));
      } else {
        taxLines = [];
        taxAmount = 0;
      }
    }
    const grandTotal = normalizeMoney(subtotal + taxAmount);

    if (lineRows) {
      await connection.execute<ResultSetHeader>(
        `DELETE FROM sales_invoice_lines
         WHERE company_id = ?
           AND outlet_id = ?
           AND invoice_id = ?`,
        [companyId, current.outlet_id, invoiceId]
      );
    }

    try {
      await connection.execute<ResultSetHeader>(
        `UPDATE sales_invoices
         SET outlet_id = ?,
             invoice_no = ?,
             invoice_date = ?,
             due_date = ?,
             subtotal = ?,
             tax_amount = ?,
             grand_total = ?,
             updated_by_user_id = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE company_id = ?
           AND id = ?`,
        [
          nextOutletId,
          nextInvoiceNo,
          nextInvoiceDate,
          nextDueDate,
          subtotal,
          taxAmount,
          grandTotal,
          actor?.userId ?? null,
          companyId,
          invoiceId
        ]
      );
    } catch (error) {
      if (isMysqlError(error) && error.errno === mysqlDuplicateErrorCode) {
        throw new DatabaseConflictError("Duplicate invoice");
      }

      throw error;
    }

    if (lineRows) {
      const placeholders = lineRows.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").join(", ");
      const values: Array<string | number | null> = [];
      for (const line of lineRows) {
        values.push(
          invoiceId,
          companyId,
          nextOutletId,
          line.line_no,
          line.line_type,
          line.item_id,
          line.description,
          line.qty,
          line.unit_price,
          line.line_total
        );
      }

      await connection.execute(
        `INSERT INTO sales_invoice_lines (
           invoice_id,
           company_id,
           outlet_id,
           line_no,
           line_type,
           item_id,
           description,
           qty,
           unit_price,
           line_total
         ) VALUES ${placeholders}`,
        values
      );
    }

    if (taxLines !== null) {
      await connection.execute<ResultSetHeader>(
        `DELETE FROM sales_invoice_taxes
         WHERE company_id = ?
           AND sales_invoice_id = ?`,
        [companyId, invoiceId]
      );

      if (taxLines.length > 0) {
        const placeholders = taxLines.map(() => "(?, ?, ?, ?, ?)").join(", ");
        const values = taxLines.flatMap((tax) => [
          invoiceId,
          companyId,
          nextOutletId,
          tax.tax_rate_id,
          tax.amount
        ]);

        await connection.execute(
          `INSERT INTO sales_invoice_taxes (
             sales_invoice_id,
             company_id,
             outlet_id,
             tax_rate_id,
             amount
           ) VALUES ${placeholders}`,
          values
        );
      }
    }

    return findInvoiceDetailWithExecutor(connection, companyId, invoiceId);
  });
}

export async function postInvoice(
  companyId: number,
  invoiceId: number,
  actor?: MutationActor
): Promise<SalesInvoiceDetail | null> {
  return withTransaction(async (connection) => {
    const invoice = await findInvoiceByIdWithExecutor(connection, companyId, invoiceId, {
      forUpdate: true
    });
    if (!invoice) {
      return null;
    }

    if (actor) {
      await ensureUserHasOutletAccess(connection, actor.userId, companyId, invoice.outlet_id);
    }

    if (invoice.status === "POSTED") {
      return findInvoiceDetailWithExecutor(connection, companyId, invoiceId);
    }

    if (invoice.status !== "DRAFT" && invoice.status !== "APPROVED") {
      throw new InvoiceStatusError("Invoice cannot be posted");
    }

    await connection.execute<ResultSetHeader>(
      `UPDATE sales_invoices
       SET status = 'POSTED',
           updated_by_user_id = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE company_id = ?
         AND id = ?`,
       [actor?.userId ?? null, companyId, invoiceId]
     );

    const postedInvoice = await findInvoiceDetailWithExecutor(connection, companyId, invoiceId);
    if (!postedInvoice) {
      throw new Error("Posted invoice not found");
    }

    await postSalesInvoiceToJournal(connection, postedInvoice);

    return postedInvoice;
  });
}

function normalizePaymentSplit(row: SalesPaymentSplitRow): SalesPaymentSplit {
  return {
    id: Number(row.id),
    payment_id: Number(row.payment_id),
    company_id: Number(row.company_id),
    outlet_id: Number(row.outlet_id),
    split_index: Number(row.split_index),
    account_id: Number(row.account_id),
    account_name: row.account_name,
    amount: normalizeMoney(Number(row.amount))
  };
}

function normalizePayment(row: SalesPaymentRow): SalesPayment {
  return {
    id: Number(row.id),
    company_id: Number(row.company_id),
    outlet_id: Number(row.outlet_id),
    invoice_id: Number(row.invoice_id),
    payment_no: row.payment_no,
    client_ref: row.client_ref ?? null,
    payment_at: row.payment_at,
    account_id: Number(row.account_id),
    account_name: row.account_name,
    method: row.method,
    status: row.status,
    amount: normalizeMoney(Number(row.amount)),
    actual_amount_idr: row.actual_amount_idr !== undefined && row.actual_amount_idr !== null 
      ? normalizeMoney(Number(row.actual_amount_idr)) 
      : undefined,
    invoice_amount_idr: row.invoice_amount_idr !== undefined && row.invoice_amount_idr !== null 
      ? normalizeMoney(Number(row.invoice_amount_idr)) 
      : undefined,
    payment_amount_idr: row.payment_amount_idr !== undefined && row.payment_amount_idr !== null 
      ? normalizeMoney(Number(row.payment_amount_idr)) 
      : undefined,
    payment_delta_idr: row.payment_delta_idr !== undefined 
      ? normalizeMoney(Number(row.payment_delta_idr)) 
      : undefined,
    shortfall_settled_as_loss: row.shortfall_settled_as_loss === 1 ? true : row.shortfall_settled_as_loss === 0 ? false : undefined,
    shortfall_reason: row.shortfall_reason ?? null,
    shortfall_settled_by_user_id: row.shortfall_settled_by_user_id ? Number(row.shortfall_settled_by_user_id) : null,
    shortfall_settled_at: row.shortfall_settled_at ? toRfc3339(row.shortfall_settled_at) : null,
    created_by_user_id: row.created_by_user_id ? Number(row.created_by_user_id) : null,
    updated_by_user_id: row.updated_by_user_id ? Number(row.updated_by_user_id) : null,
    created_at: toRfc3339(row.created_at),
    updated_at: toRfc3339(row.updated_at)
  };
}

async function fetchPaymentSplits(
  executor: QueryExecutor,
  companyId: number,
  paymentId: number
): Promise<SalesPaymentSplit[]> {
  const [rows] = await executor.execute<SalesPaymentSplitRow[]>(
    `SELECT sps.id, sps.payment_id, sps.company_id, sps.outlet_id, sps.split_index,
            sps.account_id, a.name as account_name, sps.amount
     FROM sales_payment_splits sps
     LEFT JOIN accounts a ON a.id = sps.account_id AND a.company_id = sps.company_id
     WHERE sps.company_id = ?
       AND sps.payment_id = ?
     ORDER BY sps.split_index`,
    [companyId, paymentId]
  );
  return rows.map(normalizePaymentSplit);
}

async function fetchPaymentSplitsForMultiple(
  executor: QueryExecutor,
  companyId: number,
  paymentIds: number[]
): Promise<Map<number, SalesPaymentSplit[]>> {
  if (paymentIds.length === 0) {
    return new Map();
  }

  const placeholders = paymentIds.map(() => "?").join(", ");
  const [rows] = await executor.execute<SalesPaymentSplitRow[]>(
    `SELECT sps.id, sps.payment_id, sps.company_id, sps.outlet_id, sps.split_index,
            sps.account_id, a.name as account_name, sps.amount
     FROM sales_payment_splits sps
     LEFT JOIN accounts a ON a.id = sps.account_id AND a.company_id = sps.company_id
     WHERE sps.company_id = ?
       AND sps.payment_id IN (${placeholders})
     ORDER BY sps.payment_id, sps.split_index`,
    [companyId, ...paymentIds]
  );

  const splitsByPaymentId = new Map<number, SalesPaymentSplit[]>();
  for (const row of rows) {
    const paymentId = Number(row.payment_id);
    if (!splitsByPaymentId.has(paymentId)) {
      splitsByPaymentId.set(paymentId, []);
    }
    splitsByPaymentId.get(paymentId)!.push(normalizePaymentSplit(row));
  }

  return splitsByPaymentId;
}

function attachSplitsToPayment(
  payment: SalesPayment,
  splits: SalesPaymentSplit[]
): SalesPayment {
  return { ...payment, splits };
}

// Phase 8: Helper to build canonical payment comparison data
type CanonicalPaymentInput = {
  outlet_id: number;
  invoice_id: number;
  payment_at: string;
  amount_minor: number;
  account_id: number;
  splits: Array<{ account_id: number; amount_minor: number }>;
};

// Patch A: Normalize datetimes for idempotency comparison.
// Incoming payloads are persisted as DATETIME (timezone-less) and then read back through mysql2,
// which interprets DATETIME in local timezone. We mirror that for stable comparisons.
function normalizeIncomingDatetimeForCompare(paymentAt: string): string {
  const persistedValue = toMysqlDateTime(paymentAt);
  const localInterpreted = new Date(persistedValue.replace(" ", "T"));
  if (Number.isNaN(localInterpreted.getTime())) {
    throw new Error("Invalid datetime");
  }
  return toMysqlDateTime(localInterpreted.toISOString());
}

function normalizeExistingDatetimeForCompare(paymentAt: string): string {
  return toMysqlDateTime(paymentAt);
}

function buildCanonicalInput(
  input: {
    outlet_id: number;
    invoice_id: number;
    payment_at: string;
    amount: number;
    account_id?: number;
    splits?: Array<{ account_id: number; amount: number }>;
  }
): CanonicalPaymentInput {
  const hasSplits = input.splits && input.splits.length > 0;
  const effectiveAccountId = hasSplits ? input.splits![0].account_id : input.account_id!;
  const splits = hasSplits
    ? input.splits!.map(s => ({ account_id: s.account_id, amount_minor: Math.round(s.amount * 100) }))
    : [{ account_id: effectiveAccountId, amount_minor: Math.round(input.amount * 100) }];

  return {
    outlet_id: input.outlet_id,
    invoice_id: input.invoice_id,
    payment_at: normalizeIncomingDatetimeForCompare(input.payment_at),
    amount_minor: Math.round(input.amount * 100),
    account_id: effectiveAccountId,
    splits
  };
}

function buildCanonicalFromExisting(payment: SalesPayment): CanonicalPaymentInput {
  const splits = payment.splits && payment.splits.length > 0
    ? payment.splits.map(s => ({ account_id: s.account_id, amount_minor: Math.round(s.amount * 100) }))
    : [{ account_id: payment.account_id, amount_minor: Math.round(payment.amount * 100) }];

  return {
    outlet_id: payment.outlet_id,
    invoice_id: payment.invoice_id,
    payment_at: normalizeExistingDatetimeForCompare(payment.payment_at),
    amount_minor: Math.round(payment.amount * 100),
    account_id: payment.account_id,
    splits
  };
}

function canonicalPaymentsEqual(a: CanonicalPaymentInput, b: CanonicalPaymentInput): boolean {
  if (a.outlet_id !== b.outlet_id) return false;
  if (a.invoice_id !== b.invoice_id) return false;
  if (a.payment_at !== b.payment_at) return false;
  if (a.amount_minor !== b.amount_minor) return false;
  if (a.account_id !== b.account_id) return false;
  if (a.splits.length !== b.splits.length) return false;

  // Compare splits in order (order matters per spec)
  for (let i = 0; i < a.splits.length; i++) {
    if (a.splits[i].account_id !== b.splits[i].account_id) return false;
    if (a.splits[i].amount_minor !== b.splits[i].amount_minor) return false;
  }

  return true;
}

async function findPaymentByIdWithExecutor(
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

async function findPaymentByClientRefWithExecutor(
  executor: QueryExecutor,
  companyId: number,
  clientRef: string
): Promise<SalesPayment | null> {
  const [rows] = await executor.execute<IdRow[]>(
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
          await ensureUserHasOutletAccess(connection, actor.userId, companyId, existing.outlet_id);
        }
        return existing;
      }
    }

    await ensureCompanyOutletExists(connection, companyId, input.outlet_id);
    if (actor) {
      await ensureUserHasOutletAccess(connection, actor.userId, companyId, input.outlet_id);
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
      if (isMysqlError(error) && error.errno === mysqlDuplicateErrorCode) {
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
                connection,
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
      await ensureUserHasOutletAccess(connection, actor.userId, companyId, current.outlet_id);
    }

    if (typeof input.outlet_id === "number") {
      await ensureCompanyOutletExists(connection, companyId, input.outlet_id);
      if (actor) {
        await ensureUserHasOutletAccess(connection, actor.userId, companyId, input.outlet_id);
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
    const nextPaymentAt = toMysqlDateTime(input.payment_at ?? current.payment_at);
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
      if (isMysqlError(error) && error.errno === mysqlDuplicateErrorCode) {
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
      await ensureUserHasOutletAccess(connection, actor.userId, companyId, payment.outlet_id);
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

type SalesOrderStatus = "DRAFT" | "CONFIRMED" | "COMPLETED" | "VOID";

type SalesOrderRow = RowDataPacket & {
  id: number;
  company_id: number;
  outlet_id: number;
  order_no: string;
  client_ref?: string | null;
  order_date: string;
  expected_date: string | null;
  status: SalesOrderStatus;
  notes: string | null;
  subtotal: string | number;
  tax_amount: string | number;
  grand_total: string | number;
  confirmed_by_user_id: number | null;
  confirmed_at: string | null;
  completed_by_user_id: number | null;
  completed_at: string | null;
  created_by_user_id: number | null;
  updated_by_user_id: number | null;
  created_at: string;
  updated_at: string;
};

type SalesOrderLineRow = RowDataPacket & {
  id: number;
  order_id: number;
  line_no: number;
  line_type: "SERVICE" | "PRODUCT";
  item_id: number | null;
  description: string;
  qty: string | number;
  unit_price: string | number;
  line_total: string | number;
};

export type SalesOrder = {
  id: number;
  company_id: number;
  outlet_id: number;
  order_no: string;
  client_ref?: string | null;
  order_date: string;
  expected_date: string | null;
  status: SalesOrderStatus;
  notes: string | null;
  subtotal: number;
  tax_amount: number;
  grand_total: number;
  confirmed_by_user_id?: number | null;
  confirmed_at?: string | null;
  completed_by_user_id?: number | null;
  completed_at?: string | null;
  created_by_user_id?: number | null;
  updated_by_user_id?: number | null;
  created_at: string;
  updated_at: string;
};

export type SalesOrderLine = {
  id: number;
  order_id: number;
  line_no: number;
  line_type: "SERVICE" | "PRODUCT";
  item_id: number | null;
  description: string;
  qty: number;
  unit_price: number;
  line_total: number;
};

export type SalesOrderDetail = SalesOrder & {
  lines: SalesOrderLine[];
};

type OrderLineInput = {
  line_type?: "SERVICE" | "PRODUCT";
  item_id?: number;
  description: string;
  qty: number;
  unit_price: number;
};

type OrderListFilters = {
  outletIds?: readonly number[];
  status?: SalesOrderStatus;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  offset?: number;
  timezone?: string;
};

function buildOrderLines(
  lines: OrderLineInput[],
  itemLookups: Map<number, ItemLookup>
): Array<{
  line_no: number;
  line_type: "SERVICE" | "PRODUCT";
  item_id: number | null;
  description: string;
  qty: number;
  unit_price: number;
  line_total: number
}> {
  return lines.map((line, index) => {
    const lineType = line.line_type ?? "SERVICE";
    const itemId = line.item_id ?? null;

    let description = line.description.trim();
    let unitPrice = normalizeMoney(line.unit_price);

    if (lineType === "PRODUCT" && itemId !== null) {
      const item = itemLookups.get(itemId);
      if (item) {
        if (!description || description.trim() === "") {
          description = item.name;
        }
        if (unitPrice === 0 && item.default_price !== null) {
          unitPrice = item.default_price;
        }
      }
    }

    const lineTotal = normalizeMoney(line.qty * unitPrice);
    return {
      line_no: index + 1,
      line_type: lineType,
      item_id: itemId,
      description,
      qty: line.qty,
      unit_price: unitPrice,
      line_total: lineTotal
    };
  });
}

async function findOrderByIdWithExecutor(
  executor: QueryExecutor,
  companyId: number,
  orderId: number,
  options?: { forUpdate?: boolean }
): Promise<SalesOrderRow | null> {
  const forUpdateClause = options?.forUpdate ? " FOR UPDATE" : "";
  const [rows] = await executor.execute<SalesOrderRow[]>(
    `SELECT * FROM sales_orders WHERE company_id = ? AND id = ?${forUpdateClause}`,
    [companyId, orderId]
  );
  return rows[0] || null;
}

async function findOrderByClientRefWithExecutor(
  executor: QueryExecutor,
  companyId: number,
  clientRef: string
): Promise<SalesOrderRow | null> {
  const [rows] = await executor.execute<SalesOrderRow[]>(
    `SELECT * FROM sales_orders WHERE company_id = ? AND client_ref = ?`,
    [companyId, clientRef]
  );
  return rows[0] || null;
}

async function findOrderLinesByOrderId(
  executor: QueryExecutor,
  orderId: number
): Promise<SalesOrderLineRow[]> {
  const [rows] = await executor.execute<SalesOrderLineRow[]>(
    `SELECT id, order_id, line_no, line_type, item_id, description, qty, unit_price, line_total
     FROM sales_order_lines WHERE order_id = ? ORDER BY line_no`,
    [orderId]
  );
  return rows;
}

function normalizeSalesOrderRow(row: SalesOrderRow): SalesOrder {
  return {
    id: row.id,
    company_id: row.company_id,
    outlet_id: row.outlet_id,
    order_no: row.order_no,
    client_ref: row.client_ref ?? undefined,
    order_date: formatDateOnly(row.order_date),
    expected_date: row.expected_date ? formatDateOnly(row.expected_date) : null,
    status: row.status,
    notes: row.notes ?? null,
    subtotal: Number(row.subtotal),
    tax_amount: Number(row.tax_amount),
    grand_total: Number(row.grand_total),
    confirmed_by_user_id: row.confirmed_by_user_id,
    confirmed_at: row.confirmed_at ? toMysqlDateTime(row.confirmed_at.toString()) : undefined,
    completed_by_user_id: row.completed_by_user_id,
    completed_at: row.completed_at ? toMysqlDateTime(row.completed_at.toString()) : undefined,
    created_by_user_id: row.created_by_user_id,
    updated_by_user_id: row.updated_by_user_id,
    created_at: toMysqlDateTime(row.created_at.toString()),
    updated_at: toMysqlDateTime(row.updated_at.toString())
  };
}

function normalizeSalesOrderLineRow(row: SalesOrderLineRow): SalesOrderLine {
  return {
    id: row.id,
    order_id: row.order_id,
    line_no: row.line_no,
    line_type: row.line_type,
    item_id: row.item_id !== null ? Number(row.item_id) : null,
    description: row.description,
    qty: Number(row.qty),
    unit_price: Number(row.unit_price),
    line_total: Number(row.line_total)
  };
}

async function findOrderDetailWithExecutor(
  executor: QueryExecutor,
  companyId: number,
  orderId: number
): Promise<SalesOrderDetail | null> {
  const order = await findOrderByIdWithExecutor(executor, companyId, orderId);
  if (!order) {
    return null;
  }

  const lines = await findOrderLinesByOrderId(executor, orderId);
  return {
    ...normalizeSalesOrderRow(order),
    lines: lines.map(normalizeSalesOrderLineRow)
  };
}

export async function createOrder(
  companyId: number,
  input: {
    outlet_id: number;
    client_ref?: string;
    order_no?: string;
    order_date: string;
    expected_date?: string;
    notes?: string;
    lines: OrderLineInput[];
  },
  actor?: MutationActor
): Promise<SalesOrderDetail> {
  return withTransaction(async (connection) => {
    if (input.client_ref) {
      const existing = await findOrderByClientRefWithExecutor(connection, companyId, input.client_ref);
      if (existing) {
        if (actor) {
          await ensureUserHasOutletAccess(connection, actor.userId, companyId, existing.outlet_id);
        }
        const lines = await findOrderLinesByOrderId(connection, existing.id);
        return {
          ...normalizeSalesOrderRow(existing),
          lines: lines.map(normalizeSalesOrderLineRow)
        };
      }
    }

    await ensureCompanyOutletExists(connection, companyId, input.outlet_id);
    if (actor) {
      await ensureUserHasOutletAccess(connection, actor.userId, companyId, input.outlet_id);
    }

    // Validate and fetch items for PRODUCT lines
    const itemLookups = new Map<number, ItemLookup>();
    for (const line of input.lines) {
      const lineType = line.line_type ?? "SERVICE";
      if (lineType === "PRODUCT") {
        const item = await validateAndGetItemForLine(connection, companyId, line.item_id, lineType);
        if (item) {
          itemLookups.set(item.id, item);
        }
      }
    }

    const orderNo = await getNumberWithConflictMapping(
      companyId,
      input.outlet_id,
      DOCUMENT_TYPES.SALES_ORDER,
      input.order_no
    );

    const lineRows = buildOrderLines(input.lines, itemLookups);
    const subtotal = lineRows.reduce((acc, line) => acc + line.line_total, 0);

    const [result] = await connection.execute<ResultSetHeader>(
      `INSERT INTO sales_orders (
        company_id,
        outlet_id,
        order_no,
        order_date,
        expected_date,
        client_ref,
        status,
        notes,
        subtotal,
        tax_amount,
        grand_total,
        created_by_user_id,
        updated_by_user_id
      ) VALUES (?, ?, ?, ?, ?, ?, 'DRAFT', ?, ?, 0, ?, ?, ?)`,
      [
        companyId,
        input.outlet_id,
        orderNo,
        input.order_date,
        input.expected_date ?? null,
        input.client_ref ?? null,
        input.notes ?? null,
        subtotal,
        subtotal,
        actor?.userId ?? null,
        actor?.userId ?? null
      ]
    );

    const orderId = Number(result.insertId);

    for (const line of lineRows) {
      await connection.execute<ResultSetHeader>(
        `INSERT INTO sales_order_lines (
          order_id,
          company_id,
          outlet_id,
          line_no,
          line_type,
          item_id,
          description,
          qty,
          unit_price,
          line_total
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          orderId,
          companyId,
          input.outlet_id,
          line.line_no,
          line.line_type,
          line.item_id,
          line.description,
          line.qty,
          line.unit_price,
          line.line_total
        ]
      );
    }

    const order = await findOrderByIdWithExecutor(connection, companyId, orderId);
    if (!order) {
      throw new Error("Created order not found");
    }

    const lines = await findOrderLinesByOrderId(connection, orderId);
    return {
      ...normalizeSalesOrderRow(order),
      lines: lines.map(normalizeSalesOrderLineRow)
    };
  });
}

export async function getOrder(
  companyId: number,
  orderId: number,
  actor?: MutationActor
): Promise<SalesOrderDetail | null> {
  const pool = getDbPool();
  const order = await findOrderByIdWithExecutor(pool, companyId, orderId);
  if (!order) {
    return null;
  }

  if (actor) {
    await ensureUserHasOutletAccess(pool, actor.userId, companyId, order.outlet_id);
  }

  const lines = await findOrderLinesByOrderId(pool, orderId);
  return {
    ...normalizeSalesOrderRow(order),
    lines: lines.map(normalizeSalesOrderLineRow)
  };
}

export async function updateOrder(
  companyId: number,
  orderId: number,
  input: {
    outlet_id?: number;
    order_no?: string;
    order_date?: string;
    expected_date?: string;
    notes?: string;
    lines?: OrderLineInput[];
  },
  actor?: MutationActor
): Promise<SalesOrderDetail | null> {
  return withTransaction(async (connection) => {
    const current = await findOrderByIdWithExecutor(connection, companyId, orderId, {
      forUpdate: true
    });
    if (!current) {
      return null;
    }

    if (current.status !== "DRAFT") {
      throw new DatabaseConflictError("Order is not editable");
    }

    if (actor) {
      await ensureUserHasOutletAccess(connection, actor.userId, companyId, current.outlet_id);
    }

    if (typeof input.outlet_id === "number") {
      await ensureCompanyOutletExists(connection, companyId, input.outlet_id);
      if (actor) {
        await ensureUserHasOutletAccess(connection, actor.userId, companyId, input.outlet_id);
      }
    }

    const nextOutletId = input.outlet_id ?? current.outlet_id;
    const nextOrderNo = input.order_no ?? current.order_no;
    const nextOrderDate = input.order_date ?? formatDateOnly(current.order_date);
    const nextExpectedDate = input.expected_date ??
      (current.expected_date ? formatDateOnly(current.expected_date) : null);
    const nextNotes = input.notes ?? current.notes;

    // Validate and fetch items for PRODUCT lines
    const itemLookups = new Map<number, ItemLookup>();
    if (input.lines) {
      for (const line of input.lines) {
        const lineType = line.line_type ?? "SERVICE";
        if (lineType === "PRODUCT") {
          const item = await validateAndGetItemForLine(connection, companyId, line.item_id, lineType);
          if (item) {
            itemLookups.set(item.id, item);
          }
        }
      }
    }

    let lineRows: Array<{
      line_no: number;
      line_type: "SERVICE" | "PRODUCT";
      item_id: number | null;
      description: string;
      qty: number;
      unit_price: number;
      line_total: number
    }> | null = null;
    let subtotal = Number(current.subtotal);

    if (input.lines) {
      lineRows = buildOrderLines(input.lines, itemLookups);
      subtotal = sumMoney(lineRows.map((line) => line.line_total));
    } else if (nextOutletId !== current.outlet_id) {
      const existingLines = await findOrderLinesByOrderId(connection, orderId);
      const lineInputs = existingLines.map((line) => ({
        line_type: line.line_type,
        item_id: line.item_id ?? undefined,
        description: line.description,
        qty: Number(line.qty),
        unit_price: Number(line.unit_price)
      }));
      lineRows = buildOrderLines(lineInputs, itemLookups);
      subtotal = sumMoney(lineRows.map((line) => line.line_total));
    }

    const taxAmount = Number(current.tax_amount);
    const grandTotal = normalizeMoney(subtotal + taxAmount);

    if (lineRows) {
      await connection.execute<ResultSetHeader>(
        `DELETE FROM sales_order_lines
         WHERE company_id = ?
           AND order_id = ?`,
        [companyId, orderId]
      );
    }

    try {
      await connection.execute<ResultSetHeader>(
        `UPDATE sales_orders
         SET outlet_id = ?,
             order_no = ?,
             order_date = ?,
             expected_date = ?,
             notes = ?,
             subtotal = ?,
             tax_amount = ?,
             grand_total = ?,
             updated_by_user_id = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE company_id = ?
           AND id = ?`,
        [
          nextOutletId,
          nextOrderNo,
          nextOrderDate,
          nextExpectedDate,
          nextNotes,
          subtotal,
          taxAmount,
          grandTotal,
          actor?.userId ?? null,
          companyId,
          orderId
        ]
      );
    } catch (error) {
      if (isMysqlError(error) && error.errno === mysqlDuplicateErrorCode) {
        throw new DatabaseConflictError("Duplicate order");
      }

      throw error;
    }

    if (lineRows) {
      const placeholders = lineRows.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").join(", ");
      const values: Array<string | number | null> = [];
      for (const line of lineRows) {
        values.push(
          orderId,
          companyId,
          nextOutletId,
          line.line_no,
          line.line_type,
          line.item_id,
          line.description,
          line.qty,
          line.unit_price,
          line.line_total
        );
      }

      await connection.execute(
        `INSERT INTO sales_order_lines (
           order_id,
           company_id,
           outlet_id,
           line_no,
           line_type,
           item_id,
           description,
           qty,
           unit_price,
           line_total
         ) VALUES ${placeholders}`,
        values
      );
    }

    return findOrderDetailWithExecutor(connection, companyId, orderId);
  });
}

export async function confirmOrder(
  companyId: number,
  orderId: number,
  actor?: MutationActor
): Promise<SalesOrderDetail> {
  return withTransaction(async (connection) => {
    const order = await findOrderByIdWithExecutor(connection, companyId, orderId);
    if (!order) {
      throw new DatabaseReferenceError("Order not found");
    }

    if (order.status !== "DRAFT") {
      throw new DatabaseConflictError(`Cannot confirm order in ${order.status} status`);
    }

    if (actor) {
      await ensureUserHasOutletAccess(connection, actor.userId, companyId, order.outlet_id);
    }

    await connection.execute<ResultSetHeader>(
      `UPDATE sales_orders 
       SET status = 'CONFIRMED', 
           confirmed_by_user_id = ?, 
           confirmed_at = CURRENT_TIMESTAMP,
           updated_by_user_id = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE company_id = ? AND id = ?`,
      [actor?.userId ?? null, actor?.userId ?? null, companyId, orderId]
    );

    const updatedOrder = await findOrderByIdWithExecutor(connection, companyId, orderId);
    if (!updatedOrder) {
      throw new Error("Updated order not found");
    }

    const lines = await findOrderLinesByOrderId(connection, orderId);
    return {
      ...normalizeSalesOrderRow(updatedOrder),
      lines: lines.map(normalizeSalesOrderLineRow)
    };
  });
}

export async function completeOrder(
  companyId: number,
  orderId: number,
  actor?: MutationActor
): Promise<SalesOrderDetail> {
  return withTransaction(async (connection) => {
    const order = await findOrderByIdWithExecutor(connection, companyId, orderId);
    if (!order) {
      throw new DatabaseReferenceError("Order not found");
    }

    if (order.status !== "CONFIRMED") {
      throw new DatabaseConflictError(`Cannot complete order in ${order.status} status`);
    }

    if (actor) {
      await ensureUserHasOutletAccess(connection, actor.userId, companyId, order.outlet_id);
    }

    await connection.execute<ResultSetHeader>(
      `UPDATE sales_orders 
       SET status = 'COMPLETED', 
           completed_by_user_id = ?, 
           completed_at = CURRENT_TIMESTAMP,
           updated_by_user_id = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE company_id = ? AND id = ?`,
      [actor?.userId ?? null, actor?.userId ?? null, companyId, orderId]
    );

    const updatedOrder = await findOrderByIdWithExecutor(connection, companyId, orderId);
    if (!updatedOrder) {
      throw new Error("Updated order not found");
    }

    const lines = await findOrderLinesByOrderId(connection, orderId);
    return {
      ...normalizeSalesOrderRow(updatedOrder),
      lines: lines.map(normalizeSalesOrderLineRow)
    };
  });
}

export async function voidOrder(
  companyId: number,
  orderId: number,
  actor?: MutationActor
): Promise<SalesOrderDetail> {
  return withTransaction(async (connection) => {
    const order = await findOrderByIdWithExecutor(connection, companyId, orderId);
    if (!order) {
      throw new DatabaseReferenceError("Order not found");
    }

    if (order.status === "VOID") {
      throw new DatabaseConflictError("Order is already void");
    }

    if (order.status === "COMPLETED") {
      throw new DatabaseConflictError("Completed orders cannot be voided");
    }

    if (actor) {
      await ensureUserHasOutletAccess(connection, actor.userId, companyId, order.outlet_id);
    }

    await connection.execute<ResultSetHeader>(
      `UPDATE sales_orders 
       SET status = 'VOID',
           updated_by_user_id = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE company_id = ? AND id = ?`,
      [actor?.userId ?? null, companyId, orderId]
    );

    const updatedOrder = await findOrderByIdWithExecutor(connection, companyId, orderId);
    if (!updatedOrder) {
      throw new Error("Updated order not found");
    }

    const lines = await findOrderLinesByOrderId(connection, orderId);
    return {
      ...normalizeSalesOrderRow(updatedOrder),
      lines: lines.map(normalizeSalesOrderLineRow)
    };
  });
}

export async function listOrders(
  companyId: number,
  filters: OrderListFilters
): Promise<{ total: number; orders: SalesOrderDetail[] }> {
  const pool = getDbPool();
  const conditions: string[] = ["company_id = ?"];
  const values: Array<number | string> = [companyId];

  if (filters.outletIds) {
    if (filters.outletIds.length === 0) {
      return { total: 0, orders: [] };
    }
    const placeholders = filters.outletIds.map(() => "?").join(", ");
    conditions.push(`outlet_id IN (${placeholders})`);
    values.push(...filters.outletIds);
  }

  if (filters.status) {
    conditions.push("status = ?");
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
    conditions.push("order_date >= ?");
    values.push(dateFrom);
  }

  if (dateTo) {
    conditions.push("order_date <= ?");
    values.push(dateTo);
  }

  const whereClause = conditions.join(" AND ");

  const [countRows] = await pool.execute<RowDataPacket[]>(
    `SELECT COUNT(*) as total FROM sales_orders WHERE ${whereClause}`,
    values
  );
  const total = Number(countRows[0]?.total ?? 0);

  const limit = filters.limit ?? 50;
  const offset = filters.offset ?? 0;

  const [orderRows] = await pool.execute<SalesOrderRow[]>(
    `SELECT * FROM sales_orders WHERE ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [...values, limit, offset]
  );

  const orders: SalesOrderDetail[] = [];
  for (const row of orderRows) {
    const lines = await findOrderLinesByOrderId(pool, row.id);
    orders.push({
      ...normalizeSalesOrderRow(row),
      lines: lines.map(normalizeSalesOrderLineRow)
    });
  }

  return { total, orders };
}

export async function convertOrderToInvoice(
  companyId: number,
  orderId: number,
  input: {
    outlet_id: number;
    invoice_date: string;
    due_date?: string;
    due_term?: InvoiceDueTerm;
    invoice_no?: string;
    tax_amount?: number;
    taxes?: InvoiceTaxInput[];
  },
  actor?: MutationActor
): Promise<SalesInvoiceDetail> {
  return withTransaction(async (connection) => {
    const order = await findOrderByIdWithExecutor(connection, companyId, orderId);
    if (!order) {
      throw new DatabaseReferenceError("Order not found");
    }

    if (order.status !== "CONFIRMED" && order.status !== "COMPLETED") {
      throw new DatabaseConflictError("Only confirmed or completed orders can be converted to invoice");
    }

    if (order.outlet_id !== input.outlet_id) {
      throw new DatabaseReferenceError("Outlet mismatch");
    }

    await ensureCompanyOutletExists(connection, companyId, input.outlet_id);
    if (actor) {
      await ensureUserHasOutletAccess(connection, actor.userId, companyId, input.outlet_id);
    }

    const invoiceNo = await getNumberWithConflictMapping(
      companyId,
      input.outlet_id,
      DOCUMENT_TYPES.SALES_INVOICE,
      input.invoice_no
    );
    const dueDate = resolveInvoiceDueDate({
      invoiceDate: input.invoice_date,
      dueDate: input.due_date,
      dueTerm: input.due_term
    });

    const orderLines = await findOrderLinesByOrderId(connection, orderId);
    const invoiceLines = orderLines.map((line, index) => ({
      line_no: index + 1,
      line_type: line.line_type,
      item_id: line.item_id !== null ? Number(line.item_id) : null,
      description: line.description,
      qty: Number(line.qty),
      unit_price: normalizeMoney(Number(line.unit_price)),
      line_total: normalizeMoney(Number(line.line_total))
    }));

    const subtotal = Number(order.subtotal);
    let taxAmount = normalizeMoney(input.tax_amount ?? 0);
    let taxLines: Array<{ tax_rate_id: number; amount: number }> = [];

    if (input.taxes && input.taxes.length > 0) {
      const taxRateIds = input.taxes.map((tax) => tax.tax_rate_id);
      const placeholders = taxRateIds.map(() => "?").join(", ");
      const [rows] = await connection.execute<RowDataPacket[]>(
        `SELECT id FROM tax_rates WHERE company_id = ? AND is_active = 1 AND id IN (${placeholders})`,
        [companyId, ...taxRateIds]
      );

      const matched = new Set((rows as Array<{ id?: number }>).map((row) => Number(row.id)));
      if (matched.size !== taxRateIds.length) {
        throw new DatabaseReferenceError("Invalid tax rate");
      }

      taxLines = input.taxes.map((tax) => ({
        tax_rate_id: tax.tax_rate_id,
        amount: normalizeMoney(tax.amount)
      })).filter((tax) => tax.tax_rate_id > 0 && tax.amount > 0);
      taxAmount = normalizeMoney(taxLines.reduce((acc, tax) => acc + tax.amount, 0));
    }

    const grandTotal = normalizeMoney(subtotal + taxAmount);

    const [result] = await connection.execute<ResultSetHeader>(
      `INSERT INTO sales_invoices (
        company_id,
        outlet_id,
        order_id,
        invoice_no,
        invoice_date,
        due_date,
        status,
        payment_status,
        subtotal,
        tax_amount,
        grand_total,
        paid_total,
        created_by_user_id,
        updated_by_user_id
      ) VALUES (?, ?, ?, ?, ?, ?, 'DRAFT', 'UNPAID', ?, ?, ?, 0, ?, ?)`,
      [
        companyId,
        input.outlet_id,
        orderId,
        invoiceNo,
        input.invoice_date,
        dueDate,
        subtotal,
        taxAmount,
        grandTotal,
        actor?.userId ?? null,
        actor?.userId ?? null
      ]
    );

    const invoiceId = Number(result.insertId);

    for (const line of invoiceLines) {
      await connection.execute<ResultSetHeader>(
        `INSERT INTO sales_invoice_lines (
          invoice_id,
          company_id,
          outlet_id,
          line_no,
          line_type,
          item_id,
          description,
          qty,
          unit_price,
          line_total
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          invoiceId,
          companyId,
          input.outlet_id,
          line.line_no,
          line.line_type,
          line.item_id,
          line.description,
          line.qty,
          line.unit_price,
          line.line_total
        ]
      );
    }

    if (taxLines.length > 0) {
      const placeholders = taxLines.map(() => "(?, ?, ?, ?, ?)").join(", ");
      const values = taxLines.flatMap((tax) => [
        invoiceId,
        companyId,
        input.outlet_id,
        tax.tax_rate_id,
        tax.amount
      ]);

      await connection.execute<ResultSetHeader>(
        `INSERT INTO sales_invoice_taxes (
          sales_invoice_id,
          company_id,
          outlet_id,
          tax_rate_id,
          amount
        ) VALUES ${placeholders}`,
        values
      );
    }

    const invoice = await findInvoiceDetailWithExecutor(connection, companyId, invoiceId);
    if (!invoice) {
      throw new Error("Created invoice not found");
    }

    return invoice;
  });
}

export async function approveInvoice(
  companyId: number,
  invoiceId: number,
  actor?: MutationActor
): Promise<SalesInvoiceDetail | null> {
  return withTransaction(async (connection) => {
    const invoice = await findInvoiceByIdWithExecutor(connection, companyId, invoiceId, {
      forUpdate: true
    });
    if (!invoice) {
      return null;
    }

    if (actor) {
      await ensureUserHasOutletAccess(connection, actor.userId, companyId, invoice.outlet_id);
    }

    if (invoice.status === "POSTED") {
      throw new InvoiceStatusError("Posted invoices cannot be approved");
    }

    if (invoice.status === "APPROVED") {
      return findInvoiceDetailWithExecutor(connection, companyId, invoiceId);
    }

    if (invoice.status !== "DRAFT") {
      throw new InvoiceStatusError("Only draft invoices can be approved");
    }

    await connection.execute<ResultSetHeader>(
      `UPDATE sales_invoices
       SET status = 'APPROVED',
           approved_by_user_id = ?,
           approved_at = CURRENT_TIMESTAMP,
           updated_by_user_id = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE company_id = ?
         AND id = ?`,
      [actor?.userId ?? null, actor?.userId ?? null, companyId, invoiceId]
    );

    return findInvoiceDetailWithExecutor(connection, companyId, invoiceId);
  });
}

export async function voidInvoice(
  companyId: number,
  invoiceId: number,
  actor?: MutationActor
): Promise<SalesInvoiceDetail | null> {
  return withTransaction(async (connection) => {
    const invoice = await findInvoiceByIdWithExecutor(connection, companyId, invoiceId, {
      forUpdate: true
    });
    if (!invoice) {
      return null;
    }

    if (actor) {
      await ensureUserHasOutletAccess(connection, actor.userId, companyId, invoice.outlet_id);
    }

    if (invoice.status === "VOID") {
      return findInvoiceDetailWithExecutor(connection, companyId, invoiceId);
    }

    if (invoice.payment_status === "PARTIAL" || invoice.payment_status === "PAID") {
      throw new InvoiceStatusError("Cannot void invoice with payments. Process refunds first.");
    }

    await connection.execute<ResultSetHeader>(
      `UPDATE sales_invoices
       SET status = 'VOID',
           updated_by_user_id = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE company_id = ?
         AND id = ?`,
      [actor?.userId ?? null, companyId, invoiceId]
    );

    return findInvoiceDetailWithExecutor(connection, companyId, invoiceId);
  });
}

type SalesCreditNoteRow = RowDataPacket & {
  id: number;
  company_id: number;
  outlet_id: number;
  invoice_id: number;
  credit_note_no: string;
  credit_note_date: string;
  client_ref?: string | null;
  status: "DRAFT" | "POSTED" | "VOID";
  reason?: string | null;
  notes?: string | null;
  amount: string | number;
  created_by_user_id?: number | null;
  updated_by_user_id?: number | null;
  created_at: string;
  updated_at: string;
};

type SalesCreditNoteLineRow = RowDataPacket & {
  id: number;
  credit_note_id: number;
  line_no: number;
  description: string;
  qty: string | number;
  unit_price: string | number;
  line_total: string | number;
};

export interface SalesCreditNoteDetail {
  id: number;
  company_id: number;
  outlet_id: number;
  invoice_id: number;
  credit_note_no: string;
  credit_note_date: string;
  client_ref: string | null;
  status: "DRAFT" | "POSTED" | "VOID";
  reason: string | null;
  notes: string | null;
  amount: number;
  created_by_user_id: number | null;
  updated_by_user_id: number | null;
  created_at: string;
  updated_at: string;
  lines: Array<{
    id: number;
    credit_note_id: number;
    line_no: number;
    description: string;
    qty: number;
    unit_price: number;
    line_total: number;
  }>;
}

type CreditNoteLineInput = {
  description: string;
  qty: number;
  unit_price: number;
};

type CreditNoteListFilters = {
  outletIds?: number[];
  invoiceId?: number;
  status?: "DRAFT" | "POSTED" | "VOID";
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  offset?: number;
  timezone?: string;
};

const MONEY_SCALE_CN = 100;

function normalizeMoneyCN(value: number): number {
  return Math.round((value + Number.EPSILON) * MONEY_SCALE_CN) / MONEY_SCALE_CN;
}

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
    await ensureUserHasOutletAccess(connection, actor?.userId ?? 0, companyId, input.outlet_id);
    await ensureCompanyOutletExists(connection, companyId, input.outlet_id);

    // Idempotency: return existing credit note if client_ref matches
    if (input.client_ref) {
      const existingCreditNote = await findCreditNoteByClientRef(connection, companyId, input.client_ref);
      if (existingCreditNote) {
        if (actor) {
          await ensureUserHasOutletAccess(connection, actor.userId, companyId, existingCreditNote.outlet_id);
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

    const normalizedAmount = normalizeMoneyCN(input.amount);
    if (normalizedAmount > remaining) {
      throw new DatabaseConflictError(
        `Credit note amount (${normalizedAmount}) exceeds remaining credit capacity (${remaining}) for invoice total ${grandTotal}`
      );
    }

    // Validate that sum of line totals exactly equals credit note amount (cent-exact)
    const lineTotalsSum = input.lines.reduce((sum, line) => sum + (line.qty * line.unit_price), 0);
    const normalizedLineSum = normalizeMoneyCN(lineTotalsSum);

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
        const lineTotal = normalizeMoneyCN(line.qty * line.unit_price);
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
            normalizeMoneyCN(line.unit_price),
            lineTotal
          ]
        );
      }

      return findCreditNoteDetailWithExecutor(connection, companyId, creditNoteId);
    } catch (error) {
      // Idempotency race handling: if client_ref provided and unique index conflict, fetch and return existing
      if (input.client_ref && isMysqlError(error) && error.errno === mysqlDuplicateErrorCode) {
        const existingCreditNote = await findCreditNoteByClientRef(connection, companyId, input.client_ref);
        if (existingCreditNote) {
          if (actor) {
            await ensureUserHasOutletAccess(connection, actor.userId, companyId, existingCreditNote.outlet_id);
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
      await ensureUserHasOutletAccess(connection, actor.userId, companyId, creditNote.outlet_id);
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
      const range = toDateTimeRangeWithTimezone(dateFrom, dateTo, filters.timezone);
      // Convert to date-only format for comparison
      dateFrom = range.fromStartUTC.slice(0, 10);
      dateTo = range.toEndUTC.slice(0, 10);
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
        created_at: toRfc3339(row.created_at),
        updated_at: toRfc3339(row.updated_at),
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
      await ensureUserHasOutletAccess(connection, actor.userId, companyId, creditNote.outlet_id);
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

      const normalizedAmount = normalizeMoneyCN(input.amount);
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
      const normalizedLineSum = normalizeMoneyCN(lineTotalsSum);
      const normalizedAmount = normalizeMoneyCN(newAmount);

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
        const lineTotal = normalizeMoneyCN(line.qty * line.unit_price);
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
            normalizeMoneyCN(line.unit_price),
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
      await ensureUserHasOutletAccess(connection, actor.userId, companyId, creditNote.outlet_id);
    }

    if (creditNote.status !== "DRAFT") {
      throw new DatabaseForbiddenError("Only DRAFT credit notes can be posted");
    }

    const remainingCapacity = await getRemainingCreditCapacity(
      connection,
      companyId,
      creditNote.invoice_id
    );
    const creditNoteAmount = normalizeMoneyCN(Number(creditNote.amount));
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
      updated_at: creditNote.updated_at.toISOString()
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
        [normalizeMoneyCN(newPaidTotal), newPaymentStatus, companyId, creditNote.invoice_id]
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
      await ensureUserHasOutletAccess(connection, actor.userId, companyId, creditNote.outlet_id);
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
        updated_at: creditNote.updated_at.toISOString()
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
          [normalizeMoneyCN(newPaidTotal), newPaymentStatus, companyId, creditNote.invoice_id]
        );
      }
    }

    return findCreditNoteDetailWithExecutor(connection, companyId, creditNoteId);
  });
}
