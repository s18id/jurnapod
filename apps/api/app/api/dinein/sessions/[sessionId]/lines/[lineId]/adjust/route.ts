// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { NumericIdSchema, AdjustSessionLineRequestSchema } from "@jurnapod/shared";
import { ZodError } from "zod";
import { requireAccess, withAuth } from "@/lib/auth-guard";
import { errorResponse, successResponse } from "@/lib/response";
import {
  adjustSessionLine,
  SessionNotFoundError,
  InvalidSessionStatusError,
  SessionValidationError,
  type SessionLine,
} from "@/lib/service-sessions";

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

export const POST = withAuth(
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

      let body: unknown;
      try {
        body = await request.json();
      } catch (parseError) {
        if (parseError instanceof SyntaxError) {
          return errorResponse("INVALID_REQUEST", "Invalid JSON in request body", 400);
        }
        throw parseError;
      }
      const input = AdjustSessionLineRequestSchema.parse(body);

      const result = await adjustSessionLine({
        companyId: BigInt(auth.companyId),
        outletId: BigInt(outletId),
        sessionId: BigInt(sessionId),
        lineId: BigInt(lineId),
        action: input.action,
        qtyDelta: input.qtyDelta,
        reason: input.reason,
        clientTxId: input.clientTxId,
        updatedBy: auth.userId?.toString() ?? "system",
      });

      return successResponse({
        success: true,
        line: mapSessionLineToResponse(result.line),
        sessionVersion: result.sessionVersion,
      });
    } catch (error) {
      if (error instanceof ZodError) {
        const details = error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join(", ");
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

      console.error("POST /api/dinein/sessions/:sessionId/lines/:lineId/adjust failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Failed to adjust session line", 500);
    }
  },
  [
    requireAccess({
      roles: ["OWNER", "COMPANY_ADMIN", "ADMIN", "SUPER_ADMIN", "CASHIER"],
      module: "pos",
      permission: "update",
    }),
  ]
);
