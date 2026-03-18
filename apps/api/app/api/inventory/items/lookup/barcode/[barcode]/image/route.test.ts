// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { handleBarcodeImageLookup } from "./route";

const auth = { companyId: 77 };

describe("barcode image lookup handler", () => {
  test("returns 400 when barcode has invalid URL encoding", async () => {
    const request = new Request("http://localhost:3000/api/inventory/items/lookup/barcode/%E0%A4%A/image");

    const response = await handleBarcodeImageLookup(request, auth, {
      findItemsByBarcodeFn: async () => [],
      getItemThumbnailFn: async () => null
    });

    assert.strictEqual(response.status, 400);
    const payload = await response.json();
    assert.strictEqual(payload.success, false);
    assert.strictEqual(payload.error.code, "INVALID_REQUEST");
  });

  test("returns 404 when barcode is not found", async () => {
    const request = new Request("http://localhost:3000/api/inventory/items/lookup/barcode/NOTFOUND/image");

    let capturedCompanyId: number | null = null;
    let capturedBarcode: string | null = null;

    const response = await handleBarcodeImageLookup(request, auth, {
      findItemsByBarcodeFn: async (companyId, barcode) => {
        capturedCompanyId = companyId;
        capturedBarcode = barcode;
        return [];
      },
      getItemThumbnailFn: async () => null
    });

    assert.strictEqual(capturedCompanyId, auth.companyId);
    assert.strictEqual(capturedBarcode, "NOTFOUND");
    assert.strictEqual(response.status, 404);
    const payload = await response.json();
    assert.strictEqual(payload.success, false);
    assert.strictEqual(payload.error.code, "BARCODE_NOT_FOUND");
  });

  test("returns 409 for ambiguous barcode matches", async () => {
    const request = new Request("http://localhost:3000/api/inventory/items/lookup/barcode/AMBIG/image");

    const response = await handleBarcodeImageLookup(request, auth, {
      findItemsByBarcodeFn: async () => [
        {
          id: 10,
          name: "Item A",
          sku: "SKU-A",
          barcode: "AMBIG",
          thumbnail_url: "/uploads/a-thumb.jpg"
        },
        {
          id: 11,
          name: "Item B",
          sku: "SKU-B",
          barcode: "AMBIG",
          thumbnail_url: "/uploads/b-thumb.jpg"
        }
      ] as any,
      getItemThumbnailFn: async () => null
    });

    assert.strictEqual(response.status, 409);
    const payload = await response.json();
    assert.strictEqual(payload.success, false);
    assert.strictEqual(payload.error.code, "AMBIGUOUS_BARCODE");
    assert.strictEqual(payload.error.candidates.length, 2);
  });

  test("returns 404 when item exists but thumbnail is missing", async () => {
    const request = new Request("http://localhost:3000/api/inventory/items/lookup/barcode/123/image");

    const response = await handleBarcodeImageLookup(request, auth, {
      findItemsByBarcodeFn: async () => [
        {
          id: 55,
          name: "Test Item",
          sku: "ITEM-55",
          barcode: "123",
          thumbnail_url: null,
          variants: []
        }
      ] as any,
      getItemThumbnailFn: async () => null
    });

    assert.strictEqual(response.status, 404);
    const payload = await response.json();
    assert.strictEqual(payload.success, false);
    assert.strictEqual(payload.error.code, "IMAGE_NOT_FOUND");
  });

  test("returns 200 with variant payload when variant barcode matches", async () => {
    const request = new Request("http://localhost:3000/api/inventory/items/lookup/barcode/VAR-001/image");

    const response = await handleBarcodeImageLookup(request, auth, {
      findItemsByBarcodeFn: async () => [
        {
          id: 77,
          name: "Coffee",
          sku: "COFFEE-BASE",
          barcode: "BASE-001",
          thumbnail_url: "/uploads/base-thumb.jpg",
          variants: [
            {
              id: 501,
              item_id: 77,
              sku: "COFFEE-LARGE",
              variant_name: "Large",
              barcode: "VAR-001",
              price: 25000
            }
          ]
        }
      ] as any,
      getItemThumbnailFn: async () => "/uploads/coffee-thumb.jpg"
    });

    assert.strictEqual(response.status, 200);
    const payload = await response.json();
    assert.strictEqual(payload.success, true);
    assert.strictEqual(payload.data.item_id, 77);
    assert.strictEqual(payload.data.sku, "COFFEE-LARGE");
    assert.strictEqual(payload.data.thumbnail_url, "/uploads/coffee-thumb.jpg");
    assert.strictEqual(payload.data.variant.id, 501);
    assert.strictEqual(payload.data.variant.variant_name, "Large");
  });

  test("returns 200 with parent sku when no variant matches barcode", async () => {
    const request = new Request("http://localhost:3000/api/inventory/items/lookup/barcode/BASE-001/image");

    const response = await handleBarcodeImageLookup(request, auth, {
      findItemsByBarcodeFn: async () => [
        {
          id: 88,
          name: "Tea",
          sku: "TEA-BASE",
          barcode: "BASE-001",
          thumbnail_url: "/uploads/tea-thumb.jpg",
          variants: [
            {
              id: 601,
              item_id: 88,
              sku: "TEA-LARGE",
              variant_name: "Large",
              barcode: "VAR-TEA-001",
              price: 17000
            }
          ]
        }
      ] as any,
      getItemThumbnailFn: async () => "/uploads/tea-thumb.jpg"
    });

    assert.strictEqual(response.status, 200);
    const payload = await response.json();
    assert.strictEqual(payload.success, true);
    assert.strictEqual(payload.data.sku, "TEA-BASE");
    assert.strictEqual(payload.data.variant, undefined);
  });
});
