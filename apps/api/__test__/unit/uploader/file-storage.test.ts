// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { LocalStorageProvider, generateFileKey } from "../../../src/lib/uploader/file-storage.js";

describe("uploader.file-storage", () => {
  // Use a temp directory for each test
  const TEST_ROOT = path.join("/tmp", "uploader-test-" + Date.now());
  const TEST_BASE_PATH = path.join(TEST_ROOT, "storage");
  const TEST_BASE_URL = "/test-uploads";

  let provider: LocalStorageProvider;

  beforeEach(async () => {
    // Ensure clean directory
    await fs.mkdir(TEST_BASE_PATH, { recursive: true });
    provider = new LocalStorageProvider({
      basePath: TEST_BASE_PATH,
      baseUrl: TEST_BASE_URL,
    });
  });

  afterEach(async () => {
    // Cleanup
    await fs.rm(TEST_ROOT, { recursive: true, force: true });
  });

  // -------------------------------------------------------------------------
  // generateFileKey
  // -------------------------------------------------------------------------

  describe("generateFileKey", () => {
    it("produces correct structure with all parameters", () => {
      const key = generateFileKey(1, "item_image", 99, "photo.jpg", "original");

      expect(key).toMatch(/^companies\/1\/item_image\/99\/original\/\d+-[a-z0-9]+-photo\.jpg$/);
    });

    it("does NOT contain hardcoded 'items' segment", () => {
      const key = generateFileKey(1, "item_image", 99, "photo.jpg", "original");

      expect(key).not.toContain("/items/");
      expect(key).toContain("/item_image/");
    });

    it("uses default size 'original' when size not provided", () => {
      const key = generateFileKey(1, "item_image", 99, "photo.jpg");

      expect(key).toContain("/original/");
    });

    it("sanitizes filename by replacing unsafe characters", () => {
      const key = generateFileKey(1, "item_image", 5, "my photo (1).jpg", "original");

      expect(key).not.toContain(" ");
      expect(key).not.toContain("(");
      expect(key).not.toContain(")");
    });

    it("works with different entity types", () => {
      const key1 = generateFileKey(1, "static_page", 10, "page.html", "original");
      const key2 = generateFileKey(1, "export_file", 20, "report.csv", "original");

      expect(key1).toContain("/static_page/10/");
      expect(key2).toContain("/export_file/20/");
    });
  });

  // -------------------------------------------------------------------------
  // LocalStorageProvider.store
  // -------------------------------------------------------------------------

  describe("LocalStorageProvider.store", () => {
    it("stores file and returns URL", async () => {
      const buffer = Buffer.from("hello world");
      const key = "test/file.txt";

      const url = await provider.store(key, buffer, "text/plain");

      expect(url).toBe(`${TEST_BASE_URL}/test/file.txt`);

      // Verify file exists
      const exists = await provider.exists(key);
      expect(exists).toBe(true);
    });

    it("creates intermediate directories", async () => {
      const buffer = Buffer.from("nested content");
      const key = "a/b/c/nested/file.txt";

      await provider.store(key, buffer, "text/plain");

      const exists = await provider.exists(key);
      expect(exists).toBe(true);
    });

    it("overwrites existing file", async () => {
      const buffer1 = Buffer.from("version1");
      const buffer2 = Buffer.from("version2");
      const key = "test/overwrite.txt";

      await provider.store(key, buffer1, "text/plain");
      await provider.store(key, buffer2, "text/plain");

      const content = await fs.readFile(path.join(TEST_BASE_PATH, key));
      expect(content.toString()).toBe("version2");
    });
  });

  // -------------------------------------------------------------------------
  // LocalStorageProvider.getUrl
  // -------------------------------------------------------------------------

  describe("LocalStorageProvider.getUrl", () => {
    it("returns correct URL for key", () => {
      expect(provider.getUrl("companies/1/item_image/5/original/file.jpg")).toBe(
        `${TEST_BASE_URL}/companies/1/item_image/5/original/file.jpg`
      );
    });
  });

  // -------------------------------------------------------------------------
  // LocalStorageProvider.exists
  // -------------------------------------------------------------------------

  describe("LocalStorageProvider.exists", () => {
    it("returns true for existing file", async () => {
      await provider.store("test/exists.txt", Buffer.from("content"), "text/plain");

      expect(await provider.exists("test/exists.txt")).toBe(true);
    });

    it("returns false for non-existent file", async () => {
      expect(await provider.exists("test/nonexistent.txt")).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // LocalStorageProvider.delete
  // -------------------------------------------------------------------------

  describe("LocalStorageProvider.delete", () => {
    it("deletes existing file", async () => {
      const key = "test/delete-me.txt";
      await provider.store(key, Buffer.from("to delete"), "text/plain");

      await provider.delete(key);

      expect(await provider.exists(key)).toBe(false);
    });

    it("does not throw when deleting non-existent file (idempotent)", async () => {
      await expect(provider.delete("test/does-not-exist.txt")).resolves.not.toThrow();
    });
  });
});
