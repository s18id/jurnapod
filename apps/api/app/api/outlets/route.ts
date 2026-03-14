// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { NumericIdSchema } from "@jurnapod/shared";
import { ZodError } from "zod";
import { requireAccess, withAuth } from "../../../src/lib/auth-guard";
import { checkUserAccess } from "../../../src/lib/auth";
import { readClientIp } from "../../../src/lib/request-meta";
import { errorResponse, successResponse } from "../../../src/lib/response";
import { listOutletsByCompany, createOutlet, OutletCodeExistsError } from "../../../src/lib/outlets";

function parseStringOptional(value: unknown, maxLength: number): string | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return undefined;
  }
  if (trimmed.length > maxLength) {
    return undefined;
  }
  return trimmed;
}

function parseEmailOptional(value: unknown): string | null | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return undefined;
  }
  // Basic email validation
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return undefined;
  }
  if (trimmed.length > 191) {
    return undefined;
  }
  return trimmed;
}

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
      const { company_id, code, name, city, address_line1, address_line2, postal_code, phone, email, timezone } = body;

      // Use provided company_id or default to auth.companyId
      const targetCompanyId = company_id != null ? NumericIdSchema.parse(company_id) : auth.companyId;

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

      if (!code || typeof code !== "string" || code.trim().length === 0) {
        return errorResponse("VALIDATION_ERROR", "Branch code is required", 400);
      }

      if (!name || typeof name !== "string" || name.trim().length === 0) {
        return errorResponse("VALIDATION_ERROR", "Branch name is required", 400);
      }

      const outlet = await createOutlet({
        company_id: targetCompanyId,
        code: code.trim().toUpperCase(),
        name: name.trim(),
        city: parseStringOptional(city, 96),
        address_line1: parseStringOptional(address_line1, 191),
        address_line2: parseStringOptional(address_line2, 191),
        postal_code: parseStringOptional(postal_code, 20),
        phone: parseStringOptional(phone, 32),
        email: parseEmailOptional(email),
        timezone: parseStringOptional(timezone, 64),
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
  [
    requireAccess({
      roles: ["OWNER", "COMPANY_ADMIN", "ADMIN", "SUPER_ADMIN"],
      module: "outlets",
      permission: "create"
    })
  ]
);
