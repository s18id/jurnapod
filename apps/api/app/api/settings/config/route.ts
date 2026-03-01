// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { z } from "zod";
import type { RowDataPacket } from "mysql2";
import {
  SettingKeySchema,
  SETTINGS_REGISTRY,
  SettingsConfigUpdateSchema,
  parseSettingValue,
  type SettingKey,
  type SettingValue
} from "@jurnapod/shared";
import { requireAccess, withAuth } from "../../../../src/lib/auth-guard";
import { userHasOutletAccess } from "../../../../src/lib/auth";
import { getDbPool } from "../../../../src/lib/db";
import { getAuditService } from "../../../../src/lib/audit";
import { readClientIp } from "../../../../src/lib/request-meta";

const querySchema = z.object({
  outlet_id: z.coerce.number().int().positive(),
  keys: z.string().trim().min(1)
});

const SETTINGS_ENV_KEYS: Record<SettingKey, string> = {
  "feature.pos.auto_sync_enabled": "JP_FEATURE_POS_AUTO_SYNC_ENABLED",
  "feature.pos.sync_interval_seconds": "JP_FEATURE_POS_SYNC_INTERVAL_SECONDS",
  "feature.sales.tax_included_default": "JP_FEATURE_SALES_TAX_INCLUDED_DEFAULT",
  "feature.inventory.allow_backorder": "JP_FEATURE_INVENTORY_ALLOW_BACKORDER",
  "feature.purchasing.require_approval": "JP_FEATURE_PURCHASING_REQUIRE_APPROVAL",
  "inventory.low_stock_threshold": "JP_INVENTORY_LOW_STOCK_THRESHOLD",
  "inventory.reorder_point": "JP_INVENTORY_REORDER_POINT",
  "inventory.allow_negative_stock": "JP_INVENTORY_ALLOW_NEGATIVE_STOCK",
  "inventory.costing_method": "JP_INVENTORY_COSTING_METHOD",
  "inventory.warn_on_negative": "JP_INVENTORY_WARN_ON_NEGATIVE"
};

function errorResponse(code: string, message: string, status: number) {
  return Response.json(
    {
      ok: false,
      error: {
        code,
        message
      }
    },
    { status }
  );
}

function parseKeys(rawKeys: string): SettingKey[] {
  const keys = rawKeys
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  const parsed = z.array(SettingKeySchema).min(1).parse(keys);
  return Array.from(new Set(parsed));
}

function parseStoredValue(key: SettingKey, valueJson: string): SettingValue | null {
  try {
    const parsed = JSON.parse(valueJson);
    return parseSettingValue(key, parsed);
  } catch {
    return null;
  }
}

function readEnvFallback(key: SettingKey): SettingValue | null {
  const envKey = SETTINGS_ENV_KEYS[key];
  const rawValue = process.env[envKey];
  if (!rawValue || rawValue.trim().length === 0) {
    return null;
  }

  try {
    return parseSettingValue(key, rawValue);
  } catch {
    return null;
  }
}

export const GET = withAuth(
  async (request, auth) => {
    try {
      const url = new URL(request.url);
      const parsed = querySchema.parse({
        outlet_id: url.searchParams.get("outlet_id"),
        keys: url.searchParams.get("keys")
      });

      const hasAccess = await userHasOutletAccess(auth.userId, auth.companyId, parsed.outlet_id);
      if (!hasAccess) {
        return errorResponse("FORBIDDEN", "Forbidden", 403);
      }

      const keys = parseKeys(parsed.keys);
      const placeholders = keys.map(() => "?").join(", ");
      const pool = getDbPool();
      const [rows] = await pool.execute<RowDataPacket[]>(
        `SELECT \`key\`, value_type, value_json
         FROM company_settings
         WHERE company_id = ?
           AND outlet_id = ?
           AND \`key\` IN (${placeholders})`,
        [auth.companyId, parsed.outlet_id, ...keys]
      );

      const rowMap = new Map<string, { value_type: string; value_json: string }>();
      rows.forEach((row) => {
        rowMap.set(String(row.key), {
          value_type: String(row.value_type),
          value_json: String(row.value_json)
        });
      });

      const settings = keys.map((key) => {
        const stored = rowMap.get(key);
        const storedValue = stored ? parseStoredValue(key, stored.value_json) : null;
        const envValue = storedValue == null ? readEnvFallback(key) : null;
        const resolvedValue = storedValue ?? envValue ?? SETTINGS_REGISTRY[key].defaultValue;

        return {
          key,
          value: resolvedValue,
          value_type: SETTINGS_REGISTRY[key].valueType
        };
      });

      return Response.json(
        {
          ok: true,
          outlet_id: parsed.outlet_id,
          settings
        },
        { status: 200 }
      );
    } catch (error) {
      if (error instanceof z.ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }

      console.error("GET /api/settings/config failed", error);
      return errorResponse("INTERNAL_ERROR", "Internal server error", 500);
    }
  },
  [requireAccess({ roles: ["OWNER", "ADMIN", "ACCOUNTANT"], module: "settings", permission: "read" })]
);

export const PUT = withAuth(
  async (request, auth) => {
    try {
      const payload = await request.json();
      const parsed = SettingsConfigUpdateSchema.parse(payload);

      const hasAccess = await userHasOutletAccess(auth.userId, auth.companyId, parsed.outlet_id);
      if (!hasAccess) {
        return errorResponse("FORBIDDEN", "Forbidden", 403);
      }

      if (parsed.settings.length === 0) {
        return errorResponse("INVALID_REQUEST", "No settings provided", 400);
      }

      const normalizedSettings = parsed.settings.map((setting) => {
        const value = parseSettingValue(setting.key, setting.value);
        return {
          key: setting.key,
          value,
          valueType: SETTINGS_REGISTRY[setting.key].valueType,
          valueJson: JSON.stringify(value)
        };
      });

      const pool = getDbPool();
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        for (const setting of normalizedSettings) {
          await connection.execute(
            `INSERT INTO company_settings (
               company_id,
               outlet_id,
               \`key\`,
               value_type,
               value_json,
               created_by_user_id,
               updated_by_user_id
             ) VALUES (?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
               value_type = VALUES(value_type),
               value_json = VALUES(value_json),
               updated_by_user_id = VALUES(updated_by_user_id),
               updated_at = CURRENT_TIMESTAMP`,
            [
              auth.companyId,
              parsed.outlet_id,
              setting.key,
              setting.valueType,
              setting.valueJson,
              auth.userId,
              auth.userId
            ]
          );
        }
        await connection.commit();
      } catch (dbError) {
        await connection.rollback();
        throw dbError;
      } finally {
        connection.release();
      }

      const auditService = getAuditService();
      await auditService.logAction(
        {
          company_id: auth.companyId,
          user_id: auth.userId,
          outlet_id: parsed.outlet_id,
          ip_address: readClientIp(request)
        },
        "setting",
        String(parsed.outlet_id),
        "UPDATE",
        {
          settings: normalizedSettings.map((setting) => ({
            key: setting.key,
            value: setting.value,
            value_type: setting.valueType
          }))
        }
      );

      return Response.json({ ok: true }, { status: 200 });
    } catch (error) {
      if (error instanceof z.ZodError || error instanceof SyntaxError) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }

      console.error("PUT /api/settings/config failed", error);
      return errorResponse("INTERNAL_ERROR", "Internal server error", 500);
    }
  },
  [requireAccess({ roles: ["OWNER", "ADMIN", "ACCOUNTANT"], module: "settings", permission: "update" })]
);
