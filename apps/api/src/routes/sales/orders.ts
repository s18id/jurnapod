// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Sales Order Routes
 *
 * Routes for sales order operations.
 * GET /sales/orders - List orders with filtering
 * POST /sales/orders - Create new order
 * 
 * Uses modules-sales package via adapter layer.
 */

import { Hono } from "hono";
import { z } from "zod";
import { createRoute, z as zodOpenApi } from "@hono/zod-openapi";
import type { OpenAPIHono as OpenAPIHonoType } from "@hono/zod-openapi";
import {
  SalesOrderCreateRequestSchema,
  SalesOrderListQuerySchema,
  SalesOrderResponseSchema,
  SalesOrderUpdateRequestSchema
} from "@jurnapod/shared";
import {
  createOrderService as getOrderService,
  type OrderService,
  DatabaseConflictError,
  DatabaseForbiddenError,
  DatabaseReferenceError
} from "@jurnapod/modules-sales";
import { listUserOutletIds, userHasOutletAccess } from "@/lib/auth";
import { requireAccess } from "@/lib/auth-guard";
import { errorResponse, successResponse } from "@/lib/response";
import type { AuthContext } from "@/lib/auth-guard";
import { createApiSalesDb } from "@/lib/modules-sales/sales-db";
import { getAccessScopeChecker } from "@/lib/modules-sales/access-scope-checker";
import { getCompanyService } from "@/lib/companies";

// Schemas for request body validation
const ConvertToInvoiceSchema = z.object({
  invoice_date: z.string().date().optional(),
});

const CancelOrderSchema = z.object({
  reason: z.string().min(1).optional(),
});

const orderRoutes = new Hono();

// Create order service instance using the adapter layer
const db = createApiSalesDb();
const accessScopeChecker = getAccessScopeChecker();
const orderService: OrderService = getOrderService({
  db,
  accessScopeChecker
});

const numberingTemplateConflictMessage =
  "No numbering template configured. Please configure document numbering in settings.";

// Company service for fetching company details (e.g., timezone)
const companyService = getCompanyService();

// ============================================================================
// GET /sales/orders - List orders with filtering
// ============================================================================

orderRoutes.get("/", async (c) => {
  const auth = c.get("auth") as AuthContext;

  try {
    const accessResult = await requireAccess({
      module: "sales",
      permission: "read",
      resource: "orders"
    })(c.req.raw, auth);

    if (accessResult !== null) {
      return accessResult;
    }

    const url = new URL(c.req.raw.url);
    const parsed = SalesOrderListQuerySchema.parse({
      outlet_id: url.searchParams.get("outlet_id") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
      date_from: url.searchParams.get("date_from") ?? undefined,
      date_to: url.searchParams.get("date_to") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
      offset: url.searchParams.get("offset") ?? undefined
    });

    let outletIds: number[];
    if (typeof parsed.outlet_id === "number") {
      const hasAccess = await userHasOutletAccess(auth.userId, auth.companyId, parsed.outlet_id);
      if (!hasAccess) {
        return errorResponse("FORBIDDEN", "Forbidden", 403);
      }
      outletIds = [parsed.outlet_id];
    } else {
      outletIds = await listUserOutletIds(auth.userId, auth.companyId);
    }

    // Get company timezone for date boundary conversion
    const company = await companyService.getCompany({ companyId: auth.companyId });
    const timezone = company.timezone ?? 'UTC';

    const result = await orderService.listOrders(auth.companyId, {
      outletIds,
      status: parsed.status,
      dateFrom: parsed.date_from,
      dateTo: parsed.date_to,
      limit: parsed.limit,
      offset: parsed.offset,
      timezone
    });

    return successResponse({
      total: result.total,
      orders: result.orders
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid request", 400);
    }

    console.error("GET /sales/orders failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Orders request failed", 500);
  }
});

// ============================================================================
// POST /sales/orders - Create new order
// ============================================================================

orderRoutes.post("/", async (c) => {
  const auth = c.get("auth") as AuthContext;

  try {
    const accessResult = await requireAccess({
      module: "sales",
      permission: "create",
      resource: "orders"
    })(c.req.raw, auth);

    if (accessResult !== null) {
      return accessResult;
    }

    let payload: unknown;
    try {
      payload = await c.req.json();
    } catch {
      return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
    }

    let input;
    try {
      input = SalesOrderCreateRequestSchema.parse(payload);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
      }
      throw error;
    }

    // Validate outlet access before creating order
    const hasAccess = await userHasOutletAccess(auth.userId, auth.companyId, input.outlet_id);
    if (!hasAccess) {
      return errorResponse("FORBIDDEN", "Forbidden", 403);
    }

    const order = await orderService.createOrder(auth.companyId, input, {
      userId: auth.userId
    });

    return successResponse(order, 201);
  } catch (error) {
    if (error instanceof DatabaseForbiddenError) {
      return errorResponse("FORBIDDEN", "Forbidden", 403);
    }

    if (error instanceof DatabaseReferenceError) {
      if (error.message === "Numbering template not configured") {
        return errorResponse("CONFLICT", numberingTemplateConflictMessage, 409);
      }
      return errorResponse("NOT_FOUND", "Outlet not found", 404);
    }

    if (error instanceof DatabaseConflictError) {
      return errorResponse("CONFLICT", error.message, 409);
    }

    console.error("POST /sales/orders failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Order creation failed", 500);
  }
});

