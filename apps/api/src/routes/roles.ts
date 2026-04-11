// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Roles Routes
 *
 * Routes for role management:
 * - GET /roles - List roles for company
 * - POST /roles - Create new role
 * - GET /roles/:id - Get single role
 * - PATCH /roles/:id - Update role
 * - DELETE /roles/:id - Delete role
 *
 * Required role: OWNER, ADMIN for write operations
 */

import { Hono } from "hono";
import { z } from "zod";
import { createRoute, z as zodOpenApi } from "@hono/zod-openapi";
import type { OpenAPIHono } from "@hono/zod-openapi";
import { NumericIdSchema } from "@jurnapod/shared";
import {
  authenticateRequest,
  requireAccess,
  type AuthContext
} from "../lib/auth-guard.js";
import { errorResponse, successResponse } from "../lib/response.js";
import { listRoles, getRole, createRole, updateRole, deleteRole, RoleLevelViolationError } from "../lib/users.js";
import { readClientIp } from "../lib/request-meta.js";

declare module "hono" {
  interface ContextVariableMap {
    auth: AuthContext;
  }
}

// =============================================================================
// Constants
// =============================================================================

// Roles use bitmask permissions like other modules

// =============================================================================
// Request Schemas
// =============================================================================

const CreateRoleSchema = z.object({
  code: z.string().trim().min(1).max(32),
  name: z.string().trim().min(1).max(191),
  role_level: z.number().int().optional()
});

const UpdateRoleSchema = z.object({
  name: z.string().trim().min(1).max(191).optional()
});

// =============================================================================
// Roles Routes
// =============================================================================

const rolesRoutes = new Hono();

// Auth middleware
rolesRoutes.use("/*", async (c, next) => {
  const authResult = await authenticateRequest(c.req.raw);
  if (!authResult.success) {
    c.status(401);
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Missing or invalid access token" } });
  }
  c.set("auth", authResult.auth);
  await next();
});

// GET /roles - List roles for company
rolesRoutes.get("/", async (c) => {
  const auth = c.get("auth");

  // Check access permission using bitmask
  const accessResult = await requireAccess({
    module: "platform",
    resource: "roles",
    permission: "read"
  })(c.req.raw, auth);

  if (accessResult !== null) {
    return accessResult;
  }

  try {
    const roles = await listRoles(auth.companyId);

    return successResponse(roles);
  } catch (error) {
    console.error("GET /roles failed", error);
    return errorResponse("INTERNAL_ERROR", "Roles request failed", 500);
  }
});

// POST /roles - Create new role
rolesRoutes.post("/", async (c) => {
  const auth = c.get("auth");

  // Check access permission using bitmask
  const accessResult = await requireAccess({
    module: "platform",
    resource: "roles",
    permission: "create"
  })(c.req.raw, auth);

  if (accessResult !== null) {
    return accessResult;
  }

  try {
    const payload = await c.req.json();
    const input = CreateRoleSchema.parse(payload);

    const role = await createRole({
      companyId: auth.companyId,
      code: input.code,
      name: input.name,
      roleLevel: input.role_level,
      actor: {
        userId: auth.userId,
        ipAddress: readClientIp(c.req.raw)
      }
    });

    return successResponse(role, 201);
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
    }

    console.error("POST /roles failed", error);
    return errorResponse("INTERNAL_ERROR", "Failed to create role", 500);
  }
});

// GET /roles/:id - Get single role by ID
rolesRoutes.get("/:id", async (c) => {
  const auth = c.get("auth");

  // Check access permission using bitmask
  const accessResult = await requireAccess({
    module: "platform",
    resource: "roles",
    permission: "read"
  })(c.req.raw, auth);

  if (accessResult !== null) {
    return accessResult;
  }

  try {
    const roleId = NumericIdSchema.parse(c.req.param("id"));

    const role = await getRole(roleId);

    // getRole throws RoleNotFoundError if not found
    return successResponse(role);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid role ID", 400);
    }

    // Check if role not found
    if (error instanceof Error && error.message.includes("not found")) {
      return errorResponse("NOT_FOUND", "Role not found", 404);
    }

    console.error("GET /roles/:id failed", error);
    return errorResponse("INTERNAL_ERROR", "Role request failed", 500);
  }
});

// PATCH /roles/:id - Update role
rolesRoutes.patch("/:id", async (c) => {
  const auth = c.get("auth");

  // Check access permission using bitmask
  const accessResult = await requireAccess({
    module: "platform",
    resource: "roles",
    permission: "update"
  })(c.req.raw, auth);

  if (accessResult !== null) {
    return accessResult;
  }

  try {
    const roleId = NumericIdSchema.parse(c.req.param("id"));
    const payload = await c.req.json();
    const input = UpdateRoleSchema.parse(payload);

    const role = await updateRole({
      companyId: auth.companyId,
      roleId,
      name: input.name,
      actor: {
        userId: auth.userId,
        ipAddress: readClientIp(c.req.raw)
      }
    });

    return successResponse(role);
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
    }

    if (error instanceof Error && error.message.includes("not found")) {
      return errorResponse("NOT_FOUND", "Role not found", 404);
    }

    console.error("PATCH /roles/:id failed", error);
    return errorResponse("INTERNAL_ERROR", "Failed to update role", 500);
  }
});

