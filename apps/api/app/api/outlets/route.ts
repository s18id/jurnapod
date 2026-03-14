// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { NumericIdSchema, OutletCreateRequestSchema } from "@jurnapod/shared";
import { ZodError } from "zod";
import { requireAccess, withAuth } from "../../../src/lib/auth-guard";
import { checkUserAccess } from "../../../src/lib/auth";
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
        const access = await checkUserAccess({
          userId: auth.userId,
          companyId: auth.companyId,
          allowedRoles: ["SUPER_ADMIN"]
        });
        const isSuperAdmin = access?.isSuperAdmin ?? false;
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
  [
    requireAccess({
      roles: ["OWNER", "COMPANY_ADMIN", "ADMIN", "SUPER_ADMIN"],
      module: "outlets",
      permission: "read"
    })
  ]
);

export const POST = withAuth(
  async (request, auth) => {
    try {
      const body = await request.json();
      
      const parsed = OutletCreateRequestSchema.parse(body);
      
      let targetCompanyId = parsed.company_id ?? auth.companyId;
      if (targetCompanyId !== auth.companyId) {
        const access = await checkUserAccess({
          userId: auth.userId,
          companyId: auth.companyId,
          allowedRoles: ["SUPER_ADMIN"]
        });
        const isSuperAdmin = access?.isSuperAdmin ?? false;
        if (!isSuperAdmin) {
          return errorResponse("COMPANY_MISMATCH", "Company ID mismatch", 400);
        }
      }

      const outlet = await createOutlet({
        company_id: targetCompanyId,
        code: parsed.code.trim().toUpperCase(),
        name: parsed.name.trim(),
        city: parsed.city?.trim() || undefined,
        address_line1: parsed.address_line1?.trim() || undefined,
        address_line2: parsed.address_line2?.trim() || undefined,
        postal_code: parsed.postal_code?.trim() || undefined,
        phone: parsed.phone?.trim() || undefined,
        email: parsed.email?.trim() || undefined,
        timezone: parsed.timezone?.trim() || undefined,
        actor: {
          userId: auth.userId,
          ipAddress: readClientIp(request)
        }
      });

      return successResponse(outlet, 201);
    } catch (error) {
      if (error instanceof ZodError) {
        const issues = error.issues.map(i => `${i.path.join('.') || 'request'}: ${i.message}`).join('; ');
        return errorResponse("VALIDATION_ERROR", `Invalid request: ${issues}`, 400);
      }
      if (error instanceof SyntaxError) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }
      console.error("POST /api/outlets failed", error);
      if (error instanceof OutletCodeExistsError) {
        return errorResponse("DUPLICATE_OUTLET", error.message, 409);
      }
      return errorResponse("INTERNAL_SERVER_ERROR", "Outlets request failed", 500);
    }
  },
  [
    requireAccess({
      roles: ["OWNER", "COMPANY_ADMIN", "ADMIN", "SUPER_ADMIN"],
      module: "outlets",
      permission: "create"
    })
  ]
);
