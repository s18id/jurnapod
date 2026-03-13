// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { FixedAssetUpdateRequestSchema, NumericIdSchema } from "@jurnapod/shared";
import { ZodError } from "zod";
import { requireAccess, withAuth } from "../../../../../src/lib/auth-guard";
import { checkUserAccess } from "../../../../../src/lib/auth";
import { errorResponse, successResponse } from "../../../../../src/lib/response";
import {
  DatabaseConflictError,
  DatabaseReferenceError,
  deleteFixedAsset,
  findFixedAssetById,
  updateFixedAsset
} from "../../../../../src/lib/master-data";

function parseAssetId(request: Request): number {
  const pathname = new URL(request.url).pathname;
  const assetIdRaw = pathname.split("/").filter(Boolean).pop();
  return NumericIdSchema.parse(assetIdRaw);
}

export const GET = withAuth(
  async (request, auth) => {
    try {
      const assetId = parseAssetId(request);
      const asset = await findFixedAssetById(auth.companyId, assetId);

      if (!asset) {
        return errorResponse("NOT_FOUND", "Fixed asset not found", 404);
      }

      if (asset.outlet_id != null) {
        const access = await checkUserAccess({
          userId: auth.userId,
          companyId: auth.companyId,
          outletId: asset.outlet_id
        });
        if (!access || (!access.hasOutletAccess && !access.hasGlobalRole && !access.isSuperAdmin)) {
          return errorResponse("NOT_FOUND", "Fixed asset not found", 404);
        }
      }

      return successResponse(asset);
    } catch (error) {
      if (error instanceof ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }

      console.error("GET /api/accounts/fixed-assets/:id failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Fixed asset request failed", 500);
    }
  },
  [requireAccess({ roles: ["OWNER", "COMPANY_ADMIN", "ADMIN", "ACCOUNTANT"], module: "accounts", permission: "read" })]
);

export const PATCH = withAuth(
  async (request, auth) => {
    try {
      const assetId = parseAssetId(request);
      const payload = await request.json();
      const input = FixedAssetUpdateRequestSchema.parse(payload);

      const updateInput: Parameters<typeof updateFixedAsset>[2] = {};

      if (Object.hasOwn(input, "outlet_id")) updateInput.outlet_id = input.outlet_id ?? null;
      if (Object.hasOwn(input, "category_id")) updateInput.category_id = input.category_id ?? null;
      if (Object.hasOwn(input, "asset_tag")) updateInput.asset_tag = input.asset_tag ?? null;
      if (Object.hasOwn(input, "name")) updateInput.name = input.name;
      if (Object.hasOwn(input, "serial_number")) updateInput.serial_number = input.serial_number ?? null;
      if (Object.hasOwn(input, "purchase_date")) updateInput.purchase_date = input.purchase_date ?? null;
      if (Object.hasOwn(input, "purchase_cost")) updateInput.purchase_cost = input.purchase_cost ?? null;
      if (Object.hasOwn(input, "is_active")) updateInput.is_active = input.is_active;

      const asset = await updateFixedAsset(auth.companyId, assetId, updateInput, {
        userId: auth.userId
      });

      if (!asset) {
        return errorResponse("NOT_FOUND", "Fixed asset not found", 404);
      }

      return successResponse(asset);
    } catch (error) {
      if (error instanceof ZodError || error instanceof SyntaxError) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }

      if (error instanceof DatabaseConflictError) {
        return errorResponse("CONFLICT", "Fixed asset conflict", 409);
      }

      if (error instanceof DatabaseReferenceError) {
        return errorResponse("INVALID_REFERENCE", "Invalid fixed asset reference", 400);
      }

      console.error("PATCH /api/accounts/fixed-assets/:id failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Fixed asset request failed", 500);
    }
  },
  [requireAccess({ roles: ["OWNER", "COMPANY_ADMIN", "ADMIN", "ACCOUNTANT"], module: "accounts", permission: "update" })]
);

export const DELETE = withAuth(
  async (request, auth) => {
    try {
      const assetId = parseAssetId(request);
      const removed = await deleteFixedAsset(auth.companyId, assetId, {
        userId: auth.userId
      });

      if (!removed) {
        return errorResponse("NOT_FOUND", "Fixed asset not found", 404);
      }

      return successResponse(null);
    } catch (error) {
      if (error instanceof ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }

      console.error("DELETE /api/accounts/fixed-assets/:id failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Fixed asset request failed", 500);
    }
  },
  [requireAccess({ roles: ["OWNER", "COMPANY_ADMIN", "ADMIN", "ACCOUNTANT"], module: "accounts", permission: "delete" })]
);
