// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Tax Rates Routes
 *
 * Routes for tax rate management:
 * - GET /tax-rates - List tax rates for company
 *
 * Required role: OWNER, ADMIN, ACCOUNTANT, or CASHIER (read operations)
 */

import { Hono } from "hono";
import { z } from "zod";
import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { NumericIdSchema } from "@jurnapod/shared";
import {
  authenticateRequest,
  requireAccess,
  type AuthContext
} from "../lib/auth-guard.js";
import { errorResponse, successResponse } from "../lib/response.js";
import {
  createTaxRate,
  updateTaxRate,
  deleteTaxRate,
  TaxRateNotFoundError,
  TaxRateConflictError,
  TaxRateValidationError,
  TaxRateReferenceError,
  // Kysely-based functions (library-first pattern)
  listCompanyTaxRatesKysely,
  listCompanyDefaultTaxRatesKysely,
  listCompanyDefaultTaxRateIdsKysely,
  setCompanyDefaultTaxRatesKysely
} from "../lib/tax-rates.js";

declare module "hono" {
  interface ContextVariableMap {
    auth: AuthContext;
  }
}

// =============================================================================
// Request Schemas
// =============================================================================

const TaxRateCreateSchema = z.object({
  code: z.string().trim().min(1).max(50),
  name: z.string().trim().min(1).max(191),
  rate_percent: z.number().min(0).max(100),
  account_id: z.number().int().positive().optional(),
  is_inclusive: z.boolean().optional().default(false)
});

const TaxRateUpdateSchema = z.object({
  code: z.string().trim().min(1).max(50).optional(),
  name: z.string().trim().min(1).max(191).optional(),
  rate_percent: z.number().min(0).max(100).optional(),
  account_id: z.number().int().positive().optional(),
  is_inclusive: z.boolean().optional()
});

const TaxDefaultsUpdateSchema = z.object({
  tax_rate_ids: z.array(z.number().int().positive())
});

// =============================================================================
// Constants
// =============================================================================

const TAX_RATES_ROLES = ["OWNER", "COMPANY_ADMIN", "ADMIN", "ACCOUNTANT", "CASHIER"] as const;

// =============================================================================
// Tax Rates Routes
// =============================================================================

const taxRatesRoutes = new Hono();

// Auth middleware
taxRatesRoutes.use("/*", async (c, next) => {
  const authResult = await authenticateRequest(c.req.raw);
  if (!authResult.success) {
    c.status(401);
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Missing or invalid access token" } });
  }
  c.set("auth", authResult.auth);
  await next();
});

// GET /tax-rates - List tax rates for company
taxRatesRoutes.get("/", async (c) => {
  const auth = c.get("auth");

  // Check access permission
  const accessResult = await requireAccess({
    roles: [...TAX_RATES_ROLES],
    module: "settings",
    permission: "read"
  })(c.req.raw, auth);

  if (accessResult !== null) {
    return accessResult;
  }

  try {
    const taxRates = await listCompanyTaxRatesKysely(auth.companyId);

    return successResponse(taxRates);
  } catch (error) {
    console.error("GET /tax-rates failed", error);
    return errorResponse("INTERNAL_ERROR", "Tax rates request failed", 500);
  }
});

// GET /tax-rates/default - List default tax rates for company
taxRatesRoutes.get("/default", async (c) => {
  const auth = c.get("auth");

  // Check access permission
  const accessResult = await requireAccess({
    roles: [...TAX_RATES_ROLES],
    module: "settings",
    permission: "read"
  })(c.req.raw, auth);

  if (accessResult !== null) {
    return accessResult;
  }

  try {
    const defaultTaxRates = await listCompanyDefaultTaxRatesKysely(auth.companyId);

    return successResponse(defaultTaxRates);
  } catch (error) {
    console.error("GET /tax-rates/default failed", error);
    return errorResponse("INTERNAL_ERROR", "Default tax rates request failed", 500);
  }
});

