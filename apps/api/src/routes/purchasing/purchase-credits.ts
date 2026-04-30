// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Purchase Credit Routes
 *
 * Thin route adapters for purchase credits under purchasing module:
 * - GET /purchasing/credits - List purchase credits with filters
 * - GET /purchasing/credits/:id - Get purchase credit by ID
 * - POST /purchasing/credits - Create purchase credit draft
 * - POST /purchasing/credits/:id/apply - Apply/post purchase credit
 * - POST /purchasing/credits/:id/void - Void applied purchase credit
 *
 * Required ACL: purchasing.credits resource with READ/CREATE/UPDATE permissions
 */

import { Hono } from "hono";
import { z } from "zod";
import {
  PurchaseCreditCreateSchema,
  PurchaseCreditListQuerySchema,
  NumericIdSchema,
  toPurchaseCreditStatusCode,
} from "@jurnapod/shared";
import { requireAccess, authenticateRequest, type AuthContext } from "../../lib/auth-guard.js";
import { errorResponse, successResponse } from "../../lib/response.js";
import {
  createDraftPurchaseCredit,
  listPurchaseCredits,
  getPurchaseCreditById,
  applyPurchaseCredit,
  voidPurchaseCredit,
  PurchaseCreditError,
  PurchaseCreditNotFoundError,
  PurchaseCreditInvalidStatusTransitionError,
  PurchaseCreditInvoiceNotFoundError,
  PurchaseCreditInvoiceNotPostedError,
  PurchaseCreditInvoiceSupplierMismatchError,
  PurchaseCreditSupplierInactiveError,
  PurchaseCreditNoApplicableInvoiceError,
  PurchaseCreditMissingAPAccountError,
  PurchaseCreditMissingExpenseAccountError,
  PurchaseCreditInvalidAPAccountTypeError,
  PurchaseCreditInvalidExpenseAccountTypeError,
} from "../../lib/purchasing/purchase-credit.js";
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

const creditRoutes = new Hono();

creditRoutes.use("/*", async (c, next) => {
  const authResult = await authenticateRequest(c.req.raw);
  if (!authResult.success) {
    c.status(401);
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Missing or invalid access token" } });
  }
  c.set("auth", authResult.auth);
  await next();
});

creditRoutes.get("/", async (c) => {
  try {
    const auth = c.get("auth");

    const accessResult = await requireAccess({
      module: "purchasing",
      resource: "credits",
      permission: "read",
    })(c.req.raw, auth);

    if (accessResult !== null) {
      return accessResult;
    }

    const url = new URL(c.req.raw.url);
    let query;
    try {
      query = PurchaseCreditListQuerySchema.parse({
        supplier_id: url.searchParams.get("supplier_id") ? Number(url.searchParams.get("supplier_id")) : undefined,
        status: url.searchParams.get("status") ?? undefined,
        date_from: url.searchParams.get("date_from") ?? undefined,
        date_to: url.searchParams.get("date_to") ?? undefined,
        limit: url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : 20,
        offset: url.searchParams.get("offset") ? Number(url.searchParams.get("offset")) : 0,
      });
    } catch (e) {
      if (e instanceof z.ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid query parameters", 400);
      }
      throw e;
    }

    const statusCode = query.status !== undefined ? toPurchaseCreditStatusCode(query.status) : undefined;
    if (query.status !== undefined && statusCode === undefined) {
      return errorResponse("INVALID_REQUEST", "Invalid status parameter", 400);
    }

    const result = await listPurchaseCredits({
      companyId: auth.companyId,
      supplierId: query.supplier_id,
      status: statusCode,
      dateFrom: query.date_from ? new Date(query.date_from) : undefined,
      dateTo: query.date_to ? new Date(query.date_to) : undefined,
      limit: query.limit,
      offset: query.offset,
    });

    return successResponse(result);
  } catch (error) {
    console.error("GET /purchasing/credits failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to fetch purchase credits", 500);
  }
});

