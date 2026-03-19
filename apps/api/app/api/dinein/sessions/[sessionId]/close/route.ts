// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { z, ZodError } from "zod";
import { NumericIdSchema } from "@jurnapod/shared";
import { requireAccess, withAuth } from "@/lib/auth-guard";
import { errorResponse, successResponse } from "@/lib/response";
import {
  closeSession,
  SessionNotFoundError,
  InvalidSessionStatusError,
  SessionValidationError,
  SessionConflictError,
} from "@/lib/service-sessions";

/**
 * Schema for closing a session
 */
const CloseSessionSchema = z.object({
  clientTxId: z.string().min(1).max(255)
});

/**
 * POST /api/dinein/sessions/[sessionId]/close
 *
 * Closes a service session after payment completion.
 * Marks session as CLOSED and releases the table.
 */
export const POST = withAuth(
  async (request, auth) => {
    const url = new URL(request.url);
    const pathSegments = url.pathname.split("/");
    const sessionsIndex = pathSegments.indexOf("sessions");
    const sessionIdRaw = pathSegments[sessionsIndex + 1];

    const outletIdRaw = url.searchParams.get("outletId");

    try {
      const sessionId = NumericIdSchema.parse(sessionIdRaw);
      if (!outletIdRaw) {
        return errorResponse("MISSING_OUTLET_ID", "outletId query parameter is required", 400);
      }
      const outletId = NumericIdSchema.parse(outletIdRaw);

      let body;
      try {
        body = await request.json();
      } catch (parseError) {
        if (parseError instanceof SyntaxError) {
          return errorResponse("INVALID_REQUEST", "Invalid JSON in request body", 400);
        }
        throw parseError;
      }
      const input = CloseSessionSchema.parse(body);

      const result = await closeSession({
        companyId: BigInt(auth.companyId),
        outletId: BigInt(outletId),
        sessionId: BigInt(sessionId),
        clientTxId: input.clientTxId,
        updatedBy: auth.userId?.toString() ?? "system"
      });

      return successResponse({
        success: true,
        session: {
          id: result.id.toString(),
          tableId: result.tableId.toString(),
          statusId: result.statusId,
          statusLabel: result.statusLabel,
          closedAt: result.closedAt?.toISOString() ?? null,
          lineCount: result.lines.length,
          totalAmount: result.lines.reduce((sum, line) => sum + line.lineTotal, 0)
        }
      });
    } catch (error) {
      if (error instanceof ZodError) {
        const details = error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
        return errorResponse("INVALID_REQUEST", `Invalid request data: ${details}`, 400);
      }

      if (error instanceof SessionNotFoundError) {
        return errorResponse("NOT_FOUND", error.message, 404);
      }
      if (error instanceof InvalidSessionStatusError) {
        return errorResponse("NOT_ACTIVE", error.message, 409);
      }
      if (error instanceof SessionConflictError) {
        return errorResponse("ALREADY_CLOSED", error.message, 409);
      }
      if (error instanceof SessionValidationError) {
        return errorResponse("INVALID_REQUEST", error.message, 400);
      }

      console.error("POST /api/dinein/sessions/:sessionId/close failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Failed to close session", 500);
    }
  },
  [
    requireAccess({
      roles: ["OWNER", "COMPANY_ADMIN", "ADMIN", "SUPER_ADMIN", "CASHIER"],
      module: "pos",
      permission: "update"
    })
  ]
);
