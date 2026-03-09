// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { NumericIdSchema } from "@jurnapod/shared";
import { ZodError } from "zod";
import { requireAccess, withAuth } from "../../../../../../src/lib/auth-guard";
import { errorResponse, successResponse } from "../../../../../../src/lib/response";
import {
  DatabaseConflictError,
  DatabaseForbiddenError,
  DatabaseReferenceError,
  postCreditNote
} from "../../../../../../src/lib/sales";

function parseCreditNoteId(request: Request): number {
  const pathname = new URL(request.url).pathname;
  const parts = pathname.split("/").filter(Boolean);
  const creditNoteIdIndex = parts.indexOf("credit-notes") + 1;
  const raw = parts[creditNoteIdIndex];
  return NumericIdSchema.parse(raw);
}

export const POST = withAuth(
  async (request: Request, auth) => {
    try {
      const creditNoteId = parseCreditNoteId(request);
      const creditNote = await postCreditNote(auth.companyId, creditNoteId, {
        userId: auth.userId
      });

      if (!creditNote) {
        return errorResponse("NOT_FOUND", "Credit note not found", 404);
      }

      return successResponse(creditNote);
    } catch (error) {
      if (error instanceof ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid credit note ID", 400);
      }

      if (error instanceof DatabaseForbiddenError) {
        return errorResponse("FORBIDDEN", (error as Error).message, 403);
      }

      if (error instanceof DatabaseReferenceError) {
        return errorResponse("NOT_FOUND", (error as Error).message, 404);
      }

      if (error instanceof DatabaseConflictError) {
        return errorResponse("CONFLICT", (error as Error).message, 409);
      }

      if (error instanceof Error) {
        if (error.message === "OUTLET_ACCOUNT_MAPPING_MISSING") {
          return errorResponse("CONFLICT", "Account mappings not configured for outlet", 409);
        }
      }

      console.error("POST /sales/credit-notes/:id/post failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Post credit note failed", 500);
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
