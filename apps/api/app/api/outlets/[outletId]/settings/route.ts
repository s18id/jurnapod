// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { NumericIdSchema, OutletSettingCreateSchema, FlexibleSettingValueTypeSchema } from "@jurnapod/shared";
import { ZodError } from "zod";
import { requireAccess, withAuth } from "@/lib/auth-guard";
import { checkUserAccess } from "@/lib/auth";
import { readClientIp } from "@/lib/request-meta";
import { errorResponse, successResponse } from "@/lib/response";
import { listSettings, setSetting, getSetting, SettingValidationError, SettingKeyInvalidError, SettingNotFoundError, type SettingValueType } from "@/lib/settings";

function parseOutletId(request: Request): number {
  const pathname = new URL(request.url).pathname;
  const parts = pathname.split("/").filter(Boolean);
  const outletIndex = parts.indexOf("outlets") + 1;
  return NumericIdSchema.parse(parts[outletIndex]);
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
      const companyId = await resolveCompanyId(request, _auth);

      const url = new URL(request.url);
      const search = url.searchParams.get("search") || undefined;

      const settings = await listSettings({
        companyId,
        outletId,
        search
      });

      return successResponse(settings);
    } catch (error) {
      if (error instanceof ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }
      if (error instanceof Error && error.message === "COMPANY_MISMATCH") {
        return errorResponse("COMPANY_MISMATCH", "Company ID mismatch", 400);
      }
      console.error("GET /api/outlets/:id/settings failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Settings request failed", 500);
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

      const parsed = OutletSettingCreateSchema.parse(body);

      const setting = await setSetting({
        companyId,
        key: parsed.key,
        value: parsed.value as string | number | boolean | Record<string, unknown>,
        valueType: parsed.value_type as SettingValueType,
        outletId,
        actor: {
          userId: _auth.userId,
          ipAddress: readClientIp(request) || "0.0.0.0"
        }
      });

      return successResponse(setting);
    } catch (error) {
      if (error instanceof ZodError) {
        const issues = error.issues.map(i => `${i.path.join('.') || 'request'}: ${i.message}`).join('; ');
        return errorResponse("VALIDATION_ERROR", `Invalid request: ${issues}`, 400);
      }
      if (error instanceof SyntaxError) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }
      if (error instanceof Error && error.message === "COMPANY_MISMATCH") {
        return errorResponse("COMPANY_MISMATCH", "Company ID mismatch", 400);
      }
      if (error instanceof SettingValidationError || error instanceof SettingKeyInvalidError) {
        return errorResponse("VALIDATION_ERROR", error.message, 400);
      }
      console.error("PATCH /api/outlets/:id/settings failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Settings request failed", 500);
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
