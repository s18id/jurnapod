// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import sharp from "sharp";
import { sql } from "kysely";
import { getDb } from "./db";
import type { UploadImageResponse, ItemImagesResponse } from "@jurnapod/shared";
import { createStorageProvider, generateFileKey, type StorageProvider } from "./image-storage";

/**
 * Custom error for cross-tenant access attempts
 */
export class CrossTenantAccessError extends Error {
  constructor(message: string = "Cross-tenant access forbidden") {
    super(message);
    this.name = "CrossTenantAccessError";
  }
}

/**
 * Verify that an item belongs to the specified company (tenant ownership check).
 * @returns true if item exists and belongs to company
 * @throws CrossTenantAccessError if item belongs to a different company
 */
export async function verifyItemOwnership(
  db: ReturnType<typeof getDb>,
  itemId: number,
  companyId: number
): Promise<boolean> {
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

/**
 * Allowed image MIME types
 */
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * Maximum file size: 5MB
 */
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

/**
 * Image size configurations
 */
const IMAGE_SIZES = {
  large: { width: 800, height: 800, quality: 85 },
  medium: { width: 400, height: 400, quality: 80 },
  thumbnail: { width: 100, height: 100, quality: 75 }
};

/**
 * Processed image buffers and metadata
 */
interface ProcessedImage {
  original: Buffer;
  large: Buffer;
  medium: Buffer;
  thumbnail: Buffer;
  width: number;
  height: number;
  mimeType: string;
}

/**
 * Validate image file
 */
export function validateImageUpload(
  buffer: Buffer,
  mimeType: string
): { valid: boolean; error?: string } {
  // Check file size
  if (buffer.length > MAX_FILE_SIZE_BYTES) {
    return {
      valid: false,
      error: `Image must be under 5MB. Received: ${(buffer.length / 1024 / 1024).toFixed(2)}MB`
    };
  }

  // Check MIME type
  if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
    return {
      valid: false,
      error: `Only JPG, PNG, WebP images supported. Received: ${mimeType}`
    };
  }

  return { valid: true };
}

/**
 * Process image with Sharp - generate multiple sizes
 */
export async function processImage(
  buffer: Buffer,
  mimeType: string
): Promise<ProcessedImage> {
  const sharpInstance = sharp(buffer);
  const metadata = await sharpInstance.metadata();

  // Determine output format based on input
  const format = mimeType === 'image/png' ? 'png' : 'jpeg';

  // Process each size
  const [large, medium, thumbnail] = await Promise.all([
    // Large: 800x800 max, fit inside
    sharpInstance
      .clone()
      .resize(IMAGE_SIZES.large.width, IMAGE_SIZES.large.height, {
        fit: 'inside',
        withoutEnlargement: true
      })
      .toFormat(format, { quality: IMAGE_SIZES.large.quality })
      .toBuffer(),

    // Medium: 400x400 max, fit inside
    sharpInstance
      .clone()
      .resize(IMAGE_SIZES.medium.width, IMAGE_SIZES.medium.height, {
        fit: 'inside',
        withoutEnlargement: true
      })
      .toFormat(format, { quality: IMAGE_SIZES.medium.quality })
      .toBuffer(),

    // Thumbnail: 100x100, cover (crop to fill)
    sharpInstance
      .clone()
      .resize(IMAGE_SIZES.thumbnail.width, IMAGE_SIZES.thumbnail.height, {
        fit: 'cover'
      })
      .toFormat(format, { quality: IMAGE_SIZES.thumbnail.quality })
      .toBuffer()
  ]);

  return {
    original: buffer,
    large,
    medium,
    thumbnail,
    width: metadata.width || 0,
    height: metadata.height || 0,
    mimeType
  };
}

