// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { StockAdjustmentSchema } from "@jurnapod/shared";
import { ZodError } from "zod";
import { requireAccess, withAuth } from "@/lib/auth-guard";
import {
  adjustVariantStock,
  VariantNotFoundError
} from "@/lib/item-variants";
import { errorResponse, successResponse } from "@/lib/response";

export const POST = withAuth(
  async (request, auth) => {
    try {
      const url = new URL(request.url);
      const variantIdRaw = url.pathname.split("/").slice(-3)[0];
      const variantId = parseInt(variantIdRaw || "", 10);

      if (isNaN(variantId) || variantId <= 0) {
        return errorResponse("INVALID_REQUEST", "Invalid variant ID", 400);
      }

      const payload = await request.json();
      const input = StockAdjustmentSchema.parse(payload);
      const newStock = await adjustVariantStock(
        auth.companyId,
        variantId,
        input.adjustment,
        input.reason
      );

      return successResponse({ variant_id: variantId, stock_quantity: newStock });
    } catch (error) {
      if (error instanceof ZodError || error instanceof SyntaxError) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }

      if (error instanceof VariantNotFoundError) {
        return errorResponse("NOT_FOUND", error.message, 404);
      }

      console.error("POST /api/inventory/variants/[variantId]/stock-adjustment failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Failed to adjust stock", 500);
    }
  },
  [requireAccess({ roles: ["OWNER", "COMPANY_ADMIN", "ADMIN", "ACCOUNTANT"], module: "inventory", permission: "update" })]
);