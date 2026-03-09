// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { NumericIdSchema, SalesOrderUpdateRequestSchema } from "@jurnapod/shared";
import { ZodError } from "zod";
import { requireAccess, withAuth } from "../../../../../src/lib/auth-guard";
import { errorResponse, successResponse } from "../../../../../src/lib/response";
import {
  confirmOrder,
  completeOrder,
  DatabaseConflictError,
  DatabaseForbiddenError,
  DatabaseReferenceError,
  voidOrder
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
      console.log("GET /sales/orders/:id not fully implemented yet - would fetch order", orderId);
      return errorResponse("NOT_IMPLEMENTED", "Order retrieval not implemented", 501);
    } catch (error) {
      if (error instanceof ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
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
      console.log("PATCH /sales/orders/:id not fully implemented yet - would update order", orderId);
      return errorResponse("NOT_IMPLEMENTED", "Order update not implemented", 501);
    } catch (error) {
      if (error instanceof ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
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
