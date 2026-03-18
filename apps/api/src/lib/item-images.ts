// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import sharp from "sharp";
import { getDbPool } from "./db";
import type { RowDataPacket, ResultSetHeader } from "mysql2";
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
  pool: ReturnType<typeof getDbPool>,
  itemId: number,
  companyId: number
): Promise<boolean> {
  const [rows] = await pool.execute<RowDataPacket[]>(
    "SELECT company_id FROM items WHERE id = ?",
    [itemId]
  );

  if (rows.length === 0) {
    return false;
  }

  const actualCompanyId = rows[0].company_id;
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
  const pool = getDbPool();
  const storage = createStorageProvider();

  // Verify tenant ownership of item before proceeding
  const itemExists = await verifyItemOwnership(pool, itemId, companyId);
  if (!itemExists) {
    throw new Error(`Item ${itemId} not found`);
  }

  // If variant_id is provided, verify it belongs to this item and company
  if (options?.variantId) {
    const [variantRows] = await pool.execute<RowDataPacket[]>(
      `SELECT v.id, v.item_id, i.company_id
       FROM item_variants v
       JOIN items i ON v.item_id = i.id
       WHERE v.id = ? AND i.company_id = ?`,
      [options.variantId, companyId]
    );

    if (variantRows.length === 0) {
      throw new Error(`Variant ${options.variantId} not found or does not belong to company ${companyId}`);
    }

    if (variantRows[0].item_id !== itemId) {
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
    await pool.execute(
      `UPDATE item_images 
       SET is_primary = FALSE 
       WHERE company_id = ? AND item_id = ?`,
      [companyId, itemId]
    );
  }

  // Get next sort order
  const [sortRows] = await pool.execute<RowDataPacket[]>(
    `SELECT COALESCE(MAX(sort_order), 0) + 1 as next_order 
     FROM item_images 
     WHERE company_id = ? AND item_id = ?`,
    [companyId, itemId]
  );
  const sortOrder = sortRows[0]?.next_order || 1;

  // Insert record
  const [result] = await pool.execute<ResultSetHeader>(
    `INSERT INTO item_images (
       company_id, item_id, variant_id, file_name,
       original_url, large_url, medium_url, thumbnail_url,
       file_size_bytes, mime_type, width_pixels, height_pixels,
       is_primary, sort_order, uploaded_by
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      companyId,
      itemId,
      options?.variantId || null,
      fileName,
      originalUrl,
      largeUrl,
      mediumUrl,
      thumbnailUrl,
      fileBuffer.length,
      mimeType,
      processed.width,
      processed.height,
      options?.isPrimary || false,
      sortOrder,
      uploadedBy
    ]
  );

  // Log audit
  await pool.execute(
    `INSERT INTO audit_logs (
       company_id, outlet_id, user_id, action, result, success, ip_address, payload_json
     ) VALUES (?, NULL, ?, ?, 'SUCCESS', 1, NULL, ?)`,
    [
      companyId,
      uploadedBy,
      'ITEM_IMAGE_UPLOAD',
      JSON.stringify({
        item_id: itemId,
        image_id: result.insertId,
        file_name: fileName
      })
    ]
  );

  return {
    id: result.insertId,
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
  const pool = getDbPool();

  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT id, file_name, original_url, large_url, medium_url, thumbnail_url,
            width_pixels, height_pixels, file_size_bytes, is_primary, sort_order, created_at
     FROM item_images
     WHERE company_id = ? AND item_id = ?
     ORDER BY is_primary DESC, sort_order ASC, created_at DESC`,
    [companyId, itemId]
  );

  return {
    images: rows.map(row => ({
      id: row.id,
      file_name: row.file_name,
      original_url: row.original_url,
      large_url: row.large_url,
      medium_url: row.medium_url,
      thumbnail_url: row.thumbnail_url,
      width_pixels: row.width_pixels,
      height_pixels: row.height_pixels,
      file_size_bytes: row.file_size_bytes,
      is_primary: row.is_primary === 1,
      sort_order: row.sort_order,
      created_at: row.created_at
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
  const pool = getDbPool();

  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT thumbnail_url
     FROM item_images
     WHERE company_id = ? AND item_id = ? AND is_primary = TRUE
     LIMIT 1`,
    [companyId, itemId]
  );

  return rows[0]?.thumbnail_url || null;
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

  const pool = getDbPool();
  const placeholders = itemIds.map(() => "?").join(", ");

  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT item_id, thumbnail_url
     FROM item_images
     WHERE company_id = ? AND item_id IN (${placeholders}) AND is_primary = TRUE`,
    [companyId, ...itemIds]
  );

  const thumbnailMap = new Map<number, string>();
  for (const row of rows as Array<{ item_id: number; thumbnail_url: string }>) {
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
  const pool = getDbPool();

  // Get image details
  const [imageRows] = await pool.execute<RowDataPacket[]>(
    `SELECT item_id FROM item_images WHERE id = ? AND company_id = ?`,
    [imageId, companyId]
  );

  if (imageRows.length === 0) {
    throw new Error("Image not found");
  }

  const itemId = imageRows[0].item_id;

  // Verify tenant ownership of item before updating
  await verifyItemOwnership(pool, itemId, companyId);

  // Build update
  const updateFields: string[] = [];
  const values: (number | boolean)[] = [];

  if (updates.isPrimary !== undefined) {
    updateFields.push("is_primary = ?");
    values.push(updates.isPrimary);

    // If setting as primary, unset others
    if (updates.isPrimary) {
      await pool.execute(
        `UPDATE item_images 
         SET is_primary = FALSE 
         WHERE company_id = ? AND item_id = ? AND id != ?`,
        [companyId, itemId, imageId]
      );
    }
  }

  if (updates.sortOrder !== undefined) {
    // TODO: Implement atomic swap/resequence for robust reordering
    // Current: single-row update can create duplicate sort_order values
    // Future: transaction-based swap or full resequence for stable ordering
    updateFields.push("sort_order = ?");
    values.push(updates.sortOrder);
  }

  if (updateFields.length === 0) {
    return;
  }

  values.push(imageId, companyId);

  const [result] = await pool.execute<ResultSetHeader>(
    `UPDATE item_images SET ${updateFields.join(', ')} WHERE id = ? AND company_id = ?`,
    values
  );

  if (result.affectedRows === 0) {
    throw new Error("Image not found or no changes made");
  }

  // Log audit
  await pool.execute(
    `INSERT INTO audit_logs (
       company_id, outlet_id, user_id, action, result, success, ip_address, payload_json
     ) VALUES (?, NULL, ?, ?, 'SUCCESS', 1, NULL, ?)`,
    [
      companyId,
      userId,
      'ITEM_IMAGE_UPDATE',
      JSON.stringify({
        image_id: imageId,
        item_id: itemId,
        updates
      })
    ]
  );
}

/**
 * Delete an image
 */
export async function deleteImage(
  companyId: number,
  imageId: number,
  userId: number
): Promise<void> {
  const pool = getDbPool();
  const storage = createStorageProvider();

  // Get image details
  const [imageRows] = await pool.execute<RowDataPacket[]>(
    `SELECT original_url, large_url, medium_url, thumbnail_url, item_id
     FROM item_images 
     WHERE id = ? AND company_id = ?`,
    [imageId, companyId]
  );

  if (imageRows.length === 0) {
    throw new Error("Image not found");
  }

  const image = imageRows[0];

  // Verify tenant ownership of item before deleting
  await verifyItemOwnership(pool, image.item_id, companyId);

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
  const [result] = await pool.execute<ResultSetHeader>(
    `DELETE FROM item_images WHERE id = ? AND company_id = ?`,
    [imageId, companyId]
  );

  if (result.affectedRows === 0) {
    throw new Error("Image not found");
  }

  // Log audit
  await pool.execute(
    `INSERT INTO audit_logs (
       company_id, outlet_id, user_id, action, result, success, ip_address, payload_json
     ) VALUES (?, NULL, ?, ?, 'SUCCESS', 1, NULL, ?)`,
    [
      companyId,
      userId,
      'ITEM_IMAGE_DELETE',
      JSON.stringify({
        image_id: imageId,
        item_id: image.item_id
      })
    ]
  );
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
  const pool = getDbPool();

  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT id, item_id, file_name, original_url, large_url, medium_url, thumbnail_url,
            width_pixels, height_pixels, file_size_bytes, is_primary, sort_order, created_at
     FROM item_images
     WHERE id = ? AND company_id = ?`,
    [imageId, companyId]
  );

  if (rows.length === 0) {
    return null;
  }

  const row = rows[0];
  return {
    id: row.id,
    item_id: row.item_id,
    file_name: row.file_name,
    original_url: row.original_url,
    large_url: row.large_url,
    medium_url: row.medium_url,
    thumbnail_url: row.thumbnail_url,
    width_pixels: row.width_pixels,
    height_pixels: row.height_pixels,
    file_size_bytes: row.file_size_bytes,
    is_primary: row.is_primary === 1,
    sort_order: row.sort_order,
    created_at: row.created_at
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
