// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { NumericIdSchema } from "@jurnapod/shared";
import { ZodError } from "zod";
import { requireAccess, withAuth } from "../../../src/lib/auth-guard";
import { userHasAnyRole } from "../../../src/lib/auth";
import { readClientIp } from "../../../src/lib/request-meta";
import { errorResponse, successResponse } from "../../../src/lib/response";
import { listOutletsByCompany, createOutlet, OutletCodeExistsError } from "../../../src/lib/outlets";

export const GET = withAuth(
  async (request, auth) => {
    try {
      const url = new URL(request.url);
      const companyIdRaw = url.searchParams.get("company_id");
      const companyId = companyIdRaw ? NumericIdSchema.parse(companyIdRaw) : auth.companyId;

      if (companyId !== auth.companyId) {
        const isSuperAdmin = await userHasAnyRole(auth.userId, auth.companyId, ["SUPER_ADMIN"]);
        if (!isSuperAdmin) {
          return errorResponse("COMPANY_MISMATCH", "Company ID mismatch", 400);
        }
      }
      
      const outlets = await listOutletsByCompany(companyId);
      return successResponse(outlets);
    } catch (error) {
      if (error instanceof ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }

      console.error("GET /api/outlets failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Outlets request failed", 500);
    }
  },
  [requireAccess({ roles: ["OWNER", "ADMIN", "SUPER_ADMIN"], module: "outlets", permission: "read" })]
);

export const POST = withAuth(
  async (request, auth) => {
    try {
      const body = await request.json();
      const { company_id, code, name } = body;

      // Use provided company_id or default to auth.companyId
      const targetCompanyId = company_id != null ? NumericIdSchema.parse(company_id) : auth.companyId;

      if (targetCompanyId !== auth.companyId) {
        const isSuperAdmin = await userHasAnyRole(auth.userId, auth.companyId, ["SUPER_ADMIN"]);
        if (!isSuperAdmin) {
          return errorResponse("COMPANY_MISMATCH", "Company ID mismatch", 400);
        }
      }

      if (!code || typeof code !== "string" || code.trim().length === 0) {
        return errorResponse("VALIDATION_ERROR", "Outlet code is required", 400);
      }

      if (!name || typeof name !== "string" || name.trim().length === 0) {
        return errorResponse("VALIDATION_ERROR", "Outlet name is required", 400);
      }

      const outlet = await createOutlet({
        company_id: targetCompanyId,
        code: code.trim().toUpperCase(),
        name: name.trim(),
        actor: {
          userId: auth.userId,
          ipAddress: readClientIp(request)
        }
      });

      return successResponse(outlet, 201);
    } catch (error) {
      if (error instanceof ZodError || error instanceof SyntaxError) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }
      console.error("POST /api/outlets failed", error);
      if (error instanceof OutletCodeExistsError) {
        return errorResponse("DUPLICATE_OUTLET", error.message, 409);
      }
      return errorResponse("INTERNAL_SERVER_ERROR", "Outlets request failed", 500);
    }
  },
  [requireAccess({ roles: ["OWNER", "ADMIN", "SUPER_ADMIN"], module: "outlets", permission: "create" })]
);
