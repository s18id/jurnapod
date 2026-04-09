// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Company Routes
 *
 * Routes for company management:
 * - GET /companies - List companies (super admin only)
 * - POST /companies - Create company (super admin only) 
 * - GET /companies/:id - Get company details
 * - PATCH /companies/:id - Update company details
 *
 * Required role: SUPER_ADMIN for most operations, company members for read
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
import {
  CompanyNotFoundError,
  CompanyCodeExistsError
} from "@jurnapod/modules-platform";
import { getCompanyService } from "../lib/companies.js";

declare module "hono" {
  interface ContextVariableMap {
    auth: AuthContext;
  }
}

/**
 * Extract client IP address from request headers.
 */
function getClientIp(request: Request): string | null {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    null
  );
}

// =============================================================================
// Request Schemas
// =============================================================================

const CreateCompanySchema = z.object({
  code: z.string().trim().min(1).max(32),
  name: z.string().trim().min(1).max(191),
  legal_name: z.string().trim().min(1).max(191).optional(),
  tax_id: z.string().trim().max(191).nullable().optional(),
  email: z.string().email().max(191).nullable().optional(),
  phone: z.string().trim().max(50).nullable().optional(),
  address_line1: z.string().trim().max(191).nullable().optional(),
  address_line2: z.string().trim().max(191).nullable().optional(),
  city: z.string().trim().max(100).nullable().optional(),
  postal_code: z.string().trim().max(20).nullable().optional(),
  timezone: z.string().trim().max(50).nullable().optional(),
  currency_code: z.string().trim().min(3).max(3).nullable().optional()
});

const UpdateCompanySchema = z.object({
  name: z.string().trim().min(1).max(191).optional(),
  legal_name: z.string().trim().min(1).max(191).nullable().optional(),
  tax_id: z.string().trim().max(191).nullable().optional(),
  email: z.string().email().max(191).nullable().optional(),
  phone: z.string().trim().max(50).nullable().optional(),
  address_line1: z.string().trim().max(191).nullable().optional(),
  address_line2: z.string().trim().max(191).nullable().optional(),
  city: z.string().trim().max(100).nullable().optional(),
  postal_code: z.string().trim().max(20).nullable().optional(),
  timezone: z.string().trim().max(50).nullable().optional(),
  currency_code: z.string().trim().min(3).max(3).nullable().optional()
});

// =============================================================================
// Company Routes
// =============================================================================

const companyRoutes = new Hono();

// Auth middleware
companyRoutes.use("/*", async (c, next) => {
  const authResult = await authenticateRequest(c.req.raw);
  if (!authResult.success) {
    c.status(401);
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Missing or invalid access token" } });
  }
  c.set("auth", authResult.auth);
  await next();
});

// Service instance
const companyService = getCompanyService();

// GET /companies - List companies
// - SUPER_ADMIN: can see all companies
// - Other roles: can only see their own company
companyRoutes.get("/", async (c) => {
  try {
    const auth = c.get("auth");
    
    // Check access permission using bitmask system
    const accessResult = await requireAccess({
      module: "companies",
      permission: "read"
    })(c.req.raw, auth);

    if (accessResult !== null) {
      return accessResult;
    }

    const url = new URL(c.req.raw.url);
    const isActive = url.searchParams.get("is_active");

    // TENANT ISOLATION: Only SUPER_ADMIN can see all companies
    // Regular users can only see their own company
    const isSuperAdmin = auth.role === "SUPER_ADMIN";
    const companyIdFilter = isSuperAdmin ? undefined : auth.companyId;

    const companies = await companyService.listCompanies({
      companyId: companyIdFilter,
      includeDeleted: isActive === "false" ? true : false
    });

    return successResponse(companies);
  } catch (error) {
    console.error("GET /companies failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to fetch companies", 500);
  }
});

