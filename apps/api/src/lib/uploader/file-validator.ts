// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Generic file validation — MIME type and size checks
 *
 * Pure validation with no side effects.
 */

import type { ValidationResult } from "./types.js";

// =============================================================================
// Defaults
// =============================================================================

const DEFAULT_ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
];

const DEFAULT_MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

// =============================================================================
// Validate File
// =============================================================================

export interface ValidateFileOptions {
  maxSizeBytes?: number;
  allowedMimeTypes?: string[];
}

/**
 * Validate file buffer against size and MIME type constraints.
 *
 * @param buffer    - File content as Buffer
 * @param mimeType  - MIME type string (e.g., 'image/jpeg')
 * @param options   - Validation options
 * @returns ValidationResult with error message if invalid
 */
export function validateFile(
  buffer: Buffer,
  mimeType: string,
  options: ValidateFileOptions = {}
): ValidationResult {
  const maxSizeBytes = options.maxSizeBytes ?? DEFAULT_MAX_SIZE_BYTES;
  const allowedMimeTypes =
    options.allowedMimeTypes ?? DEFAULT_ALLOWED_IMAGE_TYPES;

  // Check size
  if (buffer.length > maxSizeBytes) {
    const sizeMB = (buffer.length / 1024 / 1024).toFixed(2);
    const maxMB = (maxSizeBytes / 1024 / 1024).toFixed(2);
    return {
      valid: false,
      error: `File must be under ${maxMB}MB. Received: ${sizeMB}MB`,
    };
  }

  // Check MIME type
  if (!allowedMimeTypes.includes(mimeType)) {
    const allowed = allowedMimeTypes.join(", ");
    return {
      valid: false,
      error: `Only ${allowed} are allowed`,
    };
  }

  return { valid: true };
}
