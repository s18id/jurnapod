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
import {
  SalesInvoiceCreateRequestSchema,
  SalesInvoiceUpdateRequestSchema,
  SalesInvoiceListQuerySchema,
  NumericIdSchema
} from "@jurnapod/shared";
import {
  createInvoiceService,
  type InvoiceService,
  DatabaseConflictError,
  DatabaseForbiddenError,
  DatabaseReferenceError,
  InvoiceStatusError
} from "@jurnapod/modules-sales";
import { CompanyService } from "@jurnapod/modules-platform";
import { listUserOutletIds, userHasOutletAccess } from "@/lib/auth";
import { requireAccess } from "@/lib/auth-guard";
import { getDb } from "@/lib/db";
import { errorResponse, successResponse } from "@/lib/response";
import type { AuthContext } from "@/lib/auth-guard";
import { createApiSalesDb } from "@/lib/modules-sales/sales-db";
import { getAccessScopeChecker } from "@/lib/modules-sales/access-scope-checker";

const invoiceRoutes = new Hono();

// Create invoice service instance using the adapter layer
const db = createApiSalesDb();
const accessScopeChecker = getAccessScopeChecker();
const invoiceService: InvoiceService = createInvoiceService({
  db,
  accessScopeChecker
});

const numberingTemplateConflictMessage =
  "No numbering template configured. Please configure document numbering in settings.";

// Company service for fetching company details (e.g., timezone)
const companyService = new CompanyService(getDb());

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

export { invoiceRoutes };
