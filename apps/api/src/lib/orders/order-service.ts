// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Order Service
 * 
 * Order CRUD operations and lifecycle management.
 * Extracted from sales.ts (originally lines 2411-3249)
 */

import { getDb, type KyselySchema } from "@/lib/db";
import { sql } from "kysely";
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
  getNumberWithConflictMapping,
  ensureCompanyOutletExists,
  ensureUserHasOutletAccess,
  formatDateOnly,
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
// Transaction Helper
// =============================================================================

async function withTransaction<T>(operation: (db: KyselySchema) => Promise<T>): Promise<T> {
  const db = getDb();
  return db.transaction().execute(operation);
}

// =============================================================================
// Item Helpers
// =============================================================================

interface ItemRow {
  id: number;
  name: string;
  sku: string;
  type: string;
  default_price: number | null;
}

async function findItemByIdWithExecutor(
  db: KyselySchema,
  companyId: number,
  itemId: number
): Promise<ItemLookup | null> {
  const rows = await sql`
    SELECT i.id, i.name, i.sku, i.item_type as type,
            (SELECT price FROM item_prices
             WHERE item_id = i.id AND company_id = i.company_id
             ORDER BY outlet_id IS NULL DESC, is_active DESC, id ASC
             LIMIT 1) as default_price
     FROM items i
     WHERE i.id = ${itemId} AND i.company_id = ${companyId} AND i.is_active = 1
     LIMIT 1
  `.execute(db);

  if (rows.rows.length === 0) {
    return null;
  }
  const row = rows.rows[0] as ItemRow;
  return {
    id: Number(row.id),
    name: row.name,
    sku: row.sku,
    type: row.type,
    default_price: row.default_price !== null ? Number(row.default_price) : null
  };
}

async function validateAndGetItemForLine(
  db: KyselySchema,
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

  const item = await findItemByIdWithExecutor(db, companyId, itemId);
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
  db: KyselySchema,
  companyId: number,
  orderId: number,
  options?: { forUpdate?: boolean }
): Promise<SalesOrderRow | null> {
  const forUpdateClause = options?.forUpdate ? sql` FOR UPDATE` : sql``;
  const rows = await sql`
    SELECT * FROM sales_orders WHERE company_id = ${companyId} AND id = ${orderId}
    ${forUpdateClause}
  `.execute(db);
  return (rows.rows[0] as SalesOrderRow) || null;
}

async function findOrderByClientRefWithExecutor(
  db: KyselySchema,
  companyId: number,
  clientRef: string
): Promise<SalesOrderRow | null> {
  const rows = await sql`
    SELECT * FROM sales_orders WHERE company_id = ${companyId} AND client_ref = ${clientRef}
  `.execute(db);
  return (rows.rows[0] as SalesOrderRow) || null;
}