// POST /companies - Create company (super admin only)
companyRoutes.post("/", async (c) => {
  try {
    const auth = c.get("auth");
    
    // Check access permission using bitmask system
    const accessResult = await requireAccess({
      module: "companies",
      permission: "create"
    })(c.req.raw, auth);

    if (accessResult !== null) {
      return accessResult;
    }

    const payload = await c.req.json();
    const input = CreateCompanySchema.parse(payload);

    const company = await companyService.createCompany({
      code: input.code,
      name: input.name,
      legal_name: input.legal_name,
      tax_id: input.tax_id,
      email: input.email,
      phone: input.phone,
      address_line1: input.address_line1,
      address_line2: input.address_line2,
      city: input.city,
      postal_code: input.postal_code,
      timezone: input.timezone,
      currency_code: input.currency_code,
      actor: {
        userId: auth.userId,
        ipAddress: getClientIp(c.req.raw)
      }
    });

    return successResponse(company, 201);
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
    }

    if (error instanceof CompanyCodeExistsError) {
      return errorResponse("CONFLICT", "Company code already exists", 409);
    }

    console.error("POST /companies failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to create company", 500);
  }
});

// GET /companies/:id - Get company details
companyRoutes.get("/:id", async (c) => {
  try {
    const auth = c.get("auth");
    const companyId = NumericIdSchema.parse(c.req.param("id"));
    
    // Users can only access their own company unless they have cross-company permissions
    if (companyId !== auth.companyId) {
      const accessResult = await requireAccess({
        module: "companies",
        permission: "read"
      })(c.req.raw, auth);

      if (accessResult !== null) {
        return accessResult;
      }
    }

    const company = await companyService.getCompany({ companyId });
    return successResponse(company);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid company ID", 400);
    }

    if (error instanceof CompanyNotFoundError) {
      return errorResponse("NOT_FOUND", "Company not found", 404);
    }

    console.error("GET /companies/:id failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to fetch company", 500);
  }
});

// PATCH /companies/:id - Update company details
companyRoutes.patch("/:id", async (c) => {
  try {
    const auth = c.get("auth");
    const companyId = NumericIdSchema.parse(c.req.param("id"));
    
    // Check access permission using bitmask system
    const accessResult = await requireAccess({
      module: "companies",
      permission: "update"
    })(c.req.raw, auth);

    if (accessResult !== null) {
      return accessResult;
    }

    const payload = await c.req.json();
    const input = UpdateCompanySchema.parse(payload);

    const company = await companyService.updateCompany({
      companyId,
      name: input.name,
      legal_name: input.legal_name,
      tax_id: input.tax_id,
      email: input.email,
      phone: input.phone,
      address_line1: input.address_line1,
      address_line2: input.address_line2,
      city: input.city,
      postal_code: input.postal_code,
      timezone: input.timezone,
      currency_code: input.currency_code,
      actor: {
        userId: auth.userId,
        ipAddress: getClientIp(c.req.raw)
      }
    });

    return successResponse(company);
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
    }

    if (error instanceof CompanyNotFoundError) {
      return errorResponse("NOT_FOUND", "Company not found", 404);
    }

    console.error("PATCH /companies/:id failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to update company", 500);
  }
});

export { companyRoutes };

// ============================================================================
// OpenAPI Route Registration
// ============================================================================

/**
 * Company response schema
 */
const CompanyDataSchema = zodOpenApi.object({
  id: zodOpenApi.number().openapi({ description: "Company ID" }),
  code: zodOpenApi.string().openapi({ description: "Company code" }),
  name: zodOpenApi.string().openapi({ description: "Company name" }),
  legal_name: zodOpenApi.string().optional().openapi({ description: "Legal name" }),
  tax_id: zodOpenApi.string().nullable().optional().openapi({ description: "Tax ID" }),
  email: zodOpenApi.string().nullable().optional().openapi({ description: "Email" }),
  phone: zodOpenApi.string().nullable().optional().openapi({ description: "Phone" }),
  address_line1: zodOpenApi.string().nullable().optional().openapi({ description: "Address line 1" }),
  address_line2: zodOpenApi.string().nullable().optional().openapi({ description: "Address line 2" }),
  city: zodOpenApi.string().nullable().optional().openapi({ description: "City" }),
  postal_code: zodOpenApi.string().nullable().optional().openapi({ description: "Postal code" }),
  timezone: zodOpenApi.string().nullable().optional().openapi({ description: "Timezone" }),
  currency_code: zodOpenApi.string().nullable().optional().openapi({ description: "Currency code" }),
  is_active: zodOpenApi.boolean().optional().openapi({ description: "Is active" }),
  created_at: zodOpenApi.string().openapi({ description: "Created at" }),
  updated_at: zodOpenApi.string().openapi({ description: "Updated at" }),
}).openapi("CompanyData");

/**
 * Registers company routes with an OpenAPIHono instance.
 */
