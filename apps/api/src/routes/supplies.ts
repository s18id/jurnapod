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
import { z as zodOpenApi, createRoute } from "@hono/zod-openapi";
import type { OpenAPIHono as OpenAPIHonoType } from "@hono/zod-openapi";
import { NumericIdSchema } from "@jurnapod/shared";
import {
  authenticateRequest,
  requireAccess,
  type AuthContext
} from "../lib/auth-guard.js";
import { errorResponse, successResponse } from "@jurnapod/shared";
import {
  listSupplies,
  findSupplyById,
  createSupply,
  updateSupply,
  deleteSupply
} from "../lib/supplies/index.js";
import {
  DatabaseReferenceError
} from "@jurnapod/shared";
import { InventoryConflictError } from "@jurnapod/modules-inventory";

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
      resource: "items",
      permission: "read"
    })(c.req.raw, auth);

    if (accessResult !== null) {
      return accessResult;
    }

    const url = new URL(c.req.raw.url);
    const isActive = url.searchParams.get("is_active");
    const companyId = url.searchParams.get("company_id");
    
    // Reject company_id parameter (not allowed)
    if (companyId !== null) {
      return errorResponse("INVALID_REQUEST", "company_id parameter not allowed", 400);
    }
    
    // Parse is_active filter
    let isActiveFilter: boolean | undefined;
    if (isActive === "true") {
      isActiveFilter = true;
    } else if (isActive === "false") {
      isActiveFilter = false;
    } else if (isActive !== null) {
      return errorResponse("INVALID_REQUEST", "Invalid is_active parameter", 400);
    }

    const supplies = await listSupplies(auth.companyId, {
      isActive: isActiveFilter
    });
    
    return successResponse(supplies);
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
      resource: "items",
      permission: "create"
    })(c.req.raw, auth);

    if (accessResult !== null) {
      return accessResult;
    }

    const payload = await c.req.json();
    const input = SupplyCreateSchema.parse(payload);

    const supply = await createSupply(auth.companyId, {
      sku: input.sku,
      name: input.name,
      unit: input.unit,
      is_active: input.is_active
    }, {
      userId: auth.userId
    });

    return successResponse(supply, 201);
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
    }

    if (error instanceof InventoryConflictError) {
      return errorResponse("CONFLICT", "Supply conflict", 409);
    }

    if (error instanceof DatabaseReferenceError) {
      return errorResponse("NOT_FOUND", "Referenced resource not found", 404);
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
      resource: "items",
      permission: "read"
    })(c.req.raw, auth);

    if (accessResult !== null) {
      return accessResult;
    }

    const supplyId = NumericIdSchema.parse(c.req.param("id"));

    const supply = await findSupplyById(auth.companyId, supplyId);
    if (!supply) {
      return errorResponse("NOT_FOUND", "Supply not found", 404);
    }

    return successResponse(supply);
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
      resource: "items",
      permission: "update"
    })(c.req.raw, auth);

    if (accessResult !== null) {
      return accessResult;
    }

    const supplyId = NumericIdSchema.parse(c.req.param("id"));
    const payload = await c.req.json();
    const input = SupplyUpdateSchema.parse(payload);

    // Check if at least one field is provided
    const hasUpdates = 
      Object.hasOwn(input, "sku") ||
      typeof input.name === "string" ||
      typeof input.unit === "string" ||
      typeof input.is_active === "boolean";
    
    if (!hasUpdates) {
      return errorResponse("INVALID_REQUEST", "No fields to update", 400);
    }

    const updatedSupply = await updateSupply(auth.companyId, supplyId, {
      sku: input.sku,
      name: input.name,
      unit: input.unit,
      is_active: input.is_active
    }, {
      userId: auth.userId
    });

    if (!updatedSupply) {
      return errorResponse("NOT_FOUND", "Supply not found", 404);
    }

    return successResponse(updatedSupply);
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return errorResponse("INVALID_REQUEST", "Invalid request", 400);
    }

    if (error instanceof InventoryConflictError) {
      return errorResponse("CONFLICT", "Supply conflict", 409);
    }

    if (error instanceof DatabaseReferenceError) {
      return errorResponse("NOT_FOUND", "Supply not found", 404);
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
      resource: "items",
      permission: "delete"
    })(c.req.raw, auth);

    if (accessResult !== null) {
      return accessResult;
    }

    const supplyId = NumericIdSchema.parse(c.req.param("id"));

    const deleted = await deleteSupply(auth.companyId, supplyId, {
      userId: auth.userId
    });

    if (!deleted) {
      return errorResponse("NOT_FOUND", "Supply not found", 404);
    }

    return successResponse({
      id: supplyId,
      deleted: true
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid supply ID", 400);
    }

    if (error instanceof DatabaseReferenceError) {
      return errorResponse("NOT_FOUND", "Supply not found", 404);
    }

    console.error("DELETE /supplies/:id failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to delete supply", 500);
  }
});

