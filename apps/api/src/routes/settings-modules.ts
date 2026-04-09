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
import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
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

// ============================================================================
// OpenAPI Route Registration
// ============================================================================

type OpenAPIHonoInterface = {
  openapi: OpenAPIHono["openapi"];
};

// OpenAPI Schemas
const ModuleSchema = z.object({
  code: z.string(),
  enabled: z.boolean(),
  config_json: z.string().nullable(),
  name: z.string().nullable(),
  description: z.string().nullable()
}).openapi("Module");

const ModuleExtendedSchema = z.object({
  code: z.string(),
  enabled: z.boolean(),
  name: z.string().nullable(),
  description: z.string().nullable(),
  pos_settings: z.record(z.any()).nullable(),
  inventory_settings: z.record(z.any()).nullable(),
  sales_settings: z.record(z.any()).nullable(),
  purchasing_settings: z.record(z.any()).nullable()
}).openapi("ModuleExtended");

const ModulesResponseSchema = z.object({
  success: z.boolean(),
  data: z.array(ModuleSchema)
}).openapi("ModulesResponse");

const ModuleExtendedResponseSchema = z.object({
  success: z.boolean(),
  data: z.array(ModuleExtendedSchema)
}).openapi("ModuleExtendedResponse");

const ErrorResponseSchema = z.object({
  success: z.boolean(),
  error: z.object({
    code: z.string(),
    message: z.string()
  })
}).openapi("ErrorResponse");

const ModuleUpdateItemSchema = z.object({
  code: z.string(),
  enabled: z.boolean(),
  config_json: z.string().optional()
});

const ModulesUpdateRequestSchema = z.object({
  modules: z.array(ModuleUpdateItemSchema)
});

const ModuleRolePermissionRequestSchema = z.object({
  permission_mask: z.number().int()
});

