// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { CreateVariantAttributeSchema } from "@jurnapod/shared";
import { ZodError } from "zod";
import { requireAccess, withAuth } from "@/lib/auth-guard";
import {
  createVariantAttribute,
  listVariantAttributes,
  ItemNotFoundError
} from "@/lib/item-variants";
import { errorResponse, successResponse } from "@/lib/response";

export const GET = withAuth(
  async (request, auth) => {
    try {
      const url = new URL(request.url);
      const itemIdRaw = url.pathname.split("/").slice(-2)[0];
      const itemId = parseInt(itemIdRaw, 10);

      if (isNaN(itemId) || itemId <= 0) {
        return errorResponse("INVALID_REQUEST", "Invalid item ID", 400);
      }

      const attributes = await listVariantAttributes(auth.companyId, itemId);
      return successResponse(attributes);
    } catch (error) {
      console.error("GET /api/inventory/items/[itemId]/variant-attributes failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Failed to list variant attributes", 500);
    }
  },
  [requireAccess({ roles: ["OWNER", "COMPANY_ADMIN", "ADMIN", "ACCOUNTANT"], module: "inventory", permission: "read" })]
);

export const POST = withAuth(
  async (request, auth) => {
    try {
      const url = new URL(request.url);
      const itemIdRaw = url.pathname.split("/").slice(-2)[0];
      const itemId = parseInt(itemIdRaw, 10);

      if (isNaN(itemId) || itemId <= 0) {
        return errorResponse("INVALID_REQUEST", "Invalid item ID", 400);
      }

      const payload = await request.json();
      const input = CreateVariantAttributeSchema.parse(payload);
      const attribute = await createVariantAttribute(auth.companyId, itemId, input);

      return successResponse(attribute, 201);
    } catch (error) {
      if (error instanceof ZodError || error instanceof SyntaxError) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }

      if (error instanceof ItemNotFoundError) {
        return errorResponse("NOT_FOUND", error.message, 404);
      }

      console.error("POST /api/inventory/items/[itemId]/variant-attributes failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Failed to create variant attribute", 500);
    }
  },
  [requireAccess({ roles: ["OWNER", "COMPANY_ADMIN", "ADMIN", "ACCOUNTANT"], module: "inventory", permission: "create" })]
);