// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Generic file uploader — orchestrator
 *
 * Combines validation, processing, and storage into a single uploadFile() / deleteFile() API.
 */

import { processImage } from "./sharp-processor.js";
import { validateFile } from "./file-validator.js";
import { createStorageProvider, generateFileKey } from "./file-storage.js";
import type {
  UploadRequest,
  UploadResult,
  DeleteRequest,
  StorageProvider,
} from "./types.js";

// =============================================================================
// Default Storage Provider (singleton-ish)
// =============================================================================

let _storageProvider: StorageProvider | null = null;

function getStorageProvider(): StorageProvider {
  if (!_storageProvider) {
    _storageProvider = createStorageProvider();
  }
  return _storageProvider;
}

/**
 * Reset the storage provider (useful for testing).
 */
export function resetStorageProvider(): void {
  _storageProvider = null;
}

/**
 * Set a custom storage provider (useful for testing).
 */
export function setStorageProvider(provider: StorageProvider): void {
  _storageProvider = provider;
}

// =============================================================================
// Upload File
// =============================================================================

/**
 * Upload a file: validate → process → store → return URLs + metadata.
 *
 * @param request - Upload request with file buffer and options
 * @returns URLs for each size variant + file metadata
 * @throws Error if validation fails or storage fails
 */
export async function uploadFile(request: UploadRequest): Promise<UploadResult> {
  const provider = getStorageProvider();

  // 1. Validate
  const validation = validateFile(
    request.fileBuffer,
    request.mimeType,
    request.options
  );
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  // 2. Process image (resize pipeline — opt-in)
  const processed = await processImage(
    request.fileBuffer,
    request.mimeType,
    request.options?.resize
  );

  // 3. Determine output MIME type (may differ if format conversion happened)
  const outputMimeType = processed.mimeType;

  // 4. Store each size variant
  const urls: Record<string, string> = {};

  // Store original buffer (always created by processImage)
  const originalKey = generateFileKey(
    request.companyId,
    request.entityType,
    request.entityId,
    request.fileName,
    "original"
  );
  urls["original"] = await provider.store(
    originalKey,
    processed.buffers["original"],
    outputMimeType
  );

  // Store any additional resized variants
  for (const [sizeName, sizeBuffer] of Object.entries(processed.buffers)) {
    if (sizeName === "original") continue; // already stored above

    const key = generateFileKey(
      request.companyId,
      request.entityType,
      request.entityId,
      request.fileName,
      sizeName
    );
    urls[sizeName] = await provider.store(key, sizeBuffer, outputMimeType);
  }

  // 5. Return result
  return {
    urls,
    metadata: {
      originalName: request.fileName,
      mimeType: outputMimeType,
      sizeBytes: request.fileBuffer.length,
      dimensions: {
        width: processed.width,
        height: processed.height,
      },
    },
  };
}

// =============================================================================
// Delete File
// =============================================================================

/**
 * Delete stored files by their storage keys.
 * Silently ignores keys that don't exist (idempotent).
 *
 * @param request - Delete request with file keys to remove
 */
export async function deleteFile(request: DeleteRequest): Promise<void> {
  const provider = getStorageProvider();

  // Delete all keys in parallel
  await Promise.all(
    request.fileKeys.map((key) => provider.delete(key))
  );
}

// =============================================================================
// Re-export types for consumers
// =============================================================================

export type {
  UploadRequest,
  UploadResult,
  DeleteRequest,
  StorageProvider,
  ResizeConfig,
  ResizeSize,
  EntityType,
} from "./types.js";
