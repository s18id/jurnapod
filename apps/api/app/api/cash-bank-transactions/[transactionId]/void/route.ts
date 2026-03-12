// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { NumericIdSchema } from "@jurnapod/shared";
import { ZodError } from "zod";
import { requireAccess, withAuth } from "../../../../../src/lib/auth-guard";
import {
  CashBankForbiddenError,
  CashBankNotFoundError,
  CashBankStatusError,
  CashBankValidationError,
  voidCashBankTransaction
} from "../../../../../src/lib/cash-bank";
import { FiscalYearNotOpenError } from "../../../../../src/lib/fiscal-years";
import { errorResponse, successResponse } from "../../../../../src/lib/response";

function parseTransactionId(request: Request): number {
  const pathname = new URL(request.url).pathname;
  const parts = pathname.split("/").filter(Boolean);
  const raw = parts[parts.indexOf("cash-bank-transactions") + 1];
  return NumericIdSchema.parse(raw);
}

export const POST = withAuth(
  async (request, auth) => {
    try {
      const transactionId = parseTransactionId(request);
      const voided = await voidCashBankTransaction(auth.companyId, transactionId, { userId: auth.userId });
      return successResponse(voided);
    } catch (error) {
      if (error instanceof ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }
      if (error instanceof CashBankNotFoundError) {
        return errorResponse("NOT_FOUND", "Cash/bank transaction not found", 404);
      }
      if (error instanceof CashBankForbiddenError) {
        return errorResponse("FORBIDDEN", "Forbidden", 403);
      }
      if (error instanceof CashBankStatusError) {
        return errorResponse("INVALID_TRANSITION", (error as Error).message, 409);
      }
      if (error instanceof CashBankValidationError) {
        return errorResponse("INVALID_REQUEST", (error as Error).message, 400);
      }
      if (error instanceof FiscalYearNotOpenError) {
        return errorResponse("FISCAL_YEAR_CLOSED", "Transaction date is outside open fiscal year", 400);
      }

      console.error("POST /cash-bank-transactions/:id/void failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Cash/bank void failed", 500);
    }
  },
  [
    requireAccess({
      roles: ["OWNER", "COMPANY_ADMIN", "ADMIN", "ACCOUNTANT"],
      module: "cash_bank",
      permission: "create"
    })
  ]
);