export const registerSettingsModuleRoutes = (app: OpenAPIHonoInterface): void => {
  // GET /settings/modules - List modules for company
  app.openapi(
    createRoute({
      method: "get",
      path: "/settings/modules",
      tags: ["Settings"],
      summary: "List modules",
      description: "List all modules for the authenticated company (legacy)",
      security: [{ BearerAuth: [] }],
      responses: {
        200: { content: { "application/json": { schema: ModulesResponseSchema } }, description: "List of modules" },
        401: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Unauthorized" },
        500: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Internal server error" }
      }
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (c: any) => {
      try {
        const auth = c.get("auth");
        const accessResult = await requireAccess({ module: "settings", permission: "read" })(c.req.raw, auth);
        if (accessResult !== null) return accessResult;

        const modules = await listCompanyModules(auth.companyId);
        return c.json({ success: true, data: modules });
      } catch (error) {
        console.error("GET /settings/modules failed", error);
        return c.json({ success: false, error: { code: "INTERNAL_SERVER_ERROR", message: "Failed to list modules" } }, 500);
      }
    }
  );

  // PUT /settings/modules - Update module settings (legacy)
  app.openapi(
    createRoute({
      method: "put",
      path: "/settings/modules",
      tags: ["Settings"],
      summary: "Update modules",
      description: "Update module settings (legacy config_json approach)",
      security: [{ BearerAuth: [] }],
      request: {
        body: {
          content: {
            "application/json": { schema: ModulesUpdateRequestSchema }
          }
        }
      },
      responses: {
        200: { content: { "application/json": { schema: z.object({ success: z.boolean() }) } }, description: "Modules updated" },
        400: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Invalid request" },
        401: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Unauthorized" },
        404: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Module not found" },
        500: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Internal server error" }
      }
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (c: any) => {
      try {
        const auth = c.get("auth");
        const accessResult = await requireAccess({ module: "settings", permission: "update" })(c.req.raw, auth);
        if (accessResult !== null) return accessResult;

        const payload = await c.req.json();
        const input = ModulesUpdateSchema.parse(payload);

        for (const module of input.modules) {
          try {
            await updateCompanyModule(auth.companyId, module.code, module.enabled, module.config_json || null);
          } catch (error) {
            if (error instanceof ModuleNotFoundError) {
              return c.json({ success: false, error: { code: "NOT_FOUND", message: error.message } }, 404);
            }
            throw error;
          }
        }

        return c.json({ success: true });
      } catch (error) {
        if (error instanceof z.ZodError || error instanceof SyntaxError) {
          return c.json({ success: false, error: { code: "INVALID_REQUEST", message: "Invalid request body" } }, 400);
        }
        console.error("PUT /settings/modules failed", error);
        return c.json({ success: false, error: { code: "INTERNAL_SERVER_ERROR", message: "Failed to update modules" } }, 500);
      }
    }
  );

  // GET /settings/modules/extended - List modules with explicit typed settings
  app.openapi(
    createRoute({
      method: "get",
      path: "/settings/modules/extended",
      tags: ["Settings"],
      summary: "List modules (extended)",
      description: "List all modules with explicit typed settings",
      security: [{ BearerAuth: [] }],
      responses: {
        200: { content: { "application/json": { schema: ModuleExtendedResponseSchema } }, description: "List of modules" },
        401: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Unauthorized" },
        500: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Internal server error" }
      }
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (c: any) => {
      try {
        const auth = c.get("auth");
        const accessResult = await requireAccess({ module: "settings", permission: "read" })(c.req.raw, auth);
        if (accessResult !== null) return accessResult;

        const modules = await listCompanyModulesExtended(auth.companyId);
        return c.json({ success: true, data: modules });
      } catch (error) {
        console.error("GET /settings/modules/extended failed", error);
        return c.json({ success: false, error: { code: "INTERNAL_SERVER_ERROR", message: "Failed to list extended modules" } }, 500);
      }
    }
  );

  // PUT /settings/modules/extended - Update module settings with explicit columns
  app.openapi(
    createRoute({
      method: "put",
      path: "/settings/modules/extended",
      tags: ["Settings"],
      summary: "Update modules (extended)",
      description: "Update module settings with explicit typed columns",
      security: [{ BearerAuth: [] }],
      request: {
        body: {
          content: {
            "application/json": { schema: ExtendedCompanyModulesUpdateSchema }
          }
        }
      },
      responses: {
        200: { content: { "application/json": { schema: z.object({ success: z.boolean() }) } }, description: "Modules updated" },
        400: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Invalid request" },
        401: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Unauthorized" },
        404: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Module not found" },
        500: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Internal server error" }
      }
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (c: any) => {
      try {
        const auth = c.get("auth");
        const accessResult = await requireAccess({ module: "settings", permission: "update" })(c.req.raw, auth);
        if (accessResult !== null) return accessResult;

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
              return c.json({ success: false, error: { code: "NOT_FOUND", message: error.message } }, 404);
            }
            throw error;
          }
        }

        return c.json({ success: true });
      } catch (error) {
        if (error instanceof z.ZodError || error instanceof SyntaxError) {
          return c.json({ success: false, error: { code: "INVALID_REQUEST", message: "Invalid request body" } }, 400);
        }
        console.error("PUT /settings/modules/extended failed", error);
        return c.json({ success: false, error: { code: "INTERNAL_SERVER_ERROR", message: "Failed to update extended modules" } }, 500);
      }
    }
  );

  // PUT /settings/modules/module-roles/:roleId/:module - Update module role permission
  app.openapi(
    createRoute({
      method: "put",
      path: "/settings/modules/module-roles/{roleId}/{module}",
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
        const accessResult = await requireAccess({ module: "settings", permission: "update" })(c.req.raw, auth);
        if (accessResult !== null) return accessResult;

        const roleId = NumericIdSchema.parse(c.req.param("roleId"));
        const moduleParam = c.req.param("module");

        const payload = await c.req.json();
        const permissionMask = z.number().int().parse(payload.permission_mask);

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
        console.error("PUT /settings/modules/module-roles/:roleId/:module failed", error);
        return c.json({ success: false, error: { code: "INTERNAL_SERVER_ERROR", message: "Failed to update module role" } }, 500);
      }
    }
  );
};

export { modulesRoutes };
