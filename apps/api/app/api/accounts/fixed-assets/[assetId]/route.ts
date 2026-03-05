// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { FixedAssetUpdateRequestSchema, NumericIdSchema } from "@jurnapod/shared";
import { ZodError } from "zod";
import { requireAccess, withAuth } from "../../../../../src/lib/auth-guard";
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

      const asset = await updateFixedAsset(auth.companyId, assetId, {
        outlet_id: input.outlet_id ?? null,
        category_id: input.category_id ?? null,
        asset_tag: input.asset_tag,
        name: input.name,
        serial_number: input.serial_number,
        purchase_date: input.purchase_date ?? null,
        purchase_cost: input.purchase_cost ?? null,
        is_active: input.is_active
      }, {
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
