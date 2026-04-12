// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Trial Balance Routes
 * GET /admin/dashboard/trial-balance - Trial balance report
 * GET /admin/dashboard/trial-balance/validate - Pre-close validation
 */

import { Hono } from "hono";
import { z } from "zod";
import { createRoute, z as zodOpenApi } from "@hono/zod-openapi";
import type { OpenAPIHono } from "@hono/zod-openapi";
import { errorResponse } from "../../lib/response.js";
import {
  type TrialBalanceQuery,
} from "@jurnapod/modules-accounting/trial-balance";
import { authenticateRequest, requireAccess, type AuthContext } from "../../lib/auth-guard.js";
import { getTrialBalanceService } from "../../lib/admin-dashboards.js";

declare module "hono" {
  interface ContextVariableMap {
    auth: AuthContext;
  }
}

const trialBalanceRoutes = new Hono();

// Auth middleware for trial balance routes
trialBalanceRoutes.use("/*", async (c, next) => {
  const authResult = await authenticateRequest(c.req.raw);
  if (!authResult.success) {
    c.status(401);
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Missing or invalid access token" } });
  }
  c.set("auth", authResult.auth);
  await next();
});

// Access control middleware - require admin or owner role
trialBalanceRoutes.use("/*", async (c, next) => {
  const auth = c.get("auth");

  const accessResult = await requireAccess({
    module: "platform", resource: "settings",
    permission: "read"
  })(c.req.raw, auth);

  if (accessResult !== null) {
    return accessResult;
  }

  await next();
});

// =============================================================================
// Trial Balance - GET /admin/dashboard/trial-balance
// =============================================================================

const trialBalanceQuerySchema = z.object({
  fiscal_year_id: z.string().transform(Number).pipe(z.number().positive()),
  period_id: z.string().transform(Number).pipe(z.number().positive()).optional(),
  outlet_id: z.string().transform(Number).pipe(z.number().positive()).optional(),
  as_of_epoch_ms: z
    .string()
    .transform(Number)
    .pipe(z.number().int().positive().max(Date.now() + 86_400_000))
    .optional(),
  include_zero_balances: z.string().optional(),
});

trialBalanceRoutes.get("/", async (c) => {
  try {
    const auth = c.get("auth");
    const companyId = auth.companyId;

    // Parse and validate query parameters
    const url = new URL(c.req.url);
    const rawQuery = {
      fiscal_year_id: url.searchParams.get("fiscal_year_id") ?? undefined,
      period_id: url.searchParams.get("period_id") ?? undefined,
      outlet_id: url.searchParams.get("outlet_id") ?? undefined,
      as_of_epoch_ms: url.searchParams.get("as_of_epoch_ms") ?? undefined,
      include_zero_balances: url.searchParams.get("include_zero_balances") ?? undefined,
    };

    const parseResult = trialBalanceQuerySchema.safeParse(rawQuery);
    if (!parseResult.success) {
      return errorResponse("BAD_REQUEST", `Invalid query parameters: ${parseResult.error.errors.map(e => e.message).join(", ")}`, 400);
    }

    const validated = parseResult.data;

    // Build query
    const query: TrialBalanceQuery = {
      companyId,
      outletId: validated.outlet_id,
      fiscalYearId: validated.fiscal_year_id,
      periodId: validated.period_id,
      asOfEpochMs: validated.as_of_epoch_ms,
      includeZeroBalances: validated.include_zero_balances === "true",
    };

    // Get trial balance data
    const trialBalanceService = getTrialBalanceService();

    const trialBalance = await trialBalanceService.getTrialBalance(query);

    return c.json({
      success: true,
      data: trialBalance,
    });
  } catch (error) {
    console.error("GET /admin/dashboard/trial-balance failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to load trial balance", 500);
  }
});

// =============================================================================
// Trial Balance Validate - GET /admin/dashboard/trial-balance/validate
// =============================================================================

