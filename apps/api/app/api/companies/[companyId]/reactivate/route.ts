// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { NumericIdSchema } from "@jurnapod/shared";
import { ZodError } from "zod";
import { requireAccess, withAuth } from "../../../../../src/lib/auth-guard";
import { readClientIp } from "../../../../../src/lib/request-meta";
import { errorResponse, successResponse } from "../../../../../src/lib/response";
import {
  reactivateCompany,
  CompanyNotFoundError,
  CompanyAlreadyActiveError
} from "../../../../../src/lib/companies";

function parseCompanyId(request: Request): number {
  const pathname = new URL(request.url).pathname;
  const companyIdRaw = pathname.split("/").filter(Boolean).at(-2);
  return NumericIdSchema.parse(companyIdRaw);
}

export const POST = withAuth(
  async (request, auth) => {
    try {
      const companyId = parseCompanyId(request);
      const company = await reactivateCompany({
        companyId,
        actor: {
          userId: auth.userId,
          ipAddress: readClientIp(request)
        }
      });

      return successResponse(company);
    } catch (error) {
      if (error instanceof ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }
      if (error instanceof CompanyNotFoundError) {
        return errorResponse("NOT_FOUND", error.message, 404);
      }
      if (error instanceof CompanyAlreadyActiveError) {
        return errorResponse("COMPANY_ALREADY_ACTIVE", error.message, 409);
      }
      console.error("POST /api/companies/:id/reactivate failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Company reactivation failed", 500);
    }
  },
  [requireAccess({ roles: ["SUPER_ADMIN"], module: "companies", permission: "update" })]
);
