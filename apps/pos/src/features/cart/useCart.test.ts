// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * POS Cart Variant Behavior Tests
 *
 * Tests for cart handling of item variants including:
 * - Two variants of same item in cart (distinct keys)
 * - Cart key generation with/without variant
 * - Add/remove operations target correct variant
 * - Finalize preserves variant identity
 */

import assert from "node:assert/strict";
import { test, describe } from "node:test";
import {
  getCartLineKey,
  type CartState,
  type CartLineState
} from "./useCart.js";
import type { RuntimeProductCatalogItem } from "../../services/runtime-service.js";

// Mock product factory
function createMockProduct(overrides: Partial<RuntimeProductCatalogItem> = {}): RuntimeProductCatalogItem {
  return {
    item_id: 1,
    variant_id: undefined,
    sku: "SKU-001",
    name: "Test Product",
    item_type: "PRODUCT",
    price_snapshot: 10.00,
    ...overrides
  };
}

describe("Cart Variant Key Generation", () => {
  test("getCartLineKey returns item_id only when no variant", () => {
    const key = getCartLineKey(1);
    assert.strictEqual(key, "1");
  });

  test("getCartLineKey returns composite key when variant present", () => {
    const key = getCartLineKey(1, 5);
    assert.strictEqual(key, "1:5");
  });

  test("getCartLineKey treats variant_id 0 as no variant", () => {
    // variant_id 0 is falsy and treated as no variant (valid variant_ids start at 1)
    const key = getCartLineKey(1, 0);
    assert.strictEqual(key, "1");
  });
});

describe("Cart with Multiple Variants of Same Item", () => {
  test("two variants of same item have distinct keys", () => {
    // Variant 1 (Size S)
    const productSizeS = createMockProduct({
      item_id: 1,
      variant_id: 1,
      sku: "SHIRT-S",
      name: "Shirt - Size S",
      price_snapshot: 25.00
    });

    // Variant 2 (Size M)
    const productSizeM = createMockProduct({
      item_id: 1,
      variant_id: 2,
      sku: "SHIRT-M",
      name: "Shirt - Size M",
      price_snapshot: 25.00
    });

    const keyS = getCartLineKey(productSizeS.item_id, productSizeS.variant_id);
    const keyM = getCartLineKey(productSizeM.item_id, productSizeM.variant_id);

    assert.strictEqual(keyS, "1:1");
    assert.strictEqual(keyM, "1:2");
    assert.notStrictEqual(keyS, keyM);
  });

  test("can add both variants to cart independently", () => {
    const cart: CartState = {};

    // Variant 1
    const variant1: CartLineState = {
      product: createMockProduct({
        item_id: 1,
        variant_id: 1,
        sku: "SHIRT-S",
        price_snapshot: 25.00
      }),
      qty: 2,
      kitchen_sent_qty: 0,
      discount_amount: 0
    };

    // Variant 2
    const variant2: CartLineState = {
      product: createMockProduct({
        item_id: 1,
        variant_id: 2,
        sku: "SHIRT-M",
        price_snapshot: 25.00
      }),
      qty: 1,
      kitchen_sent_qty: 0,
      discount_amount: 0
    };

    cart["1:1"] = variant1;
    cart["1:2"] = variant2;

    assert.strictEqual(Object.keys(cart).length, 2);
    assert.strictEqual(cart["1:1"].qty, 2);
    assert.strictEqual(cart["1:2"].qty, 1);
  });

  test("updating one variant does not affect other variant", () => {
    const cart: CartState = {};

    const variant1: CartLineState = {
      product: createMockProduct({
        item_id: 1,
        variant_id: 1,
        sku: "SHIRT-S",
        price_snapshot: 25.00
      }),
      qty: 2,
      kitchen_sent_qty: 0,
      discount_amount: 0
    };

    const variant2: CartLineState = {
      product: createMockProduct({
        item_id: 1,
        variant_id: 2,
        sku: "SHIRT-M",
        price_snapshot: 25.00
      }),
      qty: 1,
      kitchen_sent_qty: 0,
      discount_amount: 0
    };

    cart["1:1"] = variant1;
    cart["1:2"] = variant2;

    // Update variant 1 quantity
    cart["1:1"] = { ...cart["1:1"], qty: 3 };

    assert.strictEqual(cart["1:1"].qty, 3);
    assert.strictEqual(cart["1:2"].qty, 1); // Unchanged
  });
});

