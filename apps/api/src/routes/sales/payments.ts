// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Sales Payment Routes
 *
 * Routes for sales payment operations.
 * GET /sales/payments - List payments with filtering
 * POST /sales/payments - Process new payment
 */

import { Hono } from "hono";
import { z } from "zod";
import { createRoute, z as zodOpenApi } from "@hono/zod-openapi";
import type { OpenAPIHono as OpenAPIHonoType } from "@hono/zod-openapi";
import {
  NumericIdSchema,
  SalesPaymentCreateRequestSchema,
  SalesPaymentListQuerySchema,
  SalesPaymentResponseSchema
} from "@jurnapod/shared";
import {
  PaymentAllocationError,
  DatabaseConflictError,
  DatabaseReferenceError,
  DatabaseForbiddenError
} from "@jurnapod/modules-sales";
import { getComposedPaymentService } from "@/lib/modules-sales/payment-service-composition";
import { PaymentVarianceConfigError } from "@/lib/sales-posting";
import { listUserOutletIds, userHasOutletAccess } from "@/lib/auth";
import { requireAccess } from "@/lib/auth-guard";
import { errorResponse, successResponse } from "@/lib/response";
import type { AuthContext } from "@/lib/auth-guard";
import { getCompanyService } from "@/lib/companies";

const paymentRoutes = new Hono();

const numberingTemplateConflictMessage =
  "No numbering template configured. Please configure document numbering in settings.";

// Company service for fetching company details (e.g., timezone)
const companyService = getCompanyService();

// ============================================================================
// GET /sales/payments - List payments with filtering
// ============================================================================

