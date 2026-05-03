// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Purchase Invoice Routes
 *
 * Routes for purchase invoice management under purchasing module:
 * - GET /purchasing/invoices - List purchase invoices with filters
 * - GET /purchasing/invoices/:id - Get purchase invoice by ID
 * - POST /purchasing/invoices - Create new purchase invoice (draft)
 * - POST /purchasing/invoices/:id/post - Post a draft PI (creates journal)
 * - POST /purchasing/invoices/:id/void - Void a posted PI (reverses journal)
 *
 * Required ACL: purchasing.invoices resource with READ/CREATE/UPDATE permissions
 */

import { Hono } from "hono";
import { z } from "zod";
import {
  PurchaseInvoiceCreateSchema,
  NumericIdSchema,
  UtcIsoSchema,
} from "@jurnapod/shared";
import { requireAccess, authenticateRequest, type AuthContext } from "../../lib/auth-guard.js";
import { errorResponse, successResponse } from "../../lib/response.js";
import {
  createDraftPI,
  listPIs,
  getPIById,
  postPI,
  voidPI,
  PIError,
  PINotFoundError,
  PIInvalidStatusTransitionError,
} from "../../lib/purchasing/purchase-invoice.js";
// FIX(47.5-WP-C): Import period-close guardrail errors for route error mapping
import {
  PeriodOverrideReasonInvalidError,
  PeriodOverrideForbiddenError,
} from "../../lib/accounting/ap-period-close-guardrail.js";

declare module "hono" {
  interface ContextVariableMap {
    auth: AuthContext;
  }
}

// =============================================================================
// Purchase Invoice Routes
// =============================================================================

const invoiceRoutes = new Hono();

// Auth middleware
invoiceRoutes.use("/*", async (c, next) => {
  const authResult = await authenticateRequest(c.req.raw);
  if (!authResult.success) {
    c.status(401);
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Missing or invalid access token" } });
  }
  c.set("auth", authResult.auth);
  await next();
});

// GET /purchasing/invoices - List purchase invoices
invoiceRoutes.get("/", async (c) => {
  try {
    const auth = c.get("auth");

    const accessResult = await requireAccess({
      module: "purchasing",
      resource: "invoices",
      permission: "read"
    })(c.req.raw, auth);

    if (accessResult !== null) {
      return accessResult;
    }

    const url = new URL(c.req.raw.url);
    const rawDateFrom = UtcIsoSchema.optional().parse(url.searchParams.get("date_from") ?? undefined);
    const rawDateTo = UtcIsoSchema.optional().parse(url.searchParams.get("date_to") ?? undefined);
    const queryParams = {
      supplierId: url.searchParams.get("supplier_id") ? Number(url.searchParams.get("supplier_id")) : undefined,
      status: url.searchParams.get("status") ? Number(url.searchParams.get("status")) : undefined,
      dateFrom: rawDateFrom ? new Date(rawDateFrom) : undefined,
      dateTo: rawDateTo ? new Date(rawDateTo) : undefined,
      limit: url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : 20,
      offset: url.searchParams.get("offset") ? Number(url.searchParams.get("offset")) : 0
    };

    const result = await listPIs({
      companyId: auth.companyId,
      supplierId: queryParams.supplierId,
      status: queryParams.status,
      dateFrom: queryParams.dateFrom,
      dateTo: queryParams.dateTo,
      limit: queryParams.limit,
      offset: queryParams.offset,
    });

    return successResponse(result);
  } catch (error) {
    console.error("GET /purchasing/invoices failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to fetch purchase invoices", 500);
  }
});

// GET /purchasing/invoices/:id - Get purchase invoice by ID
invoiceRoutes.get("/:id", async (c) => {
  try {
    const auth = c.get("auth");

    const accessResult = await requireAccess({
      module: "purchasing",
      resource: "invoices",
      permission: "read"
    })(c.req.raw, auth);

    if (accessResult !== null) {
      return accessResult;
    }

    const invoiceId = NumericIdSchema.parse(c.req.param("id"));

    const pi = await getPIById(auth.companyId, invoiceId);

    if (!pi) {
      return errorResponse("NOT_FOUND", "Purchase invoice not found", 404);
    }

    return successResponse(pi);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid purchase invoice ID", 400);
    }
    console.error("GET /purchasing/invoices/:id failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to fetch purchase invoice", 500);
  }
});

