// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { NumericIdSchema, FlexibleSettingKeySchema } from "@jurnapod/shared";
import { ZodError } from "zod";
import { requireAccess, withAuth } from "@/lib/auth-guard";
import { checkUserAccess } from "@/lib/auth";
import { readClientIp } from "@/lib/request-meta";
import { errorResponse, successResponse } from "@/lib/response";
import { getSetting, deleteSetting, SettingNotFoundError, SettingValidationError, SettingKeyInvalidError } from "@/lib/settings";

function parseOutletId(request: Request): number {
  const pathname = new URL(request.url).pathname;
  const parts = pathname.split("/").filter(Boolean);
  const outletIndex = parts.indexOf("outlets") + 1;
  return NumericIdSchema.parse(parts[outletIndex]);
}

function parseKey(request: Request): string {
  const pathname = new URL(request.url).pathname;
  const parts = pathname.split("/").filter(Boolean);
  const keyIndex = parts.indexOf("settings") + 1;
  return FlexibleSettingKeySchema.parse(parts[keyIndex]);
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

export const GET = withAuth(
  async (request, _auth) => {
    try {
      const outletId = parseOutletId(request);
      const key = parseKey(request);
      const companyId = await resolveCompanyId(request, _auth);

      const setting = await getSetting({ companyId, key, outletId });

      if (!setting) {
        return errorResponse("NOT_FOUND", `Setting '${key}' not found`, 404);
      }

      return successResponse(setting);
    } catch (error) {
      if (error instanceof ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }
      if (error instanceof Error && error.message === "COMPANY_MISMATCH") {
        return errorResponse("COMPANY_MISMATCH", "Company ID mismatch", 400);
      }
      console.error("GET /api/outlets/:id/settings/:key failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Setting request failed", 500);
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

export const DELETE = withAuth(
  async (request, _auth) => {
    try {
      const outletId = parseOutletId(request);
      const key = parseKey(request);
      const companyId = await resolveCompanyId(request, _auth);

      await deleteSetting({ companyId, key, outletId });

      return successResponse(null);
    } catch (error) {
      if (error instanceof ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }
      if (error instanceof Error && error.message === "COMPANY_MISMATCH") {
        return errorResponse("COMPANY_MISMATCH", "Company ID mismatch", 400);
      }
      if (error instanceof SettingNotFoundError) {
        return errorResponse("NOT_FOUND", error.message, 404);
      }
      console.error("DELETE /api/outlets/:id/settings/:key failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Setting request failed", 500);
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
