// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Item Image Adapter — wraps generic uploader with item_images table operations.
 *
 * Orchestrates:
 * 1. uploadFile() (generic uploader) → store files
 * 2. DB insert into item_images
 * 3. Transactional cleanup on DB failure
 */

import { uploadFile, deleteFile } from '../index.js';
import type { UploadMetadata, ResizeConfig } from '../types.js';
import { getDb } from '../../db.js';
import { withTransactionRetry, type Transaction } from '@jurnapod/db';

// =============================================================================
// Constants
// =============================================================================

/**
 * Item image resize configuration — 3 size variants + WebP format.
 */
const ITEM_IMAGE_RESIZE: ResizeConfig = {
  sizes: [
    { name: 'large',    width: 800,  height: 800,  quality: 85 },
    { name: 'medium',  width: 400,  height: 400,  quality: 80 },
    { name: 'thumbnail', width: 100, height: 100, quality: 75 },
  ],
  format: 'webp' as const,
};

/** Item image max file size: 2MB (product decision) */
const ITEM_IMAGE_MAX_SIZE_BYTES = 2 * 1024 * 1024;

// =============================================================================
// Types
// =============================================================================

export interface ItemImageUploadOptions {
  variantId?: number;
  isPrimary?: boolean;
  sortOrder?: number;
}

export interface ItemImageUploadResult {
  id: number;                                   // item_images.id from DB
  urls: Record<string, string>;                  // from uploadFile result
  metadata: UploadMetadata;                     // from uploadFile result
}

// =============================================================================
// Upload
// =============================================================================

/**
 * Upload an item image: store files → insert DB record.
 *
 * Transactional: if DB insert fails, stored files are deleted (cleanup).
 *
 * @param companyId  - Tenant ID
 * @param itemId     - Item this image belongs to
 * @param userId     - User performing the upload
 * @param fileBuffer - Image file content
 * @param fileName   - Original filename
 * @param mimeType   - MIME type (image/jpeg, image/png, image/webp)
 * @param options    - Optional: variantId, isPrimary, sortOrder
 */
export async function uploadItemImageAdapter(
  companyId: number,
  itemId: number,
  userId: number,
  fileBuffer: Buffer,
  fileName: string,
  mimeType: string,
  options: ItemImageUploadOptions = {}
): Promise<ItemImageUploadResult> {
  const db = getDb();

  // Step 1: Upload files (generates URLs for original, large, medium, thumbnail)
  // Item images: 2MB max (product decision preserved from original implementation)
  const result = await uploadFile({
    companyId,
    userId,
    entityType: 'item_image',
    entityId: itemId,
    fileBuffer,
    fileName,
    mimeType,
    options: {
      maxSizeBytes: ITEM_IMAGE_MAX_SIZE_BYTES,
      resize: ITEM_IMAGE_RESIZE,
    },
  });

  // Step 2: Transaction — insert DB record + handle is_primary flag + compute sort_order
  try {
    let insertedId = 0;

    await withTransactionRetry(db, async (trx) => {
      // Compute sort_order inside transaction to prevent race conditions
      const computedSortOrder = options.sortOrder ?? await computeNextSortOrder(trx, companyId, itemId);

      // If isPrimary=true, unset existing primary for this item
      if (options.isPrimary) {
        await trx
          .updateTable('item_images')
          .set({ is_primary: 0 })
          .where('company_id', '=', companyId)
          .where('item_id', '=', itemId)
          .where('is_primary', '=', 1)
          .execute();
      }

      // Insert new image record
      // Note: Use insertId pattern instead of .returning() — MySQL's simulated
      // RETURNING has type-inference issues with Generated columns in Kysely.
      const insertResult = await trx
        .insertInto('item_images')
        .values({
          company_id: companyId,
          item_id: itemId,
          variant_id: options.variantId ?? null,
          file_name: fileName,
          original_url: result.urls['original'],
          large_url: result.urls['large'] ?? null,
          medium_url: result.urls['medium'] ?? null,
          thumbnail_url: result.urls['thumbnail'] ?? null,
          file_size_bytes: result.metadata.sizeBytes,
          mime_type: result.metadata.mimeType,
          width_pixels: result.metadata.dimensions?.width ?? null,
          height_pixels: result.metadata.dimensions?.height ?? null,
          is_primary: options.isPrimary ? 1 : 0,
          sort_order: computedSortOrder,
          uploaded_by: userId,
        })
        .executeTakeFirst();

      insertedId = Number(insertResult.insertId);
    });

    return {
      id: insertedId,
      urls: result.urls,
      metadata: result.metadata,
    };
  } catch (dbError: unknown) {
    // DB insert failed — cleanup stored files with error logging
    const fileKeys = extractFileKeysFromUrls(Object.values(result.urls));
    try {
      await deleteFile({ companyId, fileKeys });
    } catch (cleanupError) {
      console.error('Failed to cleanup stored files after DB insert failure', {
        companyId,
        itemId,
        fileKeys,
        dbError: dbError instanceof Error ? dbError.message : String(dbError),
        cleanupError: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
      });
    }
    throw dbError;
  }
}

// =============================================================================
// Delete
// =============================================================================

/**
 * Delete an item image: fetch record → delete files → delete DB record.
 *
 * @param companyId - Tenant ID
 * @param imageId   - item_images.id to delete
 * @param userId    - User performing the deletion
 */
