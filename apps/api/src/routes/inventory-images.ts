// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Inventory Image Routes
 *
 * Routes for item image management:
 * - POST   /inventory/items/:id/images           - Upload image
 * - GET    /inventory/items/:id/images           - List images
 * - GET    /inventory/items/:id/images/:imageId - Get image
 * - PATCH  /inventory/items/:id/images/:imageId - Update image metadata
 * - DELETE /inventory/items/:id/images/:imageId - Delete image
 * - POST   /inventory/items/:id/images/:imageId/set-primary - Set as primary
 *
 * Required role: OWNER, ADMIN, ACCOUNTANT, or CASHIER with inventory module access
 *
 * Architecture: Thin HTTP adapter - all business logic delegated to lib/item-images.ts
 */

import { Hono } from "hono";
import { z } from "zod";
import { z as zodOpenApi, createRoute } from "@hono/zod-openapi";
import type { OpenAPIHono as OpenAPIHonoType } from "@hono/zod-openapi";
import { NumericIdSchema } from "@jurnapod/shared";
import {
  authenticateRequest,
  requireAccess,
  type AuthContext,
  type AuthenticatedRouteGuard
} from "../lib/auth-guard.js";
import { errorResponse, successResponse } from "../lib/response.js";
import {
  uploadItemImage,
  getItemImages,
  getImageById,
  updateImage,
  deleteImage,
  setPrimaryImage,
  verifyItemOwnership
} from "../lib/item-images.js";
import type { ModulePermission } from "@jurnapod/auth";

declare module "hono" {
  interface ContextVariableMap {
    auth: AuthContext;
  }
}

// =============================================================================
// Request Schemas
// =============================================================================

const ImageUpdateSchema = z.object({
  is_primary: z.boolean().optional(),
  sort_order: z.number().int().min(0).optional()
});

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Creates a reusable access check guard for inventory module permissions.
 */
function requireInventoryAccess(permission: ModulePermission): AuthenticatedRouteGuard {
  return requireAccess({
    module: "inventory",
    permission
  });
}

// =============================================================================
// Image Routes
// =============================================================================

const imageRoutes = new Hono();

// Auth middleware
imageRoutes.use("/*", async (c, next) => {
  const authResult = await authenticateRequest(c.req.raw);
  if (!authResult.success) {
    c.status(401);
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Missing or invalid access token" } });
  }
  c.set("auth", authResult.auth);
  await next();
});

// POST /inventory/items/:id/images - Upload image
imageRoutes.post("/:id/images", async (c) => {
  const auth = c.get("auth");

  // Check access permission
  const accessResult = await requireInventoryAccess("create")(c.req.raw, auth);
  if (accessResult !== null) {
    return accessResult;
  }

  // Parse item ID
  const itemIdStr = c.req.param("id");
  const itemIdParse = NumericIdSchema.safeParse(itemIdStr);
  if (!itemIdParse.success) {
    return errorResponse("INVALID_REQUEST", "Invalid item ID", 400);
  }
  const itemId = itemIdParse.data;

// Verify item ownership before upload
    const ownershipCheck = await verifyItemOwnership(itemId, auth.companyId);
    if (!ownershipCheck) {
      return errorResponse("NOT_FOUND", "Item not found", 404);
    }

  try {
    // Parse multipart form data
    const formData = await c.req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return errorResponse("INVALID_REQUEST", "No file provided", 400);
    }

    // Optional variant_id
    const variantIdStr = formData.get("variant_id") as string | null;
    const variantId = variantIdStr ? Number(variantIdStr) : undefined;

    // Optional is_primary (default false)
    const isPrimaryStr = formData.get("is_primary") as string | null;
    const isPrimary = isPrimaryStr === "true" || isPrimaryStr === "1";

    // Read file buffer
    const fileBuffer = Buffer.from(await file.arrayBuffer());

    // Upload image
    const result = await uploadItemImage(
      auth.companyId,
      itemId,
      fileBuffer,
      file.name,
      file.type,
      auth.userId,
      {
        isPrimary,
        variantId
      }
    );

    return successResponse(result, 201);
  } catch (error) {
    console.error("POST /inventory/items/:id/images failed", {
      company_id: auth.companyId,
      item_id: itemId,
      error
    });

    if (error instanceof Error) {
      if (error.message.includes("not found") || error.message.includes("does not belong")) {
        return errorResponse("NOT_FOUND", error.message, 404);
      }
      if (error.message.includes("must be under") || error.message.includes("Only")) {
        return errorResponse("INVALID_REQUEST", error.message, 400);
      }
    }

    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to upload image", 500);
  }
});

