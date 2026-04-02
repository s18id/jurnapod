// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Order Service
 * 
 * Sales order orchestration service.
 * This service handles order CRUD operations and lifecycle management.
 * 
 * IMPORTANT: This service does NOT import @/lib/auth or @/lib/db directly.
 * ACL checks are performed via the injected AccessScopeChecker interface.
 * Database access is performed via the injected SalesDb interface.
 */

import type { AccessScopeChecker } from "../interfaces/access-scope-checker.js";
import {
  SalesPermissions
} from "../interfaces/access-scope-checker.js";
import type {
  SalesOrderDetail,
  SalesOrderStatus,
  OrderLineInput,
  OrderListFilters,
  MutationActor,
  ItemLookup,
  SalesOrder,
  SalesOrderLine
} from "../types/sales.js";
import type { SalesDb, SalesDbExecutor } from "./sales-db.js";

// Re-export error types
export type { SalesAuthorizationError } from "../interfaces/access-scope-checker.js";
export type { SalesConflictError, SalesReferenceError } from "../types/sales.js";

// =============================================================================
// Error Classes
// =============================================================================

export class DatabaseConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DatabaseConflictError";
  }
}

export class DatabaseReferenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DatabaseReferenceError";
  }
}

export class DatabaseForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DatabaseForbiddenError";
  }
}

// =============================================================================
// Money Helpers (internal to module)
// =============================================================================

const MONEY_SCALE = 100;

function normalizeMoney(value: number): number {
  return Math.round(value * MONEY_SCALE) / MONEY_SCALE;
}

function sumMoney(values: number[]): number {
  return normalizeMoney(values.reduce((acc, val) => acc + val, 0));
}

// =============================================================================
// Date Helpers (internal to module)
// =============================================================================

function formatDateOnly(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.slice(0, 10);
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toISOString().slice(0, 10);
}

// =============================================================================
// Due Date Resolution
// =============================================================================

function addDaysToDateOnly(dateOnly: string, days: number): string {
  const baseDate = new Date(`${dateOnly}T00:00:00.000Z`);
  if (Number.isNaN(baseDate.getTime())) {
    throw new Error("Invalid date");
  }
  baseDate.setUTCDate(baseDate.getUTCDate() + days);
  return baseDate.toISOString().slice(0, 10);
}

export interface ResolveDueDateInput {
  invoiceDate: string;
  dueDate?: string;
  dueTerm?: "NET_0" | "NET_7" | "NET_14" | "NET_15" | "NET_20" | "NET_30" | "NET_45" | "NET_60" | "NET_90";
}

