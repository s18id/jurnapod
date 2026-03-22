// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { NumericIdSchema, FinalizeSessionBatchRequestSchema } from "@jurnapod/shared";
import { ZodError } from "zod";
import { requireAccess, withAuth } from "@/lib/auth-guard";
import { errorResponse, successResponse } from "@/lib/response";
import {
  finalizeSessionBatch,
  SessionNotFoundError,
  InvalidSessionStatusError,
  SessionValidationError,
  SessionConflictError,
} from "@/lib/service-sessions";

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

      let body: unknown;
      try {
        body = await request.json();
      } catch (parseError) {
        if (parseError instanceof SyntaxError) {
          return errorResponse("INVALID_REQUEST", "Invalid JSON in request body", 400);
        }
        throw parseError;
      }
      const input = FinalizeSessionBatchRequestSchema.parse(body);

      const result = await finalizeSessionBatch({
        companyId: BigInt(auth.companyId),
        outletId: BigInt(outletId),
        sessionId: BigInt(sessionId),
        clientTxId: input.clientTxId,
        notes: input.notes,
        updatedBy: auth.userId?.toString() ?? "system",
      });

      return successResponse({
        success: true,
        sessionId: result.sessionId.toString(),
        batchNo: result.batchNo,
        sessionVersion: result.sessionVersion,
        syncedLinesCount: result.syncedLinesCount,
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
      if (error instanceof SessionConflictError) {
        return errorResponse("CONFLICT", error.message, 409);
      }

      console.error("POST /api/dinein/sessions/:sessionId/finalize-batch failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Failed to finalize session batch", 500);
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
