// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { NumericIdSchema } from "@jurnapod/shared";
import { ZodError } from "zod";
import { requireAccess, withAuth } from "@/lib/auth-guard";
import { checkUserAccess } from "@/lib/auth";
import { readClientIp } from "@/lib/request-meta";
import { errorResponse, successResponse } from "@/lib/response";
import { deactivateOutlet, OutletNotFoundError } from "@/lib/outlets";

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

export const POST = withAuth(
  async (request, _auth) => {
    try {
      const outletId = parseOutletId(request);
      const companyId = await resolveCompanyId(request, _auth);

      const outlet = await deactivateOutlet({
        companyId,
        outletId,
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
      console.error("POST /api/outlets/:id/deactivate failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Outlet deactivation failed", 500);
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
