// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { NumericIdSchema } from "@jurnapod/shared";
import { ZodError } from "zod";
import { requireRole, withAuth } from "../../../../../../src/lib/auth-guard";
import { FiscalYearNotOpenError } from "../../../../../../src/lib/fiscal-years";
import { errorResponse, successResponse } from "../../../../../../src/lib/response";
import {
  DatabaseForbiddenError,
  PaymentAllocationError,
  PaymentStatusError,
  postPayment
} from "../../../../../../src/lib/sales";

function parsePaymentId(request: Request): number {
  const pathname = new URL(request.url).pathname;
  const parts = pathname.split("/").filter(Boolean);
  const paymentIdRaw = parts[parts.indexOf("payments") + 1];
  return NumericIdSchema.parse(paymentIdRaw);
}

export const POST = withAuth(
  async (request, auth) => {
    try {
      const paymentId = parsePaymentId(request);
      
      const payment = await postPayment(
        auth.companyId,
        paymentId,
        { userId: auth.userId }
      );

      if (!payment) {
        return errorResponse("NOT_FOUND", "Payment not found", 404);
      }

      return successResponse(payment);
    } catch (error) {
      if (error instanceof ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }

      if (error instanceof PaymentStatusError) {
        return errorResponse("INVALID_TRANSITION", "Payment cannot be posted", 409);
      }

      if (error instanceof PaymentAllocationError) {
        return errorResponse("ALLOCATION_ERROR", error.message, 409);
      }

      if (error instanceof DatabaseForbiddenError) {
        return errorResponse("FORBIDDEN", "Forbidden", 403);
      }

      if (error instanceof FiscalYearNotOpenError) {
        return errorResponse(
          "FISCAL_YEAR_CLOSED",
          "Payment date is outside any open fiscal year",
          400
        );
      }

      console.error("POST /sales/payments/:id/post failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Payment post request failed", 500);
    }
  },
  [requireRole(["OWNER", "ADMIN", "ACCOUNTANT"])]
);
