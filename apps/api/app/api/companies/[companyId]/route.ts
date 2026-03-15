// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { CompanyUpdateRequestSchema, NumericIdSchema } from "@jurnapod/shared";
import { ZodError } from "zod";
import { requireAccess, withAuth } from "../../../../src/lib/auth-guard";
import { checkUserAccess } from "../../../../src/lib/auth";
import { readClientIp } from "../../../../src/lib/request-meta";
import { errorResponse, successResponse } from "../../../../src/lib/response";
import { auditSuperAdminCrossCompanyWrite, requiresSuperAdminAudit } from "../../../../src/lib/super-admin-audit";
import {
  getCompany,
  updateCompany,
  deleteCompany,
  CompanyNotFoundError,
  CompanyDeactivatedError,
  CompanyAlreadyActiveError
} from "../../../../src/lib/companies";

async function isSuperAdmin(auth: { userId: number; companyId: number }) {
  const access = await checkUserAccess({
    userId: auth.userId,
    companyId: auth.companyId,
    allowedRoles: ["SUPER_ADMIN"]
  });
  return access?.isSuperAdmin ?? false;
}

function parseCompanyId(request: Request): number {
  const pathname = new URL(request.url).pathname;
  const companyIdRaw = pathname.split("/").filter(Boolean).pop();
  return NumericIdSchema.parse(companyIdRaw);
}

export const GET = withAuth(
  async (request, auth) => {
    try {
      const companyId = parseCompanyId(request);
      const superAdmin = await isSuperAdmin(auth);
      if (!superAdmin && companyId !== auth.companyId) {
        return errorResponse("NOT_FOUND", "Company not found", 404);
      }
      const company = await getCompany(companyId, { includeDeleted: superAdmin });
      return successResponse(company);
    } catch (error) {
      if (error instanceof ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }
      if (error instanceof CompanyNotFoundError) {
        return errorResponse("NOT_FOUND", error.message, 404);
      }
      console.error("GET /api/companies/:id failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Company request failed", 500);
    }
  },
  [requireAccess({ roles: ["SUPER_ADMIN", "OWNER"], module: "companies", permission: "read" })]
);

export const PATCH = withAuth(
  async (request, auth) => {
    try {
      const companyId = parseCompanyId(request);
      const superAdmin = await isSuperAdmin(auth);
      if (!superAdmin && companyId !== auth.companyId) {
        return errorResponse("NOT_FOUND", "Company not found", 404);
      }
      const body = await request.json();
      const input = CompanyUpdateRequestSchema.parse({
        name: typeof body.name === "string" ? body.name.trim() : undefined,
        legal_name: typeof body.legal_name === "string" ? body.legal_name.trim() : (body.legal_name === null ? null : undefined),
        tax_id: typeof body.tax_id === "string" ? body.tax_id.trim() : (body.tax_id === null ? null : undefined),
        email: typeof body.email === "string" ? body.email.trim() : (body.email === null ? null : undefined),
        phone: typeof body.phone === "string" ? body.phone.trim() : (body.phone === null ? null : undefined),
        address_line1: typeof body.address_line1 === "string" ? body.address_line1.trim() : (body.address_line1 === null ? null : undefined),
        address_line2: typeof body.address_line2 === "string" ? body.address_line2.trim() : (body.address_line2 === null ? null : undefined),
        city: typeof body.city === "string" ? body.city.trim() : (body.city === null ? null : undefined),
        postal_code: typeof body.postal_code === "string" ? body.postal_code.trim() : (body.postal_code === null ? null : undefined)
      });

      const company = await updateCompany({
        companyId,
        name: input.name,
        legal_name: input.legal_name,
        tax_id: input.tax_id,
        email: input.email,
        phone: input.phone,
        address_line1: input.address_line1,
        address_line2: input.address_line2,
        city: input.city,
        postal_code: input.postal_code,
        actor: {
          userId: auth.userId,
          ipAddress: readClientIp(request)
        }
      });

      // Audit SUPER_ADMIN cross-company updates
      if (requiresSuperAdminAudit(superAdmin, auth.companyId, companyId)) {
        await auditSuperAdminCrossCompanyWrite({
          userId: auth.userId,
          targetCompanyId: companyId,
          action: "UPDATE_COMPANY",
          entityType: "company",
          entityId: companyId,
          changes: input,
          ipAddress: readClientIp(request)
        });
      }

      return successResponse(company);
    } catch (error) {
      if (error instanceof ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }
      if (error instanceof CompanyNotFoundError) {
        return errorResponse("NOT_FOUND", error.message, 404);
      }
      if (error instanceof CompanyDeactivatedError) {
        return errorResponse("COMPANY_DEACTIVATED", error.message, 409);
      }
      console.error("PATCH /api/companies/:id failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Company request failed", 500);
    }
  },
  [requireAccess({ roles: ["SUPER_ADMIN", "OWNER"], module: "companies", permission: "update" })]
);

export const DELETE = withAuth(
  async (request, auth) => {
    try {
      const companyId = parseCompanyId(request);
      const superAdmin = await isSuperAdmin(auth);
      if (!superAdmin) {
        return errorResponse("FORBIDDEN", "Forbidden", 403);
      }
      await deleteCompany({
        companyId,
        actor: {
          userId: auth.userId,
          ipAddress: readClientIp(request)
        }
      });

      // Audit SUPER_ADMIN company deletion
      if (requiresSuperAdminAudit(superAdmin, auth.companyId, companyId)) {
        await auditSuperAdminCrossCompanyWrite({
          userId: auth.userId,
          targetCompanyId: companyId,
          action: "DELETE_COMPANY",
          entityType: "company",
          entityId: companyId,
          changes: {},
          ipAddress: readClientIp(request)
        });
      }

      return successResponse(null);
    } catch (error) {
      if (error instanceof ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }
      if (error instanceof CompanyNotFoundError) {
        return errorResponse("NOT_FOUND", error.message, 404);
      }
      if (error instanceof CompanyDeactivatedError) {
        return errorResponse("COMPANY_DEACTIVATED", error.message, 409);
      }
      if (error instanceof CompanyAlreadyActiveError) {
        return errorResponse("COMPANY_ALREADY_ACTIVE", error.message, 409);
      }
      if (error instanceof Error && error.message.includes("Cannot delete company")) {
        return errorResponse("COMPANY_IN_USE", error.message, 409);
      }
      console.error("DELETE /api/companies/:id failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Company request failed", 500);
    }
  },
  [requireAccess({ roles: ["SUPER_ADMIN", "OWNER"], module: "companies", permission: "delete" })]
);
