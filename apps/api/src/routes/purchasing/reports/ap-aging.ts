// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Purchasing AP Aging Routes
 *
 * - GET /purchasing/reports/ap-aging
 * - GET /purchasing/reports/ap-aging/:supplierId/detail
 *
 * Required ACL: purchasing.reports ANALYZE permission
 */

import { Hono } from "hono";
import { z } from "zod";
import { authenticateRequest, requireAccess, type AuthContext } from "@/lib/auth-guard";
import { errorResponse, successResponse } from "@/lib/response";
import { getAPAgingSummary, getAPAgingSupplierDetail } from "@/lib/purchasing/ap-aging-report";
import { nowUTC, fromUtcIso } from "@/lib/date-helpers";

declare module "hono" {
  interface ContextVariableMap {
    auth: AuthContext;
  }
}

const apAgingRoutes = new Hono();

const querySchema = z.object({
  as_of_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

apAgingRoutes.use("/*", async (c, next) => {
  const authResult = await authenticateRequest(c.req.raw);
  if (!authResult.success) {
    c.status(401);
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Missing or invalid access token" } });
  }
  c.set("auth", authResult.auth);
  await next();
});

apAgingRoutes.get("/", async (c) => {
  try {
    const auth = c.get("auth");

    const accessResult = await requireAccess({
      module: "purchasing",
      resource: "reports",
      permission: "analyze",
    })(c.req.raw, auth);

    if (accessResult !== null) {
      return accessResult;
    }

    const url = new URL(c.req.raw.url);
    const parsed = querySchema.parse({
      as_of_date: url.searchParams.get("as_of_date") ?? undefined,
    });

    const asOfDate = parsed.as_of_date ?? fromUtcIso.dateOnly(nowUTC());
    const result = await getAPAgingSummary(auth.companyId, asOfDate);
    return successResponse(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid query parameters", 400);
    }
    console.error("GET /purchasing/reports/ap-aging failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to fetch AP aging report", 500);
  }
});

apAgingRoutes.get("/:supplierId/detail", async (c) => {
  try {
    const auth = c.get("auth");

    const accessResult = await requireAccess({
      module: "purchasing",
      resource: "reports",
      permission: "analyze",
    })(c.req.raw, auth);

    if (accessResult !== null) {
      return accessResult;
    }

    const supplierId = z.coerce.number().int().positive().parse(c.req.param("supplierId"));

    const url = new URL(c.req.raw.url);
    const parsed = querySchema.parse({
      as_of_date: url.searchParams.get("as_of_date") ?? undefined,
    });

    const asOfDate = parsed.as_of_date ?? fromUtcIso.dateOnly(nowUTC());
    const result = await getAPAgingSupplierDetail(auth.companyId, supplierId, asOfDate);

    if (!result) {
      return errorResponse("NOT_FOUND", "Supplier not found", 404);
    }

    return successResponse(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid request parameters", 400);
    }
    console.error("GET /purchasing/reports/ap-aging/:supplierId/detail failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to fetch AP aging supplier detail", 500);
  }
});

export { apAgingRoutes };
