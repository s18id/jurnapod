// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Sales Invoice Routes
 *
 * Routes for sales invoice operations.
 * GET /sales/invoices - List invoices with filtering
 * POST /sales/invoices - Create new invoice
 * 
 * Uses modules-sales package via adapter layer.
 */

import { Hono } from "hono";
import { z } from "zod";
import { createRoute, z as zodOpenApi } from "@hono/zod-openapi";
import type { OpenAPIHono as OpenAPIHonoType } from "@hono/zod-openapi";
import {
  SalesInvoiceCreateRequestSchema,
  SalesInvoiceUpdateRequestSchema,
  SalesInvoiceListQuerySchema,
  SalesInvoiceResponseSchema,
  NumericIdSchema
} from "@jurnapod/shared";
import {
  createInvoiceService as getInvoiceService,
  type InvoiceService,
  DatabaseConflictError,
  DatabaseForbiddenError,
  DatabaseReferenceError,
  InvoiceStatusError
} from "@jurnapod/modules-sales";
import { listUserOutletIds, userHasOutletAccess } from "@/lib/auth";
import { requireAccess } from "@/lib/auth-guard";
import { errorResponse, successResponse } from "@/lib/response";
import type { AuthContext } from "@/lib/auth-guard";
import { createApiSalesDb } from "@/lib/modules-sales/sales-db";
import { getAccessScopeChecker } from "@/lib/modules-sales/access-scope-checker";
import { getCompanyService } from "@/lib/companies";

const invoiceRoutes = new Hono();

// Create invoice service instance using the adapter layer
const db = createApiSalesDb();
const accessScopeChecker = getAccessScopeChecker();
const invoiceService: InvoiceService = getInvoiceService({
  db,
  accessScopeChecker
});

const numberingTemplateConflictMessage =
  "No numbering template configured. Please configure document numbering in settings.";

// Company service for fetching company details (e.g., timezone)
const companyService = getCompanyService();

// Helper to parse outlet_id from request body for auth guard
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function _parseOutletIdFromBody(request: Request): Promise<number | null> {
  try {
    const payload = await request.clone().json();
    if (payload && typeof payload.outlet_id === "number") {
      return payload.outlet_id;
    }
    return null;
  } catch {
    return null;
  }
}

// ============================================================================
// GET /sales/invoices - List invoices with filtering
// ============================================================================

invoiceRoutes.get("/", async (c) => {
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
    const parsed = SalesInvoiceListQuerySchema.parse({
      outlet_id: url.searchParams.get("outlet_id") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
      payment_status: url.searchParams.get("payment_status") ?? undefined,
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

    const report = await invoiceService.listInvoices(auth.companyId, {
      outletIds,
      status: parsed.status,
      paymentStatus: parsed.payment_status,
      dateFrom: parsed.date_from,
      dateTo: parsed.date_to,
      limit: parsed.limit,
      offset: parsed.offset,
      timezone
    });

    return successResponse({
      total: report.total,
      invoices: report.invoices
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid request", 400);
    }

    console.error("GET /sales/invoices failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Invoices request failed", 500);
  }
});

// ============================================================================
// POST /sales/invoices - Create new invoice
// ============================================================================

invoiceRoutes.post("/", async (c) => {
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
      input = SalesInvoiceCreateRequestSchema.parse(payload);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
      }
      throw error;
    }

    // Validate outlet access before creating invoice
    const hasAccess = await userHasOutletAccess(auth.userId, auth.companyId, input.outlet_id);
    if (!hasAccess) {
      return errorResponse("FORBIDDEN", "Forbidden", 403);
    }

    // Create invoice in DRAFT status
    const invoice = await invoiceService.createInvoice(auth.companyId, input, {
      userId: auth.userId
    });

    // If draft=true is specified, return DRAFT without auto-posting
    if (input.draft === true) {
      return successResponse(invoice, 201);
    }

    // Attempt to post to GL to create journal entries (AC-1, AC-2, AC-3)
    // If posting fails for any reason (GL or COGS), return 409 - the invoice remains
    // in DRAFT status and user must fix the issue and retry
    try {
      const postedInvoice = await invoiceService.postInvoice(auth.companyId, invoice.id, {
        userId: auth.userId
      });

      if (!postedInvoice) {
        throw new Error("Failed to post invoice to GL");
      }

      return successResponse(postedInvoice, 201);
    } catch (error) {
      // Any posting failure should return 409 with the error message
      // The invoice stays in DRAFT status for user to retry after fixing issues
      if (error instanceof Error) {
        console.warn("Invoice posting failed, returning 409:", error.message);
        return errorResponse("CONFLICT", `Cannot post invoice: ${error.message}`, 409);
      }
      throw error;
    }
  } catch (error) {
    if (error instanceof DatabaseForbiddenError) {
      return errorResponse("FORBIDDEN", "Forbidden", 403);
    }

    if (error instanceof DatabaseReferenceError) {
      if (error.message === "Numbering template not configured") {
        return errorResponse("CONFLICT", numberingTemplateConflictMessage, 409);
      }
      if (error.message.includes("account not found") || error.message.includes("Account not found")) {
        return errorResponse("NOT_FOUND", "GL account not found", 404);
      }
      return errorResponse("NOT_FOUND", "Outlet not found", 404);
    }

    if (error instanceof DatabaseConflictError) {
      return errorResponse("CONFLICT", error.message, 409);
    }

    if (error instanceof InvoiceStatusError) {
      return errorResponse("CONFLICT", error.message, 409);
    }

    // Handle posting errors (already caught above, but catch here for safety)
    if (error instanceof Error) {
      if (error.message.includes("journal") || error.message.includes("posting") ||
          error.message.includes("stock") || error.message.includes("cogs") ||
          error.message.includes("Insufficient")) {
        console.error("Invoice posting failed:", error);
        return errorResponse("CONFLICT", `Cannot post invoice: ${error.message}`, 409);
      }
    }

    console.error("POST /sales/invoices failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Invoice creation failed", 500);
  }
});

