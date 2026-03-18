// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Story 4.7 Scope F: Targeted regression tests for variant fixes
// Tests variant stock validation, reservation safety, and sync integration

import assert from "node:assert/strict";
import { test } from "node:test";
import "fake-indexeddb/auto";

import { createPosOfflineDb } from "@jurnapod/offline-db/dexie";
import {
  checkStockAvailability,
  validateStockForItems,
  reserveStock,
  releaseStock
} from "../../services/stock.ts";
import { completeSale, createSaleDraft } from "../sales.ts";
import { InsufficientStockError } from "@jurnapod/offline-db/dexie";

const TEST_COMPANY_ID = 1;
const TEST_OUTLET_ID = 10;

function nowIso() {
  return new Date().toISOString();
}

function createProductSnapshot(companyId, outletId, itemId, trackStock = true) {
  const timestamp = nowIso();
  return {
    pk: `${companyId}:${outletId}:${itemId}`,
    company_id: companyId,
    outlet_id: outletId,
    item_id: itemId,
    sku: `SKU-${itemId}`,
    name: `Test Product ${itemId}`,
    item_type: "PRODUCT",
    price_snapshot: 10000,
    is_active: true,
    item_updated_at: timestamp,
    price_updated_at: timestamp,
    data_version: 1,
    pulled_at: timestamp,
    track_stock: trackStock,
    low_stock_threshold: 5
  };
}

function createVariantSnapshot(companyId, outletId, variantId, itemId, stockQty) {
  const timestamp = nowIso();
  return {
    pk: `${companyId}:${outletId}:${variantId}`,
    company_id: companyId,
    outlet_id: outletId,
    item_id: itemId,
    variant_id: variantId,
    sku: `VAR-${variantId}`,
    variant_name: `Variant ${variantId}`,
    price: 15000,
    barcode: null,
    is_active: true,
    attributes: { color: "Red", size: "M" },
    stock_quantity: stockQty,
    data_version: 1,
    pulled_at: timestamp
  };
}

function createInventoryStock(companyId, outletId, itemId, qty) {
  return {
    pk: `${companyId}:${outletId}:${itemId}`,
    company_id: companyId,
    outlet_id: outletId,
    item_id: itemId,
    quantity_on_hand: qty,
    quantity_reserved: 0,
    quantity_available: qty,
    last_updated_at: nowIso(),
    data_version: 1
  };
}

// ============================================================================
// Scope B & C: Variant stock validation with reservations
// ============================================================================

test("variant stock check accounts for existing reservations (Scope C fix)", async () => {
  const db = createPosOfflineDb(`variant-stock-test-${crypto.randomUUID()}`);

  try {
    // Setup variant with 50 stock
    await db.variants_cache.add(createVariantSnapshot(
      TEST_COMPANY_ID, TEST_OUTLET_ID, 100, 1, 50
    ));

    // Create existing reservation for 20 units
    await db.stock_reservations.add({
      reservation_id: crypto.randomUUID(),
      sale_id: crypto.randomUUID(),
      company_id: TEST_COMPANY_ID,
      outlet_id: TEST_OUTLET_ID,
      item_id: 1,
      variant_id: 100,
      quantity: 20,
      created_at: nowIso(),
      expires_at: null
    });

    // Try to request 35 units (50 - 20 reserved = 30 available, should fail)
    const result = await checkStockAvailability({
      itemId: 1,
      quantity: 35,
      companyId: TEST_COMPANY_ID,
      outletId: TEST_OUTLET_ID,
      variantId: 100
    }, db);

    assert.equal(result.available, false);
    assert.equal(result.quantityOnHand, 50);
    assert.equal(result.quantityReserved, 20);
    assert.equal(result.quantityAvailable, -5); // 30 - 35
  } finally {
    await db.delete();
  }
});

