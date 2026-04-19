// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Purchase Order Routes
 *
 * Routes for purchase order management under purchasing module:
 * - GET /purchasing/orders - List purchase orders with filters
 * - GET /purchasing/orders/:id - Get purchase order by ID
 * - POST /purchasing/orders - Create new purchase order
 * - PATCH /purchasing/orders/:id - Update purchase order
 * - PATCH /purchasing/orders/:id/status - Status transition
 *
 * Required ACL: purchasing.orders resource with READ/CREATE/UPDATE permissions
 */

import { Hono } from "hono";
import { z } from "zod";
import {
  PurchaseOrderCreateSchema,
  PurchaseOrderUpdateSchema,
  POStatusTransitionSchema,
  NumericIdSchema,
  PURCHASE_ORDER_STATUS,
  toPurchaseOrderStatusCode,
  toPurchaseOrderStatusLabel,
} from "@jurnapod/shared";
import { requireAccess, authenticateRequest, type AuthContext } from "../../lib/auth-guard.js";
import { errorResponse, successResponse } from "../../lib/response.js";
import { getDb } from "../../lib/db.js";
import type { KyselySchema } from "@jurnapod/db";

declare module "hono" {
  interface ContextVariableMap {
    auth: AuthContext;
  }
}

// =============================================================================
// Purchase Order Routes
// =============================================================================

const orderRoutes = new Hono();

// Auth middleware
orderRoutes.use("/*", async (c, next) => {
  const authResult = await authenticateRequest(c.req.raw);
  if (!authResult.success) {
    c.status(401);
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Missing or invalid access token" } });
  }
  c.set("auth", authResult.auth);
  await next();
});

// Valid status transitions
const VALID_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ["SENT", "CLOSED"],
  SENT: ["PARTIAL_RECEIVED", "RECEIVED", "CLOSED"],
  PARTIAL_RECEIVED: ["RECEIVED", "CLOSED"],
  RECEIVED: ["CLOSED"],
  CLOSED: []
};

function computeLineTotal(qty: string, unitPrice: string, taxRate: string): string {
  const q = toScaled4(qty);
  const u = toScaled4(unitPrice);
  const t = toScaled4(taxRate || "0");

  // line_total (scale 4) = qty * unit_price * (1 + tax_rate)
  // qty, unit_price, tax_rate are each scale-4 decimals.
  // scaled result formula: (q * u * (10000 + t)) / 100000000 with rounding half-up.
  const denominator = 100000000n;
  const numerator = q * u * (10000n + t);
  const scaled = (numerator + (denominator / 2n)) / denominator;
  return fromScaled4(scaled);
}

function computeTotalAmount(lines: Array<{ line_total: string }>): string {
  let total = 0n;
  for (const line of lines) {
    total += toScaled4(line.line_total);
  }
  return fromScaled4(total);
}

function toScaled4(value: string): bigint {
  const trimmed = value.trim();
  if (!/^\d+(\.\d{1,4})?$/.test(trimmed)) {
    throw new Error(`Invalid decimal value: ${value}`);
  }
  const [integer, fraction = ""] = trimmed.split(".");
  const frac4 = (fraction + "0000").slice(0, 4);
  return (BigInt(integer) * 10000n) + BigInt(frac4);
}

function fromScaled4(value: bigint): string {
  const sign = value < 0n ? "-" : "";
  const abs = value < 0n ? -value : value;
  const intPart = abs / 10000n;
  const fracPart = (abs % 10000n).toString().padStart(4, "0");
  return `${sign}${intPart.toString()}.${fracPart}`;
}