// ============================================================================
// GET /sales/orders/:id - Get Order Detail
// ============================================================================

orderRoutes.get("/:id", async (c) => {
  const auth = c.get("auth") as AuthContext;

  try {
    const accessResult = await requireAccess({
      module: "sales",
      permission: "read",
      resource: "orders"
    })(c.req.raw, auth);

    if (accessResult !== null) {
      return accessResult;
    }

    const orderId = Number(c.req.param("id"));
    if (isNaN(orderId) || orderId <= 0) {
      return errorResponse("INVALID_REQUEST", "Invalid order ID", 400);
    }

    const order = await orderService.getOrder(auth.companyId, orderId, {
      userId: auth.userId
    });

    if (!order) {
      return errorResponse("NOT_FOUND", "Order not found", 404);
    }

    // Check outlet access
    const hasAccess = await userHasOutletAccess(auth.userId, auth.companyId, order.outlet_id);
    if (!hasAccess) {
      return errorResponse("FORBIDDEN", "Forbidden", 403);
    }

    return successResponse(order);
  } catch (error) {
    console.error("GET /sales/orders/:id failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Order request failed", 500);
  }
});

// ============================================================================
// PATCH /sales/orders/:id - Update Order
// ============================================================================

orderRoutes.patch("/:id", async (c) => {
  const auth = c.get("auth") as AuthContext;

  try {
    const accessResult = await requireAccess({
      module: "sales",
      permission: "update",
      resource: "orders"
    })(c.req.raw, auth);

    if (accessResult !== null) {
      return accessResult;
    }

    const orderId = Number(c.req.param("id"));
    if (isNaN(orderId) || orderId <= 0) {
      return errorResponse("INVALID_REQUEST", "Invalid order ID", 400);
    }

    let payload: unknown;
    try {
      payload = await c.req.json();
    } catch {
      return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
    }

    let input;
    try {
      input = SalesOrderUpdateRequestSchema.parse(payload);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
      }
      throw error;
    }

    // Validate outlet access if changing outlet
    if (input.outlet_id) {
      const hasAccess = await userHasOutletAccess(auth.userId, auth.companyId, input.outlet_id);
      if (!hasAccess) {
        return errorResponse("FORBIDDEN", "Forbidden", 403);
      }
    }

    const order = await orderService.updateOrder(auth.companyId, orderId, input, {
      userId: auth.userId
    });

    if (!order) {
      return errorResponse("NOT_FOUND", "Order not found", 404);
    }

    return successResponse(order);
  } catch (error) {
    if (error instanceof DatabaseForbiddenError) {
      return errorResponse("FORBIDDEN", "Forbidden", 403);
    }

    if (error instanceof DatabaseConflictError) {
      return errorResponse("CONFLICT", error.message, 409);
    }

    if (error instanceof DatabaseReferenceError) {
      return errorResponse("NOT_FOUND", "Outlet not found", 404);
    }

    console.error("PATCH /sales/orders/:id failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Order update failed", 500);
  }
});

