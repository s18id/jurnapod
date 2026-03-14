// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { NumericIdSchema } from "@jurnapod/shared";
import { ZodError } from "zod";
import { requireAccess, withAuth } from "../../../../src/lib/auth-guard";
import { checkUserAccess } from "../../../../src/lib/auth";
import { readClientIp } from "../../../../src/lib/request-meta";
import { errorResponse, successResponse } from "../../../../src/lib/response";
import { getOutlet, updateOutlet, deleteOutlet, OutletNotFoundError } from "../../../../src/lib/outlets";

function parseOutletId(request: Request): number {
  const pathname = new URL(request.url).pathname;
  const outletIdRaw = pathname.split("/").filter(Boolean).pop();
  return NumericIdSchema.parse(outletIdRaw);
}

async function resolveCompanyId(request: Request, auth: { userId: number; companyId: number }): Promise<number> {
  const companyIdRaw = new URL(request.url).searchParams.get("company_id");
  if (!companyIdRaw) {
    return auth.companyId;
  }

  const companyId = NumericIdSchema.parse(companyIdRaw);
  if (companyId !== auth.companyId) {
    const access = await checkUserAccess({
      userId: auth.userId,
      companyId: auth.companyId,
      allowedRoles: ["SUPER_ADMIN"]
    });
    const isSuperAdmin = access?.isSuperAdmin ?? false;
    if (!isSuperAdmin) {
      throw new Error("COMPANY_MISMATCH");
    }
  }

  return companyId;
}

function parseStringOptional(value: unknown, maxLength: number): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }
  if (trimmed.length > maxLength) {
    return undefined;
  }
  return trimmed;
}

function parseEmailOptional(value: unknown): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
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

function parseBooleanOptional(value: unknown): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    if (value.toLowerCase() === "true") return true;
    if (value.toLowerCase() === "false") return false;
  }
  return undefined;
}

export const GET = withAuth(
  async (request, _auth) => {
    try {
      const outletId = parseOutletId(request);
      const companyId = await resolveCompanyId(request, _auth);
      const outlet = await getOutlet(companyId, outletId);
      return successResponse(outlet);
    } catch (error) {
      if (error instanceof ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }
      if (error instanceof Error && error.message === "COMPANY_MISMATCH") {
        return errorResponse("COMPANY_MISMATCH", "Company ID mismatch", 400);
      }
      if (error instanceof OutletNotFoundError) {
        return errorResponse("NOT_FOUND", error.message, 404);
      }
      console.error("GET /api/outlets/:id failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Outlet request failed", 500);
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

export const PATCH = withAuth(
  async (request, _auth) => {
    try {
      const outletId = parseOutletId(request);
      const companyId = await resolveCompanyId(request, _auth);
      const body = await request.json();
      const { name, city, address_line1, address_line2, postal_code, phone, email, timezone, is_active } = body;

      const updateData: Parameters<typeof updateOutlet>[0] = {
        companyId,
        outletId,
        actor: {
          userId: _auth.userId,
          ipAddress: readClientIp(request)
        }
      };

      // Only include name if provided and non-empty
      if (name !== undefined) {
        if (!name || typeof name !== "string" || name.trim().length === 0) {
          return errorResponse("VALIDATION_ERROR", "Branch name is required", 400);
        }
        updateData.name = name.trim();
      }

      // Profile fields - allow null to clear
      const parsedCity = parseStringOptional(city, 96);
      if (parsedCity !== undefined) updateData.city = parsedCity;

      const parsedAddress1 = parseStringOptional(address_line1, 191);
      if (parsedAddress1 !== undefined) updateData.address_line1 = parsedAddress1;

      const parsedAddress2 = parseStringOptional(address_line2, 191);
      if (parsedAddress2 !== undefined) updateData.address_line2 = parsedAddress2;

      const parsedPostalCode = parseStringOptional(postal_code, 20);
      if (parsedPostalCode !== undefined) updateData.postal_code = parsedPostalCode;

      const parsedPhone = parseStringOptional(phone, 32);
      if (parsedPhone !== undefined) updateData.phone = parsedPhone;

      const parsedEmail = parseEmailOptional(email);
      if (parsedEmail !== undefined) updateData.email = parsedEmail;

      const parsedTimezone = parseStringOptional(timezone, 64);
      if (parsedTimezone !== undefined) updateData.timezone = parsedTimezone;

      const parsedIsActive = parseBooleanOptional(is_active);
      if (parsedIsActive !== undefined) updateData.is_active = parsedIsActive;

      const outlet = await updateOutlet(updateData);

      return successResponse(outlet);
    } catch (error) {
      if (error instanceof ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }
      if (error instanceof Error && error.message === "COMPANY_MISMATCH") {
        return errorResponse("COMPANY_MISMATCH", "Company ID mismatch", 400);
      }
      if (error instanceof OutletNotFoundError) {
        return errorResponse("NOT_FOUND", error.message, 404);
      }
      console.error("PATCH /api/outlets/:id failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Outlet request failed", 500);
    }
  },
  [
    requireAccess({
      roles: ["OWNER", "COMPANY_ADMIN", "ADMIN", "SUPER_ADMIN"],
      module: "outlets",
      permission: "update"
    })
  ]
);

export const DELETE = withAuth(
  async (request, _auth) => {
    try {
      const outletId = parseOutletId(request);
      const companyId = await resolveCompanyId(request, _auth);
      await deleteOutlet({
        companyId,
        outletId,
        actor: {
          userId: _auth.userId,
          ipAddress: readClientIp(request)
        }
      });
      return successResponse(null);
    } catch (error) {
      if (error instanceof ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }
      if (error instanceof Error && error.message === "COMPANY_MISMATCH") {
        return errorResponse("COMPANY_MISMATCH", "Company ID mismatch", 400);
      }
      if (error instanceof OutletNotFoundError) {
        return errorResponse("NOT_FOUND", error.message, 404);
      }
      if (error instanceof Error && error.message.includes("Cannot delete outlet")) {
        return errorResponse("OUTLET_IN_USE", error.message, 409);
      }
      console.error("DELETE /api/outlets/:id failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Outlet request failed", 500);
    }
  },
  [
    requireAccess({
      roles: ["OWNER", "COMPANY_ADMIN", "ADMIN", "SUPER_ADMIN"],
      module: "outlets",
      permission: "delete"
    })
  ]
);