/**
 * Upload an image for an item
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
  const db = getDb();
  const storage = createStorageProvider();

  // Verify tenant ownership of item before proceeding
  const itemExists = await verifyItemOwnership(db, itemId, companyId);
  if (!itemExists) {
    throw new Error(`Item ${itemId} not found`);
  }

  // If variant_id is provided, verify it belongs to this item and company
  if (options?.variantId) {
    const variantRow = await db
      .selectFrom("item_variants as v")
      .innerJoin("items as i", "i.id", "v.item_id")
      .where("v.id", "=", options.variantId)
      .where("i.company_id", "=", companyId)
      .select(["v.id", "v.item_id"])
      .executeTakeFirst();

    if (!variantRow) {
      throw new Error(`Variant ${options.variantId} not found or does not belong to company ${companyId}`);
    }

    if ((variantRow as { item_id: number }).item_id !== itemId) {
      throw new Error(`Variant ${options.variantId} does not belong to item ${itemId}`);
    }
  }

  // Validate
  const validation = validateImageUpload(fileBuffer, mimeType);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  // Process image
  const processed = await processImage(fileBuffer, mimeType);

  // Generate storage keys
  const originalKey = generateFileKey(companyId, itemId, fileName, 'original');
  const largeKey = generateFileKey(companyId, itemId, fileName, 'large');
  const mediumKey = generateFileKey(companyId, itemId, fileName, 'medium');
  const thumbnailKey = generateFileKey(companyId, itemId, fileName, 'thumbnail');

  // Store all sizes
  const [originalUrl, largeUrl, mediumUrl, thumbnailUrl] = await Promise.all([
    storage.store(originalKey, processed.original, mimeType),
    storage.store(largeKey, processed.large, mimeType),
    storage.store(mediumKey, processed.medium, mimeType),
    storage.store(thumbnailKey, processed.thumbnail, mimeType)
  ]);

  // If setting as primary, unset any existing primary
  if (options?.isPrimary) {
    await sql`
      UPDATE item_images 
      SET is_primary = FALSE 
      WHERE company_id = ${companyId} AND item_id = ${itemId}
    `.execute(db);
  }

  // Get next sort order
  const sortRow = await sql`
    SELECT COALESCE(MAX(sort_order), 0) + 1 as next_order 
    FROM item_images 
    WHERE company_id = ${companyId} AND item_id = ${itemId}
  `.execute(db);
  const sortOrder = (sortRow.rows[0] as { next_order: number })?.next_order || 1;

  // Insert record
  const insertResult = await sql`
    INSERT INTO item_images (
       company_id, item_id, variant_id, file_name,
       original_url, large_url, medium_url, thumbnail_url,
       file_size_bytes, mime_type, width_pixels, height_pixels,
       is_primary, sort_order, uploaded_by
     ) VALUES (
       ${companyId}, ${itemId}, ${options?.variantId || null}, ${fileName},
       ${originalUrl}, ${largeUrl}, ${mediumUrl}, ${thumbnailUrl},
       ${fileBuffer.length}, ${mimeType}, ${processed.width}, ${processed.height},
       ${options?.isPrimary || false}, ${sortOrder}, ${uploadedBy}
     )
  `.execute(db);

  // Log audit
  await sql`
    INSERT INTO audit_logs (
       company_id, outlet_id, user_id, action, result, success, ip_address, payload_json
     ) VALUES (${companyId}, NULL, ${uploadedBy}, 'ITEM_IMAGE_UPLOAD', 'SUCCESS', 1, NULL, ${JSON.stringify({
       item_id: itemId,
       image_id: insertResult.insertId,
       file_name: fileName
     })})
  `.execute(db);

  return {
    id: Number(insertResult.insertId),
    item_id: itemId,
    file_name: fileName,
    original_url: originalUrl,
    large_url: largeUrl,
    medium_url: mediumUrl,
    thumbnail_url: thumbnailUrl,
    width_pixels: processed.width,
    height_pixels: processed.height,
    is_primary: options?.isPrimary || false
  };
}

/**
 * Get all images for an item
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
      "created_at"
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
      created_at: (row.created_at as Date).toISOString()
    }))
  };
}

/**
 * Get primary image for an item (thumbnail URL only)
 */
export async function getItemThumbnail(
  companyId: number,
  itemId: number
): Promise<string | null> {
  const db = getDb();

  const row = await db
    .selectFrom("item_images")
    .where("company_id", "=", companyId)
    .where("item_id", "=", itemId)
    .where("is_primary", "=", 1)
    .select(["thumbnail_url"])
    .executeTakeFirst();

  return (row as { thumbnail_url: string | null } | undefined)?.thumbnail_url || null;
}

/**
 * Get primary thumbnails for multiple items in a single query
 * Returns a map of item_id -> thumbnail_url for items that have primary images
 */
export async function getItemThumbnailsBatch(
  companyId: number,
  itemIds: number[]
): Promise<Map<number, string>> {
  if (itemIds.length === 0) {
    return new Map();
  }

  const db = getDb();
  
  const rows = await sql<{ item_id: number; thumbnail_url: string }>`
    SELECT item_id, thumbnail_url
    FROM item_images
    WHERE company_id = ${companyId} AND item_id IN (${sql.join(itemIds.map(id => sql`${id}`))}) AND is_primary = TRUE
  `.execute(db);

  const thumbnailMap = new Map<number, string>();
  for (const row of rows.rows) {
    thumbnailMap.set(row.item_id, row.thumbnail_url);
  }

  return thumbnailMap;
}

