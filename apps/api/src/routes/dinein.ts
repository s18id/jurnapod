// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Dine-in Routes
 *
 * Routes for dine-in operations:
 * GET /dinein/sessions - List service sessions
 * GET /dinein/tables - List tables with occupancy
 */

import { Hono } from "hono";
import { z } from "zod";
import { NumericIdSchema, ServiceSessionStatusIdSchema } from "@jurnapod/shared";
import { requireAccess } from "@/lib/auth-guard";
import { errorResponse, successResponse } from "@/lib/response";
import { listSessions } from "@/lib/service-sessions";
import { userHasOutletAccess } from "@/lib/auth";
import type { AuthContext } from "@/lib/auth-guard";

const dineinRoutes = new Hono();

// Auth middleware
dineinRoutes.use("/*", async (c, next) => {
  const authResult = await requireAccess({
    roles: ["OWNER", "COMPANY_ADMIN", "ADMIN", "SUPER_ADMIN", "CASHIER"],
    module: "pos",
    permission: "read"
  });
  
  if (authResult) {
    return authResult;
  }
  
  c.set("auth", c.get("auth"));
  await next();
});

// ============================================================================
// GET /dinein/sessions - List service sessions
// ============================================================================

dineinRoutes.get("/sessions", async (c) => {
  const auth = c.get("auth") as AuthContext;

  try {
    const url = new URL(c.req.raw.url);
    const outletIdRaw = url.searchParams.get("outletId");

    if (!outletIdRaw) {
      return errorResponse("MISSING_OUTLET_ID", "outletId query parameter is required", 400);
    }

    const outletId = NumericIdSchema.parse(outletIdRaw);

    // Validate outlet access
    const hasAccess = await userHasOutletAccess(auth.userId, auth.companyId, outletId);
    if (!hasAccess) {
      return errorResponse("FORBIDDEN", "Forbidden", 403);
    }

    const queryParams = {
      limit: url.searchParams.get("limit")
        ? parseInt(url.searchParams.get("limit")!, 10)
        : undefined,
      offset: url.searchParams.get("offset")
        ? parseInt(url.searchParams.get("offset")!, 10)
        : undefined,
      status: url.searchParams.get("status")
        ? parseInt(url.searchParams.get("status")!, 10)
        : undefined,
      tableId: url.searchParams.get("tableId") || undefined,
    };

    // Validate status if provided
    if (queryParams.status !== undefined) {
      ServiceSessionStatusIdSchema.parse(queryParams.status);
    }

    // Validate pagination parameters
    const limit = Math.min(Math.max(queryParams.limit ?? 20, 1), 100);
    const offset = Math.max(queryParams.offset ?? 0, 0);

    const { sessions, total } = await listSessions({
      companyId: BigInt(auth.companyId),
      outletId: BigInt(outletId),
      limit,
      offset,
      statusId: queryParams.status as unknown as import("@jurnapod/shared").ServiceSessionStatusType | undefined,
      tableId: queryParams.tableId ? BigInt(queryParams.tableId) : undefined,
    });

    // Transform to response format with string IDs
    const response = {
      sessions: sessions.map((session) => ({
        id: session.id.toString(),
        tableId: session.tableId.toString(),
        tableCode: session.tableCode,
        tableName: session.tableName,
        statusId: session.statusId,
        statusLabel: session.statusLabel,
        startedAt: session.startedAt.toISOString(),
        lockedAt: session.lockedAt?.toISOString() ?? null,
        closedAt: session.closedAt?.toISOString() ?? null,
        guestCount: session.guestCount,
        guestName: session.guestName,
        notes: session.notes,
        lineCount: session.lines.length,
        totalAmount: session.lines.reduce((sum, line) => sum + line.lineTotal, 0),
        createdBy: session.createdBy,
        createdAt: session.createdAt.toISOString(),
        updatedAt: session.updatedAt.toISOString(),
      })),
      pagination: {
        total,
        limit,
        offset,
        hasMore: total > offset + sessions.length,
      },
    };

    return successResponse(response);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const details = error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join(", ");
      return errorResponse("INVALID_REQUEST", `Invalid request parameters: ${details}`, 400);
    }

    console.error("GET /dinein/sessions failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to fetch sessions", 500);
  }
});

// ============================================================================
// GET /dinein/tables - List tables with occupancy
// ============================================================================

dineinRoutes.get("/tables", async (c) => {
  const auth = c.get("auth") as AuthContext;

  try {
    const url = new URL(c.req.raw.url);
    const outletIdRaw = url.searchParams.get("outletId");

    if (!outletIdRaw) {
      return errorResponse("MISSING_OUTLET_ID", "outletId query parameter is required", 400);
    }

    const outletId = NumericIdSchema.parse(outletIdRaw);

    // Validate outlet access
    const hasAccess = await userHasOutletAccess(auth.userId, auth.companyId, outletId);
    if (!hasAccess) {
      return errorResponse("FORBIDDEN", "Forbidden", 403);
    }

    // Get table board data
    const { getTableBoard } = await import("@/lib/table-occupancy");
    const tables = await getTableBoard(BigInt(auth.companyId), BigInt(outletId));

    // Transform to response format
    const response = {
      tables: tables.map(table => ({
        tableId: table.tableId.toString(),
        tableCode: table.tableCode,
        tableName: table.tableName,
        capacity: table.capacity,
        zone: table.zone,
        occupancyStatusId: table.occupancyStatusId,
        availableNow: table.availableNow,
        currentSessionId: table.currentSessionId?.toString() ?? null,
        currentReservationId: table.currentReservationId?.toString() ?? null,
        nextReservationStartAt: table.nextReservationStartAt?.toISOString() ?? null,
        guestCount: table.guestCount,
        version: table.version,
        updatedAt: table.updatedAt.toISOString()
      }))
    };

    return successResponse(response);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("INVALID_REQUEST", "Invalid outletId format", 400);
    }

    console.error("GET /dinein/tables failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to fetch tables", 500);
  }
});

export { dineinRoutes };