const trialBalanceValidateQuerySchema = z.object({
  fiscal_year_id: z.string().transform(Number).pipe(z.number().positive()),
  period_id: z.string().transform(Number).pipe(z.number().positive()).optional(),
  outlet_id: z.string().transform(Number).pipe(z.number().positive()).optional(),
  as_of_epoch_ms: z.string().transform(Number).optional(),
});

trialBalanceRoutes.get("/validate", async (c) => {
  try {
    const auth = c.get("auth");
    const companyId = auth.companyId;

    // Parse and validate query parameters
    const url = new URL(c.req.url);
    const rawQuery = {
      fiscal_year_id: url.searchParams.get("fiscal_year_id") ?? undefined,
      period_id: url.searchParams.get("period_id") ?? undefined,
      outlet_id: url.searchParams.get("outlet_id") ?? undefined,
      as_of_epoch_ms: url.searchParams.get("as_of_epoch_ms") ?? undefined,
    };

    const parseResult = trialBalanceValidateQuerySchema.safeParse(rawQuery);
    if (!parseResult.success) {
      return errorResponse("BAD_REQUEST", `Invalid query parameters: ${parseResult.error.errors.map(e => e.message).join(", ")}`, 400);
    }

    const validated = parseResult.data;

    // Build query
    const query: TrialBalanceQuery = {
      companyId,
      outletId: validated.outlet_id,
      fiscalYearId: validated.fiscal_year_id,
      periodId: validated.period_id,
      asOfEpochMs: validated.as_of_epoch_ms,
    };

    // Run pre-close validation
    const trialBalanceService = getTrialBalanceService();

    const validationResult = await trialBalanceService.runPreCloseValidation(query);

    return c.json({
      success: true,
      data: validationResult,
    });
  } catch (error) {
    console.error("GET /admin/dashboard/trial-balance/validate failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to run pre-close validation", 500);
  }
});

export { trialBalanceRoutes };

// ============================================================================
// OpenAPI Route Registration
// ============================================================================

/**
 * Registers trial balance routes with an OpenAPIHono instance.
 */
