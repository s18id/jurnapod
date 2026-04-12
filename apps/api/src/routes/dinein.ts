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
import type { Context } from "hono";
import { z } from "zod";
import { createRoute, z as zodOpenApi } from "@hono/zod-openapi";
import type { OpenAPIHono } from "@hono/zod-openapi";
import { NumericIdSchema, ServiceSessionStatusIdSchema } from "@jurnapod/shared";
import { authenticateRequest, requireAccess } from "@/lib/auth-guard";
import { errorResponse, successResponse } from "@/lib/response";
import { listSessions } from "@/lib/service-sessions";
import { userHasOutletAccess } from "@/lib/auth";
import type { AuthContext } from "@/lib/auth-guard";

declare module "hono" {
  interface ContextVariableMap {
    auth: AuthContext;
  }
}

const dineinRoutes = new Hono();

// Auth middleware - authenticate all requests
async function dineinAuthMiddleware(c: Context, next: () => Promise<void>): Promise<void | Response> {
  const authResult = await authenticateRequest(c.req.raw);
  if (!authResult.success) {
    c.status(401);
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Missing or invalid access token" } });
  }
  c.set("auth", authResult.auth);
  await next();
}

dineinRoutes.use("/*", dineinAuthMiddleware);

// ============================================================================
// GET /dinein/sessions - List service sessions
// ============================================================================

