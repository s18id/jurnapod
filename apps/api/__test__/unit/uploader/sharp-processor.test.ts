// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { describe, it, expect } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import sharp from "sharp";
import { processImage } from "../../../src/lib/uploader/sharp-processor.js";

describe("uploader.sharp-processor", () => {
  // Helper: create a real JPEG buffer of specific dimensions
  async function createTestImage(
    width: number,
    height: number,
    format: "jpeg" | "png" | "webp" = "jpeg"
  ): Promise<Buffer> {
    // Create a colored square for dimension verification
    const svg = `
      <svg width="${width}" height="${height}">
        <rect width="${width}" height="${height}" fill="#ff0000"/>
        <rect x="${width / 4}" y="${height / 4}" width="${width / 2}" height="${height / 2}" fill="#0000ff"/>
      </svg>
    `;
    return sharp(Buffer.from(svg)).toFormat(format).toBuffer();
  }

  // Helper: get image dimensions
  async function getDimensions(
    buffer: Buffer
  ): Promise<{ width: number; height: number }> {
    const meta = await sharp(buffer).metadata();
    return { width: meta.width ?? 0, height: meta.height ?? 0 };
  }

  // -------------------------------------------------------------------------
  // AC9: No resize config — returns original as-is
  // -------------------------------------------------------------------------

  describe("no resize (passthrough)", () => {
    it("AC9: returns original buffer unchanged when resize is undefined", async () => {
      const original = await createTestImage(800, 600);
      const originalDims = await getDimensions(original);

      const result = await processImage(original, "image/jpeg", undefined);

      expect(result.buffers).toHaveProperty("original");
      expect(result.buffers.original.equals(original)).toBe(true);
      expect(result.width).toBe(originalDims.width);
      expect(result.height).toBe(originalDims.height);
      expect(result.mimeType).toBe("image/jpeg");
    });

    it("returns single 'original' key when no resize", async () => {
      const original = await createTestImage(100, 100);

      const result = await processImage(original, "image/jpeg", undefined);

      expect(Object.keys(result.buffers)).toEqual(["original"]);
    });
  });

  // -------------------------------------------------------------------------
  // AC8: Resize pipeline
  // -------------------------------------------------------------------------

  describe("resize pipeline", () => {
    it("AC8: resizes to configured sizes and converts format", async () => {
      const original = await createTestImage(2000, 1500, "jpeg");

      const result = await processImage(original, "image/jpeg", {
        sizes: [{ name: "thumbnail", width: 100, height: 100, quality: 80 }],
        format: "webp",
      });

      // Should have both original and thumbnail
      expect(Object.keys(result.buffers)).toContain("original");
      expect(Object.keys(result.buffers)).toContain("thumbnail");

      // Original should still be JPEG
      const originalMeta = await sharp(result.buffers.original).metadata();
      expect(originalMeta.format).toBe("jpeg");

      // Thumbnail should be WebP
      const thumbMeta = await sharp(result.buffers.thumbnail).metadata();
      expect(thumbMeta.format).toBe("webp");

      // Thumbnail dimensions should be ≤ 100x100
      expect(thumbMeta.width).toBeLessThanOrEqual(100);
      expect(thumbMeta.height).toBeLessThanOrEqual(100);
    });

    it("thumbnail fits within box without enlarging small images", async () => {
      // Small image (50x50) — should NOT be upscaled to 100x100
      const small = await createTestImage(50, 50, "jpeg");

      const result = await processImage(small, "image/jpeg", {
        sizes: [{ name: "thumb", width: 100, height: 100, quality: 80 }],
        format: "jpeg",
      });

      const thumbMeta = await sharp(result.buffers.thumb).metadata();
      expect(thumbMeta.width).toBe(50);
      expect(thumbMeta.height).toBe(50);
    });

    it("generates multiple size variants", async () => {
      const original = await createTestImage(2000, 2000, "jpeg");

      const result = await processImage(original, "image/jpeg", {
        sizes: [
          { name: "large", width: 800, height: 800, quality: 85 },
          { name: "medium", width: 400, height: 400, quality: 80 },
          { name: "thumbnail", width: 100, height: 100, quality: 75 },
        ],
        format: "png",
      });

      expect(Object.keys(result.buffers)).toHaveLength(4); // original + 3 sizes

      const largeMeta = await sharp(result.buffers.large).metadata();
      expect(largeMeta.width).toBeLessThanOrEqual(800);
      expect(largeMeta.format).toBe("png");
    });

    it("uses original file extension when determining output format", async () => {
      // PNG input
      const pngBuffer = await createTestImage(200, 200, "png");

      const result = await processImage(pngBuffer, "image/png", {
        sizes: [{ name: "thumb", width: 50, height: 50, quality: 80 }],
        format: "jpeg",
      });

      // Should convert PNG → JPEG
      const thumbMeta = await sharp(result.buffers.thumb).metadata();
      expect(thumbMeta.format).toBe("jpeg");
    });
  });
});
