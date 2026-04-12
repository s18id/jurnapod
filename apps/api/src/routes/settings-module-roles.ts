// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Settings Module Roles Routes
 *
 * Routes for module role permission management:
 * - PUT /settings/module-roles/:roleId/:module - Update module role permission
 */

import { Hono } from "hono";
import { z } from "zod";
import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { NumericIdSchema } from "@jurnapod/shared";
import {
  authenticateRequest,
  requireAccess,
  type AuthContext
} from "../lib/auth-guard.js";
import { errorResponse, successResponse } from "../lib/response.js";
import { setModuleRolePermission } from "../lib/users.js";
import { readClientIp } from "../lib/request-meta.js";

declare module "hono" {
  interface ContextVariableMap {
    auth: AuthContext;
  }
}

// =============================================================================
// Module Roles Routes
// =============================================================================

const moduleRolesRoutes = new Hono();

// Auth middleware
moduleRolesRoutes.use("/*", async (c, next) => {
  const authResult = await authenticateRequest(c.req.raw);
  if (!authResult.success) {
    c.status(401);
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Missing or invalid access token" } });
  }
  c.set("auth", authResult.auth);
  await next();
});

// PUT /settings/module-roles/:roleId/:module - Update module role permission
moduleRolesRoutes.put("/:roleId/:module", async (c) => {
  try {
    const auth = c.get("auth");

    // Check access permission using bitmask
    const accessResult = await requireAccess({
      module: "platform", resource: "settings",
      permission: "update"
    })(c.req.raw, auth);

    if (accessResult !== null) {
      return accessResult;
    }

    const roleId = NumericIdSchema.parse(c.req.param("roleId"));
    const module = c.req.param("module");

    const payload = await c.req.json();
    const permissionMask = z.number().int().parse(payload.permission_mask);

    // Validate permission mask uses only canonical bits
    if (!isValidPermissionMask(permissionMask)) {
      return errorResponse("INVALID_PERMISSION_MASK", `Permission mask ${permissionMask} contains non-canonical bits. Valid bits: READ=1, CREATE=2, UPDATE=4, DELETE=8, ANALYZE=16, MANAGE=32`, 400);
    }

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

const ModuleRolePermissionRequestSchema = z.object({
  permission_mask: z.number().int()
});

// Canonical permission bits (from @jurnapod/shared)
// Bits: READ=1, CREATE=2, UPDATE=4, DELETE=8, ANALYZE=16, MANAGE=32
const VALID_PERMISSION_BITS = 1 | 2 | 4 | 8 | 16 | 32; // = 63

function isValidPermissionMask(mask: number): boolean {
  // Valid masks are composed of canonical bits only
  // Reject if any bit outside the 6 canonical positions is set
  return (mask & ~VALID_PERMISSION_BITS) === 0;
}

export const registerSettingsModuleRoleRoutes = (app: OpenAPIHonoInterface): void => {
  // PUT /settings/module-roles/:roleId/:module - Update module role permission
  app.openapi(
    createRoute({
      method: "put",
      path: "/settings/module-roles/{roleId}/{module}",
      tags: ["Settings"],
      summary: "Update module role permission",
      description: "Update permission mask for a role on a specific module",
      security: [{ BearerAuth: [] }],
      request: {
        params: z.object({
          roleId: z.string(),
          module: z.string()
        }),
        body: {
          content: {
            "application/json": { schema: ModuleRolePermissionRequestSchema }
          }
        }
      },
      responses: {
        200: { content: { "application/json": { schema: z.object({ success: z.boolean() }) } }, description: "Permission updated" },
        400: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Invalid request" },
        401: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Unauthorized" },
        404: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Not found" },
        500: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Internal server error" }
      }
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (c: any) => {
      try {
        const auth = c.get("auth");
        const accessResult = await requireAccess({ module: "platform", resource: "settings", permission: "update" })(c.req.raw, auth);
        if (accessResult !== null) return accessResult;

        const roleId = NumericIdSchema.parse(c.req.param("roleId"));
        const moduleParam = c.req.param("module");

        const payload = await c.req.json();
        const permissionMask = z.number().int().parse(payload.permission_mask);

        // Validate permission mask uses only canonical bits
        if (!isValidPermissionMask(permissionMask)) {
          return c.json({ success: false, error: { code: "INVALID_PERMISSION_MASK", message: `Permission mask ${permissionMask} contains non-canonical bits. Valid bits: READ=1, CREATE=2, UPDATE=4, DELETE=8, ANALYZE=16, MANAGE=32` } }, 400);
        }

        const result = await setModuleRolePermission({
          companyId: auth.companyId,
          roleId,
          module: moduleParam,
          permissionMask,
          actor: {
            userId: auth.userId,
            ipAddress: readClientIp(c.req.raw)
          }
        });

        return c.json({ success: true, data: result });
      } catch (error) {
        if (error instanceof z.ZodError || error instanceof SyntaxError) {
          return c.json({ success: false, error: { code: "INVALID_REQUEST", message: "Invalid request body" } }, 400);
        }
        if (error instanceof Error && error.message.includes("not found")) {
          return c.json({ success: false, error: { code: "NOT_FOUND", message: error.message } }, 404);
        }
        console.error("PUT /settings/module-roles/:roleId/:module failed", error);
        return c.json({ success: false, error: { code: "INTERNAL_SERVER_ERROR", message: "Failed to update module role" } }, 500);
      }
    }
  );
};

export { moduleRolesRoutes };