// GET /inventory/items/:id/images - List images
imageRoutes.get("/:id/images", async (c) => {
  const auth = c.get("auth");

  // Check access permission
  const accessResult = await requireInventoryAccess("read")(c.req.raw, auth);
  if (accessResult !== null) {
    return accessResult;
  }

  // Parse item ID
  const itemIdStr = c.req.param("id");
  const itemIdParse = NumericIdSchema.safeParse(itemIdStr);
  if (!itemIdParse.success) {
    return errorResponse("INVALID_REQUEST", "Invalid item ID", 400);
  }
  const itemId = itemIdParse.data;

  try {
    const result = await getItemImages(auth.companyId, itemId);
    return successResponse(result);
  } catch (error) {
    console.error("GET /inventory/items/:id/images failed", {
      company_id: auth.companyId,
      item_id: itemId,
      error
    });
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to fetch images", 500);
  }
});

// GET /inventory/items/:id/images/:imageId - Get single image
imageRoutes.get("/:id/images/:imageId", async (c) => {
  const auth = c.get("auth");

  // Check access permission
  const accessResult = await requireInventoryAccess("read")(c.req.raw, auth);
  if (accessResult !== null) {
    return accessResult;
  }

  // Parse IDs
  const itemIdStr = c.req.param("id");
  const itemIdParse = NumericIdSchema.safeParse(itemIdStr);
  if (!itemIdParse.success) {
    return errorResponse("INVALID_REQUEST", "Invalid item ID", 400);
  }
  const itemId = itemIdParse.data;

  const imageIdStr = c.req.param("imageId");
  const imageIdParse = NumericIdSchema.safeParse(imageIdStr);
  if (!imageIdParse.success) {
    return errorResponse("INVALID_REQUEST", "Invalid image ID", 400);
  }
  const imageId = imageIdParse.data;

  try {
    const result = await getImageById(auth.companyId, imageId);

    if (!result) {
      return errorResponse("NOT_FOUND", "Image not found", 404);
    }

    // Verify image belongs to the item
    if (result.item_id !== itemId) {
      return errorResponse("NOT_FOUND", "Image not found for this item", 404);
    }

    return successResponse(result);
  } catch (error) {
    console.error("GET /inventory/items/:id/images/:imageId failed", {
      company_id: auth.companyId,
      item_id: itemId,
      image_id: imageId,
      error
    });
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to fetch image", 500);
  }
});

// PATCH /inventory/items/:id/images/:imageId - Update image metadata
imageRoutes.patch("/:id/images/:imageId", async (c) => {
  const auth = c.get("auth");

  // Check access permission
  const accessResult = await requireInventoryAccess("update")(c.req.raw, auth);
  if (accessResult !== null) {
    return accessResult;
  }

  // Parse IDs
  const itemIdStr = c.req.param("id");
  const itemIdParse = NumericIdSchema.safeParse(itemIdStr);
  if (!itemIdParse.success) {
    return errorResponse("INVALID_REQUEST", "Invalid item ID", 400);
  }
  const itemId = itemIdParse.data;

  const imageIdStr = c.req.param("imageId");
  const imageIdParse = NumericIdSchema.safeParse(imageIdStr);
  if (!imageIdParse.success) {
    return errorResponse("INVALID_REQUEST", "Invalid image ID", 400);
  }
  const imageId = imageIdParse.data;

  // Parse body
  let body: z.infer<typeof ImageUpdateSchema>;
  try {
    const parsed = await c.req.json();
    body = ImageUpdateSchema.parse(parsed);
  } catch {
    return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
  }

  try {
    await updateImage(
      auth.companyId,
      imageId,
      {
        isPrimary: body.is_primary,
        sortOrder: body.sort_order
      },
      auth.userId
    );

    return successResponse({ id: imageId, message: "Image updated" });
  } catch (error) {
    console.error("PATCH /inventory/items/:id/images/:imageId failed", {
      company_id: auth.companyId,
      item_id: itemId,
      image_id: imageId,
      error
    });

    if (error instanceof Error && error.message === "Image not found") {
      return errorResponse("NOT_FOUND", "Image not found", 404);
    }

    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to update image", 500);
  }
});