// POST /tax-rates - Create tax rate
taxRatesRoutes.post("/", async (c) => {
  try {
    const auth = c.get("auth");
    
    // Check access permission using bitmask system
    const accessResult = await requireAccess({
      module: "settings",
      permission: "create"
    })(c.req.raw, auth);

    if (accessResult !== null) {
      return accessResult;
    }

    const payload = await c.req.json();
    const input = TaxRateCreateSchema.parse(payload);

    const taxRate = await createTaxRate(auth.companyId, {
      code: input.code,
      name: input.name,
      rate_percent: input.rate_percent,
      account_id: input.account_id,
      is_inclusive: input.is_inclusive
    }, {
      userId: auth.userId
    });
    
    return successResponse(taxRate.id, 201);
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
    }

    if (error instanceof TaxRateValidationError) {
      return errorResponse("INVALID_REQUEST", error.message, 400);
    }

    if (error instanceof TaxRateConflictError) {
      return errorResponse("CONFLICT", error.message, 409);
    }

    if (error instanceof TaxRateReferenceError) {
      return errorResponse("INVALID_ACCOUNT", error.message, 400);
    }

    console.error("POST /tax-rates failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to create tax rate", 500);
  }
});

// GET /tax-defaults - Get company tax defaults
taxRatesRoutes.get("/defaults", async (c) => {
  const auth = c.get("auth");

  // Check access permission
  const accessResult = await requireAccess({
    roles: [...TAX_RATES_ROLES],
    module: "settings",
    permission: "read"
  })(c.req.raw, auth);

  if (accessResult !== null) {
    return accessResult;
  }

  try {
    const defaultTaxRateIds = await listCompanyDefaultTaxRateIdsKysely(auth.companyId);

    return successResponse(defaultTaxRateIds);
  } catch (error) {
    console.error("GET /tax-defaults failed", error);
    return errorResponse("INTERNAL_ERROR", "Tax defaults request failed", 500);
  }
});

// PUT /tax-defaults - Update company tax defaults
taxRatesRoutes.put("/defaults", async (c) => {
  const auth = c.get("auth");

  // Check access permission using bitmask system
  const accessResult = await requireAccess({
    module: "settings",
    permission: "update"
  })(c.req.raw, auth);

  if (accessResult !== null) {
    return accessResult;
  }

  try {
    const payload = await c.req.json();
    const input = TaxDefaultsUpdateSchema.parse(payload);

    const defaultTaxRateIds = await setCompanyDefaultTaxRatesKysely(
      auth.companyId,
      input.tax_rate_ids,
      auth.userId
    );

    return successResponse(defaultTaxRateIds);
  } catch (error) {
    console.error("PUT /tax-defaults failed:", error);
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
    }

    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to update tax defaults", 500);
  }
});

// PUT /tax-rates/:id - Update tax rate
taxRatesRoutes.put("/:id", async (c) => {
  try {
    const auth = c.get("auth");
    
    // Check access permission using bitmask system
    const accessResult = await requireAccess({
      module: "settings",
      permission: "update"
    })(c.req.raw, auth);

    if (accessResult !== null) {
      return accessResult;
    }

    const taxRateId = NumericIdSchema.parse(c.req.param("id"));
    const payload = await c.req.json();
    const input = TaxRateUpdateSchema.parse(payload);

    const updatedTaxRate = await updateTaxRate(auth.companyId, taxRateId, {
      code: input.code,
      name: input.name,
      rate_percent: input.rate_percent,
      account_id: input.account_id,
      is_inclusive: input.is_inclusive
    }, {
      userId: auth.userId
    });
    
    return successResponse(updatedTaxRate);
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return errorResponse("INVALID_REQUEST", "Invalid request", 400);
    }

    if (error instanceof TaxRateNotFoundError) {
      return errorResponse("NOT_FOUND", error.message, 404);
    }

    if (error instanceof TaxRateValidationError) {
      return errorResponse("INVALID_REQUEST", error.message, 400);
    }

    if (error instanceof TaxRateConflictError) {
      return errorResponse("CONFLICT", error.message, 409);
    }

    if (error instanceof TaxRateReferenceError) {
      return errorResponse("INVALID_ACCOUNT", error.message, 400);
    }

    console.error("PUT /tax-rates/:id failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to update tax rate", 500);
  }
});

