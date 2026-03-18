// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import {
  ItemCreateRequestSchema,
  NumericIdSchema
} from "@jurnapod/shared";
import { ZodError } from "zod";
import { requireAccess, withAuth } from "../../../../src/lib/auth-guard";
import {
  createItem,
  DatabaseConflictError,
  DatabaseReferenceError,
  listItems
} from "../../../../src/lib/master-data";
import { errorResponse, successResponse } from "../../../../src/lib/response";

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

      if (companyIdRaw != null) {
        const companyId = NumericIdSchema.parse(companyIdRaw);
        if (companyId !== auth.companyId) {
          return errorResponse("INVALID_REQUEST", "Invalid request", 400);
        }
      }

      const isActive = parseOptionalIsActive(url.searchParams.get("is_active"));
      const items = await listItems(auth.companyId, { isActive });

      return successResponse(items);
    } catch (error) {
      if (error instanceof ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }

      console.error("GET /api/inventory/items failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Items request failed", 500);
    }
  },
  [requireAccess({ roles: ["OWNER", "COMPANY_ADMIN", "ADMIN", "ACCOUNTANT", "CASHIER"], module: "inventory", permission: "read" })]
);

export const POST = withAuth(
  async (request, auth) => {
    try {
      const payload = await request.json();
      const input = ItemCreateRequestSchema.parse(payload);
      const item = await createItem(auth.companyId, {
        sku: input.sku,
        name: input.name,
        type: input.type,
        item_group_id: input.item_group_id,
        cogs_account_id: input.cogs_account_id,
        inventory_asset_account_id: input.inventory_asset_account_id,
        is_active: input.is_active
      }, {
        userId: auth.userId
      });

      return successResponse(item, 201);
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

      console.error("POST /api/inventory/items failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Items request failed", 500);
    }
  },
  [requireAccess({ roles: ["OWNER", "COMPANY_ADMIN", "ADMIN", "ACCOUNTANT"], module: "inventory", permission: "create" })]
);
