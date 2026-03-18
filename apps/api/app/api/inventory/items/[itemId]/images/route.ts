// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { ZodError } from "zod";
import { requireAccess, withAuth } from "@/lib/auth-guard";
import { uploadItemImage, getItemImages, CrossTenantAccessError } from "@/lib/item-images";
import { errorResponse, successResponse } from "@/lib/response";
import { NumericIdSchema } from "@jurnapod/shared";

function parseItemId(request: Request): number {
  const pathname = new URL(request.url).pathname;
  const segments = pathname.split("/").filter(Boolean);
  // Extract itemId from pattern: /api/inventory/items/[itemId]/images
  const itemIdRaw = segments[segments.length - 2];
  return NumericIdSchema.parse(itemIdRaw);
}

export const POST = withAuth(
  async (request, auth) => {
    try {
      const itemId = parseItemId(request);

      // Parse multipart form data
      const formData = await request.formData();
      const imageFile = formData.get('image') as File | null;
      const isPrimaryRaw = formData.get('is_primary');
      const variantIdRaw = formData.get('variant_id');

      if (!imageFile) {
        return errorResponse("INVALID_REQUEST", "Image file is required", 400);
      }

      // Validate file type
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(imageFile.type)) {
        return errorResponse("INVALID_REQUEST", "Only JPG, PNG, WebP images supported", 400);
      }

      // Convert File to Buffer
      const arrayBuffer = await imageFile.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Parse options
      const options: { isPrimary?: boolean; variantId?: number } = {};
      
      if (isPrimaryRaw === 'true' || isPrimaryRaw === '1') {
        options.isPrimary = true;
      }
      
      if (variantIdRaw) {
        options.variantId = NumericIdSchema.parse(variantIdRaw);
      }

      const image = await uploadItemImage(
        auth.companyId,
        itemId,
        buffer,
        imageFile.name,
        imageFile.type,
        auth.userId,
        options
      );

      return successResponse(image, 201);
    } catch (error) {
      if (error instanceof CrossTenantAccessError) {
        return errorResponse("FORBIDDEN", error.message, 403);
      }

      if (error instanceof ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }

      if (error instanceof Error && error.message.includes("5MB")) {
        return errorResponse("INVALID_REQUEST", error.message, 400);
      }

      if (error instanceof Error && (error.message.includes("Variant") || error.message.includes("does not belong"))) {
        return errorResponse("INVALID_REQUEST", error.message, 400);
      }

      if (error instanceof Error && error.message.includes("not found")) {
        return errorResponse("NOT_FOUND", error.message, 404);
      }

      console.error("POST /api/inventory/items/[itemId]/images failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Failed to upload image", 500);
    }
  },
  [requireAccess({ roles: ["OWNER", "COMPANY_ADMIN", "ADMIN", "ACCOUNTANT"], module: "inventory", permission: "create" })]
);

export const GET = withAuth(
  async (request, auth) => {
    try {
      const itemId = parseItemId(request);

      const images = await getItemImages(auth.companyId, itemId);

      return successResponse(images);
    } catch (error) {
      if (error instanceof ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }

      console.error("GET /api/inventory/items/[itemId]/images failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Failed to get images", 500);
    }
  },
  [requireAccess({ roles: ["OWNER", "COMPANY_ADMIN", "ADMIN", "ACCOUNTANT", "CASHIER"], module: "inventory", permission: "read" })]
);