// GET /purchasing/orders - List purchase orders with filters
orderRoutes.get("/", async (c) => {
  try {
    const auth = c.get("auth");

    const accessResult = await requireAccess({
      module: "purchasing",
      resource: "orders",
      permission: "read"
    })(c.req.raw, auth);

    if (accessResult !== null) {
      return accessResult;
    }

    const url = new URL(c.req.raw.url);
    const statusQuery = url.searchParams.get("status") ?? undefined;
    const statusCode = statusQuery ? toPurchaseOrderStatusCode(statusQuery) : undefined;
    if (statusQuery && statusCode === undefined) {
      return errorResponse("INVALID_REQUEST", "Invalid status filter", 400);
    }

    const queryParams = {
      supplier_id: url.searchParams.get("supplier_id") ? Number(url.searchParams.get("supplier_id")) : undefined,
      status: statusCode,
      date_from: url.searchParams.get("date_from") ?? undefined,
      date_to: url.searchParams.get("date_to") ?? undefined,
      limit: url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : 20,
      offset: url.searchParams.get("offset") ? Number(url.searchParams.get("offset")) : 0
    };

    const db = getDb() as KyselySchema;

    // Count query
    const countResult = await db
      .selectFrom("purchase_orders as po")
      .where((eb) => {
        const preds = [eb("po.company_id", "=", auth.companyId)];
        if (queryParams.supplier_id) {
          preds.push(eb("po.supplier_id", "=", queryParams.supplier_id));
        }
        if (queryParams.status) {
          preds.push(eb("po.status", "=", queryParams.status));
        }
        if (queryParams.date_from) {
          preds.push(eb("po.order_date", ">=", new Date(queryParams.date_from)));
        }
        if (queryParams.date_to) {
          preds.push(eb("po.order_date", "<=", new Date(queryParams.date_to)));
        }
        return eb.and(preds);
      })
      .select((eb) => eb.fn.countAll().as("count"))
      .executeTakeFirst();

    const total = Number((countResult as { count?: string })?.count ?? 0);

    // List query with supplier name
    let listQuery = db
      .selectFrom("purchase_orders as po")
      .leftJoin("suppliers as s", "po.supplier_id", "s.id")
      .where((eb) => {
        const preds = [eb("po.company_id", "=", auth.companyId)];
        if (queryParams.supplier_id) {
          preds.push(eb("po.supplier_id", "=", queryParams.supplier_id));
        }
        if (queryParams.status) {
          preds.push(eb("po.status", "=", queryParams.status));
        }
        if (queryParams.date_from) {
          preds.push(eb("po.order_date", ">=", new Date(queryParams.date_from)));
        }
        if (queryParams.date_to) {
          preds.push(eb("po.order_date", "<=", new Date(queryParams.date_to)));
        }
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
        "s.name as supplier_name"
      ])
      .orderBy("po.created_at", "desc")
      .limit(queryParams.limit)
      .offset(queryParams.offset);

    const orders = await listQuery.execute();

    const formatted = orders.map((o) => ({
      id: o.id,
      company_id: o.company_id,
      supplier_id: o.supplier_id,
      supplier_name: (o as any).supplier_name,
      order_no: o.order_no,
      order_date: new Date(o.order_date).toISOString(),
      status: toPurchaseOrderStatusLabel(Number(o.status)),
      currency_code: o.currency_code,
      total_amount: String(o.total_amount),
      expected_date: o.expected_date ? new Date(o.expected_date).toISOString() : null,
      notes: o.notes,
      created_by_user_id: o.created_by_user_id,
      updated_by_user_id: o.updated_by_user_id,
      created_at: new Date(o.created_at).toISOString(),
      updated_at: new Date(o.updated_at).toISOString()
    }));

    return successResponse({
      orders: formatted,
      total,
      limit: queryParams.limit,
      offset: queryParams.offset
    });
  } catch (error) {
    console.error("GET /purchasing/orders failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to fetch purchase orders", 500);
  }
});

