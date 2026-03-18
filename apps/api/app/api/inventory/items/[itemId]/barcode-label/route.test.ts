// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import assert from "node:assert/strict";
import { test, describe, before } from "node:test";
import { existsSync } from "node:fs";
import { isValidFormat, isValidSize, getBwipFormat, getSizeConfig, generateBarcode } from "./route";
import type { BarcodeType } from "@/lib/item-barcodes";

/**
 * Check if Chrome/Chromium is available for PDF generation tests
 */
function isChromeAvailable(): boolean {
  const chromePaths = [
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/snap/bin/chromium",
    process.env.PUPPETEER_EXECUTABLE_PATH || "",
  ].filter(Boolean);
  
  return chromePaths.some((path) => existsSync(path));
}

// Track if Chrome is available for conditional test skipping
let chromeAvailable = false;

describe("Barcode Label Route Unit Tests", () => {
  before(() => {
    chromeAvailable = isChromeAvailable();
    if (!chromeAvailable) {
      console.log("Skipping PDF tests: Chrome/Chromium not available in test environment");
    }
  });
  describe("Format Validation", () => {
    test("accepts 'svg' as valid format", () => {
      assert.strictEqual(isValidFormat("svg"), true);
    });

    test("accepts 'png' as valid format", () => {
      assert.strictEqual(isValidFormat("png"), true);
    });

    test("accepts 'pdf' as valid format", () => {
      assert.strictEqual(isValidFormat("pdf"), true);
    });

    test("rejects invalid formats", () => {
      assert.strictEqual(isValidFormat("jpg"), false);
      assert.strictEqual(isValidFormat("gif"), false);
      assert.strictEqual(isValidFormat(""), false);
      assert.strictEqual(isValidFormat("SVG"), false); // Case-sensitive
      assert.strictEqual(isValidFormat("PNG"), false); // Case-sensitive
      assert.strictEqual(isValidFormat("PDF"), false); // Case-sensitive
    });
  });

  describe("Size Validation", () => {
    test("accepts '2x1' as valid size", () => {
      assert.strictEqual(isValidSize("2x1"), true);
    });

    test("accepts '3x2' as valid size", () => {
      assert.strictEqual(isValidSize("3x2"), true);
    });

    test("accepts 'a4' as valid size", () => {
      assert.strictEqual(isValidSize("a4"), true);
    });

    test("rejects invalid sizes", () => {
      assert.strictEqual(isValidSize("letter"), false);
      assert.strictEqual(isValidSize("4x6"), false);
      assert.strictEqual(isValidSize(""), false);
      assert.strictEqual(isValidSize("A4"), false); // Case-sensitive
      assert.strictEqual(isValidSize("2X1"), false); // Case-sensitive
    });
  });

  describe("Size Configuration", () => {
    test("returns correct config for 2x1 size", () => {
      const config = getSizeConfig("2x1");
      assert.strictEqual(config.scale, 2);
      assert.strictEqual(config.height, 8);
      assert.strictEqual(config.padding, 4);
    });

    test("returns correct config for 3x2 size", () => {
      const config = getSizeConfig("3x2");
      assert.strictEqual(config.scale, 3);
      assert.strictEqual(config.height, 12);
      assert.strictEqual(config.padding, 6);
    });

    test("returns correct config for a4 size", () => {
      const config = getSizeConfig("a4");
      assert.strictEqual(config.scale, 4);
      assert.strictEqual(config.height, 16);
      assert.strictEqual(config.padding, 8);
    });

    test("returns default config for null size", () => {
      const config = getSizeConfig(null);
      assert.strictEqual(config.scale, 3);
      assert.strictEqual(config.height, 10);
      assert.strictEqual(config.padding, 4);
    });
  });

  describe("Barcode Type Mapping", () => {
    test("maps EAN13 to ean13", () => {
      assert.strictEqual(getBwipFormat("EAN13"), "ean13");
    });

    test("maps UPCA to upca", () => {
      assert.strictEqual(getBwipFormat("UPCA"), "upca");
    });

    test("maps CODE128 to code128", () => {
      assert.strictEqual(getBwipFormat("CODE128"), "code128");
    });

    test("maps CUSTOM to code128", () => {
      assert.strictEqual(getBwipFormat("CUSTOM"), "code128");
    });

    test("maps null to code128", () => {
      assert.strictEqual(getBwipFormat(null), "code128");
    });

    test("maps unknown types to code128", () => {
      assert.strictEqual(getBwipFormat("UNKNOWN" as BarcodeType), "code128");
    });
  });

  describe("Barcode Generation", () => {
    describe("EAN-13", () => {
      test("generates EAN-13 barcode in SVG format", async () => {
        const result = await generateBarcode("4006381333931", "EAN13", "svg");
        assert.strictEqual(result.contentType, "image/svg+xml");
        assert.strictEqual(typeof result.data, "string");
        // SVG output is a valid SVG document with barcode paths
        assert.ok((result.data as string).includes("<svg"));
        assert.ok((result.data as string).includes("xmlns="));
        assert.ok((result.data as string).includes("<path"));
      });

      test("generates EAN-13 barcode in PNG format", async () => {
        const result = await generateBarcode("4006381333931", "EAN13", "png");
        assert.strictEqual(result.contentType, "image/png");
        assert.ok(Buffer.isBuffer(result.data));
        assert.ok((result.data as Buffer).length > 0);
        // PNG magic bytes
        assert.strictEqual((result.data as Buffer)[0], 0x89);
        assert.strictEqual((result.data as Buffer)[1], 0x50);
      });
    });

    describe("UPC-A", () => {
      test("generates UPC-A barcode in SVG format", async () => {
        const result = await generateBarcode("036000291452", "UPCA", "svg");
        assert.strictEqual(result.contentType, "image/svg+xml");
        assert.strictEqual(typeof result.data, "string");
        assert.ok((result.data as string).includes("<svg"));
        assert.ok((result.data as string).includes("xmlns="));
        assert.ok((result.data as string).includes("<path"));
      });

      test("generates UPC-A barcode in PNG format", async () => {
        const result = await generateBarcode("036000291452", "UPCA", "png");
        assert.strictEqual(result.contentType, "image/png");
        assert.ok(Buffer.isBuffer(result.data));
        assert.ok((result.data as Buffer).length > 0);
      });
    });

    describe("Code128", () => {
      test("generates Code128 barcode in SVG format", async () => {
        const result = await generateBarcode("ABC-123-TEST", "CODE128", "svg");
        assert.strictEqual(result.contentType, "image/svg+xml");
        assert.strictEqual(typeof result.data, "string");
        assert.ok((result.data as string).includes("<svg"));
        assert.ok((result.data as string).includes("xmlns="));
        assert.ok((result.data as string).includes("<path"));
      });

      test("generates Code128 barcode in PNG format", async () => {
        const result = await generateBarcode("ABC-123-TEST", "CODE128", "png");
        assert.strictEqual(result.contentType, "image/png");
        assert.ok(Buffer.isBuffer(result.data));
        assert.ok((result.data as Buffer).length > 0);
      });
    });

    describe("Default handling (null type)", () => {
      test("generates barcode with null type using Code128", async () => {
        const result = await generateBarcode("ANY-VALUE-123", null, "svg");
        assert.strictEqual(result.contentType, "image/svg+xml");
        assert.strictEqual(typeof result.data, "string");
        assert.ok((result.data as string).includes("<svg"));
      });
    });

    describe("Alphanumeric content", () => {
      test("handles alphanumeric Code128 content", async () => {
        const result = await generateBarcode("SKU-2024-ABC-001", "CODE128", "svg");
        assert.strictEqual(result.contentType, "image/svg+xml");
        assert.ok((result.data as string).includes("<svg"));
      });
    });

    describe("PDF Format", { skip: !chromeAvailable }, () => {
      test("generates EAN-13 barcode in PDF format", async () => {
        const result = await generateBarcode("4006381333931", "EAN13", "pdf");
        assert.strictEqual(result.contentType, "application/pdf");
        assert.ok(Buffer.isBuffer(result.data));
        assert.ok((result.data as Buffer).length > 0);
        // PDF magic bytes
        assert.strictEqual((result.data as Buffer)[0], 0x25); // '%'
        assert.strictEqual((result.data as Buffer)[1], 0x50); // 'P'
      });

      test("generates UPC-A barcode in PDF format", async () => {
        const result = await generateBarcode("036000291452", "UPCA", "pdf");
        assert.strictEqual(result.contentType, "application/pdf");
        assert.ok(Buffer.isBuffer(result.data));
        assert.ok((result.data as Buffer).length > 0);
      });

      test("generates Code128 barcode in PDF format", async () => {
        const result = await generateBarcode("ABC-123-TEST", "CODE128", "pdf");
        assert.strictEqual(result.contentType, "application/pdf");
        assert.ok(Buffer.isBuffer(result.data));
        assert.ok((result.data as Buffer).length > 0);
      });
    });

    describe("Size Handling", () => {
      test("generates barcode with 2x1 size", async () => {
        const result = await generateBarcode("4006381333931", "EAN13", "svg", "2x1");
        assert.strictEqual(result.contentType, "image/svg+xml");
        assert.strictEqual(typeof result.data, "string");
        assert.ok((result.data as string).includes("<svg"));
      });

      test("generates barcode with 3x2 size", async () => {
        const result = await generateBarcode("036000291452", "UPCA", "png", "3x2");
        assert.strictEqual(result.contentType, "image/png");
        assert.ok(Buffer.isBuffer(result.data));
      });

      test("generates barcode with a4 size", async () => {
        const result = await generateBarcode("ABC-123-TEST", "CODE128", "svg", "a4");
        assert.strictEqual(result.contentType, "image/svg+xml");
        assert.strictEqual(typeof result.data, "string");
      });

      test("generates barcode with PDF and size combination", { skip: !chromeAvailable }, async () => {
        const result = await generateBarcode("4006381333931", "EAN13", "pdf", "2x1");
        assert.strictEqual(result.contentType, "application/pdf");
        assert.ok(Buffer.isBuffer(result.data));
      });
    });
  });
});
