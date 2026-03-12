// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import {
  CashBankTransactionCreateRequestSchema,
  CashBankTransactionListQuerySchema,
  NumericIdSchema
} from "@jurnapod/shared";
import { ZodError, z } from "zod";
import { userHasOutletAccess } from "../../../src/lib/auth";
import { requireAccess, requireAccessForOutletQuery, withAuth } from "../../../src/lib/auth-guard";
import { errorResponse, successResponse } from "../../../src/lib/response";
import {
  CashBankForbiddenError,
  CashBankValidationError,
  createCashBankTransaction,
  listCashBankTransactions
} from "../../../src/lib/cash-bank";

const outletGuardSchema = z.object({
  outlet_id: NumericIdSchema.optional().nullable()
});

const invalidJsonGuardError = new ZodError([
  {
    code: z.ZodIssueCode.custom,
    message: "Invalid request",
    path: []
  }
]);

async function parseOptionalOutletIdForGuard(request: Request): Promise<number | null> {
  try {
    const payload = await request.clone().json();
    const parsed = outletGuardSchema.parse(payload);
    return parsed.outlet_id ?? null;
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
      const query = CashBankTransactionListQuerySchema.parse({
        outlet_id: url.searchParams.get("outlet_id") ?? undefined,
        transaction_type: url.searchParams.get("transaction_type") ?? undefined,
        status: url.searchParams.get("status") ?? undefined,
        date_from: url.searchParams.get("date_from") ?? undefined,
        date_to: url.searchParams.get("date_to") ?? undefined,
        limit: url.searchParams.get("limit") ?? undefined,
        offset: url.searchParams.get("offset") ?? undefined
      });

      if (typeof query.outlet_id === "number") {
        const hasAccess = await userHasOutletAccess(auth.userId, auth.companyId, query.outlet_id);
        if (!hasAccess) {
          return errorResponse("FORBIDDEN", "Forbidden", 403);
        }
      }

      const result = await listCashBankTransactions(auth.companyId, {
        outletId: query.outlet_id,
        transactionType: query.transaction_type,
        status: query.status,
        dateFrom: query.date_from,
        dateTo: query.date_to,
        limit: query.limit,
        offset: query.offset
      });

      return successResponse(result);
    } catch (error) {
      if (error instanceof ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }

      console.error("GET /cash-bank-transactions failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Cash/bank request failed", 500);
    }
  },
  [
    requireAccessForOutletQuery({
      roles: ["OWNER", "COMPANY_ADMIN", "ADMIN", "ACCOUNTANT"],
      module: "cash_bank",
      permission: "read"
    })
  ]
);

export const POST = withAuth(
  async (request, auth) => {
    try {
      const payload = await request.json();
      const input = CashBankTransactionCreateRequestSchema.parse(payload);
      const created = await createCashBankTransaction(auth.companyId, input, { userId: auth.userId });
      return successResponse(created, 201);
    } catch (error) {
      if (error instanceof ZodError || error instanceof SyntaxError) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }

      if (error instanceof CashBankForbiddenError) {
        return errorResponse("FORBIDDEN", "Forbidden", 403);
      }

      if (error instanceof CashBankValidationError) {
        return errorResponse("INVALID_REQUEST", error.message, 400);
      }

      console.error("POST /cash-bank-transactions failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Cash/bank request failed", 500);
    }
  },
  [
    requireAccess({
      roles: ["OWNER", "COMPANY_ADMIN", "ADMIN", "ACCOUNTANT"],
      module: "cash_bank",
      permission: "create",
      outletId: (request) => parseOptionalOutletIdForGuard(request)
    })
  ]
);