test("variant stock check allows purchase when sufficient stock after reservations", async () => {
  const db = createPosOfflineDb(`variant-stock-ok-test-${crypto.randomUUID()}`);

  try {
    await db.variants_cache.add(createVariantSnapshot(
      TEST_COMPANY_ID, TEST_OUTLET_ID, 101, 2, 100
    ));

    // Reserve 30 units
    await db.stock_reservations.add({
      reservation_id: crypto.randomUUID(),
      sale_id: crypto.randomUUID(),
      company_id: TEST_COMPANY_ID,
      outlet_id: TEST_OUTLET_ID,
      item_id: 2,
      variant_id: 101,
      quantity: 30,
      created_at: nowIso(),
      expires_at: null
    });

    // Request 50 units (100 - 30 = 70 available, should pass)
    const result = await checkStockAvailability({
      itemId: 2,
      quantity: 50,
      companyId: TEST_COMPANY_ID,
      outletId: TEST_OUTLET_ID,
      variantId: 101
    }, db);

    assert.equal(result.available, true);
    assert.equal(result.quantityOnHand, 100);
    assert.equal(result.quantityReserved, 30);
    assert.equal(result.quantityAvailable, 20); // 70 - 50
  } finally {
    await db.delete();
  }
});

test("multiple variant reservations prevent overselling (Scope C safety)", async () => {
  const db = createPosOfflineDb(`variant-oversell-test-${crypto.randomUUID()}`);

  try {
    // Variant with only 10 units
    await db.variants_cache.add(createVariantSnapshot(
      TEST_COMPANY_ID, TEST_OUTLET_ID, 102, 3, 10
    ));

    // Create 2 existing reservations (4 + 3 = 7 units)
    await db.stock_reservations.bulkAdd([
      {
        reservation_id: crypto.randomUUID(),
        sale_id: crypto.randomUUID(),
        company_id: TEST_COMPANY_ID,
        outlet_id: TEST_OUTLET_ID,
        item_id: 3,
        variant_id: 102,
        quantity: 4,
        created_at: nowIso(),
        expires_at: null
      },
      {
        reservation_id: crypto.randomUUID(),
        sale_id: crypto.randomUUID(),
        company_id: TEST_COMPANY_ID,
        outlet_id: TEST_OUTLET_ID,
        item_id: 3,
        variant_id: 102,
        quantity: 3,
        created_at: nowIso(),
        expires_at: null
      }
    ]);

    // Try to validate 5 more units (10 - 7 = 3 available, should fail)
    await assert.rejects(
      validateStockForItems({
        items: [{ itemId: 3, variantId: 102, quantity: 5 }],
        companyId: TEST_COMPANY_ID,
        outletId: TEST_OUTLET_ID
      }, db),
      InsufficientStockError
    );
  } finally {
    await db.delete();
  }
});

// ============================================================================
// Scope A & D: End-to-end variant flow through sale completion
// ============================================================================

test("complete sale with variant preserves variant_id through outbox (Scope A/D)", async () => {
  const db = createPosOfflineDb(`variant-e2e-test-${crypto.randomUUID()}`);

  try {
    // Setup product and variant
    await db.products_cache.add(createProductSnapshot(TEST_COMPANY_ID, TEST_OUTLET_ID, 200));
    await db.variants_cache.add(createVariantSnapshot(
      TEST_COMPANY_ID, TEST_OUTLET_ID, 500, 200, 100
    ));
    await db.inventory_stock.add(createInventoryStock(
      TEST_COMPANY_ID, TEST_OUTLET_ID, 200, 100
    ));

    // Create sale draft
    const draft = await createSaleDraft(
      {
        company_id: TEST_COMPANY_ID,
        outlet_id: TEST_OUTLET_ID,
        cashier_user_id: 55
      },
      db
    );

    // Complete sale with variant
    await completeSale({
      sale_id: draft.sale_id,
      items: [{ item_id: 200, variant_id: 500, qty: 5 }],
      payments: [{ method: "CASH", amount: 75000 }],
      totals: {
        subtotal: 75000,
        discount_total: 0,
        discount_percent: 0,
        discount_fixed: 0,
        tax_total: 0,
        grand_total: 75000,
        paid_total: 75000,
        change_total: 0
      }
    }, db);

    // Verify sale was completed successfully
    const completedSale = await db.sales.get(draft.sale_id);
    assert.equal(completedSale?.status, "COMPLETED");

    // Verify sale items have variant_id
    const saleItems = await db.sale_items.where("sale_id").equals(draft.sale_id).toArray();
    assert.equal(saleItems.length, 1);
    assert.equal(saleItems[0]?.variant_id, 500);

    // Verify outbox job was created for sync
    const outboxCount = await db.outbox_jobs.count();
    assert.equal(outboxCount, 1);
  } finally {
    await db.delete();
  }
});

