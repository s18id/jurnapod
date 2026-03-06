// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { ZodError } from "zod";
import { FiscalYearUpdateRequestSchema, NumericIdSchema } from "@jurnapod/shared";
import { requireAccess, withAuth } from "../../../../../src/lib/auth-guard";
import { errorResponse, successResponse } from "../../../../../src/lib/response";
import {
  getFiscalYearById,
  updateFiscalYear,
  FiscalYearCodeExistsError,
  FiscalYearDateRangeError,
  FiscalYearNotFoundError,
  FiscalYearOpenConflictError,
  FiscalYearOverlapError
} from "../../../../../src/lib/fiscal-years";

function parseFiscalYearId(request: Request): number {
  const pathname = new URL(request.url).pathname;
  const idRaw = pathname.split("/").filter(Boolean).pop();
  return NumericIdSchema.parse(idRaw);
}

export const GET = withAuth(
  async (request, auth) => {
    try {
      const fiscalYearId = parseFiscalYearId(request);
      const fiscalYear = await getFiscalYearById(auth.companyId, fiscalYearId);
      if (!fiscalYear) {
        return errorResponse("NOT_FOUND", "Fiscal year not found", 404);
      }

      return successResponse(fiscalYear);
    } catch (error) {
      if (error instanceof ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid fiscal year id", 400);
      }

      console.error("GET /api/accounts/fiscal-years/:id failed", error);
      return errorResponse("INTERNAL_ERROR", "Internal server error", 500);
    }
  },
  [
    requireAccess({
      roles: ["OWNER", "COMPANY_ADMIN", "ADMIN", "ACCOUNTANT"],
      module: "accounts",
      permission: "read"
    })
  ]
);

export const PUT = withAuth(
  async (request, auth) => {
    try {
      const fiscalYearId = parseFiscalYearId(request);
      const payload = await request.json();
      const input = FiscalYearUpdateRequestSchema.parse(payload);

      const fiscalYear = await updateFiscalYear(auth.companyId, fiscalYearId, input, auth.userId);
      if (!fiscalYear) {
        return errorResponse("NOT_FOUND", "Fiscal year not found", 404);
      }

      return successResponse(fiscalYear);
    } catch (error) {
      if (error instanceof ZodError || error instanceof SyntaxError) {
        return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
      }

      if (error instanceof FiscalYearDateRangeError) {
        return errorResponse("INVALID_DATE_RANGE", "Start date must be before end date", 400);
      }

      if (error instanceof FiscalYearOpenConflictError) {
        return errorResponse("OPEN_YEAR_CONFLICT", "Only one open fiscal year allowed", 409);
      }

      if (error instanceof FiscalYearOverlapError) {
        return errorResponse("OPEN_YEAR_OVERLAP", "Open fiscal years cannot overlap", 409);
      }

      if (error instanceof FiscalYearCodeExistsError) {
        return errorResponse("DUPLICATE_CODE", "Fiscal year code already exists", 409);
      }

      if (error instanceof FiscalYearNotFoundError) {
        return errorResponse("NOT_FOUND", "Fiscal year not found", 404);
      }

      console.error("PUT /api/accounts/fiscal-years/:id failed", error);
      return errorResponse("INTERNAL_ERROR", "Internal server error", 500);
    }
  },
  [
    requireAccess({
      roles: ["OWNER", "COMPANY_ADMIN", "ADMIN", "ACCOUNTANT"],
      module: "accounts",
      permission: "update"
    })
  ]
);
