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
import { NumericIdSchema } from "@jurnapod/shared";
import {
  authenticateRequest,
  requireAccess,
  type AuthContext
} from "../lib/auth-guard.js";
import { errorResponse, successResponse } from "../lib/response.js";
import { listRoles, getRole, createRole, updateRole, deleteRole } from "../lib/users.js";
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
    module: "roles",
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
    module: "roles",
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
    module: "roles",
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
    module: "roles",
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
    module: "roles",
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

    if (error instanceof Error && error.message.includes("not found")) {
      return errorResponse("NOT_FOUND", "Role not found", 404);
    }

    console.error("DELETE /roles/:id failed", error);
    return errorResponse("INTERNAL_ERROR", "Failed to delete role", 500);
  }
});

export { rolesRoutes };
