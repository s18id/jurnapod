// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { NumericIdSchema, SalesPaymentPostRequestSchema } from "@jurnapod/shared";
import { ZodError } from "zod";
import { requireAccess, withAuth } from "../../../../../../src/lib/auth-guard";
import { FiscalYearNotOpenError } from "../../../../../../src/lib/fiscal-years";
import { errorResponse, successResponse } from "../../../../../../src/lib/response";
import {
  DatabaseForbiddenError,
  PaymentAllocationError,
  PaymentStatusError,
  postPayment
} from "../../../../../../src/lib/sales";
import { PaymentVarianceConfigError } from "../../../../../../src/lib/sales-posting";

function parsePaymentId(request: Request): number {
  const pathname = new URL(request.url).pathname;
  const parts = pathname.split("/").filter(Boolean);
  const paymentIdRaw = parts[parts.indexOf("payments") + 1];
  return NumericIdSchema.parse(paymentIdRaw);
}

async function parsePostRequestBody(request: Request): Promise<{ settle_shortfall_as_loss?: boolean; shortfall_reason?: string }> {
  const text = await request.text();
  if (!text || text.trim().length === 0) {
    return {};
  }
  const parsed = JSON.parse(text);
  return SalesPaymentPostRequestSchema.parse(parsed);
}

export const POST = withAuth(
  async (request, auth) => {
    try {
      const paymentId = parsePaymentId(request);
      const postOptions = await parsePostRequestBody(request);
      
      const payment = await postPayment(
        auth.companyId,
        paymentId,
        { userId: auth.userId },
        postOptions
      );

      if (!payment) {
        return errorResponse("NOT_FOUND", "Payment not found", 404);
      }

      return successResponse(payment);
    } catch (error) {
      if (error instanceof ZodError || (error instanceof SyntaxError && error.message.includes("JSON"))) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }

      if (error instanceof PaymentStatusError) {
        return errorResponse("INVALID_TRANSITION", "Payment cannot be posted", 409);
      }

      if (error instanceof PaymentAllocationError) {
        return errorResponse("ALLOCATION_ERROR", (error as Error).message, 409);
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

      if (error instanceof PaymentVarianceConfigError) {
        const errMsg = error.message;
        const businessCode = errMsg === "PAYMENT_VARIANCE_GAIN_MISSING"
          ? "PAYMENT_VARIANCE_GAIN_MISSING"
          : "PAYMENT_VARIANCE_LOSS_MISSING";
        const message = errMsg === "PAYMENT_VARIANCE_GAIN_MISSING"
          ? "Payment variance gain account not configured. Configure it in Account Mappings under company scope."
          : "Payment variance loss account not configured. Configure it in Account Mappings under company scope.";
        return errorResponse(businessCode, message, 409);
      }

      console.error("POST /sales/payments/:id/post failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Payment post request failed", 500);
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