// GET /purchasing/orders/:id - Get purchase order by ID
orderRoutes.get("/:id", async (c) => {
  try {
    const auth = c.get("auth");

    const accessResult = await requireAccess({
      module: "purchasing",
      resource: "orders",
      permission: "read"
    })(c.req.raw, auth);

    if (accessResult !== null) {
      return accessResult;
    }

    const orderId = NumericIdSchema.parse(c.req.param("id"));

    const db = getDb() as KyselySchema;

    const order = await db
      .selectFrom("purchase_orders")
      .where("id", "=", orderId)
      .where("company_id", "=", auth.companyId)
      .select([
        "id", "company_id", "supplier_id", "order_no", "order_date", "status",
        "currency_code", "total_amount", "expected_date", "notes",
        "created_by_user_id", "updated_by_user_id", "created_at", "updated_at"
      ])
      .executeTakeFirst();

    if (!order) {
      return errorResponse("NOT_FOUND", "Purchase order not found", 404);
    }

    // Fetch lines
    const lines = await db
      .selectFrom("purchase_order_lines")
      .where("order_id", "=", orderId)
      .where("company_id", "=", auth.companyId)
      .select([
        "id", "line_no", "item_id", "description", "qty", "unit_price",
        "tax_rate", "received_qty", "line_total"
      ])
      .orderBy("line_no", "asc")
      .execute();

    const formatted = {
      id: order.id,
      company_id: order.company_id,
      supplier_id: order.supplier_id,
      order_no: order.order_no,
      order_date: new Date(order.order_date).toISOString(),
      status: toPurchaseOrderStatusLabel(Number(order.status)),
      currency_code: order.currency_code,
      total_amount: String(order.total_amount),
      expected_date: order.expected_date ? new Date(order.expected_date).toISOString() : null,
      notes: order.notes,
      created_by_user_id: order.created_by_user_id,
      updated_by_user_id: order.updated_by_user_id,
      created_at: new Date(order.created_at as unknown as string).toISOString(),
      updated_at: new Date(order.updated_at as unknown as string).toISOString(),
      lines: lines.map((l) => ({
        id: l.id,
        line_no: l.line_no,
        item_id: l.item_id,
        description: l.description,
        qty: String(l.qty),
        unit_price: String(l.unit_price),
        tax_rate: String(l.tax_rate),
        received_qty: String(l.received_qty),
        line_total: String(l.line_total)
      }))
    };

    return successResponse(formatted);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid purchase order ID", 400);
    }
    console.error("GET /purchasing/orders/:id failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to fetch purchase order", 500);
  }
});

