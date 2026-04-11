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
import { createRoute, type OpenAPIHono as OpenAPIHonoType } from "@hono/zod-openapi";
import { NumericIdSchema } from "@jurnapod/shared";
import {
  authenticateRequest,
  requireAccess,
  type AuthContext
} from "../lib/auth-guard.js";
import { errorResponse, successResponse } from "../lib/response.js";
import { listOutletsByCompany, createOutlet, getOutlet, updateOutlet, deleteOutlet, OutletNotFoundError } from "../lib/outlets.js";
import { checkUserAccess } from "../lib/auth.js";
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

const CreateOutletSchema = z.object({
  code: z.string().trim().min(1).max(32),
  name: z.string().trim().min(1).max(191),
  company_id: z.number().int().positive().optional(),
  city: z.string().trim().max(100).optional(),
  address_line1: z.string().trim().max(191).optional(),
  address_line2: z.string().trim().max(191).optional(),
  postal_code: z.string().trim().max(20).optional(),
  phone: z.string().trim().max(50).optional(),
  email: z.string().trim().max(191).email().nullable().optional(),
  timezone: z.string().trim().max(50).optional()
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
      module: "platform",
      resource: "outlets",
      permission: "read"
    })(c.req.raw, auth);

    if (accessResult !== null) {
      return accessResult;
    }

    const url = new URL(c.req.raw.url);
    const companyIdParam = url.searchParams.get("company_id");

    // Determine which company to list outlets for
    let targetCompanyId = auth.companyId;
    if (companyIdParam !== null) {
      const requestedCompanyId = Number(companyIdParam);
      if (requestedCompanyId !== auth.companyId) {
        // Check if user is SUPER_ADMIN - only they can access other companies
        const accessCheck = await checkUserAccess({
          userId: auth.userId,
          companyId: auth.companyId
        });
        if (!accessCheck || !accessCheck.isSuperAdmin) {
          return errorResponse("INVALID_REQUEST", "Cannot list outlets for another company", 400);
        }
        targetCompanyId = requestedCompanyId;
      }
    }

    // List outlets for the target company
    const outlets = await listOutletsByCompany(targetCompanyId);
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
      module: "platform",
      resource: "outlets",
      permission: "create"
    })(c.req.raw, auth);

    if (accessResult !== null) {
      return accessResult;
    }

    const payload = await c.req.json();
    const input = CreateOutletSchema.parse(payload);

    // Determine target company: use body company_id if SUPER_ADMIN, otherwise use auth.companyId
    const targetCompanyId = input.company_id ?? auth.companyId;

    // Check if user is SUPER_ADMIN for cross-company operations
    const accessCheck = await checkUserAccess({
      userId: auth.userId,
      companyId: auth.companyId
    });

    // Non-SUPER_ADMIN can only create outlets in their own company
    if (targetCompanyId !== auth.companyId && !accessCheck?.isSuperAdmin) {
      return errorResponse("FORBIDDEN", "Cannot create outlet in another company", 403);
    }

    const outlet = await createOutlet({
      company_id: targetCompanyId,
      code: input.code,
      name: input.name,
      city: input.city,
      address_line1: input.address_line1,
      address_line2: input.address_line2,
      postal_code: input.postal_code,
      phone: input.phone,
      email: input.email,
      timezone: input.timezone,
      actor: {
        userId: auth.userId,
        ipAddress: readClientIp(c.req.raw)
      }
    });

    return successResponse(outlet, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const emailError = error.errors.find(e => e.path.includes("email"));
      if (emailError) {
        return errorResponse("INVALID_REQUEST", `Invalid email format: ${emailError.message}`, 400);
      }
      return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
    }
    if (error instanceof SyntaxError) {
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

// GET /outlets/:id - Get single outlet
outletsRoutes.get("/:id", async (c) => {
  try {
    const auth = c.get("auth");
    const outletId = NumericIdSchema.parse(c.req.param("id"));
    const url = new URL(c.req.raw.url);
    const companyIdParam = url.searchParams.get("company_id");
    
    // Check access permission using bitmask system
    const accessResult = await requireAccess({
      module: "platform",
      resource: "outlets",
      permission: "read"
    })(c.req.raw, auth);

    if (accessResult !== null) {
      return accessResult;
    }

    // If company_id is specified, it must match the authenticated user's company
    if (companyIdParam !== null) {
      const requestedCompanyId = Number(companyIdParam);
      if (requestedCompanyId !== auth.companyId) {
        return errorResponse("INVALID_REQUEST", "Cannot access outlets from another company", 400);
      }
    }

    // Non-SUPER_ADMIN can only access their own company's outlets
    const outlet = await getOutlet(auth.companyId, outletId);
    return successResponse(outlet);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid outlet ID", 400);
    }

    if (error instanceof OutletNotFoundError) {
      return errorResponse("NOT_FOUND", "Outlet not found", 404);
    }

    console.error("GET /outlets/:id failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to fetch outlet", 500);
  }
});

