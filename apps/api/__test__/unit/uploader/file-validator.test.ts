// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { describe, it, expect } from "vitest";
import { validateFile } from "../../../src/lib/uploader/file-validator.js";

describe("uploader.file-validator", () => {
  // Helper: small buffer (1MB)
  const smallBuffer = Buffer.alloc(1 * 1024 * 1024);

  // Helper: large buffer (3MB) — used for size rejection tests
  const largeBuffer = Buffer.alloc(3 * 1024 * 1024);

  // -------------------------------------------------------------------------
  // validateFile — size checks
  // -------------------------------------------------------------------------

  describe("size validation", () => {
    it("AC5: rejects files over maxSizeBytes", () => {
      const result = validateFile(largeBuffer, "image/jpeg", {
        maxSizeBytes: 2 * 1024 * 1024,
      });

      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/under 2\.?\d*MB/i);
      expect(result.error).toMatch(/3\.00MB/);
    });

    it("accepts files at exactly maxSizeBytes", () => {
      const exactBuffer = Buffer.alloc(2 * 1024 * 1024);
      const result = validateFile(exactBuffer, "image/jpeg", {
        maxSizeBytes: 2 * 1024 * 1024,
      });

      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("accepts files under maxSizeBytes", () => {
      const result = validateFile(smallBuffer, "image/jpeg", {
        maxSizeBytes: 5 * 1024 * 1024,
      });

      expect(result.valid).toBe(true);
    });

    it("uses default 5MB when maxSizeBytes not provided", () => {
      const result = validateFile(smallBuffer, "image/jpeg", {});

      expect(result.valid).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // validateFile — MIME type checks
  // -------------------------------------------------------------------------

  describe("MIME type validation", () => {
    it("AC6: rejects disallowed MIME types", () => {
      const buffer = Buffer.alloc(1024);
      const result = validateFile(buffer, "application/pdf", {
        allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
      });

      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/Only image\/jpeg, image\/png, image\/webp are allowed/);
    });

    it("AC7: accepts allowed MIME types", () => {
      const buffer = Buffer.alloc(1024);

      const jpeg = validateFile(buffer, "image/jpeg", {
        allowedMimeTypes: ["image/jpeg"],
      });
      expect(jpeg.valid).toBe(true);

      const png = validateFile(buffer, "image/png", {
        allowedMimeTypes: ["image/jpeg", "image/png"],
      });
      expect(png.valid).toBe(true);
    });

    it("accepts webp and gif by default", () => {
      const buffer = Buffer.alloc(1024);
      const defaults = ["image/jpeg", "image/png", "image/webp", "image/gif"];

      for (const mimeType of defaults) {
        const result = validateFile(buffer, mimeType, {});
        expect(result.valid).toBe(true);
      }
    });

    it("returns valid:true when both checks pass", () => {
      const result = validateFile(smallBuffer, "image/jpeg", {
        maxSizeBytes: 5 * 1024 * 1024,
        allowedMimeTypes: ["image/jpeg"],
      });

      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });
  });
});
