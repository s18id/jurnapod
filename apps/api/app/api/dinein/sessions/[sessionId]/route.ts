// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { NumericIdSchema } from "@jurnapod/shared";
import { ZodError } from "zod";
import { requireAccess, withAuth } from "@/lib/auth-guard";
import { errorResponse, successResponse } from "@/lib/response";
import {
  getSession,
  getSessionEvents,
  SessionNotFoundError,
} from "@/lib/service-sessions";

/**
 * GET /api/dinein/sessions/:sessionId
 *
 * Get a single service session by ID with full details, including lines and recent events.
 * Requires authentication and outlet-specific access.
 *
 * Path Parameters:
 * - sessionId (required) - Session ID from URL path
 *
 * Query Parameters:
 * - outletId (required) - Outlet ID
 */
export const GET = withAuth(
  async (request, auth) => {
    try {
      // Extract sessionId from URL path
      const url = new URL(request.url);
      const pathParts = url.pathname.split("/");
      const sessionIdRaw = pathParts[pathParts.length - 1];

      if (!sessionIdRaw) {
        return errorResponse("MISSING_SESSION_ID", "sessionId path parameter is required", 400);
      }

      const sessionId = NumericIdSchema.parse(sessionIdRaw);

      // Extract outletId from query parameters
      const outletIdRaw = url.searchParams.get("outletId");

      if (!outletIdRaw) {
        return errorResponse("MISSING_OUTLET_ID", "outletId query parameter is required", 400);
      }

      const outletId = NumericIdSchema.parse(outletIdRaw);

      const session = await getSession(
        BigInt(auth.companyId),
        BigInt(outletId),
        BigInt(sessionId)
      );

      if (!session) {
        return errorResponse("NOT_FOUND", "Session not found", 404);
      }

      // Fetch recent events for this session
      const recentEvents = await getSessionEvents(
        BigInt(auth.companyId),
        BigInt(outletId),
        BigInt(sessionId),
        20
      );

      // Transform to response format with string IDs
      const response = {
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
        updatedBy: session.updatedBy,
        createdAt: session.createdAt.toISOString(),
        updatedAt: session.updatedAt.toISOString(),
        lines: session.lines.map((line) => ({
          id: line.id.toString(),
          lineNumber: line.lineNumber,
          productId: line.productId.toString(),
          productName: line.productName,
          productSku: line.productSku,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          discountAmount: line.discountAmount,
          taxAmount: line.taxAmount,
          lineTotal: line.lineTotal,
          notes: line.notes,
          isVoided: line.isVoided,
          voidedAt: line.voidedAt?.toISOString() ?? null,
          voidReason: line.voidReason,
          createdAt: line.createdAt.toISOString(),
          updatedAt: line.updatedAt.toISOString(),
        })),
        recentEvents: recentEvents.map((event) => ({
          id: event.id.toString(),
          eventType: event.eventTypeLabel,
          eventTypeId: event.eventTypeId,
          metadata: event.eventData,
          occurredAt: event.occurredAt.toISOString(),
          createdBy: event.createdBy,
        })),
      };

      return successResponse(response);
    } catch (error) {
      if (error instanceof ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid sessionId or outletId format", 400);
      }

      if (error instanceof SessionNotFoundError) {
        return errorResponse("NOT_FOUND", error.message, 404);
      }

      console.error("GET /api/dinein/sessions/:id failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Failed to fetch session", 500);
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
