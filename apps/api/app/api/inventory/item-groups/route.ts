// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import {
  ItemGroupCreateRequestSchema,
  NumericIdSchema
} from "@jurnapod/shared";
import { ZodError } from "zod";
import { requireAccess, withAuth } from "../../../../src/lib/auth-guard";
import { errorResponse, successResponse } from "../../../../src/lib/response";
import {
  createItemGroup,
  DatabaseConflictError,
  DatabaseReferenceError,
  listItemGroups
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

      if (companyIdRaw != null) {
        const companyId = NumericIdSchema.parse(companyIdRaw);
        if (companyId !== auth.companyId) {
          return errorResponse("INVALID_REQUEST", "Invalid request", 400);
        }
      }

      const isActive = parseOptionalIsActive(url.searchParams.get("is_active"));
      const groups = await listItemGroups(auth.companyId, { isActive });

      return successResponse(groups);
    } catch (error) {
      if (error instanceof ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }

      console.error("GET /api/inventory/item-groups failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Item groups request failed", 500);
    }
  },
  [requireAccess({ roles: ["OWNER", "COMPANY_ADMIN", "ADMIN", "ACCOUNTANT"], module: "inventory", permission: "read" })]
);

export const POST = withAuth(
  async (request, auth) => {
    try {
      const payload = await request.json();
      const input = ItemGroupCreateRequestSchema.parse(payload);
      const group = await createItemGroup(
        auth.companyId,
        {
          code: input.code,
          name: input.name,
          parent_id: input.parent_id,
          is_active: input.is_active
        },
        {
          userId: auth.userId
        }
      );

      return successResponse(group, 201);
    } catch (error) {
      if (error instanceof ZodError || error instanceof SyntaxError) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }

      if (error instanceof DatabaseConflictError) {
        return errorResponse("CONFLICT", "Item group conflict", 409);
      }

      if (error instanceof DatabaseReferenceError) {
        return errorResponse("NOT_FOUND", "Parent group not found", 404);
      }

      console.error("POST /api/inventory/item-groups failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Item groups request failed", 500);
    }
  },
  [requireAccess({ roles: ["OWNER", "COMPANY_ADMIN", "ADMIN", "ACCOUNTANT"], module: "inventory", permission: "create" })]
);
