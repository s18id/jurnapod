// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { NumericIdSchema } from "@jurnapod/shared";
import { ZodError, z } from "zod";
import { requireAccess, withAuth } from "../../../../../src/lib/auth-guard";
import { checkUserAccess } from "../../../../../src/lib/auth";
import { readClientIp } from "../../../../../src/lib/request-meta";
import { errorResponse, successResponse } from "../../../../../src/lib/response";
import {
  listSettings,
  setSetting,
  SettingNotFoundError,
  SettingValidationError,
  SettingKeyInvalidError
} from "../../../../../src/lib/settings";

const singleSettingSchema = z
  .object({
    key: z.string().min(1).max(64),
    value: z.union([z.string(), z.number(), z.boolean(), z.record(z.unknown())]),
    value_type: z.enum(["string", "number", "boolean", "json"]),
    outlet_id: NumericIdSchema.nullable().optional()
  })
  .strict();

const batchSetSettingsSchema = z
  .object({
    settings: z.array(singleSettingSchema).min(1).max(50)
  })
  .strict();

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
  const parts = pathname.split("/").filter(Boolean);
  const companyIndex = parts.indexOf("companies");
  const companyIdRaw = parts[companyIndex + 1];
  return NumericIdSchema.parse(companyIdRaw);
}

export const GET = withAuth(
  async (request, auth) => {
    try {
      const companyId = parseCompanyId(request);
      const superAdmin = await isSuperAdmin(auth);

      if (!superAdmin && companyId !== auth.companyId) {
        return errorResponse("FORBIDDEN", "Cannot access another company's settings", 403);
      }

      const url = new URL(request.url);
      const query = z
        .object({
          outlet_id: NumericIdSchema.nullable().optional(),
          search: z.string().optional()
        })
        .strict()
        .parse({
          outlet_id: url.searchParams.get("outlet_id"),
          search: url.searchParams.get("search")
        });

      const settings = await listSettings({
        companyId,
        outletId: query.outlet_id,
        search: query.search
      });

      return successResponse(settings);
    } catch (error) {
      if (error instanceof ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }
      console.error("GET /api/companies/:id/settings failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Settings request failed", 500);
    }
  },
  [requireAccess({ roles: ["OWNER", "COMPANY_ADMIN", "ADMIN", "SUPER_ADMIN"], module: "settings", permission: "read" })]
);

export const PATCH = withAuth(
  async (request, auth) => {
    try {
      const companyId = parseCompanyId(request);
      const superAdmin = await isSuperAdmin(auth);

      if (!superAdmin && companyId !== auth.companyId) {
        return errorResponse("FORBIDDEN", "Cannot modify another company's settings", 403);
      }

      const body = await request.json();
      const input = batchSetSettingsSchema.parse(body);

      const results = await Promise.all(
        input.settings.map((setting) =>
          setSetting({
            companyId,
            key: setting.key,
            value: setting.value,
            valueType: setting.value_type,
            outletId: setting.outlet_id,
            actor: {
              userId: auth.userId,
              ipAddress: readClientIp(request) ?? "0.0.0.0"
            }
          })
        )
      );

      return successResponse(results);
    } catch (error) {
      if (error instanceof ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }
      if (error instanceof SettingKeyInvalidError) {
        return errorResponse("INVALID_REQUEST", error.message, 400);
      }
      if (error instanceof SettingValidationError) {
        return errorResponse("INVALID_REQUEST", error.message, 400);
      }
      console.error("PATCH /api/companies/:id/settings failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Settings update failed", 500);
    }
  },
  [requireAccess({ roles: ["OWNER", "COMPANY_ADMIN", "ADMIN", "SUPER_ADMIN"], module: "settings", permission: "update" })]
);
