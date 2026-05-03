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
  PurchaseOrderListQuerySchema,
  POStatusTransitionSchema,
  NumericIdSchema,
  toPurchaseOrderStatusCode,
  toPurchaseOrderStatusLabel,
} from "@jurnapod/shared";
import { requireAccess, authenticateRequest, type AuthContext } from "../../lib/auth-guard.js";
import { toUtcIso } from "@/lib/date-helpers";
import { errorResponse, successResponse } from "../../lib/response.js";
import {
  listPurchaseOrders,
  getPurchaseOrderById,
  createPurchaseOrder,
  updatePurchaseOrder,
  transitionPurchaseOrderStatus,
} from "../../lib/purchasing/purchase-order.js";

declare module "hono" {
  interface ContextVariableMap {
    auth: AuthContext;
  }
}

// =============================================================================
// Purchase Order Routes
// =============================================================================

const orderRoutes = new Hono();

function safeDate(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const d = new Date(value);
    const ts = d.getTime();
    if (Number.isNaN(ts)) return null;
    return toUtcIso.dateLike(d) as string;
  } catch {
    return null;
  }
}

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
    const queryParams = {
      supplier_id: url.searchParams.get("supplier_id") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
      date_from: url.searchParams.get("date_from") ?? undefined,
      date_to: url.searchParams.get("date_to") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
      offset: url.searchParams.get("offset") ?? undefined,
    };

    let parsed: z.infer<typeof PurchaseOrderListQuerySchema>;
    try {
      parsed = PurchaseOrderListQuerySchema.parse(queryParams);
    } catch (e) {
      if (e instanceof z.ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid query parameters", 400);
      }
      throw e;
    }

    const result = await listPurchaseOrders({
      companyId: auth.companyId,
      filters: {
        supplierId: parsed.supplier_id,
        status: parsed.status ? toPurchaseOrderStatusCode(parsed.status) : undefined,
        dateFrom: toUtcIso.dateLike(parsed.date_from, { nullable: true }) as string,
        dateTo: toUtcIso.dateLike(parsed.date_to, { nullable: true }) as string,
      },
      limit: parsed.limit,
      offset: parsed.offset,
    });

    const formatted = result.orders.map((o: unknown) => {
      const order = o as { status: number; order_date: string; expected_date: string | null; created_at: string; updated_at: string };
      return {
        ...order,
        status: toPurchaseOrderStatusLabel(order.status),
        order_date: safeDate(order.order_date) ?? "",
        expected_date: safeDate(order.expected_date ?? undefined) ?? null,
        created_at: safeDate(order.created_at) ?? "",
        updated_at: safeDate(order.updated_at) ?? "",
      };
    });

    return successResponse({
      orders: formatted,
      total: result.total,
      limit: result.limit,
      offset: result.offset,
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

    const order = await getPurchaseOrderById({
      companyId: auth.companyId,
      orderId,
    });

    if (!order) {
      return errorResponse("NOT_FOUND", "Purchase order not found", 404);
    }

    const formatted = {
      ...order,
      status: toPurchaseOrderStatusLabel(order.status),
      order_date: safeDate(order.order_date) ?? "",
      expected_date: safeDate(order.expected_date ?? undefined) ?? null,
      created_at: safeDate(order.created_at) ?? "",
      updated_at: safeDate(order.updated_at) ?? "",
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

    const order = await createPurchaseOrder({
      companyId: auth.companyId,
      userId: auth.userId,
      idempotencyKey: input.idempotency_key ?? null,
      supplierId: input.supplier_id,
      orderDate: input.order_date ?? undefined,
      expectedDate: input.expected_date ?? undefined,
      notes: input.notes ?? undefined,
      currencyCode: input.currency_code,
      lines: input.lines.map(l => ({
        item_id: l.item_id ?? undefined,
        description: l.description ?? undefined,
        qty: l.qty,
        unit_price: l.unit_price,
        tax_rate: l.tax_rate ?? undefined,
      })),
    });

    const formatted = {
      ...order,
      status: toPurchaseOrderStatusLabel(order.status),
      order_date: safeDate(order.order_date) ?? "",
      expected_date: safeDate(order.expected_date ?? undefined) ?? null,
      created_at: safeDate(order.created_at) ?? "",
      updated_at: safeDate(order.updated_at) ?? "",
    };

    return successResponse(formatted, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
    }
    if (error instanceof SyntaxError) {
      return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
    }
    if (typeof error === "object" && error !== null && "code" in error) {
      const err = error as { code: string; item_id?: number };
      if (err.code === "ITEM_NOT_FOUND" && err.item_id !== undefined) {
        return errorResponse("NOT_FOUND", `Item with id ${err.item_id} not found`, 404);
      }
      if (err.code === "SUPPLIER_NOT_FOUND") {
        return errorResponse("NOT_FOUND", "Supplier not found", 404);
      }
    }
    if (typeof error === "object" && error !== null && "errno" in error) {
      const mysqlError = error as { errno: number };
      if (mysqlError.errno === 1062) {
        return errorResponse("CONFLICT", "Duplicate purchase order", 409);
      }
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

    try {
      const rawPayload = await c.req.json();
      input = PurchaseOrderUpdateSchema.parse(rawPayload);
    } catch (e) {
      if (e instanceof z.ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
      }
      return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
    }

    const order = await updatePurchaseOrder({
      companyId: auth.companyId,
      userId: auth.userId,
      orderId,
      notes: input.notes ?? undefined,
      expectedDate: input.expected_date ?? undefined,
      lines: input.lines ? input.lines.map(l => ({
        item_id: l.item_id ?? undefined,
        description: l.description ?? undefined,
        qty: l.qty,
        unit_price: l.unit_price,
        tax_rate: l.tax_rate ?? undefined,
      })) : undefined,
    });

    if (!order) {
      return errorResponse("NOT_FOUND", "Purchase order not found", 404);
    }

    const formatted = {
      ...order,
      status: toPurchaseOrderStatusLabel(order.status),
      order_date: safeDate(order.order_date) ?? "",
      expected_date: safeDate(order.expected_date ?? undefined) ?? null,
      created_at: safeDate(order.created_at) ?? "",
      updated_at: safeDate(order.updated_at) ?? "",
    };

    return successResponse(formatted);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
    }
    if (error instanceof SyntaxError) {
      return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
    }
    if (typeof error === "object" && error !== null && "code" in error) {
      const err = error as { code: string; item_id?: number; message?: string };
      if (err.code === "ITEM_NOT_FOUND" && err.item_id !== undefined) {
        return errorResponse("NOT_FOUND", `Item with id ${err.item_id} not found`, 404);
      }
      if (err.code === "INVALID_STATUS") {
        return errorResponse("INVALID_REQUEST", err.message ?? "Only DRAFT orders can be modified", 400);
      }
      if (err.code === "INVALID_REQUEST") {
        return errorResponse("INVALID_REQUEST", err.message ?? "Invalid request", 400);
      }
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

    const statusCode = toPurchaseOrderStatusCode(input.status);
    if (!statusCode) {
      return errorResponse("INVALID_REQUEST", `Invalid status value: '${input.status}'`, 400);
    }

    const order = await transitionPurchaseOrderStatus({
      companyId: auth.companyId,
      userId: auth.userId,
      orderId,
      newStatus: statusCode,
    });

    if (!order) {
      return errorResponse("NOT_FOUND", "Purchase order not found", 404);
    }

    const formatted = {
      ...order,
      status: toPurchaseOrderStatusLabel(order.status),
      order_date: safeDate(order.order_date) ?? "",
      expected_date: safeDate(order.expected_date ?? undefined) ?? null,
      created_at: safeDate(order.created_at) ?? "",
      updated_at: safeDate(order.updated_at) ?? "",
    };

    return successResponse(formatted);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
    }
    if (error instanceof SyntaxError) {
      return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
    }
    if (typeof error === "object" && error !== null && "code" in error) {
      const err = error as { code: string; message?: string };
      if (err.code === "INVALID_TRANSITION") {
        return errorResponse("INVALID_REQUEST", err.message ?? "Invalid status transition", 400);
      }
      if (err.code === "RECEIPT_INCOMPLETE") {
        return errorResponse("INVALID_REQUEST", "Cannot transition to RECEIVED: not all lines have been fully received", 400);
      }
      if (err.code === "INVALID_DECIMAL") {
        return errorResponse("INVALID_REQUEST", err.message ?? "Invalid decimal value in line quantity", 400);
      }
      if (err.code === "ORDER_NOT_FOUND_UNDER_LOCK") {
        return errorResponse("NOT_FOUND", err.message ?? "Order not found", 404);
      }
    }
    console.error("PATCH /purchasing/orders/:id/status failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to update purchase order status", 500);
  }
});

export { orderRoutes };