// ============================================================================
// POST /sales/orders/:id/convert-to-invoice - Convert to Invoice
// ============================================================================

orderRoutes.post("/:id/convert-to-invoice", async (c) => {
  const auth = c.get("auth") as AuthContext;

  try {
    const accessResult = await requireAccess({
      module: "sales",
      permission: "update",
      resource: "orders"
    })(c.req.raw, auth);

    if (accessResult !== null) {
      return accessResult;
    }

    const orderId = Number(c.req.param("id"));
    if (isNaN(orderId) || orderId <= 0) {
      return errorResponse("INVALID_REQUEST", "Invalid order ID", 400);
    }

    // Parse optional invoice_date from request body (validated for future invoice flow)
    let body;
    try {
      body = await c.req.json();
    } catch {
      return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
    }

    const parsed = ConvertToInvoiceSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse("INVALID_REQUEST", "Invalid invoice_date", 400);
    }
    void parsed.data.invoice_date;

    // Get order first to check status and outlet access
    const order = await orderService.getOrder(auth.companyId, orderId, {
      userId: auth.userId
    });

    if (!order) {
      return errorResponse("NOT_FOUND", "Order not found", 404);
    }

    if (order.status !== "CONFIRMED") {
      return errorResponse("CONFLICT", "Only confirmed orders can be converted to invoice", 409);
    }

    // Check outlet access
    const hasAccess = await userHasOutletAccess(auth.userId, auth.companyId, order.outlet_id);
    if (!hasAccess) {
      return errorResponse("FORBIDDEN", "Forbidden", 403);
    }

    // Create invoice from order - this would be done via invoice service
    // For now, we complete the order and return the order data
    const completedOrder = await orderService.completeOrder(auth.companyId, orderId, {
      userId: auth.userId
    });

    return successResponse({
      invoice_id: null,
      invoice_number: null,
      order_id: completedOrder.id,
      order_no: completedOrder.order_no,
      grand_total: completedOrder.grand_total
    });
  } catch (error) {
    if (error instanceof DatabaseForbiddenError) {
      return errorResponse("FORBIDDEN", "Forbidden", 403);
    }

    if (error instanceof DatabaseReferenceError) {
      return errorResponse("NOT_FOUND", error.message, 404);
    }

    if (error instanceof DatabaseConflictError) {
      return errorResponse("CONFLICT", error.message, 409);
    }

    console.error("POST /sales/orders/:id/convert-to-invoice failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Order conversion failed", 500);
  }
});

// ============================================================================
// POST /sales/orders/:id/cancel - Cancel Order
// ============================================================================

orderRoutes.post("/:id/cancel", async (c) => {
  const auth = c.get("auth") as AuthContext;

  try {
    const accessResult = await requireAccess({
      module: "sales",
      permission: "update",
      resource: "orders"
    })(c.req.raw, auth);

    if (accessResult !== null) {
      return accessResult;
    }

    const orderId = Number(c.req.param("id"));
    if (isNaN(orderId) || orderId <= 0) {
      return errorResponse("INVALID_REQUEST", "Invalid order ID", 400);
    }

    // Parse optional reason from request body (validated for future cancellation audit metadata)
    let body;
    try {
      body = await c.req.json();
    } catch {
      return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
    }

    const parsed = CancelOrderSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse("INVALID_REQUEST", "Invalid reason", 400);
    }
    void parsed.data.reason;

    // Get order first to check status and outlet access
    const order = await orderService.getOrder(auth.companyId, orderId, {
      userId: auth.userId
    });

    if (!order) {
      return errorResponse("NOT_FOUND", "Order not found", 404);
    }

    if (order.status !== "DRAFT" && order.status !== "CONFIRMED") {
      return errorResponse("CONFLICT", "Only draft or confirmed orders can be cancelled", 409);
    }

    // Check outlet access
    const hasAccess = await userHasOutletAccess(auth.userId, auth.companyId, order.outlet_id);
    if (!hasAccess) {
      return errorResponse("FORBIDDEN", "Forbidden", 403);
    }

    // Void the order
    const cancelledOrder = await orderService.voidOrder(auth.companyId, orderId, {
      userId: auth.userId
    });

    return successResponse(cancelledOrder);
  } catch (error) {
    if (error instanceof DatabaseForbiddenError) {
      return errorResponse("FORBIDDEN", "Forbidden", 403);
    }

    if (error instanceof DatabaseReferenceError) {
      return errorResponse("NOT_FOUND", error.message, 404);
    }

    if (error instanceof DatabaseConflictError) {
      return errorResponse("CONFLICT", error.message, 409);
    }

    console.error("POST /sales/orders/:id/cancel failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Order cancellation failed", 500);
  }
});

