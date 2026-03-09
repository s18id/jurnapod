// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import type { ResultSetHeader, RowDataPacket } from "mysql2";
import type { PoolConnection } from "mysql2/promise";
import { getDbPool } from "./db";
import { calculateTaxLines, listCompanyDefaultTaxRates } from "./taxes";
import { postSalesInvoiceToJournal, postSalesPaymentToJournal } from "./sales-posting";
import {
  DOCUMENT_TYPES,
  getNextDocumentNumber,
  NumberingConflictError,
  NumberingTemplateNotFoundError
} from "./numbering";
import type { DocumentType } from "./numbering";

type SalesInvoiceRow = RowDataPacket & {
  id: number;
  company_id: number;
  outlet_id: number;
  invoice_no: string;
  client_ref?: string | null;
  invoice_date: Date | string;
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
  created_at: Date;
  updated_at: Date;
};

type SalesInvoiceLineRow = RowDataPacket & {
  id: number;
  invoice_id: number;
  line_no: number;
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
};

type PaymentListFilters = {
  outletIds?: readonly number[];
  status?: "DRAFT" | "POSTED" | "VOID";
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  offset?: number;
};

export type SalesInvoice = {
  id: number;
  company_id: number;
  outlet_id: number;
  invoice_no: string;
  client_ref?: string | null;
  invoice_date: string;
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

type SalesPaymentRow = RowDataPacket & {
  id: number;
  company_id: number;
  outlet_id: number;
  invoice_id: number;
  payment_no: string;
  client_ref?: string | null;
  payment_at: Date | string;
  account_id: number;
  account_name?: string;
  method?: "CASH" | "QRIS" | "CARD"; // deprecated
  status: "DRAFT" | "POSTED" | "VOID";
  amount: string | number;
  created_by_user_id?: number | null;
  updated_by_user_id?: number | null;
  created_at: Date;
  updated_at: Date;
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
  method?: "CASH" | "QRIS" | "CARD"; // deprecated
  status: "DRAFT" | "POSTED" | "VOID";
  amount: number;
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

function formatDateOnly(value: Date | string): string {
  if (typeof value === "string") {
    return value;
  }

  return value.toISOString().slice(0, 10);
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
    created_at: new Date(row.created_at).toISOString(),
    updated_at: new Date(row.updated_at).toISOString()
  };
}

function normalizeInvoiceLine(row: SalesInvoiceLineRow): SalesInvoiceLine {
  return {
    id: Number(row.id),
    invoice_id: Number(row.invoice_id),
    line_no: Number(row.line_no),
    description: row.description,
    qty: Number(row.qty),
    unit_price: Number(row.unit_price),
    line_total: Number(row.line_total)
  };
}

function buildInvoiceLines(lines: readonly InvoiceLineInput[]): {
  lineRows: PreparedInvoiceLine[];
  subtotal: number;
} {
  const lineRows: PreparedInvoiceLine[] = [];

  for (const [index, line] of lines.entries()) {
    const lineTotal = normalizeMoney(line.qty * line.unit_price);
    lineRows.push({
      line_no: index + 1,
      description: line.description,
      qty: line.qty,
      unit_price: line.unit_price,
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

async function findInvoiceByIdWithExecutor(
  executor: QueryExecutor,
  companyId: number,
  invoiceId: number,
  options?: { forUpdate?: boolean }
): Promise<SalesInvoice | null> {
  const forUpdateClause = options?.forUpdate ? " FOR UPDATE" : "";
  const [rows] = await executor.execute<SalesInvoiceRow[]>(
    `SELECT id, company_id, outlet_id, invoice_no, client_ref, invoice_date, status, payment_status,
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
    `SELECT id, invoice_id, line_no, description, qty, unit_price, line_total
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

  if (filters.dateFrom) {
    conditions.push("invoice_date >= ?");
    values.push(filters.dateFrom);
  }

  if (filters.dateTo) {
    conditions.push("invoice_date <= ?");
    values.push(filters.dateTo);
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
    `SELECT id, company_id, outlet_id, invoice_no, client_ref, invoice_date, status, payment_status,
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

    const invoiceNo = await getNumberWithConflictMapping(
      companyId,
      input.outlet_id,
      DOCUMENT_TYPES.SALES_INVOICE,
      input.invoice_no
    );

    const { lineRows, subtotal } = buildInvoiceLines(input.lines);
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
           client_ref,
           status,
           payment_status,
           subtotal,
           tax_amount,
           grand_total,
           paid_total,
           created_by_user_id,
           updated_by_user_id
         ) VALUES (?, ?, ?, ?, ?, 'DRAFT', 'UNPAID', ?, ?, ?, 0, ?, ?)`,
        [
          companyId,
          input.outlet_id,
          invoiceNo,
          input.invoice_date,
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
        const placeholders = lineRows.map(() => "(?, ?, ?, ?, ?, ?, ?, ?)").join(", ");
        const values: Array<string | number> = [];
        for (const line of lineRows) {
          values.push(
            invoiceId,
            companyId,
            input.outlet_id,
            line.line_no,
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

    let lineRows: PreparedInvoiceLine[] | null = null;
    let subtotal = current.subtotal;

    if (input.lines) {
      const computed = buildInvoiceLines(input.lines);
      lineRows = computed.lineRows;
      subtotal = computed.subtotal;
    } else if (nextOutletId !== current.outlet_id) {
      const existingLines = await listInvoiceLinesWithExecutor(connection, companyId, invoiceId);
      const inputs = existingLines.map((line) => ({
        description: line.description,
        qty: line.qty,
        unit_price: line.unit_price
      }));
      const computed = buildInvoiceLines(inputs);
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
      const placeholders = lineRows.map(() => "(?, ?, ?, ?, ?, ?, ?, ?)").join(", ");
      const values: Array<string | number> = [];
      for (const line of lineRows) {
        values.push(
          invoiceId,
          companyId,
          nextOutletId,
          line.line_no,
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

function normalizePayment(row: SalesPaymentRow): SalesPayment {
  return {
    id: Number(row.id),
    company_id: Number(row.company_id),
    outlet_id: Number(row.outlet_id),
    invoice_id: Number(row.invoice_id),
    payment_no: row.payment_no,
    client_ref: row.client_ref ?? null,
    payment_at: new Date(row.payment_at).toISOString(),
    account_id: Number(row.account_id),
    account_name: row.account_name,
    method: row.method,
    status: row.status,
    amount: Number(row.amount),
    created_by_user_id: row.created_by_user_id ? Number(row.created_by_user_id) : null,
    updated_by_user_id: row.updated_by_user_id ? Number(row.updated_by_user_id) : null,
    created_at: new Date(row.created_at).toISOString(),
    updated_at: new Date(row.updated_at).toISOString()
  };
}

async function findPaymentByIdWithExecutor(
  executor: QueryExecutor,
  companyId: number,
  paymentId: number,
  options?: { forUpdate?: boolean }
): Promise<SalesPayment | null> {
  const forUpdateClause = options?.forUpdate ? " FOR UPDATE" : "";
  const [rows] = await executor.execute<SalesPaymentRow[]>(
    `SELECT sp.id, sp.company_id, sp.outlet_id, sp.invoice_id, sp.payment_no, sp.client_ref, sp.payment_at,
            sp.account_id, a.name as account_name, sp.method, sp.status,
            sp.amount, sp.created_by_user_id, sp.updated_by_user_id, sp.created_at, sp.updated_at
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

  return normalizePayment(rows[0]);
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

  if (filters.dateFrom) {
    conditions.push("sp.payment_at >= ?");
    values.push(filters.dateFrom);
  }

  if (filters.dateTo) {
    conditions.push("sp.payment_at <= ?");
    values.push(filters.dateTo);
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
            sp.amount, sp.created_by_user_id, sp.updated_by_user_id, sp.created_at, sp.updated_at
     FROM sales_payments sp
     LEFT JOIN accounts a ON a.id = sp.account_id AND a.company_id = sp.company_id
     WHERE ${where.clause}
     ORDER BY sp.payment_at DESC, sp.id DESC
     LIMIT ? OFFSET ?`,
    [...where.values, limit, offset]
  );

  return { total, payments: rows.map(normalizePayment) };
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
    account_id: number;
    method?: "CASH" | "QRIS" | "CARD"; // deprecated
    amount: number;
  },
  actor?: MutationActor
): Promise<SalesPayment> {
  return withTransaction(async (connection) => {
    if (input.client_ref) {
      const existing = await findPaymentByClientRefWithExecutor(
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

    // Verify account exists, belongs to company, and is payable
    const [accountRows] = await connection.execute<RowDataPacket[]>(
      `SELECT id FROM accounts
       WHERE id = ? AND company_id = ? AND is_payable = 1
       LIMIT 1`,
      [input.account_id, companyId]
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
           created_by_user_id,
           updated_by_user_id
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT', ?, ?, ?)`,
        [
          companyId,
          input.outlet_id,
          input.invoice_id,
          paymentNo,
          input.client_ref ?? null,
          paymentAt,
          input.account_id,
          input.method ?? null,
          amount,
          actor?.userId ?? null,
          actor?.userId ?? null
        ]
      );

      const paymentId = Number(result.insertId);
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
    method?: "CASH" | "QRIS" | "CARD"; // deprecated
    amount?: number;
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

    // Verify account if provided
    if (typeof input.account_id === "number") {
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
    const nextAccountId = input.account_id ?? current.account_id;
    const nextMethod = input.method ?? current.method;
    const nextAmount =
      typeof input.amount === "number" ? normalizeMoney(input.amount) : current.amount;

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
          actor?.userId ?? null,
          companyId,
          paymentId
        ]
      );

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
  actor?: MutationActor
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

    if (payment.amount > outstanding) {
      throw new PaymentAllocationError("Payment amount exceeds invoice outstanding");
    }

    await connection.execute<ResultSetHeader>(
      `UPDATE sales_payments
       SET status = 'POSTED',
           updated_by_user_id = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE company_id = ?
         AND id = ?`,
      [actor?.userId ?? null, companyId, paymentId]
    );

    const newPaidTotal = normalizeMoney(invoice.paid_total + payment.amount);
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
      [newPaidTotal, newPaymentStatus, actor?.userId ?? null, companyId, invoice.id]
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
  order_date: Date | string;
  expected_date: Date | string | null;
  status: SalesOrderStatus;
  notes: string | null;
  subtotal: string | number;
  tax_amount: string | number;
  grand_total: string | number;
  confirmed_by_user_id: number | null;
  confirmed_at: Date | null;
  completed_by_user_id: number | null;
  completed_at: Date | null;
  created_by_user_id: number | null;
  updated_by_user_id: number | null;
  created_at: Date;
  updated_at: Date;
};

type SalesOrderLineRow = RowDataPacket & {
  id: number;
  order_id: number;
  line_no: number;
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
  description: string;
  qty: number;
  unit_price: number;
  line_total: number;
};

export type SalesOrderDetail = SalesOrder & {
  lines: SalesOrderLine[];
};

type OrderLineInput = {
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
};

function buildOrderLines(lines: OrderLineInput[]): Array<{ line_no: number; description: string; qty: number; unit_price: number; line_total: number }> {
  return lines.map((line, index) => {
    const lineTotal = normalizeMoney(line.qty * line.unit_price);
    return {
      line_no: index + 1,
      description: line.description.trim(),
      qty: line.qty,
      unit_price: normalizeMoney(line.unit_price),
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
    `SELECT * FROM sales_order_lines WHERE order_id = ? ORDER BY line_no`,
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

    const orderNo = await getNumberWithConflictMapping(
      companyId,
      input.outlet_id,
      DOCUMENT_TYPES.SALES_ORDER,
      input.order_no
    );

    const lineRows = buildOrderLines(input.lines);
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
          description,
          qty,
          unit_price,
          line_total
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          orderId,
          companyId,
          input.outlet_id,
          line.line_no,
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

    let lineRows: Array<{ line_no: number; description: string; qty: number; unit_price: number; line_total: number }> | null = null;
    let subtotal = Number(current.subtotal);

    if (input.lines) {
      lineRows = buildOrderLines(input.lines);
      subtotal = sumMoney(lineRows.map((line) => line.line_total));
    } else if (nextOutletId !== current.outlet_id) {
      const existingLines = await findOrderLinesByOrderId(connection, orderId);
      const lineInputs = existingLines.map((line) => ({
        description: line.description,
        qty: Number(line.qty),
        unit_price: Number(line.unit_price)
      }));
      lineRows = buildOrderLines(lineInputs);
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
      const placeholders = lineRows.map(() => "(?, ?, ?, ?, ?, ?, ?, ?)").join(", ");
      const values: Array<string | number> = [];
      for (const line of lineRows) {
        values.push(
          orderId,
          companyId,
          nextOutletId,
          line.line_no,
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

  if (filters.dateFrom) {
    conditions.push("order_date >= ?");
    values.push(filters.dateFrom);
  }

  if (filters.dateTo) {
    conditions.push("order_date <= ?");
    values.push(filters.dateTo);
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

    const orderLines = await findOrderLinesByOrderId(connection, orderId);
    const invoiceLines = orderLines.map((line, index) => ({
      line_no: index + 1,
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
        status,
        payment_status,
        subtotal,
        tax_amount,
        grand_total,
        paid_total,
        created_by_user_id,
        updated_by_user_id
      ) VALUES (?, ?, ?, ?, ?, 'DRAFT', 'UNPAID', ?, ?, ?, 0, ?, ?)`,
      [
        companyId,
        input.outlet_id,
        orderId,
        invoiceNo,
        input.invoice_date,
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
          description,
          qty,
          unit_price,
          line_total
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          invoiceId,
          companyId,
          input.outlet_id,
          line.line_no,
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
