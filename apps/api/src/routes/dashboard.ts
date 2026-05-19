// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { Hono } from "hono";
import { errorResponse, successResponse } from "@jurnapod/shared";

import { authenticateRequest, requireAccess, type AuthContext } from "@/lib/auth-guard.js";
import {
  getAccountingDashboardSummary,
  getInventoryDashboardSummary,
  getPendingExceptionsSummary,
  getPurchasingDashboardSummary,
} from "@/lib/dashboard/dashboard-summaries.js";

declare module "hono" {
  interface ContextVariableMap {
    auth: AuthContext;
  }
}

const dashboardRoutes = new Hono();

function parseOptionalOutletId(request: Request): number | undefined | Response {
  const url = new URL(request.url);
  const rawOutletId = url.searchParams.get("outlet_id");
  if (rawOutletId === null || rawOutletId === "") {
    return undefined;
  }

  const outletId = Number(rawOutletId);
  if (!Number.isSafeInteger(outletId) || outletId <= 0) {
    return errorResponse("INVALID_REQUEST", "Invalid outlet_id", 400);
  }

  return outletId;
}

const requireAccountingSummaryAnalyze = requireAccess({
  module: "accounting",
  resource: "reports",
  permission: "analyze",
});

const requirePurchasingSummaryAnalyze = requireAccess({
  module: "purchasing",
  resource: "reports",
  permission: "analyze",
});

const requireAccountingExceptionsAnalyze = requireAccess({
  module: "accounting",
  resource: "journals",
  permission: "analyze",
});

const requirePurchasingExceptionsAnalyze = requireAccess({
  module: "purchasing",
  resource: "suppliers",
  permission: "analyze",
});

dashboardRoutes.use("/*", async (c, next) => {
  const authResult = await authenticateRequest(c.req.raw);
  if (!authResult.success) {
    return authResult.response;
  }
  c.set("auth", authResult.auth);
  await next();
});

async function requireAnyPendingExceptionAccess(request: Request, auth: AuthContext): Promise<Response | null> {
  const accountingResult = await requireAccountingExceptionsAnalyze(request, auth);
  if (accountingResult === null) {
    return null;
  }

  const purchasingResult = await requirePurchasingExceptionsAnalyze(request, auth);
  if (purchasingResult === null) {
    return null;
  }

  return purchasingResult;
}

dashboardRoutes.get("/inventory-summary", async (c) => {
  const auth = c.get("auth");
  const outletId = parseOptionalOutletId(c.req.raw);
  if (outletId instanceof Response) return outletId;
  if (outletId === undefined) {
    return errorResponse("INVALID_REQUEST", "outlet_id is required for inventory stock dashboard summary", 400);
  }

  const accessResult = await requireAccess({
    module: "inventory",
    resource: "items",
    permission: "read",
    outletId,
  })(c.req.raw, auth);
  if (accessResult !== null) return accessResult;

  try {
    return successResponse(await getInventoryDashboardSummary(auth.companyId, outletId));
  } catch (error) {
    console.error("GET /api/dashboard/inventory-summary failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to load inventory dashboard summary", 500);
  }
});

dashboardRoutes.get("/accounting-summary", async (c) => {
  const auth = c.get("auth");
  const accessResult = await requireAccountingSummaryAnalyze(c.req.raw, auth);
  if (accessResult !== null) return accessResult;

  try {
    return successResponse(await getAccountingDashboardSummary(auth.companyId));
  } catch (error) {
    console.error("GET /api/dashboard/accounting-summary failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to load accounting dashboard summary", 500);
  }
});

dashboardRoutes.get("/purchasing-summary", async (c) => {
  const auth = c.get("auth");
  const accessResult = await requirePurchasingSummaryAnalyze(c.req.raw, auth);
  if (accessResult !== null) return accessResult;

  try {
    return successResponse(await getPurchasingDashboardSummary(auth.companyId));
  } catch (error) {
    console.error("GET /api/dashboard/purchasing-summary failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to load purchasing dashboard summary", 500);
  }
});

dashboardRoutes.get("/pending-exceptions", async (c) => {
  const auth = c.get("auth");
  const accessResult = await requireAnyPendingExceptionAccess(c.req.raw, auth);
  if (accessResult !== null) return accessResult;

  try {
    return successResponse(await getPendingExceptionsSummary(auth.companyId));
  } catch (error) {
    console.error("GET /api/dashboard/pending-exceptions failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to load pending exceptions summary", 500);
  }
});

export { dashboardRoutes };
