// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Sync Pull Routes
 *
 * Thin HTTP adapter for GET /sync/pull.
 * Business logic is delegated to PosSyncModule.handlePullSync() in @jurnapod/pos-sync.
 *
 * Canonical cursor contract:
 * - Request: `since_version` (since_version in query params)
 * - Response: `data_version` (data_version in payload)
 *
 * Sync version store: sync_versions table (tier IS NULL) - no legacy table dependencies.
 */

import { Hono } from "hono";
import { z } from "zod";
import { NumericIdSchema, SyncPullPayloadSchema } from "@jurnapod/shared";
import { authenticateRequest, requireAccessForOutletQuery, type AuthContext } from "../../lib/auth-guard.js";
import { errorResponse, successResponse } from "../../lib/response.js";
import { getRequestCorrelationId } from "../../lib/correlation-id.js";
import { getPosSyncModule } from "../../lib/sync-modules.js";

declare module "hono" {
  interface ContextVariableMap {
    auth: AuthContext;
  }
}

// =============================================================================
// Constants
// =============================================================================

const syncPullRequestSchema = z.object({
  outlet_id: NumericIdSchema,
  since_version: z.coerce.number().int().min(0).default(0),
  orders_cursor: z.coerce.number().int().min(0).optional()
});

// =============================================================================
// Sync Pull Routes
// =============================================================================

const syncPullRoutes = new Hono();

// Auth middleware - authenticate all requests
syncPullRoutes.use("/*", async (c, next) => {
  const authResult = await authenticateRequest(c.req.raw);
  if (!authResult.success) {
    c.status(401);
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Missing or invalid access token" } });
  }
  c.set("auth", authResult.auth);
  await next();
});

// Outlet access guard middleware - checks role-based outlet access from query params
// OWNER/ADMIN/ACCOUNTANT roles have global access; other roles need explicit outlet access
const syncPullOutletGuard = requireAccessForOutletQuery({
  roles: ["OWNER", "ADMIN", "ACCOUNTANT"]
});

syncPullRoutes.use("/", async (c, next) => {
  const auth = c.get("auth");
  const guardResponse = await syncPullOutletGuard(c.req.raw, auth);
  if (guardResponse) {
    return guardResponse;
  }
  await next();
});

// GET /sync/pull - Pull master data from server
// Delegates to PosSyncModule.handlePullSync() for business logic
syncPullRoutes.get("/", async (c) => {
  const auth = c.get("auth");
  const correlationId = getRequestCorrelationId(c.req.raw);

  try {
    // Parse query parameters
    const url = new URL(c.req.raw.url);
    const input = syncPullRequestSchema.parse({
      outlet_id: url.searchParams.get("outlet_id"),
      since_version: url.searchParams.get("since_version") ?? 0,
      orders_cursor: url.searchParams.get("orders_cursor") ?? undefined
    });

    // Delegate to PosSyncModule - all business logic and audit logging happens there
    const module = getPosSyncModule();
    const pullResult = await module.handlePullSync({
      companyId: auth.companyId,
      outletId: input.outlet_id,
      sinceVersion: input.since_version,
      ordersCursor: input.orders_cursor ?? 0
    });

    // Validate response matches expected contract
    const response = SyncPullPayloadSchema.parse(pullResult.payload);

    return successResponse(response);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid request parameters", 400);
    }

    if (error instanceof Error && error.message === "outlet_id is required") {
      return errorResponse("INVALID_REQUEST", "outlet_id query parameter is required", 400);
    }

    console.error("GET /sync/pull failed", {
      correlation_id: correlationId,
      error
    });
    return errorResponse("INTERNAL_SERVER_ERROR", "Sync pull failed", 500);
  }
});

export { syncPullRoutes };