// POST /purchasing/orders - Create new purchase order
orderRoutes.post("/", async (c) => {
  try {
    const auth = c.get("auth");

    const accessResult = await requireAccess({
      module: "purchasing",
      resource: "orders",
      permission: "create"
    })(c.req.raw, auth);

    if (accessResult !== null) {
      return accessResult;
    }

    let input: z.infer<typeof PurchaseOrderCreateSchema> | undefined;

    try {
      const payload = await c.req.json();
      input = PurchaseOrderCreateSchema.parse(payload);
    } catch (e) {
      if (e instanceof z.ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
      }
      return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
    }

    const db = getDb() as KyselySchema;

    // Verify supplier exists and belongs to company
    const supplier = await db
      .selectFrom("suppliers")
      .where("id", "=", input.supplier_id)
      .where("company_id", "=", auth.companyId)
      .select(["id"])
      .executeTakeFirst();

    if (!supplier) {
      return errorResponse("NOT_FOUND", "Supplier not found", 404);
    }

    // Generate order number
    const date = new Date();
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, "0");
    const day = date.getDate().toString().padStart(2, "0");
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, "0");
    const orderNo = `PO-${year}${month}${day}-${random}`;

    // Compute line totals
    const processedLines = input.lines.map((line, idx) => {
      const qty = line.qty;
      const unitPrice = line.unit_price;
      const taxRate = line.tax_rate ?? "0";
      const lineTotal = computeLineTotal(qty, unitPrice, taxRate);
      return {
        ...line,
        line_no: idx + 1,
        line_total: lineTotal
      };
    });

    const totalAmount = computeTotalAmount(processedLines);
    const currencyCode = input.currency_code ?? "IDR";

    // Insert purchase order header + lines in a single transaction
    const insertResult = await db.transaction().execute(async (trx) => {
      // Validate item_id for each line (if provided)
      for (const line of processedLines) {
        if (line.item_id !== undefined && line.item_id !== null) {
          const item = await trx
            .selectFrom("items")
            .where("id", "=", line.item_id)
            .where("company_id", "=", auth.companyId)
            .select(["id"])
            .executeTakeFirst();

          if (!item) {
            throw { code: "ITEM_NOT_FOUND", item_id: line.item_id };
          }
        }
      }

      const headerResult = await trx
        .insertInto("purchase_orders")
        .values({
          company_id: auth.companyId,
          supplier_id: input.supplier_id,
          order_no: orderNo,
          order_date: input.order_date,
          status: PURCHASE_ORDER_STATUS.DRAFT,
          currency_code: currencyCode,
          total_amount: totalAmount,
          expected_date: input.expected_date ?? null,
          notes: input.notes ?? null,
          created_by_user_id: auth.userId
        })
        .executeTakeFirst();

      const insertedId = Number(headerResult.insertId);
      if (!insertedId) {
        throw new Error("Failed to create purchase order");
      }

      // Insert all lines within the same transaction
      for (const line of processedLines) {
        await trx
          .insertInto("purchase_order_lines")
          .values({
            company_id: auth.companyId,
            order_id: insertedId,
            line_no: line.line_no,
            item_id: line.item_id ?? null,
            description: line.description ?? null,
            qty: line.qty,
            unit_price: line.unit_price,
            tax_rate: line.tax_rate ?? "0",
            received_qty: "0",
            line_total: line.line_total
          })
          .executeTakeFirst();
      }

      return { insertedId, headerResult };
    });

    const insertedId = Number(insertResult.insertedId);

    // Fetch created order with lines
    const order = await db
      .selectFrom("purchase_orders")
      .where("id", "=", insertedId)
      .select([
        "id", "company_id", "supplier_id", "order_no", "order_date", "status",
        "currency_code", "total_amount", "expected_date", "notes",
        "created_by_user_id", "updated_by_user_id", "created_at", "updated_at"
      ])
      .executeTakeFirst();

    const lines = await db
      .selectFrom("purchase_order_lines")
      .where("order_id", "=", insertedId)
      .select([
        "id", "line_no", "item_id", "description", "qty", "unit_price",
        "tax_rate", "received_qty", "line_total"
      ])
      .orderBy("line_no", "asc")
      .execute();

    const formatted = {
      id: order!.id,
      company_id: order!.company_id,
      supplier_id: order!.supplier_id,
      order_no: order!.order_no,
      order_date: new Date(order!.order_date).toISOString(),
      status: toPurchaseOrderStatusLabel(Number(order!.status)),
      currency_code: order!.currency_code,
      total_amount: String(order!.total_amount),
      expected_date: order!.expected_date ? new Date(order!.expected_date as unknown as string).toISOString() : null,
      notes: order!.notes,
      created_by_user_id: order!.created_by_user_id,
      updated_by_user_id: order!.updated_by_user_id,
      created_at: new Date(order!.created_at as unknown as string).toISOString(),
      updated_at: new Date(order!.updated_at as unknown as string).toISOString(),
      lines: lines.map((l) => ({
        id: l.id,
        line_no: l.line_no,
        item_id: l.item_id,
        description: l.description,
        qty: String(l.qty),
        unit_price: String(l.unit_price),
        tax_rate: String(l.tax_rate),
        received_qty: String(l.received_qty),
        line_total: String(l.line_total)
      }))
    };

    return successResponse(formatted, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
    }
    if (error instanceof SyntaxError) {
      return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
    }
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ITEM_NOT_FOUND") {
      const err = error as { code: string; item_id: number };
      return errorResponse("NOT_FOUND", `Item with id ${err.item_id} not found`, 404);
    }
    console.error("POST /purchasing/orders failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to create purchase order", 500);
  }
});

