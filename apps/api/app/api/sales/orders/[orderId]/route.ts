// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { NumericIdSchema, SalesOrderUpdateRequestSchema } from "@jurnapod/shared";
import { ZodError } from "zod";
import { requireAccess, withAuth } from "../../../../../src/lib/auth-guard";
import { errorResponse, successResponse } from "../../../../../src/lib/response";
import {
  DatabaseConflictError,
  DatabaseForbiddenError,
  DatabaseReferenceError,
  getOrder,
  updateOrder
} from "../../../../../src/lib/sales";

function parseOrderId(request: Request): number {
  const pathname = new URL(request.url).pathname;
  const orderIdRaw = pathname.split("/").filter(Boolean).pop();
  return NumericIdSchema.parse(orderIdRaw);
}

export const GET = withAuth(
  async (request, auth) => {
    try {
      const orderId = parseOrderId(request);
      const order = await getOrder(auth.companyId, orderId, {
        userId: auth.userId
      });

      if (!order) {
        return errorResponse("NOT_FOUND", "Order not found", 404);
      }

      return successResponse(order);
    } catch (error) {
      if (error instanceof ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }

      if (error instanceof DatabaseForbiddenError) {
        return errorResponse("FORBIDDEN", "Forbidden", 403);
      }

      console.error("GET /sales/orders/:id failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Order request failed", 500);
    }
  },
  [
    requireAccess({
      roles: ["OWNER", "COMPANY_ADMIN", "ADMIN", "ACCOUNTANT"],
      module: "sales",
      permission: "read"
    })
  ]
);

export const PATCH = withAuth(
  async (request, auth) => {
    try {
      const orderId = parseOrderId(request);
      const payload = await request.json();
      const input = SalesOrderUpdateRequestSchema.parse(payload);

      const order = await updateOrder(auth.companyId, orderId, input, {
        userId: auth.userId
      });

      if (!order) {
        return errorResponse("NOT_FOUND", "Order not found", 404);
      }

      return successResponse(order);
    } catch (error) {
      if (error instanceof ZodError || error instanceof SyntaxError) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }

      if (error instanceof DatabaseForbiddenError) {
        return errorResponse("FORBIDDEN", "Forbidden", 403);
      }

      if (error instanceof DatabaseReferenceError) {
        return errorResponse("NOT_FOUND", "Outlet not found", 404);
      }

      if (error instanceof DatabaseConflictError) {
        return errorResponse("CONFLICT", error.message, 409);
      }

      console.error("PATCH /sales/orders/:id failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Order request failed", 500);
    }
  },
  [
    requireAccess({
      roles: ["OWNER", "COMPANY_ADMIN", "ADMIN", "ACCOUNTANT"],
      module: "sales",
      permission: "update"
    })
  ]
);
