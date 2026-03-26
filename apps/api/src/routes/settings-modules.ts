// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Settings Modules Routes
 *
 * Routes for company module settings:
 * - GET /settings/modules - List modules for company
 * - PUT /settings/modules - Update module settings
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
import { getDbPool } from "../lib/db.js";
import { setModuleRolePermission } from "../lib/users.js";
import { readClientIp } from "../lib/request-meta.js";

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

// GET /settings/modules - List modules for company
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

    const pool = getDbPool();
    const [rows] = await pool.execute<any[]>(
      `SELECT m.code, m.name, cm.enabled, cm.config_json
       FROM modules m
       INNER JOIN company_modules cm ON cm.module_id = m.id
       WHERE cm.company_id = ?
       ORDER BY m.code ASC`,
      [auth.companyId]
    );

    const modules = rows.map((row) => ({
      code: row.code,
      name: row.name,
      enabled: Boolean(row.enabled),
      config_json: row.config_json
    }));

    return successResponse(modules);
  } catch (error) {
    console.error("GET /settings/modules failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to list modules", 500);
  }
});

// PUT /settings/modules - Update module settings
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

    const pool = getDbPool();

    for (const module of input.modules) {
      // Get module_id from code
      const [moduleRows] = await pool.execute<any[]>(
        `SELECT id FROM modules WHERE code = ? LIMIT 1`,
        [module.code]
      );

      if (moduleRows.length === 0) {
        return errorResponse("NOT_FOUND", `Module ${module.code} not found`, 404);
      }

      const moduleId = moduleRows[0].id;

      // Update or insert company_module
      await pool.execute(
        `INSERT INTO company_modules (company_id, module_id, enabled, config_json, updated_at)
         VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
         ON DUPLICATE KEY UPDATE
           enabled = VALUES(enabled),
           config_json = VALUES(config_json),
           updated_at = CURRENT_TIMESTAMP`,
        [auth.companyId, moduleId, module.enabled ? 1 : 0, module.config_json || null]
      );
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