export async function deleteItemImageAdapter(
  companyId: number,
  imageId: number,
  _userId: number
): Promise<void> {
  const db = getDb();

  // Fetch record to get file URLs (verify ownership via companyId)
  const record = await db
    .selectFrom('item_images')
    .select([
      'original_url',
      'large_url',
      'medium_url',
      'thumbnail_url',
    ])
    .where('id', '=', imageId)
    .where('company_id', '=', companyId)
    .executeTakeFirst();

  if (!record) {
    // Image not found or not owned by this company — nothing to delete
    return;
  }

  // Extract file keys from stored URLs and delete them
  const urls = [
    record.original_url,
    record.large_url,
    record.medium_url,
    record.thumbnail_url,
  ].filter((url): url is string => Boolean(url));

  if (urls.length > 0) {
    const fileKeys = extractFileKeysFromUrls(urls);
    await deleteFile({ companyId, fileKeys });
  }

  // Delete DB record
  await db
    .deleteFrom('item_images')
    .where('id', '=', imageId)
    .where('company_id', '=', companyId)
    .execute();
}

// =============================================================================
// Update
// =============================================================================

/**
 * Update item image metadata (is_primary, sort_order).
 *
 * @param companyId - Tenant ID
 * @param imageId   - item_images.id to update
 * @param updates   - { isPrimary?, sortOrder? }
 * @param userId    - User performing the update
 */
export async function updateItemImageAdapter(
  companyId: number,
  imageId: number,
  updates: { isPrimary?: boolean; sortOrder?: number },
  _userId: number
): Promise<void> {
  const db = getDb();

  // Verify image belongs to this company
  const existing = await db
    .selectFrom('item_images')
    .select(['id', 'item_id'])
    .where('id', '=', imageId)
    .where('company_id', '=', companyId)
    .executeTakeFirst();

  if (!existing) {
    return; // Image not found or not owned — nothing to update
  }

  await withTransactionRetry(db, async (trx) => {
    // If setting isPrimary=true, unset existing primary for this item
    if (updates.isPrimary) {
      await trx
        .updateTable('item_images')
        .set({ is_primary: 0 })
        .where('company_id', '=', companyId)
        .where('item_id', '=', existing.item_id)
        .where('is_primary', '=', 1)
        .execute();
    }

    // Build update values
    const setValues: Record<string, unknown> = {};
    if (updates.isPrimary !== undefined) {
      setValues['is_primary'] = updates.isPrimary ? 1 : 0;
    }
    if (updates.sortOrder !== undefined) {
      setValues['sort_order'] = updates.sortOrder;
    }

    if (Object.keys(setValues).length === 0) {
      return; // Nothing to update
    }

    await trx
      .updateTable('item_images')
      .set(setValues)
      .where('id', '=', imageId)
      .where('company_id', '=', companyId)
      .execute();
  });
}

// =============================================================================
// Set Primary
// =============================================================================

/**
 * Set a specific image as the primary image for an item.
 * Uses two queries: unset existing primary, then set new primary.
 *
 * @param companyId - Tenant ID
 * @param itemId    - Item whose primary image is being set
 * @param imageId   - item_images.id to set as primary
 * @param userId    - User performing the update
 */
export async function setPrimaryItemImageAdapter(
  companyId: number,
  itemId: number,
  imageId: number,
  _userId: number
): Promise<void> {
  const db = getDb();

  // Verify image belongs to this item + company
  const existing = await db
    .selectFrom('item_images')
    .select(['id'])
    .where('id', '=', imageId)
    .where('company_id', '=', companyId)
    .where('item_id', '=', itemId)
    .executeTakeFirst();

  if (!existing) {
    return; // Image not found or not owned — nothing to update
  }

  // Unset all existing primaries for this item
  await db
    .updateTable('item_images')
    .set({ is_primary: 0 })
    .where('item_id', '=', itemId)
    .where('company_id', '=', companyId)
    .where('is_primary', '=', 1)
    .execute();

  // Set the target image as primary
  await db
    .updateTable('item_images')
    .set({ is_primary: 1 })
    .where('id', '=', imageId)
    .where('company_id', '=', companyId)
    .execute();
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Compute the next sort_order for an item's images.
 * Returns MAX(sort_order) + 1, defaulting to 1 if no images exist.
 *
 * Accepts either a db instance or a transaction executor.
 */
async function computeNextSortOrder(
  dbOrTrx: ReturnType<typeof getDb> | Transaction,
  companyId: number,
  itemId: number
): Promise<number> {
  const result = await dbOrTrx
    .selectFrom('item_images')
    .where('company_id', '=', companyId)
    .where('item_id', '=', itemId)
    .select((eb) => eb.fn.max('sort_order').as('max_sort'))
    .executeTakeFirst();

  const maxSort = result?.max_sort ?? null;
  return (maxSort ?? 0) + 1;
}

/**
 * Convert stored URLs back to storage keys by stripping the baseUrl prefix.
 *
 * Storage provider URL format: {baseUrl}/{key} → key = URL after baseUrl/
 * For example: /uploads/companies/1/item_image/5/original/123-abc-photo.jpg
 *              → companies/1/item_image/5/original/123-abc-photo.jpg
 */
function extractFileKeysFromUrls(urls: string[]): string[] {
  // The baseUrl used by LocalStorageProvider (configured via JP_UPLOAD_URL env)
  // Default: /uploads — match what generateFileKey produces
  const BASE_URL = process.env.JP_UPLOAD_URL || '/uploads';

  return urls.map((url) => {
    // Strip leading baseUrl + slash
    if (url.startsWith(BASE_URL + '/')) {
      return url.slice(BASE_URL.length + 1);
    }
    // If URL doesn't start with baseUrl, try to extract the key portion
    // Assume everything after the first / is the key for URLs like /uploads/...
    const parts = url.split('/');
    if (parts.length > 1) {
      // Return everything after the first segment (handles /uploads/companies/...)
      return parts.slice(1).join('/');
    }
    return url;
  });
}