paymentRoutes.get("/", async (c) => {
  const auth = c.get("auth") as AuthContext;

  try {
    // Check module permission using bitmask
    const accessResult = await requireAccess({
      module: "sales",
      permission: "read"
    })(c.req.raw, auth);

    if (accessResult !== null) {
      return accessResult;
    }

    const url = new URL(c.req.raw.url);
    const parsed = SalesPaymentListQuerySchema.parse({
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

    const report = await getComposedPaymentService().listPayments(auth.companyId, {
      outletIds,
      status: parsed.status,
      dateFrom: parsed.date_from,
      dateTo: parsed.date_to,
      limit: parsed.limit,
      offset: parsed.offset,
      timezone
    });

    return successResponse({
      total: report.total,
      payments: report.payments
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid request", 400);
    }

    console.error("GET /sales/payments failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Payments request failed", 500);
  }
});

// ============================================================================
// GET /sales/payments/:id - Get single payment
// ============================================================================

paymentRoutes.get("/:id", async (c) => {
  const auth = c.get("auth") as AuthContext;

  try {
    // Check module permission using bitmask
    const accessResult = await requireAccess({
      module: "sales",
      permission: "read"
    })(c.req.raw, auth);

    if (accessResult !== null) {
      return accessResult;
    }

    const paymentId = NumericIdSchema.parse(c.req.param("id"));
    const payment = await getComposedPaymentService().getPayment(auth.companyId, paymentId);

    if (!payment) {
      return errorResponse("NOT_FOUND", "Payment not found", 404);
    }

    // Validate outlet access
    const hasAccess = await userHasOutletAccess(auth.userId, auth.companyId, payment.outlet_id);
    if (!hasAccess) {
      return errorResponse("FORBIDDEN", "Forbidden", 403);
    }

    return successResponse(payment);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid payment ID", 400);
    }

    console.error("GET /sales/payments/:id failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Payment request failed", 500);
  }
});

// ============================================================================
// PATCH /sales/payments/:id - Update payment
// ============================================================================

paymentRoutes.patch("/:id", async (c) => {
  const auth = c.get("auth") as AuthContext;

  try {
    const paymentId = NumericIdSchema.parse(c.req.param("id"));

    let payload: unknown;
    try {
      payload = await c.req.json();
    } catch {
      return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
    }

    // Validate outlet access before updating
    const existingPayment = await getComposedPaymentService().getPayment(auth.companyId, paymentId);
    if (!existingPayment) {
      return errorResponse("NOT_FOUND", "Payment not found", 404);
    }

    const hasAccess = await userHasOutletAccess(auth.userId, auth.companyId, existingPayment.outlet_id);
    if (!hasAccess) {
      return errorResponse("FORBIDDEN", "Forbidden", 403);
    }

    const updateData = payload as Record<string, unknown>;
    
    const updatedPayment = await getComposedPaymentService().updatePayment(auth.companyId, paymentId, {
      outlet_id: updateData.outlet_id as number | undefined,
      invoice_id: updateData.invoice_id as number | undefined,
      payment_no: updateData.payment_no as string | undefined,
      payment_at: updateData.payment_at as string | undefined,
      account_id: updateData.account_id as number | undefined,
      method: updateData.method as "CASH" | "QRIS" | "CARD" | undefined,
      amount: updateData.amount as number | undefined,
      actual_amount_idr: updateData.actual_amount_idr as number | undefined,
      splits: updateData.splits as Array<{ account_id: number; amount: number }> | undefined
    }, { userId: auth.userId });

    if (!updatedPayment) {
      return errorResponse("NOT_FOUND", "Payment not found", 404);
    }

    return successResponse(updatedPayment);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid request", 400);
    }

    if (error instanceof DatabaseConflictError) {
      return errorResponse("CONFLICT", error.message, 409);
    }

    if (error instanceof PaymentAllocationError) {
      return errorResponse("INVALID_REQUEST", error.message, 400);
    }

    console.error("PATCH /sales/payments/:id failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Payment update failed", 500);
  }
});

// ============================================================================
// POST /sales/payments/:id/post - Post payment
// ============================================================================

const PostPaymentSchema = z.object({
  settle_shortfall_as_loss: z.boolean().optional(),
  shortfall_reason: z.string().trim().max(500).optional()
});

paymentRoutes.post("/:id/post", async (c) => {
  const auth = c.get("auth") as AuthContext;

  try {
    // Check module permission - posting requires update permission
    const accessResult = await requireAccess({
      module: "sales",
      permission: "update"
    })(c.req.raw, auth);

    if (accessResult !== null) {
      return accessResult;
    }

    const paymentId = NumericIdSchema.parse(c.req.param("id"));

    // Parse optional body for shortfall settlement options
    let postOptions: { settle_shortfall_as_loss?: boolean; shortfall_reason?: string } = {};
    const contentType = c.req.raw.headers.get("content-type") ?? "";
    
    // Only try to parse JSON if content-type indicates JSON and body exists
    if (contentType.includes("application/json")) {
      const bodyText = await c.req.raw.text();
      if (bodyText && bodyText.trim()) {
        try {
          const body = JSON.parse(bodyText);
          if (body && typeof body === 'object' && Object.keys(body).length > 0) {
            const parsed = PostPaymentSchema.safeParse(body);
            if (parsed.success) {
              postOptions = {
                settle_shortfall_as_loss: parsed.data.settle_shortfall_as_loss,
                shortfall_reason: parsed.data.shortfall_reason
              };
            }
          }
        } catch {
          // JSON parse error - invalid JSON body
          return errorResponse("INVALID_REQUEST", "Invalid JSON body", 400);
        }
      }
    }

    // Check payment exists and user has outlet access
    const existingPayment = await getComposedPaymentService().getPayment(auth.companyId, paymentId);
    if (!existingPayment) {
      return errorResponse("NOT_FOUND", "Payment not found", 404);
    }

    const hasAccess = await userHasOutletAccess(auth.userId, auth.companyId, existingPayment.outlet_id);
    if (!hasAccess) {
      return errorResponse("FORBIDDEN", "Forbidden", 403);
    }

    const postedPayment = await getComposedPaymentService().postPayment(auth.companyId, paymentId, { userId: auth.userId }, postOptions);

    if (!postedPayment) {
      return errorResponse("NOT_FOUND", "Payment not found", 404);
    }

    return successResponse(postedPayment);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
    }

    if (error instanceof DatabaseForbiddenError) {
      return errorResponse("FORBIDDEN", "Forbidden", 403);
    }

    if (error instanceof PaymentAllocationError) {
      return errorResponse("INVALID_REQUEST", error.message, 400);
    }

    if (error instanceof PaymentVarianceConfigError) {
      return errorResponse("PAYMENT_VARIANCE_GAIN_MISSING", error.message, 409);
    }

    console.error("POST /sales/payments/:id/post failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Payment posting failed", 500);
  }
});

