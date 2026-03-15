// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { NumericIdSchema } from "@jurnapod/shared";
import { ZodError, z } from "zod";
import { requireAccess, withAuth } from "../../../../../../src/lib/auth-guard";
import { checkUserAccess } from "../../../../../../src/lib/auth";
import { errorResponse, successResponse } from "../../../../../../src/lib/response";
import {
  deleteSetting,
  getSetting,
  SettingNotFoundError
} from "../../../../../../src/lib/settings";

async function isSuperAdmin(auth: { userId: number; companyId: number }) {
  const access = await checkUserAccess({
    userId: auth.userId,
    companyId: auth.companyId,
    allowedRoles: ["SUPER_ADMIN"]
  });
  return access?.isSuperAdmin ?? false;
}

function parsePathParams(request: Request): { companyId: number; key: string } {
  const pathname = new URL(request.url).pathname;
  const parts = pathname.split("/").filter(Boolean);
  const companyIndex = parts.indexOf("companies");
  const companyIdRaw = parts[companyIndex + 1];
  const keyIndex = parts.indexOf("settings");
  const keyRaw = parts[keyIndex + 1];

  return {
    companyId: NumericIdSchema.parse(companyIdRaw),
    key: z.string().min(1).max(64).parse(decodeURIComponent(keyRaw))
  };
}

export const GET = withAuth(
  async (request, auth) => {
    try {
      const { companyId, key } = parsePathParams(request);
      const superAdmin = await isSuperAdmin(auth);

      if (!superAdmin && companyId !== auth.companyId) {
        return errorResponse("FORBIDDEN", "Cannot access another company's settings", 403);
      }

      const url = new URL(request.url);
      const outletId = url.searchParams.get("outlet_id");
      const outletIdParam = outletId === null ? null : NumericIdSchema.parse(outletId);

      const setting = await getSetting({ companyId, key, outletId: outletIdParam });

      if (!setting) {
        return errorResponse("NOT_FOUND", "Setting not found", 404);
      }

      return successResponse(setting);
    } catch (error) {
      if (error instanceof ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }
      console.error("GET /api/companies/:id/settings/:key failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Setting request failed", 500);
    }
  },
  [requireAccess({ roles: ["OWNER", "COMPANY_ADMIN", "ADMIN", "SUPER_ADMIN"], module: "settings", permission: "read" })]
);

export const DELETE = withAuth(
  async (request, auth) => {
    try {
      const { companyId, key } = parsePathParams(request);
      const superAdmin = await isSuperAdmin(auth);

      if (!superAdmin && companyId !== auth.companyId) {
        return errorResponse("FORBIDDEN", "Cannot delete another company's settings", 403);
      }

      const url = new URL(request.url);
      const outletId = url.searchParams.get("outlet_id");
      const outletIdParam = outletId === null ? null : NumericIdSchema.parse(outletId);

      await deleteSetting({ companyId, key, outletId: outletIdParam });

      return successResponse(null);
    } catch (error) {
      if (error instanceof ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }
      if (error instanceof SettingNotFoundError) {
        return errorResponse("NOT_FOUND", error.message, 404);
      }
      console.error("DELETE /api/companies/:id/settings/:key failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Setting delete failed", 500);
    }
  },
  [requireAccess({ roles: ["OWNER", "COMPANY_ADMIN", "ADMIN", "SUPER_ADMIN"], module: "settings", permission: "delete" })]
);
