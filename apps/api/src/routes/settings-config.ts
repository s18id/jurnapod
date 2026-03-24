// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Settings Config Routes
 *
 * Routes for reading/writing company settings:
 * - GET /settings/config - Get config values for an outlet
 * - PATCH /settings/config - Update config values for an outlet
 */

import { Hono } from "hono";
import { z } from "zod";
import {
  NumericIdSchema,
  SETTINGS_REGISTRY,
  type SettingKey
} from "@jurnapod/shared";
import {
  authenticateRequest,
  requireAccess,
  type AuthContext
} from "../lib/auth-guard.js";
import { errorResponse, successResponse } from "../lib/response.js";
import { listSettings, getSetting, setSetting } from "../lib/settings.js";

declare module "hono" {
  interface ContextVariableMap {
    auth: AuthContext;
  }
}

// =============================================================================
// Constants
// =============================================================================

// Note: We use module permissions (bitmask) for access control
// Permission bitmask: create=1, read=2, update=4, delete=8

// =============================================================================
// Request Schemas
// =============================================================================

const GetConfigSchema = z.object({
  outlet_id: NumericIdSchema,
  keys: z.string().min(1) // comma-separated keys
});

const UpdateConfigSchema = z.object({
  outlet_id: NumericIdSchema,
  settings: z.array(
    z.object({
      key: z.string(),
      value: z.unknown()
    })
  )
});

// =============================================================================
// Settings Config Routes
// =============================================================================

const settingsConfigRoutes = new Hono();

// Auth middleware
settingsConfigRoutes.use("/*", async (c, next) => {
  const authResult = await authenticateRequest(c.req.raw);
  if (!authResult.success) {
    c.status(401);
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Missing or invalid access token" } });
  }
  c.set("auth", authResult.auth);
  await next();
});

