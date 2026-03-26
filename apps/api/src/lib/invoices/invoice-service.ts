// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Invoice Service
 * 
 * Invoice CRUD operations and lifecycle management.
 * Extracted from sales.ts (originally lines 772-1030, 1033-1268, 1270-1371, 3251-3333)
 */

import type { ResultSetHeader, RowDataPacket } from "mysql2";
import type { PoolConnection } from "mysql2/promise";
import { getDbPool } from "@/lib/db";
import { calculateTaxLines, listCompanyDefaultTaxRates } from "@/lib/taxes";
import { postSalesInvoiceToJournal } from "@/lib/sales-posting";
import { deductStockForSaleWithCogs } from "@/services/stock";
import {
  DOCUMENT_TYPES,
  type DocumentType
} from "@/lib/numbering";
import { toDateTimeRangeWithTimezone, toMysqlDateTime, toMysqlDateTimeFromDateLike } from "@/lib/date-helpers";
import { toRfc3339, toRfc3339Required } from "@jurnapod/shared";
import {
  normalizeMoney,
  sumMoney,
  withTransaction,
  getNumberWithConflictMapping,
  ensureCompanyOutletExists,
  ensureUserHasOutletAccess,
  formatDateOnly,
  hasMoreThanTwoDecimals,
  isMysqlError,
  MONEY_SCALE
} from "@/lib/shared/common-utils";

// Re-export types from types module
export type {
  SalesInvoice,
  SalesInvoiceLine,
  SalesInvoiceTax,
  SalesInvoiceDetail,
  InvoiceListFilters,
  InvoiceLineInput,
  InvoiceTaxInput,
  MutationActor
} from "./types";

export { InvoiceStatusError } from "./types";
export type { InvoiceDueTerm } from "./types";

// Import types and values directly from types module
import type {
  SalesInvoice,
  SalesInvoiceLine,
  SalesInvoiceTax,
  SalesInvoiceDetail,
  InvoiceListFilters,
  InvoiceLineInput,
  InvoiceTaxInput,
  InvoiceDueTerm,
  QueryExecutor,
  MutationActor,
  ItemLookup,
  SalesInvoiceRow,
  SalesInvoiceLineRow,
  SalesInvoiceTaxRow,
  AccessCheckRow,
  IdRow,
  PreparedInvoiceLine
} from "./types";

import { INVOICE_DUE_TERM_DAYS, InvoiceStatusError } from "./types";

// =============================================================================
// Error Classes
// =============================================================================

export class DatabaseConflictError extends Error {}
export class DatabaseReferenceError extends Error {}
export class DatabaseForbiddenError extends Error {}

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

// =============================================================================
// Normalization Functions
// =============================================================================

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
    approved_at: row.approved_at ? toMysqlDateTimeFromDateLike(row.approved_at.toString()) : null,
    created_by_user_id: row.created_by_user_id ? Number(row.created_by_user_id) : null,
    updated_by_user_id: row.updated_by_user_id ? Number(row.updated_by_user_id) : null,
    created_at: toRfc3339Required(row.created_at),
    updated_at: toRfc3339Required(row.updated_at)
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

function normalizeInvoiceTax(row: SalesInvoiceTaxRow): SalesInvoiceTax {
  return {
    id: Number(row.id),
    invoice_id: Number(row.invoice_id),
    tax_rate_id: Number(row.tax_rate_id),
    amount: Number(row.amount)
  };
}

// =============================================================================
// Invoice Line Building
// =============================================================================

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



// =============================================================================
// Item Helpers
// =============================================================================

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

// =============================================================================
// Invoice Query Helpers
// =============================================================================

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

async function listInvoiceTaxesWithExecutor(
  executor: QueryExecutor,
  companyId: number,
  invoiceId: number
): Promise<SalesInvoiceTax[]> {
  const [rows] = await executor.execute<SalesInvoiceTaxRow[]>(
    `SELECT id, sales_invoice_id AS invoice_id, tax_rate_id, amount
     FROM sales_invoice_taxes
     WHERE company_id = ?
       AND sales_invoice_id = ?`,
    [companyId, invoiceId]
  );

  return rows.map(normalizeInvoiceTax);
}

export async function findInvoiceDetailWithExecutor(
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

  return {
    ...invoice,
    lines,
    taxes
  };
}

// =============================================================================
// Where Clause Builder
// =============================================================================

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

