// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import {
  ItemPriceCreateRequestSchema,
  NumericIdSchema
} from "@jurnapod/shared";
import { ZodError } from "zod";
import { requireAccess, withAuth } from "../../../../src/lib/auth-guard";
import { errorResponse, successResponse } from "../../../../src/lib/response";
import {
  createItemPrice,
  DatabaseConflictError,
  DatabaseReferenceError,
  listItemPrices
} from "../../../../src/lib/master-data";
import { listUserOutletIds, userHasOutletAccess } from "../../../../src/lib/auth";

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

function parseOptionalOutletId(value: string | null): number | undefined {
  if (value == null) {
    return undefined;
  }

  return NumericIdSchema.parse(value);
}

export const GET = withAuth(
  async (request, auth) => {
    try {
      const url = new URL(request.url);
      const companyIdRaw = url.searchParams.get("company_id");

      if (companyIdRaw != null) {
        const companyId = NumericIdSchema.parse(companyIdRaw);
        if (companyId !== auth.companyId) {
          return errorResponse("INVALID_REQUEST", "Invalid request", 400);
        }
      }

      const outletId = parseOptionalOutletId(url.searchParams.get("outlet_id"));
      const isActive = parseOptionalIsActive(url.searchParams.get("is_active"));

      if (typeof outletId === "number") {
        const hasOutletAccess = await userHasOutletAccess(auth.userId, auth.companyId, outletId);
        if (!hasOutletAccess) {
          return errorResponse("FORBIDDEN", "Forbidden", 403);
        }

        const prices = await listItemPrices(auth.companyId, {
          outletId,
          isActive
        });

        return successResponse(prices);
      }

      const outletIds = await listUserOutletIds(auth.userId, auth.companyId);
      const prices = await listItemPrices(auth.companyId, {
        outletIds,
        isActive
      });

      return successResponse(prices);
    } catch (error) {
      if (error instanceof ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }

      console.error("GET /api/inventory/item-prices failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Item prices request failed", 500);
    }
  },
  [requireAccess({ roles: ["OWNER", "ADMIN", "ACCOUNTANT"], module: "inventory", permission: "read" })]
);

export const POST = withAuth(
  async (request, auth) => {
    try {
      const payload = await request.json();
      const input = ItemPriceCreateRequestSchema.parse(payload);
      const hasOutletAccess = await userHasOutletAccess(auth.userId, auth.companyId, input.outlet_id);
      if (!hasOutletAccess) {
        return errorResponse("FORBIDDEN", "Forbidden", 403);
      }

      const itemPrice = await createItemPrice(auth.companyId, input, {
        userId: auth.userId
      });

      return successResponse(itemPrice, 201);
    } catch (error) {
      if (error instanceof ZodError || error instanceof SyntaxError) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }

      if (error instanceof DatabaseReferenceError) {
        return errorResponse("NOT_FOUND", "Item or outlet not found", 404);
      }

      if (error instanceof DatabaseConflictError) {
        return errorResponse("CONFLICT", "Item price conflict", 409);
      }

      console.error("POST /api/inventory/item-prices failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Item prices request failed", 500);
    }
  },
  [requireAccess({ roles: ["OWNER", "ADMIN", "ACCOUNTANT"], module: "inventory", permission: "create" })]
);