// DELETE /inventory/items/:id/images/:imageId - Delete image
imageRoutes.delete("/:id/images/:imageId", async (c) => {
  const auth = c.get("auth");

  // Check access permission
  const accessResult = await requireInventoryAccess("delete")(c.req.raw, auth);
  if (accessResult !== null) {
    return accessResult;
  }

  // Parse IDs
  const itemIdStr = c.req.param("id");
  const itemIdParse = NumericIdSchema.safeParse(itemIdStr);
  if (!itemIdParse.success) {
    return errorResponse("INVALID_REQUEST", "Invalid item ID", 400);
  }

  const imageIdStr = c.req.param("imageId");
  const imageIdParse = NumericIdSchema.safeParse(imageIdStr);
  if (!imageIdParse.success) {
    return errorResponse("INVALID_REQUEST", "Invalid image ID", 400);
  }
  const imageId = imageIdParse.data;

  try {
    await deleteImage(auth.companyId, imageId, auth.userId);
    return successResponse({ id: imageId, message: "Image deleted" });
  } catch (error) {
    console.error("DELETE /inventory/items/:id/images/:imageId failed", {
      company_id: auth.companyId,
      image_id: imageId,
      error
    });

    if (error instanceof Error && error.message === "Image not found") {
      return errorResponse("NOT_FOUND", "Image not found", 404);
    }

    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to delete image", 500);
  }
});

// POST /inventory/items/:id/images/:imageId/set-primary - Set as primary
imageRoutes.post("/:id/images/:imageId/set-primary", async (c) => {
  const auth = c.get("auth");

  // Check access permission
  const accessResult = await requireInventoryAccess("update")(c.req.raw, auth);
  if (accessResult !== null) {
    return accessResult;
  }

  // Parse IDs
  const itemIdStr = c.req.param("id");
  const itemIdParse = NumericIdSchema.safeParse(itemIdStr);
  if (!itemIdParse.success) {
    return errorResponse("INVALID_REQUEST", "Invalid item ID", 400);
  }
  const itemId = itemIdParse.data;

  const imageIdStr = c.req.param("imageId");
  const imageIdParse = NumericIdSchema.safeParse(imageIdStr);
  if (!imageIdParse.success) {
    return errorResponse("INVALID_REQUEST", "Invalid image ID", 400);
  }
  const imageId = imageIdParse.data;

  try {
    await setPrimaryImage(auth.companyId, itemId, imageId, auth.userId);
    return successResponse({ id: imageId, message: "Primary image set" });
  } catch (error) {
    console.error("POST /inventory/items/:id/images/:imageId/set-primary failed", {
      company_id: auth.companyId,
      item_id: itemId,
      image_id: imageId,
      error
    });

    if (error instanceof Error && error.message === "Image not found") {
      return errorResponse("NOT_FOUND", "Image not found", 404);
    }

    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to set primary image", 500);
  }
});

// =============================================================================
// OpenAPI Route Registration
// =============================================================================

/**
 * Registers inventory image routes with an OpenAPIHono instance.
 */
