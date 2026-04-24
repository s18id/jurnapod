// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Purchase Order service for purchasing module.
 *
 * Provides PO CRUD operations with tenant isolation, status transitions,
 * transactional create/update, and decimal handling.
 */

import type { KyselySchema } from "@jurnapod/db";
import { PURCHASE_ORDER_STATUS } from "@jurnapod/shared";
import { randomBytes } from "node:crypto";
import type {
  POLine,
  POResponse,
  ListPurchaseOrdersParams,
  ListPurchaseOrdersResult,
  CreatePurchaseOrderInput,
  CreatePurchaseOrderResult,
  UpdatePurchaseOrderInput,
  UpdatePurchaseOrderResult,
  TransitionPurchaseOrderStatusInput,
  TransitionPurchaseOrderStatusResult,
  CreatePOLineInput,
} from "../types/purchase-order.js";
import {
  VALID_TRANSITIONS,
  computeLineTotal,
  computeTotalAmount,
  toIso,
  formatOrderRow,
  toScaled4,
} from "../types/purchase-order.js";

// =============================================================================
// Order No Generation
// =============================================================================

function generatePurchaseOrderNo(now = new Date()): string {
  // purchase_orders.order_no is VARCHAR(32) (migration 0172)
  // Keep format short while maintaining very low collision probability.
  // Example: PO-MO6QTHYL-8A1F4D92C3 (24 chars)
  const ts = now.getTime().toString(36).toUpperCase();
  const rand = randomBytes(5).toString("hex").toUpperCase(); // 40 bits entropy
  return `PO-${ts}-${rand}`;
}



// =============================================================================
// Service
// =============================================================================

export class PurchaseOrderService {
  constructor(private readonly db: KyselySchema) {}

  // ---------------------------------------------------------------------------
  // List
  // ---------------------------------------------------------------------------

  async listPurchaseOrders(
    input: ListPurchaseOrdersParams
  ): Promise<ListPurchaseOrdersResult> {
    const { supplierId, status, dateFrom, dateTo } = input.filters;

    const countResult = await this.db
      .selectFrom("purchase_orders as po")
      .where((eb) => {
        const preds = [eb("po.company_id", "=", input.companyId)];
        if (supplierId !== undefined) preds.push(eb("po.supplier_id", "=", supplierId));
        if (status !== undefined) preds.push(eb("po.status", "=", Number(status)));
        if (dateFrom) preds.push(eb("po.order_date", ">=", new Date(dateFrom)));
        if (dateTo) preds.push(eb("po.order_date", "<=", new Date(dateTo)));
        return eb.and(preds);
      })
      .select((eb) => eb.fn.countAll().as("count"))
      .executeTakeFirst();

    const total = Number((countResult as { count?: string })?.count ?? 0);

    const orders = await this.db
      .selectFrom("purchase_orders as po")
      .leftJoin("suppliers as s", (join) =>
        join.onRef("po.supplier_id", "=", "s.id").onRef("po.company_id", "=", "s.company_id")
      )
      .where((eb) => {
        const preds = [eb("po.company_id", "=", input.companyId)];
        if (supplierId !== undefined) preds.push(eb("po.supplier_id", "=", supplierId));
        if (status !== undefined) preds.push(eb("po.status", "=", Number(status)));
        if (dateFrom) preds.push(eb("po.order_date", ">=", new Date(dateFrom)));
        if (dateTo) preds.push(eb("po.order_date", "<=", new Date(dateTo)));
        return eb.and(preds);
      })
      .select([
        "po.id",
        "po.company_id",
        "po.supplier_id",
        "po.order_no",
        "po.order_date",
        "po.status",
        "po.currency_code",
        "po.total_amount",
        "po.expected_date",
        "po.notes",
        "po.created_by_user_id",
        "po.updated_by_user_id",
        "po.created_at",
        "po.updated_at",
        "s.name as supplier_name",
      ])
      .orderBy("po.created_at", "desc")
      .limit(input.limit)
      .offset(input.offset)
      .execute();

    return {
      orders: orders.map((o) => ({
        id: o.id,
        company_id: o.company_id,
        supplier_id: o.supplier_id,
        supplier_name: (o as { supplier_name?: string }).supplier_name ?? null,
        order_no: o.order_no,
        order_date: toIso(o.order_date) ?? "",
        status: o.status,
        currency_code: o.currency_code,
        total_amount: String(o.total_amount),
        expected_date: o.expected_date ? toIso(o.expected_date) ?? undefined : undefined,
        notes: o.notes ?? undefined,
        created_by_user_id: o.created_by_user_id ?? 0,
        updated_by_user_id: o.updated_by_user_id ?? undefined,
        created_at: toIso(o.created_at) ?? "",
        updated_at: toIso(o.updated_at) ?? "",
      })),
      total,
      limit: input.limit,
      offset: input.offset,
    };
  }