dineinRoutes.get("/sessions", async (c) => {
  const auth = c.get("auth") as AuthContext;

  // Guard: check roles and reservations.bookings permission for sessions
  const guardResult = await requireAccess({
    roles: ["OWNER", "COMPANY_ADMIN", "ADMIN", "SUPER_ADMIN", "CASHIER"],
    module: "reservations",
    resource: "bookings",
    permission: "read"
  })(c.req.raw, auth);
  if (guardResult) return guardResult;

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

  // Guard: check roles and reservations.tables permission for tables
  const guardResult = await requireAccess({
    roles: ["OWNER", "COMPANY_ADMIN", "ADMIN", "SUPER_ADMIN", "CASHIER"],
    module: "reservations",
    resource: "tables",
    permission: "read"
  })(c.req.raw, auth);
  if (guardResult) return guardResult;

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
        occupancyStatusId: Number(table.occupancyStatusId),
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

// ============================================================================
// OpenAPI Route Registration
// ============================================================================

/**
 * Session data schema
 */
const SessionDataSchema = zodOpenApi.object({
  id: zodOpenApi.string().openapi({ description: "Session ID" }),
  tableId: zodOpenApi.string().openapi({ description: "Table ID" }),
  tableCode: zodOpenApi.string().openapi({ description: "Table code" }),
  tableName: zodOpenApi.string().openapi({ description: "Table name" }),
  statusId: zodOpenApi.number().openapi({ description: "Status ID" }),
  statusLabel: zodOpenApi.string().openapi({ description: "Status label" }),
  startedAt: zodOpenApi.string().openapi({ description: "Started at" }),
  guestCount: zodOpenApi.number().openapi({ description: "Guest count" }),
  guestName: zodOpenApi.string().nullable().openapi({ description: "Guest name" }),
  lineCount: zodOpenApi.number().openapi({ description: "Line count" }),
  totalAmount: zodOpenApi.number().openapi({ description: "Total amount" }),
}).openapi("SessionData");

/**
 * Table data schema
 */
const TableDataSchema = zodOpenApi.object({
  tableId: zodOpenApi.string().openapi({ description: "Table ID" }),
  tableCode: zodOpenApi.string().openapi({ description: "Table code" }),
  tableName: zodOpenApi.string().openapi({ description: "Table name" }),
  capacity: zodOpenApi.number().openapi({ description: "Capacity" }),
  zone: zodOpenApi.string().nullable().openapi({ description: "Zone" }),
  occupancyStatusId: zodOpenApi.number().openapi({ description: "Occupancy status ID" }),
  availableNow: zodOpenApi.boolean().openapi({ description: "Available now" }),
  currentSessionId: zodOpenApi.string().nullable().openapi({ description: "Current session ID" }),
  currentReservationId: zodOpenApi.string().nullable().openapi({ description: "Current reservation ID" }),
  guestCount: zodOpenApi.number().nullable().openapi({ description: "Guest count" }),
}).openapi("TableData");

/**
 * Registers dine-in routes with an OpenAPIHono instance.
 */
export function registerDineInRoutes(app: OpenAPIHono): void {
  // GET /dinein/sessions - List service sessions
  app.openapi(
    createRoute({
      method: "get",
      path: "/dinein/sessions",
      operationId: "listDineInSessions",
      summary: "List dine-in sessions",
      description: "List service sessions for dine-in with optional filters.",
      tags: ["DineIn"],
      security: [{ BearerAuth: [] }],
      request: {
        query: zodOpenApi.object({
          outletId: zodOpenApi.string().openapi({ description: "Outlet ID" }),
          limit: zodOpenApi.string().optional().openapi({ description: "Limit" }),
          offset: zodOpenApi.string().optional().openapi({ description: "Offset" }),
          status: zodOpenApi.string().optional().openapi({ description: "Status" }),
          tableId: zodOpenApi.string().optional().openapi({ description: "Table ID" }),
        }),
      },
      responses: {
        200: {
          description: "List of sessions",
          content: {
            "application/json": {
              schema: zodOpenApi.object({
                success: zodOpenApi.literal(true),
                data: zodOpenApi.object({
                  sessions: zodOpenApi.array(SessionDataSchema),
                  pagination: zodOpenApi.object({
                    total: zodOpenApi.number(),
                    limit: zodOpenApi.number(),
                    offset: zodOpenApi.number(),
                    hasMore: zodOpenApi.boolean(),
                  }),
                }).openapi("DineInSessionsResponse"),
              }),
            },
          },
        },
        400: { description: "Invalid request" },
        401: { description: "Unauthorized" },
      },
    }),
    async (c): Promise<any> => {
      const auth = c.get("auth") as AuthContext;
      const guardResult = await requireAccess({
        roles: ["OWNER", "COMPANY_ADMIN", "ADMIN", "SUPER_ADMIN", "CASHIER"],
        module: "reservations",
        resource: "bookings",
        permission: "read"
      })(c.req.raw, auth);
      if (guardResult) return guardResult;

      const url = new URL(c.req.raw.url);
      const outletIdRaw = url.searchParams.get("outletId");
      if (!outletIdRaw) return errorResponse("MISSING_OUTLET_ID", "outletId query parameter is required", 400);

      const outletId = NumericIdSchema.parse(outletIdRaw);
      const hasAccess = await userHasOutletAccess(auth.userId, auth.companyId, outletId);
      if (!hasAccess) return errorResponse("FORBIDDEN", "Forbidden", 403);

      const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") ?? "20", 10), 1), 100);
      const offset = Math.max(parseInt(url.searchParams.get("offset") ?? "0", 10), 0);
      const statusParam = url.searchParams.get("status");
      const status = statusParam ? parseInt(statusParam, 10) : undefined;

      const { sessions, total } = await listSessions({
        companyId: BigInt(auth.companyId),
        outletId: BigInt(outletId),
        limit,
        offset,
        statusId: status as unknown as import("@jurnapod/shared").ServiceSessionStatusType | undefined,
        tableId: url.searchParams.get("tableId") ? BigInt(url.searchParams.get("tableId") as string) : undefined,
      });

      return c.json({
        success: true,
        data: {
          sessions: sessions.map((session) => ({
            id: session.id.toString(),
            tableId: session.tableId.toString(),
            tableCode: session.tableCode,
            tableName: session.tableName,
            statusId: session.statusId,
            statusLabel: session.statusLabel,
            startedAt: session.startedAt.toISOString(),
            guestCount: session.guestCount,
            guestName: session.guestName,
            lineCount: session.lines.length,
            totalAmount: session.lines.reduce((sum, line) => sum + line.lineTotal, 0),
          })),
          pagination: { total, limit, offset, hasMore: total > offset + sessions.length },
        },
      });
    }
  );

  // GET /dinein/tables - List tables with occupancy
  app.openapi(
    createRoute({
      method: "get",
      path: "/dinein/tables",
      operationId: "listDineInTables",
      summary: "List dine-in tables",
      description: "List tables with occupancy information.",
      tags: ["DineIn"],
      security: [{ BearerAuth: [] }],
      request: {
        query: zodOpenApi.object({
          outletId: zodOpenApi.string().openapi({ description: "Outlet ID" }),
        }),
      },
      responses: {
        200: {
          description: "List of tables",
          content: {
            "application/json": {
              schema: zodOpenApi.object({
                success: zodOpenApi.literal(true),
                data: zodOpenApi.object({
                  tables: zodOpenApi.array(TableDataSchema),
                }).openapi("DineInTablesResponse"),
              }),
            },
          },
        },
        400: { description: "Invalid request" },
        401: { description: "Unauthorized" },
      },
    }),
    async (c): Promise<any> => {
      const auth = c.get("auth") as AuthContext;
      const guardResult = await requireAccess({
        roles: ["OWNER", "COMPANY_ADMIN", "ADMIN", "SUPER_ADMIN", "CASHIER"],
        module: "reservations",
        resource: "tables",
        permission: "read"
      })(c.req.raw, auth);
      if (guardResult) return guardResult;

      const url = new URL(c.req.raw.url);
      const outletIdRaw = url.searchParams.get("outletId");
      if (!outletIdRaw) return errorResponse("MISSING_OUTLET_ID", "outletId query parameter is required", 400);

      const outletId = NumericIdSchema.parse(outletIdRaw);
      const hasAccess = await userHasOutletAccess(auth.userId, auth.companyId, outletId);
      if (!hasAccess) return errorResponse("FORBIDDEN", "Forbidden", 403);

      const { getTableBoard } = await import("@/lib/table-occupancy");
      const tables = await getTableBoard(BigInt(auth.companyId), BigInt(outletId));

      return c.json({
        success: true,
        data: {
          tables: tables.map(table => ({
            tableId: table.tableId.toString(),
            tableCode: table.tableCode,
            tableName: table.tableName,
            capacity: table.capacity,
            zone: table.zone,
            occupancyStatusId: Number(table.occupancyStatusId),
            availableNow: table.availableNow,
            currentSessionId: table.currentSessionId?.toString() ?? null,
            currentReservationId: table.currentReservationId?.toString() ?? null,
            guestCount: table.guestCount,
          })),
        },
      });
    }
  );
}