// PATCH /outlets/:id - Update outlet
outletsRoutes.patch("/:id", async (c) => {
  try {
    const auth = c.get("auth");
    
    // Check access permission using bitmask system
    const accessResult = await requireAccess({
      module: "platform",
      resource: "outlets",
      permission: "update"
    })(c.req.raw, auth);

    if (accessResult !== null) {
      return accessResult;
    }

    const outletId = NumericIdSchema.parse(c.req.param("id"));
    const url = new URL(c.req.raw.url);
    const companyIdParam = url.searchParams.get("company_id");

    // If company_id is specified, it must match the authenticated user's company
    if (companyIdParam !== null) {
      const requestedCompanyId = Number(companyIdParam);
      if (requestedCompanyId !== auth.companyId) {
        return errorResponse("INVALID_REQUEST", "Cannot update outlets from another company", 400);
      }
    }

    const payload = await c.req.json();
    const input = z.object({
      code: z.string().trim().min(1).max(32).optional(),
      name: z.string().trim().min(1).max(191).optional(),
      city: z.string().trim().max(100).nullable().optional(),
      address_line1: z.string().trim().max(191).nullable().optional(),
      address_line2: z.string().trim().max(191).nullable().optional(),
      postal_code: z.string().trim().max(20).nullable().optional(),
      phone: z.string().trim().max(50).nullable().optional(),
      email: z.string().trim().max(191).email().nullable().optional(),
      timezone: z.string().trim().max(50).nullable().optional(),
      is_active: z.boolean().optional()
    }).parse(payload);

    // Validate at least one field is provided
    const hasAtLeastOneField = 
      input.code !== undefined ||
      input.name !== undefined ||
      input.city !== undefined ||
      input.address_line1 !== undefined ||
      input.address_line2 !== undefined ||
      input.postal_code !== undefined ||
      input.phone !== undefined ||
      input.email !== undefined ||
      input.timezone !== undefined ||
      input.is_active !== undefined;

    if (!hasAtLeastOneField) {
      return errorResponse("INVALID_REQUEST", "At least one field must be provided", 400);
    }

    // Non-SUPER_ADMIN can only update their own company's outlets
    const outlet = await updateOutlet({
      companyId: auth.companyId,
      outletId: outletId,
      name: input.name,
      city: input.city,
      address_line1: input.address_line1,
      address_line2: input.address_line2,
      postal_code: input.postal_code,
      phone: input.phone,
      email: input.email,
      timezone: input.timezone,
      is_active: input.is_active,
      actor: { 
        userId: auth.userId,
        ipAddress: readClientIp(c.req.raw)
      }
    });
    return successResponse(outlet);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const emailError = error.errors.find(e => e.path.includes("email"));
      if (emailError) {
        return errorResponse("INVALID_REQUEST", `Invalid email format: ${emailError.message}`, 400);
      }
      return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
    }
    if (error instanceof SyntaxError) {
      return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
    }
    if (error instanceof OutletNotFoundError) {
      return errorResponse("NOT_FOUND", error.message, 404);
    }

    console.error("PATCH /outlets/:id failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to update outlet", 500);
  }
});

