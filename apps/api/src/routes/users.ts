// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Users Routes
 *
 * Routes for user management:
 * - GET /users/me - Get current user information
 * - GET /users - List users (admin only)
 * - POST /users - Create user (admin only)
 * - POST /users/:id/roles - Set user roles (admin only)
 *
 * Required role: Any authenticated user for /me, admin roles for management
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
import { findActiveUserById } from "../lib/auth.js";
import { 
  listUsers, 
  createUser, 
  setUserRoles,
  listRoles,
  listOutlets as listUserOutlets
} from "../lib/users.js";

declare module "hono" {
  interface ContextVariableMap {
    auth: AuthContext;
  }
}

// =============================================================================
// Constants
// =============================================================================

// Note: We primarily use module permissions (bitmask) rather than role codes
// Role codes are kept as fallback for compatibility
const USERS_ROLES_READ = ["OWNER", "COMPANY_ADMIN", "ADMIN"] as const;
const USERS_ROLES_WRITE = ["OWNER", "COMPANY_ADMIN", "ADMIN"] as const;

// =============================================================================
// Request Schemas
// =============================================================================

const CreateUserSchema = z.object({
  email: z.string().email().max(191),
  password: z.string().min(8).max(255),
  is_active: z.boolean().optional().default(true)
});

const SetUserRolesSchema = z.object({
  role_codes: z.array(z.string()).min(0),
  outlet_id: z.number().optional()
});

// =============================================================================
// Users Routes
// =============================================================================

const usersRoutes = new Hono();

// Auth middleware
usersRoutes.use("/*", async (c, next) => {
  const authResult = await authenticateRequest(c.req.raw);
  if (!authResult.success) {
    c.status(401);
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Missing or invalid access token" } });
  }
  c.set("auth", authResult.auth);
  await next();
});

// GET /users/me - Get current user information
usersRoutes.get("/me", async (c) => {
  try {
    const auth = c.get("auth");
    
    // Get full user profile with roles and outlets
    const user = await findActiveUserById(auth.userId, auth.companyId);
    
    if (!user) {
      return errorResponse("NOT_FOUND", "User not found", 404);
    }

    return successResponse(user);
  } catch (error) {
    console.error("GET /users/me failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to fetch user profile", 500);
  }
});

// GET /users - List users for company (admin only)
usersRoutes.get("/", async (c) => {
  try {
    const auth = c.get("auth");
    
    // Check access permission
    const accessResult = await requireAccess({
      roles: [...USERS_ROLES_READ],
      module: "users",
      permission: "read"
    })(c.req.raw, auth);

    if (accessResult !== null) {
      return accessResult;
    }

    const users = await listUsers(auth.companyId);
    return successResponse(users);
  } catch (error) {
    console.error("GET /users failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to fetch users", 500);
  }
});

// POST /users - Create new user (admin only)
usersRoutes.post("/", async (c) => {
  try {
    const auth = c.get("auth");
    
    // Check access permission using bitmask system
    const accessResult = await requireAccess({
      module: "users",
      permission: "read"
    })(c.req.raw, auth);

    if (accessResult !== null) {
      return accessResult;
    }

    const payload = await c.req.json();
    const input = CreateUserSchema.parse(payload);

    const user = await createUser({
      companyId: auth.companyId,
      email: input.email,
      password: input.password,
      isActive: input.is_active,
      actor: {
        userId: auth.userId
      }
    });

    return successResponse(user, 201);
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
    }

    console.error("POST /users failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to create user", 500);
  }
});

// POST /users/:id/roles - Set user roles (admin only)
usersRoutes.post("/:id/roles", async (c) => {
  try {
    const auth = c.get("auth");
    
    // Check access permission using bitmask system
    const accessResult = await requireAccess({
      module: "users",
      permission: "update"
    })(c.req.raw, auth);

    if (accessResult !== null) {
      return accessResult;
    }

    const userId = NumericIdSchema.parse(c.req.param("id"));
    const payload = await c.req.json();
    const input = SetUserRolesSchema.parse(payload);

    await setUserRoles({
      companyId: auth.companyId,
      userId: userId,
      roleCodes: input.role_codes,
      outletId: input.outlet_id,
      actor: {
        userId: auth.userId
      }
    });

    return successResponse({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
    }

    console.error("POST /users/:id/roles failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to set user roles", 500);
  }
});

// GET /users/roles - List available roles (admin only)
usersRoutes.get("/roles", async (c) => {
  try {
    const auth = c.get("auth");
    
    // Check access permission using bitmask system
    const accessResult = await requireAccess({
      module: "users",
      permission: "read"
    })(c.req.raw, auth);

    if (accessResult !== null) {
      return accessResult;
    }

    const roles = await listRoles(auth.companyId);
    return successResponse(roles);
  } catch (error) {
    console.error("GET /users/roles failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to fetch roles", 500);
  }
});

// GET /users/outlets - List available outlets (admin only)
usersRoutes.get("/outlets", async (c) => {
  try {
    const auth = c.get("auth");
    
    // Check access permission using bitmask system
    const accessResult = await requireAccess({
      module: "users",
      permission: "read"
    })(c.req.raw, auth);

    if (accessResult !== null) {
      return accessResult;
    }

    const outlets = await listUserOutlets(auth.companyId);
    return successResponse(outlets);
  } catch (error) {
    console.error("GET /users/outlets failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to fetch outlets", 500);
  }
});

export { usersRoutes };