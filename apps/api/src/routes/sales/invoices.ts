// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Sales Invoice Routes
 *
 * Routes for sales invoice operations.
 * GET /sales/invoices - List invoices with filtering
 * POST /sales/invoices - Create new invoice
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
  createInvoice,
  DatabaseConflictError,
  DatabaseForbiddenError,
  DatabaseReferenceError,
  InvoiceStatusError,
  listInvoices,
  postInvoice,
  getInvoice,
  updateInvoice
} from "@/lib/sales";
import { listUserOutletIds, userHasOutletAccess } from "@/lib/auth";
import { requireAccess } from "@/lib/auth-guard";
import { getCompany } from "@/lib/companies";
import { errorResponse, successResponse } from "@/lib/response";
import type { AuthContext } from "@/lib/auth-guard";

const invoiceRoutes = new Hono();

const numberingTemplateConflictMessage =
  "No numbering template configured. Please configure document numbering in settings.";

// Helper to parse outlet_id from request body for auth guard
async function parseOutletIdFromBody(request: Request): Promise<number | null> {
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
    const company = await getCompany(auth.companyId);
    const timezone = company.timezone ?? 'UTC';

    const report = await listInvoices(auth.companyId, {
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

  // Pre-declare invoice ID for recovery in case posting fails
  let invoiceIdForRecovery = 0;

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
    const invoice = await createInvoice(auth.companyId, input, {
      userId: auth.userId
    });

    // If draft=true is specified, return DRAFT without auto-posting
    if (input.draft === true) {
      return successResponse(invoice, 201);
    }

    // Capture invoice ID for potential recovery in case posting fails
    invoiceIdForRecovery = invoice.id;

    // Attempt to post to GL to create journal entries (AC-1, AC-2, AC-3)
    // Note: If posting fails, we catch errors below and return the DRAFT invoice
    try {
      const postedInvoice = await postInvoice(auth.companyId, invoiceIdForRecovery, {
        userId: auth.userId
      });

      if (!postedInvoice) {
        throw new Error("Failed to post invoice to GL");
      }

      return successResponse(postedInvoice, 201);
    } catch (glError) {
      // If GL posting fails due to missing configuration, return the DRAFT invoice
      // This allows the system to work even without complete GL setup
      if (glError instanceof Error) {
        const errorMessage = glError.message.toLowerCase();
        if (errorMessage.includes("unbalanced_journal") || 
            errorMessage.includes("account not found") ||
            errorMessage.includes("revenue account") ||
            errorMessage.includes("receivable account") ||
            errorMessage.includes("outlet_account_mapping") ||
            errorMessage.includes("cogs posting failed")) {
          console.warn("GL posting failed, returning DRAFT invoice:", glError.message);
          return successResponse(invoice, 201);
        }
      }
      // Re-throw unexpected errors
      throw glError;
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

    // Handle GL posting errors
    if (error instanceof Error) {
      if (error.message.includes("journal") || error.message.includes("posting")) {
        console.error("GL posting failed for invoice", error);
        return errorResponse("INTERNAL_SERVER_ERROR", "GL posting failed", 500);
      }
      if (error.message.includes("debit") && error.message.includes("credit")) {
        console.error("Journal entry unbalanced", error);
        return errorResponse("INTERNAL_SERVER_ERROR", "Journal entry unbalanced", 500);
      }
      // Stock posting errors (COGS) - return the DRAFT invoice
      if (error.message.toLowerCase().includes("stock not found") || 
          error.message.toLowerCase().includes("cogs posting failed") ||
          error.message.toLowerCase().includes("outlet_account_mapping") ||
          error.message.includes("Insufficient inventory")) {
        console.warn("Stock/COGS posting failed, returning DRAFT invoice:", error.message);
        // We have the invoice ID from before posting attempts
        const draftInvoice = await getInvoice(auth.companyId, invoiceIdForRecovery);
        if (draftInvoice) {
          return successResponse(draftInvoice, 201);
        }
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

    const invoice = await getInvoice(auth.companyId, invoiceId);
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

    const updatedInvoice = await updateInvoice(auth.companyId, invoiceId, input, {
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
    const invoice = await getInvoice(auth.companyId, invoiceId);
    if (!invoice) {
      return errorResponse("NOT_FOUND", "Invoice not found", 404);
    }

    const hasAccess = await userHasOutletAccess(auth.userId, auth.companyId, invoice.outlet_id);
    if (!hasAccess) {
      return errorResponse("FORBIDDEN", "Forbidden", 403);
    }

    const postedInvoice = await postInvoice(auth.companyId, invoiceId, {
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
    }

    // Handle stock/inventory errors - these are expected when stock is not set up
    if (error instanceof Error) {
      if (error.message.toLowerCase().includes("stock not found") ||
          error.message.toLowerCase().includes("cogs posting failed") ||
          error.message.toLowerCase().includes("outlet_account_mapping") ||
          error.message.includes("Insufficient inventory")) {
        console.warn("Stock/COGS posting failed:", error.message);
        return errorResponse("CONFLICT", "Cannot post invoice: insufficient stock or missing COGS configuration", 409);
      }
    }

    console.error("POST /sales/invoices/:id/post failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Invoice posting failed", 500);
  }
});

export { invoiceRoutes };
