// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { NumericIdSchema, SalesCreditNoteUpdateRequestSchema } from "@jurnapod/shared";
import { ZodError } from "zod";
import { requireAccess, withAuth } from "../../../../../src/lib/auth-guard";
import { errorResponse, successResponse } from "../../../../../src/lib/response";
import {
  DatabaseConflictError,
  DatabaseForbiddenError,
  getCreditNote,
  updateCreditNote
} from "../../../../../src/lib/sales";

function parseCreditNoteId(request: Request): number {
  const pathname = new URL(request.url).pathname;
  const creditNoteIdRaw = pathname.split("/").filter(Boolean).pop();
  return NumericIdSchema.parse(creditNoteIdRaw);
}

export const GET = withAuth(
  async (request: Request, auth) => {
    try {
      const creditNoteId = parseCreditNoteId(request);
      const creditNote = await getCreditNote(auth.companyId, creditNoteId, {
        userId: auth.userId
      });

      if (!creditNote) {
        return errorResponse("NOT_FOUND", "Credit note not found", 404);
      }

      return successResponse(creditNote);
    } catch (error) {
      if (error instanceof ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }

      if (error instanceof DatabaseForbiddenError) {
        return errorResponse("FORBIDDEN", (error as Error).message, 403);
      }

      console.error("GET /sales/credit-notes/:id failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Credit note request failed", 500);
    }
  },
  [
    requireAccess({
      roles: ["OWNER", "COMPANY_ADMIN", "ADMIN", "ACCOUNTANT"],
      module: "sales",
      permission: "read"
    })
  ]
);

export const PATCH = withAuth(
  async (request: Request, auth) => {
    try {
      const creditNoteId = parseCreditNoteId(request);
      const payload = await request.json();
      const input = SalesCreditNoteUpdateRequestSchema.parse(payload);

      const creditNote = await updateCreditNote(auth.companyId, creditNoteId, input, {
        userId: auth.userId
      });

      if (!creditNote) {
        return errorResponse("NOT_FOUND", "Credit note not found", 404);
      }

      return successResponse(creditNote);
    } catch (error) {
      if (error instanceof ZodError || error instanceof SyntaxError) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }

      if (error instanceof DatabaseForbiddenError) {
        return errorResponse("FORBIDDEN", (error as Error).message, 403);
      }

      if (error instanceof DatabaseConflictError) {
        return errorResponse("CONFLICT", (error as Error).message, 409);
      }

      console.error("PATCH /sales/credit-notes/:id failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Credit note request failed", 500);
    }
  },
  [
    requireAccess({
      roles: ["OWNER", "COMPANY_ADMIN", "ADMIN", "ACCOUNTANT"],
      module: "sales",
      permission: "update"
    })
  ]
);
