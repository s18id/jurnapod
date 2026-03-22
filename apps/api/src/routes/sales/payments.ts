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
import {
  NumericIdSchema,
  SalesPaymentCreateRequestSchema,
  SalesPaymentListQuerySchema
} from "@jurnapod/shared";
import {
  createPayment,
  DatabaseConflictError,
  DatabaseForbiddenError,
  DatabaseReferenceError,
  listPayments,
  PaymentAllocationError
} from "@/lib/sales";
import { listUserOutletIds, userHasOutletAccess } from "@/lib/auth";
import { getCompany } from "@/lib/companies";
import { errorResponse, successResponse } from "@/lib/response";
import type { AuthContext } from "@/lib/auth-guard";

const paymentRoutes = new Hono();

const numberingTemplateConflictMessage =
  "No numbering template configured. Please configure document numbering in settings.";

// ============================================================================
// GET /sales/payments - List payments with filtering
// ============================================================================

paymentRoutes.get("/", async (c) => {
  const auth = c.get("auth") as AuthContext;

  try {
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
    const company = await getCompany(auth.companyId);
    const timezone = company.timezone ?? 'UTC';

    const report = await listPayments(auth.companyId, {
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
// POST /sales/payments - Process new payment
// ============================================================================

paymentRoutes.post("/", async (c) => {
  const auth = c.get("auth") as AuthContext;

  try {
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

    const payment = await createPayment(auth.companyId, input, {
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

export { paymentRoutes };
