// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Item Images Library — thin delegator to item-image adapter.
 *
 * Public API unchanged; all business logic delegated to adapter.
 */

import type { UploadImageResponse, ItemImagesResponse } from "@jurnapod/shared";
import { getDb } from "./db.js";
import {
  uploadItemImageAdapter,
  deleteItemImageAdapter,
  updateItemImageAdapter,
  setPrimaryItemImageAdapter,
} from "./uploader/adapters/item-image-adapter.js";

// =============================================================================
// Error Types
// =============================================================================

/**
 * Custom error for cross-tenant access attempts
 */
export class CrossTenantAccessError extends Error {
  constructor(message: string = "Cross-tenant access forbidden") {
    super(message);
    this.name = "CrossTenantAccessError";
  }
}

// =============================================================================
// Ownership Verification
// =============================================================================

/**
 * Verify that an item belongs to the specified company (tenant ownership check).
 * @returns true if item exists and belongs to company
 * @throws CrossTenantAccessError if item belongs to a different company
 */
export async function verifyItemOwnership(
  itemId: number,
  companyId: number
): Promise<boolean> {
  const db = getDb();
  const row = await db
    .selectFrom("items")
    .where("id", "=", itemId)
    .select(["company_id"])
    .executeTakeFirst();

  if (!row) {
    return false;
  }

  const actualCompanyId = (row as { company_id: number }).company_id;
  if (actualCompanyId !== companyId) {
    throw new CrossTenantAccessError(
      `Item ${itemId} belongs to company ${actualCompanyId}, not ${companyId}`
    );
  }

  return true;
}

// =============================================================================
// Upload (delegates to adapter)
// =============================================================================

/**
 * Upload an image for an item.
 *
 * Delegates to uploadItemImageAdapter and translates the result to the
 * expected UploadImageResponse shape.
 */
export async function uploadItemImage(
  companyId: number,
  itemId: number,
  fileBuffer: Buffer,
  fileName: string,
  mimeType: string,
  uploadedBy: number,
  options?: {
    isPrimary?: boolean;
    variantId?: number;
  }
): Promise<UploadImageResponse> {
  const adapterResult = await uploadItemImageAdapter(
    companyId,
    itemId,
    uploadedBy,
    fileBuffer,
    fileName,
    mimeType,
    options
  );

  // Translate adapter result to public API shape
  return {
    id: adapterResult.id,
    item_id: itemId,
    file_name: fileName,
    original_url: adapterResult.urls["original"] ?? "",
    large_url: adapterResult.urls["large"] ?? "",
    medium_url: adapterResult.urls["medium"] ?? "",
    thumbnail_url: adapterResult.urls["thumbnail"] ?? "",
    width_pixels: adapterResult.metadata.dimensions?.width ?? 0,
    height_pixels: adapterResult.metadata.dimensions?.height ?? 0,
    is_primary: options?.isPrimary ?? false,
  };
}

// =============================================================================
// Delete (delegates to adapter)
// =============================================================================

/**
 * Delete an image.
 */
export async function deleteImage(
  companyId: number,
  imageId: number,
  userId: number
): Promise<void> {
  return deleteItemImageAdapter(companyId, imageId, userId);
}

// =============================================================================
// Update (delegates to adapter)
// =============================================================================

/**
 * Update image metadata (primary status, sort order).
 */
export async function updateImage(
  companyId: number,
  imageId: number,
  updates: {
    isPrimary?: boolean;
    sortOrder?: number;
  },
  userId: number
): Promise<void> {
  return updateItemImageAdapter(companyId, imageId, updates, userId);
}

// =============================================================================
// Set Primary (delegates to adapter)
// =============================================================================

/**
 * Set an image as primary for an item.
 */
export async function setPrimaryImage(
  companyId: number,
  itemId: number,
  imageId: number,
  userId: number
): Promise<void> {
  return setPrimaryItemImageAdapter(companyId, itemId, imageId, userId);
}

// =============================================================================
// Read-only functions (no delegation needed)
// =============================================================================

/**
 * Get all images for an item.
 */
export async function getItemImages(
  companyId: number,
  itemId: number
): Promise<ItemImagesResponse> {
  const db = getDb();

  const rows = await db
    .selectFrom("item_images")
    .where("company_id", "=", companyId)
    .where("item_id", "=", itemId)
    .orderBy("is_primary", "desc")
    .orderBy("sort_order", "asc")
    .orderBy("created_at", "desc")
    .select([
      "id",
      "file_name",
      "original_url",
      "large_url",
      "medium_url",
      "thumbnail_url",
      "width_pixels",
      "height_pixels",
      "file_size_bytes",
      "is_primary",
      "sort_order",
      "created_at",
    ])
    .execute();

  return {
    images: rows.map((row) => ({
      id: row.id,
      file_name: row.file_name,
      original_url: row.original_url!,
      large_url: row.large_url!,
      medium_url: row.medium_url!,
      thumbnail_url: row.thumbnail_url!,
      width_pixels: row.width_pixels!,
      height_pixels: row.height_pixels!,
      file_size_bytes: row.file_size_bytes,
      is_primary: row.is_primary === 1,
      sort_order: row.sort_order!,
      created_at: (row.created_at as Date).toISOString(),
    })),
  };
}

/**
 * Get a single image by ID.
 */
export async function getImageById(
  companyId: number,
  imageId: number
): Promise<{
  id: number;
  item_id: number;
  file_name: string;
  original_url: string;
  large_url: string;
  medium_url: string;
  thumbnail_url: string;
  width_pixels: number;
  height_pixels: number;
  file_size_bytes: number;
  is_primary: boolean;
  sort_order: number;
  created_at: string;
} | null> {
  const db = getDb();

  const row = await db
    .selectFrom("item_images")
    .where("id", "=", imageId)
    .where("company_id", "=", companyId)
    .select([
      "id",
      "item_id",
      "file_name",
      "original_url",
      "large_url",
      "medium_url",
      "thumbnail_url",
      "width_pixels",
      "height_pixels",
      "file_size_bytes",
      "is_primary",
      "sort_order",
      "created_at",
    ])
    .executeTakeFirst();

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    item_id: row.item_id,
    file_name: row.file_name,
    original_url: row.original_url!,
    large_url: row.large_url!,
    medium_url: row.medium_url!,
    thumbnail_url: row.thumbnail_url!,
    width_pixels: row.width_pixels!,
    height_pixels: row.height_pixels!,
    file_size_bytes: row.file_size_bytes,
    is_primary: row.is_primary === 1,
    sort_order: row.sort_order!,
    created_at: (row.created_at as Date).toISOString(),
  };
}
