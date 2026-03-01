// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { NumericIdSchema } from "@jurnapod/shared";
import { ZodError } from "zod";
import { requireRole, withAuth } from "../../../../../src/lib/auth-guard";
import { isAccountInUse, AccountNotFoundError } from "../../../../../src/lib/accounts";

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

      return Response.json(
        {
          success: true,
          data: {
            account_id: accountId,
            in_use: inUse
          }
        },
        { status: 200 }
      );
    } catch (error) {
      if (error instanceof ZodError) {
        return Response.json(
          {
            success: false,
            error: "Invalid account ID"
          },
          { status: 400 }
        );
      }

      if (error instanceof AccountNotFoundError) {
        return Response.json(
          {
            success: false,
            error: "Account not found"
          },
          { status: 404 }
        );
      }

      console.error("GET /api/accounts/:accountId/usage failed", error);
      return Response.json(
        {
          success: false,
          error: "Internal server error"
        },
        { status: 500 }
      );
    }
  },
  [requireRole(["OWNER", "ADMIN", "ACCOUNTANT"])]
);