export function registerCompanyRoutes(app: OpenAPIHono): void {
  // GET /companies - List companies
  app.openapi(
    createRoute({
      method: "get",
      path: "/companies",
      operationId: "listCompanies",
      summary: "List companies",
      description: "List all companies. SUPER_ADMIN can see all, others see only their own.",
      tags: ["Companies"],
      security: [{ BearerAuth: [] }],
      responses: {
        200: {
          description: "List of companies",
          content: {
            "application/json": {
              schema: zodOpenApi.object({
                success: zodOpenApi.literal(true),
                data: zodOpenApi.array(CompanyDataSchema),
              }).openapi("CompanyListResponse"),
            },
          },
        },
        401: { description: "Unauthorized" },
        403: { description: "Forbidden" },
      },
    }),
    async (c): Promise<any> => {
      const auth = c.get("auth");
      const accessResult = await requireAccess({ module: "companies", permission: "read" })(c.req.raw, auth);
      if (accessResult !== null) return accessResult;

      const url = new URL(c.req.raw.url);
      const isActive = url.searchParams.get("is_active");
      const isSuperAdmin = auth.role === "SUPER_ADMIN";
      const companyIdFilter = isSuperAdmin ? undefined : auth.companyId;

      const companyService = getCompanyService();
      const companies = await companyService.listCompanies({
        companyId: companyIdFilter,
        includeDeleted: isActive === "false",
      });
      return c.json({ success: true, data: companies });
    }
  );

  // POST /companies - Create company
  app.openapi(
    createRoute({
      method: "post",
      path: "/companies",
      operationId: "createCompany",
      summary: "Create company",
      description: "Create a new company (super admin only).",
      tags: ["Companies"],
      security: [{ BearerAuth: [] }],
      request: {
        body: {
          content: {
            "application/json": {
              schema: zodOpenApi.object({
                code: zodOpenApi.string().min(1).max(32).openapi({ description: "Company code" }),
                name: zodOpenApi.string().min(1).max(191).openapi({ description: "Company name" }),
                legal_name: zodOpenApi.string().max(191).optional().openapi({ description: "Legal name" }),
                tax_id: zodOpenApi.string().max(191).nullable().optional().openapi({ description: "Tax ID" }),
                email: zodOpenApi.string().email().max(191).nullable().optional().openapi({ description: "Email" }),
                phone: zodOpenApi.string().max(50).nullable().optional().openapi({ description: "Phone" }),
                address_line1: zodOpenApi.string().max(191).nullable().optional().openapi({ description: "Address" }),
                address_line2: zodOpenApi.string().max(191).nullable().optional().openapi({ description: "Address" }),
                city: zodOpenApi.string().max(100).nullable().optional().openapi({ description: "City" }),
                postal_code: zodOpenApi.string().max(20).nullable().optional().openapi({ description: "Postal code" }),
                timezone: zodOpenApi.string().max(50).nullable().optional().openapi({ description: "Timezone" }),
                currency_code: zodOpenApi.string().min(3).max(3).nullable().optional().openapi({ description: "Currency code" }),
              }).openapi("CreateCompanyRequest"),
            },
          },
        },
      },
      responses: {
        201: {
          description: "Company created",
          content: {
            "application/json": {
              schema: zodOpenApi.object({
                success: zodOpenApi.literal(true),
                data: CompanyDataSchema,
              }).openapi("CreateCompanyResponse"),
            },
          },
        },
        400: { description: "Invalid request" },
        401: { description: "Unauthorized" },
        409: { description: "Company code already exists" },
      },
    }),
    async (c): Promise<any> => {
      const auth = c.get("auth");
      const accessResult = await requireAccess({ module: "companies", permission: "create" })(c.req.raw, auth);
      if (accessResult !== null) return accessResult;

      const payload = await c.req.json();
      const input = CreateCompanySchema.parse(payload);
      const companyService = getCompanyService();

      const company = await companyService.createCompany({
        code: input.code,
        name: input.name,
        legal_name: input.legal_name,
        tax_id: input.tax_id,
        email: input.email,
        phone: input.phone,
        address_line1: input.address_line1,
        address_line2: input.address_line2,
        city: input.city,
        postal_code: input.postal_code,
        timezone: input.timezone,
        currency_code: input.currency_code,
        actor: { userId: auth.userId, ipAddress: getClientIp(c.req.raw) },
      });
      return c.json({ success: true, data: company }, 201);
    }
  );

  // GET /companies/:id - Get company
  app.openapi(
    createRoute({
      method: "get",
      path: "/companies/{id}",
      operationId: "getCompany",
      summary: "Get company",
      description: "Get company details by ID.",
      tags: ["Companies"],
      security: [{ BearerAuth: [] }],
      request: {
        params: zodOpenApi.object({
          id: zodOpenApi.string().openapi({ description: "Company ID" }),
        }),
      },
      responses: {
        200: {
          description: "Company details",
          content: {
            "application/json": {
              schema: zodOpenApi.object({
                success: zodOpenApi.literal(true),
                data: CompanyDataSchema,
              }).openapi("GetCompanyResponse"),
            },
          },
        },
        400: { description: "Invalid company ID" },
        401: { description: "Unauthorized" },
        404: { description: "Company not found" },
      },
    }),
    async (c): Promise<any> => {
      const auth = c.get("auth");
      const companyId = NumericIdSchema.parse(c.req.param("id"));

      if (companyId !== auth.companyId) {
        const accessResult = await requireAccess({ module: "companies", permission: "read" })(c.req.raw, auth);
        if (accessResult !== null) return accessResult;
      }

      const companyService = getCompanyService();
      const company = await companyService.getCompany({ companyId });
      return c.json({ success: true, data: company });
    }
  );

  // PATCH /companies/:id - Update company
  app.openapi(
    createRoute({
      method: "patch",
      path: "/companies/{id}",
      operationId: "updateCompany",
      summary: "Update company",
      description: "Update company details.",
      tags: ["Companies"],
      security: [{ BearerAuth: [] }],
      request: {
        params: zodOpenApi.object({
          id: zodOpenApi.string().openapi({ description: "Company ID" }),
        }),
        body: {
          content: {
            "application/json": {
              schema: zodOpenApi.object({
                name: zodOpenApi.string().min(1).max(191).optional().openapi({ description: "Company name" }),
                legal_name: zodOpenApi.string().max(191).nullable().optional().openapi({ description: "Legal name" }),
                tax_id: zodOpenApi.string().max(191).nullable().optional().openapi({ description: "Tax ID" }),
                email: zodOpenApi.string().email().max(191).nullable().optional().openapi({ description: "Email" }),
                phone: zodOpenApi.string().max(50).nullable().optional().openapi({ description: "Phone" }),
                address_line1: zodOpenApi.string().max(191).nullable().optional().openapi({ description: "Address" }),
                address_line2: zodOpenApi.string().max(191).nullable().optional().openapi({ description: "Address" }),
                city: zodOpenApi.string().max(100).nullable().optional().openapi({ description: "City" }),
                postal_code: zodOpenApi.string().max(20).nullable().optional().openapi({ description: "Postal code" }),
                timezone: zodOpenApi.string().max(50).nullable().optional().openapi({ description: "Timezone" }),
                currency_code: zodOpenApi.string().min(3).max(3).nullable().optional().openapi({ description: "Currency code" }),
              }).openapi("UpdateCompanyRequest"),
            },
          },
        },
      },
      responses: {
        200: {
          description: "Company updated",
          content: {
            "application/json": {
              schema: zodOpenApi.object({
                success: zodOpenApi.literal(true),
                data: CompanyDataSchema,
              }).openapi("UpdateCompanyResponse"),
            },
          },
        },
        400: { description: "Invalid request" },
        401: { description: "Unauthorized" },
        404: { description: "Company not found" },
      },
    }),
    async (c): Promise<any> => {
      const auth = c.get("auth");
      const companyId = NumericIdSchema.parse(c.req.param("id"));
      const accessResult = await requireAccess({ module: "companies", permission: "update" })(c.req.raw, auth);
      if (accessResult !== null) return accessResult;

      const payload = await c.req.json();
      const input = UpdateCompanySchema.parse(payload);
      const companyService = getCompanyService();

      const company = await companyService.updateCompany({
        companyId,
        name: input.name,
        legal_name: input.legal_name,
        tax_id: input.tax_id,
        email: input.email,
        phone: input.phone,
        address_line1: input.address_line1,
        address_line2: input.address_line2,
        city: input.city,
        postal_code: input.postal_code,
        timezone: input.timezone,
        currency_code: input.currency_code,
        actor: { userId: auth.userId, ipAddress: getClientIp(c.req.raw) },
      });
      return c.json({ success: true, data: company });
    }
  );
}
