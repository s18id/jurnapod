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
import { NumericIdSchema } from "@jurnapod/shared";
import {
  authenticateRequest,
  requireAccess,
  type AuthContext
} from "../lib/auth-guard.js";
import { errorResponse, successResponse } from "../lib/response.js";
import {
  createCompany,
  listCompanies,
  getCompany,
  updateCompany,
  CompanyCodeExistsError,
  CompanyNotFoundError
} from "../lib/companies.js";

declare module "hono" {
  interface ContextVariableMap {
    auth: AuthContext;
  }
}

// =============================================================================
// Constants
// =============================================================================

const COMPANIES_ROLES_READ = ["OWNER", "COMPANY_ADMIN", "ADMIN", "ACCOUNTANT", "CASHIER"] as const;
const COMPANIES_ROLES_WRITE = ["OWNER", "COMPANY_ADMIN"] as const;
const COMPANIES_ROLES_CREATE = ["SUPER_ADMIN", "OWNER"] as const;

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
  timezone: z.string().trim().max(50).nullable().optional()
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
  timezone: z.string().trim().max(50).nullable().optional()
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

// GET /companies - List companies (super admin only)
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
    const limit = parseInt(url.searchParams.get("limit") || "50");
    const offset = parseInt(url.searchParams.get("offset") || "0");
    const search = url.searchParams.get("search") || undefined;
    const isActive = url.searchParams.get("is_active");

    const companies = await listCompanies({
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

    const company = await createCompany({
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
      actor: {
        userId: auth.userId
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

    const company = await getCompany(companyId);
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

    const company = await updateCompany({
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
      actor: {
        userId: auth.userId
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
