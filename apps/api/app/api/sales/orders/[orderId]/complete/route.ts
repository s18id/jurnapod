// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { requireAccess, withAuth } from "../../../../../../src/lib/auth-guard";
import { errorResponse, successResponse } from "../../../../../../src/lib/response";
import {
  completeOrder,
  DatabaseConflictError,
  DatabaseForbiddenError,
  DatabaseReferenceError
} from "../../../../../../src/lib/sales";

function parseOrderId(request: Request): number {
  const pathname = new URL(request.url).pathname;
  const parts = pathname.split("/").filter(Boolean);
  const orderIdIndex = parts.indexOf("orders") + 1;
  return parseInt(parts[orderIdIndex], 10);
}

export const POST = withAuth(
  async (request, auth) => {
    try {
      const orderId = parseOrderId(request);
      const order = await completeOrder(auth.companyId, orderId, {
        userId: auth.userId
      });

      return successResponse(order);
    } catch (error) {
      if (error instanceof DatabaseReferenceError) {
        return errorResponse("NOT_FOUND", "Order not found", 404);
      }

      if (error instanceof DatabaseForbiddenError) {
        return errorResponse("FORBIDDEN", "Forbidden", 403);
      }

      if (error instanceof DatabaseConflictError) {
        return errorResponse("CONFLICT", error.message, 409);
      }

      console.error("POST /sales/orders/:id/complete failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Complete order failed", 500);
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
