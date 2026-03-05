// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import {
  DepreciationPlanCreateRequestSchema,
  DepreciationPlanUpdateRequestSchema,
  NumericIdSchema
} from "@jurnapod/shared";
import { ZodError } from "zod";
import { requireAccess, withAuth } from "../../../../../../src/lib/auth-guard";
import { errorResponse, successResponse } from "../../../../../../src/lib/response";
import {
  createDepreciationPlan,
  DatabaseForbiddenError,
  DatabaseReferenceError,
  DepreciationPlanStatusError,
  DepreciationPlanValidationError,
  getDepreciationPlanForFixedAsset,
  updateDepreciationPlan
} from "../../../../../../src/lib/depreciation";

function parseAssetId(request: Request): number {
  const pathname = new URL(request.url).pathname;
  const assetIdRaw = pathname.split("/").filter(Boolean).slice(-2)[0];
  return NumericIdSchema.parse(assetIdRaw);
}

export const GET = withAuth(
  async (request, auth) => {
    try {
      const assetId = parseAssetId(request);
      const plan = await getDepreciationPlanForFixedAsset(auth.companyId, assetId);

      return successResponse(plan);
    } catch (error) {
      if (error instanceof ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }

      console.error("GET /api/accounts/fixed-assets/:id/depreciation-plan failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Depreciation plan request failed", 500);
    }
  },
  [requireAccess({ roles: ["OWNER", "COMPANY_ADMIN", "ADMIN", "ACCOUNTANT"], module: "accounts", permission: "read" })]
);

export const POST = withAuth(
  async (request, auth) => {
    try {
      const assetId = parseAssetId(request);
      const payload = await request.json();
      const input = DepreciationPlanCreateRequestSchema.parse(payload);

      if (input.asset_id !== assetId) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }

      const plan = await createDepreciationPlan(auth.companyId, input, {
        userId: auth.userId
      });

      return successResponse(plan, 201);
    } catch (error) {
      if (error instanceof ZodError || error instanceof SyntaxError) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }

      if (error instanceof DepreciationPlanValidationError) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }

      if (error instanceof DatabaseReferenceError) {
        return errorResponse("INVALID_REFERENCE", "Invalid depreciation reference", 400);
      }

      if (error instanceof DatabaseForbiddenError) {
        return errorResponse("FORBIDDEN", "Forbidden", 403);
      }

      console.error("POST /api/accounts/fixed-assets/:id/depreciation-plan failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Depreciation plan request failed", 500);
    }
  },
  [requireAccess({ roles: ["OWNER", "COMPANY_ADMIN", "ADMIN", "ACCOUNTANT"], module: "accounts", permission: "create" })]
);

export const PATCH = withAuth(
  async (request, auth) => {
    try {
      const assetId = parseAssetId(request);
      const payload = await request.json();
      const input = DepreciationPlanUpdateRequestSchema.parse(payload);
      const current = await getDepreciationPlanForFixedAsset(auth.companyId, assetId);

      if (!current) {
        return errorResponse("NOT_FOUND", "Depreciation plan not found", 404);
      }

      const plan = await updateDepreciationPlan(auth.companyId, current.id, input, {
        userId: auth.userId
      });

      if (!plan) {
        return errorResponse("NOT_FOUND", "Depreciation plan not found", 404);
      }

      return successResponse(plan);
    } catch (error) {
      if (error instanceof ZodError || error instanceof SyntaxError) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }

      if (error instanceof DepreciationPlanValidationError) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }

      if (error instanceof DepreciationPlanStatusError) {
        return errorResponse("CONFLICT", "Depreciation plan conflict", 409);
      }

      if (error instanceof DatabaseReferenceError) {
        return errorResponse("INVALID_REFERENCE", "Invalid depreciation reference", 400);
      }

      if (error instanceof DatabaseForbiddenError) {
        return errorResponse("FORBIDDEN", "Forbidden", 403);
      }

      console.error("PATCH /api/accounts/fixed-assets/:id/depreciation-plan failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Depreciation plan request failed", 500);
    }
  },
  [requireAccess({ roles: ["OWNER", "COMPANY_ADMIN", "ADMIN", "ACCOUNTANT"], module: "accounts", permission: "update" })]
);
