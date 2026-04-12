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
import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
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
import { getSetting, setSetting } from "../lib/settings.js";

declare module "hono" {
  interface ContextVariableMap {
    auth: AuthContext;
  }
}

// =============================================================================
// Constants
// =============================================================================

// Note: We use module permissions (bitmask) for access control
// Canonical permission bits: read=1, create=2, update=4, delete=8, analyze=16, manage=32

function normalizeSettingValueType(valueType: string): "string" | "number" | "boolean" {
  if (valueType === "int" || valueType === "number") {
    return "number";
  }
  if (valueType === "boolean") {
    return "boolean";
  }
  return "string";
}

// =============================================================================
// Request Schemas
// =============================================================================

export const GetConfigSchema = z.object({
  outlet_id: NumericIdSchema,
  keys: z.string().min(1) // comma-separated keys
});

export const UpdateConfigSchema = z.object({
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
    module: "platform", resource: "settings",
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
        // Map registry value types to API value types (same mapping as PATCH/UPDATE)
        let defaultValueType: "string" | "number" | "boolean" = "string";
        if (registryEntry.valueType === "boolean") {
          defaultValueType = "boolean";
        } else if (registryEntry.valueType === "int") {
          defaultValueType = "number";
        } else if (registryEntry.valueType === "enum") {
          defaultValueType = "string";
        }
        settings.push({
          key,
          value: registryEntry.defaultValue,
          value_type: defaultValueType
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
    module: "platform", resource: "settings",
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

      // Validate and coerce value using registry schema
      let validatedValue: string | number | boolean;
      try {
        validatedValue = registryEntry.schema.parse(item.value) as string | number | boolean;
      } catch {
        return errorResponse(
          "INVALID_REQUEST",
          `Invalid value for ${item.key}: expected ${registryEntry.valueType}`,
          400
        );
      }

      // Map registry value types to storage value types
      let valueType: "string" | "number" | "boolean" = "string";
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
        
      });

      results.push({
        key: setting.key,
        value: setting.value,
        value_type: normalizeSettingValueType(setting.value_type)
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
    module: "platform", resource: "settings",
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

      // Validate and coerce value using registry schema
      let validatedValue: string | number | boolean;
      try {
        validatedValue = registryEntry.schema.parse(item.value) as string | number | boolean;
      } catch {
        return errorResponse(
          "INVALID_REQUEST",
          `Invalid value for ${item.key}: expected ${registryEntry.valueType}`,
          400
        );
      }

      // Map registry value types to storage value types
      let valueType: "string" | "number" | "boolean" = "string";
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
        
      });

      results.push({
        key: setting.key,
        value: setting.value,
        value_type: normalizeSettingValueType(setting.value_type)
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

// ============================================================================
// OpenAPI Route Registration
// ============================================================================

type OpenAPIHonoInterface = {
  openapi: OpenAPIHono["openapi"];
};

const ErrorResponseSchema = z.object({
  success: z.boolean(),
  error: z.object({
    code: z.string(),
    message: z.string()
  })
}).openapi("ErrorResponse");

const GetConfigQuerySchema = z.object({
  outlet_id: z.string(),
  keys: z.string()
});

const SettingItemSchema = z.object({
  key: z.string(),
  value: z.unknown()
});

const UpdateConfigRequestSchema = z.object({
  outlet_id: NumericIdSchema,
  settings: z.array(SettingItemSchema)
});

const SettingResponseItemSchema = z.object({
  key: z.string(),
  value: z.unknown(),
  value_type: z.string()
});

const SettingsConfigResponseSchema = z.object({
  success: z.boolean(),
  data: z.object({
    outlet_id: z.number(),
    settings: z.array(SettingResponseItemSchema)
  })
}).openapi("SettingsConfigResponse");

export const registerSettingsConfigRoutes = (app: OpenAPIHonoInterface): void => {
  // GET /settings/config - Get config values for an outlet
  app.openapi(
    createRoute({
      method: "get",
      path: "/settings/config",
      tags: ["Settings"],
      summary: "Get config values",
      description: "Get configuration values for an outlet",
      security: [{ BearerAuth: [] }],
      request: {
        query: GetConfigQuerySchema
      },
      responses: {
        200: { content: { "application/json": { schema: SettingsConfigResponseSchema } }, description: "Settings retrieved" },
        400: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Invalid request" },
        401: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Unauthorized" },
        500: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Internal server error" }
      }
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (c: any) => {
      try {
        const auth = c.get("auth");
        const accessResult = await requireAccess({ module: "platform", resource: "settings", permission: "read" })(c.req.raw, auth);
        if (accessResult !== null) return accessResult;

        const url = new URL(c.req.raw.url);
        const outletIdParam = url.searchParams.get("outlet_id");
        const keysParam = url.searchParams.get("keys");

        if (!outletIdParam || !keysParam) {
          return c.json({ success: false, error: { code: "INVALID_REQUEST", message: "outlet_id and keys are required" } }, 400);
        }

        const outletId = NumericIdSchema.parse(Number(outletIdParam));
        const keys = keysParam.split(",").map((k) => k.trim());

        const validKeys: SettingKey[] = [];
        for (const key of keys) {
          if (key in SETTINGS_REGISTRY) {
            validKeys.push(key as SettingKey);
          }
        }

        if (validKeys.length === 0) {
          return c.json({ success: false, error: { code: "INVALID_REQUEST", message: "No valid keys provided" } }, 400);
        }

        const settings: Array<{ key: string; value: unknown; value_type: string }> = [];
        
        for (const key of validKeys) {
          let setting = await getSetting({ companyId: auth.companyId, key, outletId });
          if (!setting) {
            setting = await getSetting({ companyId: auth.companyId, key, outletId: null });
          }
          const registryEntry = SETTINGS_REGISTRY[key];
          if (!setting) {
            // Map registry value types to API value types (same mapping as PATCH/UPDATE)
            let defaultValueType: "string" | "number" | "boolean" = "string";
            if (registryEntry.valueType === "boolean") {
              defaultValueType = "boolean";
            } else if (registryEntry.valueType === "int") {
              defaultValueType = "number";
            } else if (registryEntry.valueType === "enum") {
              defaultValueType = "string";
            }
            settings.push({ key, value: registryEntry.defaultValue, value_type: defaultValueType });
          } else {
            settings.push({ key: setting.key, value: setting.value, value_type: normalizeSettingValueType(setting.value_type) });
          }
        }

        return c.json({ success: true, data: { outlet_id: outletId, settings } });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return c.json({ success: false, error: { code: "INVALID_REQUEST", message: "Invalid parameters" } }, 400);
        }
        console.error("GET /settings/config failed", error);
        return c.json({ success: false, error: { code: "INTERNAL_ERROR", message: "Failed to fetch settings" } }, 500);
      }
    }
  );

  // PATCH /settings/config - Update config values for an outlet
  app.openapi(
    createRoute({
      method: "patch",
      path: "/settings/config",
      tags: ["Settings"],
      summary: "Update config values",
      description: "Update configuration values for an outlet",
      security: [{ BearerAuth: [] }],
      request: {
        body: {
          content: {
            "application/json": { schema: UpdateConfigRequestSchema }
          }
        }
      },
      responses: {
        200: { content: { "application/json": { schema: SettingsConfigResponseSchema } }, description: "Settings updated" },
        400: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Invalid request" },
        401: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Unauthorized" },
        500: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Internal server error" }
      }
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (c: any) => {
      try {
        const auth = c.get("auth");
        const accessResult = await requireAccess({ module: "platform", resource: "settings", permission: "update" })(c.req.raw, auth);
        if (accessResult !== null) return accessResult;

        const payload = await c.req.json();
        const input = UpdateConfigSchema.parse(payload);

        const results: Array<{ key: string; value: unknown; value_type: string }> = [];

        for (const item of input.settings) {
          if (!(item.key in SETTINGS_REGISTRY)) {
            return c.json({ success: false, error: { code: "INVALID_REQUEST", message: `Invalid setting key: ${item.key}` } }, 400);
          }

          const registryEntry = SETTINGS_REGISTRY[item.key as SettingKey];
          let validatedValue: string | number | boolean;
          try {
            validatedValue = registryEntry.schema.parse(item.value) as string | number | boolean;
          } catch {
            return c.json({ success: false, error: { code: "INVALID_REQUEST", message: `Invalid value for ${item.key}: expected ${registryEntry.valueType}` } }, 400);
          }

          let valueType: "string" | "number" | "boolean" = "string";
          if (registryEntry.valueType === "boolean") {
            valueType = "boolean";
          } else if (registryEntry.valueType === "int") {
            valueType = "number";
          } else if (registryEntry.valueType === "enum") {
            valueType = "string";
          }

          const setting = await setSetting({ companyId: auth.companyId, key: item.key, value: validatedValue, valueType, outletId: input.outlet_id });
          results.push({ key: setting.key, value: setting.value, value_type: normalizeSettingValueType(setting.value_type) });
        }

        return c.json({ success: true, data: { outlet_id: input.outlet_id, settings: results } });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return c.json({ success: false, error: { code: "INVALID_REQUEST", message: "Invalid request body" } }, 400);
        }
        console.error("PATCH /settings/config failed", error);
        return c.json({ success: false, error: { code: "INTERNAL_ERROR", message: "Failed to update settings" } }, 500);
      }
    }
  );

  // PUT /settings/config - Update config values for an outlet (same as PATCH)
  app.openapi(
    createRoute({
      method: "put",
      path: "/settings/config",
      tags: ["Settings"],
      summary: "Replace config values",
      description: "Replace configuration values for an outlet",
      security: [{ BearerAuth: [] }],
      request: {
        body: {
          content: {
            "application/json": { schema: UpdateConfigRequestSchema }
          }
        }
      },
      responses: {
        200: { content: { "application/json": { schema: SettingsConfigResponseSchema } }, description: "Settings replaced" },
        400: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Invalid request" },
        401: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Unauthorized" },
        500: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Internal server error" }
      }
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (c: any) => {
      try {
        const auth = c.get("auth");
        const accessResult = await requireAccess({ module: "platform", resource: "settings", permission: "update" })(c.req.raw, auth);
        if (accessResult !== null) return accessResult;

        const payload = await c.req.json();
        const input = UpdateConfigSchema.parse(payload);

        const results: Array<{ key: string; value: unknown; value_type: string }> = [];

        for (const item of input.settings) {
          if (!(item.key in SETTINGS_REGISTRY)) {
            return c.json({ success: false, error: { code: "INVALID_REQUEST", message: `Invalid setting key: ${item.key}` } }, 400);
          }

          const registryEntry = SETTINGS_REGISTRY[item.key as SettingKey];
          let validatedValue: string | number | boolean;
          try {
            validatedValue = registryEntry.schema.parse(item.value) as string | number | boolean;
          } catch {
            return c.json({ success: false, error: { code: "INVALID_REQUEST", message: `Invalid value for ${item.key}: expected ${registryEntry.valueType}` } }, 400);
          }

          let valueType: "string" | "number" | "boolean" = "string";
          if (registryEntry.valueType === "boolean") {
            valueType = "boolean";
          } else if (registryEntry.valueType === "int") {
            valueType = "number";
          } else if (registryEntry.valueType === "enum") {
            valueType = "string";
          }

          const setting = await setSetting({ companyId: auth.companyId, key: item.key, value: validatedValue, valueType, outletId: input.outlet_id });
          results.push({ key: setting.key, value: setting.value, value_type: normalizeSettingValueType(setting.value_type) });
        }

        return c.json({ success: true, data: { outlet_id: input.outlet_id, settings: results } });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return c.json({ success: false, error: { code: "INVALID_REQUEST", message: "Invalid request body" } }, 400);
        }
        console.error("PUT /settings/config failed", error);
        return c.json({ success: false, error: { code: "INTERNAL_ERROR", message: "Failed to update settings" } }, 500);
      }
    }
  );
};

export { settingsConfigRoutes };
