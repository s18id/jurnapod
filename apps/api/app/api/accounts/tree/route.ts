import { NumericIdSchema } from "@jurnapod/shared";
import { ZodError } from "zod";
import { requireRole, withAuth } from "../../../../src/lib/auth-guard";
import { getAccountTree } from "../../../../src/lib/accounts";

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
          return Response.json(
            {
              success: false,
              error: "Company ID mismatch"
            },
            { status: 400 }
          );
        }
      }

      const includeInactive = url.searchParams.get("include_inactive") === "true";

      const tree = await getAccountTree(auth.companyId, includeInactive);

      return Response.json(
        {
          success: true,
          data: tree
        },
        { status: 200 }
      );
    } catch (error) {
      if (error instanceof ZodError) {
        return Response.json(
          {
            success: false,
            error: "Invalid request parameters"
          },
          { status: 400 }
        );
      }

      console.error("GET /api/accounts/tree failed", error);
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