// ============================================================================
// GET /sales/invoices/:id - Get invoice by ID
// ============================================================================

invoiceRoutes.get("/:id", async (c) => {
  const auth = c.get("auth") as AuthContext;

  try {
    const invoiceId = NumericIdSchema.parse(c.req.param("id"));

    const invoice = await invoiceService.getInvoice(auth.companyId, invoiceId, {
      userId: auth.userId
    });
    if (!invoice) {
      return errorResponse("NOT_FOUND", "Invoice not found", 404);
    }

    // Check outlet access
    const hasAccess = await userHasOutletAccess(auth.userId, auth.companyId, invoice.outlet_id);
    if (!hasAccess) {
      return errorResponse("FORBIDDEN", "Forbidden", 403);
    }

    return successResponse(invoice);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid invoice ID", 400);
    }

    console.error("GET /sales/invoices/:id failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Invoice request failed", 500);
  }
});

// ============================================================================
// PATCH /sales/invoices/:id - Update invoice
// ============================================================================

invoiceRoutes.patch("/:id", async (c) => {
  const auth = c.get("auth") as AuthContext;

  try {
    const invoiceId = NumericIdSchema.parse(c.req.param("id"));

    let payload: unknown;
    try {
      payload = await c.req.json();
    } catch {
      return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
    }

    // For now, use the same schema as create (simplified)
    // TODO: Create proper update schema
    const input = SalesInvoiceUpdateRequestSchema.parse(payload);

    // Validate user can access the existing invoice outlet before allowing update
    const existingInvoice = await invoiceService.getInvoice(auth.companyId, invoiceId, {
      userId: auth.userId
    });
    if (!existingInvoice) {
      return errorResponse("NOT_FOUND", "Invoice not found", 404);
    }

    const hasExistingOutletAccess = await userHasOutletAccess(
      auth.userId,
      auth.companyId,
      existingInvoice.outlet_id
    );
    if (!hasExistingOutletAccess) {
      return errorResponse("FORBIDDEN", "Forbidden", 403);
    }

    // Validate outlet access if outlet_id is being changed
    if (input.outlet_id !== undefined) {
      const hasAccess = await userHasOutletAccess(auth.userId, auth.companyId, input.outlet_id);
      if (!hasAccess) {
        return errorResponse("FORBIDDEN", "Forbidden", 403);
      }
    }

    const updatedInvoice = await invoiceService.updateInvoice(auth.companyId, invoiceId, input, {
      userId: auth.userId
    });

    if (!updatedInvoice) {
      return errorResponse("NOT_FOUND", "Invoice not found", 404);
    }

    return successResponse(updatedInvoice);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid request", 400);
    }

    if (error instanceof DatabaseForbiddenError) {
      return errorResponse("FORBIDDEN", "Forbidden", 403);
    }

    if (error instanceof InvoiceStatusError) {
      return errorResponse("CONFLICT", error.message, 409);
    }

    console.error("PATCH /sales/invoices/:id failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Invoice update failed", 500);
  }
});

