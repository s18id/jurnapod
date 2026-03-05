// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import {
  SalesPaymentCreateRequestSchema,
  SalesPaymentListQuerySchema
} from "@jurnapod/shared";
import { ZodError } from "zod";
import { checkUserAccess, listUserOutletIds, userHasOutletAccess } from "../../../../src/lib/auth";
import { requireRoleForOutletQuery, withAuth } from "../../../../src/lib/auth-guard";
import { errorResponse, successResponse } from "../../../../src/lib/response";
import {
  createPayment,
  DatabaseConflictError,
  DatabaseForbiddenError,
  DatabaseReferenceError,
  listPayments
} from "../../../../src/lib/sales";

export const GET = withAuth(
  async (request, auth) => {
    try {
      const url = new URL(request.url);
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

      const report = await listPayments(auth.companyId, {
        outletIds,
        status: parsed.status,
        dateFrom: parsed.date_from,
        dateTo: parsed.date_to,
        limit: parsed.limit,
        offset: parsed.offset
      });

      return successResponse({
        total: report.total,
        payments: report.payments
      });
    } catch (error) {
      if (error instanceof ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }

      console.error("GET /sales/payments failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Payments request failed", 500);
    }
  },
  [requireRoleForOutletQuery(["OWNER", "COMPANY_ADMIN", "ADMIN", "ACCOUNTANT"])]
);

export const POST = withAuth(
  async (request, auth) => {
    try {
      const payload = await request.json();
      const input = SalesPaymentCreateRequestSchema.parse(payload);
      const access = await checkUserAccess({
        userId: auth.userId,
        companyId: auth.companyId,
        allowedRoles: ["OWNER", "COMPANY_ADMIN", "ADMIN", "ACCOUNTANT"],
        outletId: input.outlet_id
      });
      if (!access || !access.hasRole) {
        return errorResponse("FORBIDDEN", "Forbidden", 403);
      }
      if (!access.hasOutletAccess && !access.hasGlobalRole && !access.isSuperAdmin) {
        return errorResponse("FORBIDDEN", "Forbidden", 403);
      }
      const payment = await createPayment(auth.companyId, input, {
        userId: auth.userId
      });

      return successResponse(payment, 201);
    } catch (error) {
      if (error instanceof ZodError || error instanceof SyntaxError) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }

      if (error instanceof DatabaseForbiddenError) {
        return errorResponse("FORBIDDEN", "Forbidden", 403);
      }

      if (error instanceof DatabaseReferenceError) {
        return errorResponse("NOT_FOUND", "Resource not found", 404);
      }

      if (error instanceof DatabaseConflictError) {
        return errorResponse("CONFLICT", "Payment conflict", 409);
      }

      console.error("POST /sales/payments failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Payments request failed", 500);
    }
  },
  []
);