// GET /settings/config - Get config values for an outlet
settingsConfigRoutes.get("/", async (c) => {
  const auth = c.get("auth");

  const accessResult = await requireAccess({
    module: "settings",
    permission: "read"
  })(c.req.raw, auth);

  if (accessResult !== null) {
    return accessResult;
  }

  try {
    const url = new URL(c.req.raw.url);
    const outletIdParam = url.searchParams.get("outlet_id");
    const keysParam = url.searchParams.get("keys");

    if (!outletIdParam || !keysParam) {
      return errorResponse("INVALID_REQUEST", "outlet_id and keys are required", 400);
    }

    const outletId = NumericIdSchema.parse(Number(outletIdParam));
    const keys = keysParam.split(",").map((k) => k.trim());

    // Validate keys against registry
    const validKeys: SettingKey[] = [];
    for (const key of keys) {
      if (key in SETTINGS_REGISTRY) {
        validKeys.push(key as SettingKey);
      }
    }

    if (validKeys.length === 0) {
      return errorResponse("INVALID_REQUEST", "No valid keys provided", 400);
    }

    // Fetch each setting individually to handle fallback to company/outlet level
    const settings: Array<{ key: string; value: unknown; value_type: string }> = [];
    
    for (const key of validKeys) {
      // First try outlet-specific setting
      let setting = await getSetting({
        companyId: auth.companyId,
        key,
        outletId
      });

      // Fall back to company-wide setting (outlet_id IS NULL)
      if (!setting) {
        setting = await getSetting({
          companyId: auth.companyId,
          key,
          outletId: null
        });
      }

      // Fall back to default from registry
      const registryEntry = SETTINGS_REGISTRY[key];
      if (!setting) {
        settings.push({
          key,
          value: registryEntry.defaultValue,
          value_type: registryEntry.valueType
        });
      } else {
        settings.push({
          key: setting.key,
          value: setting.value,
          value_type: setting.value_type
        });
      }
    }

    return successResponse({
      outlet_id: outletId,
      settings
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid parameters", 400);
    }

    console.error("GET /settings/config failed", error);
    return errorResponse("INTERNAL_ERROR", "Failed to fetch settings", 500);
  }
});

// PATCH /settings/config - Update config values for an outlet
settingsConfigRoutes.patch("/", async (c) => {
  const auth = c.get("auth");

  const accessResult = await requireAccess({
    module: "settings",
    permission: "update"
  })(c.req.raw, auth);

  if (accessResult !== null) {
    return accessResult;
  }

  try {
    const payload = await c.req.json();
    const input = UpdateConfigSchema.parse(payload);

    const results: Array<{ key: string; value: unknown; value_type: string }> = [];

    for (const item of input.settings) {
      // Validate key exists in registry
      if (!(item.key in SETTINGS_REGISTRY)) {
        return errorResponse("INVALID_REQUEST", `Invalid setting key: ${item.key}`, 400);
      }

      const registryEntry = SETTINGS_REGISTRY[item.key as SettingKey];

      // Validate and coerce value
      let validatedValue: string | number | boolean | Record<string, unknown>;
      try {
        validatedValue = registryEntry.schema.parse(item.value) as string | number | boolean | Record<string, unknown>;
      } catch {
        return errorResponse(
          "INVALID_REQUEST",
          `Invalid value for ${item.key}: expected ${registryEntry.valueType}`,
          400
        );
      }

      // Map registry value types to storage value types
      let valueType: "string" | "number" | "boolean" | "json" = "string";
      if (registryEntry.valueType === "boolean") {
        valueType = "boolean";
      } else if (registryEntry.valueType === "int") {
        valueType = "number";
      } else if (registryEntry.valueType === "enum") {
        valueType = "string";
      }

      // Upsert the setting
      const setting = await setSetting({
        companyId: auth.companyId,
        key: item.key,
        value: validatedValue,
        valueType,
        outletId: input.outlet_id,
        actor: {
          userId: auth.userId,
          ipAddress: c.req.raw.headers.get("x-forwarded-for") ?? "unknown"
        }
      });

      results.push({
        key: setting.key,
        value: setting.value,
        value_type: setting.value_type
      });
    }

    return successResponse({
      outlet_id: input.outlet_id,
      settings: results
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
    }

    console.error("PATCH /settings/config failed", error);
    return errorResponse("INTERNAL_ERROR", "Failed to update settings", 500);
  }
});

// PUT /settings/config - Update config values for an outlet (same as PATCH)
settingsConfigRoutes.put("/", async (c) => {
  const auth = c.get("auth");

  const accessResult = await requireAccess({
    module: "settings",
    permission: "update"
  })(c.req.raw, auth);

  if (accessResult !== null) {
    return accessResult;
  }

  try {
    const payload = await c.req.json();
    const input = UpdateConfigSchema.parse(payload);

    const results: Array<{ key: string; value: unknown; value_type: string }> = [];

    for (const item of input.settings) {
      // Validate key exists in registry
      if (!(item.key in SETTINGS_REGISTRY)) {
        return errorResponse("INVALID_REQUEST", `Invalid setting key: ${item.key}`, 400);
      }

      const registryEntry = SETTINGS_REGISTRY[item.key as SettingKey];

      // Validate and coerce value
      let validatedValue: string | number | boolean | Record<string, unknown>;
      try {
        validatedValue = registryEntry.schema.parse(item.value) as string | number | boolean | Record<string, unknown>;
      } catch {
        return errorResponse(
          "INVALID_REQUEST",
          `Invalid value for ${item.key}: expected ${registryEntry.valueType}`,
          400
        );
      }

      // Map registry value types to storage value types
      let valueType: "string" | "number" | "boolean" | "json" = "string";
      if (registryEntry.valueType === "boolean") {
        valueType = "boolean";
      } else if (registryEntry.valueType === "int") {
        valueType = "number";
      } else if (registryEntry.valueType === "enum") {
        valueType = "string";
      }

      // Upsert the setting
      const setting = await setSetting({
        companyId: auth.companyId,
        key: item.key,
        value: validatedValue,
        valueType,
        outletId: input.outlet_id,
        actor: {
          userId: auth.userId,
          ipAddress: c.req.raw.headers.get("x-forwarded-for") ?? "unknown"
        }
      });

      results.push({
        key: setting.key,
        value: setting.value,
        value_type: setting.value_type
      });
    }

    return successResponse({
      outlet_id: input.outlet_id,
      settings: results
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
    }

    console.error("PUT /settings/config failed", error);
    return errorResponse("INTERNAL_ERROR", "Failed to update settings", 500);
  }
});

export { settingsConfigRoutes };
