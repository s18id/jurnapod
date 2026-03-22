// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { NumericIdSchema, ServiceSessionStatusIdSchema } from "@jurnapod/shared";
import { ZodError } from "zod";
import { requireAccess, withAuth } from "@/lib/auth-guard";
import { errorResponse, successResponse } from "@/lib/response";
import {
  listSessions,
  type ServiceSession,
} from "@/lib/service-sessions";

/**
 * GET /api/dinein/sessions
 *
 * List service sessions with filtering and pagination for an outlet.
 * Requires authentication and outlet-specific access.
 *
 * Query Parameters:
 * - outletId (required) - Outlet ID
 * - limit (optional, default 20, max 100)
 * - offset (optional, default 0)
 * - status (optional) - Filter by session status (1=ACTIVE, 2=LOCKED_FOR_PAYMENT, 3=CLOSED)
 * - tableId (optional) - Filter by table ID
 */
export const GET = withAuth(
  async (request, auth) => {
    try {
      // Extract outletId from query parameters
      const url = new URL(request.url);
      const outletIdRaw = url.searchParams.get("outletId");

      if (!outletIdRaw) {
        return errorResponse("MISSING_OUTLET_ID", "outletId query parameter is required", 400);
      }

      const outletId = NumericIdSchema.parse(outletIdRaw);

      // Parse and validate query parameters
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
        statusId: queryParams.status as import("@jurnapod/shared").ServiceSessionStatusType | undefined,
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
      if (error instanceof ZodError) {
        const details = error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join(", ");
        return errorResponse("INVALID_REQUEST", `Invalid request parameters: ${details}`, 400);
      }

      console.error("GET /api/dinein/sessions failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Failed to fetch sessions", 500);
    }
  },
  [
    requireAccess({
      roles: ["OWNER", "COMPANY_ADMIN", "ADMIN", "SUPER_ADMIN", "CASHIER"],
      module: "pos",
      permission: "read",
    }),
  ]
);
