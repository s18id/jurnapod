import { AccountTypeUpdateRequestSchema, NumericIdSchema } from "@jurnapod/shared";
import { ZodError } from "zod";
import { requireRole, withAuth } from "../../../../src/lib/auth-guard";
import {
  getAccountTypeById,
  updateAccountType,
  deactivateAccountType,
  AccountTypeNameExistsError,
  AccountTypeNotFoundError,
  AccountTypeInUseError
} from "../../../../src/lib/account-types";

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
 * Helper: Parse account type ID from URL pathname
 */
function parseAccountTypeId(request: Request): number {
  const pathname = new URL(request.url).pathname;
  const accountTypeIdRaw = pathname.split("/").filter(Boolean).pop();
  return NumericIdSchema.parse(accountTypeIdRaw);
}

/**
 * GET /api/account-types/:accountTypeId
 * Get single account type by ID
 * 
 * Required role: OWNER, ADMIN, or ACCOUNTANT
 */
export const GET = withAuth(
  async (request, auth) => {
    try {
      const accountTypeId = parseAccountTypeId(request);
      const accountType = await getAccountTypeById(accountTypeId, auth.companyId);

      return Response.json(
        {
          success: true,
          data: accountType
        },
        { status: 200 }
      );
    } catch (error) {
      if (error instanceof ZodError) {
        return errorResponse("INVALID_ID", "Invalid account type ID", 400);
      }

      if (error instanceof AccountTypeNotFoundError) {
        return errorResponse("NOT_FOUND", "Account type not found", 404);
      }

      console.error("GET /api/account-types/:accountTypeId failed", error);
      return errorResponse("INTERNAL_ERROR", "Internal server error", 500);
    }
  },
  [requireRole(["OWNER", "ADMIN", "ACCOUNTANT"])]
);

/**
 * PUT /api/account-types/:accountTypeId
 * Update existing account type
 * 
 * Body: AccountTypeUpdateRequest
 * 
 * Required role: OWNER, ADMIN, or ACCOUNTANT
 */
export const PUT = withAuth(
  async (request, auth) => {
    try {
      const accountTypeId = parseAccountTypeId(request);
      const payload = await request.json();
      const input = AccountTypeUpdateRequestSchema.parse(payload);

      const accountType = await updateAccountType(accountTypeId, input, auth.companyId, auth.userId);

      return Response.json(
        {
          success: true,
          data: accountType
        },
        { status: 200 }
      );
    } catch (error) {
      if (error instanceof ZodError || error instanceof SyntaxError) {
        return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
      }

      if (error instanceof AccountTypeNotFoundError) {
        return errorResponse("NOT_FOUND", "Account type not found", 404);
      }

      if (error instanceof AccountTypeNameExistsError) {
        return errorResponse("DUPLICATE_NAME", "Account type name already exists", 409);
      }

      console.error("PUT /api/account-types/:accountTypeId failed", error);
      return errorResponse("INTERNAL_ERROR", "Internal server error", 500);
    }
  },
  [requireRole(["OWNER", "ADMIN", "ACCOUNTANT"])]
);

/**
 * DELETE /api/account-types/:accountTypeId
 * Deactivate account type (soft delete)
 * 
 * Required role: OWNER, ADMIN, or ACCOUNTANT
 */
export const DELETE = withAuth(
  async (request, auth) => {
    try {
      const accountTypeId = parseAccountTypeId(request);
      const accountType = await deactivateAccountType(accountTypeId, auth.companyId, auth.userId);

      return Response.json(
        {
          success: true,
          data: accountType
        },
        { status: 200 }
      );
    } catch (error) {
      if (error instanceof ZodError) {
        return errorResponse("INVALID_ID", "Invalid account type ID", 400);
      }

      if (error instanceof AccountTypeNotFoundError) {
        return errorResponse("NOT_FOUND", "Account type not found", 404);
      }

      if (error instanceof AccountTypeInUseError) {
        return errorResponse("IN_USE", "Cannot deactivate account type that is in use", 409);
      }

      console.error("DELETE /api/account-types/:accountTypeId failed", error);
      return errorResponse("INTERNAL_ERROR", "Internal server error", 500);
    }
  },
  [requireRole(["OWNER", "ADMIN", "ACCOUNTANT"])]
);
