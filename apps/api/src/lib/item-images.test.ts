// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { describe, it, test, before } from "node:test";
import assert from "node:assert";
import type { RowDataPacket, ResultSetHeader } from "mysql2";
import {
  validateImageUpload,
  processImage,
  verifyItemOwnership,
  CrossTenantAccessError
} from "./item-images";
import { getDbPool, closeDbPool } from "./db";
import { createCompanyBasic } from "./companies";

describe("Image Upload Validation", () => {
  describe("validateImageUpload", () => {
    test("accepts JPEG under 5MB", () => {
      const buffer = Buffer.alloc(1024 * 1024); // 1MB
      const result = validateImageUpload(buffer, "image/jpeg");
      assert.strictEqual(result.valid, true);
    });

    test("accepts PNG under 5MB", () => {
      const buffer = Buffer.alloc(2 * 1024 * 1024); // 2MB
      const result = validateImageUpload(buffer, "image/png");
      assert.strictEqual(result.valid, true);
    });

    test("accepts WebP under 5MB", () => {
      const buffer = Buffer.alloc(3 * 1024 * 1024); // 3MB
      const result = validateImageUpload(buffer, "image/webp");
      assert.strictEqual(result.valid, true);
    });

    test("rejects GIF", () => {
      const buffer = Buffer.alloc(1024);
      const result = validateImageUpload(buffer, "image/gif");
      assert.strictEqual(result.valid, false);
      assert.ok(result.error?.includes("JPG, PNG, WebP"));
    });

    test("rejects BMP", () => {
      const buffer = Buffer.alloc(1024);
      const result = validateImageUpload(buffer, "image/bmp");
      assert.strictEqual(result.valid, false);
    });

    test("rejects files over 5MB", () => {
      const buffer = Buffer.alloc(6 * 1024 * 1024); // 6MB
      const result = validateImageUpload(buffer, "image/jpeg");
      assert.strictEqual(result.valid, false);
      assert.ok(result.error?.includes("5MB"));
    });

    test("rejects exactly 5MB + 1 byte", () => {
      const buffer = Buffer.alloc(5 * 1024 * 1024 + 1);
      const result = validateImageUpload(buffer, "image/jpeg");
      assert.strictEqual(result.valid, false);
    });

    test("accepts exactly 5MB", () => {
      const buffer = Buffer.alloc(5 * 1024 * 1024);
      const result = validateImageUpload(buffer, "image/jpeg");
      assert.strictEqual(result.valid, true);
    });
  });
});

describe("Image Processing with Sharp", () => {
  // Create a simple test image buffer (1x1 pixel JPEG)
  async function createTestImageBuffer(): Promise<Buffer> {
    // This is a minimal valid JPEG (1x1 pixel, black)
    // In real tests, we'd use a test image file
    // For unit tests, we can create a simple buffer and process it
    const sharp = (await import("sharp")).default;
    return sharp({
      create: {
        width: 1000,
        height: 1000,
        channels: 3,
        background: { r: 255, g: 0, b: 0 }
      }
    })
      .jpeg({ quality: 90 })
      .toBuffer();
  }

  test("processes image and generates all sizes", async () => {
    const testBuffer = await createTestImageBuffer();
    const processed = await processImage(testBuffer, "image/jpeg");

    // Verify all sizes are generated
    assert.ok(processed.original.length > 0, "Original should exist");
    assert.ok(processed.large.length > 0, "Large should exist");
    assert.ok(processed.medium.length > 0, "Medium should exist");
    assert.ok(processed.thumbnail.length > 0, "Thumbnail should exist");

    // Verify dimensions are captured
    assert.ok(processed.width > 0, "Width should be captured");
    assert.ok(processed.height > 0, "Height should be captured");

    // Verify resized images are smaller than original
    assert.ok(processed.large.length < processed.original.length, "Large should be smaller than original");
    assert.ok(processed.medium.length < processed.large.length, "Medium should be smaller than large");
    assert.ok(processed.thumbnail.length < processed.medium.length, "Thumbnail should be smaller than medium");
  });

  test("processes PNG image", async () => {
    const sharp = (await import("sharp")).default;
    const testBuffer = await sharp({
      create: {
        width: 500,
        height: 500,
        channels: 4,
        background: { r: 0, g: 255, b: 0, alpha: 0.5 }
      }
    })
      .png()
      .toBuffer();

    const processed = await processImage(testBuffer, "image/png");
    assert.ok(processed.large.length > 0, "Should process PNG");
    assert.strictEqual(processed.mimeType, "image/png");
  });

  test("processes WebP image", async () => {
    const sharp = (await import("sharp")).default;
    const testBuffer = await sharp({
      create: {
        width: 800,
        height: 600,
        channels: 3,
        background: { r: 0, g: 0, b: 255 }
      }
    })
      .webp()
      .toBuffer();

    const processed = await processImage(testBuffer, "image/webp");
    assert.ok(processed.large.length > 0, "Should process WebP");
    assert.strictEqual(processed.mimeType, "image/webp");
  });
});

