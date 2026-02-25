import { AccountTypeCreateRequestSchema, AccountTypeListQuerySchema } from "@jurnapod/shared";
import { ZodError } from "zod";
import { requireRole, withAuth } from "../../../src/lib/auth-guard";
import {
  createAccountType,
  listAccountTypes,
  AccountTypeNameExistsError
} from "../../../src/lib/account-types";

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
 * GET /api/account-types
 * List account types with optional filtering
 * 
 * Query params:
 * - company_id (required): Company ID
 * - is_active (optional): Filter by active status ("true"/"false")
 * - search (optional): Search by name
 * 
 * Required role: OWNER, ADMIN, or ACCOUNTANT
 */
export const GET = withAuth(
  async (request, auth) => {
    try {
      const url = new URL(request.url);
      const query = AccountTypeListQuerySchema.parse({
        company_id: url.searchParams.get("company_id") || String(auth.companyId),
        is_active: url.searchParams.get("is_active") || undefined,
        search: url.searchParams.get("search") || undefined
      });

      // Verify company_id matches authenticated user
      if (query.company_id !== auth.companyId) {
        return errorResponse("COMPANY_MISMATCH", "Company ID mismatch", 400);
      }

      const accountTypes = await listAccountTypes(query);

      return Response.json(
        {
          success: true,
          data: accountTypes
        },
        { status: 200 }
      );
    } catch (error) {
      if (error instanceof ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid request parameters", 400);
      }

      console.error("GET /api/account-types failed", error);
      return errorResponse("INTERNAL_ERROR", "Internal server error", 500);
    }
  },
  [requireRole(["OWNER", "ADMIN", "ACCOUNTANT"])]
);

/**
 * POST /api/account-types
 * Create a new account type
 * 
 * Body: AccountTypeCreateRequest
 * 
 * Required role: OWNER, ADMIN, or ACCOUNTANT
 */
export const POST = withAuth(
  async (request, auth) => {
    try {
      const payload = await request.json();
      const input = AccountTypeCreateRequestSchema.parse(payload);

      // Verify company_id matches authenticated user
      if (input.company_id !== auth.companyId) {
        return errorResponse("COMPANY_MISMATCH", "Company ID mismatch", 400);
      }

      const accountType = await createAccountType(input, auth.userId);

      return Response.json(
        {
          success: true,
          data: accountType
        },
        { status: 201 }
      );
    } catch (error) {
      if (error instanceof ZodError || error instanceof SyntaxError) {
        return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
      }

      if (error instanceof AccountTypeNameExistsError) {
        return errorResponse("DUPLICATE_NAME", "Account type name already exists", 409);
      }

      console.error("POST /api/account-types failed", error);
      return errorResponse("INTERNAL_ERROR", "Internal server error", 500);
    }
  },
  [requireRole(["OWNER", "ADMIN", "ACCOUNTANT"])]
);
