// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { VoidEventRequestSchema, NumericIdSchema } from "@jurnapod/shared";
import { ZodError } from "zod";
import { requireAccess, withAuth } from "../../../../../../../src/lib/auth-guard";
import { errorResponse, successResponse } from "../../../../../../../src/lib/response";
import { voidEvent } from "../../../../../../../src/lib/fixed-assets-lifecycle";

function parseEventId(request: Request): number {
  const pathname = new URL(request.url).pathname;
  const eventIdRaw = pathname.split("/").filter(Boolean).slice(-2)[0];
  return NumericIdSchema.parse(eventIdRaw);
}

export const POST = withAuth(
  async (request, auth) => {
    try {
      const eventId = parseEventId(request);
      const payload = await request.json();
      const input = VoidEventRequestSchema.parse(payload);

      const result = await voidEvent(auth.companyId, eventId, input, {
        userId: auth.userId
      });

      return successResponse({
        void_event_id: result.void_event_id,
        original_event_id: result.original_event_id,
        journal_batch_id: result.journal_batch_id
      });
    } catch (error) {
      if (error instanceof ZodError || error instanceof SyntaxError) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }

      const err = error as { code?: string; message?: string };
      if (err.code === "EVENT_NOT_FOUND") {
        return errorResponse("NOT_FOUND", err.message || "Event not found", 404);
      }
      if (err.code === "EVENT_ALREADY_VOIDED") {
        return errorResponse("CONFLICT", err.message || "Event already voided", 409);
      }
      if (err.code === "EVENT_NOT_VOIDABLE") {
        return errorResponse("CONFLICT", err.message || "Event type cannot be voided", 409);
      }
      if (err.code === "FORBIDDEN") {
        return errorResponse("FORBIDDEN", err.message || "Access denied", 403);
      }
      if (err.code === "FISCAL_YEAR_CLOSED") {
        return errorResponse("FISCAL_YEAR_CLOSED", err.message || "Date outside open fiscal year", 400);
      }
      if (err.code === "DUPLICATE_EVENT") {
        return errorResponse("CONFLICT", "Duplicate void event", 409);
      }

      console.error("POST /api/accounts/fixed-assets/events/:eventId/void failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Void failed", 500);
    }
  },
  [requireAccess({ roles: ["OWNER", "COMPANY_ADMIN", "ADMIN", "ACCOUNTANT"], module: "accounts", permission: "update" })]
);
