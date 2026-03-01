// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { NumericIdSchema } from "@jurnapod/shared";
import { ZodError } from "zod";
import { requireRole, withAuth } from "../../../../../src/lib/auth-guard";
import { reactivateAccount, AccountNotFoundError } from "../../../../../src/lib/accounts";

/**
 * Helper: Create standardized error response
 */
function errorResponse(code: string, message: string, status: number) {
  return Response.json(
    {
      error: {
        code,
        message
      }
    },
    { status }
  );
}

/**
 * Helper: Parse account ID from URL pathname
 */
function parseAccountId(request: Request): number {
  const pathname = new URL(request.url).pathname;
  const segments = pathname.split("/").filter(Boolean);
  // URL pattern: /api/accounts/[accountId]/reactivate
  // segments: ['api', 'accounts', accountId, 'reactivate']
  const accountIdRaw = segments[2];
  return NumericIdSchema.parse(accountIdRaw);
}

/**
 * POST /api/accounts/:accountId/reactivate
 * Reactivate a deactivated account
 * 
 * Required role: OWNER, ADMIN, or ACCOUNTANT
 */
export const POST = withAuth(
  async (request, auth) => {
    try {
      const accountId = parseAccountId(request);
      const account = await reactivateAccount(accountId, auth.companyId, auth.userId);

      return Response.json(
        {
          success: true,
          data: account
        },
        { status: 200 }
      );
    } catch (error) {
      if (error instanceof ZodError) {
        return errorResponse("INVALID_ID", "Invalid account ID", 400);
      }

      if (error instanceof AccountNotFoundError) {
        return errorResponse("NOT_FOUND", "Account not found", 404);
      }

      console.error("POST /api/accounts/:accountId/reactivate failed", error);
      return errorResponse("INTERNAL_ERROR", "Internal server error", 500);
    }
  },
  [requireRole(["OWNER", "ADMIN", "ACCOUNTANT"])]
);
