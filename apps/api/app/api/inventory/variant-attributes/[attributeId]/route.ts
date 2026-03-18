// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { UpdateVariantAttributeSchema } from "@jurnapod/shared";
import { ZodError } from "zod";
import { requireAccess, withAuth } from "@/lib/auth-guard";
import {
  updateVariantAttribute,
  deleteVariantAttribute,
  AttributeNotFoundError
} from "@/lib/item-variants";
import { errorResponse, successResponse } from "@/lib/response";

export const PATCH = withAuth(
  async (request, auth) => {
    try {
      const url = new URL(request.url);
      const attributeIdRaw = url.pathname.split("/").pop();
      const attributeId = parseInt(attributeIdRaw || "", 10);

      if (isNaN(attributeId) || attributeId <= 0) {
        return errorResponse("INVALID_REQUEST", "Invalid attribute ID", 400);
      }

      const payload = await request.json();
      const input = UpdateVariantAttributeSchema.parse(payload);
      const attribute = await updateVariantAttribute(auth.companyId, attributeId, input);

      return successResponse(attribute);
    } catch (error) {
      if (error instanceof ZodError || error instanceof SyntaxError) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }

      if (error instanceof AttributeNotFoundError) {
        return errorResponse("NOT_FOUND", error.message, 404);
      }

      console.error("PATCH /api/inventory/variant-attributes/[attributeId] failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Failed to update variant attribute", 500);
    }
  },
  [requireAccess({ roles: ["OWNER", "COMPANY_ADMIN", "ADMIN", "ACCOUNTANT"], module: "inventory", permission: "update" })]
);

export const DELETE = withAuth(
  async (request, auth) => {
    try {
      const url = new URL(request.url);
      const attributeIdRaw = url.pathname.split("/").pop();
      const attributeId = parseInt(attributeIdRaw || "", 10);

      if (isNaN(attributeId) || attributeId <= 0) {
        return errorResponse("INVALID_REQUEST", "Invalid attribute ID", 400);
      }

      await deleteVariantAttribute(auth.companyId, attributeId);
      return successResponse({ deleted: true });
    } catch (error) {
      if (error instanceof AttributeNotFoundError) {
        return errorResponse("NOT_FOUND", error.message, 404);
      }

      console.error("DELETE /api/inventory/variant-attributes/[attributeId] failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Failed to delete variant attribute", 500);
    }
  },
  [requireAccess({ roles: ["OWNER", "COMPANY_ADMIN", "ADMIN", "ACCOUNTANT"], module: "inventory", permission: "delete" })]
);