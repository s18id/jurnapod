// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Supplies Routes
 *
 * Routes for supply management:
 * - GET /supplies - List supplies with filtering
 * - POST /supplies - Create new supply
 * - GET /supplies/:id - Get single supply
 * - PATCH /supplies/:id - Update supply
 * - DELETE /supplies/:id - Delete supply
 *
 * Required role: OWNER, ADMIN, ACCOUNTANT for most operations
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

declare module "hono" {
  interface ContextVariableMap {
    auth: AuthContext;
  }
}

// =============================================================================
// Request Schemas
// =============================================================================

const SupplyCreateSchema = z.object({
  sku: z.string().trim().min(1).max(191),
  name: z.string().trim().min(1).max(191),
  unit: z.string().trim().min(1).max(50),
  is_active: z.boolean().optional().default(true)
});

const SupplyUpdateSchema = z.object({
  sku: z.string().trim().min(1).max(191).optional(),
  name: z.string().trim().min(1).max(191).optional(),
  unit: z.string().trim().min(1).max(50).optional(),
  is_active: z.boolean().optional()
});

// =============================================================================
// Supplies Routes
// =============================================================================

const suppliesRoutes = new Hono();

// Auth middleware
suppliesRoutes.use("/*", async (c, next) => {
  const authResult = await authenticateRequest(c.req.raw);
  if (!authResult.success) {
    c.status(401);
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Missing or invalid access token" } });
  }
  c.set("auth", authResult.auth);
  await next();
});

// GET /supplies - List supplies
suppliesRoutes.get("/", async (c) => {
  try {
    const auth = c.get("auth");
    
    // Check access permission using bitmask system
    const accessResult = await requireAccess({
      module: "inventory",
      permission: "read"
    })(c.req.raw, auth);

    if (accessResult !== null) {
      return accessResult;
    }

    const url = new URL(c.req.raw.url);
    const isActive = url.searchParams.get("is_active");
    
    // Parse is_active filter
    let isActiveFilter: boolean | undefined;
    if (isActive === "true") {
      isActiveFilter = true;
    } else if (isActive === "false") {
      isActiveFilter = false;
    } else if (isActive !== null) {
      return errorResponse("INVALID_REQUEST", "Invalid is_active parameter", 400);
    }

    // For now, return empty array as placeholder
    // TODO: Implement actual supply listing
    return successResponse([]);
  } catch (error) {
    console.error("GET /supplies failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to fetch supplies", 500);
  }
});

// POST /supplies - Create supply
suppliesRoutes.post("/", async (c) => {
  try {
    const auth = c.get("auth");
    
    // Check access permission using bitmask system
    const accessResult = await requireAccess({
      module: "inventory",
      permission: "create"
    })(c.req.raw, auth);

    if (accessResult !== null) {
      return accessResult;
    }

    const payload = await c.req.json();
    const input = SupplyCreateSchema.parse(payload);

    // For now, return success as placeholder
    // TODO: Implement actual supply creation
    return successResponse({
      id: Math.floor(Math.random() * 1000000),
      sku: input.sku,
      name: input.name,
      unit: input.unit,
      is_active: input.is_active,
      created_at: new Date().toISOString()
    }, 201);
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
    }

    console.error("POST /supplies failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to create supply", 500);
  }
});

// GET /supplies/:id - Get supply by ID
suppliesRoutes.get("/:id", async (c) => {
  try {
    const auth = c.get("auth");
    
    // Check access permission using bitmask system
    const accessResult = await requireAccess({
      module: "inventory",
      permission: "read"
    })(c.req.raw, auth);

    if (accessResult !== null) {
      return accessResult;
    }

    const supplyId = NumericIdSchema.parse(c.req.param("id"));

    // For now, return placeholder data
    // TODO: Implement actual supply retrieval
    return successResponse({
      id: supplyId,
      sku: "SUPPLY001",
      name: "Test Supply",
      unit: "pcs",
      is_active: true,
      created_at: new Date().toISOString()
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid supply ID", 400);
    }

    console.error("GET /supplies/:id failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to fetch supply", 500);
  }
});

// PATCH /supplies/:id - Update supply
suppliesRoutes.patch("/:id", async (c) => {
  try {
    const auth = c.get("auth");
    
    // Check access permission using bitmask system
    const accessResult = await requireAccess({
      module: "inventory",
      permission: "update"
    })(c.req.raw, auth);

    if (accessResult !== null) {
      return accessResult;
    }

    const supplyId = NumericIdSchema.parse(c.req.param("id"));
    const payload = await c.req.json();
    const input = SupplyUpdateSchema.parse(payload);

    // For now, return success as placeholder
    // TODO: Implement actual supply update
    return successResponse({
      id: supplyId,
      sku: input.sku || "SUPPLY001",
      name: input.name || "Test Supply",
      unit: input.unit || "pcs",
      is_active: input.is_active !== undefined ? input.is_active : true,
      updated_at: new Date().toISOString()
    });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return errorResponse("INVALID_REQUEST", "Invalid request", 400);
    }

    console.error("PATCH /supplies/:id failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to update supply", 500);
  }
});

// DELETE /supplies/:id - Delete supply
suppliesRoutes.delete("/:id", async (c) => {
  try {
    const auth = c.get("auth");
    
    // Check access permission using bitmask system
    const accessResult = await requireAccess({
      module: "inventory",
      permission: "delete"
    })(c.req.raw, auth);

    if (accessResult !== null) {
      return accessResult;
    }

    const supplyId = NumericIdSchema.parse(c.req.param("id"));

    // For now, return success as placeholder
    // TODO: Implement actual supply deletion
    return successResponse({
      id: supplyId,
      deleted: true
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid supply ID", 400);
    }

    console.error("DELETE /supplies/:id failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to delete supply", 500);
  }
});

export { suppliesRoutes };