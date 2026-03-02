// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { CompanyCreateRequestSchema } from "@jurnapod/shared";
import { ZodError } from "zod";
import { requireAccess, withAuth } from "../../../src/lib/auth-guard";
import { userHasAnyRole } from "../../../src/lib/auth";
import { listCompanies, createCompany, CompanyCodeExistsError } from "../../../src/lib/companies";
import { readClientIp } from "../../../src/lib/request-meta";
import { errorResponse, successResponse } from "../../../src/lib/response";

export const GET = withAuth(
  async (_request, auth) => {
    try {
      const url = new URL(_request.url);
      const includeDeletedParam = url.searchParams.get("include_deleted");
      const includeDeleted = includeDeletedParam === "1" || includeDeletedParam === "true";
      const isSuperAdmin = await userHasAnyRole(auth.userId, auth.companyId, ["SUPER_ADMIN"]);
      const companies = await listCompanies(
        isSuperAdmin
          ? { includeDeleted }
          : { companyId: auth.companyId }
      );
      return successResponse(companies);
    } catch (error) {
      console.error("GET /api/companies failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Companies request failed", 500);
    }
  },
  [requireAccess({ roles: ["SUPER_ADMIN", "OWNER"], module: "companies", permission: "read" })]
);

export const POST = withAuth(
  async (request, auth) => {
    try {
      const body = await request.json();
      const input = CompanyCreateRequestSchema.parse({
        code: typeof body.code === "string" ? body.code.trim().toUpperCase() : "",
        name: typeof body.name === "string" ? body.name.trim() : ""
      });

      const company = await createCompany({
        code: input.code,
        name: input.name,
        actor: {
          userId: auth.userId,
          ipAddress: readClientIp(request)
        }
      });

      return successResponse(company, 201);
    } catch (error) {
      if (error instanceof ZodError) {
        return errorResponse("VALIDATION_ERROR", "Invalid company payload", 400);
      }
      console.error("POST /api/companies failed", error);
      if (error instanceof CompanyCodeExistsError) {
        return errorResponse("DUPLICATE_COMPANY", error.message, 409);
      }
      return errorResponse("INTERNAL_SERVER_ERROR", "Companies request failed", 500);
    }
  },
  [requireAccess({ roles: ["SUPER_ADMIN"], module: "companies", permission: "create" })]
);