// DELETE /tax-rates/:id - Delete tax rate
taxRatesRoutes.delete("/:id", async (c) => {
  try {
    const auth = c.get("auth");
    
    // Check access permission using bitmask system
    const accessResult = await requireAccess({
      module: "settings",
      permission: "delete"
    })(c.req.raw, auth);

    if (accessResult !== null) {
      return accessResult;
    }

    const taxRateId = NumericIdSchema.parse(c.req.param("id"));

    await deleteTaxRate(auth.companyId, taxRateId, {
      userId: auth.userId
    });
    
    return successResponse({
      id: taxRateId,
      deleted: true
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid tax rate ID", 400);
    }

    if (error instanceof TaxRateNotFoundError) {
      return errorResponse("NOT_FOUND", error.message, 404);
    }

    if (error instanceof TaxRateValidationError) {
      return errorResponse("CONFLICT", error.message, 409);
    }

    console.error("DELETE /tax-rates/:id failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to delete tax rate", 500);
  }
});

// ============================================================================
// OpenAPI Route Registration
// ============================================================================

type OpenAPIHonoInterface = {
  openapi: OpenAPIHono["openapi"];
};

const TaxRateSchema = z.object({
  id: z.number(),
  company_id: z.number(),
  code: z.string(),
  name: z.string(),
  rate_percent: z.number(),
  account_id: z.number().nullable(),
  is_inclusive: z.boolean(),
  is_active: z.boolean(),
  created_at: z.string(),
  updated_at: z.string()
}).openapi("TaxRate");

const TaxRatesResponseSchema = z.object({
  success: z.boolean(),
  data: z.array(TaxRateSchema)
}).openapi("TaxRatesResponse");

const TaxRateResponseSchema = z.object({
  success: z.boolean(),
  data: TaxRateSchema
}).openapi("TaxRateResponse");

const ErrorResponseSchema = z.object({
  success: z.boolean(),
  error: z.object({
    code: z.string(),
    message: z.string()
  })
}).openapi("ErrorResponse");

export const registerTaxRateRoutes = (app: OpenAPIHonoInterface): void => {
  // GET /tax-rates - List tax rates for company
  app.openapi(
    createRoute({
      method: "get",
      path: "/tax-rates",
      tags: ["Settings"],
      summary: "List tax rates",
      description: "List all tax rates for the company",
      security: [{ BearerAuth: [] }],
      responses: {
        200: { content: { "application/json": { schema: TaxRatesResponseSchema } }, description: "List of tax rates" },
        401: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Unauthorized" },
        500: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Internal server error" }
      }
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (c: any) => {
      try {
        const auth = c.get("auth");
        const accessResult = await requireAccess({ roles: [...TAX_RATES_ROLES], module: "settings", permission: "read" })(c.req.raw, auth);
        if (accessResult !== null) return accessResult;

        const taxRates = await listCompanyTaxRatesKysely(auth.companyId);
        return c.json({ success: true, data: taxRates });
      } catch (error) {
        console.error("GET /tax-rates failed", error);
        return c.json({ success: false, error: { code: "INTERNAL_ERROR", message: "Tax rates request failed" } }, 500);
      }
    }
  );

  // GET /tax-rates/default - List default tax rates
  app.openapi(
    createRoute({
      method: "get",
      path: "/tax-rates/default",
      tags: ["Settings"],
      summary: "List default tax rates",
      description: "List default tax rates for the company",
      security: [{ BearerAuth: [] }],
      responses: {
        200: { content: { "application/json": { schema: TaxRatesResponseSchema } }, description: "List of default tax rates" },
        401: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Unauthorized" },
        500: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Internal server error" }
      }
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (c: any) => {
      try {
        const auth = c.get("auth");
        const accessResult = await requireAccess({ roles: [...TAX_RATES_ROLES], module: "settings", permission: "read" })(c.req.raw, auth);
        if (accessResult !== null) return accessResult;

        const defaultTaxRates = await listCompanyDefaultTaxRatesKysely(auth.companyId);
        return c.json({ success: true, data: defaultTaxRates });
      } catch (error) {
        console.error("GET /tax-rates/default failed", error);
        return c.json({ success: false, error: { code: "INTERNAL_ERROR", message: "Default tax rates request failed" } }, 500);
      }
    }
  );

  // POST /tax-rates - Create tax rate
  app.openapi(
    createRoute({
      method: "post",
      path: "/tax-rates",
      tags: ["Settings"],
      summary: "Create tax rate",
      description: "Create a new tax rate",
      security: [{ BearerAuth: [] }],
      request: {
        body: {
          content: {
            "application/json": { schema: TaxRateCreateSchema }
          }
        }
      },
      responses: {
        201: { content: { "application/json": { schema: z.object({ success: z.boolean(), data: z.object({ id: z.number() }) }) } }, description: "Tax rate created" },
        400: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Invalid request" },
        401: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Unauthorized" },
        409: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Conflict" },
        500: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Internal server error" }
      }
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (c: any) => {
      try {
        const auth = c.get("auth");
        const accessResult = await requireAccess({ module: "settings", permission: "create" })(c.req.raw, auth);
        if (accessResult !== null) return accessResult;

        const payload = await c.req.json();
        const input = TaxRateCreateSchema.parse(payload);

        const taxRate = await createTaxRate(auth.companyId, {
          code: input.code,
          name: input.name,
          rate_percent: input.rate_percent,
          account_id: input.account_id,
          is_inclusive: input.is_inclusive
        }, { userId: auth.userId });

        return c.json({ success: true, data: { id: taxRate.id } }, 201);
      } catch (error) {
        if (error instanceof z.ZodError || error instanceof SyntaxError) {
          return c.json({ success: false, error: { code: "INVALID_REQUEST", message: "Invalid request body" } }, 400);
        }
        if (error instanceof TaxRateValidationError) {
          return c.json({ success: false, error: { code: "INVALID_REQUEST", message: error.message } }, 400);
        }
        if (error instanceof TaxRateConflictError) {
          return c.json({ success: false, error: { code: "CONFLICT", message: error.message } }, 409);
        }
        if (error instanceof TaxRateReferenceError) {
          return c.json({ success: false, error: { code: "INVALID_ACCOUNT", message: error.message } }, 400);
        }
        console.error("POST /tax-rates failed", error);
        return c.json({ success: false, error: { code: "INTERNAL_SERVER_ERROR", message: "Failed to create tax rate" } }, 500);
      }
    }
  );

  // GET /tax-defaults - Get company tax defaults
  app.openapi(
    createRoute({
      method: "get",
      path: "/tax-defaults",
      tags: ["Settings"],
      summary: "Get tax defaults",
      description: "Get default tax rate IDs for the company",
      security: [{ BearerAuth: [] }],
      responses: {
        200: { content: { "application/json": { schema: z.object({ success: z.boolean(), data: z.object({ default_tax_rate_ids: z.array(z.number()) }) }) } }, description: "Tax defaults" },
        401: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Unauthorized" },
        500: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Internal server error" }
      }
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (c: any) => {
      try {
        const auth = c.get("auth");
        const accessResult = await requireAccess({ roles: [...TAX_RATES_ROLES], module: "settings", permission: "read" })(c.req.raw, auth);
        if (accessResult !== null) return accessResult;

        const defaultTaxRateIds = await listCompanyDefaultTaxRateIdsKysely(auth.companyId);
        return c.json({ success: true, data: { default_tax_rate_ids: defaultTaxRateIds } });
      } catch (error) {
        console.error("GET /tax-defaults failed", error);
        return c.json({ success: false, error: { code: "INTERNAL_ERROR", message: "Tax defaults request failed" } }, 500);
      }
    }
  );

  // PUT /tax-defaults - Update company tax defaults
  app.openapi(
    createRoute({
      method: "put",
      path: "/tax-defaults",
      tags: ["Settings"],
      summary: "Update tax defaults",
      description: "Update default tax rate IDs for the company",
      security: [{ BearerAuth: [] }],
      request: {
        body: {
          content: {
            "application/json": { schema: TaxDefaultsUpdateSchema }
          }
        }
      },
      responses: {
        200: { content: { "application/json": { schema: z.object({ success: z.boolean(), data: z.object({ default_tax_rate_ids: z.array(z.number()) }) }) } }, description: "Tax defaults updated" },
        400: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Invalid request" },
        401: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Unauthorized" },
        500: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Internal server error" }
      }
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (c: any) => {
      try {
        const auth = c.get("auth");
        const accessResult = await requireAccess({ module: "settings", permission: "update" })(c.req.raw, auth);
        if (accessResult !== null) return accessResult;

        const payload = await c.req.json();
        const input = TaxDefaultsUpdateSchema.parse(payload);

        const defaultTaxRateIds = await setCompanyDefaultTaxRatesKysely(auth.companyId, input.tax_rate_ids, auth.userId);
        return c.json({ success: true, data: { default_tax_rate_ids: defaultTaxRateIds } });
      } catch (error) {
        console.error("PUT /tax-defaults failed:", error);
        if (error instanceof z.ZodError || error instanceof SyntaxError) {
          return c.json({ success: false, error: { code: "INVALID_REQUEST", message: "Invalid request body" } }, 400);
        }
        return c.json({ success: false, error: { code: "INTERNAL_SERVER_ERROR", message: "Failed to update tax defaults" } }, 500);
      }
    }
  );

  // PUT /tax-rates/:id - Update tax rate
  app.openapi(
    createRoute({
      method: "put",
      path: "/tax-rates/{id}",
      tags: ["Settings"],
      summary: "Update tax rate",
      description: "Update an existing tax rate",
      security: [{ BearerAuth: [] }],
      request: {
        params: z.object({ id: z.string() }),
        body: {
          content: {
            "application/json": { schema: TaxRateUpdateSchema }
          }
        }
      },
      responses: {
        200: { content: { "application/json": { schema: TaxRateResponseSchema } }, description: "Tax rate updated" },
        400: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Invalid request" },
        401: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Unauthorized" },
        404: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Not found" },
        409: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Conflict" },
        500: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Internal server error" }
      }
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (c: any) => {
      try {
        const auth = c.get("auth");
        const accessResult = await requireAccess({ module: "settings", permission: "update" })(c.req.raw, auth);
        if (accessResult !== null) return accessResult;

        const taxRateId = NumericIdSchema.parse(c.req.param("id"));
        const payload = await c.req.json();
        const input = TaxRateUpdateSchema.parse(payload);

        const updatedTaxRate = await updateTaxRate(auth.companyId, taxRateId, {
          code: input.code,
          name: input.name,
          rate_percent: input.rate_percent,
          account_id: input.account_id,
          is_inclusive: input.is_inclusive
        }, { userId: auth.userId });

        return c.json({ success: true, data: updatedTaxRate });
      } catch (error) {
        if (error instanceof z.ZodError || error instanceof SyntaxError) {
          return c.json({ success: false, error: { code: "INVALID_REQUEST", message: "Invalid request" } }, 400);
        }
        if (error instanceof TaxRateNotFoundError) {
          return c.json({ success: false, error: { code: "NOT_FOUND", message: error.message } }, 404);
        }
        if (error instanceof TaxRateValidationError) {
          return c.json({ success: false, error: { code: "INVALID_REQUEST", message: error.message } }, 400);
        }
        if (error instanceof TaxRateConflictError) {
          return c.json({ success: false, error: { code: "CONFLICT", message: error.message } }, 409);
        }
        if (error instanceof TaxRateReferenceError) {
          return c.json({ success: false, error: { code: "INVALID_ACCOUNT", message: error.message } }, 400);
        }
        console.error("PUT /tax-rates/:id failed", error);
        return c.json({ success: false, error: { code: "INTERNAL_SERVER_ERROR", message: "Failed to update tax rate" } }, 500);
      }
    }
  );

  // DELETE /tax-rates/:id - Delete tax rate
  app.openapi(
    createRoute({
      method: "delete",
      path: "/tax-rates/{id}",
      tags: ["Settings"],
      summary: "Delete tax rate",
      description: "Delete a tax rate",
      security: [{ BearerAuth: [] }],
      request: {
        params: z.object({ id: z.string() })
      },
      responses: {
        200: { content: { "application/json": { schema: z.object({ success: z.boolean(), data: z.object({ id: z.number(), deleted: z.boolean() }) }) } }, description: "Tax rate deleted" },
        400: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Invalid request" },
        401: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Unauthorized" },
        404: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Not found" },
        409: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Conflict" },
        500: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "Internal server error" }
      }
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (c: any) => {
      try {
        const auth = c.get("auth");
        const accessResult = await requireAccess({ module: "settings", permission: "delete" })(c.req.raw, auth);
        if (accessResult !== null) return accessResult;

        const taxRateId = NumericIdSchema.parse(c.req.param("id"));

        await deleteTaxRate(auth.companyId, taxRateId, { userId: auth.userId });

        return c.json({ success: true, data: { id: taxRateId, deleted: true } });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return c.json({ success: false, error: { code: "INVALID_REQUEST", message: "Invalid tax rate ID" } }, 400);
        }
        if (error instanceof TaxRateNotFoundError) {
          return c.json({ success: false, error: { code: "NOT_FOUND", message: error.message } }, 404);
        }
        if (error instanceof TaxRateValidationError) {
          return c.json({ success: false, error: { code: "CONFLICT", message: error.message } }, 409);
        }
        console.error("DELETE /tax-rates/:id failed", error);
        return c.json({ success: false, error: { code: "INTERNAL_SERVER_ERROR", message: "Failed to delete tax rate" } }, 500);
      }
    }
  );
};

export { taxRatesRoutes };
