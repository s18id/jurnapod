// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { AccountUpdateRequestSchema, NumericIdSchema } from "@jurnapod/shared";
import { ZodError } from "zod";
import { requireRole, withAuth } from "../../../../src/lib/auth-guard";
import {
  getAccountById,
  updateAccount,
  deactivateAccount,
  AccountCodeExistsError,
  CircularReferenceError,
  AccountInUseError,
  AccountNotFoundError,
  ParentAccountCompanyMismatchError,
  AccountTypeCompanyMismatchError
} from "../../../../src/lib/accounts";

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
  const accountIdRaw = pathname.split("/").filter(Boolean).pop();
  return NumericIdSchema.parse(accountIdRaw);
}

/**
 * GET /api/accounts/:accountId
 * Get single account by ID
 * 
 * Required role: OWNER, ADMIN, or ACCOUNTANT
 */
export const GET = withAuth(
  async (request, auth) => {
    try {
      const accountId = parseAccountId(request);
      const account = await getAccountById(accountId, auth.companyId);

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

      console.error("GET /api/accounts/:accountId failed", error);
      return errorResponse("INTERNAL_ERROR", "Internal server error", 500);
    }
  },
  [requireRole(["OWNER", "ADMIN", "ACCOUNTANT"])]
);

/**
 * PUT /api/accounts/:accountId
 * Update existing account
 * 
 * Body: AccountUpdateRequest
 * 
 * Required role: OWNER, ADMIN, or ACCOUNTANT
 */
export const PUT = withAuth(
  async (request, auth) => {
    try {
      const accountId = parseAccountId(request);
      const payload = await request.json();
      const input = AccountUpdateRequestSchema.parse(payload);

      const account = await updateAccount(accountId, input, auth.companyId, auth.userId);

      return Response.json(
        {
          success: true,
          data: account
        },
        { status: 200 }
      );
    } catch (error) {
      if (error instanceof ZodError || error instanceof SyntaxError) {
        return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
      }

      if (error instanceof AccountNotFoundError) {
        return errorResponse("NOT_FOUND", "Account not found", 404);
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

      console.error("PUT /api/accounts/:accountId failed", error);
      return errorResponse("INTERNAL_ERROR", "Internal server error", 500);
    }
  },
  [requireRole(["OWNER", "ADMIN", "ACCOUNTANT"])]
);

/**
 * DELETE /api/accounts/:accountId
 * Deactivate account (soft delete)
 * 
 * Required role: OWNER, ADMIN, or ACCOUNTANT
 */
export const DELETE = withAuth(
  async (request, auth) => {
    try {
      const accountId = parseAccountId(request);
      const account = await deactivateAccount(accountId, auth.companyId, auth.userId);

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

      if (error instanceof AccountInUseError) {
        return errorResponse("IN_USE", "Cannot deactivate account that is in use", 409);
      }

      console.error("DELETE /api/accounts/:accountId failed", error);
      return errorResponse("INTERNAL_ERROR", "Internal server error", 500);
    }
  },
  [requireRole(["OWNER", "ADMIN", "ACCOUNTANT"])]
);
