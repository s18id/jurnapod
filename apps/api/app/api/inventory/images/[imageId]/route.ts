// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { UpdateImageRequestSchema, NumericIdSchema } from "@jurnapod/shared";
import { ZodError } from "zod";
import { requireAccess, withAuth } from "@/lib/auth-guard";
import { updateImage, deleteImage, getImageById, CrossTenantAccessError } from "@/lib/item-images";
import { errorResponse, successResponse } from "@/lib/response";

function parseImageId(request: Request): number {
  const pathname = new URL(request.url).pathname;
  const imageIdRaw = pathname.split("/").filter(Boolean).pop();
  return NumericIdSchema.parse(imageIdRaw);
}

export const GET = withAuth(
  async (request, auth) => {
    try {
      const imageId = parseImageId(request);
      const image = await getImageById(auth.companyId, imageId);
      
      if (!image) {
        return errorResponse("NOT_FOUND", "Image not found", 404);
      }

      return successResponse(image);
    } catch (error) {
      if (error instanceof ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid image ID", 400);
      }

      console.error("GET /api/inventory/images/[imageId] failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Failed to fetch image", 500);
    }
  },
  [requireAccess({ roles: ["OWNER", "COMPANY_ADMIN", "ADMIN", "ACCOUNTANT"], module: "inventory", permission: "read" })]
);

export const PATCH = withAuth(
  async (request, auth) => {
    try {
      const imageId = parseImageId(request);

      const payload = await request.json();
      const input = UpdateImageRequestSchema.parse(payload);

      await updateImage(
        auth.companyId,
        imageId,
        {
          isPrimary: input.is_primary,
          sortOrder: input.sort_order
        },
        auth.userId
      );

      return successResponse({ success: true });
    } catch (error) {
      if (error instanceof CrossTenantAccessError) {
        return errorResponse("FORBIDDEN", error.message, 403);
      }

      if (error instanceof ZodError || error instanceof SyntaxError) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }

      if (error instanceof Error && error.message.includes("not found")) {
        return errorResponse("NOT_FOUND", "Image not found", 404);
      }

      console.error("PATCH /api/inventory/images/[imageId] failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Failed to update image", 500);
    }
  },
  [requireAccess({ roles: ["OWNER", "COMPANY_ADMIN", "ADMIN", "ACCOUNTANT"], module: "inventory", permission: "update" })]
);

export const DELETE = withAuth(
  async (request, auth) => {
    try {
      const imageId = parseImageId(request);

      await deleteImage(auth.companyId, imageId, auth.userId);

      return successResponse({ success: true });
    } catch (error) {
      if (error instanceof CrossTenantAccessError) {
        return errorResponse("FORBIDDEN", error.message, 403);
      }

      if (error instanceof ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid image ID", 400);
      }

      if (error instanceof Error && error.message.includes("not found")) {
        return errorResponse("NOT_FOUND", "Image not found", 404);
      }

      console.error("DELETE /api/inventory/images/[imageId] failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Failed to delete image", 500);
    }
  },
  [requireAccess({ roles: ["OWNER", "COMPANY_ADMIN", "ADMIN", "ACCOUNTANT"], module: "inventory", permission: "delete" })]
);
