// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * AP Payment Routes
 *
 * Thin route adapters for AP payment management under purchasing module:
 * - GET /purchasing/payments - List AP payments with filters
 * - GET /purchasing/payments/:id - Get AP payment by ID
 * - POST /purchasing/payments - Create new AP payment (draft)
 * - POST /purchasing/payments/:id/post - Post a draft payment (creates journal)
 * - POST /purchasing/payments/:id/void - Void a posted payment (reverses journal)
 *
 * Required ACL: purchasing.payments resource with READ/CREATE/UPDATE permissions
 */

import { Hono } from "hono";
import { z } from "zod";
import {
  ApPaymentCreateSchema,
  ApPaymentListQuerySchema,
  NumericIdSchema,
  toApPaymentStatusCode,
} from "@jurnapod/shared";
import { requireAccess, authenticateRequest, type AuthContext } from "../../lib/auth-guard.js";
import { errorResponse, successResponse } from "../../lib/response.js";
import {
  createDraftAPPayment,
  listAPPayments,
  getAPPaymentById,
  postAPPayment,
  voidAPPayment,
  APPaymentError,
  APPaymentNotFoundError,
  APPaymentInvalidStatusTransitionError,
  APPaymentOverpaymentError,
  APPaymentBankAccountNotFoundError,
  APPaymentInvoiceNotFoundError,
  APPaymentInvoiceNotPostedError,
  APPaymentInvoiceSupplierMismatchError,
  APPaymentSupplierInactiveError,
  APPaymentMissingAPAccountError,
  APPaymentInvalidAPAccountTypeError,
} from "../../lib/purchasing/ap-payment.js";
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
// AP Payment Routes
// =============================================================================

const paymentRoutes = new Hono();

// Auth middleware
paymentRoutes.use("/*", async (c, next) => {
  const authResult = await authenticateRequest(c.req.raw);
  if (!authResult.success) {
    c.status(401);
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Missing or invalid access token" } });
  }
  c.set("auth", authResult.auth);
  await next();
});

