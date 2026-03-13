// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import {
  FixedAssetCreateRequestSchema,
  NumericIdSchema
} from "@jurnapod/shared";
import { ZodError } from "zod";
import { requireAccess, withAuth } from "../../../../src/lib/auth-guard";
import { checkUserAccess, listUserOutletIds } from "../../../../src/lib/auth";
import { errorResponse, successResponse } from "../../../../src/lib/response";
import {
  createFixedAsset,
  DatabaseConflictError,
  DatabaseReferenceError,
  listFixedAssets
} from "../../../../src/lib/master-data";

function parseOptionalIsActive(value: string | null): boolean | undefined {
  if (value == null) {
    return undefined;
  }

  if (value === "true" || value === "1") {
    return true;
  }

  if (value === "false" || value === "0") {
    return false;
  }

  throw new ZodError([]);
}

export const GET = withAuth(
  async (request, auth) => {
    try {
      const url = new URL(request.url);
      const companyIdRaw = url.searchParams.get("company_id");
      const outletIdRaw = url.searchParams.get("outlet_id");

      if (companyIdRaw != null) {
        const companyId = NumericIdSchema.parse(companyIdRaw);
        if (companyId !== auth.companyId) {
          return errorResponse("INVALID_REQUEST", "Invalid request", 400);
        }
      }

      const outletId = outletIdRaw == null ? undefined : NumericIdSchema.parse(outletIdRaw);
      const isActive = parseOptionalIsActive(url.searchParams.get("is_active"));

      if (outletId != null) {
        const access = await checkUserAccess({
          userId: auth.userId,
          companyId: auth.companyId,
          outletId
        });
        if (!access || (!access.hasOutletAccess && !access.hasGlobalRole && !access.isSuperAdmin)) {
          return errorResponse("FORBIDDEN", "Outlet access denied", 403);
        }
      } else {
        const access = await checkUserAccess({
          userId: auth.userId,
          companyId: auth.companyId
        });
        if (!access || (!access.hasGlobalRole && !access.isSuperAdmin)) {
          const allowedOutletIds = await listUserOutletIds(auth.userId, auth.companyId);
          const assets = await listFixedAssets(auth.companyId, { isActive, allowedOutletIds });
          return successResponse(assets);
        }
      }

      const assets = await listFixedAssets(auth.companyId, { outletId, isActive });

      return successResponse(assets);
    } catch (error) {
      if (error instanceof ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }

      console.error("GET /api/accounts/fixed-assets failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Fixed asset request failed", 500);
    }
  },
  [requireAccess({ roles: ["OWNER", "COMPANY_ADMIN", "ADMIN", "ACCOUNTANT"], module: "accounts", permission: "read" })]
);

export const POST = withAuth(
  async (request, auth) => {
    try {
      const payload = await request.json();
      const input = FixedAssetCreateRequestSchema.parse(payload);
      const asset = await createFixedAsset(auth.companyId, {
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

      return successResponse(asset, 201);
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

      console.error("POST /api/accounts/fixed-assets failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Fixed asset request failed", 500);
    }
  },
  [requireAccess({ roles: ["OWNER", "COMPANY_ADMIN", "ADMIN", "ACCOUNTANT"], module: "accounts", permission: "create" })]
);