// DELETE /outlets/:id - Delete outlet
outletsRoutes.delete("/:id", async (c) => {
  try {
    const auth = c.get("auth");
    
    // Check access permission using bitmask system
    const accessResult = await requireAccess({
      module: "platform",
      resource: "outlets",
      permission: "delete"
    })(c.req.raw, auth);

    if (accessResult !== null) {
      return accessResult;
    }

    const outletId = NumericIdSchema.parse(c.req.param("id"));
    const url = new URL(c.req.raw.url);
    const companyIdParam = url.searchParams.get("company_id");

    // If company_id is specified, it must match the authenticated user's company
    if (companyIdParam !== null) {
      const requestedCompanyId = Number(companyIdParam);
      if (requestedCompanyId !== auth.companyId) {
        return errorResponse("INVALID_REQUEST", "Cannot delete outlets for another company", 400);
      }
    }

    // Non-SUPER_ADMIN can only delete their own company's outlets
    await deleteOutlet({
      companyId: auth.companyId,
      outletId: outletId,
      actor: { 
        userId: auth.userId,
        ipAddress: readClientIp(c.req.raw)
      }
    });
    return successResponse({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid outlet ID", 400);
    }
    if (error instanceof OutletNotFoundError) {
      return errorResponse("NOT_FOUND", error.message, 404);
    }

    console.error("DELETE /outlets/:id failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to delete outlet", 500);
  }
});

// ============================================================================
// OpenAPI Route Registration
// ============================================================================

type OpenAPIHonoInterface = {
  openapi: OpenAPIHonoType["openapi"];
};

// OpenAPI Schemas
const OutletSchema = z.object({
  id: z.number(),
  company_id: z.number(),
  code: z.string(),
  name: z.string(),
  city: z.string().nullable(),
  address_line1: z.string().nullable(),
  address_line2: z.string().nullable(),
  postal_code: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  timezone: z.string().nullable(),
  is_active: z.boolean(),
  created_at: z.string(),
  updated_at: z.string()
}).openapi("Outlet");

const OutletListResponseSchema = z.object({
  success: z.boolean(),
  data: z.array(OutletSchema)
}).openapi("OutletListResponse");

const OutletResponseSchema = z.object({
  success: z.boolean(),
  data: OutletSchema
}).openapi("OutletResponse");

const ErrorResponseSchema = z.object({
  success: z.boolean(),
  error: z.object({
    code: z.string(),
    message: z.string()
  })
}).openapi("ErrorResponse");

export const registerOutletRoutes = (app: OpenAPIHonoInterface): void => {
  // GET /outlets - List outlets for company
  app.openapi(
    createRoute({
      method: "get",
      path: "/outlets",
      tags: ["Outlets"],
      summary: "List outlets",
      description: "List all outlets for the authenticated company",
      security: [{ BearerAuth: [] }],
      responses: {
        200: { content: { "application/json": { schema: OutletListResponseSchema } }, description: "List of outlets" },
        401: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Unauthorized" },
        500: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Internal server error" }
      }
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (c: any) => {
      try {
        const auth = c.get("auth");
        const accessResult = await requireAccess({ module: "platform", resource: "outlets", permission: "read" })(c.req.raw, auth);
        if (accessResult !== null) return accessResult;

        const outlets = await listOutletsByCompany(auth.companyId);
        return c.json({ success: true, data: outlets });
      } catch (error) {
        console.error("GET /outlets failed", error);
        return c.json({ success: false, error: { code: "INTERNAL_SERVER_ERROR", message: "Failed to fetch outlets" } }, 500);
      }
    }
  );

  // POST /outlets - Create new outlet
  app.openapi(
    createRoute({
      method: "post",
      path: "/outlets",
      tags: ["Outlets"],
      summary: "Create outlet",
      description: "Create a new outlet for the company",
      security: [{ BearerAuth: [] }],
      request: {
        body: {
          content: {
            "application/json": { schema: CreateOutletSchema }
          }
        }
      },
      responses: {
        201: { content: { "application/json": { schema: OutletResponseSchema } }, description: "Outlet created" },
        400: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Invalid request" },
        401: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Unauthorized" },
        500: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Internal server error" }
      }
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (c: any) => {
      try {
        const auth = c.get("auth");
        const accessResult = await requireAccess({ module: "platform", resource: "outlets", permission: "create" })(c.req.raw, auth);
        if (accessResult !== null) return accessResult;

        const payload = await c.req.json();
        const input = CreateOutletSchema.parse(payload);
        const targetCompanyId = input.company_id ?? auth.companyId;

        const outlet = await createOutlet({
          company_id: targetCompanyId,
          code: input.code,
          name: input.name,
          city: input.city,
          address_line1: input.address_line1,
          address_line2: input.address_line2,
          postal_code: input.postal_code,
          phone: input.phone,
          email: input.email,
          timezone: input.timezone,
          actor: { userId: auth.userId, ipAddress: readClientIp(c.req.raw) }
        });

        return c.json({ success: true, data: outlet }, 201);
      } catch (error) {
        if (error instanceof z.ZodError) {
          return c.json({ success: false, error: { code: "INVALID_REQUEST", message: "Invalid request body" } }, 400);
        }
        console.error("POST /outlets failed", error);
        return c.json({ success: false, error: { code: "INTERNAL_SERVER_ERROR", message: "Failed to create outlet" } }, 500);
      }
    }
  );

  // GET /outlets/access - Check outlet access
  app.openapi(
    createRoute({
      method: "get",
      path: "/outlets/access",
      tags: ["Outlets"],
      summary: "Check outlet access",
      description: "Check if the user has access to a specific outlet",
      security: [{ BearerAuth: [] }],
      responses: {
        200: { content: { "application/json": { schema: z.object({ success: z.boolean(), data: z.object({ access: z.boolean() }) }) } }, description: "Access check result" },
        400: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Invalid request" },
        401: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Unauthorized" },
        403: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Forbidden" }
      }
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (c: any) => {
      try {
        const auth = c.get("auth");
        const url = new URL(c.req.raw.url);
        const outletIdParam = url.searchParams.get("outlet_id");

        if (!outletIdParam) {
          return c.json({ success: false, error: { code: "INVALID_REQUEST", message: "outlet_id parameter is required" } }, 400);
        }

        const outletId = NumericIdSchema.parse(outletIdParam);
        const access = await checkUserAccess({ userId: auth.userId, companyId: auth.companyId, outletId, module: "outlets", permission: "read" });

        if (!access || (!access.hasRole && !access.hasGlobalRole && !access.isSuperAdmin)) {
          return c.json({ success: false, error: { code: "FORBIDDEN", message: "Access denied to outlet" } }, 403);
        }

        return c.json({ success: true, data: { access: true } });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return c.json({ success: false, error: { code: "INVALID_REQUEST", message: "Invalid outlet_id parameter" } }, 400);
        }
        console.error("GET /outlets/access failed", error);
        return c.json({ success: false, error: { code: "INTERNAL_SERVER_ERROR", message: "Failed to check outlet access" } }, 500);
      }
    }
  );

  // GET /outlets/:id - Get single outlet
  app.openapi(
    createRoute({
      method: "get",
      path: "/outlets/{id}",
      tags: ["Outlets"],
      summary: "Get outlet",
      description: "Get a single outlet by ID",
      security: [{ BearerAuth: [] }],
      request: { params: z.object({ id: z.string() }) },
      responses: {
        200: { content: { "application/json": { schema: OutletResponseSchema } }, description: "Outlet details" },
        400: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Invalid request" },
        401: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Unauthorized" },
        404: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Not found" }
      }
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (c: any) => {
      try {
        const auth = c.get("auth");
        const outletId = NumericIdSchema.parse(c.req.param("id"));

        const accessResult = await requireAccess({ module: "platform", resource: "outlets", permission: "read" })(c.req.raw, auth);
        if (accessResult !== null) return accessResult;

        const outlet = await getOutlet(auth.companyId, outletId);
        return c.json({ success: true, data: outlet });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return c.json({ success: false, error: { code: "INVALID_REQUEST", message: "Invalid outlet ID" } }, 400);
        }
        if (error instanceof OutletNotFoundError) {
          return c.json({ success: false, error: { code: "NOT_FOUND", message: "Outlet not found" } }, 404);
        }
        console.error("GET /outlets/:id failed", error);
        return c.json({ success: false, error: { code: "INTERNAL_SERVER_ERROR", message: "Failed to fetch outlet" } }, 500);
      }
    }
  );

  // PATCH /outlets/:id - Update outlet
  app.openapi(
    createRoute({
      method: "patch",
      path: "/outlets/{id}",
      tags: ["Outlets"],
      summary: "Update outlet",
      description: "Update an existing outlet",
      security: [{ BearerAuth: [] }],
      request: {
        params: z.object({ id: z.string() }),
        body: { content: { "application/json": { schema: z.object({
          code: z.string().trim().min(1).max(32).optional(),
          name: z.string().trim().min(1).max(191).optional(),
          city: z.string().trim().max(100).nullable().optional(),
          address_line1: z.string().trim().max(191).nullable().optional(),
          address_line2: z.string().trim().max(191).nullable().optional(),
          postal_code: z.string().trim().max(20).nullable().optional(),
          phone: z.string().trim().max(50).nullable().optional(),
          email: z.string().trim().max(191).email().nullable().optional(),
          timezone: z.string().trim().max(50).nullable().optional(),
          is_active: z.boolean().optional()
        }) } } }
      },
      responses: {
        200: { content: { "application/json": { schema: OutletResponseSchema } }, description: "Outlet updated" },
        400: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Invalid request" },
        401: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Unauthorized" },
        404: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Not found" }
      }
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (c: any) => {
      try {
        const auth = c.get("auth");
        const accessResult = await requireAccess({ module: "platform", resource: "outlets", permission: "update" })(c.req.raw, auth);
        if (accessResult !== null) return accessResult;

        const outletId = NumericIdSchema.parse(c.req.param("id"));
        const payload = await c.req.json();
        const input = z.object({
          code: z.string().trim().min(1).max(32).optional(),
          name: z.string().trim().min(1).max(191).optional(),
          city: z.string().trim().max(100).nullable().optional(),
          address_line1: z.string().trim().max(191).nullable().optional(),
          address_line2: z.string().trim().max(191).nullable().optional(),
          postal_code: z.string().trim().max(20).nullable().optional(),
          phone: z.string().trim().max(50).nullable().optional(),
          email: z.string().trim().max(191).email().nullable().optional(),
          timezone: z.string().trim().max(50).nullable().optional(),
          is_active: z.boolean().optional()
        }).parse(payload);

        const outlet = await updateOutlet({
          companyId: auth.companyId, outletId,
          name: input.name, city: input.city, address_line1: input.address_line1, address_line2: input.address_line2,
          postal_code: input.postal_code, phone: input.phone, email: input.email, timezone: input.timezone, is_active: input.is_active,
          actor: { userId: auth.userId, ipAddress: readClientIp(c.req.raw) }
        });
        return c.json({ success: true, data: outlet });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return c.json({ success: false, error: { code: "INVALID_REQUEST", message: "Invalid request body" } }, 400);
        }
        console.error("PATCH /outlets/:id failed", error);
        return c.json({ success: false, error: { code: "INTERNAL_SERVER_ERROR", message: "Failed to update outlet" } }, 500);
      }
    }
  );

  // DELETE /outlets/:id - Delete outlet
  app.openapi(
    createRoute({
      method: "delete",
      path: "/outlets/{id}",
      tags: ["Outlets"],
      summary: "Delete outlet",
      description: "Delete an outlet",
      security: [{ BearerAuth: [] }],
      request: { params: z.object({ id: z.string() }) },
      responses: {
        200: { content: { "application/json": { schema: z.object({ success: z.boolean(), data: z.object({ success: z.boolean() }) }) } }, description: "Outlet deleted" },
        400: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Invalid request" },
        401: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Unauthorized" },
        404: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Not found" }
      }
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (c: any) => {
      try {
        const auth = c.get("auth");
        const accessResult = await requireAccess({ module: "platform", resource: "outlets", permission: "delete" })(c.req.raw, auth);
        if (accessResult !== null) return accessResult;

        const outletId = NumericIdSchema.parse(c.req.param("id"));
        await deleteOutlet({ companyId: auth.companyId, outletId, actor: { userId: auth.userId, ipAddress: readClientIp(c.req.raw) } });
        return c.json({ success: true, data: { success: true } });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return c.json({ success: false, error: { code: "INVALID_REQUEST", message: "Invalid outlet ID" } }, 400);
        }
        console.error("DELETE /outlets/:id failed", error);
        return c.json({ success: false, error: { code: "INTERNAL_SERVER_ERROR", message: "Failed to delete outlet" } }, 500);
      }
    }
  );
};

export { outletsRoutes };