creditRoutes.get("/:id", async (c) => {
  try {
    const auth = c.get("auth");

    const accessResult = await requireAccess({
      module: "purchasing",
      resource: "credits",
      permission: "read",
    })(c.req.raw, auth);

    if (accessResult !== null) {
      return accessResult;
    }

    const creditId = NumericIdSchema.parse(c.req.param("id"));
    const credit = await getPurchaseCreditById(auth.companyId, creditId);

    if (!credit) {
      return errorResponse("NOT_FOUND", "Purchase credit not found", 404);
    }

    return successResponse(credit);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid purchase credit ID", 400);
    }
    console.error("GET /purchasing/credits/:id failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to fetch purchase credit", 500);
  }
});

creditRoutes.post("/", async (c) => {
  try {
    const auth = c.get("auth");

    const accessResult = await requireAccess({
      module: "purchasing",
      resource: "credits",
      permission: "create",
    })(c.req.raw, auth);

    if (accessResult !== null) {
      return accessResult;
    }

    let input: z.infer<typeof PurchaseCreditCreateSchema>;

    try {
      const payload = await c.req.json();
      input = PurchaseCreditCreateSchema.parse(payload);
    } catch (e) {
      if (e instanceof z.ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
      }
      return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
    }

    // FIX(47.5-WP-C): Pass override_reason directly to service — no eager ACL check here.
    const result = await createDraftPurchaseCredit(auth.companyId, auth.userId, {
      idempotencyKey: input.idempotency_key ?? null,
      supplierId: input.supplier_id,
      creditNo: input.credit_no,
      creditDate: new Date(input.credit_date),
      description: input.description ?? null,
      lines: input.lines.map((line) => ({
        purchaseInvoiceId: line.purchase_invoice_id ?? null,
        purchaseInvoiceLineId: line.purchase_invoice_line_id ?? null,
        itemId: line.item_id ?? null,
        description: line.description ?? null,
        qty: line.qty,
        unitPrice: line.unit_price,
        reason: line.reason ?? null,
      })),
      overrideReason: input.override_reason ?? null,
    }, auth);

    return successResponse(result, 201);
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
    if (error instanceof PurchaseCreditInvoiceNotFoundError) {
      return errorResponse("INVOICE_NOT_FOUND", error.message, 404);
    }
    if (error instanceof PurchaseCreditInvoiceSupplierMismatchError) {
      return errorResponse("INVOICE_SUPPLIER_MISMATCH", error.message, 400);
    }
    if (error instanceof PurchaseCreditSupplierInactiveError) {
      return errorResponse("SUPPLIER_INACTIVE", error.message, 400);
    }
    console.error("POST /purchasing/credits failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to create purchase credit", 500);
  }
});