// ============================================================================
// OpenAPI Route Registration (for use with OpenAPIHono)
// ============================================================================

/**
 * Supply response schema for OpenAPI registration.
 * Reflects the Supply interface from @jurnapod/modules-inventory.
 */
const SupplyResponseSchema = zodOpenApi
  .object({
    id: zodOpenApi.number().int().openapi({ description: "Supply ID", example: 1 }),
    sku: zodOpenApi.string().nullable().openapi({ description: "Stock keeping unit", example: "SUP-001" }),
    name: zodOpenApi.string().openapi({ description: "Supply name", example: "Coffee Beans" }),
    unit: zodOpenApi.string().openapi({ description: "Unit of measure", example: "kg" }),
    is_active: zodOpenApi.boolean().openapi({ description: "Whether the supply is active", example: true }),
    updated_at: zodOpenApi.string().openapi({ description: "Last update timestamp (ISO 8601)", example: "2026-01-15T10:30:00.000Z" }),
  })
  .openapi("SupplyResponse");

/**
 * Standard error envelope schema shared across supplies OpenAPI responses.
 */
const SuppliesErrorResponseSchema = zodOpenApi
  .object({
    success: zodOpenApi.literal(false).openapi({ example: false }),
    error: zodOpenApi
      .object({
        code: zodOpenApi.string().openapi({ description: "Error code" }),
        message: zodOpenApi.string().openapi({ description: "Error message" }),
      })
      .openapi("SuppliesErrorDetail"),
  })
  .openapi("SuppliesErrorResponse");

/**
 * Registers supply routes with an OpenAPIHono instance.
 *
 * NOTE: The handlers registered below are OpenAPI spec-registration scaffolding
 * only. Runtime authentication, authorization (ACL), and tenant scoping are
 * enforced by the `suppliesRoutes` Hono instance (lines 68–313). The OpenAPI
 * handlers exist solely to produce accurate API documentation and do not
 * duplicate the runtime guards.
 */