// ============================================================================
// POST /sales/invoices/:id/post - Post invoice to GL
// ============================================================================

invoiceRoutes.post("/:id/post", async (c) => {
  const auth = c.get("auth") as AuthContext;

  try {
    const invoiceId = NumericIdSchema.parse(c.req.param("id"));

    // Check if invoice exists and user has access
    const invoice = await invoiceService.getInvoice(auth.companyId, invoiceId, {
      userId: auth.userId
    });
    if (!invoice) {
      return errorResponse("NOT_FOUND", "Invoice not found", 404);
    }

    const hasAccess = await userHasOutletAccess(auth.userId, auth.companyId, invoice.outlet_id);
    if (!hasAccess) {
      return errorResponse("FORBIDDEN", "Forbidden", 403);
    }

    const postedInvoice = await invoiceService.postInvoice(auth.companyId, invoiceId, {
      userId: auth.userId
    });

    if (!postedInvoice) {
      return errorResponse("NOT_FOUND", "Invoice not found", 404);
    }

    return successResponse(postedInvoice);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid invoice ID", 400);
    }

    if (error instanceof DatabaseForbiddenError) {
      return errorResponse("FORBIDDEN", "Forbidden", 403);
    }

    if (error instanceof InvoiceStatusError) {
      return errorResponse("CONFLICT", error.message, 409);
    }

    if (error instanceof DatabaseReferenceError) {
      if (error.message.includes("account not found") || error.message.includes("Account not found")) {
        return errorResponse("NOT_FOUND", "GL account not found", 404);
      }
      return errorResponse("NOT_FOUND", error.message, 404);
    }

    // Any posting failure returns 409 - the invoice stays in DRAFT status
    if (error instanceof Error) {
      console.warn("Invoice posting failed:", error.message);
      return errorResponse("CONFLICT", `Cannot post invoice: ${error.message}`, 409);
    }

    console.error("POST /sales/invoices/:id/post failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Invoice posting failed", 500);
  }
});

// ============================================================================
// OpenAPI Route Registration (for use with OpenAPIHono)
// ============================================================================

/**
 * Invoice list response schema
 */
const InvoiceListDataSchema = zodOpenApi.object({
  total: zodOpenApi.number().openapi({ description: "Total number of invoices" }),
  invoices: zodOpenApi.array(SalesInvoiceResponseSchema).openapi({ description: "List of invoices" }),
});

const InvoiceListResponseSchema = zodOpenApi
  .object({
    success: zodOpenApi.literal(true).openapi({ example: true }),
    data: InvoiceListDataSchema,
  })
  .openapi("InvoiceListResponse");

/**
 * Invoice error response schema
 */
const InvoiceErrorResponseSchema = zodOpenApi
  .object({
    success: zodOpenApi.literal(false).openapi({ example: false }),
    error: zodOpenApi
      .object({
        code: zodOpenApi.string().openapi({ description: "Error code" }),
        message: zodOpenApi.string().openapi({ description: "Human-readable error message" }),
      })
      .openapi("InvoiceErrorDetail"),
  })
  .openapi("InvoiceErrorResponse");

/**
 * Registers sales invoice routes with an OpenAPIHono instance.
 * This enables auto-generated OpenAPI specs for the invoice endpoints.
 */