// GET /purchasing/payments - List AP payments
paymentRoutes.get("/", async (c) => {
  try {
    const auth = c.get("auth");

    const accessResult = await requireAccess({
      module: "purchasing",
      resource: "payments",
      permission: "read"
    })(c.req.raw, auth);

    if (accessResult !== null) {
      return accessResult;
    }

    const url = new URL(c.req.raw.url);
    const rawQuery = {
      supplier_id: url.searchParams.get("supplier_id"),
      status: url.searchParams.get("status"),
      date_from: url.searchParams.get("date_from"),
      date_to: url.searchParams.get("date_to"),
      limit: url.searchParams.get("limit"),
      offset: url.searchParams.get("offset"),
    };

    let query;
    try {
      query = ApPaymentListQuerySchema.parse({
        supplier_id: rawQuery.supplier_id ? Number(rawQuery.supplier_id) : undefined,
        status: rawQuery.status ?? undefined,
        date_from: rawQuery.date_from ?? undefined,
        date_to: rawQuery.date_to ?? undefined,
        limit: rawQuery.limit ? Number(rawQuery.limit) : 20,
        offset: rawQuery.offset ? Number(rawQuery.offset) : 0,
      });
    } catch (e) {
      if (e instanceof z.ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid query parameters", 400);
      }
      throw e;
    }

    const statusCode = query.status !== undefined ? toApPaymentStatusCode(query.status) : undefined;
    if (query.status !== undefined && statusCode === undefined) {
      return errorResponse("INVALID_REQUEST", "Invalid status parameter", 400);
    }

    const result = await listAPPayments({
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
    console.error("GET /purchasing/payments failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to fetch AP payments", 500);
  }
});

// GET /purchasing/payments/:id - Get AP payment by ID
paymentRoutes.get("/:id", async (c) => {
  try {
    const auth = c.get("auth");

    const accessResult = await requireAccess({
      module: "purchasing",
      resource: "payments",
      permission: "read"
    })(c.req.raw, auth);

    if (accessResult !== null) {
      return accessResult;
    }

    const paymentId = NumericIdSchema.parse(c.req.param("id"));

    const payment = await getAPPaymentById(auth.companyId, paymentId);

    if (!payment) {
      return errorResponse("NOT_FOUND", "AP payment not found", 404);
    }

    return successResponse(payment);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid payment ID", 400);
    }
    console.error("GET /purchasing/payments/:id failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to fetch AP payment", 500);
  }
});

// POST /purchasing/payments - Create new AP payment (draft)
// FIX(47.5-WP-C): Removed eager route-level ACL check — service layer handles override evaluation
paymentRoutes.post("/", async (c) => {
  try {
    const auth = c.get("auth");

    const accessResult = await requireAccess({
      module: "purchasing",
      resource: "payments",
      permission: "create"
    })(c.req.raw, auth);

    if (accessResult !== null) {
      return accessResult;
    }

    let input: z.infer<typeof ApPaymentCreateSchema> | undefined;

    try {
      const payload = await c.req.json();
      input = ApPaymentCreateSchema.parse(payload);
    } catch (e) {
      if (e instanceof z.ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
      }
      return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
    }

    // FIX(47.5-WP-C): Pass override_reason directly to service — no eager ACL check here.
    const payment = await createDraftAPPayment(auth.companyId, auth.userId, {
      paymentDate: new Date(input.payment_date),
      bankAccountId: input.bank_account_id,
      supplierId: input.supplier_id,
      description: input.description ?? null,
      lines: input.lines.map((line) => ({
        purchaseInvoiceId: line.purchase_invoice_id,
        allocationAmount: line.allocation_amount,
        description: line.description ?? null,
      })),
      overrideReason: input.override_reason ?? null,
    }, auth);

    return successResponse(payment, 201);
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
      if (err.code === "BANK_ACCOUNT_NOT_FOUND") {
        return errorResponse("BANK_ACCOUNT_NOT_FOUND", err.message ?? "Bank account not found", 400);
      }
      // FIX(47.5-WP-C): Handle period-close guardrail block response (strict mode → 409)
      if (err.code === "PERIOD_CLOSED") {
        return errorResponse("PERIOD_CLOSED", err.message ?? "Period is closed for AP transactions", 409);
      }
    }
    if (error instanceof APPaymentOverpaymentError) {
      return errorResponse("OVERPAYMENT", error.message, 400);
    }
    if (error instanceof APPaymentInvoiceNotFoundError) {
      return errorResponse("INVOICE_NOT_FOUND", error.message, 404);
    }
    if (error instanceof APPaymentInvoiceNotPostedError) {
      return errorResponse("INVOICE_NOT_POSTED", error.message, 400);
    }
    if (error instanceof APPaymentInvoiceSupplierMismatchError) {
      return errorResponse("INVOICE_SUPPLIER_MISMATCH", error.message, 400);
    }
    if (error instanceof APPaymentSupplierInactiveError) {
      return errorResponse("SUPPLIER_INACTIVE", error.message, 400);
    }
    console.error("POST /purchasing/payments failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to create AP payment", 500);
  }
});

