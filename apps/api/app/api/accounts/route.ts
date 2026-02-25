import { AccountCreateRequestSchema, AccountListQuerySchema } from "@jurnapod/shared";
import { ZodError } from "zod";
import { requireRole, withAuth } from "../../../src/lib/auth-guard";
import {
  createAccount,
  listAccounts,
  AccountCodeExistsError,
  CircularReferenceError,
  ParentAccountCompanyMismatchError,
  AccountTypeCompanyMismatchError
} from "../../../src/lib/accounts";

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
 * GET /api/accounts
 * List accounts with optional filtering
 * 
 * Query params:
 * - company_id (required): Company ID
 * - is_active (optional): Filter by active status ("true"/"false")
 * - report_group (optional): Filter by report group ("NRC"/"LR")
 * - parent_account_id (optional): Filter by parent account ID
 * - search (optional): Search by code or name
 * 
 * Required role: OWNER, ADMIN, or ACCOUNTANT
 */
export const GET = withAuth(
  async (request, auth) => {
    try {
      const url = new URL(request.url);
      const query = AccountListQuerySchema.parse({
        company_id: url.searchParams.get("company_id") || String(auth.companyId),
        is_active: url.searchParams.get("is_active") || undefined,
        is_payable: url.searchParams.get("is_payable") || undefined,
        report_group: url.searchParams.get("report_group") || undefined,
        parent_account_id: url.searchParams.get("parent_account_id") || undefined,
        search: url.searchParams.get("search") || undefined,
        include_children: url.searchParams.get("include_children") || undefined
      });

      // Verify company_id matches authenticated user
      if (query.company_id !== auth.companyId) {
        return errorResponse("COMPANY_MISMATCH", "Company ID mismatch", 400);
      }

      const accounts = await listAccounts(query);

      return Response.json(
        {
          success: true,
          data: accounts
        },
        { status: 200 }
      );
    } catch (error) {
      if (error instanceof ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid request parameters", 400);
      }

      console.error("GET /api/accounts failed", error);
      return errorResponse("INTERNAL_ERROR", "Internal server error", 500);
    }
  },
  [requireRole(["OWNER", "ADMIN", "ACCOUNTANT"])]
);

/**
 * POST /api/accounts
 * Create a new account
 * 
 * Body: AccountCreateRequest
 * 
 * Required role: OWNER, ADMIN, or ACCOUNTANT
 */
export const POST = withAuth(
  async (request, auth) => {
    try {
      const payload = await request.json();
      const input = AccountCreateRequestSchema.parse(payload);

      // Verify company_id matches authenticated user
      if (input.company_id !== auth.companyId) {
        return errorResponse("COMPANY_MISMATCH", "Company ID mismatch", 400);
      }

      const account = await createAccount(input, auth.userId);

      return Response.json(
        {
          success: true,
          data: account
        },
        { status: 201 }
      );
    } catch (error) {
      if (error instanceof ZodError || error instanceof SyntaxError) {
        return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
      }

      if (error instanceof AccountCodeExistsError) {
        return errorResponse("DUPLICATE_CODE", "Account code already exists", 409);
      }

      if (error instanceof ParentAccountCompanyMismatchError) {
        return errorResponse("INVALID_PARENT", "Parent account not found or belongs to different company", 400);
      }

      if (error instanceof AccountTypeCompanyMismatchError) {
        return errorResponse("INVALID_ACCOUNT_TYPE", "Account type not found or belongs to different company", 400);
      }

      if (error instanceof CircularReferenceError) {
        return errorResponse("CIRCULAR_REFERENCE", "Circular reference not allowed", 409);
      }

      console.error("POST /api/accounts failed", error);
      return errorResponse("INTERNAL_ERROR", "Internal server error", 500);
    }
  },
  [requireRole(["OWNER", "ADMIN", "ACCOUNTANT"])]
);
