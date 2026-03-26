// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Order Service
 * 
 * Order CRUD operations and lifecycle management.
 * Extracted from sales.ts (originally lines 2411-3249)
 */

import type { ResultSetHeader, RowDataPacket } from "mysql2";
import type { PoolConnection } from "mysql2/promise";
import { getDbPool } from "@/lib/db";
import {
  DOCUMENT_TYPES,
  type DocumentType
} from "@/lib/numbering";
import { toDateTimeRangeWithTimezone, toMysqlDateTimeFromDateLike } from "@/lib/date-helpers";
import { findInvoiceDetailWithExecutor } from "@/lib/invoices";
import type { InvoiceTaxInput, InvoiceDueTerm, SalesInvoiceDetail } from "@/lib/invoices";
import {
  normalizeMoney,
  sumMoney,
  withTransaction,
  getNumberWithConflictMapping,
  ensureCompanyOutletExists,
  ensureUserHasOutletAccess,
  formatDateOnly,
  type QueryExecutor,
  DatabaseConflictError,
  DatabaseReferenceError,
  DatabaseForbiddenError
} from "@/lib/shared/common-utils";

// Re-export error classes from shared for backward compatibility
export { DatabaseConflictError, DatabaseReferenceError, DatabaseForbiddenError } from "@/lib/shared/common-utils";

// Re-export types from types module
export type {
  SalesOrder,
  SalesOrderLine,
  SalesOrderDetail,
  SalesOrderStatus,
  OrderLineInput,
  OrderListFilters,
  MutationActor
} from "./types";

export type { SalesOrderRow, SalesOrderLineRow, ItemLookup } from "./types";

// Import types from types module
import type {
  SalesOrder,
  SalesOrderLine,
  SalesOrderDetail,
  SalesOrderStatus,
  SalesOrderRow,
  SalesOrderLineRow,
  OrderLineInput,
  OrderListFilters,
  MutationActor,
  ItemLookup
} from "./types";

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
// Order Line Builder
// =============================================================================

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

// =============================================================================
// Order Query Helpers
// =============================================================================

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
    confirmed_at: row.confirmed_at ? toMysqlDateTimeFromDateLike(row.confirmed_at.toString()) : undefined,
    completed_by_user_id: row.completed_by_user_id,
    completed_at: row.completed_at ? toMysqlDateTimeFromDateLike(row.completed_at.toString()) : undefined,
    created_by_user_id: row.created_by_user_id,
    updated_by_user_id: row.updated_by_user_id,
    created_at: toMysqlDateTimeFromDateLike(row.created_at.toString()),
    updated_at: toMysqlDateTimeFromDateLike(row.updated_at.toString())
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

// =============================================================================
// Due Date Resolution (for convertOrderToInvoice)
// =============================================================================

function resolveInvoiceDueDate(input: {
  invoiceDate: string;
  dueDate?: string;
  dueTerm?: InvoiceDueTerm;
}): string {
  if (input.dueDate) {
    return input.dueDate;
  }

  if (input.dueTerm) {
    const termDays: Record<InvoiceDueTerm, number> = {
      NET_0: 0,
      NET_7: 7,
      NET_14: 14,
      NET_15: 15,
      NET_20: 20,
      NET_30: 30,
      NET_45: 45,
      NET_60: 60,
      NET_90: 90
    };
    const days = termDays[input.dueTerm];
    const date = new Date(input.invoiceDate);
    date.setDate(date.getDate() + days);
    return date.toISOString().slice(0, 10);
  }

  return input.invoiceDate;
}

// =============================================================================
// CRUD Operations
// =============================================================================

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
          await ensureUserHasOutletAccess(actor.userId, companyId, existing.outlet_id);
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
    await ensureUserHasOutletAccess(actor.userId, companyId, order.outlet_id);
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
      await ensureUserHasOutletAccess(actor.userId, companyId, current.outlet_id);
    }

    if (typeof input.outlet_id === "number") {
      await ensureCompanyOutletExists(connection, companyId, input.outlet_id);
      if (actor) {
        await ensureUserHasOutletAccess(actor.userId, companyId, input.outlet_id);
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
      if (error instanceof Error && 'errno' in error && (error as { errno: number }).errno === 1062) {
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

// =============================================================================
// List Orders
// =============================================================================

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

// =============================================================================
// Lifecycle Operations
// =============================================================================

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
      await ensureUserHasOutletAccess(actor.userId, companyId, order.outlet_id);
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
      await ensureUserHasOutletAccess(actor.userId, companyId, order.outlet_id);
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
      await ensureUserHasOutletAccess(actor.userId, companyId, order.outlet_id);
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

// =============================================================================
// Convert Order to Invoice
// =============================================================================

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
      await ensureUserHasOutletAccess(actor.userId, companyId, input.outlet_id);
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