// ============================================================================
// POST /sales/payments - Process new payment
// ============================================================================

paymentRoutes.post("/", async (c) => {
  const auth = c.get("auth") as AuthContext;

  try {
    // Check module permission using bitmask
    const accessResult = await requireAccess({
      module: "sales",
      permission: "create"
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
      input = SalesPaymentCreateRequestSchema.parse(payload);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
      }
      throw error;
    }

    // Validate outlet access before creating payment
    const hasAccess = await userHasOutletAccess(auth.userId, auth.companyId, input.outlet_id);
    if (!hasAccess) {
      return errorResponse("FORBIDDEN", "Forbidden", 403);
    }

    const payment = await getComposedPaymentService().createPayment(auth.companyId, input, {
      userId: auth.userId
    });

    return successResponse(payment, 201);
  } catch (error) {
    if (error instanceof DatabaseForbiddenError) {
      return errorResponse("FORBIDDEN", "Forbidden", 403);
    }

    if (error instanceof DatabaseReferenceError) {
      if (error.message === "Numbering template not configured") {
        return errorResponse("CONFLICT", numberingTemplateConflictMessage, 409);
      }
      return errorResponse("NOT_FOUND", "Resource not found", 404);
    }

    if (error instanceof DatabaseConflictError) {
      return errorResponse("CONFLICT", error.message, 409);
    }

    if (error instanceof PaymentAllocationError) {
      return errorResponse("INVALID_REQUEST", error.message, 400);
    }

    console.error("POST /sales/payments failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Payment processing failed", 500);
  }
});

// ============================================================================
// OpenAPI Route Registration (for use with OpenAPIHono)
// ============================================================================

/**
 * Payment list response schema
 */
const PaymentListDataSchema = zodOpenApi.object({
  total: zodOpenApi.number().openapi({ description: "Total number of payments" }),
  payments: zodOpenApi.array(SalesPaymentResponseSchema).openapi({ description: "List of payments" }),
});

const PaymentListResponseSchema = zodOpenApi
  .object({
    success: zodOpenApi.literal(true).openapi({ example: true }),
    data: PaymentListDataSchema,
  })
  .openapi("PaymentListResponse");

/**
 * Payment error response schema
 */
const PaymentErrorResponseSchema = zodOpenApi
  .object({
    success: zodOpenApi.literal(false).openapi({ example: false }),
    error: zodOpenApi
      .object({
        code: zodOpenApi.string().openapi({ description: "Error code" }),
        message: zodOpenApi.string().openapi({ description: "Human-readable error message" }),
      })
      .openapi("PaymentErrorDetail"),
  })
  .openapi("PaymentErrorResponse");

/**
 * Registers sales payment routes with an OpenAPIHono instance.
 * This enables auto-generated OpenAPI specs for the payment endpoints.
 */
