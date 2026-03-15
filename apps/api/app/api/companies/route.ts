// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { CompanyCreateRequestSchema } from "@jurnapod/shared";
import { ZodError } from "zod";
import { requireAccess, withAuth } from "../../../src/lib/auth-guard";
import { checkUserAccess } from "../../../src/lib/auth";
import { listCompanies, createCompany, CompanyCodeExistsError } from "../../../src/lib/companies";
import { readClientIp } from "../../../src/lib/request-meta";
import { errorResponse, successResponse } from "../../../src/lib/response";
import { auditSuperAdminCrossCompanyWrite } from "../../../src/lib/super-admin-audit";

export const GET = withAuth(
  async (_request, auth) => {
    try {
      const url = new URL(_request.url);
      const includeDeletedParam = url.searchParams.get("include_deleted");
      const includeDeleted = includeDeletedParam === "1" || includeDeletedParam === "true";
      const access = await checkUserAccess({
        userId: auth.userId,
        companyId: auth.companyId,
        allowedRoles: ["SUPER_ADMIN"]
      });
      const isSuperAdmin = access?.isSuperAdmin ?? false;
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
        name: typeof body.name === "string" ? body.name.trim() : "",
        legal_name: typeof body.legal_name === "string" ? body.legal_name.trim() : undefined,
        tax_id: typeof body.tax_id === "string" ? body.tax_id.trim() : undefined,
        email: typeof body.email === "string" ? body.email.trim() : undefined,
        phone: typeof body.phone === "string" ? body.phone.trim() : undefined,
        address_line1: typeof body.address_line1 === "string" ? body.address_line1.trim() : undefined,
        address_line2: typeof body.address_line2 === "string" ? body.address_line2.trim() : undefined,
        city: typeof body.city === "string" ? body.city.trim() : undefined,
        postal_code: typeof body.postal_code === "string" ? body.postal_code.trim() : undefined
      });

      const company = await createCompany({
        code: input.code,
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

      // Audit SUPER_ADMIN company creation
      const access = await checkUserAccess({
        userId: auth.userId,
        companyId: auth.companyId,
        allowedRoles: ["SUPER_ADMIN"]
      });
      if (access?.isSuperAdmin) {
        await auditSuperAdminCrossCompanyWrite({
          userId: auth.userId,
          targetCompanyId: company.id,
          action: "CREATE_COMPANY",
          entityType: "company",
          entityId: company.id,
          changes: input,
          ipAddress: readClientIp(request)
        });
      }

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