  // ---------------------------------------------------------------------------
  // Get by ID
  // ---------------------------------------------------------------------------

  async getPurchaseOrderById(
    companyId: number,
    orderId: number
  ): Promise<POResponse | null> {
    const order = await this.db
      .selectFrom("purchase_orders")
      .where("id", "=", orderId)
      .where("company_id", "=", companyId)
      .select([
        "id", "company_id", "supplier_id", "order_no", "order_date", "status",
        "currency_code", "total_amount", "expected_date", "notes",
        "created_by_user_id", "updated_by_user_id", "created_at", "updated_at",
      ])
      .executeTakeFirst();

    if (!order) return null;

    const lines = await this.db
      .selectFrom("purchase_order_lines")
      .where("order_id", "=", orderId)
      .where("company_id", "=", companyId)
      .select([
        "id", "line_no", "item_id", "description", "qty", "unit_price",
        "tax_rate", "received_qty", "line_total",
      ])
      .orderBy("line_no", "asc")
      .execute();

    return formatOrderRow({
      ...order,
      lines: lines as POLine[],
    });
  }

  // ---------------------------------------------------------------------------
  // Create
  // ---------------------------------------------------------------------------

  async createPurchaseOrder(
    input: CreatePurchaseOrderInput
  ): Promise<CreatePurchaseOrderResult> {
    const processedLines = input.lines.map((line, idx) => {
      const lineTotal = computeLineTotal(line.qty, line.unit_price, line.tax_rate ?? "0");
      return { ...line, line_no: idx + 1, line_total: lineTotal };
    });

    const totalAmount = computeTotalAmount(processedLines);
    const currencyCode = input.currencyCode ?? "IDR";

    const MAX_ATTEMPTS = 5;

    // Keep order_no safely below VARCHAR(32) while retaining high uniqueness.
    // Bounded retry handles extremely rare unique-key collisions.
    let lastError: unknown;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const orderNo = generatePurchaseOrderNo();

      try {
        const insertedId = await this.db.transaction().execute(async (trx) => {
          const supplier = await trx
            .selectFrom("suppliers")
            .where("id", "=", input.supplierId)
            .where("company_id", "=", input.companyId)
            .where("is_active", "=", 1)
            .select(["id"])
            .forUpdate()
            .executeTakeFirst();

          if (!supplier) throw { code: "SUPPLIER_NOT_FOUND" };

          for (const line of processedLines) {
            if (line.item_id !== undefined && line.item_id !== null) {
              const item = await trx
                .selectFrom("items")
                .where("id", "=", line.item_id)
                .where("company_id", "=", input.companyId)
                .select(["id"])
                .executeTakeFirst();

              if (!item) throw { code: "ITEM_NOT_FOUND", item_id: line.item_id };
            }
          }

          const headerResult = await trx
            .insertInto("purchase_orders")
            .values({
              company_id: input.companyId,
              supplier_id: input.supplierId,
              order_no: orderNo,
              order_date: input.orderDate,
              status: PURCHASE_ORDER_STATUS.DRAFT,
              currency_code: currencyCode,
              total_amount: totalAmount,
              expected_date: input.expectedDate ?? null,
              notes: input.notes ?? null,
              created_by_user_id: input.userId,
            })
            .executeTakeFirst();

          const insertedId = Number(headerResult.insertId);
          if (!insertedId) throw new Error("Failed to create purchase order");

          for (const line of processedLines) {
            await trx
              .insertInto("purchase_order_lines")
              .values({
                company_id: input.companyId,
                order_id: insertedId,
                line_no: line.line_no,
                item_id: line.item_id ?? null,
                description: line.description ?? null,
                qty: line.qty,
                unit_price: line.unit_price,
                tax_rate: line.tax_rate ?? "0",
                received_qty: "0",
                line_total: line.line_total,
              })
              .executeTakeFirst();
          }

          return insertedId;
        });

        const order = await this.getPurchaseOrderById(input.companyId, insertedId);
        if (!order) throw new Error("Failed to fetch created purchase order");
        return { receipt: order };
      } catch (err: unknown) {
        lastError = err;
        if (typeof err === "object" && err !== null && "errno" in err) {
          const mysqlErr = err as { errno: number };
          if (mysqlErr.errno === 1062) {
            // Duplicate key - retry with new orderNo
            continue;
          }
        }
        // Non-retryable error - rethrow immediately
        throw err;
      }
    }

