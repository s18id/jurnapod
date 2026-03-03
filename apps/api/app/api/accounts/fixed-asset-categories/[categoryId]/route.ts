// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import {
  FixedAssetCategoryUpdateRequestSchema,
  NumericIdSchema
} from "@jurnapod/shared";
import { ZodError } from "zod";
import { requireAccess, withAuth } from "../../../../../src/lib/auth-guard";
import { errorResponse, successResponse } from "../../../../../src/lib/response";
import {
  DatabaseConflictError,
  deleteFixedAssetCategory,
  findFixedAssetCategoryById,
  updateFixedAssetCategory
} from "../../../../../src/lib/master-data";

function parseCategoryId(request: Request): number {
  const pathname = new URL(request.url).pathname;
  const categoryIdRaw = pathname.split("/").filter(Boolean).pop();
  return NumericIdSchema.parse(categoryIdRaw);
}

export const GET = withAuth(
  async (request, auth) => {
    try {
      const categoryId = parseCategoryId(request);
      const category = await findFixedAssetCategoryById(auth.companyId, categoryId);

      if (!category) {
        return errorResponse("NOT_FOUND", "Fixed asset category not found", 404);
      }

      return successResponse(category);
    } catch (error) {
      if (error instanceof ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }

      console.error("GET /api/accounts/fixed-asset-categories/:id failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Fixed asset category request failed", 500);
    }
  },
  [requireAccess({ roles: ["OWNER", "ADMIN", "ACCOUNTANT"], module: "accounts", permission: "read" })]
);

export const PATCH = withAuth(
  async (request, auth) => {
    try {
      const categoryId = parseCategoryId(request);
      const payload = await request.json();
      const input = FixedAssetCategoryUpdateRequestSchema.parse(payload);

      const category = await updateFixedAssetCategory(
        auth.companyId,
        categoryId,
        {
          code: input.code,
          name: input.name,
          depreciation_method: input.depreciation_method,
          useful_life_months: input.useful_life_months,
          residual_value_pct: input.residual_value_pct,
          expense_account_id: input.expense_account_id,
          accum_depr_account_id: input.accum_depr_account_id,
          is_active: input.is_active
        },
        {
          userId: auth.userId
        }
      );

      if (!category) {
        return errorResponse("NOT_FOUND", "Fixed asset category not found", 404);
      }

      return successResponse(category);
    } catch (error) {
      if (error instanceof ZodError || error instanceof SyntaxError) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }

      if (error instanceof DatabaseConflictError) {
        return errorResponse("CONFLICT", "Fixed asset category conflict", 409);
      }

      console.error("PATCH /api/accounts/fixed-asset-categories/:id failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Fixed asset category request failed", 500);
    }
  },
  [requireAccess({ roles: ["OWNER", "ADMIN", "ACCOUNTANT"], module: "accounts", permission: "update" })]
);

export const DELETE = withAuth(
  async (request, auth) => {
    try {
      const categoryId = parseCategoryId(request);
      const removed = await deleteFixedAssetCategory(auth.companyId, categoryId, {
        userId: auth.userId
      });

      if (!removed) {
        return errorResponse("NOT_FOUND", "Fixed asset category not found", 404);
      }

      return successResponse(null);
    } catch (error) {
      if (error instanceof ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }

      console.error("DELETE /api/accounts/fixed-asset-categories/:id failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Fixed asset category request failed", 500);
    }
  },
  [requireAccess({ roles: ["OWNER", "ADMIN", "ACCOUNTANT"], module: "accounts", permission: "delete" })]
);
