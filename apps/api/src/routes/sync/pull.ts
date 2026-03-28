// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Sync Pull Routes
 *
 * GET /sync/pull - Pull master data from server
 *
 * Handles POS synchronization with central server:
 * - Items and item groups
 * - Prices (outlet-specific)
 * - Tables
 * - Reservations
 * - Open orders and order updates
 * - Variants
 */

import { Hono } from "hono";
import { z } from "zod";
import { type RowDataPacket } from "mysql2";
import { NumericIdSchema, SyncPullPayloadSchema, type SyncPullPayload } from "@jurnapod/shared";
import { authenticateRequest, requireAccess, type AuthContext } from "../../lib/auth-guard.js";
import { buildSyncPullPayload } from "../../lib/sync/master-data.js";
import { errorResponse, successResponse } from "../../lib/response.js";
import { getRequestCorrelationId } from "../../lib/correlation-id.js";
import { getDbPool } from "../../lib/db.js";
import { createSyncAuditService } from "../../lib/sync/audit-adapter.js";

declare module "hono" {
  interface ContextVariableMap {
    auth: AuthContext;
  }
}

// =============================================================================
// Constants
// =============================================================================

const SYNC_PULL_AUDIT_ACTION = "SYNC_PULL";

const syncPullRequestSchema = z.object({
  outlet_id: NumericIdSchema,
  since_version: z.coerce.number().int().min(0).default(0),
  orders_cursor: z.coerce.number().int().min(0).optional()
});

type SyncPullRequest = z.infer<typeof syncPullRequestSchema>;

// =============================================================================
// Helper Functions
// =============================================================================

function getTierFromRequest(request: Request): string {
  const tier = request.headers.get("x-sync-tier");
  return tier ?? "default";
}

function parseOutletIdQueryParam(url: URL): number {
  const outletIdRaw = url.searchParams.get("outlet_id");
  if (!outletIdRaw) {
    throw new Error("outlet_id is required");
  }
  return NumericIdSchema.parse(outletIdRaw);
}

// =============================================================================
// Sync Pull Routes
// =============================================================================

const syncPullRoutes = new Hono();

// Auth middleware
syncPullRoutes.use("/*", async (c, next) => {
  const authResult = await authenticateRequest(c.req.raw);
  if (!authResult.success) {
    c.status(401);
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Missing or invalid access token" } });
  }
  c.set("auth", authResult.auth);
  await next();
});

// GET /sync/pull - Pull master data
syncPullRoutes.get("/", async (c) => {
  const auth = c.get("auth");
  const correlationId = getRequestCorrelationId(c.req.raw);
  const request = c.req.raw;
  const startTime = Date.now();
  const tier = getTierFromRequest(request);

  let eventId: bigint | undefined;
  let auditService: ReturnType<typeof createSyncAuditService> | undefined;

  try {
    // Parse query parameters
    const url = new URL(request.url);
    const input = syncPullRequestSchema.parse({
      outlet_id: url.searchParams.get("outlet_id"),
      since_version: url.searchParams.get("since_version") ?? 0,
      orders_cursor: url.searchParams.get("orders_cursor") ?? undefined
    });

    // Verify user has access to this outlet
    const dbPool = getDbPool();
    
    // Check outlet access using role-based logic
    if (auth.role !== "OWNER" && auth.role !== "ADMIN" && auth.role !== "ACCOUNTANT") {
      const { userHasOutletAccess } = await import("../../lib/auth.js");
      const hasAccess = await userHasOutletAccess(auth.userId, auth.companyId, input.outlet_id);
      if (!hasAccess) {
        c.status(403);
        return errorResponse("FORBIDDEN", "Access denied to this outlet", 403);
      }
    }

    auditService = createSyncAuditService(dbPool);

    // Start audit event
    eventId = await auditService.startEvent({
      companyId: auth.companyId,
      outletId: input.outlet_id,
      operationType: "PULL",
      tierName: tier,
      status: "IN_PROGRESS",
      startedAt: new Date()
    });

    // Build sync payload
    const payload = await buildSyncPullPayload(
      auth.companyId,
      input.outlet_id,
      input.since_version,
      input.orders_cursor ?? 0
    );

    // Validate response
    const response = SyncPullPayloadSchema.parse(payload);

    // Calculate items count from response
    const itemsCount =
      (response.items?.length ?? 0) +
      (response.tables?.length ?? 0) +
      (response.reservations?.length ?? 0);

    // Complete audit event on success
    await auditService.completeEvent(eventId, {
      status: "SUCCESS",
      completedAt: new Date(),
      durationMs: Date.now() - startTime,
      itemsCount
    });

    return successResponse(response);
  } catch (error) {
    // Complete audit event on failure
    if (eventId !== undefined && auditService !== undefined) {
      await auditService.completeEvent(eventId, {
        status: "FAILED",
        completedAt: new Date(),
        durationMs: Date.now() - startTime,
        errorCode: error instanceof Error ? error.name : "UNKNOWN",
        errorMessage: error instanceof Error ? error.message : "Unknown error"
      });
    }

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
