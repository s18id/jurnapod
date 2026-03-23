// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Outlets Routes
 *
 * Routes for outlet management:
 * - GET /outlets - List outlets for company
 * - POST /outlets - Create new outlet
 * - GET /outlets/access - Check outlet access
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
import { listOutletsByCompany, createOutlet } from "../lib/outlets.js";
import { checkUserAccess } from "../lib/auth.js";

declare module "hono" {
  interface ContextVariableMap {
    auth: AuthContext;
  }
}

// =============================================================================
// Constants
// =============================================================================

const OUTLETS_ROLES_READ = ["OWNER", "COMPANY_ADMIN", "ADMIN", "ACCOUNTANT", "CASHIER"] as const;
const OUTLETS_ROLES_WRITE = ["OWNER", "COMPANY_ADMIN", "ADMIN"] as const;

// =============================================================================
// Request Schemas
// =============================================================================

const CreateOutletSchema = z.object({
  code: z.string().trim().min(1).max(32),
  name: z.string().trim().min(1).max(191)
});

// =============================================================================
// Outlets Routes
// =============================================================================

const outletsRoutes = new Hono();

// Auth middleware
outletsRoutes.use("/*", async (c, next) => {
  const authResult = await authenticateRequest(c.req.raw);
  if (!authResult.success) {
    c.status(401);
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Missing or invalid access token" } });
  }
  c.set("auth", authResult.auth);
  await next();
});

// GET /outlets - List outlets for company
outletsRoutes.get("/", async (c) => {
  try {
    const auth = c.get("auth");
    
    // Check access permission using bitmask system
    const accessResult = await requireAccess({
      module: "outlets",
      permission: "read"
    })(c.req.raw, auth);

    if (accessResult !== null) {
      return accessResult;
    }

    const outlets = await listOutletsByCompany(auth.companyId);
    return successResponse(outlets);
  } catch (error) {
    console.error("GET /outlets failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to fetch outlets", 500);
  }
});

// POST /outlets - Create new outlet
outletsRoutes.post("/", async (c) => {
  try {
    const auth = c.get("auth");
    
    // Check access permission using bitmask system
    const accessResult = await requireAccess({
      module: "outlets", 
      permission: "create"
    })(c.req.raw, auth);

    if (accessResult !== null) {
      return accessResult;
    }

    const payload = await c.req.json();
    const input = CreateOutletSchema.parse(payload);

    const outlet = await createOutlet({
      company_id: auth.companyId,
      code: input.code,
      name: input.name,
      actor: {
        userId: auth.userId
      }
    });

    return successResponse(outlet, 201);
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
    }

    console.error("POST /outlets failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to create outlet", 500);
  }
});

// GET /outlets/access - Check outlet access
outletsRoutes.get("/access", async (c) => {
  try {
    const auth = c.get("auth");
    const url = new URL(c.req.raw.url);
    const outletIdParam = url.searchParams.get("outlet_id");

    if (!outletIdParam) {
      return errorResponse("INVALID_REQUEST", "outlet_id parameter is required", 400);
    }

    const outletId = NumericIdSchema.parse(outletIdParam);
    
    // Check if user has access to the outlet using bitmask system
    const access = await checkUserAccess({
      userId: auth.userId,
      companyId: auth.companyId,
      outletId: outletId,
      module: "outlets",
      permission: "read"
    });
    
    if (!access || (!access.hasRole && !access.hasGlobalRole && !access.isSuperAdmin)) {
      return errorResponse("FORBIDDEN", "Access denied to outlet", 403);
    }

    return successResponse({ access: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid outlet_id parameter", 400);
    }

    console.error("GET /outlets/access failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to check outlet access", 500);
  }
});

export { outletsRoutes };