// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { ItemUpdateRequestSchema, NumericIdSchema } from "@jurnapod/shared";
import { ZodError } from "zod";
import { requireAccess, withAuth } from "../../../../../src/lib/auth-guard";
import { errorResponse, successResponse } from "../../../../../src/lib/response";
import {
  DatabaseConflictError,
  DatabaseReferenceError,
  deleteItem,
  findItemById,
  updateItem
} from "../../../../../src/lib/master-data";

function parseItemId(request: Request): number {
  const pathname = new URL(request.url).pathname;
  const itemIdRaw = pathname.split("/").filter(Boolean).pop();
  return NumericIdSchema.parse(itemIdRaw);
}

export const GET = withAuth(
  async (request, auth) => {
    try {
      const itemId = parseItemId(request);
      const item = await findItemById(auth.companyId, itemId);

      if (!item) {
        return errorResponse("NOT_FOUND", "Item not found", 404);
      }

      return successResponse(item);
    } catch (error) {
      if (error instanceof ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }

      console.error("GET /api/inventory/items/:id failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Items request failed", 500);
    }
  },
  [requireAccess({ roles: ["OWNER", "ADMIN", "ACCOUNTANT"], module: "inventory", permission: "read" })]
);

export const PATCH = withAuth(
  async (request, auth) => {
    try {
      const itemId = parseItemId(request);
      const payload = await request.json();
      const input = ItemUpdateRequestSchema.parse(payload);

      const item = await updateItem(auth.companyId, itemId, {
        sku: input.sku,
        name: input.name,
        type: input.type,
        item_group_id: input.item_group_id,
        is_active: input.is_active
      }, {
        userId: auth.userId
      });

      if (!item) {
        return errorResponse("NOT_FOUND", "Item not found", 404);
      }

      return successResponse(item);
    } catch (error) {
      if (error instanceof ZodError || error instanceof SyntaxError) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }

      if (error instanceof DatabaseConflictError) {
        return errorResponse("CONFLICT", "Item conflict", 409);
      }

      if (error instanceof DatabaseReferenceError) {
        return errorResponse("NOT_FOUND", "Item group not found", 404);
      }

      console.error("PATCH /api/inventory/items/:id failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Items request failed", 500);
    }
  },
  [requireAccess({ roles: ["OWNER", "ADMIN", "ACCOUNTANT"], module: "inventory", permission: "update" })]
);

export const DELETE = withAuth(
  async (request, auth) => {
    try {
      const itemId = parseItemId(request);
      const removed = await deleteItem(auth.companyId, itemId, {
        userId: auth.userId
      });

      if (!removed) {
        return errorResponse("NOT_FOUND", "Item not found", 404);
      }

      return successResponse(null);
    } catch (error) {
      if (error instanceof ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }

      console.error("DELETE /api/inventory/items/:id failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Items request failed", 500);
    }
  },
  [requireAccess({ roles: ["OWNER", "ADMIN", "ACCOUNTANT"], module: "inventory", permission: "delete" })]
);
