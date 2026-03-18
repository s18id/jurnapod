// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { UpdateItemBarcodeSchema, NumericIdSchema } from "@jurnapod/shared";
import { ZodError } from "zod";
import { requireAccess, withAuth } from "@/lib/auth-guard";
import { updateItemBarcode, removeItemBarcode } from "@/lib/item-barcodes";
import { errorResponse, successResponse } from "@/lib/response";

function parseItemId(request: Request): number {
  const pathname = new URL(request.url).pathname;
  const segments = pathname.split("/").filter(Boolean);
  // Extract itemId from pattern: /api/inventory/items/[itemId]/barcode
  const itemIdRaw = segments[segments.length - 2];
  return NumericIdSchema.parse(itemIdRaw);
}

export const PATCH = withAuth(
  async (request, auth) => {
    try {
      const itemId = parseItemId(request);

      const payload = await request.json();
      const input = UpdateItemBarcodeSchema.parse(payload);

      const item = await updateItemBarcode(
        auth.companyId,
        itemId,
        input.barcode,
        input.barcode_type,
        auth.userId
      );

      return successResponse(item);
    } catch (error) {
      if (error instanceof ZodError || error instanceof SyntaxError) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }

      if (error instanceof Error && error.message.includes("already in use")) {
        return errorResponse("CONFLICT", error.message, 409);
      }

      if (error instanceof Error && error.message.includes("Invalid")) {
        return errorResponse("INVALID_REQUEST", error.message, 400);
      }

      console.error("PATCH /api/inventory/items/[itemId]/barcode failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Failed to update barcode", 500);
    }
  },
  [requireAccess({ roles: ["OWNER", "COMPANY_ADMIN", "ADMIN", "ACCOUNTANT"], module: "inventory", permission: "update" })]
);

export const DELETE = withAuth(
  async (request, auth) => {
    try {
      const itemId = parseItemId(request);

      await removeItemBarcode(auth.companyId, itemId, auth.userId);

      return successResponse({ success: true });
    } catch (error) {
      if (error instanceof ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }

      console.error("DELETE /api/inventory/items/[itemId]/barcode failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Failed to remove barcode", 500);
    }
  },
  [requireAccess({ roles: ["OWNER", "COMPANY_ADMIN", "ADMIN", "ACCOUNTANT"], module: "inventory", permission: "update" })]
);