// POST /purchasing/invoices - Create new purchase invoice (draft)
// FIX(47.5-WP-C): Removed eager route-level ACL check — service layer handles override evaluation
invoiceRoutes.post("/", async (c) => {
  try {
    const auth = c.get("auth");

    const accessResult = await requireAccess({
      module: "purchasing",
      resource: "invoices",
      permission: "create"
    })(c.req.raw, auth);

    if (accessResult !== null) {
      return accessResult;
    }

    let input: z.infer<typeof PurchaseInvoiceCreateSchema> | undefined;

    try {
      const payload = await c.req.json();
      input = PurchaseInvoiceCreateSchema.parse(payload);
    } catch (e) {
      if (e instanceof z.ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
      }
      return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
    }

    // FIX(47.5-WP-C): Pass override_reason directly to service — no eager ACL check here.
    // Service evaluates period status first; if open, no MANAGE permission needed.
    // If closed+override_required, service validates reason length (→400) and MANAGE (→403).
    const pi = await createDraftPI(auth.companyId, auth.userId, {
      idempotencyKey: input.idempotency_key ?? null,
      supplierId: input.supplier_id,
      invoiceNo: input.invoice_no,
      invoiceDate: input.invoice_date,
      dueDate: input.due_date ?? null,
      referenceNumber: input.reference_number ?? null,
      currencyCode: input.currency_code ?? "IDR",
      exchangeRate: input.exchange_rate ?? "1.00000000",
      notes: input.notes ?? null,
      lines: input.lines.map((line) => ({
        itemId: line.item_id ?? null,
        description: line.description,
        qty: line.qty,
        unitPrice: line.unit_price,
        taxRateId: line.tax_rate_id ?? null,
        lineType: line.line_type ?? "ITEM",
      })),
      overrideReason: input.override_reason ?? null,
    }, auth);

    return successResponse(pi, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
    }
    if (error instanceof SyntaxError) {
      return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
    }
    if (error instanceof PeriodOverrideReasonInvalidError) {
      return errorResponse("INVALID_REQUEST", error.message, 400);
    }
    if (error instanceof PeriodOverrideForbiddenError) {
      return errorResponse("FORBIDDEN", error.message, 403);
    }
    if (typeof error === "object" && error !== null && "code" in error) {
      const err = error as { code: string; message?: string };
      if (err.code === "SUPPLIER_NOT_FOUND") {
        return errorResponse("NOT_FOUND", err.message ?? "Supplier not found", 404);
      }
      // FIX(47.5-WP-C): Handle period-close guardrail block response (strict mode → 409)
      if (err.code === "PERIOD_CLOSED") {
        return errorResponse("PERIOD_CLOSED", err.message ?? "Period is closed for AP transactions", 409);
      }
    }
    console.error("POST /purchasing/invoices failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to create purchase invoice", 500);
  }
});

