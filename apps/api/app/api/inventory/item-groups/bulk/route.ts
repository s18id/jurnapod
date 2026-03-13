// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { ItemGroupBulkCreateRequestSchema } from "@jurnapod/shared";
import { ZodError } from "zod";
import { requireAccess, withAuth } from "../../../../../src/lib/auth-guard";
import { errorResponse, successResponse } from "../../../../../src/lib/response";
import {
  ItemGroupBulkConflictError,
  createItemGroupsBulk
} from "../../../../../src/lib/master-data";

export const POST = withAuth(
  async (request, auth) => {
    try {
      const payload = await request.json();
      const input = ItemGroupBulkCreateRequestSchema.parse(payload);

      const normalizedRows = input.rows.map((row) => ({
        code: row.code ?? null,
        name: row.name,
        parent_code: row.parent_code ?? null,
        is_active: row.is_active ?? true
      }));

      const result = await createItemGroupsBulk(
        auth.companyId,
        normalizedRows,
        { userId: auth.userId }
      );

      return successResponse(result, 201);
    } catch (error) {
      if (error instanceof ZodError || error instanceof SyntaxError) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }

      if (error instanceof ItemGroupBulkConflictError) {
        switch (error.code) {
          case "DUPLICATE_CODE":
            return errorResponse("ITEM_GROUP_DUPLICATE_CODE_IN_FILE", error.message, 409);
          case "CODE_EXISTS":
            return errorResponse("ITEM_GROUP_CODE_EXISTS", error.message, 409);
          case "PARENT_CODE_NOT_FOUND":
            return errorResponse("ITEM_GROUP_PARENT_CODE_NOT_FOUND", error.message, 409);
          case "CYCLE_DETECTED":
            return errorResponse("ITEM_GROUP_BULK_CYCLE_DETECTED", error.message, 409);
          default:
            return errorResponse("CONFLICT", error.message, 409);
        }
      }

      console.error("POST /api/inventory/item-groups/bulk failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Bulk item group create failed", 500);
    }
  },
  [requireAccess({ roles: ["OWNER", "COMPANY_ADMIN", "ADMIN", "ACCOUNTANT"], module: "inventory", permission: "create" })]
);
