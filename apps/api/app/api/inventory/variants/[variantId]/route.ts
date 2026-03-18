// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { UpdateVariantSchema } from "@jurnapod/shared";
import { ZodError } from "zod";
import { requireAccess, withAuth } from "@/lib/auth-guard";
import {
  updateVariant,
  getVariantById,
  VariantNotFoundError,
  DuplicateSkuError
} from "@/lib/item-variants";
import { errorResponse, successResponse } from "@/lib/response";

export const GET = withAuth(
  async (request, auth) => {
    try {
      const url = new URL(request.url);
      const variantIdRaw = url.pathname.split("/").pop();
      const variantId = parseInt(variantIdRaw || "", 10);

      if (isNaN(variantId) || variantId <= 0) {
        return errorResponse("INVALID_REQUEST", "Invalid variant ID", 400);
      }

      const variant = await getVariantById(auth.companyId, variantId);
      if (!variant) {
        return errorResponse("NOT_FOUND", "Variant not found", 404);
      }

      return successResponse(variant);
    } catch (error) {
      console.error("GET /api/inventory/variants/[variantId] failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Failed to get variant", 500);
    }
  },
  [requireAccess({ roles: ["OWNER", "COMPANY_ADMIN", "ADMIN", "ACCOUNTANT"], module: "inventory", permission: "read" })]
);

export const PATCH = withAuth(
  async (request, auth) => {
    try {
      const url = new URL(request.url);
      const variantIdRaw = url.pathname.split("/").pop();
      const variantId = parseInt(variantIdRaw || "", 10);

      if (isNaN(variantId) || variantId <= 0) {
        return errorResponse("INVALID_REQUEST", "Invalid variant ID", 400);
      }

      const payload = await request.json();
      const input = UpdateVariantSchema.parse(payload);
      const variant = await updateVariant(auth.companyId, variantId, input);

      return successResponse(variant);
    } catch (error) {
      if (error instanceof ZodError || error instanceof SyntaxError) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }

      if (error instanceof VariantNotFoundError) {
        return errorResponse("NOT_FOUND", error.message, 404);
      }

      if (error instanceof DuplicateSkuError) {
        return errorResponse("CONFLICT", error.message, 409);
      }

      console.error("PATCH /api/inventory/variants/[variantId] failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Failed to update variant", 500);
    }
  },
  [requireAccess({ roles: ["OWNER", "COMPANY_ADMIN", "ADMIN", "ACCOUNTANT"], module: "inventory", permission: "update" })]
);