// =============================================================================
// Public Invoice CRUD Functions
// =============================================================================

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
          await ensureUserHasOutletAccess(actor.userId, companyId, existing.outlet_id);
        }
        return existing;
      }
    }

    await ensureCompanyOutletExists(connection, companyId, input.outlet_id);
    if (actor) {
      await ensureUserHasOutletAccess(actor.userId, companyId, input.outlet_id);
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
      if (isMysqlError(error) && error.errno === 1062) { // MySQL duplicate error code
        if (input.client_ref) {
          const existing = await findInvoiceByClientRefWithExecutor(
            connection,
            companyId,
            input.client_ref
          );
          if (existing) {
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
      await ensureUserHasOutletAccess(actor.userId, companyId, current.outlet_id);
    }

    if (typeof input.outlet_id === "number") {
      await ensureCompanyOutletExists(connection, companyId, input.outlet_id);
      if (actor) {
        await ensureUserHasOutletAccess(actor.userId, companyId, input.outlet_id);
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
      if (isMysqlError(error) && error.errno === 1062) {
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

// =============================================================================
// Invoice Lifecycle Functions
// =============================================================================

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
      await ensureUserHasOutletAccess(actor.userId, companyId, invoice.outlet_id);
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

    const cogsFeatureEnabled = await isCogsFeatureEnabled(connection, companyId);

    // Post COGS for inventory-tracked items when feature is enabled
    const inventoryLines = postedInvoice.lines.filter((line) => line.line_type === "PRODUCT" && line.item_id);

    if (cogsFeatureEnabled && inventoryLines.length > 0) {
      const itemIds = inventoryLines.map((line) => line.item_id as number);
      const placeholders = itemIds.map(() => "?").join(", ");

      const [itemRows] = await connection.execute<RowDataPacket[]>(
        `SELECT id, track_stock FROM items 
         WHERE company_id = ? AND id IN (${placeholders}) AND track_stock = 1`,
        [companyId, ...itemIds]
      );

      const trackStockItemIds = new Set((itemRows as Array<{ id: number }>).map((row) => row.id));

      const inventoryItems = inventoryLines
        .filter((line) => line.item_id && trackStockItemIds.has(line.item_id))
        .map((line) => ({
          itemId: line.item_id as number,
          quantity: line.qty
        }));

      if (inventoryItems.length > 0) {
        // AC7: Use method-correct cost consumption via deductStockForSaleWithCogs
        // This ensures FIFO/LIFO/AVG are used correctly (not legacy average fallback)
        const stockItems = inventoryItems.map((item) => ({
          product_id: item.itemId,
          quantity: item.quantity
        }));

        const { cogsResult } = await deductStockForSaleWithCogs(
          {
            company_id: postedInvoice.company_id,
            outlet_id: postedInvoice.outlet_id,
            items: stockItems,
            reference_id: `INV-${postedInvoice.id}`,
            user_id: actor?.userId ?? 0,
            sale_id: `INV-${postedInvoice.id}`,
            sale_date: new Date(`${postedInvoice.invoice_date}T00:00:00.000Z`),
            cogs_enabled: true
          },
          connection
        );

        if (!cogsResult?.success) {
          const itemSummary = inventoryItems
            .map((item) => `item:${item.itemId} qty:${item.quantity}`)
            .join("; ");
          throw new Error(
            `COGS posting failed for invoice ${postedInvoice.id} (${postedInvoice.invoice_no}): ${(cogsResult?.errors ?? []).join(", ")}. Items: ${itemSummary}`
          );
        }
      }
    }

    return postedInvoice;
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
      await ensureUserHasOutletAccess(actor.userId, companyId, invoice.outlet_id);
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
      await ensureUserHasOutletAccess(actor.userId, companyId, invoice.outlet_id);
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

// =============================================================================
// Module Config Helper (for COGS feature gate)
// =============================================================================

type ModuleConfigRow = RowDataPacket & {
  enabled: number;
  config_json: string;
};

function parseFeatureGateValue(value: unknown): boolean {
  if (value === 1 || value === true) {
    return true;
  }

  if (value === 0 || value === false || value == null) {
    return false;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "1" || normalized === "true") {
      return true;
    }
  }

  return false;
}

async function isCogsFeatureEnabled(
  executor: QueryExecutor,
  companyId: number
): Promise<boolean> {
  const [rows] = await executor.execute<ModuleConfigRow[]>(
    `SELECT cm.enabled, cm.config_json
     FROM company_modules cm
     INNER JOIN modules m ON m.id = cm.module_id
     WHERE cm.company_id = ?
       AND m.code = 'inventory'
     LIMIT 1`,
    [companyId]
  );

  const moduleRow = rows[0];
  if (!moduleRow || Number(moduleRow.enabled) !== 1) {
    return false;
  }

  if (typeof moduleRow.config_json !== "string" || moduleRow.config_json.trim().length === 0) {
    return false;
  }

  try {
    const parsed = JSON.parse(moduleRow.config_json) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return false;
    }

    const cogsEnabled = (parsed as Record<string, unknown>).cogs_enabled;
    return parseFeatureGateValue(cogsEnabled);
  } catch {
    return false;
  }
}

// =============================================================================
// Re-export for backward compatibility with sales.ts
// =============================================================================

export type {
  SalesInvoiceRow,
  SalesInvoiceLineRow,
  SalesInvoiceTaxRow,
  AccessCheckRow,
  IdRow,
  ModuleConfigRow
};
