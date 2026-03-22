// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { z, ZodError } from "zod";
import {
  SettingKeySchema,
  SETTINGS_REGISTRY,
  parseSettingValue,
  type SettingKey
} from "@jurnapod/shared";
import { requireAccess, withAuth } from "../../../../src/lib/auth-guard";
import { getSetting, setSetting } from "../../../../src/lib/settings";
import { getAuditService } from "../../../../src/lib/audit";
import { readClientIp } from "../../../../src/lib/request-meta";
import { errorResponse, successResponse } from "../../../../src/lib/response";

const querySchema = z.object({
  keys: z.string().trim().min(1)
});

const updateSchema = z.object({
  settings: z
    .array(
      z.object({
        key: SettingKeySchema,
        value: z.unknown()
      })
    )
    .min(1)
});

function parseKeys(rawKeys: string): SettingKey[] {
  const keys = rawKeys
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  const parsed = z.array(SettingKeySchema).min(1).parse(keys);
  return Array.from(new Set(parsed));
}

export const GET = withAuth(
  async (request, auth) => {
    try {
      const url = new URL(request.url);
      const parsed = querySchema.parse({ keys: url.searchParams.get("keys") });
      const keys = parseKeys(parsed.keys);

      const settings = await Promise.all(
        keys.map(async (key) => {
          const stored = await getSetting({ companyId: auth.companyId, key, outletId: null });
          const value = stored?.value ?? SETTINGS_REGISTRY[key].defaultValue;
          return {
            key,
            value,
            value_type: SETTINGS_REGISTRY[key].valueType
          };
        })
      );

      return successResponse({ settings });
    } catch (error) {
      if (error instanceof ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }

      console.error("GET /api/settings/company-config failed", error);
      return errorResponse("INTERNAL_ERROR", "Internal server error", 500);
    }
  },
  [requireAccess({ roles: ["OWNER", "COMPANY_ADMIN", "ADMIN", "ACCOUNTANT"], module: "settings", permission: "read" })]
);

export const PUT = withAuth(
  async (request, auth) => {
    try {
      const payload = await request.json();
      const parsed = updateSchema.parse(payload);

      const normalizedSettings = parsed.settings.map((setting) => ({
        key: setting.key,
        value: parseSettingValue(setting.key, setting.value),
        valueType: SETTINGS_REGISTRY[setting.key].valueType
      }));

      const before = await Promise.all(
        normalizedSettings.map(async (setting) => {
          const existing = await getSetting({
            companyId: auth.companyId,
            key: setting.key,
            outletId: null
          });
          return [setting.key, existing?.value ?? null] as const;
        })
      );

      await Promise.all(
        normalizedSettings.map(async (setting) => {
          await setSetting({
            companyId: auth.companyId,
            key: setting.key,
            value: setting.value,
            valueType: mapRegistryTypeToFlexibleType(setting.valueType),
            outletId: null,
            actor: {
              userId: auth.userId,
              ipAddress: readClientIp(request) ?? ""
            }
          });
        })
      );

      const auditService = getAuditService();
      await auditService.logAction(
        {
          company_id: auth.companyId,
          user_id: auth.userId,
          outlet_id: null,
          ip_address: readClientIp(request)
        },
        "setting",
        "company_config",
        "UPDATE",
        {
          before: Object.fromEntries(before),
          after: Object.fromEntries(normalizedSettings.map((setting) => [setting.key, setting.value]))
        }
      );

      return successResponse(null);
    } catch (error) {
      if (error instanceof SyntaxError || error instanceof ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }

      console.error("PUT /api/settings/company-config failed", error);
      return errorResponse("INTERNAL_ERROR", "Internal server error", 500);
    }
  },
  [requireAccess({ roles: ["OWNER", "COMPANY_ADMIN", "ADMIN", "ACCOUNTANT"], module: "settings", permission: "update" })]
);
function mapRegistryTypeToFlexibleType(valueType: "int" | "boolean" | "enum"): "number" | "boolean" | "string" {
  if (valueType === "int") {
    return "number";
  }
  if (valueType === "enum") {
    return "string";
  }
  return "boolean";
}