describe("Tenant Scoping Security", () => {
  const pool = getDbPool();
  let companyA: number;
  let companyB: number;
  let itemA: number;

  // Test companies and items
  before(async () => {
    // Get or create test companies
    const [companyRows] = await pool.execute<RowDataPacket[]>(
      "SELECT id, name FROM companies WHERE name IN ('Test Company A', 'Test Company B') ORDER BY name"
    );

    if (companyRows.length >= 2) {
      companyA = companyRows[0].id;
      companyB = companyRows[1].id;
    } else {
      // Insert test companies
      const companyAData = await createCompanyBasic({
        code: `TEST-COMPANY-A-${Date.now()}`,
        name: "Test Company A",
        email: "test-a@example.com"
      });
      companyA = companyAData.id;

      const companyBData = await createCompanyBasic({
        code: `TEST-COMPANY-B-${Date.now()}`,
        name: "Test Company B",
        email: "test-b@example.com"
      });
      companyB = companyBData.id;
    }

    // Create a test item for company A
    const [itemRows] = await pool.execute<RowDataPacket[]>(
      "SELECT id FROM items WHERE company_id = ? AND name = 'Tenant Test Item' LIMIT 1",
      [companyA]
    );

    if (itemRows.length > 0) {
      itemA = itemRows[0].id;
    } else {
      const [itemResult] = await pool.execute(
        "INSERT INTO items (company_id, name, item_type, sku) VALUES (?, ?, 'PRODUCT', ?)",
        [companyA, "Tenant Test Item", `TENANT_TEST_${Date.now()}`]
      );
      itemA = (itemResult as { insertId: number }).insertId;
    }
  });

  describe("verifyItemOwnership", () => {
    test("returns true when item belongs to caller company (happy path)", async () => {
      const result = await verifyItemOwnership(pool, itemA, companyA);
      assert.strictEqual(result, true, "Should allow access to own item");
    });

    test("throws CrossTenantAccessError for cross-tenant access (forbidden path)", async () => {
      await assert.rejects(
        async () => {
          await verifyItemOwnership(pool, itemA, companyB);
        },
        (err: Error) => {
          assert.ok(err instanceof CrossTenantAccessError, "Should throw CrossTenantAccessError");
          assert.ok(err.message.includes("Cross-tenant access forbidden") || err.message.includes("belongs to company"),
            "Error message should indicate cross-tenant violation");
          return true;
        }
      );
    });

    test("returns false when item does not exist", async () => {
      const nonExistentItemId = 999999999;
      const result = await verifyItemOwnership(pool, nonExistentItemId, companyA);
      assert.strictEqual(result, false, "Should return false for non-existent item");
    });

    test("cross-tenant error includes actual vs requested company info", async () => {
      try {
        await verifyItemOwnership(pool, itemA, companyB);
        assert.fail("Should have thrown CrossTenantAccessError");
      } catch (err) {
        assert.ok(err instanceof CrossTenantAccessError);
        const message = (err as Error).message;
        assert.ok(message.includes(String(companyA)), "Error should include actual company ID");
        assert.ok(message.includes(String(companyB)), "Error should include requested company ID");
      }
    });
  });

  // Close database pool after all tests
  test.after(async () => {
    await closeDbPool();
  });
});