// ============================================================================
// OpenAPI Route Registration (for use with OpenAPIHono)
// ============================================================================

/**
 * Order list response schema
 */
const OrderListDataSchema = zodOpenApi.object({
  total: zodOpenApi.number().openapi({ description: "Total number of orders" }),
  orders: zodOpenApi.array(SalesOrderResponseSchema).openapi({ description: "List of orders" }),
});

const OrderListResponseSchema = zodOpenApi
  .object({
    success: zodOpenApi.literal(true).openapi({ example: true }),
    data: OrderListDataSchema,
  })
  .openapi("OrderListResponse");

/**
 * Order error response schema
 */
const OrderErrorResponseSchema = zodOpenApi
  .object({
    success: zodOpenApi.literal(false).openapi({ example: false }),
    error: zodOpenApi
      .object({
        code: zodOpenApi.string().openapi({ description: "Error code" }),
        message: zodOpenApi.string().openapi({ description: "Human-readable error message" }),
      })
      .openapi("OrderErrorDetail"),
  })
  .openapi("OrderErrorResponse");

/**
 * Registers sales order routes with an OpenAPIHono instance.
 * This enables auto-generated OpenAPI specs for the order endpoints.
 */
export function registerSalesOrderRoutes(app: { openapi: OpenAPIHonoType["openapi"] }): void {
  // GET /sales/orders - List orders with filtering
  const listOrdersRoute = createRoute({
    path: "/sales/orders",
    method: "get",
    tags: ["Sales"],
    summary: "List sales orders",
    description: "List sales orders with optional filtering by outlet, status, and date range",
    security: [{ BearerAuth: [] }],
    request: {
      query: SalesOrderListQuerySchema,
    },
    responses: {
      200: {
        content: { "application/json": { schema: OrderListResponseSchema } },
        description: "Orders retrieved successfully",
      },
      400: {
        content: { "application/json": { schema: OrderErrorResponseSchema } },
        description: "Invalid request",
      },
      401: {
        content: { "application/json": { schema: OrderErrorResponseSchema } },
        description: "Unauthorized",
      },
      403: {
        content: { "application/json": { schema: OrderErrorResponseSchema } },
        description: "Forbidden",
      },
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app.openapi(listOrdersRoute, (async (c: any) => {
    const auth = c.get("auth");

    try {
      const accessResult = await requireAccess({
        module: "sales",
        permission: "read",
        resource: "orders"
      })(c.req.raw, auth);

      if (accessResult !== null) {
        return accessResult;
      }

      const url = new URL(c.req.raw.url);
      const parsed = SalesOrderListQuerySchema.parse({
        outlet_id: url.searchParams.get("outlet_id") ?? undefined,
        status: url.searchParams.get("status") ?? undefined,
        date_from: url.searchParams.get("date_from") ?? undefined,
        date_to: url.searchParams.get("date_to") ?? undefined,
        limit: url.searchParams.get("limit") ?? undefined,
        offset: url.searchParams.get("offset") ?? undefined
      });

      let outletIds: number[];
      if (typeof parsed.outlet_id === "number") {
        const hasAccess = await userHasOutletAccess(auth.userId, auth.companyId, parsed.outlet_id);
        if (!hasAccess) {
          return errorResponse("FORBIDDEN", "Forbidden", 403);
        }
        outletIds = [parsed.outlet_id];
      } else {
        outletIds = await listUserOutletIds(auth.userId, auth.companyId);
      }

      const company = await companyService.getCompany({ companyId: auth.companyId });
      const timezone = company.timezone ?? 'UTC';

      const result = await orderService.listOrders(auth.companyId, {
        outletIds,
        status: parsed.status,
        dateFrom: parsed.date_from,
        dateTo: parsed.date_to,
        limit: parsed.limit,
        offset: parsed.offset,
        timezone
      });

      return successResponse({
        total: result.total,
        orders: result.orders
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }

      console.error("GET /sales/orders failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Orders request failed", 500);
    }
  }) as any);

  // POST /sales/orders - Create new order
  const createOrderRoute = createRoute({
    path: "/sales/orders",
    method: "post",
    tags: ["Sales"],
    summary: "Create sales order",
    description: "Create a new sales order",
    security: [{ BearerAuth: [] }],
    request: {
      body: {
        content: {
          "application/json": {
            schema: SalesOrderCreateRequestSchema,
          },
        },
      },
    },
    responses: {
      201: {
        content: { "application/json": { schema: SalesOrderResponseSchema } },
        description: "Order created successfully",
      },
      400: {
        content: { "application/json": { schema: OrderErrorResponseSchema } },
        description: "Invalid request",
      },
      401: {
        content: { "application/json": { schema: OrderErrorResponseSchema } },
        description: "Unauthorized",
      },
      403: {
        content: { "application/json": { schema: OrderErrorResponseSchema } },
        description: "Forbidden",
      },
      409: {
        content: { "application/json": { schema: OrderErrorResponseSchema } },
        description: "Conflict (e.g., numbering template not configured)",
      },
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app.openapi(createOrderRoute, (async (c: any) => {
    const auth = c.get("auth");

    try {
      const accessResult = await requireAccess({
        module: "sales",
        permission: "create",
        resource: "orders"
      })(c.req.raw, auth);

      if (accessResult !== null) {
        return accessResult;
      }

      let payload: unknown;
      try {
        payload = await c.req.json();
      } catch {
        return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
      }

      let input;
      try {
        input = SalesOrderCreateRequestSchema.parse(payload);
      } catch (error) {
        if (error instanceof z.ZodError) {
          return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
        }
        throw error;
      }

      const hasAccess = await userHasOutletAccess(auth.userId, auth.companyId, input.outlet_id);
      if (!hasAccess) {
        return errorResponse("FORBIDDEN", "Forbidden", 403);
      }

      const order = await orderService.createOrder(auth.companyId, input, {
        userId: auth.userId
      });

      return successResponse(order, 201);
    } catch (error) {
      if (error instanceof DatabaseForbiddenError) {
        return errorResponse("FORBIDDEN", "Forbidden", 403);
      }

      if (error instanceof DatabaseReferenceError) {
        if (error.message === "Numbering template not configured") {
          return errorResponse("CONFLICT", numberingTemplateConflictMessage, 409);
        }
        return errorResponse("NOT_FOUND", "Outlet not found", 404);
      }

      if (error instanceof DatabaseConflictError) {
        return errorResponse("CONFLICT", error.message, 409);
      }

      console.error("POST /sales/orders failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Order creation failed", 500);
    }
  }) as any);

  // GET /sales/orders/:id - Get Order Detail
  const getOrderRoute = createRoute({
    path: "/sales/orders/{id}",
    method: "get",
    tags: ["Sales"],
    summary: "Get sales order detail",
    description: "Get a single sales order by ID with line items",
    security: [{ BearerAuth: [] }],
    request: {
      params: zodOpenApi.object({
        id: zodOpenApi.string().regex(/^\d+$/).openapi({ description: "Order ID" }),
      }),
    },
    responses: {
      200: {
        content: { "application/json": { schema: SalesOrderResponseSchema } },
        description: "Order retrieved successfully",
      },
      400: {
        content: { "application/json": { schema: OrderErrorResponseSchema } },
        description: "Invalid order ID",
      },
      401: {
        content: { "application/json": { schema: OrderErrorResponseSchema } },
        description: "Unauthorized",
      },
      403: {
        content: { "application/json": { schema: OrderErrorResponseSchema } },
        description: "Forbidden",
      },
      404: {
        content: { "application/json": { schema: OrderErrorResponseSchema } },
        description: "Order not found",
      },
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app.openapi(getOrderRoute, (async (c: any) => {
    const auth = c.get("auth");

    try {
      const accessResult = await requireAccess({
        module: "sales",
        permission: "read",
        resource: "orders"
      })(c.req.raw, auth);

      if (accessResult !== null) {
        return accessResult;
      }

      const orderId = Number(c.req.param("id"));
      if (isNaN(orderId) || orderId <= 0) {
        return errorResponse("INVALID_REQUEST", "Invalid order ID", 400);
      }

      const order = await orderService.getOrder(auth.companyId, orderId, {
        userId: auth.userId
      });

      if (!order) {
        return errorResponse("NOT_FOUND", "Order not found", 404);
      }

      const hasAccess = await userHasOutletAccess(auth.userId, auth.companyId, order.outlet_id);
      if (!hasAccess) {
        return errorResponse("FORBIDDEN", "Forbidden", 403);
      }

      return successResponse(order);
    } catch (error) {
      console.error("GET /sales/orders/:id failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Order request failed", 500);
    }
  }) as any);

  // PATCH /sales/orders/:id - Update Order
  const updateOrderRoute = createRoute({
    path: "/sales/orders/{id}",
    method: "patch",
    tags: ["Sales"],
    summary: "Update sales order",
    description: "Update a sales order (only DRAFT or CONFIRMED status)",
    security: [{ BearerAuth: [] }],
    request: {
      params: zodOpenApi.object({
        id: zodOpenApi.string().regex(/^\d+$/).openapi({ description: "Order ID" }),
      }),
      body: {
        content: {
          "application/json": {
            schema: SalesOrderUpdateRequestSchema,
          },
        },
      },
    },
    responses: {
      200: {
        content: { "application/json": { schema: SalesOrderResponseSchema } },
        description: "Order updated successfully",
      },
      400: {
        content: { "application/json": { schema: OrderErrorResponseSchema } },
        description: "Invalid request",
      },
      401: {
        content: { "application/json": { schema: OrderErrorResponseSchema } },
        description: "Unauthorized",
      },
      403: {
        content: { "application/json": { schema: OrderErrorResponseSchema } },
        description: "Forbidden",
      },
      404: {
        content: { "application/json": { schema: OrderErrorResponseSchema } },
        description: "Order not found",
      },
      409: {
        content: { "application/json": { schema: OrderErrorResponseSchema } },
        description: "Conflict (order not editable)",
      },
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app.openapi(updateOrderRoute, (async (c: any) => {
    const auth = c.get("auth");

    try {
      const accessResult = await requireAccess({
        module: "sales",
        permission: "update",
        resource: "orders"
      })(c.req.raw, auth);

      if (accessResult !== null) {
        return accessResult;
      }

      const orderId = Number(c.req.param("id"));
      if (isNaN(orderId) || orderId <= 0) {
        return errorResponse("INVALID_REQUEST", "Invalid order ID", 400);
      }

      let payload: unknown;
      try {
        payload = await c.req.json();
      } catch {
        return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
      }

      let input;
      try {
        input = SalesOrderUpdateRequestSchema.parse(payload);
      } catch (error) {
        if (error instanceof z.ZodError) {
          return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
        }
        throw error;
      }

      if (input.outlet_id) {
        const hasAccess = await userHasOutletAccess(auth.userId, auth.companyId, input.outlet_id);
        if (!hasAccess) {
          return errorResponse("FORBIDDEN", "Forbidden", 403);
        }
      }

      const order = await orderService.updateOrder(auth.companyId, orderId, input, {
        userId: auth.userId
      });

      if (!order) {
        return errorResponse("NOT_FOUND", "Order not found", 404);
      }

      return successResponse(order);
    } catch (error) {
      if (error instanceof DatabaseForbiddenError) {
        return errorResponse("FORBIDDEN", "Forbidden", 403);
      }

      if (error instanceof DatabaseConflictError) {
        return errorResponse("CONFLICT", error.message, 409);
      }

      if (error instanceof DatabaseReferenceError) {
        return errorResponse("NOT_FOUND", "Outlet not found", 404);
      }

      console.error("PATCH /sales/orders/:id failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Order update failed", 500);
    }
  }) as any);

  // POST /sales/orders/:id/convert-to-invoice - Convert to Invoice
  const convertToInvoiceRoute = createRoute({
    path: "/sales/orders/{id}/convert-to-invoice",
    method: "post",
    tags: ["Sales"],
    summary: "Convert order to invoice",
    description: "Convert a confirmed sales order to an invoice",
    security: [{ BearerAuth: [] }],
    request: {
      params: zodOpenApi.object({
        id: zodOpenApi.string().regex(/^\d+$/).openapi({ description: "Order ID" }),
      }),
      body: {
        content: {
          "application/json": {
            schema: ConvertToInvoiceSchema,
          },
        },
      },
    },
    responses: {
      200: {
        content: { "application/json": { schema: zodOpenApi.object({
          invoice_id: zodOpenApi.number().nullable().openapi({ description: "Created invoice ID" }),
          invoice_number: zodOpenApi.string().nullable().openapi({ description: "Created invoice number" }),
          order_id: zodOpenApi.number().openapi({ description: "Order ID" }),
          order_no: zodOpenApi.string().openapi({ description: "Order number" }),
          grand_total: zodOpenApi.number().openapi({ description: "Order grand total" })
        }) } },
        description: "Order converted to invoice successfully",
      },
      400: {
        content: { "application/json": { schema: OrderErrorResponseSchema } },
        description: "Invalid order ID",
      },
      401: {
        content: { "application/json": { schema: OrderErrorResponseSchema } },
        description: "Unauthorized",
      },
      403: {
        content: { "application/json": { schema: OrderErrorResponseSchema } },
        description: "Forbidden",
      },
      404: {
        content: { "application/json": { schema: OrderErrorResponseSchema } },
        description: "Order not found",
      },
      409: {
        content: { "application/json": { schema: OrderErrorResponseSchema } },
        description: "Conflict (order not in CONFIRMED status)",
      },
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app.openapi(convertToInvoiceRoute, (async (c: any) => {
    const auth = c.get("auth");

    try {
      const accessResult = await requireAccess({
        module: "sales",
        permission: "update",
        resource: "orders"
      })(c.req.raw, auth);

      if (accessResult !== null) {
        return accessResult;
      }

      const orderId = Number(c.req.param("id"));
      if (isNaN(orderId) || orderId <= 0) {
        return errorResponse("INVALID_REQUEST", "Invalid order ID", 400);
      }

      // Parse optional invoice_date from request body
      let invoiceDate: string | undefined;
      try {
        const body = await c.req.json();
        const parsed = ConvertToInvoiceSchema.safeParse(body);
        if (parsed.success && parsed.data.invoice_date) {
          invoiceDate = parsed.data.invoice_date;
          console.log(`invoice_date provided for order ${orderId} conversion: ${invoiceDate} (future implementation)`);
        }
      } catch {
        // Body is optional, ignore parse errors for empty body
      }

      const order = await orderService.getOrder(auth.companyId, orderId, {
        userId: auth.userId
      });

      if (!order) {
        return errorResponse("NOT_FOUND", "Order not found", 404);
      }

      if (order.status !== "CONFIRMED") {
        return errorResponse("CONFLICT", "Only confirmed orders can be converted to invoice", 409);
      }

      const hasAccess = await userHasOutletAccess(auth.userId, auth.companyId, order.outlet_id);
      if (!hasAccess) {
        return errorResponse("FORBIDDEN", "Forbidden", 403);
      }

      const completedOrder = await orderService.completeOrder(auth.companyId, orderId, {
        userId: auth.userId
      });

      return successResponse({
        invoice_id: null,
        invoice_number: null,
        order_id: completedOrder.id,
        order_no: completedOrder.order_no,
        grand_total: completedOrder.grand_total
      });
    } catch (error) {
      if (error instanceof DatabaseForbiddenError) {
        return errorResponse("FORBIDDEN", "Forbidden", 403);
      }

      if (error instanceof DatabaseReferenceError) {
        return errorResponse("NOT_FOUND", error.message, 404);
      }

      if (error instanceof DatabaseConflictError) {
        return errorResponse("CONFLICT", error.message, 409);
      }

      console.error("POST /sales/orders/:id/convert-to-invoice failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Order conversion failed", 500);
    }
  }) as any);

  // POST /sales/orders/:id/cancel - Cancel Order
  const cancelOrderRoute = createRoute({
    path: "/sales/orders/{id}/cancel",
    method: "post",
    tags: ["Sales"],
    summary: "Cancel sales order",
    description: "Cancel a draft or confirmed sales order",
    security: [{ BearerAuth: [] }],
    request: {
      params: zodOpenApi.object({
        id: zodOpenApi.string().regex(/^\d+$/).openapi({ description: "Order ID" }),
      }),
      body: {
        content: {
          "application/json": {
            schema: CancelOrderSchema,
          },
        },
      },
    },
    responses: {
      200: {
        content: { "application/json": { schema: SalesOrderResponseSchema } },
        description: "Order cancelled successfully",
      },
      400: {
        content: { "application/json": { schema: OrderErrorResponseSchema } },
        description: "Invalid order ID",
      },
      401: {
        content: { "application/json": { schema: OrderErrorResponseSchema } },
        description: "Unauthorized",
      },
      403: {
        content: { "application/json": { schema: OrderErrorResponseSchema } },
        description: "Forbidden",
      },
      404: {
        content: { "application/json": { schema: OrderErrorResponseSchema } },
        description: "Order not found",
      },
      409: {
        content: { "application/json": { schema: OrderErrorResponseSchema } },
        description: "Conflict (order cannot be cancelled)",
      },
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app.openapi(cancelOrderRoute, (async (c: any) => {
    const auth = c.get("auth");

    try {
      const accessResult = await requireAccess({
        module: "sales",
        permission: "update",
        resource: "orders"
      })(c.req.raw, auth);

      if (accessResult !== null) {
        return accessResult;
      }

      const orderId = Number(c.req.param("id"));
      if (isNaN(orderId) || orderId <= 0) {
        return errorResponse("INVALID_REQUEST", "Invalid order ID", 400);
      }

      // Parse optional reason from request body
      let reason: string | undefined;
      try {
        const body = await c.req.json();
        const parsed = CancelOrderSchema.safeParse(body);
        if (parsed.success && parsed.data.reason) {
          reason = parsed.data.reason;
          console.log(`Cancellation reason for order ${orderId}: ${reason}`);
        }
      } catch {
        // Body is optional, ignore parse errors for empty body
      }

      const order = await orderService.getOrder(auth.companyId, orderId, {
        userId: auth.userId
      });

      if (!order) {
        return errorResponse("NOT_FOUND", "Order not found", 404);
      }

      if (order.status !== "DRAFT" && order.status !== "CONFIRMED") {
        return errorResponse("CONFLICT", "Only draft or confirmed orders can be cancelled", 409);
      }

      const hasAccess = await userHasOutletAccess(auth.userId, auth.companyId, order.outlet_id);
      if (!hasAccess) {
        return errorResponse("FORBIDDEN", "Forbidden", 403);
      }

      const cancelledOrder = await orderService.voidOrder(auth.companyId, orderId, {
        userId: auth.userId
      });

      return successResponse(cancelledOrder);
    } catch (error) {
      if (error instanceof DatabaseForbiddenError) {
        return errorResponse("FORBIDDEN", "Forbidden", 403);
      }

      if (error instanceof DatabaseReferenceError) {
        return errorResponse("NOT_FOUND", error.message, 404);
      }

      if (error instanceof DatabaseConflictError) {
        return errorResponse("CONFLICT", error.message, 409);
      }

      console.error("POST /sales/orders/:id/cancel failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Order cancellation failed", 500);
    }
  }) as any);
}

export { orderRoutes };
