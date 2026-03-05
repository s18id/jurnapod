// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { DepreciationRunCreateRequestSchema } from "@jurnapod/shared";
import { ZodError } from "zod";
import { requireAccess, withAuth } from "../../../../../src/lib/auth-guard";
import { FiscalYearNotOpenError } from "../../../../../src/lib/fiscal-years";
import { errorResponse, successResponse } from "../../../../../src/lib/response";
import {
  DatabaseForbiddenError,
  DatabaseReferenceError,
  DepreciationPlanStatusError,
  DepreciationPlanValidationError,
  runDepreciationPlan
} from "../../../../../src/lib/depreciation";

export const POST = withAuth(
  async (request, auth) => {
    try {
      const payload = await request.json();
      const input = DepreciationRunCreateRequestSchema.parse(payload);
      const result = await runDepreciationPlan(auth.companyId, input, {
        userId: auth.userId
      });

      return successResponse({
        duplicate: result.duplicate,
        run: result.run
      });
    } catch (error) {
      if (error instanceof ZodError || error instanceof SyntaxError) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }

      if (error instanceof DepreciationPlanValidationError) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }

      if (error instanceof DepreciationPlanStatusError) {
        return errorResponse("CONFLICT", "Depreciation run conflict", 409);
      }

      if (error instanceof DatabaseReferenceError) {
        return errorResponse("INVALID_REFERENCE", "Invalid depreciation reference", 400);
      }

      if (error instanceof DatabaseForbiddenError) {
        return errorResponse("FORBIDDEN", "Forbidden", 403);
      }

      if (error instanceof FiscalYearNotOpenError) {
        return errorResponse(
          "FISCAL_YEAR_CLOSED",
          "Depreciation run date is outside any open fiscal year",
          400
        );
      }

      console.error("POST /api/accounts/depreciation/run failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Depreciation run failed", 500);
    }
  },
  [requireAccess({ roles: ["OWNER", "COMPANY_ADMIN", "ADMIN", "ACCOUNTANT"], module: "accounts", permission: "update" })]
);