// DELETE /roles/:id - Delete role
rolesRoutes.delete("/:id", async (c) => {
  const auth = c.get("auth");

  // Check access permission using bitmask
  const accessResult = await requireAccess({
    module: "platform",
    resource: "roles",
    permission: "delete"
  })(c.req.raw, auth);

  if (accessResult !== null) {
    return accessResult;
  }

  try {
    const roleId = NumericIdSchema.parse(c.req.param("id"));

    await deleteRole({
      companyId: auth.companyId,
      roleId,
      actor: {
        userId: auth.userId,
        ipAddress: readClientIp(c.req.raw)
      }
    });

    return successResponse({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid role ID", 400);
    }

    if (error instanceof RoleLevelViolationError) {
      return errorResponse("FORBIDDEN", error.message, 403);
    }

    if (error instanceof Error && error.message.includes("not found")) {
      return errorResponse("NOT_FOUND", "Role not found", 404);
    }

    if (error instanceof Error && error.message.includes("users are assigned")) {
      return errorResponse("CONFLICT", error.message, 409);
    }

    console.error("DELETE /roles/:id failed", error);
    return errorResponse("INTERNAL_ERROR", "Failed to delete role", 500);
  }
});

export { rolesRoutes };

// ============================================================================
// OpenAPI Route Registration
// ============================================================================

/**
 * Role data schema
 */
const RoleDataSchema = zodOpenApi.object({
  id: zodOpenApi.number().openapi({ description: "Role ID" }),
  company_id: zodOpenApi.number().openapi({ description: "Company ID" }),
  code: zodOpenApi.string().openapi({ description: "Role code" }),
  name: zodOpenApi.string().openapi({ description: "Role name" }),
  role_level: zodOpenApi.number().optional().openapi({ description: "Role level" }),
  created_at: zodOpenApi.string().openapi({ description: "Created at" }),
  updated_at: zodOpenApi.string().openapi({ description: "Updated at" }),
}).openapi("RoleData");

/**
 * Registers role routes with an OpenAPIHono instance.
 */
export function registerRoleRoutes(app: OpenAPIHono): void {
  // GET /roles - List roles
  app.openapi(
    createRoute({
      method: "get",
      path: "/roles",
      operationId: "listRoles",
      summary: "List roles",
      description: "List all roles for the company.",
      tags: ["Roles"],
      security: [{ BearerAuth: [] }],
      responses: {
        200: {
          description: "List of roles",
          content: {
            "application/json": {
              schema: zodOpenApi.object({
                success: zodOpenApi.literal(true),
                data: zodOpenApi.array(RoleDataSchema),
              }).openapi("RoleListResponse"),
            },
          },
        },
        401: { description: "Unauthorized" },
        403: { description: "Forbidden" },
      },
    }),
    async (c): Promise<any> => {
      const auth = c.get("auth");
      const accessResult = await requireAccess({ module: "platform", resource: "roles", permission: "read" })(c.req.raw, auth);
      if (accessResult !== null) return accessResult;

      const roles = await listRoles(auth.companyId);
      return c.json({ success: true, data: roles });
    }
  );

  // POST /roles - Create role
  app.openapi(
    createRoute({
      method: "post",
      path: "/roles",
      operationId: "createRole",
      summary: "Create role",
      description: "Create a new role (admin only).",
      tags: ["Roles"],
      security: [{ BearerAuth: [] }],
      request: {
        body: {
          content: {
            "application/json": {
              schema: zodOpenApi.object({
                code: zodOpenApi.string().min(1).max(32).openapi({ description: "Role code" }),
                name: zodOpenApi.string().min(1).max(191).openapi({ description: "Role name" }),
                role_level: zodOpenApi.number().int().optional().openapi({ description: "Role level" }),
              }).openapi("CreateRoleRequest"),
            },
          },
        },
      },
      responses: {
        201: {
          description: "Role created",
          content: {
            "application/json": {
              schema: zodOpenApi.object({
                success: zodOpenApi.literal(true),
                data: RoleDataSchema,
              }).openapi("CreateRoleResponse"),
            },
          },
        },
        400: { description: "Invalid request" },
        401: { description: "Unauthorized" },
      },
    }),
    async (c): Promise<any> => {
      const auth = c.get("auth");
      const accessResult = await requireAccess({ module: "platform", resource: "roles", permission: "create" })(c.req.raw, auth);
      if (accessResult !== null) return accessResult;

      const payload = await c.req.json();
      const input = CreateRoleSchema.parse(payload);
      const role = await createRole({
        companyId: auth.companyId,
        code: input.code,
        name: input.name,
        roleLevel: input.role_level,
        actor: { userId: auth.userId, ipAddress: readClientIp(c.req.raw) },
      });
      return c.json({ success: true, data: role }, 201);
    }
  );

  // GET /roles/:id - Get role
  app.openapi(
    createRoute({
      method: "get",
      path: "/roles/{id}",
      operationId: "getRole",
      summary: "Get role",
      description: "Get role by ID.",
      tags: ["Roles"],
      security: [{ BearerAuth: [] }],
      request: {
        params: zodOpenApi.object({
          id: zodOpenApi.string().openapi({ description: "Role ID" }),
        }),
      },
      responses: {
        200: {
          description: "Role details",
          content: {
            "application/json": {
              schema: zodOpenApi.object({
                success: zodOpenApi.literal(true),
                data: RoleDataSchema,
              }).openapi("GetRoleResponse"),
            },
          },
        },
        400: { description: "Invalid role ID" },
        401: { description: "Unauthorized" },
        404: { description: "Role not found" },
      },
    }),
    async (c): Promise<any> => {
      const auth = c.get("auth");
      const accessResult = await requireAccess({ module: "platform", resource: "roles", permission: "read" })(c.req.raw, auth);
      if (accessResult !== null) return accessResult;

      const roleId = NumericIdSchema.parse(c.req.param("id"));
      const role = await getRole(roleId);
      return c.json({ success: true, data: role });
    }
  );

  // PATCH /roles/:id - Update role
  app.openapi(
    createRoute({
      method: "patch",
      path: "/roles/{id}",
      operationId: "updateRole",
      summary: "Update role",
      description: "Update role details.",
      tags: ["Roles"],
      security: [{ BearerAuth: [] }],
      request: {
        params: zodOpenApi.object({
          id: zodOpenApi.string().openapi({ description: "Role ID" }),
        }),
        body: {
          content: {
            "application/json": {
              schema: zodOpenApi.object({
                name: zodOpenApi.string().min(1).max(191).optional().openapi({ description: "Role name" }),
              }).openapi("UpdateRoleRequest"),
            },
          },
        },
      },
      responses: {
        200: {
          description: "Role updated",
          content: {
            "application/json": {
              schema: zodOpenApi.object({
                success: zodOpenApi.literal(true),
                data: RoleDataSchema,
              }).openapi("UpdateRoleResponse"),
            },
          },
        },
        400: { description: "Invalid request" },
        401: { description: "Unauthorized" },
        404: { description: "Role not found" },
      },
    }),
    async (c): Promise<any> => {
      const auth = c.get("auth");
      const accessResult = await requireAccess({ module: "platform", resource: "roles", permission: "update" })(c.req.raw, auth);
      if (accessResult !== null) return accessResult;

      const roleId = NumericIdSchema.parse(c.req.param("id"));
      const payload = await c.req.json();
      const input = UpdateRoleSchema.parse(payload);
      const role = await updateRole({
        companyId: auth.companyId,
        roleId,
        name: input.name,
        actor: { userId: auth.userId, ipAddress: readClientIp(c.req.raw) },
      });
      return c.json({ success: true, data: role });
    }
  );

  // DELETE /roles/:id - Delete role
  app.openapi(
    createRoute({
      method: "delete",
      path: "/roles/{id}",
      operationId: "deleteRole",
      summary: "Delete role",
      description: "Delete a role.",
      tags: ["Roles"],
      security: [{ BearerAuth: [] }],
      request: {
        params: zodOpenApi.object({
          id: zodOpenApi.string().openapi({ description: "Role ID" }),
        }),
      },
      responses: {
        200: {
          description: "Role deleted",
          content: {
            "application/json": {
              schema: zodOpenApi.object({
                success: zodOpenApi.literal(true),
              }).openapi("DeleteRoleResponse"),
            },
          },
        },
        400: { description: "Invalid role ID" },
        401: { description: "Unauthorized" },
        404: { description: "Role not found" },
      },
    }),
    async (c): Promise<any> => {
      const auth = c.get("auth");
      const accessResult = await requireAccess({ module: "platform", resource: "roles", permission: "delete" })(c.req.raw, auth);
      if (accessResult !== null) return accessResult;

      const roleId = NumericIdSchema.parse(c.req.param("id"));
      await deleteRole({
        companyId: auth.companyId,
        roleId,
        actor: { userId: auth.userId, ipAddress: readClientIp(c.req.raw) },
      });
      return c.json({ success: true });
    }
  );
}
