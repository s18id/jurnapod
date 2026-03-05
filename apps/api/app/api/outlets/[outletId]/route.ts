// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { NumericIdSchema } from "@jurnapod/shared";
import { ZodError } from "zod";
import { requireAccess, withAuth } from "../../../../src/lib/auth-guard";
import { userHasAnyRole } from "../../../../src/lib/auth";
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
    const isSuperAdmin = await userHasAnyRole(auth.userId, auth.companyId, ["SUPER_ADMIN"]);
    if (!isSuperAdmin) {
      throw new Error("COMPANY_MISMATCH");
    }
  }

  return companyId;
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
      const { name } = body;

      if (!name || typeof name !== "string" || name.trim().length === 0) {
        return errorResponse("VALIDATION_ERROR", "Outlet name is required", 400);
      }

      const outlet = await updateOutlet({
        companyId,
        outletId,
        name: name.trim(),
        actor: {
          userId: _auth.userId,
          ipAddress: readClientIp(request)
        }
      });

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
