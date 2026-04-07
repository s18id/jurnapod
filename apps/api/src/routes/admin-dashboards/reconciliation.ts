// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Reconciliation Dashboard Routes
 * GET /admin/dashboard/reconciliation - Reconciliation dashboard
 * GET /admin/dashboard/reconciliation/:accountId/drilldown - Variance drilldown
 */

import { Hono } from "hono";
import { z } from "zod";
import { errorResponse } from "../../lib/response.js";
import {
  ReconciliationDashboardService,
  type ReconciliationDashboardQuery,
} from "@jurnapod/modules-accounting/reconciliation";

// Enum schemas for query parameter validation
const AccountTypeFilterSchema = z.enum(["CASH", "INVENTORY", "RECEIVABLES", "PAYABLES"]);
const ReconciliationStatusSchema = z.enum(["RECONCILED", "VARIANCE", "UNRECONCILED"]);
import { register } from "prom-client";
import { authenticateRequest, requireAccess, type AuthContext } from "../../lib/auth-guard.js";

declare module "hono" {
  interface ContextVariableMap {
    auth: AuthContext;
  }
}

const reconciliationRoutes = new Hono();

// Auth middleware for reconciliation routes
reconciliationRoutes.use("/*", async (c, next) => {
  const authResult = await authenticateRequest(c.req.raw);
  if (!authResult.success) {
    c.status(401);
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Missing or invalid access token" } });
  }
  c.set("auth", authResult.auth);
  await next();
});

// Access control middleware - require admin or owner role
reconciliationRoutes.use("/*", async (c, next) => {
  const auth = c.get("auth");

  const accessResult = await requireAccess({
    module: "settings",
    permission: "read"
  })(c.req.raw, auth);

  if (accessResult !== null) {
    return accessResult;
  }

  await next();
});

// =============================================================================
// Reconciliation Dashboard - GET /admin/dashboard/reconciliation
// =============================================================================

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _reconciliationQuerySchema = z.object({
  fiscal_year_id: z.string().transform(Number).pipe(z.number().positive()).optional(),
  period_id: z.string().transform(Number).pipe(z.number().positive()).optional(),
  outlet_id: z.string().transform(Number).pipe(z.number().positive()).optional(),
  account_types: z.string().optional(),
  statuses: z.string().optional(),
  include_drilldown: z.string().optional(),
  trend_periods: z.string().optional(),
});

// Validation helper for comma-separated enum values
function parseEnumList<T extends z.ZodTypeAny>(
  param: string | null,
  schema: T
): z.infer<T>[] | undefined {
  if (!param) return undefined;
  const values = param.split(",").map(v => v.trim().toUpperCase());
  const result: z.infer<T>[] = [];
  for (const v of values) {
    const parsed = schema.safeParse(v);
    if (parsed.success) {
      result.push(parsed.data);
    }
  }
  return result.length > 0 ? result : undefined;
}

reconciliationRoutes.get("/", async (c) => {
  try {
    const auth = c.get("auth");
    const companyId = auth.companyId;

    // Parse query parameters
    const url = new URL(c.req.url);
    const fiscalYearId = url.searchParams.get("fiscal_year_id") ? Number(url.searchParams.get("fiscal_year_id")) : undefined;
    const periodId = url.searchParams.get("period_id") ? Number(url.searchParams.get("period_id")) : undefined;
    const outletId = url.searchParams.get("outlet_id") ? Number(url.searchParams.get("outlet_id")) : undefined;
    
    const accountTypesParam = url.searchParams.get("account_types");
    const accountTypes = parseEnumList(accountTypesParam, AccountTypeFilterSchema);
    
    const statusesParam = url.searchParams.get("statuses");
    const statuses = parseEnumList(statusesParam, ReconciliationStatusSchema);
    
    const includeDrilldown = url.searchParams.get("include_drilldown") === "true";
    const trendPeriods = url.searchParams.get("trend_periods") ? Number(url.searchParams.get("trend_periods")) : 3;

    // Build query
    const query: ReconciliationDashboardQuery = {
      companyId,
      outletId,
      fiscalYearId,
      periodId,
      accountTypes,
      statuses,
      includeDrilldown,
      trendPeriods,
    };

    // Get dashboard data
    const { getDb } = await import("../../lib/db.js");
    const dashboardService = new ReconciliationDashboardService(getDb() as any);
    
    const dashboard = await dashboardService.getDashboard(query);

    // Get Epic 30 gl_imbalance_detected_total metric from prometheus registry
    const metrics = await register.getMetricsAsJSON();
    const glImbalanceMetric = metrics.find((m: { name: string }) => m.name === "gl_imbalance_detected_total");
    const filteredGlImbalance = glImbalanceMetric?.values?.filter((v: { labels: Record<string, unknown> }) => 
      String(v.labels.company_id) === String(companyId)
    ) ?? [];
    const glImbalanceCount = filteredGlImbalance.reduce((sum: number, v: { value: number }) => sum + v.value, 0);

    // Enhance with Epic 30 metric
    const enhancedDashboard = {
      ...dashboard,
      glImbalanceMetric: {
        ...dashboard.glImbalanceMetric,
        totalImbalances: dashboard.glImbalanceMetric.totalImbalances + glImbalanceCount,
      },
    };

    return c.json({
      success: true,
      data: enhancedDashboard,
    });
  } catch (error) {
    console.error("GET /admin/dashboard/reconciliation failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to load reconciliation dashboard", 500);
  }
});

// =============================================================================
// Reconciliation Drilldown - GET /admin/dashboard/reconciliation/:accountId/drilldown
// =============================================================================

reconciliationRoutes.get("/:accountId/drilldown", async (c) => {
  try {
    const auth = c.get("auth");
    const companyId = auth.companyId;
    const accountId = Number(c.req.param("accountId"));

    if (isNaN(accountId)) {
      return errorResponse("BAD_REQUEST", "Invalid account ID", 400);
    }

    // Parse query parameters
    const url = new URL(c.req.url);
    const fiscalYearId = url.searchParams.get("fiscal_year_id") ? Number(url.searchParams.get("fiscal_year_id")) : undefined;
    const periodId = url.searchParams.get("period_id") ? Number(url.searchParams.get("period_id")) : undefined;

    // Get drilldown data
    const { getDb } = await import("../../lib/db.js");
    const dashboardService = new ReconciliationDashboardService(getDb() as any);
    
    const drilldown = await dashboardService.getVarianceDrilldown(
      companyId,
      accountId,
      periodId,
      fiscalYearId
    );

    if (!drilldown) {
      return errorResponse("NOT_FOUND", "Account not found", 404);
    }

    return c.json({
      success: true,
      data: drilldown,
    });
  } catch (error) {
    console.error("GET /admin/dashboard/reconciliation/:accountId/drilldown failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to load variance drilldown", 500);
  }
});

export { reconciliationRoutes };
