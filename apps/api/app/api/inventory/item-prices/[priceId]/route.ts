// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import {
  ItemPriceUpdateRequestSchema,
  NumericIdSchema
} from "@jurnapod/shared";
import { ZodError } from "zod";
import { requireAccess, withAuth } from "../../../../../src/lib/auth-guard";
import { errorResponse, successResponse } from "../../../../../src/lib/response";
import {
  DatabaseConflictError,
  DatabaseForbiddenError,
  DatabaseReferenceError,
  deleteItemPrice,
  findItemPriceById,
  updateItemPrice
} from "../../../../../src/lib/master-data";
import { userHasOutletAccess } from "../../../../../src/lib/auth";

function parsePriceId(request: Request): number {
  const pathname = new URL(request.url).pathname;
  const priceIdRaw = pathname.split("/").filter(Boolean).pop();
  return NumericIdSchema.parse(priceIdRaw);
}

export const GET = withAuth(
  async (request, auth) => {
    try {
      const priceId = parsePriceId(request);
      const itemPrice = await findItemPriceById(auth.companyId, priceId);

      if (!itemPrice) {
        return errorResponse("NOT_FOUND", "Item price not found", 404);
      }

      // Check outlet access only for outlet overrides (not company defaults)
      if (itemPrice.outlet_id !== null) {
        const hasOutletAccess = await userHasOutletAccess(
          auth.userId,
          auth.companyId,
          itemPrice.outlet_id
        );
        if (!hasOutletAccess) {
          return errorResponse("FORBIDDEN", "Forbidden", 403);
        }
      }

       return successResponse(itemPrice);
    } catch (error) {
      if (error instanceof ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }

      console.error("GET /api/inventory/item-prices/:id failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Item prices request failed", 500);
    }
  },
  [requireAccess({ roles: ["OWNER", "COMPANY_ADMIN", "ADMIN", "ACCOUNTANT"], module: "inventory", permission: "read" })]
);

export const PATCH = withAuth(
  async (request, auth) => {
    try {
      const priceId = parsePriceId(request);
      const payload = await request.json();
      const input = ItemPriceUpdateRequestSchema.parse(payload);

      const existingItemPrice = await findItemPriceById(auth.companyId, priceId);
      if (!existingItemPrice) {
        return errorResponse("NOT_FOUND", "Item price not found", 404);
      }

      // Check outlet access only for outlet overrides (not company defaults)
      if (existingItemPrice.outlet_id !== null) {
        const hasCurrentOutletAccess = await userHasOutletAccess(
          auth.userId,
          auth.companyId,
          existingItemPrice.outlet_id
        );
        if (!hasCurrentOutletAccess) {
          return errorResponse("FORBIDDEN", "Forbidden", 403);
        }
      }

      // If changing outlet scope, validate access
      if (Object.hasOwn(input, "outlet_id")) {
        if (typeof input.outlet_id === "number") {
          const hasTargetOutletAccess = await userHasOutletAccess(
            auth.userId,
            auth.companyId,
            input.outlet_id
          );
          if (!hasTargetOutletAccess) {
            return errorResponse("FORBIDDEN", "Forbidden", 403);
          }
        }
        // input.outlet_id === null means changing to company default (allowed for company admins)
      }

      const itemPrice = await updateItemPrice(auth.companyId, priceId, input, {
        userId: auth.userId
      });

      if (!itemPrice) {
        return errorResponse("NOT_FOUND", "Item price not found", 404);
      }

       return successResponse(itemPrice);
    } catch (error) {
      if (error instanceof ZodError || error instanceof SyntaxError) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }

      if (error instanceof DatabaseForbiddenError) {
        return errorResponse("FORBIDDEN", "Forbidden", 403);
      }

      if (error instanceof DatabaseReferenceError) {
        return errorResponse("NOT_FOUND", "Item or outlet not found", 404);
      }

      if (error instanceof DatabaseConflictError) {
        return errorResponse("CONFLICT", "Item price conflict", 409);
      }

      console.error("PATCH /api/inventory/item-prices/:id failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Item prices request failed", 500);
    }
  },
  [requireAccess({ roles: ["OWNER", "COMPANY_ADMIN", "ADMIN", "ACCOUNTANT"], module: "inventory", permission: "update" })]
);

export const DELETE = withAuth(
  async (request, auth) => {
    try {
      const priceId = parsePriceId(request);

      const existingItemPrice = await findItemPriceById(auth.companyId, priceId);
      if (!existingItemPrice) {
        return errorResponse("NOT_FOUND", "Item price not found", 404);
      }

      // Check outlet access only for outlet overrides (not company defaults)
      if (existingItemPrice.outlet_id !== null) {
        const hasOutletAccess = await userHasOutletAccess(
          auth.userId,
          auth.companyId,
          existingItemPrice.outlet_id
        );
        if (!hasOutletAccess) {
          return errorResponse("FORBIDDEN", "Forbidden", 403);
        }
      }

      const removed = await deleteItemPrice(auth.companyId, priceId, {
        userId: auth.userId
      });

      if (!removed) {
        return errorResponse("NOT_FOUND", "Item price not found", 404);
      }

       return successResponse(null);
    } catch (error) {
      if (error instanceof ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }

      if (error instanceof DatabaseForbiddenError) {
        return errorResponse("FORBIDDEN", "Forbidden", 403);
      }

      console.error("DELETE /api/inventory/item-prices/:id failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Item prices request failed", 500);
    }
  },
  [requireAccess({ roles: ["OWNER", "COMPANY_ADMIN", "ADMIN", "ACCOUNTANT"], module: "inventory", permission: "delete" })]
);
