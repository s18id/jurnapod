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
  listOutlets as listUserOutlets,
  findUserById,
  updateUserEmail,
  setUserOutlets,
  setUserPassword,
  setUserActiveState,
  UserNotFoundError,
  UserEmailExistsError,
  RoleNotFoundError,
  RoleLevelViolationError,
  RoleScopeViolationError,
  SuperAdminProtectionError,
  CrossCompanyAccessError
} from "../lib/users.js";
import { readClientIp } from "../lib/request-meta.js";

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

const OutletRoleAssignmentSchema = z.object({
  outlet_id: z.number(),
  role_codes: z.array(z.string())
});

const CreateUserSchema = z.object({
  email: z.string().email().max(191),
  password: z.string().min(8).max(255),
  is_active: z.boolean().optional().default(true),
  role_codes: z.array(z.string()).optional().default([]),
  outlet_ids: z.array(z.number()).optional().default([]),
  outlet_role_assignments: z.array(OutletRoleAssignmentSchema).optional().default([])
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
    
    // Check access permission using bitmask
    const accessResult = await requireAccess({
      module: "users",
      permission: "read"
    })(c.req.raw, auth);

    if (accessResult !== null) {
      return accessResult;
    }

    // Parse company_id from query params (defaults to authenticated user's company)
    const url = new URL(c.req.raw.url);
    const companyIdParam = url.searchParams.get("company_id");
    const requestedCompanyId = companyIdParam ? Number(companyIdParam) : auth.companyId;

    const users = await listUsers(requestedCompanyId, { userId: auth.userId, companyId: auth.companyId });
    return successResponse(users);
  } catch (error) {
    if (error instanceof CrossCompanyAccessError) {
      return errorResponse("FORBIDDEN", error.message, 403);
    }
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
      permission: "create"
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
      roleCodes: input.role_codes,
      outletIds: input.outlet_ids,
      outletRoleAssignments: input.outlet_role_assignments.map((a) => ({
        outletId: a.outlet_id,
        roleCodes: a.role_codes
      })),
      actor: {
        userId: auth.userId,
        ipAddress: readClientIp(c.req.raw)
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
        userId: auth.userId,
        ipAddress: readClientIp(c.req.raw)
      }
    });

    return successResponse({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
    }
    if (error instanceof RoleScopeViolationError) {
      return errorResponse("INVALID_REQUEST", error.message, 400);
    }
    if (error instanceof RoleLevelViolationError) {
      return errorResponse("FORBIDDEN", error.message, 403);
    }
    if (error instanceof RoleNotFoundError) {
      return errorResponse("NOT_FOUND", error.message, 404);
    }
    if (error instanceof UserNotFoundError) {
      return errorResponse("NOT_FOUND", error.message, 404);
    }
    if (error instanceof SuperAdminProtectionError) {
      return errorResponse("FORBIDDEN", error.message, 403);
    }

    console.error("POST /users/:id/roles failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to set user roles", 500);
  }
});

// GET /users/:id - Get user by ID
usersRoutes.get("/:id", async (c) => {
  try {
    const auth = c.get("auth");
    
    const userId = NumericIdSchema.parse(c.req.param("id"));
    
    const user = await findUserById(auth.companyId, userId);
    
    if (!user) {
      return errorResponse("NOT_FOUND", "User not found", 404);
    }

    return successResponse(user);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid user ID", 400);
    }

    console.error("GET /users/:id failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to fetch user", 500);
  }
});

// PATCH /users/:id - Update user
usersRoutes.patch("/:id", async (c) => {
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

    // Only email update is supported via PATCH
    if (payload.email) {
      const updated = await updateUserEmail({
        companyId: auth.companyId,
        userId: userId,
        email: payload.email,
        actor: {
          userId: auth.userId,
          ipAddress: readClientIp(c.req.raw)
        }
      });

      return successResponse(updated);
    }

    return errorResponse("INVALID_REQUEST", "No valid fields to update", 400);
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
    }

    console.error("PATCH /users/:id failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to update user", 500);
  }
});

// POST /users/:id/outlets - Set user outlets
usersRoutes.post("/:id/outlets", async (c) => {
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

    const updated = await setUserOutlets({
      companyId: auth.companyId,
      userId: userId,
      outletIds: payload.outlet_ids || [],
      actor: {
        userId: auth.userId,
        ipAddress: readClientIp(c.req.raw)
      }
    });

    return successResponse(updated);
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
    }

    console.error("POST /users/:id/outlets failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to set user outlets", 500);
  }
});

// POST /users/:id/password - Change user password
usersRoutes.post("/:id/password", async (c) => {
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

    if (!payload.password || typeof payload.password !== "string" || payload.password.length < 8) {
      return errorResponse("INVALID_REQUEST", "Password must be at least 8 characters", 400);
    }

    await setUserPassword({
      companyId: auth.companyId,
      userId: userId,
      password: payload.password,
      actor: {
        userId: auth.userId,
        ipAddress: readClientIp(c.req.raw)
      }
    });

    return successResponse({ success: true });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
    }

    console.error("POST /users/:id/password failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to change password", 500);
  }
});

// POST /users/:id/deactivate - Deactivate user
usersRoutes.post("/:id/deactivate", async (c) => {
  try {
    const auth = c.get("auth");
    
    // Check access permission using bitmask system
    const accessResult = await requireAccess({
      module: "users",
      permission: "delete"
    })(c.req.raw, auth);

    if (accessResult !== null) {
      return accessResult;
    }

    const userId = NumericIdSchema.parse(c.req.param("id"));

    const updated = await setUserActiveState({
      companyId: auth.companyId,
      userId: userId,
      isActive: false,
      actor: {
        userId: auth.userId,
        ipAddress: readClientIp(c.req.raw)
      }
    });

    return successResponse(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid user ID", 400);
    }

    console.error("POST /users/:id/deactivate failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to deactivate user", 500);
  }
});

// POST /users/:id/reactivate - Reactivate user
usersRoutes.post("/:id/reactivate", async (c) => {
  try {
    const auth = c.get("auth");
    
    // Check access permission using bitmask system
    const accessResult = await requireAccess({
      module: "users",
      permission: "delete"
    })(c.req.raw, auth);

    if (accessResult !== null) {
      return accessResult;
    }

    const userId = NumericIdSchema.parse(c.req.param("id"));

    const updated = await setUserActiveState({
      companyId: auth.companyId,
      userId: userId,
      isActive: true,
      actor: {
        userId: auth.userId,
        ipAddress: readClientIp(c.req.raw)
      }
    });

    return successResponse(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid user ID", 400);
    }

    console.error("POST /users/:id/reactivate failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to reactivate user", 500);
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