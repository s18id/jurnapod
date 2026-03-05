// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { NumericIdSchema } from "@jurnapod/shared";
import { ZodError } from "zod";
import { requireRole, withAuth } from "../../../../src/lib/auth-guard";
import { getAccountTree } from "../../../../src/lib/accounts";
import { errorResponse, successResponse } from "../../../../src/lib/response";

/**
 * GET /api/accounts/tree
 * Get hierarchical account tree
 * 
 * Query params:
 * - company_id (required): Company ID
 * - include_inactive (optional): Include inactive accounts ("true"/"false")
 * 
 * Required role: OWNER, ADMIN, or ACCOUNTANT
 */
export const GET = withAuth(
  async (request, auth) => {
    try {
      const url = new URL(request.url);
      const companyIdRaw = url.searchParams.get("company_id");

      // Verify company_id
      if (companyIdRaw != null) {
        const companyId = NumericIdSchema.parse(companyIdRaw);
        if (companyId !== auth.companyId) {
          return errorResponse("COMPANY_MISMATCH", "Company ID mismatch", 400);
        }
      }

      const includeInactive = url.searchParams.get("include_inactive") === "true";

      const tree = await getAccountTree(auth.companyId, includeInactive);

      return successResponse(tree);
    } catch (error) {
      if (error instanceof ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid request parameters", 400);
      }

      console.error("GET /api/accounts/tree failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Internal server error", 500);
    }
  },
  [requireRole(["OWNER", "COMPANY_ADMIN", "ADMIN", "ACCOUNTANT"])]
);
