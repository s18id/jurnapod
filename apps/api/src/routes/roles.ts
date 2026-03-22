// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Roles Routes
 *
 * Routes for role management:
 * - GET /roles - List roles for company
 * - GET /roles/:id - Get single role
 *
 * Required role: OWNER, ADMIN (read operations)
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
import { listRoles, getRole } from "../lib/users.js";

declare module "hono" {
  interface ContextVariableMap {
    auth: AuthContext;
  }
}

// =============================================================================
// Constants
// =============================================================================

const ROLES_ROLES_READ = ["OWNER", "COMPANY_ADMIN", "ADMIN"] as const;

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

  // Check access permission
  const accessResult = await requireAccess({
    roles: [...ROLES_ROLES_READ],
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

// GET /roles/:id - Get single role by ID
rolesRoutes.get("/:id", async (c) => {
  const auth = c.get("auth");

  // Check access permission
  const accessResult = await requireAccess({
    roles: [...ROLES_ROLES_READ],
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

export { rolesRoutes };
