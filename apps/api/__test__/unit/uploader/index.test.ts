// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  uploadFile,
  deleteFile,
  setStorageProvider,
  resetStorageProvider,
} from "../../../src/lib/uploader/index.js";
import type { StorageProvider } from "../../../src/lib/uploader/types.js";

// =============================================================================
// Mock Storage Provider
// =============================================================================

/**
 * In-memory storage provider for unit testing.
 */
class MockStorageProvider implements StorageProvider {
  private storage = new Map<string, Buffer>();

  async store(key: string, buffer: Buffer, _mimeType: string): Promise<string> {
    this.storage.set(key, buffer);
    return `/mock/${key}`;
  }

  async delete(key: string): Promise<void> {
    this.storage.delete(key);
  }

  getUrl(key: string): string {
    return `/mock/${key}`;
  }

  async exists(key: string): Promise<boolean> {
    return this.storage.has(key);
  }

  getStoredKeys(): string[] {
    return Array.from(this.storage.keys());
  }
}

// =============================================================================
// Setup / Teardown
// =============================================================================

let mockProvider: MockStorageProvider;

beforeEach(() => {
  mockProvider = new MockStorageProvider();
  setStorageProvider(mockProvider);
});

afterEach(() => {
  resetStorageProvider();
});

// =============================================================================
// uploadFile
// =============================================================================

describe("uploader.index.uploadFile", () => {
  // Helper: create a minimal test image buffer (1x1 red pixel JPEG)
  async function createImageBuffer(): Promise<Buffer> {
    const sharp = await import("sharp");
    const svg = `<svg width="1" height="1"><rect fill="#ff0000" width="1" height="1"/></svg>`;
    return sharp.default(Buffer.from(svg)).jpeg().toBuffer();
  }

  it("AC10: validates → processes → stores → returns urls", async () => {
    const buffer = await createImageBuffer();

    const result = await uploadFile({
      companyId: 1,
      userId: 10,
      entityType: "item_image",
      entityId: 5,
      fileBuffer: buffer,
      fileName: "photo.jpg",
      mimeType: "image/jpeg",
      options: {
        maxSizeBytes: 5 * 1024 * 1024,
        allowedMimeTypes: ["image/jpeg"],
        resize: {
          sizes: [{ name: "thumbnail", width: 100, height: 100, quality: 80 }],
          format: "webp",
        },
      },
    });

    // Should have stored both original and thumbnail
    expect(result.urls).toHaveProperty("original");
    expect(result.urls).toHaveProperty("thumbnail");
    expect(result.urls.original).toContain("/mock/");
    expect(result.urls.thumbnail).toContain("/mock/");

    // Verify files actually stored
    const storedKeys = mockProvider.getStoredKeys();
    console.log("Stored keys:", storedKeys);
    expect(storedKeys.some(k => k.includes("/item_image/5/original/"))).toBe(true);
    expect(storedKeys.some(k => k.includes("/item_image/5/thumbnail/"))).toBe(true);
  });

  it("AC11: returns descriptive metadata", async () => {
    const buffer = await createImageBuffer();

    const result = await uploadFile({
      companyId: 1,
      userId: 10,
      entityType: "item_image",
      entityId: 5,
      fileBuffer: buffer,
      fileName: "photo.jpg",
      mimeType: "image/jpeg",
    });

    expect(result.metadata.originalName).toBe("photo.jpg");
    expect(result.metadata.mimeType).toBe("image/jpeg");
    expect(result.metadata.sizeBytes).toBe(buffer.length);
    expect(result.metadata.dimensions).toBeDefined();
    expect(result.metadata.dimensions!.width).toBeGreaterThan(0);
    expect(result.metadata.dimensions!.height).toBeGreaterThan(0);
  });

  it("throws with descriptive error when validation fails", async () => {
    const buffer = await createImageBuffer();

    await expect(
      uploadFile({
        companyId: 1,
        userId: 10,
        entityType: "item_image",
        entityId: 5,
        fileBuffer: buffer,
        fileName: "evil.pdf",
        mimeType: "application/pdf",
        options: {
          allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
        },
      })
    ).rejects.toThrow(/Only.*image\/jpeg.*image\/png.*image\/webp.*are allowed/);
  });

  it("generates unique keys per upload (timestamp + random)", async () => {
    const buffer = await createImageBuffer();

    const result1 = await uploadFile({
      companyId: 1,
      userId: 10,
      entityType: "item_image",
      entityId: 5,
      fileBuffer: buffer,
      fileName: "photo.jpg",
      mimeType: "image/jpeg",
    });

    // Same request but different time — keys should differ
    const keys1 = Object.values(result1.urls)[0];

    expect(keys1).toMatch(/companies\/1\/item_image\/5\/original\/\d+-[a-z0-9]+-photo\.jpg/);
  });

  it("AC10: stores with correct entityType in key", async () => {
    const buffer = await createImageBuffer();

    await uploadFile({
      companyId: 2,
      userId: 10,
      entityType: "static_page",
      entityId: 99,
      fileBuffer: buffer,
      fileName: "page.html",
      mimeType: "image/jpeg",
    });

    const keys2 = mockProvider.getStoredKeys();
    console.log("Stored keys (static_page):", keys2);
    expect(keys2.some(k => k.includes("companies/2/static_page/99/"))).toBe(true);
  });
});

// =============================================================================
// deleteFile
// =============================================================================

describe("uploader.index.deleteFile", () => {
  it("AC12: deletes all provided file keys", async () => {
    // Pre-store some files
    await mockProvider.store("companies/1/item_image/5/original/file1.jpg", Buffer.from("img1"), "image/jpeg");
    await mockProvider.store("companies/1/item_image/5/thumbnail/file1.jpg", Buffer.from("thumb1"), "image/jpeg");
    await mockProvider.store("companies/1/item_image/5/large/file1.jpg", Buffer.from("large1"), "image/jpeg");

    await deleteFile({
      companyId: 1,
      fileKeys: [
        "companies/1/item_image/5/original/file1.jpg",
        "companies/1/item_image/5/thumbnail/file1.jpg",
        "companies/1/item_image/5/large/file1.jpg",
      ],
    });

    expect(mockProvider.getStoredKeys()).toHaveLength(0);
  });

  it("silently ignores non-existent keys (idempotent)", async () => {
    await expect(
      deleteFile({
        companyId: 1,
        fileKeys: ["nonexistent/key1.jpg", "nonexistent/key2.jpg"],
      })
    ).resolves.not.toThrow();
  });

  it("can delete subset of stored files", async () => {
    await mockProvider.store("keep/file.jpg", Buffer.from("keep"), "image/jpeg");
    await mockProvider.store("delete/file.jpg", Buffer.from("delete"), "image/jpeg");

    await deleteFile({
      companyId: 1,
      fileKeys: ["delete/file.jpg"],
    });

    expect(mockProvider.getStoredKeys()).toEqual(["keep/file.jpg"]);
  });
});