creditRoutes.post("/:id/apply", async (c) => {
  try {
    const auth = c.get("auth");

    const accessResult = await requireAccess({
      module: "purchasing",
      resource: "credits",
      permission: "update",
    })(c.req.raw, auth);

    if (accessResult !== null) {
      return accessResult;
    }

    const creditId = NumericIdSchema.parse(c.req.param("id"));

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

    const result = await applyPurchaseCredit(auth.companyId, auth.userId, creditId, overrideReason, auth);
    return successResponse(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid purchase credit ID", 400);
    }
    if (error instanceof PurchaseCreditNotFoundError) {
      return errorResponse("NOT_FOUND", error.message, 404);
    }
    if (error instanceof PurchaseCreditInvalidStatusTransitionError) {
      return errorResponse("INVALID_STATUS_TRANSITION", error.message, 400);
    }
    if (error instanceof PeriodOverrideReasonInvalidError) {
      return errorResponse("INVALID_REQUEST", error.message, 400);
    }
    if (error instanceof PeriodOverrideForbiddenError) {
      return errorResponse("FORBIDDEN", error.message, 403);
    }
    if (error instanceof PurchaseCreditInvoiceNotFoundError) {
      return errorResponse("INVOICE_NOT_FOUND", error.message, 404);
    }
    if (error instanceof PurchaseCreditInvoiceNotPostedError) {
      return errorResponse("INVOICE_NOT_POSTED", error.message, 400);
    }
    if (error instanceof PurchaseCreditInvoiceSupplierMismatchError) {
      return errorResponse("INVOICE_SUPPLIER_MISMATCH", error.message, 400);
    }
    if (error instanceof PurchaseCreditSupplierInactiveError) {
      return errorResponse("SUPPLIER_INACTIVE", error.message, 400);
    }
    if (error instanceof PurchaseCreditNoApplicableInvoiceError) {
      return errorResponse("NO_APPLICABLE_INVOICE", error.message, 400);
    }
    if (error instanceof PurchaseCreditMissingAPAccountError) {
      return errorResponse("AP_ACCOUNT_NOT_CONFIGURED", error.message, 400);
    }
    if (error instanceof PurchaseCreditMissingExpenseAccountError) {
      return errorResponse("EXPENSE_ACCOUNT_NOT_CONFIGURED", error.message, 400);
    }
    if (error instanceof PurchaseCreditInvalidAPAccountTypeError) {
      return errorResponse("AP_ACCOUNT_INVALID_TYPE", error.message, 400);
    }
    if (error instanceof PurchaseCreditInvalidExpenseAccountTypeError) {
      return errorResponse("EXPENSE_ACCOUNT_INVALID_TYPE", error.message, 400);
    }
    if (error instanceof PurchaseCreditError && error.code === "JOURNAL_NOT_BALANCED") {
      return errorResponse("JOURNAL_NOT_BALANCED", error.message, 400);
    }
    // FIX(47.5-WP-C): Handle period-close guardrail block response (strict mode → 409)
    if (typeof error === "object" && error !== null && "code" in error) {
      const err = error as { code: string; message?: string };
      if (err.code === "PERIOD_CLOSED") {
        return errorResponse("PERIOD_CLOSED", err.message ?? "Period is closed for AP transactions", 409);
      }
    }
    console.error("POST /purchasing/credits/:id/apply failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to apply purchase credit", 500);
  }
});

creditRoutes.post("/:id/void", async (c) => {
  try {
    const auth = c.get("auth");

    const accessResult = await requireAccess({
      module: "purchasing",
      resource: "credits",
      permission: "update",
    })(c.req.raw, auth);

    if (accessResult !== null) {
      return accessResult;
    }

    const creditId = NumericIdSchema.parse(c.req.param("id"));

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

    const result = await voidPurchaseCredit(auth.companyId, auth.userId, creditId, overrideReason, auth);
    return successResponse(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid purchase credit ID", 400);
    }
    if (error instanceof PurchaseCreditNotFoundError) {
      return errorResponse("NOT_FOUND", error.message, 404);
    }
    if (error instanceof PurchaseCreditInvalidStatusTransitionError) {
      return errorResponse("INVALID_STATUS_TRANSITION", error.message, 400);
    }
    if (error instanceof PeriodOverrideReasonInvalidError) {
      return errorResponse("INVALID_REQUEST", error.message, 400);
    }
    if (error instanceof PeriodOverrideForbiddenError) {
      return errorResponse("FORBIDDEN", error.message, 403);
    }
    if (error instanceof PurchaseCreditSupplierInactiveError) {
      return errorResponse("SUPPLIER_INACTIVE", error.message, 400);
    }
    if (error instanceof PurchaseCreditError && error.code === "MISSING_JOURNAL_BATCH") {
      return errorResponse("MISSING_JOURNAL_BATCH", error.message, 400);
    }
    // FIX(47.5-WP-C): Handle period-close guardrail block response (strict mode → 409)
    if (typeof error === "object" && error !== null && "code" in error) {
      const err = error as { code: string; message?: string };
      if (err.code === "PERIOD_CLOSED") {
        return errorResponse("PERIOD_CLOSED", err.message ?? "Period is closed for AP transactions", 409);
      }
    }
    console.error("POST /purchasing/credits/:id/void failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to void purchase credit", 500);
  }
});

export { creditRoutes };
