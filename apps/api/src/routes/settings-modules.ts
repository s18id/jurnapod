// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Settings Modules Routes
 *
 * Routes for company module settings:
 * - GET /settings/modules - List modules for company
 * - PUT /settings/modules - Update module settings (legacy config_json)
 * - GET /settings/modules/extended - List modules with explicit typed settings
 * - PUT /settings/modules/extended - Update module settings with explicit columns
 */

import { Hono } from "hono";
import { z } from "zod";
import { NumericIdSchema } from "@jurnapod/shared";
import {
  authenticateRequest,
  requireAccess,
  type AuthContext
} from "../lib/auth-guard.js";
import { errorResponse, successResponse } from "../lib/response.js";
import {
  listCompanyModules,
  listCompanyModulesExtended,
  updateCompanyModule,
  updateCompanyModuleExplicit,
  ModuleNotFoundError
} from "../lib/settings-modules.js";
import { setModuleRolePermission } from "../lib/users.js";
import { readClientIp } from "../lib/request-meta.js";
import {
  ExtendedCompanyModulesUpdateSchema,
  ExtendedCompanyModulesResponseSchema,
  ModuleCodeSchema
} from "@jurnapod/shared";

declare module "hono" {
  interface ContextVariableMap {
    auth: AuthContext;
  }
}

// =============================================================================
// Request Schemas
// =============================================================================

export const ModuleUpdateSchema = z.object({
  code: z.string(),
  enabled: z.boolean(),
  config_json: z.string().optional()
});

export const ModulesUpdateSchema = z.object({
  modules: z.array(ModuleUpdateSchema)
});

// =============================================================================
// Modules Routes
// =============================================================================

const modulesRoutes = new Hono();

// Auth middleware
modulesRoutes.use("/*", async (c, next) => {
  const authResult = await authenticateRequest(c.req.raw);
  if (!authResult.success) {
    c.status(401);
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Missing or invalid access token" } });
  }
  c.set("auth", authResult.auth);
  await next();
});

// GET /settings/modules - List modules for company (legacy)
modulesRoutes.get("/", async (c) => {
  try {
    const auth = c.get("auth");

    // Check access permission using bitmask
    const accessResult = await requireAccess({
      module: "settings",
      permission: "read"
    })(c.req.raw, auth);

    if (accessResult !== null) {
      return accessResult;
    }

    const modules = await listCompanyModules(auth.companyId);

    return successResponse(modules);
  } catch (error) {
    console.error("GET /settings/modules failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to list modules", 500);
  }
});

// PUT /settings/modules - Update module settings (legacy config_json)
modulesRoutes.put("/", async (c) => {
  try {
    const auth = c.get("auth");

    // Check access permission using bitmask
    const accessResult = await requireAccess({
      module: "settings",
      permission: "update"
    })(c.req.raw, auth);

    if (accessResult !== null) {
      return accessResult;
    }

    const payload = await c.req.json();
    const input = ModulesUpdateSchema.parse(payload);

    for (const module of input.modules) {
      try {
        await updateCompanyModule(
          auth.companyId,
          module.code,
          module.enabled,
          module.config_json || null
        );
      } catch (error) {
        if (error instanceof ModuleNotFoundError) {
          return errorResponse("NOT_FOUND", error.message, 404);
        }
        throw error;
      }
    }

    return successResponse({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
    }

    console.error("PUT /settings/modules failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to update modules", 500);
  }
});

// GET /settings/modules/extended - List modules with explicit typed settings
modulesRoutes.get("/extended", async (c) => {
  try {
    const auth = c.get("auth");

    // Check access permission using bitmask
    const accessResult = await requireAccess({
      module: "settings",
      permission: "read"
    })(c.req.raw, auth);

    if (accessResult !== null) {
      return accessResult;
    }

    const modules = await listCompanyModulesExtended(auth.companyId);

    return successResponse(modules);
  } catch (error) {
    console.error("GET /settings/modules/extended failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to list extended modules", 500);
  }
});

// PUT /settings/modules/extended - Update module settings with explicit columns
modulesRoutes.put("/extended", async (c) => {
  try {
    const auth = c.get("auth");

    // Check access permission using bitmask
    const accessResult = await requireAccess({
      module: "settings",
      permission: "update"
    })(c.req.raw, auth);

    if (accessResult !== null) {
      return accessResult;
    }

    const payload = await c.req.json();
    const input = ExtendedCompanyModulesUpdateSchema.parse(payload);

    for (const module of input.modules) {
      try {
        await updateCompanyModuleExplicit(auth.companyId, module.code, {
          enabled: module.enabled,
          pos_settings: module.pos_settings,
          inventory_settings: module.inventory_settings,
          sales_settings: module.sales_settings,
          purchasing_settings: module.purchasing_settings
        });
      } catch (error) {
        if (error instanceof ModuleNotFoundError) {
          return errorResponse("NOT_FOUND", error.message, 404);
        }
        throw error;
      }
    }

    return successResponse({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
    }

    console.error("PUT /settings/modules/extended failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to update extended modules", 500);
  }
});

// PUT /settings/module-roles/:roleId/:module - Update module role permission
modulesRoutes.put("/module-roles/:roleId/:module", async (c) => {
  try {
    const auth = c.get("auth");

    // Check access permission using bitmask
    const accessResult = await requireAccess({
      module: "settings",
      permission: "update"
    })(c.req.raw, auth);

    if (accessResult !== null) {
      return accessResult;
    }

    const roleId = NumericIdSchema.parse(c.req.param("roleId"));
    const module = c.req.param("module");

    const payload = await c.req.json();
    const permissionMask = z.number().int().parse(payload.permission_mask);

    const result = await setModuleRolePermission({
      companyId: auth.companyId,
      roleId,
      module,
      permissionMask,
      actor: {
        userId: auth.userId,
        ipAddress: readClientIp(c.req.raw)
      }
    });

    return successResponse(result);
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
    }

    if (error instanceof Error && error.message.includes("not found")) {
      return errorResponse("NOT_FOUND", error.message, 404);
    }

    console.error("PUT /settings/module-roles/:roleId/:module failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to update module role", 500);
  }
});

export { modulesRoutes };