// PATCH /purchasing/orders/:id - Update purchase order (with optional full-line replacement)
orderRoutes.patch("/:id", async (c) => {
  try {
    const auth = c.get("auth");

    const accessResult = await requireAccess({
      module: "purchasing",
      resource: "orders",
      permission: "update"
    })(c.req.raw, auth);

    if (accessResult !== null) {
      return accessResult;
    }

    const orderId = NumericIdSchema.parse(c.req.param("id"));

    let input: z.infer<typeof PurchaseOrderUpdateSchema> | undefined;
    let rawPayload: Record<string, unknown> | undefined;

    try {
      rawPayload = await c.req.json();
      input = PurchaseOrderUpdateSchema.parse(rawPayload);
    } catch (e) {
      if (e instanceof z.ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
      }
      return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
    }

    const db = getDb() as KyselySchema;

    // Check order exists and is in DRAFT status
    const existing = await db
      .selectFrom("purchase_orders")
      .where("id", "=", orderId)
      .where("company_id", "=", auth.companyId)
      .select(["id", "status"])
      .executeTakeFirst();

    if (!existing) {
      return errorResponse("NOT_FOUND", "Purchase order not found", 404);
    }

    if (Number(existing.status) !== PURCHASE_ORDER_STATUS.DRAFT) {
      return errorResponse("INVALID_REQUEST", "Only DRAFT orders can be modified", 400);
    }

    // Check if lines replacement is requested
    const linesPayload = rawPayload?.lines;
    const hasLinesReplacement = Array.isArray(linesPayload);

    // Reject empty lines array
    if (hasLinesReplacement && (linesPayload as unknown[]).length === 0) {
      return errorResponse("INVALID_REQUEST", "Lines array cannot be empty", 400);
    }

    // Build update values
    const updateValues: Record<string, unknown> = {
      updated_by_user_id: auth.userId
    };

    if (input.notes !== undefined) updateValues.notes = input.notes;
    if (input.expected_date !== undefined) updateValues.expected_date = input.expected_date;

    // Perform update with optional line replacement in transaction
    const result = await db.transaction().execute(async (trx) => {
      // Update header fields if any
      if (Object.keys(updateValues).length > 1) { // more than just updated_by_user_id
        await trx
          .updateTable("purchase_orders")
          .set(updateValues)
          .where("id", "=", orderId)
          .where("company_id", "=", auth.companyId)
          .executeTakeFirst();
      }

      // Handle full-line replacement if lines provided
      if (hasLinesReplacement && linesPayload) {
        const lines = linesPayload as Array<{
          item_id?: number;
          description?: string;
          qty: string;
          unit_price: string;
          tax_rate?: string;
        }>;

        // Validate item_id for each line (if provided)
        for (const line of lines) {
          if (line.item_id !== undefined && line.item_id !== null) {
            const item = await trx
              .selectFrom("items")
              .where("id", "=", line.item_id)
              .where("company_id", "=", auth.companyId)
              .select(["id"])
              .executeTakeFirst();

            if (!item) {
              throw { code: "ITEM_NOT_FOUND", item_id: line.item_id };
            }
          }
        }

        // Delete existing lines
        await trx
          .deleteFrom("purchase_order_lines")
          .where("order_id", "=", orderId)
          .where("company_id", "=", auth.companyId)
          .execute();

        // Insert new lines with computed totals
        const processedLines = lines.map((line, idx) => {
          const qty = line.qty;
          const unitPrice = line.unit_price;
          const taxRate = line.tax_rate ?? "0";
          const lineTotal = computeLineTotal(qty, unitPrice, taxRate);
          return {
            line_no: idx + 1,
            item_id: line.item_id ?? null,
            description: line.description ?? null,
            qty: line.qty,
            unit_price: line.unit_price,
            tax_rate: line.tax_rate ?? "0",
            received_qty: "0",
            line_total: lineTotal
          };
        });

        // Insert all new lines
        for (const line of processedLines) {
          await trx
            .insertInto("purchase_order_lines")
            .values({
              company_id: auth.companyId,
              order_id: orderId,
              line_no: line.line_no,
              item_id: line.item_id,
              description: line.description,
              qty: line.qty,
              unit_price: line.unit_price,
              tax_rate: line.tax_rate,
              received_qty: line.received_qty,
              line_total: line.line_total
            })
            .executeTakeFirst();
        }

        // Recompute total_amount from new lines
        const totalAmount = computeTotalAmount(processedLines);
        await trx
          .updateTable("purchase_orders")
          .set({ total_amount: totalAmount, updated_by_user_id: auth.userId })
          .where("id", "=", orderId)
          .where("company_id", "=", auth.companyId)
          .executeTakeFirst();
      }

      // Fetch updated order with lines
      const order = await trx
        .selectFrom("purchase_orders")
        .where("id", "=", orderId)
        .select([
          "id", "company_id", "supplier_id", "order_no", "order_date", "status",
          "currency_code", "total_amount", "expected_date", "notes",
          "created_by_user_id", "updated_by_user_id", "created_at", "updated_at"
        ])
        .executeTakeFirst();

      const lines = await trx
        .selectFrom("purchase_order_lines")
        .where("order_id", "=", orderId)
        .select([
          "id", "line_no", "item_id", "description", "qty", "unit_price",
          "tax_rate", "received_qty", "line_total"
        ])
        .orderBy("line_no", "asc")
        .execute();

      return { order, lines };
    });

    const { order, lines } = result;

    const formatted = {
      id: order!.id,
      company_id: order!.company_id,
      supplier_id: order!.supplier_id,
      order_no: order!.order_no,
      order_date: new Date(order!.order_date).toISOString(),
      status: toPurchaseOrderStatusLabel(Number(order!.status)),
      currency_code: order!.currency_code,
      total_amount: String(order!.total_amount),
      expected_date: order!.expected_date ? new Date(order!.expected_date as unknown as string).toISOString() : null,
      notes: order!.notes,
      created_by_user_id: order!.created_by_user_id,
      updated_by_user_id: order!.updated_by_user_id,
      created_at: new Date(order!.created_at as unknown as string).toISOString(),
      updated_at: new Date(order!.updated_at as unknown as string).toISOString(),
      lines: lines.map((l) => ({
        id: l.id,
        line_no: l.line_no,
        item_id: l.item_id,
        description: l.description,
        qty: String(l.qty),
        unit_price: String(l.unit_price),
        tax_rate: String(l.tax_rate),
        received_qty: String(l.received_qty),
        line_total: String(l.line_total)
      }))
    };

    return successResponse(formatted);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
    }
    if (error instanceof SyntaxError) {
      return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
    }
    // Handle item validation error
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ITEM_NOT_FOUND") {
      const err = error as { code: string; item_id: number };
      return errorResponse("NOT_FOUND", `Item with id ${err.item_id} not found`, 404);
    }
    console.error("PATCH /purchasing/orders/:id failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to update purchase order", 500);
  }
});