export function registerTrialBalanceRoutes(app: OpenAPIHono): void {
  // GET /admin/dashboard/trial-balance - Trial balance report
  app.openapi(
    createRoute({
      method: "get",
      path: "/admin/dashboard/trial-balance",
      operationId: "getTrialBalance",
      summary: "Trial balance",
      description: "Get trial balance report with optional fiscal year and period filters.",
      tags: ["Admin"],
      security: [{ BearerAuth: [] }],
      request: {
        query: zodOpenApi.object({
          fiscal_year_id: zodOpenApi.string().optional().openapi({ description: "Fiscal year ID" }),
          period_id: zodOpenApi.string().optional().openapi({ description: "Period ID" }),
          outlet_id: zodOpenApi.string().optional().openapi({ description: "Outlet ID" }),
          as_of_epoch_ms: zodOpenApi.string().optional().openapi({ description: "As of epoch ms" }),
          include_zero_balances: zodOpenApi.string().optional().openapi({ description: "Include zero balances" }),
        }),
      },
      responses: {
        200: {
          description: "Trial balance data",
          content: {
            "application/json": {
              schema: zodOpenApi.object({
                success: zodOpenApi.literal(true),
                data: zodOpenApi.any(),
              }).openapi("TrialBalanceResponse"),
            },
          },
        },
        400: { description: "Invalid request" },
        401: { description: "Unauthorized" },
      },
    }),
    async (c): Promise<any> => {
      const auth = c.get("auth");
      const companyId = auth.companyId;

      try {
        const url = new URL(c.req.url);
        const rawQuery = {
          fiscal_year_id: url.searchParams.get("fiscal_year_id") ?? undefined,
          period_id: url.searchParams.get("period_id") ?? undefined,
          outlet_id: url.searchParams.get("outlet_id") ?? undefined,
          as_of_epoch_ms: url.searchParams.get("as_of_epoch_ms") ?? undefined,
          include_zero_balances: url.searchParams.get("include_zero_balances") ?? undefined,
        };

        const parseResult = trialBalanceQuerySchema.safeParse(rawQuery);
        if (!parseResult.success) {
          return errorResponse("BAD_REQUEST", `Invalid query parameters: ${parseResult.error.errors.map(e => e.message).join(", ")}`, 400);
        }

        const validated = parseResult.data;
        const query: TrialBalanceQuery = {
          companyId,
          outletId: validated.outlet_id,
          fiscalYearId: validated.fiscal_year_id,
          periodId: validated.period_id,
          asOfEpochMs: validated.as_of_epoch_ms,
          includeZeroBalances: validated.include_zero_balances === "true",
        };

        const trialBalanceService = getTrialBalanceService();
        const trialBalance = await trialBalanceService.getTrialBalance(query);

        return c.json({ success: true, data: trialBalance });
      } catch (error) {
        console.error("GET /admin/dashboard/trial-balance failed", error);
        return errorResponse("INTERNAL_SERVER_ERROR", "Failed to load trial balance", 500);
      }
    }
  );

  // GET /admin/dashboard/trial-balance/validate - Pre-close validation
  app.openapi(
    createRoute({
      method: "get",
      path: "/admin/dashboard/trial-balance/validate",
      operationId: "validateTrialBalance",
      summary: "Validate trial balance",
      description: "Run pre-close validation on trial balance.",
      tags: ["Admin"],
      security: [{ BearerAuth: [] }],
      request: {
        query: zodOpenApi.object({
          fiscal_year_id: zodOpenApi.string().openapi({ description: "Fiscal year ID" }),
          period_id: zodOpenApi.string().optional().openapi({ description: "Period ID" }),
          outlet_id: zodOpenApi.string().optional().openapi({ description: "Outlet ID" }),
          as_of_epoch_ms: zodOpenApi.string().optional().openapi({ description: "As of epoch ms" }),
        }),
      },
      responses: {
        200: {
          description: "Validation result",
          content: {
            "application/json": {
              schema: zodOpenApi.object({
                success: zodOpenApi.literal(true),
                data: zodOpenApi.any(),
              }).openapi("TrialBalanceValidationResponse"),
            },
          },
        },
        400: { description: "Invalid request" },
        401: { description: "Unauthorized" },
      },
    }),
    async (c): Promise<any> => {
      const auth = c.get("auth");
      const companyId = auth.companyId;

      try {
        const url = new URL(c.req.url);
        const rawQuery = {
          fiscal_year_id: url.searchParams.get("fiscal_year_id") ?? undefined,
          period_id: url.searchParams.get("period_id") ?? undefined,
          outlet_id: url.searchParams.get("outlet_id") ?? undefined,
          as_of_epoch_ms: url.searchParams.get("as_of_epoch_ms") ?? undefined,
        };

        const parseResult = trialBalanceValidateQuerySchema.safeParse(rawQuery);
        if (!parseResult.success) {
          return errorResponse("BAD_REQUEST", `Invalid query parameters: ${parseResult.error.errors.map(e => e.message).join(", ")}`, 400);
        }

        const validated = parseResult.data;
        const query: TrialBalanceQuery = {
          companyId,
          outletId: validated.outlet_id,
          fiscalYearId: validated.fiscal_year_id,
          periodId: validated.period_id,
          asOfEpochMs: validated.as_of_epoch_ms,
        };

        const trialBalanceService = getTrialBalanceService();
        const validationResult = await trialBalanceService.runPreCloseValidation(query);

        return c.json({ success: true, data: validationResult });
      } catch (error) {
        console.error("GET /admin/dashboard/trial-balance/validate failed", error);
        return errorResponse("INTERNAL_SERVER_ERROR", "Failed to run pre-close validation", 500);
      }
    }
  );
}
