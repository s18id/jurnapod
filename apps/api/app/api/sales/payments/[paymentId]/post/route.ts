// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { NumericIdSchema } from "@jurnapod/shared";
import { ZodError } from "zod";
import { requireRole, withAuth } from "../../../../../../src/lib/auth-guard";
import {
  DatabaseForbiddenError,
  PaymentAllocationError,
  PaymentStatusError,
  postPayment
} from "../../../../../../src/lib/sales";

const INVALID_REQUEST_RESPONSE = {
  ok: false,
  error: {
    code: "INVALID_REQUEST",
    message: "Invalid request"
  }
};

const NOT_FOUND_RESPONSE = {
  ok: false,
  error: {
    code: "NOT_FOUND",
    message: "Payment not found"
  }
};

const FORBIDDEN_RESPONSE = {
  ok: false,
  error: {
    code: "FORBIDDEN",
    message: "Forbidden"
  }
};

const INVALID_TRANSITION_RESPONSE = {
  ok: false,
  error: {
    code: "INVALID_TRANSITION",
    message: "Payment cannot be posted"
  }
};

const ALLOCATION_ERROR_RESPONSE = {
  ok: false,
  error: {
    code: "ALLOCATION_ERROR",
    message: "Payment allocation failed"
  }
};

const INTERNAL_SERVER_ERROR_RESPONSE = {
  ok: false,
  error: {
    code: "INTERNAL_SERVER_ERROR",
    message: "Payment post request failed"
  }
};

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
        return Response.json(NOT_FOUND_RESPONSE, { status: 404 });
      }

      return Response.json({ ok: true, payment }, { status: 200 });
    } catch (error) {
      if (error instanceof ZodError) {
        return Response.json(INVALID_REQUEST_RESPONSE, { status: 400 });
      }

      if (error instanceof PaymentStatusError) {
        return Response.json(INVALID_TRANSITION_RESPONSE, { status: 409 });
      }

      if (error instanceof PaymentAllocationError) {
        return Response.json(
          {
            ok: false,
            error: {
              code: "ALLOCATION_ERROR",
              message: error.message
            }
          },
          { status: 409 }
        );
      }

      if (error instanceof DatabaseForbiddenError) {
        return Response.json(FORBIDDEN_RESPONSE, { status: 403 });
      }

      console.error("POST /sales/payments/:id/post failed", error);
      return Response.json(INTERNAL_SERVER_ERROR_RESPONSE, { status: 500 });
    }
  },
  [requireRole(["OWNER", "ADMIN", "ACCOUNTANT"])]
);