export function registerSalesPaymentRoutes(app: { openapi: OpenAPIHonoType["openapi"] }): void {
  // GET /sales/payments - List payments with filtering
  const listPaymentsRoute = createRoute({
    path: "/sales/payments",
    method: "get",
    tags: ["Sales"],
    summary: "List sales payments",
    description: "List sales payments with optional filtering by outlet, status, and date range",
    security: [{ BearerAuth: [] }],
    request: {
      query: SalesPaymentListQuerySchema,
    },
    responses: {
      200: {
        content: { "application/json": { schema: PaymentListResponseSchema } },
        description: "Payments retrieved successfully",
      },
      400: {
        content: { "application/json": { schema: PaymentErrorResponseSchema } },
        description: "Invalid request",
      },
      401: {
        content: { "application/json": { schema: PaymentErrorResponseSchema } },
        description: "Unauthorized",
      },
      403: {
        content: { "application/json": { schema: PaymentErrorResponseSchema } },
        description: "Forbidden",
      },
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app.openapi(listPaymentsRoute, (async (c: any) => {
    const auth = c.get("auth");

    try {
      const accessResult = await requireAccess({
        module: "sales",
        permission: "read"
      })(c.req.raw, auth);

      if (accessResult !== null) {
        return accessResult;
      }

      const url = new URL(c.req.raw.url);
      const parsed = SalesPaymentListQuerySchema.parse({
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

      const report = await getComposedPaymentService().listPayments(auth.companyId, {
        outletIds,
        status: parsed.status,
        dateFrom: parsed.date_from,
        dateTo: parsed.date_to,
        limit: parsed.limit,
        offset: parsed.offset,
        timezone
      });

      return successResponse({
        total: report.total,
        payments: report.payments
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }

      console.error("GET /sales/payments failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Payments request failed", 500);
    }
  }) as any);

  // GET /sales/payments/:id - Get single payment
  const getPaymentRoute = createRoute({
    path: "/sales/payments/{id}",
    method: "get",
    tags: ["Sales"],
    summary: "Get payment by ID",
    description: "Get a single sales payment by its ID",
    security: [{ BearerAuth: [] }],
    request: {
      params: zodOpenApi.object({
        id: zodOpenApi.string().openapi({ description: "Payment ID" }),
      }),
    },
    responses: {
      200: {
        content: { "application/json": { schema: SalesPaymentResponseSchema } },
        description: "Payment retrieved successfully",
      },
      400: {
        content: { "application/json": { schema: PaymentErrorResponseSchema } },
        description: "Invalid payment ID",
      },
      401: {
        content: { "application/json": { schema: PaymentErrorResponseSchema } },
        description: "Unauthorized",
      },
      403: {
        content: { "application/json": { schema: PaymentErrorResponseSchema } },
        description: "Forbidden",
      },
      404: {
        content: { "application/json": { schema: PaymentErrorResponseSchema } },
        description: "Payment not found",
      },
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app.openapi(getPaymentRoute, (async (c: any) => {
    const auth = c.get("auth");

    try {
      const accessResult = await requireAccess({
        module: "sales",
        permission: "read"
      })(c.req.raw, auth);

      if (accessResult !== null) {
        return accessResult;
      }

      const paymentId = NumericIdSchema.parse(c.req.param("id"));
      const payment = await getComposedPaymentService().getPayment(auth.companyId, paymentId);

      if (!payment) {
        return errorResponse("NOT_FOUND", "Payment not found", 404);
      }

      const hasAccess = await userHasOutletAccess(auth.userId, auth.companyId, payment.outlet_id);
      if (!hasAccess) {
        return errorResponse("FORBIDDEN", "Forbidden", 403);
      }

      return successResponse(payment);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid payment ID", 400);
      }

      console.error("GET /sales/payments/:id failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Payment request failed", 500);
    }
  }) as any);

  // PATCH /sales/payments/:id - Update payment
  const updatePaymentRoute = createRoute({
    path: "/sales/payments/{id}",
    method: "patch",
    tags: ["Sales"],
    summary: "Update payment",
    description: "Update an existing sales payment",
    security: [{ BearerAuth: [] }],
    request: {
      params: zodOpenApi.object({
        id: zodOpenApi.string().openapi({ description: "Payment ID" }),
      }),
      body: {
        content: {
          "application/json": {
            schema: zodOpenApi.object({}).openapi("PaymentUpdateBody"), // Simplified - actual schema uses dynamic keys
          },
        },
      },
    },
    responses: {
      200: {
        content: { "application/json": { schema: SalesPaymentResponseSchema } },
        description: "Payment updated successfully",
      },
      400: {
        content: { "application/json": { schema: PaymentErrorResponseSchema } },
        description: "Invalid request",
      },
      401: {
        content: { "application/json": { schema: PaymentErrorResponseSchema } },
        description: "Unauthorized",
      },
      403: {
        content: { "application/json": { schema: PaymentErrorResponseSchema } },
        description: "Forbidden",
      },
      404: {
        content: { "application/json": { schema: PaymentErrorResponseSchema } },
        description: "Payment not found",
      },
      409: {
        content: { "application/json": { schema: PaymentErrorResponseSchema } },
        description: "Conflict",
      },
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app.openapi(updatePaymentRoute, (async (c: any) => {
    const auth = c.get("auth");

    try {
      const paymentId = NumericIdSchema.parse(c.req.param("id"));

      let payload: unknown;
      try {
        payload = await c.req.json();
      } catch {
        return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
      }

      const existingPayment = await getComposedPaymentService().getPayment(auth.companyId, paymentId);
      if (!existingPayment) {
        return errorResponse("NOT_FOUND", "Payment not found", 404);
      }

      const hasAccess = await userHasOutletAccess(auth.userId, auth.companyId, existingPayment.outlet_id);
      if (!hasAccess) {
        return errorResponse("FORBIDDEN", "Forbidden", 403);
      }

      const updateData = payload as Record<string, unknown>;
      
      const updatedPayment = await getComposedPaymentService().updatePayment(auth.companyId, paymentId, {
        outlet_id: updateData.outlet_id as number | undefined,
        invoice_id: updateData.invoice_id as number | undefined,
        payment_no: updateData.payment_no as string | undefined,
        payment_at: updateData.payment_at as string | undefined,
        account_id: updateData.account_id as number | undefined,
        method: updateData.method as "CASH" | "QRIS" | "CARD" | undefined,
        amount: updateData.amount as number | undefined,
        actual_amount_idr: updateData.actual_amount_idr as number | undefined,
        splits: updateData.splits as Array<{ account_id: number; amount: number }> | undefined
      }, { userId: auth.userId });

      if (!updatedPayment) {
        return errorResponse("NOT_FOUND", "Payment not found", 404);
      }

      return successResponse(updatedPayment);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }

      if (error instanceof DatabaseConflictError) {
        return errorResponse("CONFLICT", error.message, 409);
      }

      if (error instanceof PaymentAllocationError) {
        return errorResponse("INVALID_REQUEST", error.message, 400);
      }

      console.error("PATCH /sales/payments/:id failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Payment update failed", 500);
    }
  }) as any);

  // POST /sales/payments/:id/post - Post payment
  const postPaymentRoute = createRoute({
    path: "/sales/payments/{id}/post",
    method: "post",
    tags: ["Sales"],
    summary: "Post payment",
    description: "Post a payment to the general ledger",
    security: [{ BearerAuth: [] }],
    request: {
      params: zodOpenApi.object({
        id: zodOpenApi.string().openapi({ description: "Payment ID" }),
      }),
    },
    responses: {
      200: {
        content: { "application/json": { schema: SalesPaymentResponseSchema } },
        description: "Payment posted successfully",
      },
      400: {
        content: { "application/json": { schema: PaymentErrorResponseSchema } },
        description: "Invalid request",
      },
      401: {
        content: { "application/json": { schema: PaymentErrorResponseSchema } },
        description: "Unauthorized",
      },
      403: {
        content: { "application/json": { schema: PaymentErrorResponseSchema } },
        description: "Forbidden",
      },
      404: {
        content: { "application/json": { schema: PaymentErrorResponseSchema } },
        description: "Payment not found",
      },
      409: {
        content: { "application/json": { schema: PaymentErrorResponseSchema } },
        description: "Conflict (e.g., payment variance not configured)",
      },
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app.openapi(postPaymentRoute, (async (c: any) => {
    const auth = c.get("auth");

    try {
      const accessResult = await requireAccess({
        module: "sales",
        permission: "update"
      })(c.req.raw, auth);

      if (accessResult !== null) {
        return accessResult;
      }

      const paymentId = NumericIdSchema.parse(c.req.param("id"));

      let postOptions: { settle_shortfall_as_loss?: boolean; shortfall_reason?: string } = {};
      const contentType = c.req.raw.headers.get("content-type") ?? "";
      
      if (contentType.includes("application/json")) {
        const bodyText = await c.req.raw.text();
        if (bodyText && bodyText.trim()) {
          try {
            const body = JSON.parse(bodyText);
            if (body && typeof body === 'object' && Object.keys(body).length > 0) {
              const parsed = PostPaymentSchema.safeParse(body);
              if (parsed.success) {
                postOptions = {
                  settle_shortfall_as_loss: parsed.data.settle_shortfall_as_loss,
                  shortfall_reason: parsed.data.shortfall_reason
                };
              }
            }
          } catch {
            return errorResponse("INVALID_REQUEST", "Invalid JSON body", 400);
          }
        }
      }

      const existingPayment = await getComposedPaymentService().getPayment(auth.companyId, paymentId);
      if (!existingPayment) {
        return errorResponse("NOT_FOUND", "Payment not found", 404);
      }

      const hasAccess = await userHasOutletAccess(auth.userId, auth.companyId, existingPayment.outlet_id);
      if (!hasAccess) {
        return errorResponse("FORBIDDEN", "Forbidden", 403);
      }

      const postedPayment = await getComposedPaymentService().postPayment(auth.companyId, paymentId, { userId: auth.userId }, postOptions);

      if (!postedPayment) {
        return errorResponse("NOT_FOUND", "Payment not found", 404);
      }

      return successResponse(postedPayment);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
      }

      if (error instanceof DatabaseForbiddenError) {
        return errorResponse("FORBIDDEN", "Forbidden", 403);
      }

      if (error instanceof PaymentAllocationError) {
        return errorResponse("INVALID_REQUEST", error.message, 400);
      }

      if (error instanceof PaymentVarianceConfigError) {
        return errorResponse("PAYMENT_VARIANCE_GAIN_MISSING", error.message, 409);
      }

      console.error("POST /sales/payments/:id/post failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Payment posting failed", 500);
    }
  }) as any);

  // POST /sales/payments - Process new payment
  const createPaymentRoute = createRoute({
    path: "/sales/payments",
    method: "post",
    tags: ["Sales"],
    summary: "Create sales payment",
    description: "Process a new sales payment",
    security: [{ BearerAuth: [] }],
    request: {
      body: {
        content: {
          "application/json": {
            schema: SalesPaymentCreateRequestSchema,
          },
        },
      },
    },
    responses: {
      201: {
        content: { "application/json": { schema: SalesPaymentResponseSchema } },
        description: "Payment processed successfully",
      },
      400: {
        content: { "application/json": { schema: PaymentErrorResponseSchema } },
        description: "Invalid request",
      },
      401: {
        content: { "application/json": { schema: PaymentErrorResponseSchema } },
        description: "Unauthorized",
      },
      403: {
        content: { "application/json": { schema: PaymentErrorResponseSchema } },
        description: "Forbidden",
      },
      404: {
        content: { "application/json": { schema: PaymentErrorResponseSchema } },
        description: "Resource not found",
      },
      409: {
        content: { "application/json": { schema: PaymentErrorResponseSchema } },
        description: "Conflict (e.g., numbering template not configured)",
      },
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app.openapi(createPaymentRoute, (async (c: any) => {
    const auth = c.get("auth");

    try {
      const accessResult = await requireAccess({
        module: "sales",
        permission: "create"
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
        input = SalesPaymentCreateRequestSchema.parse(payload);
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

      const payment = await getComposedPaymentService().createPayment(auth.companyId, input, {
        userId: auth.userId
      });

      return successResponse(payment, 201);
    } catch (error) {
      if (error instanceof DatabaseForbiddenError) {
        return errorResponse("FORBIDDEN", "Forbidden", 403);
      }

      if (error instanceof DatabaseReferenceError) {
        if (error.message === "Numbering template not configured") {
          return errorResponse("CONFLICT", numberingTemplateConflictMessage, 409);
        }
        return errorResponse("NOT_FOUND", "Resource not found", 404);
      }

      if (error instanceof DatabaseConflictError) {
        return errorResponse("CONFLICT", error.message, 409);
      }

      if (error instanceof PaymentAllocationError) {
        return errorResponse("INVALID_REQUEST", error.message, 400);
      }

      console.error("POST /sales/payments failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Payment processing failed", 500);
    }
  }) as any);
}

export { paymentRoutes };