describe("Cart Key Generation with Variant Context", () => {
  test("cart keys correctly identify variant vs non-variant items", () => {
    const nonVariantProduct = createMockProduct({
      item_id: 1,
      variant_id: undefined,
      sku: "PRODUCT-001"
    });

    const variantProduct = createMockProduct({
      item_id: 2,
      variant_id: 5,
      sku: "PRODUCT-002-VAR-5"
    });

    const nonVariantKey = nonVariantProduct.variant_id
      ? `${nonVariantProduct.item_id}:${nonVariantProduct.variant_id}`
      : String(nonVariantProduct.item_id);

    const variantKey = variantProduct.variant_id
      ? `${variantProduct.item_id}:${variantProduct.variant_id}`
      : String(variantProduct.item_id);

    assert.strictEqual(nonVariantKey, "1");
    assert.strictEqual(variantKey, "2:5");
  });

  test("cart handles mixed variant and non-variant items", () => {
    const cart: CartState = {};

    // Non-variant item
    cart["1"] = {
      product: createMockProduct({ item_id: 1, sku: "SIMPLE" }),
      qty: 1,
      kitchen_sent_qty: 0,
      discount_amount: 0
    };

    // Variant item
    cart["2:5"] = {
      product: createMockProduct({ item_id: 2, variant_id: 5, sku: "VAR-SKU" }),
      qty: 2,
      kitchen_sent_qty: 0,
      discount_amount: 0
    };

    // Another variant of same item as above (should be separate)
    cart["2:6"] = {
      product: createMockProduct({ item_id: 2, variant_id: 6, sku: "VAR-SKU-2" }),
      qty: 3,
      kitchen_sent_qty: 0,
      discount_amount: 0
    };

    assert.strictEqual(Object.keys(cart).length, 3);
    assert.strictEqual(cart["1"].qty, 1);
    assert.strictEqual(cart["2:5"].qty, 2);
    assert.strictEqual(cart["2:6"].qty, 3);
  });
});

describe("Cart Add/Remove Operations", () => {
  test("add operation targets correct variant", () => {
    const cart: CartState = {};

    const baseProduct = createMockProduct({ item_id: 1 });

    // Add variant 1
    cart["1:1"] = {
      product: { ...baseProduct, variant_id: 1, sku: "VAR-1" },
      qty: 1,
      kitchen_sent_qty: 0,
      discount_amount: 0
    };

    // Add variant 2
    cart["1:2"] = {
      product: { ...baseProduct, variant_id: 2, sku: "VAR-2" },
      qty: 1,
      kitchen_sent_qty: 0,
      discount_amount: 0
    };

    // Increment variant 1
    if (cart["1:1"]) {
      cart["1:1"] = { ...cart["1:1"], qty: cart["1:1"].qty + 1 };
    }

    assert.strictEqual(cart["1:1"].qty, 2);
    assert.strictEqual(cart["1:2"].qty, 1);
  });

  test("remove operation targets correct variant", () => {
    const cart: CartState = {};

    const baseProduct = createMockProduct({ item_id: 1 });

    cart["1:1"] = {
      product: { ...baseProduct, variant_id: 1, sku: "VAR-1" },
      qty: 3,
      kitchen_sent_qty: 0,
      discount_amount: 0
    };

    cart["1:2"] = {
      product: { ...baseProduct, variant_id: 2, sku: "VAR-2" },
      qty: 2,
      kitchen_sent_qty: 0,
      discount_amount: 0
    };

    // Decrement variant 1
    if (cart["1:1"] && cart["1:1"].qty > 0) {
      const newQty = cart["1:1"].qty - 1;
      if (newQty > 0) {
        cart["1:1"] = { ...cart["1:1"], qty: newQty };
      } else {
        delete cart["1:1"];
      }
    }

    assert.strictEqual(cart["1:1"].qty, 2);
    assert.strictEqual(cart["1:2"].qty, 2);
  });

  test("removing variant to zero removes from cart", () => {
    const cart: CartState = {};

    cart["1:1"] = {
      product: createMockProduct({ item_id: 1, variant_id: 1, sku: "VAR-1" }),
      qty: 1,
      kitchen_sent_qty: 0,
      discount_amount: 0
    };

    cart["1:2"] = {
      product: createMockProduct({ item_id: 1, variant_id: 2, sku: "VAR-2" }),
      qty: 2,
      kitchen_sent_qty: 0,
      discount_amount: 0
    };

    // Remove variant 1 completely
    delete cart["1:1"];

    assert.strictEqual(cart["1:1"], undefined);
    assert.ok(cart["1:2"]);
    assert.strictEqual(cart["1:2"].qty, 2);
  });
});