/**
 * Update image metadata (primary status, sort order)
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
  const db = getDb();

  // Get image details
  const imageRow = await db
    .selectFrom("item_images")
    .where("id", "=", imageId)
    .where("company_id", "=", companyId)
    .select(["item_id"])
    .executeTakeFirst();

  if (!imageRow) {
    throw new Error("Image not found");
  }

  const itemId = (imageRow as { item_id: number }).item_id;

  // Verify tenant ownership of item before updating
  await verifyItemOwnership(db, itemId, companyId);

  // Build update
  const updateFields: Array<{ field: string; value: unknown }> = [];

  if (updates.isPrimary !== undefined) {
    updateFields.push({ field: "is_primary", value: updates.isPrimary });

    // If setting as primary, unset others
    if (updates.isPrimary) {
      await sql`
        UPDATE item_images 
        SET is_primary = FALSE 
        WHERE company_id = ${companyId} AND item_id = ${itemId} AND id != ${imageId}
      `.execute(db);
    }
  }

  if (updates.sortOrder !== undefined) {
    // TODO: Implement atomic swap/resequence for robust reordering
    // Current: single-row update can create duplicate sort_order values
    // Future: transaction-based swap or full resequence for stable ordering
    updateFields.push({ field: "sort_order", value: updates.sortOrder });
  }

  if (updateFields.length === 0) {
    return;
  }

  // Execute update using Kysely query builder
  if (updates.isPrimary !== undefined) {
    await db
      .updateTable("item_images")
      .set({ is_primary: updates.isPrimary ? 1 : 0 })
      .where("id", "=", imageId)
      .where("company_id", "=", companyId)
      .execute();
  }

  if (updates.sortOrder !== undefined) {
    await db
      .updateTable("item_images")
      .set({ sort_order: updates.sortOrder })
      .where("id", "=", imageId)
      .where("company_id", "=", companyId)
      .execute();
  }

  // Log audit
  await sql`
    INSERT INTO audit_logs (
       company_id, outlet_id, user_id, action, result, success, ip_address, payload_json
     ) VALUES (${companyId}, NULL, ${userId}, 'ITEM_IMAGE_UPDATE', 'SUCCESS', 1, NULL, ${JSON.stringify({
       image_id: imageId,
       item_id: itemId,
       updates
     })})
  `.execute(db);
}

/**
 * Delete an image
 */
export async function deleteImage(
  companyId: number,
  imageId: number,
  userId: number
): Promise<void> {
  const db = getDb();
  const storage = createStorageProvider();

  // Get image details
  const imageRow = await db
    .selectFrom("item_images")
    .where("id", "=", imageId)
    .where("company_id", "=", companyId)
    .select(["original_url", "large_url", "medium_url", "thumbnail_url", "item_id"])
    .executeTakeFirst();

  if (!imageRow) {
    throw new Error("Image not found");
  }

  const image = imageRow as {
    original_url: string;
    large_url: string;
    medium_url: string;
    thumbnail_url: string;
    item_id: number;
  };

  // Verify tenant ownership of item before deleting
  await verifyItemOwnership(db, image.item_id, companyId);

  // Delete from storage (extract keys from URLs)
  const urlToKey = (url: string): string | null => {
    const baseUrl = process.env.UPLOAD_URL || '/uploads';
    if (url.startsWith(baseUrl)) {
      return url.substring(baseUrl.length + 1);
    }
    return null;
  };

  const keys = [
    urlToKey(image.original_url),
    urlToKey(image.large_url),
    urlToKey(image.medium_url),
    urlToKey(image.thumbnail_url)
  ].filter((k): k is string => k !== null);

  await Promise.all(keys.map(key => storage.delete(key)));

  // Delete from database
  const result = await sql`
    DELETE FROM item_images WHERE id = ${imageId} AND company_id = ${companyId}
  `.execute(db);

  if (result.numAffectedRows === BigInt(0)) {
    throw new Error("Image not found");
  }

  // Log audit
  await sql`
    INSERT INTO audit_logs (
       company_id, outlet_id, user_id, action, result, success, ip_address, payload_json
     ) VALUES (${companyId}, NULL, ${userId}, 'ITEM_IMAGE_DELETE', 'SUCCESS', 1, NULL, ${JSON.stringify({
       image_id: imageId,
       item_id: image.item_id
     })})
  `.execute(db);
}

/**
 * Get a single image by ID
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
      "created_at"
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
    created_at: (row.created_at as Date).toISOString()
  };
}

/**
 * Set an image as primary for an item
 */
export async function setPrimaryImage(
  companyId: number,
  itemId: number,
  imageId: number,
  userId: number
): Promise<void> {
  await updateImage(companyId, imageId, { isPrimary: true }, userId);
}