    // All retries exhausted
    throw lastError ?? new Error("Failed to create purchase order after multiple attempts");
  }

  // ---------------------------------------------------------------------------
  // Update
  // ---------------------------------------------------------------------------

  async updatePurchaseOrder(
    input: UpdatePurchaseOrderInput
  ): Promise<UpdatePurchaseOrderResult | null> {
    const hasLinesReplacement = input.lines !== undefined;
    if (hasLinesReplacement && input.lines!.length === 0) {
      throw { code: "INVALID_REQUEST", message: "Lines array cannot be empty" };
    }

    const updateValues: Record<string, unknown> = { updated_by_user_id: input.userId };
    if (input.notes !== undefined) updateValues.notes = input.notes;
    if (input.expectedDate !== undefined) updateValues.expected_date = input.expectedDate;

    const result = await this.db.transaction().execute(async (trx) => {
      // P1-FIX #1: Re-read with lock INSIDE transaction to prevent TOCTOU race.
      // Guard: only DRAFT orders can be modified.
      const locked = await trx
        .selectFrom("purchase_orders")
        .where("id", "=", input.orderId)
        .where("company_id", "=", input.companyId)
        .select(["id", "status"])
        .forUpdate()
        .executeTakeFirst();

      if (!locked) {
        // Order not found — let caller handle 404
        return null;
      }

      if (Number(locked.status) !== PURCHASE_ORDER_STATUS.DRAFT) {
        throw { code: "INVALID_STATUS", message: "Only DRAFT orders can be modified" };
      }

      if (Object.keys(updateValues).length > 1) {
        await trx
          .updateTable("purchase_orders")
          .set(updateValues)
          .where("id", "=", input.orderId)
          .where("company_id", "=", input.companyId)
          .executeTakeFirst();
      }

      if (hasLinesReplacement && input.lines) {
        for (const line of input.lines) {
          if (line.item_id !== undefined && line.item_id !== null) {
            const item = await trx
              .selectFrom("items")
              .where("id", "=", line.item_id)
              .where("company_id", "=", input.companyId)
              .select(["id"])
              .executeTakeFirst();

            if (!item) throw { code: "ITEM_NOT_FOUND", item_id: line.item_id };
          }
        }

        await trx
          .deleteFrom("purchase_order_lines")
          .where("order_id", "=", input.orderId)
          .where("company_id", "=", input.companyId)
          .execute();

        const processedLines = input.lines.map((line, idx) => ({
          line_no: idx + 1,
          item_id: line.item_id ?? null,
          description: line.description ?? null,
          qty: line.qty,
          unit_price: line.unit_price,
          tax_rate: line.tax_rate ?? "0",
          received_qty: "0",
          line_total: computeLineTotal(line.qty, line.unit_price, line.tax_rate ?? "0"),
        }));

        for (const line of processedLines) {
          await trx
            .insertInto("purchase_order_lines")
            .values({
              company_id: input.companyId,
              order_id: input.orderId,
              line_no: line.line_no,
              item_id: line.item_id,
              description: line.description,
              qty: line.qty,
              unit_price: line.unit_price,
              tax_rate: line.tax_rate,
              received_qty: line.received_qty,
              line_total: line.line_total,
            })
            .executeTakeFirst();
        }

        const totalAmount = computeTotalAmount(processedLines);
        await trx
          .updateTable("purchase_orders")
          .set({ total_amount: totalAmount, updated_by_user_id: input.userId })
          .where("id", "=", input.orderId)
          .where("company_id", "=", input.companyId)
          .executeTakeFirst();
      }

      const order = await trx
        .selectFrom("purchase_orders")
        .where("id", "=", input.orderId)
        .select([
          "id", "company_id", "supplier_id", "order_no", "order_date", "status",
          "currency_code", "total_amount", "expected_date", "notes",
          "created_by_user_id", "updated_by_user_id", "created_at", "updated_at",
        ])
        .executeTakeFirst();

      const lines = await trx
        .selectFrom("purchase_order_lines")
        .where("order_id", "=", input.orderId)
        .select([
          "id", "line_no", "item_id", "description", "qty", "unit_price",
          "tax_rate", "received_qty", "line_total",
        ])
        .orderBy("line_no", "asc")
        .execute();

      return { order: order!, lines };
    });

    if (!result) return null;
    if (!result.order) return null;

    return {
      receipt: formatOrderRow({
        ...result.order,
        lines: result.lines as POLine[],
      }),
    };
  }

  // ---------------------------------------------------------------------------
  // Transition Status
  // ---------------------------------------------------------------------------

  async transitionPurchaseOrderStatus(
    input: TransitionPurchaseOrderStatusInput
  ): Promise<TransitionPurchaseOrderStatusResult | null> {
    // First check existence outside transaction (no lock needed for read-only check)
    const existing = await this.db
      .selectFrom("purchase_orders")
      .where("id", "=", input.orderId)
      .where("company_id", "=", input.companyId)
      .select(["id", "status"])
      .executeTakeFirst();

    if (!existing) return null;

    const result = await this.db.transaction().execute(async (trx) => {
      // Re-read with lock to ensure consistent status check
      const locked = await trx
        .selectFrom("purchase_orders")
        .where("id", "=", input.orderId)
        .where("company_id", "=", input.companyId)
        .select(["id", "status"])
        .forUpdate()
        .executeTakeFirst();

      if (!locked) throw { code: "ORDER_NOT_FOUND_UNDER_LOCK", message: "Order not found under lock" };

      const currentStatusLabel = Object.entries(PURCHASE_ORDER_STATUS).find(
        ([, v]) => v === Number(locked.status)
      )?.[0];

      const allowedNextLabels = currentStatusLabel ? VALID_TRANSITIONS[currentStatusLabel] ?? [] : [];
      const newStatusLabel = Object.entries(PURCHASE_ORDER_STATUS).find(
        ([, v]) => v === input.newStatus
      )?.[0];

      if (!newStatusLabel || !allowedNextLabels.includes(newStatusLabel)) {
        throw {
          code: "INVALID_TRANSITION",
          message: `Cannot transition from ${currentStatusLabel ?? locked.status} to ${newStatusLabel ?? input.newStatus}`,
        };
      }

      if (input.newStatus === PURCHASE_ORDER_STATUS.RECEIVED) {
        // P1-FIX #5: Lock lines with forUpdate() to prevent concurrent received_qty races.
        // All lines must be locked while checking and updating to prevent dual-RECEIVED transition.
        const lines = await trx
          .selectFrom("purchase_order_lines")
          .where("order_id", "=", input.orderId)
          .where("company_id", "=", input.companyId)
          .select(["id", "qty", "received_qty"])
          .forUpdate()
          .execute();

        const allLinesReceived = lines.every((line) => {
          const qty = toScaled4(String(line.qty));
          const receivedQty = toScaled4(String(line.received_qty ?? "0"));
          return receivedQty >= qty;
        });

        if (!allLinesReceived) {
          throw { code: "RECEIPT_INCOMPLETE", message: "Not all lines have been fully received" };
        }
      }

      await trx
        .updateTable("purchase_orders")
        .set({
          status: input.newStatus,
          updated_by_user_id: input.userId,
        })
        .where("id", "=", input.orderId)
        .where("company_id", "=", input.companyId)
        .executeTakeFirst();

      const order = await trx
        .selectFrom("purchase_orders")
        .where("id", "=", input.orderId)
        .select([
          "id", "company_id", "supplier_id", "order_no", "order_date", "status",
          "currency_code", "total_amount", "expected_date", "notes",
          "created_by_user_id", "updated_by_user_id", "created_at", "updated_at",
        ])
        .executeTakeFirst();

      const lines = await trx
        .selectFrom("purchase_order_lines")
        .where("order_id", "=", input.orderId)
        .select([
          "id", "line_no", "item_id", "description", "qty", "unit_price",
          "tax_rate", "received_qty", "line_total",
        ])
        .orderBy("line_no", "asc")
        .execute();

      return { order: order!, lines };
    });

    return {
      receipt: formatOrderRow({
        ...result.order,
        lines: result.lines as POLine[],
      }),
    };
  }
}