// POST /purchasing/payments/:id/post - Post a draft payment (creates journal)
// FIX(47.5-WP-C): Added period-close guardrail integration with override_reason support
paymentRoutes.post("/:id/post", async (c) => {
  try {
    const auth = c.get("auth");

    const accessResult = await requireAccess({
      module: "purchasing",
      resource: "payments",
      permission: "update"
    })(c.req.raw, auth);

    if (accessResult !== null) {
      return accessResult;
    }

    const paymentId = NumericIdSchema.parse(c.req.param("id"));

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

    const result = await postAPPayment(auth.companyId, auth.userId, paymentId, overrideReason, auth);

    return successResponse(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid payment ID", 400);
    }
    if (error instanceof APPaymentNotFoundError) {
      return errorResponse("NOT_FOUND", error.message, 404);
    }
    if (error instanceof APPaymentInvalidStatusTransitionError) {
      return errorResponse("INVALID_STATUS_TRANSITION", error.message, 400);
    }
    if (error instanceof PeriodOverrideReasonInvalidError) {
      return errorResponse("INVALID_REQUEST", error.message, 400);
    }
    if (error instanceof PeriodOverrideForbiddenError) {
      return errorResponse("FORBIDDEN", error.message, 403);
    }
    if (error instanceof APPaymentOverpaymentError) {
      return errorResponse("OVERPAYMENT", error.message, 400);
    }
    if (error instanceof APPaymentBankAccountNotFoundError) {
      return errorResponse("BANK_ACCOUNT_NOT_FOUND", error.message, 400);
    }
    if (error instanceof APPaymentInvoiceNotFoundError) {
      return errorResponse("INVOICE_NOT_FOUND", error.message, 404);
    }
    if (error instanceof APPaymentInvoiceNotPostedError) {
      return errorResponse("INVOICE_NOT_POSTED", error.message, 400);
    }
    if (error instanceof APPaymentInvoiceSupplierMismatchError) {
      return errorResponse("INVOICE_SUPPLIER_MISMATCH", error.message, 400);
    }
    if (error instanceof APPaymentSupplierInactiveError) {
      return errorResponse("SUPPLIER_INACTIVE", error.message, 400);
    }
    if (error instanceof APPaymentMissingAPAccountError) {
      return errorResponse("AP_ACCOUNT_NOT_CONFIGURED", error.message, 400);
    }
    if (error instanceof APPaymentInvalidAPAccountTypeError) {
      return errorResponse("AP_ACCOUNT_INVALID_TYPE", error.message, 400);
    }
    if (error instanceof APPaymentError && error.code === "JOURNAL_NOT_BALANCED") {
      return errorResponse("JOURNAL_NOT_BALANCED", error.message, 400);
    }
    // FIX(47.5-WP-C): Handle period-close guardrail block response (strict mode → 409)
    if (typeof error === "object" && error !== null && "code" in error) {
      const err = error as { code: string; message?: string };
      if (err.code === "PERIOD_CLOSED") {
        return errorResponse("PERIOD_CLOSED", err.message ?? "Period is closed for AP transactions", 409);
      }
    }
    console.error("POST /purchasing/payments/:id/post failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to post AP payment", 500);
  }
});

// POST /purchasing/payments/:id/void - Void a posted payment (reverses journal)
// FIX(47.5-WP-C): Added period-close guardrail integration with override_reason support
paymentRoutes.post("/:id/void", async (c) => {
  try {
    const auth = c.get("auth");

    const accessResult = await requireAccess({
      module: "purchasing",
      resource: "payments",
      permission: "update"
    })(c.req.raw, auth);

    if (accessResult !== null) {
      return accessResult;
    }

    const paymentId = NumericIdSchema.parse(c.req.param("id"));

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

    const result = await voidAPPayment(auth.companyId, auth.userId, paymentId, overrideReason, auth);

    return successResponse(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid payment ID", 400);
    }
    if (error instanceof APPaymentNotFoundError) {
      return errorResponse("NOT_FOUND", error.message, 404);
    }
    if (error instanceof APPaymentInvalidStatusTransitionError) {
      return errorResponse("INVALID_STATUS_TRANSITION", error.message, 400);
    }
    if (error instanceof PeriodOverrideReasonInvalidError) {
      return errorResponse("INVALID_REQUEST", error.message, 400);
    }
    if (error instanceof PeriodOverrideForbiddenError) {
      return errorResponse("FORBIDDEN", error.message, 403);
    }
    if (error instanceof APPaymentBankAccountNotFoundError) {
      return errorResponse("BANK_ACCOUNT_NOT_FOUND", error.message, 400);
    }
    if (error instanceof APPaymentSupplierInactiveError) {
      return errorResponse("SUPPLIER_INACTIVE", error.message, 400);
    }
    if (error instanceof APPaymentError && error.code === "MISSING_JOURNAL_BATCH") {
      return errorResponse("MISSING_JOURNAL_BATCH", error.message, 400);
    }
    // FIX(47.5-WP-C): Handle period-close guardrail block response (strict mode → 409)
    if (typeof error === "object" && error !== null && "code" in error) {
      const err = error as { code: string; message?: string };
      if (err.code === "PERIOD_CLOSED") {
        return errorResponse("PERIOD_CLOSED", err.message ?? "Period is closed for AP transactions", 409);
      }
    }
    console.error("POST /purchasing/payments/:id/void failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to void AP payment", 500);
  }
});

export { paymentRoutes };