export function registerSupplyRoutes(app: { openapi: OpenAPIHonoType["openapi"] }): void {
  // GET /inventory/supplies - List supplies
  const listSuppliesRoute = createRoute({
    path: "/inventory/supplies",
    method: "get",
    tags: ["Inventory"],
    summary: "List supplies",
    description: "List supply items with optional filtering",
    security: [{ BearerAuth: [] }],
    request: {
      query: z.object({
        is_active: z.string().optional(),
      }),
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: zodOpenApi
              .object({
                success: zodOpenApi.literal(true).openapi({ example: true }),
                data: zodOpenApi.array(SupplyResponseSchema).openapi({ description: "List of supplies" }),
              })
              .openapi("SuppliesListResponse"),
          },
        },
        description: "List of supplies",
      },
      400: {
        content: { "application/json": { schema: SuppliesErrorResponseSchema } },
        description: "Invalid request",
      },
      401: {
        content: { "application/json": { schema: SuppliesErrorResponseSchema } },
        description: "Unauthorized",
      },
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app.openapi(listSuppliesRoute, (async (c: any) => {
    const auth = c.get("auth");
    const query = c.req.valid("query") || {};
    
    let isActiveFilter: boolean | undefined;
    if (query.is_active === "true") {
      isActiveFilter = true;
    } else if (query.is_active === "false") {
      isActiveFilter = false;
    }

    const supplies = await listSupplies(auth.companyId, { isActive: isActiveFilter });
    return c.json({ success: true, data: supplies });
  }) as any);

  // GET /inventory/supplies/:id - Get supply
  const getSupplyRoute = createRoute({
    path: "/inventory/supplies/{id}",
    method: "get",
    tags: ["Inventory"],
    summary: "Get supply",
    description: "Get a single supply by ID",
    security: [{ BearerAuth: [] }],
    request: {
      params: zodOpenApi.object({
        id: NumericIdSchema,
      }),
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: zodOpenApi
              .object({
                success: zodOpenApi.literal(true).openapi({ example: true }),
                data: SupplyResponseSchema,
              })
              .openapi("SupplyGetResponse"),
          },
        },
        description: "Supply details",
      },
      400: {
        content: { "application/json": { schema: SuppliesErrorResponseSchema } },
        description: "Invalid request",
      },
      401: {
        content: { "application/json": { schema: SuppliesErrorResponseSchema } },
        description: "Unauthorized",
      },
      404: {
        content: { "application/json": { schema: SuppliesErrorResponseSchema } },
        description: "Supply not found",
      },
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app.openapi(getSupplyRoute, (async (c: any) => {
    const auth = c.get("auth");
    const { id } = c.req.valid("param");
    const supplyId = NumericIdSchema.parse(id);

    const supply = await findSupplyById(auth.companyId, supplyId);
    if (!supply) {
      return c.json({ success: false, error: { code: "NOT_FOUND", message: "Supply not found" } }, 404);
    }

    return c.json({ success: true, data: supply });
  }) as any);

  // POST /inventory/supplies - Create supply
  const createSupplyRoute = createRoute({
    path: "/inventory/supplies",
    method: "post",
    tags: ["Inventory"],
    summary: "Create supply",
    description: "Create a new supply item",
    security: [{ BearerAuth: [] }],
    request: {
      body: {
        content: {
          "application/json": {
            schema: SupplyCreateSchema,
          },
        },
      },
    },
    responses: {
      201: {
        content: {
          "application/json": {
            schema: zodOpenApi
              .object({
                success: zodOpenApi.literal(true).openapi({ example: true }),
                data: SupplyResponseSchema,
              })
              .openapi("SupplyCreateResponse"),
          },
        },
        description: "Supply created",
      },
      400: {
        content: { "application/json": { schema: SuppliesErrorResponseSchema } },
        description: "Invalid request",
      },
      401: {
        content: { "application/json": { schema: SuppliesErrorResponseSchema } },
        description: "Unauthorized",
      },
      409: {
        content: { "application/json": { schema: SuppliesErrorResponseSchema } },
        description: "Supply conflict",
      },
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app.openapi(createSupplyRoute, (async (c: any) => {
    const auth = c.get("auth");
    
    // Check access permission using bitmask system
    const accessResult = await requireAccess({
      module: "inventory",
      resource: "items",
      permission: "create"
    })(c.req.raw, auth);

    if (accessResult !== null) {
      return accessResult;
    }

    const payload = await c.req.json();
    const input = SupplyCreateSchema.parse(payload);

    const supply = await createSupply(auth.companyId, {
      sku: input.sku,
      name: input.name,
      unit: input.unit,
      is_active: input.is_active
    }, { userId: auth.userId });

    return c.json({ success: true, data: supply }, 201);
  }) as any);
}

export { suppliesRoutes };