export function registerImageRoutes(app: { openapi: OpenAPIHonoType["openapi"] }): void {

  // POST /inventory/items/{id}/images
  const uploadRoute = createRoute({
    path: "/inventory/items/{id}/images",
    method: "post",
    tags: ["Inventory"],
    summary: "Upload item image",
    description: "Upload an image for an item. Supports JPG, PNG, WebP up to 2MB.",
    security: [{ BearerAuth: [] }],
    request: {
      params: zodOpenApi.object({
        id: zodOpenApi.string().openapi({ description: "Item ID" })
      })
    },
    responses: {
      201: { description: "Image uploaded successfully" },
      400: { description: "Invalid request" },
      401: { description: "Unauthorized" },
      500: { description: "Internal server error" }
    }
  });

  // GET /inventory/items/{id}/images
  const listRoute = createRoute({
    path: "/inventory/items/{id}/images",
    method: "get",
    tags: ["Inventory"],
    summary: "List item images",
    description: "Get all images for an item",
    security: [{ BearerAuth: [] }],
    request: {
      params: zodOpenApi.object({
        id: zodOpenApi.string().openapi({ description: "Item ID" })
      })
    },
    responses: {
      200: { description: "Images retrieved successfully" },
      401: { description: "Unauthorized" },
      500: { description: "Internal server error" }
    }
  });

  // GET /inventory/items/{id}/images/{imageId}
  const getRoute = createRoute({
    path: "/inventory/items/{id}/images/{imageId}",
    method: "get",
    tags: ["Inventory"],
    summary: "Get item image",
    description: "Get a single image by ID",
    security: [{ BearerAuth: [] }],
    request: {
      params: zodOpenApi.object({
        id: zodOpenApi.string().openapi({ description: "Item ID" }),
        imageId: zodOpenApi.string().openapi({ description: "Image ID" })
      })
    },
    responses: {
      200: { description: "Image retrieved successfully" },
      401: { description: "Unauthorized" },
      404: { description: "Image not found" },
      500: { description: "Internal server error" }
    }
  });

  // PATCH /inventory/items/{id}/images/{imageId}
  const patchRoute = createRoute({
    path: "/inventory/items/{id}/images/{imageId}",
    method: "patch",
    tags: ["Inventory"],
    summary: "Update image metadata",
    description: "Update image metadata (is_primary, sort_order)",
    security: [{ BearerAuth: [] }],
    request: {
      params: zodOpenApi.object({
        id: zodOpenApi.string().openapi({ description: "Item ID" }),
        imageId: zodOpenApi.string().openapi({ description: "Image ID" })
      }),
      body: {
        content: {
          "application/json": {
            schema: zodOpenApi.object({
              is_primary: zodOpenApi.boolean().optional().openapi({ description: "Set as primary image" }),
              sort_order: zodOpenApi.number().int().min(0).optional().openapi({ description: "Sort order" })
            })
          }
        }
      }
    },
    responses: {
      200: { description: "Image updated successfully" },
      400: { description: "Invalid request" },
      401: { description: "Unauthorized" },
      404: { description: "Image not found" },
      500: { description: "Internal server error" }
    }
  });

  // DELETE /inventory/items/{id}/images/{imageId}
  const deleteRoute = createRoute({
    path: "/inventory/items/{id}/images/{imageId}",
    method: "delete",
    tags: ["Inventory"],
    summary: "Delete image",
    description: "Delete an image and its files within storage",
    security: [{ BearerAuth: [] }],
    request: {
      params: zodOpenApi.object({
        id: zodOpenApi.string().openapi({ description: "Item ID" }),
        imageId: zodOpenApi.string().openapi({ description: "Image ID" })
      })
    },
    responses: {
      200: { description: "Image deleted successfully" },
      401: { description: "Unauthorized" },
      404: { description: "Image not found" },
      500: { description: "Internal server error" }
    }
  });

  // POST /inventory/items/{id}/images/{imageId}/set-primary
  const setPrimaryRoute = createRoute({
    path: "/inventory/items/{id}/images/{imageId}/set-primary",
    method: "post",
    tags: ["Inventory"],
    summary: "Set image as primary",
    description: "Set an image as the primary image for an item",
    security: [{ BearerAuth: [] }],
    request: {
      params: zodOpenApi.object({
        id: zodOpenApi.string().openapi({ description: "Item ID" }),
        imageId: zodOpenApi.string().openapi({ description: "Image ID" })
      })
    },
    responses: {
      200: { description: "Primary image set successfully" },
      401: { description: "Unauthorized" },
      404: { description: "Image not found" },
      500: { description: "Internal server error" }
    }
  });

  // Register routes
  app.openapi(uploadRoute, async (c) => {
    const auth = c.get("auth");
    const itemIdStr = c.req.param("id");
    const itemIdParse = NumericIdSchema.safeParse(itemIdStr);
    if (!itemIdParse.success) {
      return errorResponse("INVALID_REQUEST", "Invalid item ID", 400);
    }
    const itemId = itemIdParse.data;

    // Verify item ownership before upload
    const ownershipCheck = await verifyItemOwnership(itemId, auth.companyId);
    if (!ownershipCheck) {
      return errorResponse("NOT_FOUND", "Item not found", 404);
    }

    try {
      const formData = await c.req.formData();
      const file = formData.get("file") as File | null;
      if (!file) {
        return errorResponse("INVALID_REQUEST", "No file provided", 400);
      }

      const variantIdStr = formData.get("variant_id") as string | null;
      const variantId = variantIdStr ? Number(variantIdStr) : undefined;
      const isPrimaryStr = formData.get("is_primary") as string | null;
      const isPrimary = isPrimaryStr === "true" || isPrimaryStr === "1";

      const fileBuffer = Buffer.from(await file.arrayBuffer());
      const result = await uploadItemImage(
        auth.companyId,
        itemId,
        fileBuffer,
        file.name,
        file.type,
        auth.userId,
        { isPrimary, variantId }
      );

      return successResponse(result, 201);
    } catch (error) {
      console.error("POST /inventory/items/:id/images failed", {
        company_id: auth.companyId,
        item_id: itemId,
        error
      });

      if (error instanceof Error) {
        if (error.message.includes("not found") || error.message.includes("does not belong")) {
          return errorResponse("NOT_FOUND", error.message, 404);
        }
        if (error.message.includes("must be under") || error.message.includes("Only")) {
          return errorResponse("INVALID_REQUEST", error.message, 400);
        }
      }

      return errorResponse("INTERNAL_SERVER_ERROR", "Failed to upload image", 500);
    }
  });

  app.openapi(listRoute, async (c) => {
    const auth = c.get("auth");
    const itemIdStr = c.req.param("id");
    const itemIdParse = NumericIdSchema.safeParse(itemIdStr);
    if (!itemIdParse.success) {
      return errorResponse("INVALID_REQUEST", "Invalid item ID", 400);
    }
    const itemId = itemIdParse.data;

    try {
      const result = await getItemImages(auth.companyId, itemId);
      return successResponse(result);
    } catch (error) {
      console.error("GET /inventory/items/:id/images failed", {
        company_id: auth.companyId,
        item_id: itemId,
        error
      });
      return errorResponse("INTERNAL_SERVER_ERROR", "Failed to fetch images", 500);
    }
  });

  app.openapi(getRoute, async (c) => {
    const auth = c.get("auth");
    const itemIdStr = c.req.param("id");
    const itemIdParse = NumericIdSchema.safeParse(itemIdStr);
    if (!itemIdParse.success) {
      return errorResponse("INVALID_REQUEST", "Invalid item ID", 400);
    }
    const imageIdStr = c.req.param("imageId");
    const imageIdParse = NumericIdSchema.safeParse(imageIdStr);
    if (!imageIdParse.success) {
      return errorResponse("INVALID_REQUEST", "Invalid image ID", 400);
    }
    const imageId = imageIdParse.data;

    try {
      const result = await getImageById(auth.companyId, imageId);
      if (!result) {
        return errorResponse("NOT_FOUND", "Image not found", 404);
      }
      if (result.item_id !== itemIdParse.data) {
        return errorResponse("NOT_FOUND", "Image not found for this item", 404);
      }
      return successResponse(result);
    } catch (error) {
      console.error("GET /inventory/items/:id/images/:imageId failed", {
        company_id: auth.companyId,
        image_id: imageId,
        error
      });
      return errorResponse("INTERNAL_SERVER_ERROR", "Failed to fetch image", 500);
    }
  });

  app.openapi(patchRoute, async (c) => {
    const auth = c.get("auth");
    const itemIdStr = c.req.param("id");
    const itemIdParse = NumericIdSchema.safeParse(itemIdStr);
    if (!itemIdParse.success) {
      return errorResponse("INVALID_REQUEST", "Invalid item ID", 400);
    }
    const imageIdStr = c.req.param("imageId");
    const imageIdParse = NumericIdSchema.safeParse(imageIdStr);
    if (!imageIdParse.success) {
      return errorResponse("INVALID_REQUEST", "Invalid image ID", 400);
    }
    const imageId = imageIdParse.data;

    let body: z.infer<typeof ImageUpdateSchema>;
    try {
      const parsed = await c.req.json();
      body = ImageUpdateSchema.parse(parsed);
    } catch {
      return errorResponse("INVALID_REQUEST", "Invalid request body", 400);
    }

    try {
      await updateImage(
        auth.companyId,
        imageId,
        { isPrimary: body.is_primary, sortOrder: body.sort_order },
        auth.userId
      );
      return successResponse({ id: imageId, message: "Image updated" });
    } catch (error) {
      console.error("PATCH /inventory/items/:id/images/:imageId failed", {
        company_id: auth.companyId,
        image_id: imageId,
        error
      });
      if (error instanceof Error && error.message === "Image not found") {
        return errorResponse("NOT_FOUND", "Image not found", 404);
      }
      return errorResponse("INTERNAL_SERVER_ERROR", "Failed to update image", 500);
    }
  });

  app.openapi(deleteRoute, async (c) => {
    const auth = c.get("auth");
    const imageIdStr = c.req.param("imageId");
    const imageIdParse = NumericIdSchema.safeParse(imageIdStr);
    if (!imageIdParse.success) {
      return errorResponse("INVALID_REQUEST", "Invalid image ID", 400);
    }
    const imageId = imageIdParse.data;

    try {
      await deleteImage(auth.companyId, imageId, auth.userId);
      return successResponse({ id: imageId, message: "Image deleted" });
    } catch (error) {
      console.error("DELETE /inventory/items/:id/images/:imageId failed", {
        company_id: auth.companyId,
        image_id: imageId,
        error
      });
      if (error instanceof Error && error.message === "Image not found") {
        return errorResponse("NOT_FOUND", "Image not found", 404);
      }
      return errorResponse("INTERNAL_SERVER_ERROR", "Failed to delete image", 500);
    }
  });

  app.openapi(setPrimaryRoute, async (c) => {
    const auth = c.get("auth");
    const itemIdStr = c.req.param("id");
    const itemIdParse = NumericIdSchema.safeParse(itemIdStr);
    if (!itemIdParse.success) {
      return errorResponse("INVALID_REQUEST", "Invalid item ID", 400);
    }
    const itemId = itemIdParse.data;
    const imageIdStr = c.req.param("imageId");
    const imageIdParse = NumericIdSchema.safeParse(imageIdStr);
    if (!imageIdParse.success) {
      return errorResponse("INVALID_REQUEST", "Invalid image ID", 400);
    }
    const imageId = imageIdParse.data;

    try {
      await setPrimaryImage(auth.companyId, itemId, imageId, auth.userId);
      return successResponse({ id: imageId, message: "Primary image set" });
    } catch (error) {
      console.error("POST /inventory/items/:id/images/:imageId/set-primary failed", {
        company_id: auth.companyId,
        image_id: imageId,
        error
      });
      if (error instanceof Error && error.message === "Image not found") {
        return errorResponse("NOT_FOUND", "Image not found", 404);
      }
      return errorResponse("INTERNAL_SERVER_ERROR", "Failed to set primary image", 500);
    }
  });
}

export { imageRoutes };
