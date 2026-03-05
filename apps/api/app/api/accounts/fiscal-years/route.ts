// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { ZodError } from "zod";
import {
  FiscalYearCreateRequestSchema,
  FiscalYearListQuerySchema
} from "@jurnapod/shared";
import { requireRole, withAuth } from "../../../../src/lib/auth-guard";
import { errorResponse, successResponse } from "../../../../src/lib/response";
import {
  createFiscalYear,
  listFiscalYears,
  FiscalYearCodeExistsError,
  FiscalYearDateRangeError,
  FiscalYearOpenConflictError,
  FiscalYearOverlapError
} from "../../../../src/lib/fiscal-years";

export const GET = withAuth(
  async (request, auth) => {
    try {
      const url = new URL(request.url);
      const query = FiscalYearListQuerySchema.parse({
        company_id: url.searchParams.get("company_id") || String(auth.companyId),
        status: url.searchParams.get("status") || undefined,
        include_closed: url.searchParams.get("include_closed") || undefined
      });

      if (query.company_id !== auth.companyId) {
        return errorResponse("COMPANY_MISMATCH", "Company ID mismatch", 400);
      }

      const fiscalYears = await listFiscalYears(query);
      return successResponse(fiscalYears);
    } catch (error) {
      if (error instanceof ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid request parameters", 400);
      }

      console.error("GET /api/accounts/fiscal-years failed", error);
      return errorResponse("INTERNAL_ERROR", "Internal server error", 500);
    }
  },
  [requireRole(["OWNER", "COMPANY_ADMIN", "ADMIN", "ACCOUNTANT"])]
);

export const POST = withAuth(
  async (request, auth) => {
    try {
      const payload = await request.json();
      const input = FiscalYearCreateRequestSchema.parse(payload);

      if (input.company_id !== auth.companyId) {
        return errorResponse("COMPANY_MISMATCH", "Company ID mismatch", 400);
      }

      const fiscalYear = await createFiscalYear(input, auth.userId);
      return successResponse(fiscalYear, 201);
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

      console.error("POST /api/accounts/fiscal-years failed", error);
      return errorResponse("INTERNAL_ERROR", "Internal server error", 500);
    }
  },
  [requireRole(["OWNER", "COMPANY_ADMIN", "ADMIN", "ACCOUNTANT"])]
);
