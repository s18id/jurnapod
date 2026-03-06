// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { NumericIdSchema } from "@jurnapod/shared";
import { ZodError } from "zod";
import { requireAccess, withAuth } from "../../../../../src/lib/auth-guard";
import { isAccountInUse, AccountNotFoundError } from "../../../../../src/lib/accounts";
import { errorResponse, successResponse } from "../../../../../src/lib/response";

/**
 * Helper: Parse account ID from URL pathname
 */
function parseAccountId(request: Request): number {
  const pathname = new URL(request.url).pathname;
  const segments = pathname.split("/").filter(Boolean);
  // URL pattern: /api/accounts/[accountId]/usage
  // segments: ['api', 'accounts', accountId, 'usage']
  const accountIdRaw = segments[2];
  return NumericIdSchema.parse(accountIdRaw);
}

/**
 * GET /api/accounts/:accountId/usage
 * Check if account is in use (has journal lines or active children)
 * 
 * Required role: OWNER, ADMIN, or ACCOUNTANT
 */
export const GET = withAuth(
  async (request, auth) => {
    try {
      const accountId = parseAccountId(request);
      const inUse = await isAccountInUse(accountId, auth.companyId);

      return successResponse({
        account_id: accountId,
        in_use: inUse
      });
    } catch (error) {
      if (error instanceof ZodError) {
        return errorResponse("INVALID_ID", "Invalid account ID", 400);
      }

      if (error instanceof AccountNotFoundError) {
        return errorResponse("NOT_FOUND", "Account not found", 404);
      }

      console.error("GET /api/accounts/:accountId/usage failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Internal server error", 500);
    }
  },
  [
    requireAccess({
      roles: ["OWNER", "COMPANY_ADMIN", "ADMIN", "ACCOUNTANT"],
      module: "accounts",
      permission: "read"
    })
  ]
);