test("variant reservation created during sale completion (Scope C)", async () => {
  const db = createPosOfflineDb(`variant-reservation-test-${crypto.randomUUID()}`);

  try {
    // Setup
    await db.products_cache.add(createProductSnapshot(TEST_COMPANY_ID, TEST_OUTLET_ID, 300));
    await db.variants_cache.add(createVariantSnapshot(
      TEST_COMPANY_ID, TEST_OUTLET_ID, 600, 300, 50
    ));
    await db.inventory_stock.add(createInventoryStock(
      TEST_COMPANY_ID, TEST_OUTLET_ID, 300, 50
    ));

    const draft = await createSaleDraft(
      {
        company_id: TEST_COMPANY_ID,
        outlet_id: TEST_OUTLET_ID,
        cashier_user_id: 55
      },
      db
    );

    // Complete sale with 10 units of variant
    await completeSale({
      sale_id: draft.sale_id,
      items: [{ item_id: 300, variant_id: 600, qty: 10 }],
      payments: [{ method: "CASH", amount: 150000 }],
      totals: {
        subtotal: 150000,
        discount_total: 0,
        discount_percent: 0,
        discount_fixed: 0,
        tax_total: 0,
        grand_total: 150000,
        paid_total: 150000,
        change_total: 0
      }
    }, db);

    // Verify reservation was created with variant_id
    const reservations = await db.stock_reservations
      .where("sale_id")
      .equals(draft.sale_id)
      .toArray();
    
    assert.equal(reservations.length, 1);
    assert.equal(reservations[0]?.variant_id, 600);
    assert.equal(reservations[0]?.quantity, 10);
  } finally {
    await db.delete();
  }
});

// ============================================================================
// Mixed cart scenarios
// ============================================================================

test("mixed cart with variant and non-variant items validates correctly", async () => {
  const db = createPosOfflineDb(`mixed-cart-test-${crypto.randomUUID()}`);

  try {
    // Non-variant product
    await db.products_cache.add(createProductSnapshot(TEST_COMPANY_ID, TEST_OUTLET_ID, 400));
    await db.inventory_stock.add(createInventoryStock(
      TEST_COMPANY_ID, TEST_OUTLET_ID, 400, 200
    ));

    // Variant product
    await db.products_cache.add(createProductSnapshot(TEST_COMPANY_ID, TEST_OUTLET_ID, 401));
    await db.variants_cache.add(createVariantSnapshot(
      TEST_COMPANY_ID, TEST_OUTLET_ID, 700, 401, 50
    ));

    // Should validate both without throwing
    await assert.doesNotReject(
      validateStockForItems({
        items: [
          { itemId: 400, quantity: 100 }, // Non-variant, 200 available
          { itemId: 401, variantId: 700, quantity: 25 } // Variant, 50 available
        ],
        companyId: TEST_COMPANY_ID,
        outletId: TEST_OUTLET_ID
      }, db)
    );
  } finally {
    await db.delete();
  }
});

// ============================================================================
// Edge cases
// ============================================================================

test("variant stock check returns unavailable when variant not in cache", async () => {
  const db = createPosOfflineDb(`variant-missing-test-${crypto.randomUUID()}`);

  try {
    // Don't add variant to cache - simulates sync not yet completed
    const result = await checkStockAvailability({
      itemId: 999,
      quantity: 10,
      companyId: TEST_COMPANY_ID,
      outletId: TEST_OUTLET_ID,
      variantId: 9999
    }, db);

    assert.equal(result.available, false);
    assert.equal(result.quantityOnHand, 0);
    assert.equal(result.trackStock, true);
  } finally {
    await db.delete();
  }
});

test("variant with zero stock is correctly identified as unavailable", async () => {
  const db = createPosOfflineDb(`variant-zero-stock-test-${crypto.randomUUID()}`);

  try {
    await db.variants_cache.add(createVariantSnapshot(
      TEST_COMPANY_ID, TEST_OUTLET_ID, 800, 500, 0 // Zero stock
    ));

    const result = await checkStockAvailability({
      itemId: 500,
      quantity: 1,
      companyId: TEST_COMPANY_ID,
      outletId: TEST_OUTLET_ID,
      variantId: 800
    }, db);

    assert.equal(result.available, false);
    assert.equal(result.quantityOnHand, 0);
  } finally {
    await db.delete();
  }
});
