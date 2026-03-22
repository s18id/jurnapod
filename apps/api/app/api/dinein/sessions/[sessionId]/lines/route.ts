// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { z, ZodError } from "zod";
import { NumericIdSchema } from "@jurnapod/shared";
import { requireAccess, withAuth } from "@/lib/auth-guard";
import { errorResponse, successResponse } from "@/lib/response";
import {
  addSessionLine,
  SessionNotFoundError,
  SessionConflictError,
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
 * Schema for adding a line to a session
 */
const AddSessionLineSchema = z.object({
  itemId: NumericIdSchema,
  itemName: z.string().min(1).max(255),
  unitPrice: z.number().finite().safe().positive("Unit price must be positive"),
  quantity: z.number().int().positive().max(9999),
  notes: z.string().max(500).optional(),
  clientTxId: z.string().min(1).max(255)
});

/**
 * POST /api/dinein/sessions/[sessionId]/lines
 *
 * Adds a line item to an active service session.
 * Creates a session line with the specified item details.
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
      const input = AddSessionLineSchema.parse(body);

      const result = await addSessionLine({
        companyId: BigInt(auth.companyId),
        outletId: BigInt(outletId),
        sessionId: BigInt(sessionId),
        productId: BigInt(input.itemId),
        productName: input.itemName,
        unitPrice: input.unitPrice,
        quantity: input.quantity,
        notes: input.notes,
        clientTxId: input.clientTxId,
        createdBy: auth.userId?.toString() ?? "system"
      });

      return successResponse({
        success: true,
        line: mapSessionLineToResponse(result)
      }, 201);
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
        return errorResponse("CONFLICT", error.message, 409);
      }
      if (error instanceof SessionValidationError) {
        // Check if it's a product not found error (tenant isolation)
        if (error.message === "Product not found or not accessible") {
          return errorResponse("NOT_FOUND", error.message, 404);
        }
        return errorResponse("INVALID_REQUEST", error.message, 400);
      }

      console.error("POST /api/dinein/sessions/:sessionId/lines failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Failed to add session line", 500);
    }
  },
  [
    requireAccess({
      roles: ["OWNER", "COMPANY_ADMIN", "ADMIN", "SUPER_ADMIN", "CASHIER"],
      module: "pos",
      permission: "create"
    })
  ]
);