// PATCH /purchasing/orders/:id/status - Status transition
orderRoutes.patch("/:id/status", async (c) => {
  try {
    const auth = c.get("auth");

    const accessResult = await requireAccess({
      module: "purchasing",
      resource: "orders",
      permission: "update"
    })(c.req.raw, auth);

    if (accessResult !== null) {
      return accessResult;
    }

    const orderId = NumericIdSchema.parse(c.req.param("id"));

    let input: z.infer<typeof POStatusTransitionSchema> | undefined;

    try {
      const payload = await c.req.json();
      input = POStatusTransitionSchema.parse(payload);
    } catch (e) {
      if (e instanceof z.ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
      }
      return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
    }

    const db = getDb() as KyselySchema;

    // Get current order
    const existing = await db
      .selectFrom("purchase_orders")
      .where("id", "=", orderId)
      .where("company_id", "=", auth.companyId)
      .select(["id", "status"])
      .executeTakeFirst();

    if (!existing) {
      return errorResponse("NOT_FOUND", "Purchase order not found", 404);
    }

    const currentStatus = toPurchaseOrderStatusLabel(Number(existing.status));
    const newStatus = input.status;

    // Validate transition
    const validNextStatuses = VALID_TRANSITIONS[currentStatus] || [];
    if (!validNextStatuses.includes(newStatus)) {
      return errorResponse(
        "INVALID_REQUEST",
        `Cannot transition from ${currentStatus} to ${newStatus}. Valid transitions: ${validNextStatuses.join(", ") || "none"}`,
        400
      );
    }

    // Enforce receipt-aware gating for RECEIVED state
    if (newStatus === "RECEIVED") {
      // Get all lines to check receipt status
      const lines = await db
        .selectFrom("purchase_order_lines")
        .where("order_id", "=", orderId)
        .where("company_id", "=", auth.companyId)
        .select(["id", "qty", "received_qty"])
        .execute();

      const allLinesReceived = lines.every((line) => {
        const qty = toScaled4(String(line.qty));
        const receivedQty = toScaled4(String(line.received_qty));
        return receivedQty >= qty;
      });

      if (!allLinesReceived) {
        return errorResponse(
          "INVALID_REQUEST",
          "Cannot transition to RECEIVED: not all lines have been fully received",
          400
        );
      }
    }

    // Update status
    await db
      .updateTable("purchase_orders")
      .set({
        status: toPurchaseOrderStatusCode(newStatus) ?? PURCHASE_ORDER_STATUS.DRAFT,
        updated_by_user_id: auth.userId
      })
      .where("id", "=", orderId)
      .where("company_id", "=", auth.companyId)
      .executeTakeFirst();

    // Fetch updated order with lines
    const order = await db
      .selectFrom("purchase_orders")
      .where("id", "=", orderId)
      .select([
        "id", "company_id", "supplier_id", "order_no", "order_date", "status",
        "currency_code", "total_amount", "expected_date", "notes",
        "created_by_user_id", "updated_by_user_id", "created_at", "updated_at"
      ])
      .executeTakeFirst();

    const lines = await db
      .selectFrom("purchase_order_lines")
      .where("order_id", "=", orderId)
      .select([
        "id", "line_no", "item_id", "description", "qty", "unit_price",
        "tax_rate", "received_qty", "line_total"
      ])
      .orderBy("line_no", "asc")
      .execute();

    const formatted = {
      id: order!.id,
      company_id: order!.company_id,
      supplier_id: order!.supplier_id,
      order_no: order!.order_no,
      order_date: new Date(order!.order_date).toISOString(),
      status: toPurchaseOrderStatusLabel(Number(order!.status)),
      currency_code: order!.currency_code,
      total_amount: String(order!.total_amount),
      expected_date: order!.expected_date ? new Date(order!.expected_date as unknown as string).toISOString() : null,
      notes: order!.notes,
      created_by_user_id: order!.created_by_user_id,
      updated_by_user_id: order!.updated_by_user_id,
      created_at: new Date(order!.created_at as unknown as string).toISOString(),
      updated_at: new Date(order!.updated_at as unknown as string).toISOString(),
      lines: lines.map((l) => ({
        id: l.id,
        line_no: l.line_no,
        item_id: l.item_id,
        description: l.description,
        qty: String(l.qty),
        unit_price: String(l.unit_price),
        tax_rate: String(l.tax_rate),
        received_qty: String(l.received_qty),
        line_total: String(l.line_total)
      }))
    };

    return successResponse(formatted);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
    }
    if (error instanceof SyntaxError) {
      return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
    }
    console.error("PATCH /purchasing/orders/:id/status failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to update purchase order status", 500);
  }
});

export { orderRoutes };
