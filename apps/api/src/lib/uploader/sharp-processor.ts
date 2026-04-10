// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Generic image processing — Sharp-based resize pipeline
 *
 * Opt-in resize pipeline. When resize config is provided, generates
 * multiple size variants in the configured format. When resize is omitted,
 * returns the original buffer unchanged.
 */

import sharp from "sharp";
import type { ProcessedImage, ResizeConfig } from "./types.js";

// =============================================================================
// Process Image
// =============================================================================

/**
 * Process an image buffer through an optional resize pipeline.
 *
 * When resize is undefined: returns original buffer as-is (no processing).
 * When resize is provided: resizes to each configured size, converts format.
 *
 * @param buffer    - Source image buffer
 * @param mimeType  - Source MIME type (e.g., 'image/jpeg')
 * @param resize    - Optional resize configuration
 * @returns ProcessedImage with buffers for each size + metadata
 */
export async function processImage(
  buffer: Buffer,
  mimeType: string,
  resize?: ResizeConfig
): Promise<ProcessedImage> {
  // No resize requested — return original as-is
  if (!resize) {
    const metadata = await sharp(buffer).metadata();
    return {
      buffers: { original: buffer },
      width: metadata.width ?? 0,
      height: metadata.height ?? 0,
      mimeType,
    };
  }

  // Get source metadata for dimensions
  const metadata = await sharp(buffer).metadata();
  const sourceWidth = metadata.width ?? 0;
  const sourceHeight = metadata.height ?? 0;

  // Determine output format
  const outputFormat = resize.format ?? "jpeg";
  const outputMimeType = formatToMimeType(outputFormat);

  // Resize to each configured size
  const buffers: Record<string, Buffer> = {};

  // Always include the original buffer (unmodified)
  buffers["original"] = buffer;

  for (const size of resize.sizes) {
    const resized = await sharp(buffer)
      .resize(size.width, size.height, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .toFormat(outputFormat, { quality: size.quality });

    buffers[size.name] = await resized.toBuffer();
  }

  // Output dimensions = dimensions of last processed size (largest)
  // For consistent metadata, use the largest size's dimensions
  const lastSize = resize.sizes[resize.sizes.length - 1];
  const lastResized = await sharp(buffer)
    .resize(lastSize.width, lastSize.height, {
      fit: "inside",
      withoutEnlargement: true,
    })
    .toFormat(outputFormat, { quality: lastSize.quality });
  const lastMeta = await lastResized.metadata();

  return {
    buffers,
    width: lastMeta.width ?? sourceWidth,
    height: lastMeta.height ?? sourceHeight,
    mimeType: outputMimeType,
  };
}

// =============================================================================
// Format Helpers
// =============================================================================

function formatToMimeType(format: "jpeg" | "png" | "webp"): string {
  switch (format) {
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
  }
}
