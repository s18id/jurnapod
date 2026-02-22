import type { ResultSetHeader, RowDataPacket } from "mysql2";
import type { PoolConnection } from "mysql2/promise";
import { getDbPool } from "./db";
import { postSalesInvoiceToJournal, postSalesPaymentToJournal } from "./sales-posting";

type SalesInvoiceRow = RowDataPacket & {
  id: number;
  company_id: number;
  outlet_id: number;
  invoice_no: string;
  invoice_date: Date | string;
  status: "DRAFT" | "POSTED" | "VOID";
  payment_status: "UNPAID" | "PARTIAL" | "PAID";
  subtotal: string | number;
  tax_amount: string | number;
  grand_total: string | number;
  paid_total: string | number;
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

type AccessCheckRow = RowDataPacket & {
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

type PreparedInvoiceLine = {
  line_no: number;
  description: string;
  qty: number;
  unit_price: number;
  line_total: number;
};

type InvoiceListFilters = {
  outletIds?: readonly number[];
  status?: "DRAFT" | "POSTED" | "VOID";
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
  invoice_date: string;
  status: "DRAFT" | "POSTED" | "VOID";
  payment_status: "UNPAID" | "PARTIAL" | "PAID";
  subtotal: number;
  tax_amount: number;
  grand_total: number;
  paid_total: number;
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

export type SalesInvoiceDetail = SalesInvoice & {
  lines: SalesInvoiceLine[];
};

type SalesPaymentRow = RowDataPacket & {
  id: number;
  company_id: number;
  outlet_id: number;
  invoice_id: number;
  payment_no: string;
  payment_at: Date | string;
  method: "CASH" | "QRIS" | "CARD";
  status: "DRAFT" | "POSTED" | "VOID";
  amount: string | number;
  created_at: Date;
  updated_at: Date;
};

export type SalesPayment = {
  id: number;
  company_id: number;
  outlet_id: number;
  invoice_id: number;
  payment_no: string;
  payment_at: string;
  method: "CASH" | "QRIS" | "CARD";
  status: "DRAFT" | "POSTED" | "VOID";
  amount: number;
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
    invoice_date: formatDateOnly(row.invoice_date),
    status: row.status,
    payment_status: row.payment_status,
    subtotal: Number(row.subtotal),
    tax_amount: Number(row.tax_amount),
    grand_total: Number(row.grand_total),
    paid_total: Number(row.paid_total),
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
    `SELECT u.id
     FROM users u
     INNER JOIN user_outlets uo ON uo.user_id = u.id
     INNER JOIN outlets o ON o.id = uo.outlet_id
     WHERE u.id = ?
       AND u.company_id = ?
       AND u.is_active = 1
       AND uo.outlet_id = ?
       AND o.company_id = ?
     LIMIT 1`,
    [userId, companyId, outletId, companyId]
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
    `SELECT id, company_id, outlet_id, invoice_no, invoice_date, status, payment_status,
            subtotal, tax_amount, grand_total, paid_total, created_at, updated_at
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

async function findInvoiceDetailWithExecutor(
  executor: QueryExecutor,
  companyId: number,
  invoiceId: number
): Promise<SalesInvoiceDetail | null> {
  const invoice = await findInvoiceByIdWithExecutor(executor, companyId, invoiceId);
  if (!invoice) {
    return null;
  }

  const lines = await listInvoiceLinesWithExecutor(executor, companyId, invoiceId);
  return { ...invoice, lines };
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
    `SELECT id, company_id, outlet_id, invoice_no, invoice_date, status, payment_status,
            subtotal, tax_amount, grand_total, paid_total, created_at, updated_at
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
    invoice_no: string;
    invoice_date: string;
    tax_amount: number;
    lines: InvoiceLineInput[];
  },
  actor?: MutationActor
): Promise<SalesInvoiceDetail> {
  return withTransaction(async (connection) => {
    await ensureCompanyOutletExists(connection, companyId, input.outlet_id);
    if (actor) {
      await ensureUserHasOutletAccess(connection, actor.userId, companyId, input.outlet_id);
    }

    const { lineRows, subtotal } = buildInvoiceLines(input.lines);
    const taxAmount = normalizeMoney(input.tax_amount);
    const grandTotal = normalizeMoney(subtotal + taxAmount);

    try {
      const [result] = await connection.execute<ResultSetHeader>(
        `INSERT INTO sales_invoices (
           company_id,
           outlet_id,
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
         ) VALUES (?, ?, ?, ?, 'DRAFT', 'UNPAID', ?, ?, ?, 0, ?, ?)`,
        [
          companyId,
          input.outlet_id,
          input.invoice_no,
          input.invoice_date,
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

      const invoice = await findInvoiceDetailWithExecutor(connection, companyId, invoiceId);
      if (!invoice) {
        throw new Error("Created invoice not found");
      }

      return invoice;
    } catch (error) {
      if (isMysqlError(error) && error.errno === mysqlDuplicateErrorCode) {
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

    const taxAmount =
      typeof input.tax_amount === "number"
        ? normalizeMoney(input.tax_amount)
        : current.tax_amount;
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

    if (invoice.status !== "DRAFT") {
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
    payment_at: new Date(row.payment_at).toISOString(),
    method: row.method,
    status: row.status,
    amount: Number(row.amount),
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
    `SELECT id, company_id, outlet_id, invoice_id, payment_no, payment_at, method, status,
            amount, created_at, updated_at
     FROM sales_payments
     WHERE company_id = ?
       AND id = ?
     LIMIT 1${forUpdateClause}`,
    [companyId, paymentId]
  );

  if (!rows[0]) {
    return null;
  }

  return normalizePayment(rows[0]);
}

function buildPaymentWhereClause(companyId: number, filters: PaymentListFilters) {
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

  if (filters.dateFrom) {
    conditions.push("payment_at >= ?");
    values.push(filters.dateFrom);
  }

  if (filters.dateTo) {
    conditions.push("payment_at <= ?");
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
     FROM sales_payments
     WHERE ${where.clause}`,
    where.values
  );
  const total = Number(countRows[0]?.total ?? 0);

  const [rows] = await pool.execute<SalesPaymentRow[]>(
    `SELECT id, company_id, outlet_id, invoice_id, payment_no, payment_at, method, status,
            amount, created_at, updated_at
     FROM sales_payments
     WHERE ${where.clause}
     ORDER BY payment_at DESC, id DESC
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
    payment_no: string;
    payment_at: string;
    method: "CASH" | "QRIS" | "CARD";
    amount: number;
  },
  actor?: MutationActor
): Promise<SalesPayment> {
  return withTransaction(async (connection) => {
    await ensureCompanyOutletExists(connection, companyId, input.outlet_id);
    if (actor) {
      await ensureUserHasOutletAccess(connection, actor.userId, companyId, input.outlet_id);
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

    try {
      const [result] = await connection.execute<ResultSetHeader>(
        `INSERT INTO sales_payments (
           company_id,
           outlet_id,
           invoice_id,
           payment_no,
           payment_at,
           method,
           status,
           amount,
           created_by_user_id,
           updated_by_user_id
         ) VALUES (?, ?, ?, ?, ?, ?, 'DRAFT', ?, ?, ?)`,
        [
          companyId,
          input.outlet_id,
          input.invoice_id,
          input.payment_no,
          paymentAt,
          input.method,
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
    method?: "CASH" | "QRIS" | "CARD";
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

    const nextOutletId = input.outlet_id ?? current.outlet_id;
    const nextInvoiceId = input.invoice_id ?? current.invoice_id;
    const nextPaymentNo = input.payment_no ?? current.payment_no;
    const nextPaymentAt = toMysqlDateTime(input.payment_at ?? current.payment_at);
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
          nextMethod,
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
