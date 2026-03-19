// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { z, ZodError } from "zod";
import { NumericIdSchema } from "@jurnapod/shared";
import { requireAccess, withAuth } from "@/lib/auth-guard";
import { errorResponse, successResponse } from "@/lib/response";
import {
  updateSessionLine,
  removeSessionLine,
  SessionNotFoundError,
  InvalidSessionStatusError,
  SessionValidationError,
  type SessionLine,
} from "@/lib/service-sessions";

/**
 * Map SessionLine to API response format
 */
function mapSessionLineToResponse(line: SessionLine) {
  return {
    id: line.id.toString(),
    sessionId: line.sessionId.toString(),
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
  };
}

/**
 * Schema for updating a session line
 */
const UpdateSessionLineSchema = z.object({
  quantity: z.number().int().positive().max(9999).optional(),
  unitPrice: z.number().finite().safe().positive("Unit price must be positive").optional(),
  notes: z.string().max(500).optional(),
  clientTxId: z.string().min(1).max(255)
});

/**
 * Schema for deleting a session line (via body for idempotency)
 */
const DeleteSessionLineSchema = z.object({
  clientTxId: z.string().min(1).max(255)
});

/**
 * PATCH /api/dinein/sessions/[sessionId]/lines/[lineId]
 *
 * Updates an existing session line item.
 * Supports partial updates for quantity, unitPrice, and notes.
 */
export const PATCH = withAuth(
  async (request, auth) => {
    const url = new URL(request.url);
    const pathSegments = url.pathname.split("/");
    const sessionsIndex = pathSegments.indexOf("sessions");
    const sessionIdRaw = pathSegments[sessionsIndex + 1];
    const linesIndex = pathSegments.indexOf("lines");
    const lineIdRaw = pathSegments[linesIndex + 1];

    const outletIdRaw = url.searchParams.get("outletId");

    try {
      const sessionId = NumericIdSchema.parse(sessionIdRaw);
      const lineId = NumericIdSchema.parse(lineIdRaw);
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
      const input = UpdateSessionLineSchema.parse(body);

      const result = await updateSessionLine({
        companyId: BigInt(auth.companyId),
        outletId: BigInt(outletId),
        sessionId: BigInt(sessionId),
        lineId: BigInt(lineId),
        quantity: input.quantity,
        unitPrice: input.unitPrice,
        notes: input.notes,
        updatedBy: auth.userId?.toString() ?? "system",
        clientTxId: input.clientTxId,
      });

      return successResponse({
        success: true,
        line: mapSessionLineToResponse(result)
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
      if (error instanceof SessionValidationError) {
        return errorResponse("INVALID_REQUEST", error.message, 400);
      }

      console.error("PATCH /api/dinein/sessions/:sessionId/lines/:lineId failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Failed to update session line", 500);
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

/**
 * DELETE /api/dinein/sessions/[sessionId]/lines/[lineId]
 *
 * Deletes a session line item.
 * Line must belong to an active session.
 */
export const DELETE = withAuth(
  async (request, auth) => {
    const url = new URL(request.url);
    const pathSegments = url.pathname.split("/");
    const sessionsIndex = pathSegments.indexOf("sessions");
    const sessionIdRaw = pathSegments[sessionsIndex + 1];
    const linesIndex = pathSegments.indexOf("lines");
    const lineIdRaw = pathSegments[linesIndex + 1];

    const outletIdRaw = url.searchParams.get("outletId");

    try {
      const sessionId = NumericIdSchema.parse(sessionIdRaw);
      const lineId = NumericIdSchema.parse(lineIdRaw);
      if (!outletIdRaw) {
        return errorResponse("MISSING_OUTLET_ID", "outletId query parameter is required", 400);
      }
      const outletId = NumericIdSchema.parse(outletIdRaw);

      // Parse request body for clientTxId (idempotency key)
      let body;
      try {
        body = await request.json();
      } catch (parseError) {
        if (parseError instanceof SyntaxError) {
          return errorResponse("INVALID_REQUEST", "Invalid JSON in request body", 400);
        }
        throw parseError;
      }
      const input = DeleteSessionLineSchema.parse(body);

      const result = await removeSessionLine({
        companyId: BigInt(auth.companyId),
        outletId: BigInt(outletId),
        sessionId: BigInt(sessionId),
        lineId: BigInt(lineId),
        updatedBy: auth.userId?.toString() ?? "system",
        clientTxId: input.clientTxId,
      });

      // Return 204 No Content on successful deletion (AC3 requirement)
      return new Response(null, { status: 204 });
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
      if (error instanceof SessionValidationError) {
        return errorResponse("INVALID_REQUEST", error.message, 400);
      }

      console.error("DELETE /api/dinein/sessions/:sessionId/lines/:lineId failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Failed to delete session line", 500);
    }
  },
  [
    requireAccess({
      roles: ["OWNER", "COMPANY_ADMIN", "ADMIN", "SUPER_ADMIN", "CASHIER"],
      module: "pos",
      permission: "delete"
    })
  ]
);