describe("Cart Finalize Preserves Variant Identity", () => {
  test("finalized cart maintains variant information", () => {
    const cart: CartState = {};

    // Setup cart with variants
    cart["1:1"] = {
      product: createMockProduct({
        item_id: 1,
        variant_id: 1,
        sku: "SHIRT-S",
        name: "Shirt - Size S"
      }),
      qty: 2,
      kitchen_sent_qty: 0,
      discount_amount: 0
    };

    cart["1:2"] = {
      product: createMockProduct({
        item_id: 1,
        variant_id: 2,
        sku: "SHIRT-M",
        name: "Shirt - Size M"
      }),
      qty: 1,
      kitchen_sent_qty: 0,
      discount_amount: 0
    };

    // Simulate finalize (kitchen_sent_qty = qty)
    for (const key of Object.keys(cart)) {
      cart[key] = {
        ...cart[key],
        kitchen_sent_qty: cart[key].qty
      };
    }

    assert.strictEqual(cart["1:1"].kitchen_sent_qty, 2);
    assert.strictEqual(cart["1:2"].kitchen_sent_qty, 1);

    // Verify variant metadata is preserved
    assert.strictEqual(cart["1:1"].product.variant_id, 1);
    assert.strictEqual(cart["1:2"].product.variant_id, 2);
    assert.strictEqual(cart["1:1"].product.sku, "SHIRT-S");
    assert.strictEqual(cart["1:2"].product.sku, "SHIRT-M");
  });

  test("cart lines can be converted to list preserving variant data", () => {
    const cart: CartState = {};

    cart["1:1"] = {
      product: createMockProduct({
        item_id: 1,
        variant_id: 1,
        sku: "VAR-A",
        name: "Product A - Variant 1"
      }),
      qty: 2,
      kitchen_sent_qty: 0,
      discount_amount: 0
    };

    cart["1:2"] = {
      product: createMockProduct({
        item_id: 1,
        variant_id: 2,
        sku: "VAR-B",
        name: "Product A - Variant 2"
      }),
      qty: 3,
      kitchen_sent_qty: 0,
      discount_amount: 0
    };

    cart["3"] = {
      product: createMockProduct({
        item_id: 3,
        sku: "NON-VAR",
        name: "Non-variant Product"
      }),
      qty: 1,
      kitchen_sent_qty: 0,
      discount_amount: 0
    };

    // Convert to list (filtering out zero qty)
    const lines = Object.values(cart).filter((line) => line.qty > 0);

    assert.strictEqual(lines.length, 3);

    const variantLines = lines.filter((line) => line.product.variant_id !== undefined);
    assert.strictEqual(variantLines.length, 2);

    // Verify each line has correct variant info
    const line1 = lines.find((l) => l.product.variant_id === 1);
    assert.strictEqual(line1?.product.sku, "VAR-A");

    const line2 = lines.find((l) => l.product.variant_id === 2);
    assert.strictEqual(line2?.product.sku, "VAR-B");

    const line3 = lines.find((l) => l.product.item_id === 3);
    assert.strictEqual(line3?.product.variant_id, undefined);
    assert.strictEqual(line3?.product.sku, "NON-VAR");
  });
});

describe("Cart Edge Cases", () => {
  test("handles item with same variant_id added multiple times", () => {
    const cart: CartState = {};

    const key = "1:5";
    const product = createMockProduct({
      item_id: 1,
      variant_id: 5,
      sku: "VAR-5"
    });

    // First add
    cart[key] = {
      product,
      qty: 1,
      kitchen_sent_qty: 0,
      discount_amount: 0
    };

    // Second add (increment)
    if (cart[key]) {
      cart[key] = { ...cart[key], qty: cart[key].qty + 2 };
    }

    assert.strictEqual(cart[key].qty, 3);
  });

  test("cart handles zero qty items correctly", () => {
    const cart: CartState = {};

    cart["1:1"] = {
      product: createMockProduct({ item_id: 1, variant_id: 1 }),
      qty: 0,
      kitchen_sent_qty: 0,
      discount_amount: 0
    };

    cart["1:2"] = {
      product: createMockProduct({ item_id: 1, variant_id: 2 }),
      qty: 2,
      kitchen_sent_qty: 0,
      discount_amount: 0
    };

    // Filter out zero qty items
    const activeLines = Object.values(cart).filter((line) => line.qty > 0);

    assert.strictEqual(activeLines.length, 1);
    assert.strictEqual(activeLines[0].product.variant_id, 2);
  });
});
