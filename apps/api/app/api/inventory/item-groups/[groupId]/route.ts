// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import {
  ItemGroupUpdateRequestSchema,
  NumericIdSchema
} from "@jurnapod/shared";
import { ZodError } from "zod";
import { requireAccess, withAuth } from "../../../../../src/lib/auth-guard";
import { errorResponse, successResponse } from "../../../../../src/lib/response";
import {
  DatabaseConflictError,
  DatabaseReferenceError,
  deleteItemGroup,
  findItemGroupById,
  updateItemGroup
} from "../../../../../src/lib/master-data";

function parseGroupId(request: Request): number {
  const pathname = new URL(request.url).pathname;
  const groupIdRaw = pathname.split("/").filter(Boolean).pop();
  return NumericIdSchema.parse(groupIdRaw);
}

export const GET = withAuth(
  async (request, auth) => {
    try {
      const groupId = parseGroupId(request);
      const group = await findItemGroupById(auth.companyId, groupId);

      if (!group) {
        return errorResponse("NOT_FOUND", "Item group not found", 404);
      }

      return successResponse(group);
    } catch (error) {
      if (error instanceof ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }

      console.error("GET /api/inventory/item-groups/:id failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Item group request failed", 500);
    }
  },
  [requireAccess({ roles: ["OWNER", "ADMIN", "ACCOUNTANT"], module: "inventory", permission: "read" })]
);

export const PATCH = withAuth(
  async (request, auth) => {
    try {
      const groupId = parseGroupId(request);
      const payload = await request.json();
      const input = ItemGroupUpdateRequestSchema.parse(payload);

      const updatePayload: {
        code?: string | null;
        name?: string;
        parent_id?: number | null;
        is_active?: boolean;
      } = {
        code: input.code,
        name: input.name,
        is_active: input.is_active
      };

      if (Object.hasOwn(input, "parent_id")) {
        updatePayload.parent_id = input.parent_id;
      }

      const group = await updateItemGroup(
        auth.companyId,
        groupId,
        updatePayload,
        {
          userId: auth.userId
        }
      );

      if (!group) {
        return errorResponse("NOT_FOUND", "Item group not found", 404);
      }

      return successResponse(group);
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

      console.error("PATCH /api/inventory/item-groups/:id failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Item group request failed", 500);
    }
  },
  [requireAccess({ roles: ["OWNER", "ADMIN", "ACCOUNTANT"], module: "inventory", permission: "update" })]
);

export const DELETE = withAuth(
  async (request, auth) => {
    try {
      const groupId = parseGroupId(request);
      const removed = await deleteItemGroup(auth.companyId, groupId, {
        userId: auth.userId
      });

      if (!removed) {
        return errorResponse("NOT_FOUND", "Item group not found", 404);
      }

      return successResponse(null);
    } catch (error) {
      if (error instanceof ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }

      if (error instanceof DatabaseConflictError) {
        return errorResponse("CONFLICT", "Item group has child groups", 409);
      }

      console.error("DELETE /api/inventory/item-groups/:id failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Item group request failed", 500);
    }
  },
  [requireAccess({ roles: ["OWNER", "ADMIN", "ACCOUNTANT"], module: "inventory", permission: "delete" })]
);