async function findOrderLinesByOrderId(
  db: KyselySchema,
  orderId: number
): Promise<SalesOrderLineRow[]> {
  const rows = await sql`
    SELECT id, order_id, line_no, line_type, item_id, description, qty, unit_price, line_total
     FROM sales_order_lines WHERE order_id = ${orderId} ORDER BY line_no
  `.execute(db);
  return rows.rows as SalesOrderLineRow[];
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
  db: KyselySchema,
  companyId: number,
  orderId: number
): Promise<SalesOrderDetail | null> {
  const order = await findOrderByIdWithExecutor(db, companyId, orderId);
  if (!order) {
    return null;
  }

  const lines = await findOrderLinesByOrderId(db, orderId);
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
  return withTransaction(async (db) => {
    if (input.client_ref) {
      const existing = await findOrderByClientRefWithExecutor(db, companyId, input.client_ref);
      if (existing) {
        if (actor) {
          await ensureUserHasOutletAccess(actor.userId, companyId, existing.outlet_id);
        }
        const lines = await findOrderLinesByOrderId(db, existing.id);
        return {
          ...normalizeSalesOrderRow(existing),
          lines: lines.map(normalizeSalesOrderLineRow)
        };
      }
    }

    await ensureCompanyOutletExists(db, companyId, input.outlet_id);
    if (actor) {
      await ensureUserHasOutletAccess(actor.userId, companyId, input.outlet_id);
    }

    // Validate and fetch items for PRODUCT lines
    const itemLookups = new Map<number, ItemLookup>();
    for (const line of input.lines) {
      const lineType = line.line_type ?? "SERVICE";
      if (lineType === "PRODUCT") {
        const item = await validateAndGetItemForLine(db, companyId, line.item_id, lineType);
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
    const subtotal = sumMoney(lineRows.map((line) => line.line_total));
    const taxAmount = normalizeMoney(0);
    const grandTotal = normalizeMoney(subtotal + taxAmount);

    const insertResult = await sql`
      INSERT INTO sales_orders (
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
      ) VALUES (
        ${companyId},
        ${input.outlet_id},
        ${orderNo},
        ${input.order_date},
        ${input.expected_date ?? null},
        ${input.client_ref ?? null},
        'DRAFT',
        ${input.notes ?? null},
        ${subtotal},
        ${taxAmount},
        ${grandTotal},
        ${actor?.userId ?? null},
        ${actor?.userId ?? null}
      )
    `.execute(db);

    const orderId = Number(insertResult.insertId);

    for (const line of lineRows) {
      await sql`
        INSERT INTO sales_order_lines (
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
        ) VALUES (
          ${orderId},
          ${companyId},
          ${input.outlet_id},
          ${line.line_no},
          ${line.line_type},
          ${line.item_id},
          ${line.description},
          ${line.qty},
          ${line.unit_price},
          ${line.line_total}
        )
      `.execute(db);
    }

    const order = await findOrderByIdWithExecutor(db, companyId, orderId);
    if (!order) {
      throw new Error("Created order not found");
    }

    const lines = await findOrderLinesByOrderId(db, orderId);
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
  const db = getDb();
  const order = await findOrderByIdWithExecutor(db, companyId, orderId);
  if (!order) {
    return null;
  }

  if (actor) {
    await ensureUserHasOutletAccess(actor.userId, companyId, order.outlet_id);
  }

  const lines = await findOrderLinesByOrderId(db, orderId);
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
  return withTransaction(async (db) => {
    const current = await findOrderByIdWithExecutor(db, companyId, orderId, {
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
      await ensureCompanyOutletExists(db, companyId, input.outlet_id);
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
          const item = await validateAndGetItemForLine(db, companyId, line.item_id, lineType);
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
      const existingLines = await findOrderLinesByOrderId(db, orderId);
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
      await sql`DELETE FROM sales_order_lines WHERE company_id = ${companyId} AND order_id = ${orderId}`.execute(db);
    }

    try {
      await sql`UPDATE sales_orders
         SET outlet_id = ${nextOutletId},
             order_no = ${nextOrderNo},
             order_date = ${nextOrderDate},
             expected_date = ${nextExpectedDate},
             notes = ${nextNotes},
             subtotal = ${subtotal},
             tax_amount = ${taxAmount},
             grand_total = ${grandTotal},
             updated_by_user_id = ${actor?.userId ?? null},
             updated_at = CURRENT_TIMESTAMP
         WHERE company_id = ${companyId}
           AND id = ${orderId}`.execute(db);
    } catch (error) {
      if (error instanceof Error && 'errno' in error && (error as { errno: number }).errno === 1062) {
        throw new DatabaseConflictError("Duplicate order");
      }
      throw error;
    }

    if (lineRows) {
      for (const line of lineRows) {
        await sql`INSERT INTO sales_order_lines (
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
         ) VALUES (
           ${orderId},
           ${companyId},
           ${nextOutletId},
           ${line.line_no},
           ${line.line_type},
           ${line.item_id},
           ${line.description},
           ${line.qty},
           ${line.unit_price},
           ${line.line_total}
         )`.execute(db);
      }
    }

    return findOrderDetailWithExecutor(db, companyId, orderId);
  });
}

// =============================================================================
// List Orders
// =============================================================================

export async function listOrders(
  companyId: number,
  filters: OrderListFilters
): Promise<{ total: number; orders: SalesOrderDetail[] }> {
  const db = getDb();

  if (filters.outletIds) {
    if (filters.outletIds.length === 0) {
      return { total: 0, orders: [] };
    }
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

  // Build parameterized query using Kysely query builder for safe binding
  let countQuery = db
    .selectFrom("sales_orders")
    .where("company_id", "=", companyId);

  let baseQuery = db
    .selectFrom("sales_orders")
    .where("company_id", "=", companyId);

  if (filters.outletIds && filters.outletIds.length > 0) {
    countQuery = countQuery.where("outlet_id", "in", filters.outletIds);
    baseQuery = baseQuery.where("outlet_id", "in", filters.outletIds);
  }

  if (filters.status) {
    countQuery = countQuery.where("status", "=", filters.status);
    baseQuery = baseQuery.where("status", "=", filters.status);
  }

  if (dateFrom) {
    const fromDate = new Date(`${dateFrom}T00:00:00.000Z`);
    countQuery = countQuery.where("order_date", ">=", fromDate);
    baseQuery = baseQuery.where("order_date", ">=", fromDate);
  }

  if (dateTo) {
    const toDate = new Date(`${dateTo}T00:00:00.000Z`);
    countQuery = countQuery.where("order_date", "<=", toDate);
    baseQuery = baseQuery.where("order_date", "<=", toDate);
  }

  // Use a simple count query with Kysely
  const countResult = await countQuery
    .select((eb) => eb.fn.countAll().as("total"))
    .executeTakeFirst();
  
  const total = countResult ? Number((countResult as { total?: number | string }).total ?? 0) : 0;

  const limit = filters.limit ?? 50;
  const offset = filters.offset ?? 0;

  const orderResult = await baseQuery
    .orderBy("created_at", "desc")
    .limit(limit)
    .offset(offset)
    .selectAll()
    .execute();

  const orders: SalesOrderDetail[] = [];
  for (const row of orderResult as unknown as SalesOrderRow[]) {
    const lines = await findOrderLinesByOrderId(db, row.id);
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
  return withTransaction(async (db) => {
    const order = await findOrderByIdWithExecutor(db, companyId, orderId);
    if (!order) {
      throw new DatabaseReferenceError("Order not found");
    }

    if (order.status !== "DRAFT") {
      throw new DatabaseConflictError(`Cannot confirm order in ${order.status} status`);
    }

    if (actor) {
      await ensureUserHasOutletAccess(actor.userId, companyId, order.outlet_id);
    }

    await sql`UPDATE sales_orders 
       SET status = 'CONFIRMED', 
           confirmed_by_user_id = ${actor?.userId ?? null}, 
           confirmed_at = CURRENT_TIMESTAMP,
           updated_by_user_id = ${actor?.userId ?? null},
           updated_at = CURRENT_TIMESTAMP
       WHERE company_id = ${companyId} AND id = ${orderId}`.execute(db);

    const updatedOrder = await findOrderByIdWithExecutor(db, companyId, orderId);
    if (!updatedOrder) {
      throw new Error("Updated order not found");
    }

    const lines = await findOrderLinesByOrderId(db, orderId);
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
  return withTransaction(async (db) => {
    const order = await findOrderByIdWithExecutor(db, companyId, orderId);
    if (!order) {
      throw new DatabaseReferenceError("Order not found");
    }

    if (order.status !== "CONFIRMED") {
      throw new DatabaseConflictError(`Cannot complete order in ${order.status} status`);
    }

    if (actor) {
      await ensureUserHasOutletAccess(actor.userId, companyId, order.outlet_id);
    }

    await sql`UPDATE sales_orders 
       SET status = 'COMPLETED', 
           completed_by_user_id = ${actor?.userId ?? null}, 
           completed_at = CURRENT_TIMESTAMP,
           updated_by_user_id = ${actor?.userId ?? null},
           updated_at = CURRENT_TIMESTAMP
       WHERE company_id = ${companyId} AND id = ${orderId}`.execute(db);

    const updatedOrder = await findOrderByIdWithExecutor(db, companyId, orderId);
    if (!updatedOrder) {
      throw new Error("Updated order not found");
    }

    const lines = await findOrderLinesByOrderId(db, orderId);
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
  return withTransaction(async (db) => {
    const order = await findOrderByIdWithExecutor(db, companyId, orderId);
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

    await sql`UPDATE sales_orders 
       SET status = 'VOID',
           updated_by_user_id = ${actor?.userId ?? null},
           updated_at = CURRENT_TIMESTAMP
       WHERE company_id = ${companyId} AND id = ${orderId}`.execute(db);

    const updatedOrder = await findOrderByIdWithExecutor(db, companyId, orderId);
    if (!updatedOrder) {
      throw new Error("Updated order not found");
    }

    const lines = await findOrderLinesByOrderId(db, orderId);
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
  return withTransaction(async (db) => {
    const order = await findOrderByIdWithExecutor(db, companyId, orderId);
    if (!order) {
      throw new DatabaseReferenceError("Order not found");
    }

    if (order.status !== "CONFIRMED" && order.status !== "COMPLETED") {
      throw new DatabaseConflictError("Only confirmed or completed orders can be converted to invoice");
    }

    if (order.outlet_id !== input.outlet_id) {
      throw new DatabaseReferenceError("Outlet mismatch");
    }

    await ensureCompanyOutletExists(db, companyId, input.outlet_id);
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

    const orderLines = await findOrderLinesByOrderId(db, orderId);
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
      const taxIdsResult = await sql`SELECT id FROM tax_rates WHERE company_id = ${companyId} AND is_active = 1 AND id IN (${sql.join(taxRateIds.map(id => sql`${id}`), sql`, `)})`.execute(db);

      const matched = new Set((taxIdsResult.rows as Array<{ id: number }>).map((row) => Number(row.id)));
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

    const insertResult = await sql`INSERT INTO sales_invoices (
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
      ) VALUES (
        ${companyId},
        ${input.outlet_id},
        ${orderId},
        ${invoiceNo},
        ${input.invoice_date},
        ${dueDate},
        'DRAFT',
        'UNPAID',
        ${subtotal},
        ${taxAmount},
        ${grandTotal},
        0,
        ${actor?.userId ?? null},
        ${actor?.userId ?? null}
      )`.execute(db);

    const invoiceId = Number(insertResult.insertId);

    for (const line of invoiceLines) {
      await sql`INSERT INTO sales_invoice_lines (
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
        ) VALUES (
          ${invoiceId},
          ${companyId},
          ${input.outlet_id},
          ${line.line_no},
          ${line.line_type},
          ${line.item_id},
          ${line.description},
          ${line.qty},
          ${line.unit_price},
          ${line.line_total}
        )`.execute(db);
    }

    if (taxLines.length > 0) {
      for (const tax of taxLines) {
        await sql`INSERT INTO sales_invoice_taxes (
          sales_invoice_id,
          company_id,
          outlet_id,
          tax_rate_id,
          amount
        ) VALUES (
          ${invoiceId},
          ${companyId},
          ${input.outlet_id},
          ${tax.tax_rate_id},
          ${tax.amount}
        )`.execute(db);
      }
    }

    const invoice = await findInvoiceDetailWithExecutor(db, companyId, invoiceId);
    if (!invoice) {
      throw new Error("Created invoice not found");
    }

    return invoice;
  });
}
