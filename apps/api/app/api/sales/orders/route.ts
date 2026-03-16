// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import {
  SalesOrderCreateRequestSchema,
  SalesOrderListQuerySchema
} from "@jurnapod/shared";
import { ZodError, z } from "zod";
import { listUserOutletIds, userHasOutletAccess } from "../../../../src/lib/auth";
import { requireAccess, requireAccessForOutletQuery, withAuth } from "../../../../src/lib/auth-guard";
import { getCompany } from "../../../../src/lib/companies";
import { errorResponse, successResponse } from "../../../../src/lib/response";
import {
  createOrder,
  DatabaseConflictError,
  DatabaseForbiddenError,
  DatabaseReferenceError,
  listOrders
} from "../../../../src/lib/sales";
const numberingTemplateConflictMessage =
  "No numbering template configured. Please configure document numbering in settings.";

const outletGuardSchema = SalesOrderCreateRequestSchema.pick({
  outlet_id: true
});

const invalidJsonGuardError = new ZodError([
  {
    code: z.ZodIssueCode.custom,
    message: "Invalid request",
    path: []
  }
]);

async function parseOutletIdForGuard(request: Request): Promise<number> {
  try {
    const payload = await request.clone().json();
    return outletGuardSchema.parse(payload).outlet_id;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw invalidJsonGuardError;
    }

    throw error;
  }
}

export const GET = withAuth(
  async (request, auth) => {
    try {
      const url = new URL(request.url);
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
      const company = await getCompany(auth.companyId);
      const timezone = company.timezone ?? 'UTC';

      const result = await listOrders(auth.companyId, {
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
      if (error instanceof ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }

      console.error("GET /sales/orders failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Orders request failed", 500);
    }
  },
  [
    requireAccessForOutletQuery({
      roles: ["OWNER", "COMPANY_ADMIN", "ADMIN", "ACCOUNTANT"],
      module: "sales",
      permission: "read"
    })
  ]
);

export const POST = withAuth(
  async (request, auth) => {
    try {
      const payload = await request.json();
      const input = SalesOrderCreateRequestSchema.parse(payload);
      const order = await createOrder(auth.companyId, input, {
        userId: auth.userId
      });

      return successResponse(order, 201);
    } catch (error) {
      if (error instanceof ZodError || error instanceof SyntaxError) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }

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
      return errorResponse("INTERNAL_SERVER_ERROR", "Orders request failed", 500);
    }
  },
  [
    requireAccess({
      roles: ["OWNER", "COMPANY_ADMIN", "ADMIN", "ACCOUNTANT"],
      module: "sales",
      permission: "create",
      outletId: (request) => parseOutletIdForGuard(request)
    })
  ]
);