const DUE_TERM_DAYS: Record<string, number> = {
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

export function resolveDueDate(input: ResolveDueDateInput): string {
  if (input.dueDate) {
    return input.dueDate;
  }
  if (input.dueTerm) {
    const days = DUE_TERM_DAYS[input.dueTerm] ?? 0;
    return addDaysToDateOnly(input.invoiceDate, days);
  }
  return input.invoiceDate;
}

// =============================================================================
// Order Service Interface
// =============================================================================

export interface OrderService {
  createOrder(
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
  ): Promise<SalesOrderDetail>;

  getOrder(
    companyId: number,
    orderId: number,
    actor?: MutationActor
  ): Promise<SalesOrderDetail | null>;

  updateOrder(
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
  ): Promise<SalesOrderDetail | null>;

  listOrders(
    companyId: number,
    filters: OrderListFilters
  ): Promise<{ total: number; orders: SalesOrderDetail[] }>;

  confirmOrder(
    companyId: number,
    orderId: number,
    actor?: MutationActor
  ): Promise<SalesOrderDetail>;

  completeOrder(
    companyId: number,
    orderId: number,
    actor?: MutationActor
  ): Promise<SalesOrderDetail>;

  voidOrder(
    companyId: number,
    orderId: number,
    actor?: MutationActor
  ): Promise<SalesOrderDetail>;
}

export interface OrderServiceDeps {
  db: SalesDb;
  accessScopeChecker: AccessScopeChecker;
}

// =============================================================================
// Order Lines Builder
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
// Normalization Helpers
// =============================================================================

interface SalesOrderRow {
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
}

interface SalesOrderLineRow {
  id: number;
  order_id: number;
  line_no: number;
  line_type: "SERVICE" | "PRODUCT";
  item_id: number | null;
  description: string;
  qty: string | number;
  unit_price: string | number;
  line_total: string | number;
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
    confirmed_at: row.confirmed_at ? row.confirmed_at : undefined,
    completed_by_user_id: row.completed_by_user_id,
    completed_at: row.completed_at ? row.completed_at : undefined,
    created_by_user_id: row.created_by_user_id,
    updated_by_user_id: row.updated_by_user_id,
    created_at: row.created_at,
    updated_at: row.updated_at
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

// =============================================================================
// Order Service Factory
// =============================================================================

export function createOrderService(deps: OrderServiceDeps): OrderService {
  const { db, accessScopeChecker } = deps;

  async function withTransaction<T>(operation: (executor: SalesDbExecutor) => Promise<T>): Promise<T> {
    return db.withTransaction(operation);
  }

  async function ensureOutletExists(executor: SalesDbExecutor, companyId: number, outletId: number): Promise<void> {
    const exists = await executor.outletExists(companyId, outletId);
    if (!exists) {
      throw new DatabaseReferenceError("Outlet not found");
    }
  }

  async function findOrderById(
    executor: SalesDbExecutor,
    companyId: number,
    orderId: number,
    options?: { forUpdate?: boolean }
  ): Promise<SalesOrderRow | null> {
    return executor.findOrderById(companyId, orderId, options?.forUpdate);
  }

  async function findOrderByClientRef(
    executor: SalesDbExecutor,
    companyId: number,
    clientRef: string
  ): Promise<SalesOrderRow | null> {
    return executor.findOrderByClientRef(companyId, clientRef);
  }

  async function findOrderLines(
    executor: SalesDbExecutor,
    orderId: number
  ): Promise<SalesOrderLineRow[]> {
    return executor.findOrderLines(orderId);
  }

  async function findItemById(
    executor: SalesDbExecutor,
    companyId: number,
    itemId: number
  ): Promise<ItemLookup | null> {
    return executor.findItemById(companyId, itemId);
  }

  async function getNextOrderNumber(
    executor: SalesDbExecutor,
    companyId: number,
    outletId: number,
    preferredNo?: string
  ): Promise<string> {
    return executor.getNextDocumentNumber(companyId, outletId, "SALES_ORDER", preferredNo);
  }

  async function getNextInvoiceNumber(
    executor: SalesDbExecutor,
    companyId: number,
    outletId: number,
    preferredNo?: string
  ): Promise<string> {
    return executor.getNextDocumentNumber(companyId, outletId, "SALES_INVOICE", preferredNo);
  }

  async function validateTaxRates(
    executor: SalesDbExecutor,
    companyId: number,
    taxRateIds: number[]
  ): Promise<void> {
    const valid = await executor.validateTaxRates(companyId, taxRateIds);
    if (!valid) {
      throw new DatabaseReferenceError("Invalid tax rate");
    }
  }

  return {
    async createOrder(
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
      return withTransaction(async (executor) => {
        if (actor) {
          await accessScopeChecker.assertOutletAccess({
            actorUserId: actor.userId,
            companyId,
            outletId: input.outlet_id,
            permission: SalesPermissions.CREATE_ORDER
          });
        }

        // Check for duplicate client_ref
        if (input.client_ref) {
          const existing = await findOrderByClientRef(executor, companyId, input.client_ref);
          if (existing) {
            if (actor) {
              await accessScopeChecker.assertOutletAccess({
                actorUserId: actor.userId,
                companyId,
                outletId: existing.outlet_id,
                permission: SalesPermissions.READ_ORDER
              });
            }
            const lines = await findOrderLines(executor, existing.id);
            return {
              ...normalizeSalesOrderRow(existing),
              lines: lines.map(normalizeSalesOrderLineRow)
            };
          }
        }

        await ensureOutletExists(executor, companyId, input.outlet_id);
        if (actor) {
          await accessScopeChecker.assertOutletAccess({
            actorUserId: actor.userId,
            companyId,
            outletId: input.outlet_id,
            permission: SalesPermissions.CREATE_ORDER
          });
        }

        // Validate and fetch items for PRODUCT lines
        const itemLookups = new Map<number, ItemLookup>();
        for (const line of input.lines) {
          const lineType = line.line_type ?? "SERVICE";
          if (lineType === "PRODUCT" && line.item_id) {
            const item = await findItemById(executor, companyId, line.item_id);
            if (item) {
              itemLookups.set(item.id, item);
            }
          }
        }

        const orderNo = await getNextOrderNumber(executor, companyId, input.outlet_id, input.order_no);

        const lineRows = buildOrderLines(input.lines, itemLookups);
        const subtotal = sumMoney(lineRows.map((line) => line.line_total));
        const taxAmount = normalizeMoney(0);
        const grandTotal = normalizeMoney(subtotal + taxAmount);

        const orderId = await executor.insertOrder({
          companyId,
          outletId: input.outlet_id,
          orderNo,
          orderDate: input.order_date,
          expectedDate: input.expected_date,
          clientRef: input.client_ref,
          status: "DRAFT",
          notes: input.notes,
          subtotal,
          taxAmount,
          grandTotal,
          createdByUserId: actor?.userId
        });

        for (const line of lineRows) {
          await executor.insertOrderLine({
            orderId,
            companyId,
            outletId: input.outlet_id,
            lineNo: line.line_no,
            lineType: line.line_type,
            itemId: line.item_id,
            description: line.description,
            qty: line.qty,
            unitPrice: line.unit_price,
            lineTotal: line.line_total
          });
        }

        const order = await findOrderById(executor, companyId, orderId);
        if (!order) {
          throw new Error("Created order not found");
        }

        const lines = await findOrderLines(executor, orderId);
        return {
          ...normalizeSalesOrderRow(order),
          lines: lines.map(normalizeSalesOrderLineRow)
        };
      });
    },

    async getOrder(
      companyId: number,
      orderId: number,
      actor?: MutationActor
    ): Promise<SalesOrderDetail | null> {
      const executor = db.executor;
      
      const order = await findOrderById(executor, companyId, orderId);
      if (!order) {
        return null;
      }

      if (actor) {
        await accessScopeChecker.assertOutletAccess({
          actorUserId: actor.userId,
          companyId,
          outletId: order.outlet_id,
          permission: SalesPermissions.READ_ORDER
        });
      }

      const lines = await findOrderLines(executor, orderId);
      return {
        ...normalizeSalesOrderRow(order),
        lines: lines.map(normalizeSalesOrderLineRow)
      };
    },

    async updateOrder(
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
      return withTransaction(async (executor) => {
        const current = await findOrderById(executor, companyId, orderId, { forUpdate: true });
        if (!current) {
          return null;
        }

        if (current.status !== "DRAFT") {
          throw new DatabaseConflictError("Order is not editable");
        }

        if (actor) {
          await accessScopeChecker.assertOutletAccess({
            actorUserId: actor.userId,
            companyId,
            outletId: current.outlet_id,
            permission: SalesPermissions.UPDATE_ORDER
          });
        }

        if (typeof input.outlet_id === "number") {
          await ensureOutletExists(executor, companyId, input.outlet_id);
          if (actor) {
            await accessScopeChecker.assertOutletAccess({
              actorUserId: actor.userId,
              companyId,
              outletId: input.outlet_id,
              permission: SalesPermissions.UPDATE_ORDER
            });
          }
        }

        const nextOutletId = input.outlet_id ?? current.outlet_id;
        const nextOrderNo = input.order_no ?? current.order_no;
        const nextOrderDate = input.order_date ?? formatDateOnly(current.order_date);
        const nextExpectedDate = input.expected_date
          ? formatDateOnly(input.expected_date)
          : current.expected_date
            ? formatDateOnly(current.expected_date)
            : null;
        const nextNotes = input.notes ?? current.notes;

        // Validate and fetch items for PRODUCT lines
        const itemLookups = new Map<number, ItemLookup>();
        if (input.lines) {
          for (const line of input.lines) {
            const lineType = line.line_type ?? "SERVICE";
            if (lineType === "PRODUCT" && line.item_id) {
              const item = await findItemById(executor, companyId, line.item_id);
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
          const existingLines = await findOrderLines(executor, orderId);
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
          await executor.deleteOrderLines(companyId, orderId);
        }

        await executor.updateOrder({
          companyId,
          orderId,
          outletId: nextOutletId,
          orderNo: nextOrderNo,
          orderDate: nextOrderDate,
          expectedDate: nextExpectedDate,
          notes: nextNotes,
          subtotal,
          taxAmount,
          grandTotal,
          updatedByUserId: actor?.userId
        });

        if (lineRows) {
          for (const line of lineRows) {
            await executor.insertOrderLine({
              orderId,
              companyId,
              outletId: nextOutletId,
              lineNo: line.line_no,
              lineType: line.line_type,
              itemId: line.item_id,
              description: line.description,
              qty: line.qty,
              unitPrice: line.unit_price,
              lineTotal: line.line_total
            });
          }
        }

        const order = await findOrderById(executor, companyId, orderId);
        if (!order) {
          return null;
        }

        const lines = await findOrderLines(executor, orderId);
        return {
          ...normalizeSalesOrderRow(order),
          lines: lines.map(normalizeSalesOrderLineRow)
        };
      });
    },

    async listOrders(
      companyId: number,
      filters: OrderListFilters
    ): Promise<{ total: number; orders: SalesOrderDetail[] }> {
      const executor = db.executor;
      return executor.listOrders(companyId, filters);
    },

    async confirmOrder(
      companyId: number,
      orderId: number,
      actor?: MutationActor
    ): Promise<SalesOrderDetail> {
      return withTransaction(async (executor) => {
        const order = await findOrderById(executor, companyId, orderId);
        if (!order) {
          throw new DatabaseReferenceError("Order not found");
        }

        if (order.status !== "DRAFT") {
          throw new DatabaseConflictError(`Cannot confirm order in ${order.status} status`);
        }

        if (actor) {
          await accessScopeChecker.assertOutletAccess({
            actorUserId: actor.userId,
            companyId,
            outletId: order.outlet_id,
            permission: SalesPermissions.UPDATE_ORDER
          });
        }

        await executor.updateOrderStatus(companyId, orderId, "CONFIRMED", actor?.userId);

        const updatedOrder = await findOrderById(executor, companyId, orderId);
        if (!updatedOrder) {
          throw new Error("Updated order not found");
        }

        const lines = await findOrderLines(executor, orderId);
        return {
          ...normalizeSalesOrderRow(updatedOrder),
          lines: lines.map(normalizeSalesOrderLineRow)
        };
      });
    },

    async completeOrder(
      companyId: number,
      orderId: number,
      actor?: MutationActor
    ): Promise<SalesOrderDetail> {
      return withTransaction(async (executor) => {
        const order = await findOrderById(executor, companyId, orderId);
        if (!order) {
          throw new DatabaseReferenceError("Order not found");
        }

        if (order.status !== "CONFIRMED") {
          throw new DatabaseConflictError(`Cannot complete order in ${order.status} status`);
        }

        if (actor) {
          await accessScopeChecker.assertOutletAccess({
            actorUserId: actor.userId,
            companyId,
            outletId: order.outlet_id,
            permission: SalesPermissions.UPDATE_ORDER
          });
        }

        await executor.updateOrderStatus(companyId, orderId, "COMPLETED", actor?.userId);

        const updatedOrder = await findOrderById(executor, companyId, orderId);
        if (!updatedOrder) {
          throw new Error("Updated order not found");
        }

        const lines = await findOrderLines(executor, orderId);
        return {
          ...normalizeSalesOrderRow(updatedOrder),
          lines: lines.map(normalizeSalesOrderLineRow)
        };
      });
    },

    async voidOrder(
      companyId: number,
      orderId: number,
      actor?: MutationActor
    ): Promise<SalesOrderDetail> {
      return withTransaction(async (executor) => {
        const order = await findOrderById(executor, companyId, orderId);
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
          await accessScopeChecker.assertOutletAccess({
            actorUserId: actor.userId,
            companyId,
            outletId: order.outlet_id,
            permission: SalesPermissions.CANCEL_ORDER
          });
        }

        await executor.updateOrderStatus(companyId, orderId, "VOID", actor?.userId);

        const updatedOrder = await findOrderById(executor, companyId, orderId);
        if (!updatedOrder) {
          throw new Error("Updated order not found");
        }

        const lines = await findOrderLines(executor, orderId);
        return {
          ...normalizeSalesOrderRow(updatedOrder),
          lines: lines.map(normalizeSalesOrderLineRow)
        };
      });
    }
  };
}