// POST /purchasing/invoices/:id/post - Post a draft PI (creates journal)
// FIX(47.5-WP-C): Added period-close guardrail integration with override_reason support
invoiceRoutes.post("/:id/post", async (c) => {
  try {
    const auth = c.get("auth");

    const accessResult = await requireAccess({
      module: "purchasing",
      resource: "invoices",
      permission: "update"
    })(c.req.raw, auth);

    if (accessResult !== null) {
      return accessResult;
    }

    const invoiceId = NumericIdSchema.parse(c.req.param("id"));

    // FIX(47.5-WP-C): Pass override_reason directly to service — no eager ACL check.
    let overrideReason: string | null = null;
    try {
      const body = await c.req.json().catch(() => ({}));
      if (body.override_reason !== undefined && body.override_reason !== null) {
        overrideReason = String(body.override_reason).trim() || null;
      }
    } catch {
      // Ignore parse errors — override is optional
    }

    const result = await postPI(auth.companyId, auth.userId, invoiceId, overrideReason, auth);

    return successResponse(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid purchase invoice ID", 400);
    }
    if (error instanceof PINotFoundError) {
      return errorResponse("NOT_FOUND", error.message, 404);
    }
    if (error instanceof PIInvalidStatusTransitionError) {
      return errorResponse("INVALID_STATUS_TRANSITION", error.message, 400);
    }
    if (error instanceof PeriodOverrideReasonInvalidError) {
      return errorResponse("INVALID_REQUEST", error.message, 400);
    }
    if (error instanceof PeriodOverrideForbiddenError) {
      return errorResponse("FORBIDDEN", error.message, 403);
    }
    if (typeof error === "object" && error !== null && "code" in error) {
      const err = error as { code: string; message?: string };
      if (err.code === "COMPANY_NOT_FOUND") {
        return errorResponse("NOT_FOUND", err.message ?? "Company not found", 404);
      }
      // FIX(47.5-WP-C): Handle period-close guardrail block response (strict mode → 409)
      if (err.code === "PERIOD_CLOSED") {
        return errorResponse("PERIOD_CLOSED", err.message ?? "Period is closed for AP transactions", 409);
      }
    }
    if (error instanceof PIError) {
      if (error.code === "EXCHANGE_RATE_MISSING") {
        return errorResponse("EXCHANGE_RATE_MISSING", error.message, 400);
      }
      if (error.code === "ACCOUNT_MISSING") {
        return errorResponse("ACCOUNT_MISSING", error.message, 400);
      }
      if (error.code === "TAX_ACCOUNT_MISSING") {
        return errorResponse("TAX_ACCOUNT_MISSING", error.message, 400);
      }
      if (error.code === "CREDIT_LIMIT_EXCEEDED") {
        return errorResponse("CREDIT_LIMIT_EXCEEDED", error.message, 400);
      }
      if (error.code === "JOURNAL_NOT_BALANCED") {
        return errorResponse("JOURNAL_NOT_BALANCED", error.message, 400);
      }
      return errorResponse(error.code, error.message, 400);
    }
    console.error("POST /purchasing/invoices/:id/post failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to post purchase invoice", 500);
  }
});

// POST /purchasing/invoices/:id/void - Void a posted PI (reverses journal)
// FIX(47.5-WP-C): Added period-close guardrail integration with override_reason support
invoiceRoutes.post("/:id/void", async (c) => {
  try {
    const auth = c.get("auth");

    const accessResult = await requireAccess({
      module: "purchasing",
      resource: "invoices",
      permission: "update"
    })(c.req.raw, auth);

    if (accessResult !== null) {
      return accessResult;
    }

    const invoiceId = NumericIdSchema.parse(c.req.param("id"));

    // FIX(47.5-WP-C): Pass override_reason directly to service — no eager ACL check.
    let overrideReason: string | null = null;
    try {
      const body = await c.req.json().catch(() => ({}));
      if (body.override_reason !== undefined && body.override_reason !== null) {
        overrideReason = String(body.override_reason).trim() || null;
      }
    } catch {
      // Ignore parse errors — override is optional
    }

    const result = await voidPI(auth.companyId, auth.userId, invoiceId, overrideReason, auth);

    return successResponse(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid purchase invoice ID", 400);
    }
    if (error instanceof PINotFoundError) {
      return errorResponse("NOT_FOUND", error.message, 404);
    }
    if (error instanceof PIInvalidStatusTransitionError) {
      return errorResponse("INVALID_STATUS_TRANSITION", error.message, 400);
    }
    if (error instanceof PeriodOverrideReasonInvalidError) {
      return errorResponse("INVALID_REQUEST", error.message, 400);
    }
    if (error instanceof PeriodOverrideForbiddenError) {
      return errorResponse("FORBIDDEN", error.message, 403);
    }
    if (error instanceof PIError && error.code === "MISSING_JOURNAL_BATCH") {
      return errorResponse("MISSING_JOURNAL_BATCH", error.message, 400);
    }
    // FIX(47.5-WP-C): Handle period-close guardrail block response (strict mode → 409)
    if (typeof error === "object" && error !== null && "code" in error) {
      const err = error as { code: string; message?: string };
      if (err.code === "PERIOD_CLOSED") {
        return errorResponse("PERIOD_CLOSED", err.message ?? "Period is closed for AP transactions", 409);
      }
    }
    console.error("POST /purchasing/invoices/:id/void failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to void purchase invoice", 500);
  }
});

export { invoiceRoutes };
