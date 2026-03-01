// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { CompanyUpdateRequestSchema, NumericIdSchema } from "@jurnapod/shared";
import { ZodError } from "zod";
import { requireAccess, withAuth } from "../../../../src/lib/auth-guard";
import { userHasAnyRole } from "../../../../src/lib/auth";
import { readClientIp } from "../../../../src/lib/request-meta";
import {
  getCompany,
  updateCompany,
  deleteCompany,
  CompanyNotFoundError,
  CompanyDeactivatedError,
  CompanyAlreadyActiveError
} from "../../../../src/lib/companies";

const INVALID_REQUEST_RESPONSE = {
  success: false,
  error: {
    code: "INVALID_REQUEST",
    message: "Invalid request"
  }
};

const INTERNAL_SERVER_ERROR_RESPONSE = {
  success: false,
  error: {
    code: "INTERNAL_SERVER_ERROR",
    message: "Company request failed"
  }
};

async function isSuperAdmin(auth: { userId: number; companyId: number }) {
  return userHasAnyRole(auth.userId, auth.companyId, ["SUPER_ADMIN"]);
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
        return Response.json({
          success: false,
          error: { code: "NOT_FOUND", message: "Company not found" }
        }, { status: 404 });
      }
      const company = await getCompany(companyId, { includeDeleted: superAdmin });
      return Response.json({ success: true, data: company }, { status: 200 });
    } catch (error) {
      if (error instanceof ZodError) {
        return Response.json(INVALID_REQUEST_RESPONSE, { status: 400 });
      }
      if (error instanceof CompanyNotFoundError) {
        return Response.json({
          success: false,
          error: { code: "NOT_FOUND", message: error.message }
        }, { status: 404 });
      }
      console.error("GET /api/companies/:id failed", error);
      return Response.json(INTERNAL_SERVER_ERROR_RESPONSE, { status: 500 });
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
        return Response.json({
          success: false,
          error: { code: "NOT_FOUND", message: "Company not found" }
        }, { status: 404 });
      }
      const body = await request.json();
      const input = CompanyUpdateRequestSchema.parse({
        name: typeof body.name === "string" ? body.name.trim() : undefined
      });

      const company = await updateCompany({
        companyId,
        name: input.name,
        actor: {
          userId: auth.userId,
          ipAddress: readClientIp(request)
        }
      });

      return Response.json({ success: true, data: company }, { status: 200 });
    } catch (error) {
      if (error instanceof ZodError) {
        return Response.json(INVALID_REQUEST_RESPONSE, { status: 400 });
      }
      if (error instanceof CompanyNotFoundError) {
        return Response.json({
          success: false,
          error: { code: "NOT_FOUND", message: error.message }
        }, { status: 404 });
      }
      if (error instanceof CompanyDeactivatedError) {
        return Response.json({
          success: false,
          error: { code: "COMPANY_DEACTIVATED", message: error.message }
        }, { status: 409 });
      }
      console.error("PATCH /api/companies/:id failed", error);
      return Response.json(INTERNAL_SERVER_ERROR_RESPONSE, { status: 500 });
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
        return Response.json({
          success: false,
          error: { code: "FORBIDDEN", message: "Forbidden" }
        }, { status: 403 });
      }
      await deleteCompany({
        companyId,
        actor: {
          userId: auth.userId,
          ipAddress: readClientIp(request)
        }
      });
      return Response.json({ success: true }, { status: 200 });
    } catch (error) {
      if (error instanceof ZodError) {
        return Response.json(INVALID_REQUEST_RESPONSE, { status: 400 });
      }
      if (error instanceof CompanyNotFoundError) {
        return Response.json({
          success: false,
          error: { code: "NOT_FOUND", message: error.message }
        }, { status: 404 });
      }
      if (error instanceof CompanyDeactivatedError) {
        return Response.json({
          success: false,
          error: { code: "COMPANY_DEACTIVATED", message: error.message }
        }, { status: 409 });
      }
      if (error instanceof CompanyAlreadyActiveError) {
        return Response.json({
          success: false,
          error: { code: "COMPANY_ALREADY_ACTIVE", message: error.message }
        }, { status: 409 });
      }
      if (error instanceof Error && error.message.includes("Cannot delete company")) {
        return Response.json({
          success: false,
          error: { code: "COMPANY_IN_USE", message: error.message }
        }, { status: 409 });
      }
      console.error("DELETE /api/companies/:id failed", error);
      return Response.json(INTERNAL_SERVER_ERROR_RESPONSE, { status: 500 });
    }
  },
  [requireAccess({ roles: ["SUPER_ADMIN", "OWNER"], module: "companies", permission: "delete" })]
);