export function registerSalesInvoiceRoutes(app: { openapi: OpenAPIHonoType["openapi"] }): void {
  // GET /sales/invoices - List invoices with filtering
  const listInvoicesRoute = createRoute({
    path: "/sales/invoices",
    method: "get",
    tags: ["Sales"],
    summary: "List sales invoices",
    description: "List sales invoices with optional filtering by outlet, status, payment status, and date range",
    security: [{ BearerAuth: [] }],
    request: {
      query: SalesInvoiceListQuerySchema,
    },
    responses: {
      200: {
        content: { "application/json": { schema: InvoiceListResponseSchema } },
        description: "Invoices retrieved successfully",
      },
      400: {
        content: { "application/json": { schema: InvoiceErrorResponseSchema } },
        description: "Invalid request",
      },
      401: {
        content: { "application/json": { schema: InvoiceErrorResponseSchema } },
        description: "Unauthorized",
      },
      403: {
        content: { "application/json": { schema: InvoiceErrorResponseSchema } },
        description: "Forbidden",
      },
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app.openapi(listInvoicesRoute, (async (c: any) => {
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
      const parsed = SalesInvoiceListQuerySchema.parse({
        outlet_id: url.searchParams.get("outlet_id") ?? undefined,
        status: url.searchParams.get("status") ?? undefined,
        payment_status: url.searchParams.get("payment_status") ?? undefined,
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

      const report = await invoiceService.listInvoices(auth.companyId, {
        outletIds,
        status: parsed.status,
        paymentStatus: parsed.payment_status,
        dateFrom: parsed.date_from,
        dateTo: parsed.date_to,
        limit: parsed.limit,
        offset: parsed.offset,
        timezone
      });

      return successResponse({
        total: report.total,
        invoices: report.invoices
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }

      console.error("GET /sales/invoices failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Invoices request failed", 500);
    }
  }) as any);

  // POST /sales/invoices - Create new invoice
  const createInvoiceRoute = createRoute({
    path: "/sales/invoices",
    method: "post",
    tags: ["Sales"],
    summary: "Create sales invoice",
    description: "Create a new sales invoice (optionally as draft without posting)",
    security: [{ BearerAuth: [] }],
    request: {
      body: {
        content: {
          "application/json": {
            schema: SalesInvoiceCreateRequestSchema,
          },
        },
      },
    },
    responses: {
      201: {
        content: { "application/json": { schema: SalesInvoiceResponseSchema } },
        description: "Invoice created successfully",
      },
      400: {
        content: { "application/json": { schema: InvoiceErrorResponseSchema } },
        description: "Invalid request",
      },
      401: {
        content: { "application/json": { schema: InvoiceErrorResponseSchema } },
        description: "Unauthorized",
      },
      403: {
        content: { "application/json": { schema: InvoiceErrorResponseSchema } },
        description: "Forbidden",
      },
      409: {
        content: { "application/json": { schema: InvoiceErrorResponseSchema } },
        description: "Conflict (e.g., posting failed)",
      },
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app.openapi(createInvoiceRoute, (async (c: any) => {
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
        input = SalesInvoiceCreateRequestSchema.parse(payload);
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

      const invoice = await invoiceService.createInvoice(auth.companyId, input, {
        userId: auth.userId
      });

      if (input.draft === true) {
        return successResponse(invoice, 201);
      }

      try {
        const postedInvoice = await invoiceService.postInvoice(auth.companyId, invoice.id, {
          userId: auth.userId
        });

        if (!postedInvoice) {
          throw new Error("Failed to post invoice to GL");
        }

        return successResponse(postedInvoice, 201);
      } catch (error) {
        if (error instanceof Error) {
          console.warn("Invoice posting failed, returning 409:", error.message);
          return errorResponse("CONFLICT", `Cannot post invoice: ${error.message}`, 409);
        }
        throw error;
      }
    } catch (error) {
      if (error instanceof DatabaseForbiddenError) {
        return errorResponse("FORBIDDEN", "Forbidden", 403);
      }

      if (error instanceof DatabaseReferenceError) {
        if (error.message === "Numbering template not configured") {
          return errorResponse("CONFLICT", numberingTemplateConflictMessage, 409);
        }
        if (error.message.includes("account not found") || error.message.includes("Account not found")) {
          return errorResponse("NOT_FOUND", "GL account not found", 404);
        }
        return errorResponse("NOT_FOUND", "Outlet not found", 404);
      }

      if (error instanceof DatabaseConflictError) {
        return errorResponse("CONFLICT", error.message, 409);
      }

      if (error instanceof InvoiceStatusError) {
        return errorResponse("CONFLICT", error.message, 409);
      }

      if (error instanceof Error) {
        if (error.message.includes("journal") || error.message.includes("posting") ||
            error.message.includes("stock") || error.message.includes("cogs") ||
            error.message.includes("Insufficient")) {
          console.error("Invoice posting failed:", error);
          return errorResponse("CONFLICT", `Cannot post invoice: ${error.message}`, 409);
        }
      }

      console.error("POST /sales/invoices failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Invoice creation failed", 500);
    }
  }) as any);

  // GET /sales/invoices/:id - Get invoice by ID
  const getInvoiceRoute = createRoute({
    path: "/sales/invoices/{id}",
    method: "get",
    tags: ["Sales"],
    summary: "Get invoice by ID",
    description: "Get a single sales invoice by its ID",
    security: [{ BearerAuth: [] }],
    request: {
      params: zodOpenApi.object({
        id: zodOpenApi.string().openapi({ description: "Invoice ID" }),
      }),
    },
    responses: {
      200: {
        content: { "application/json": { schema: SalesInvoiceResponseSchema } },
        description: "Invoice retrieved successfully",
      },
      400: {
        content: { "application/json": { schema: InvoiceErrorResponseSchema } },
        description: "Invalid invoice ID",
      },
      401: {
        content: { "application/json": { schema: InvoiceErrorResponseSchema } },
        description: "Unauthorized",
      },
      403: {
        content: { "application/json": { schema: InvoiceErrorResponseSchema } },
        description: "Forbidden",
      },
      404: {
        content: { "application/json": { schema: InvoiceErrorResponseSchema } },
        description: "Invoice not found",
      },
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app.openapi(getInvoiceRoute, (async (c: any) => {
    const auth = c.get("auth");

    try {
      const invoiceId = NumericIdSchema.parse(c.req.param("id"));

      const invoice = await invoiceService.getInvoice(auth.companyId, invoiceId, {
        userId: auth.userId
      });
      if (!invoice) {
        return errorResponse("NOT_FOUND", "Invoice not found", 404);
      }

      const hasAccess = await userHasOutletAccess(auth.userId, auth.companyId, invoice.outlet_id);
      if (!hasAccess) {
        return errorResponse("FORBIDDEN", "Forbidden", 403);
      }

      return successResponse(invoice);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid invoice ID", 400);
      }

      console.error("GET /sales/invoices/:id failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Invoice request failed", 500);
    }
  }) as any);

  // PATCH /sales/invoices/:id - Update invoice
  const updateInvoiceRoute = createRoute({
    path: "/sales/invoices/{id}",
    method: "patch",
    tags: ["Sales"],
    summary: "Update invoice",
    description: "Update an existing sales invoice",
    security: [{ BearerAuth: [] }],
    request: {
      params: zodOpenApi.object({
        id: zodOpenApi.string().openapi({ description: "Invoice ID" }),
      }),
      body: {
        content: {
          "application/json": {
            schema: SalesInvoiceUpdateRequestSchema,
          },
        },
      },
    },
    responses: {
      200: {
        content: { "application/json": { schema: SalesInvoiceResponseSchema } },
        description: "Invoice updated successfully",
      },
      400: {
        content: { "application/json": { schema: InvoiceErrorResponseSchema } },
        description: "Invalid request",
      },
      401: {
        content: { "application/json": { schema: InvoiceErrorResponseSchema } },
        description: "Unauthorized",
      },
      403: {
        content: { "application/json": { schema: InvoiceErrorResponseSchema } },
        description: "Forbidden",
      },
      404: {
        content: { "application/json": { schema: InvoiceErrorResponseSchema } },
        description: "Invoice not found",
      },
      409: {
        content: { "application/json": { schema: InvoiceErrorResponseSchema } },
        description: "Conflict (e.g., invoice status prevents update)",
      },
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app.openapi(updateInvoiceRoute, (async (c: any) => {
    const auth = c.get("auth");

    try {
      const invoiceId = NumericIdSchema.parse(c.req.param("id"));

      let payload: unknown;
      try {
        payload = await c.req.json();
      } catch {
        return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
      }

      const input = SalesInvoiceUpdateRequestSchema.parse(payload);

      const existingInvoice = await invoiceService.getInvoice(auth.companyId, invoiceId, {
        userId: auth.userId
      });
      if (!existingInvoice) {
        return errorResponse("NOT_FOUND", "Invoice not found", 404);
      }

      const hasExistingOutletAccess = await userHasOutletAccess(
        auth.userId,
        auth.companyId,
        existingInvoice.outlet_id
      );
      if (!hasExistingOutletAccess) {
        return errorResponse("FORBIDDEN", "Forbidden", 403);
      }

      if (input.outlet_id !== undefined) {
        const hasAccess = await userHasOutletAccess(auth.userId, auth.companyId, input.outlet_id);
        if (!hasAccess) {
          return errorResponse("FORBIDDEN", "Forbidden", 403);
        }
      }

      const updatedInvoice = await invoiceService.updateInvoice(auth.companyId, invoiceId, input, {
        userId: auth.userId
      });

      if (!updatedInvoice) {
        return errorResponse("NOT_FOUND", "Invoice not found", 404);
      }

      return successResponse(updatedInvoice);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }

      if (error instanceof DatabaseForbiddenError) {
        return errorResponse("FORBIDDEN", "Forbidden", 403);
      }

      if (error instanceof InvoiceStatusError) {
        return errorResponse("CONFLICT", error.message, 409);
      }

      console.error("PATCH /sales/invoices/:id failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Invoice update failed", 500);
    }
  }) as any);

  // POST /sales/invoices/:id/post - Post invoice to GL
  const postInvoiceRoute = createRoute({
    path: "/sales/invoices/{id}/post",
    method: "post",
    tags: ["Sales"],
    summary: "Post invoice to GL",
    description: "Post a draft invoice to the general ledger",
    security: [{ BearerAuth: [] }],
    request: {
      params: zodOpenApi.object({
        id: zodOpenApi.string().openapi({ description: "Invoice ID" }),
      }),
    },
    responses: {
      200: {
        content: { "application/json": { schema: SalesInvoiceResponseSchema } },
        description: "Invoice posted successfully",
      },
      400: {
        content: { "application/json": { schema: InvoiceErrorResponseSchema } },
        description: "Invalid invoice ID",
      },
      401: {
        content: { "application/json": { schema: InvoiceErrorResponseSchema } },
        description: "Unauthorized",
      },
      403: {
        content: { "application/json": { schema: InvoiceErrorResponseSchema } },
        description: "Forbidden",
      },
      404: {
        content: { "application/json": { schema: InvoiceErrorResponseSchema } },
        description: "Invoice not found",
      },
      409: {
        content: { "application/json": { schema: InvoiceErrorResponseSchema } },
        description: "Conflict (e.g., posting failed)",
      },
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app.openapi(postInvoiceRoute, (async (c: any) => {
    const auth = c.get("auth");

    try {
      const invoiceId = NumericIdSchema.parse(c.req.param("id"));

      const invoice = await invoiceService.getInvoice(auth.companyId, invoiceId, {
        userId: auth.userId
      });
      if (!invoice) {
        return errorResponse("NOT_FOUND", "Invoice not found", 404);
      }

      const hasAccess = await userHasOutletAccess(auth.userId, auth.companyId, invoice.outlet_id);
      if (!hasAccess) {
        return errorResponse("FORBIDDEN", "Forbidden", 403);
      }

      const postedInvoice = await invoiceService.postInvoice(auth.companyId, invoiceId, {
        userId: auth.userId
      });

      if (!postedInvoice) {
        return errorResponse("NOT_FOUND", "Invoice not found", 404);
      }

      return successResponse(postedInvoice);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid invoice ID", 400);
      }

      if (error instanceof DatabaseForbiddenError) {
        return errorResponse("FORBIDDEN", "Forbidden", 403);
      }

      if (error instanceof InvoiceStatusError) {
        return errorResponse("CONFLICT", error.message, 409);
      }

      if (error instanceof DatabaseReferenceError) {
        if (error.message.includes("account not found") || error.message.includes("Account not found")) {
          return errorResponse("NOT_FOUND", "GL account not found", 404);
        }
        return errorResponse("NOT_FOUND", error.message, 404);
      }

      if (error instanceof Error) {
        console.warn("Invoice posting failed:", error.message);
        return errorResponse("CONFLICT", `Cannot post invoice: ${error.message}`, 409);
      }

      console.error("POST /sales/invoices/:id/post failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Invoice posting failed", 500);
    }
  }) as any);
}

export { invoiceRoutes };
