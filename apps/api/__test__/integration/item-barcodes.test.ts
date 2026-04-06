// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { describe, it, test } from 'vitest';
import assert from "node:assert";
import {
  validateBarcode,
  validateEAN13,
  validateUPCA,
  validateCode128,
  detectBarcodeType,
} from "../../src/lib/item-barcodes";

describe("Barcode Validation", () => {
  describe("EAN-13 Validation", () => {
    test("valid EAN-13 passes checksum", () => {
      // Valid EAN-13: 4006381333931
      assert.strictEqual(validateEAN13("4006381333931"), true);
    });

    test("invalid EAN-13 fails checksum", () => {
      assert.strictEqual(validateEAN13("4006381333932"), false);
    });

    test("non-13-digit EAN-13 fails", () => {
      assert.strictEqual(validateEAN13("123456789012"), false);
    });

    test("EAN-13 with letters fails", () => {
      assert.strictEqual(validateEAN13("400638133393A"), false);
    });
  });

  describe("UPC-A Validation", () => {
    test("valid UPC-A passes checksum", () => {
      // Valid UPC-A: 036000291452
      assert.strictEqual(validateUPCA("036000291452"), true);
    });

    test("invalid UPC-A fails checksum", () => {
      assert.strictEqual(validateUPCA("036000291453"), false);
    });

    test("non-12-digit UPC-A fails", () => {
      assert.strictEqual(validateUPCA("12345678901"), false);
    });
  });

  describe("Code128 Validation", () => {
    test("alphanumeric Code128 passes", () => {
      assert.strictEqual(validateCode128("ABC123"), true);
    });

    test("Code128 with allowed special chars passes", () => {
      assert.strictEqual(validateCode128("ABC-123.456_DEF"), true);
    });

    test("empty Code128 passes", () => {
      assert.strictEqual(validateCode128("A"), true);
    });

    test("Code128 with 48 chars passes", () => {
      assert.strictEqual(validateCode128("A".repeat(48)), true);
    });

    test("Code128 over 48 chars fails", () => {
      assert.strictEqual(validateCode128("A".repeat(49)), false);
    });

    test("Code128 with invalid chars fails", () => {
      assert.strictEqual(validateCode128("ABC@123"), false);
    });
  });

  describe("Barcode Type Detection", () => {
    test("detects EAN-13", () => {
      assert.strictEqual(detectBarcodeType("4006381333931"), "EAN13");
    });

    test("detects UPC-A", () => {
      assert.strictEqual(detectBarcodeType("036000291452"), "UPCA");
    });

    test("detects Code128", () => {
      assert.strictEqual(detectBarcodeType("ABC-123"), "CODE128");
    });

    test("detects CUSTOM for other formats", () => {
      assert.strictEqual(detectBarcodeType("ABC@123"), "CUSTOM");
    });
  });

  describe("General Barcode Validation", () => {
    test("valid EAN-13 with auto-detection", () => {
      const result = validateBarcode("4006381333931");
      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.type, "EAN13");
    });

    test("valid UPC-A with explicit type", () => {
      const result = validateBarcode("036000291452", "UPCA");
      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.type, "UPCA");
    });

    test("invalid EAN-13 checksum returns error", () => {
      const result = validateBarcode("4006381333932");
      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.type, "EAN13");
      assert.ok(result.error?.includes("checksum"));
    });

    test("empty barcode returns error", () => {
      const result = validateBarcode("");
      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.type, null);
      assert.ok(result.error?.includes("empty"));
    });

    test("Code128 with explicit type", () => {
      const result = validateBarcode("ABC-123", "CODE128");
      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.type, "CODE128");
    });

    test("CUSTOM barcode accepts any format", () => {
      const result = validateBarcode("MY-CUSTOM-BARCODE-123", "CUSTOM");
      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.type, "CUSTOM");
    });

    test("CUSTOM barcode over 100 chars fails", () => {
      const result = validateBarcode("A".repeat(101), "CUSTOM");
      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.type, "CUSTOM");
      assert.ok(result.error?.includes("100"));
    });
  });
});
