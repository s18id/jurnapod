// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { posDb, type PosOfflineDb } from "@jurnapod/offline-db/dexie";
import {
  checkStockAvailability,
  validateStockForItems,
  reserveStock,
  releaseStock,
  releaseExpiredReservations,
  updateStockFromSync,
  getStockStatus
} from "../services/stock.js";
import { InsufficientStockError, StockValidationError } from "@jurnapod/offline-db/dexie";

const TEST_COMPANY_ID = 1;
const TEST_OUTLET_ID = 1;

describe("Stock Service", () => {
  beforeEach(async () => {
    // Clear test data
    await posDb.inventory_stock.clear();
    await posDb.stock_reservations.clear();
    await posDb.products_cache.clear();
    await posDb.variants_cache.clear();
  });

  afterEach(async () => {
    // Cleanup
    await posDb.inventory_stock.clear();
    await posDb.stock_reservations.clear();
    await posDb.products_cache.clear();
    await posDb.variants_cache.clear();
  });

  describe("checkStockAvailability", () => {
    it("should return available=true when product does not track stock", async () => {
      // Setup product without stock tracking
      await posDb.products_cache.add({
        pk: `${TEST_COMPANY_ID}:${TEST_OUTLET_ID}:1`,
        company_id: TEST_COMPANY_ID,
        outlet_id: TEST_OUTLET_ID,
        item_id: 1,
        sku: "TEST001",
        name: "Test Product",
        item_type: "PRODUCT",
        price_snapshot: 100,
        is_active: true,
        item_updated_at: new Date().toISOString(),
        price_updated_at: new Date().toISOString(),
        data_version: 1,
        pulled_at: new Date().toISOString(),
        track_stock: false,
        low_stock_threshold: 0
      });

      const result = await checkStockAvailability({
        itemId: 1,
        quantity: 100,
        companyId: TEST_COMPANY_ID,
        outletId: TEST_OUTLET_ID
      });

      expect(result.available).toBe(true);
      expect(result.trackStock).toBe(false);
    });

    it("should return available=true when sufficient stock exists", async () => {
      // Setup product with stock tracking
      await posDb.products_cache.add({
        pk: `${TEST_COMPANY_ID}:${TEST_OUTLET_ID}:1`,
        company_id: TEST_COMPANY_ID,
        outlet_id: TEST_OUTLET_ID,
        item_id: 1,
        sku: "TEST001",
        name: "Test Product",
        item_type: "PRODUCT",
        price_snapshot: 100,
        is_active: true,
        item_updated_at: new Date().toISOString(),
        price_updated_at: new Date().toISOString(),
        data_version: 1,
        pulled_at: new Date().toISOString(),
        track_stock: true,
        low_stock_threshold: 5
      });

      // Setup stock
      await posDb.inventory_stock.add({
        pk: `${TEST_COMPANY_ID}:${TEST_OUTLET_ID}:1`,
        company_id: TEST_COMPANY_ID,
        outlet_id: TEST_OUTLET_ID,
        item_id: 1,
        quantity_on_hand: 100,
        quantity_reserved: 0,
        quantity_available: 100,
        last_updated_at: new Date().toISOString(),
        data_version: 1
      });

      const result = await checkStockAvailability({
        itemId: 1,
        quantity: 50,
        companyId: TEST_COMPANY_ID,
        outletId: TEST_OUTLET_ID
      });

      expect(result.available).toBe(true);
      expect(result.quantityAvailable).toBe(100);
      expect(result.trackStock).toBe(true);
    });

    it("should return available=false when insufficient stock", async () => {
      // Setup product with stock tracking
      await posDb.products_cache.add({
        pk: `${TEST_COMPANY_ID}:${TEST_OUTLET_ID}:1`,
        company_id: TEST_COMPANY_ID,
        outlet_id: TEST_OUTLET_ID,
        item_id: 1,
        sku: "TEST001",
        name: "Test Product",
        item_type: "PRODUCT",
        price_snapshot: 100,
        is_active: true,
        item_updated_at: new Date().toISOString(),
        price_updated_at: new Date().toISOString(),
        data_version: 1,
        pulled_at: new Date().toISOString(),
        track_stock: true,
        low_stock_threshold: 5
      });

      // Setup stock with low quantity
      await posDb.inventory_stock.add({
        pk: `${TEST_COMPANY_ID}:${TEST_OUTLET_ID}:1`,
        company_id: TEST_COMPANY_ID,
        outlet_id: TEST_OUTLET_ID,
        item_id: 1,
        quantity_on_hand: 10,
        quantity_reserved: 0,
        quantity_available: 10,
        last_updated_at: new Date().toISOString(),
        data_version: 1
      });

      const result = await checkStockAvailability({
        itemId: 1,
        quantity: 20,
        companyId: TEST_COMPANY_ID,
        outletId: TEST_OUTLET_ID
      });

      expect(result.available).toBe(false);
      expect(result.quantityAvailable).toBe(10);
    });
  });

  describe("validateStockForItems", () => {
    it("should pass when all items have sufficient stock", async () => {
      // Setup products
      await posDb.products_cache.bulkAdd([
        {
          pk: `${TEST_COMPANY_ID}:${TEST_OUTLET_ID}:1`,
          company_id: TEST_COMPANY_ID,
          outlet_id: TEST_OUTLET_ID,
          item_id: 1,
          sku: "TEST001",
          name: "Test Product 1",
          item_type: "PRODUCT",
          price_snapshot: 100,
          is_active: true,
          item_updated_at: new Date().toISOString(),
          price_updated_at: new Date().toISOString(),
          data_version: 1,
          pulled_at: new Date().toISOString(),
          track_stock: true,
          low_stock_threshold: 5
        },
        {
          pk: `${TEST_COMPANY_ID}:${TEST_OUTLET_ID}:2`,
          company_id: TEST_COMPANY_ID,
          outlet_id: TEST_OUTLET_ID,
          item_id: 2,
          sku: "TEST002",
          name: "Test Product 2",
          item_type: "PRODUCT",
          price_snapshot: 200,
          is_active: true,
          item_updated_at: new Date().toISOString(),
          price_updated_at: new Date().toISOString(),
          data_version: 1,
          pulled_at: new Date().toISOString(),
          track_stock: false,
          low_stock_threshold: 0
        }
      ]);

      // Setup stock
      await posDb.inventory_stock.add({
        pk: `${TEST_COMPANY_ID}:${TEST_OUTLET_ID}:1`,
        company_id: TEST_COMPANY_ID,
        outlet_id: TEST_OUTLET_ID,
        item_id: 1,
        quantity_on_hand: 100,
        quantity_reserved: 0,
        quantity_available: 100,
        last_updated_at: new Date().toISOString(),
        data_version: 1
      });

      // Should not throw
      await expect(
        validateStockForItems({
          items: [
            { itemId: 1, quantity: 50 },
            { itemId: 2, quantity: 1000 } // No stock tracking, should pass
          ],
          companyId: TEST_COMPANY_ID,
          outletId: TEST_OUTLET_ID
        })
      ).resolves.not.toThrow();
    });

    it("should throw InsufficientStockError for single item failure", async () => {
      // Setup product
      await posDb.products_cache.add({
        pk: `${TEST_COMPANY_ID}:${TEST_OUTLET_ID}:1`,
        company_id: TEST_COMPANY_ID,
        outlet_id: TEST_OUTLET_ID,
        item_id: 1,
        sku: "TEST001",
        name: "Test Product",
        item_type: "PRODUCT",
        price_snapshot: 100,
        is_active: true,
        item_updated_at: new Date().toISOString(),
        price_updated_at: new Date().toISOString(),
        data_version: 1,
        pulled_at: new Date().toISOString(),
        track_stock: true,
        low_stock_threshold: 5
      });

      // Setup low stock
      await posDb.inventory_stock.add({
        pk: `${TEST_COMPANY_ID}:${TEST_OUTLET_ID}:1`,
        company_id: TEST_COMPANY_ID,
        outlet_id: TEST_OUTLET_ID,
        item_id: 1,
        quantity_on_hand: 5,
        quantity_reserved: 0,
        quantity_available: 5,
        last_updated_at: new Date().toISOString(),
        data_version: 1
      });

      await expect(
        validateStockForItems({
          items: [{ itemId: 1, quantity: 10 }],
          companyId: TEST_COMPANY_ID,
          outletId: TEST_OUTLET_ID
        })
      ).rejects.toThrow(InsufficientStockError);
    });
  });

  describe("reserveStock and releaseStock", () => {
    it("should reserve stock and reduce available quantity", async () => {
      const saleId = crypto.randomUUID();

      // Setup product
      await posDb.products_cache.add({
        pk: `${TEST_COMPANY_ID}:${TEST_OUTLET_ID}:1`,
        company_id: TEST_COMPANY_ID,
        outlet_id: TEST_OUTLET_ID,
        item_id: 1,
        sku: "TEST001",
        name: "Test Product",
        item_type: "PRODUCT",
        price_snapshot: 100,
        is_active: true,
        item_updated_at: new Date().toISOString(),
        price_updated_at: new Date().toISOString(),
        data_version: 1,
        pulled_at: new Date().toISOString(),
        track_stock: true,
        low_stock_threshold: 5
      });

      // Setup stock
      await posDb.inventory_stock.add({
        pk: `${TEST_COMPANY_ID}:${TEST_OUTLET_ID}:1`,
        company_id: TEST_COMPANY_ID,
        outlet_id: TEST_OUTLET_ID,
        item_id: 1,
        quantity_on_hand: 100,
        quantity_reserved: 0,
        quantity_available: 100,
        last_updated_at: new Date().toISOString(),
        data_version: 1
      });

      // Reserve stock
      await reserveStock({
        saleId,
        items: [{ itemId: 1, quantity: 30 }],
        companyId: TEST_COMPANY_ID,
        outletId: TEST_OUTLET_ID
      });

      // Check stock was reserved
      const stock = await posDb.inventory_stock.get(`${TEST_COMPANY_ID}:${TEST_OUTLET_ID}:1`);
      expect(stock?.quantity_reserved).toBe(30);
      expect(stock?.quantity_available).toBe(70);

      // Check reservation was created
      const reservations = await posDb.stock_reservations.where("sale_id").equals(saleId).toArray();
      expect(reservations).toHaveLength(1);
      expect(reservations[0]?.quantity).toBe(30);
    });

    it("should release stock and restore available quantity", async () => {
      const saleId = crypto.randomUUID();

      // Setup product
      await posDb.products_cache.add({
        pk: `${TEST_COMPANY_ID}:${TEST_OUTLET_ID}:1`,
        company_id: TEST_COMPANY_ID,
        outlet_id: TEST_OUTLET_ID,
        item_id: 1,
        sku: "TEST001",
        name: "Test Product",
        item_type: "PRODUCT",
        price_snapshot: 100,
        is_active: true,
        item_updated_at: new Date().toISOString(),
        price_updated_at: new Date().toISOString(),
        data_version: 1,
        pulled_at: new Date().toISOString(),
        track_stock: true,
        low_stock_threshold: 5
      });

      // Setup stock with existing reservation
      await posDb.inventory_stock.add({
        pk: `${TEST_COMPANY_ID}:${TEST_OUTLET_ID}:1`,
        company_id: TEST_COMPANY_ID,
        outlet_id: TEST_OUTLET_ID,
        item_id: 1,
        quantity_on_hand: 100,
        quantity_reserved: 30,
        quantity_available: 70,
        last_updated_at: new Date().toISOString(),
        data_version: 1
      });

      // Setup reservation
      await posDb.stock_reservations.add({
        reservation_id: crypto.randomUUID(),
        sale_id: saleId,
        company_id: TEST_COMPANY_ID,
        outlet_id: TEST_OUTLET_ID,
        item_id: 1,
        quantity: 30,
        created_at: new Date().toISOString(),
        expires_at: null
      });

      // Release stock
      await releaseStock({ saleId });

      // Check stock was released
      const stock = await posDb.inventory_stock.get(`${TEST_COMPANY_ID}:${TEST_OUTLET_ID}:1`);
      expect(stock?.quantity_reserved).toBe(0);
      expect(stock?.quantity_available).toBe(100);

      // Check reservation was removed
      const reservations = await posDb.stock_reservations.where("sale_id").equals(saleId).toArray();
      expect(reservations).toHaveLength(0);
    });
  });

  describe("updateStockFromSync", () => {
    it("should update stock from server sync", async () => {
      await updateStockFromSync({
        companyId: TEST_COMPANY_ID,
        outletId: TEST_OUTLET_ID,
        itemId: 1,
        quantityOnHand: 150,
        quantityReserved: 20,
        lastUpdatedAt: new Date().toISOString(),
        dataVersion: 2
      });

      const stock = await posDb.inventory_stock.get(`${TEST_COMPANY_ID}:${TEST_OUTLET_ID}:1`);
      expect(stock?.quantity_on_hand).toBe(150);
      expect(stock?.quantity_reserved).toBe(20);
      expect(stock?.quantity_available).toBe(130);
      expect(stock?.data_version).toBe(2);
    });

    it("should not update if server data version is lower", async () => {
      // Setup existing stock with higher version
      await posDb.inventory_stock.add({
        pk: `${TEST_COMPANY_ID}:${TEST_OUTLET_ID}:1`,
        company_id: TEST_COMPANY_ID,
        outlet_id: TEST_OUTLET_ID,
        item_id: 1,
        quantity_on_hand: 200,
        quantity_reserved: 0,
        quantity_available: 200,
        last_updated_at: new Date().toISOString(),
        data_version: 5
      });

      // Try to update with lower version
      await updateStockFromSync({
        companyId: TEST_COMPANY_ID,
        outletId: TEST_OUTLET_ID,
        itemId: 1,
        quantityOnHand: 150,
        quantityReserved: 0,
        lastUpdatedAt: new Date().toISOString(),
        dataVersion: 2
      });

      // Should retain original values
      const stock = await posDb.inventory_stock.get(`${TEST_COMPANY_ID}:${TEST_OUTLET_ID}:1`);
      expect(stock?.quantity_on_hand).toBe(200);
      expect(stock?.data_version).toBe(5);
    });
  });

  describe("Variant Stock Support (Story 4.7 Regression Tests)", () => {
    it("should check variant stock availability with reservations accounted for", async () => {
      // Setup variant in cache with stock
      await posDb.variants_cache.add({
        pk: `${TEST_COMPANY_ID}:${TEST_OUTLET_ID}:100`,
        company_id: TEST_COMPANY_ID,
        outlet_id: TEST_OUTLET_ID,
        item_id: 1,
        variant_id: 100,
        sku: "VAR-001-RED",
        variant_name: "Red - Small",
        price: 150,
        barcode: null,
        is_active: true,
        attributes: { color: "Red", size: "Small" },
        stock_quantity: 50,
        data_version: 1,
        pulled_at: new Date().toISOString()
      });

      // Setup existing reservation for this variant
      await posDb.stock_reservations.add({
        reservation_id: crypto.randomUUID(),
        sale_id: crypto.randomUUID(),
        company_id: TEST_COMPANY_ID,
        outlet_id: TEST_OUTLET_ID,
        item_id: 1,
        variant_id: 100,
        quantity: 20,
        created_at: new Date().toISOString(),
        expires_at: null
      });

      // Try to check out 40 units (should fail because 50 - 20 reserved = 30 available)
      const result = await checkStockAvailability({
        itemId: 1,
        quantity: 40,
        companyId: TEST_COMPANY_ID,
        outletId: TEST_OUTLET_ID,
        variantId: 100
      });

      expect(result.available).toBe(false);
      expect(result.quantityOnHand).toBe(50);
      expect(result.quantityReserved).toBe(20);
      expect(result.quantityAvailable).toBe(-10); // 30 - 40 requested
    });

    it("should pass validation when variant has sufficient stock", async () => {
      // Setup variant
      await posDb.variants_cache.add({
        pk: `${TEST_COMPANY_ID}:${TEST_OUTLET_ID}:101`,
        company_id: TEST_COMPANY_ID,
        outlet_id: TEST_OUTLET_ID,
        item_id: 2,
        variant_id: 101,
        sku: "VAR-002-BLUE",
        variant_name: "Blue - Medium",
        price: 200,
        barcode: null,
        is_active: true,
        attributes: { color: "Blue", size: "Medium" },
        stock_quantity: 100,
        data_version: 1,
        pulled_at: new Date().toISOString()
      });

      // Should pass - requesting 30, stock is 100, no reservations
      await expect(
        validateStockForItems({
          items: [{ itemId: 2, variantId: 101, quantity: 30 }],
          companyId: TEST_COMPANY_ID,
          outletId: TEST_OUTLET_ID
        })
      ).resolves.not.toThrow();
    });

    it("should reserve variant stock and track variant_id in reservation", async () => {
      const saleId = crypto.randomUUID();

      // Setup variant
      await posDb.variants_cache.add({
        pk: `${TEST_COMPANY_ID}:${TEST_OUTLET_ID}:102`,
        company_id: TEST_COMPANY_ID,
        outlet_id: TEST_OUTLET_ID,
        item_id: 3,
        variant_id: 102,
        sku: "VAR-003-GREEN",
        variant_name: "Green - Large",
        price: 175,
        barcode: null,
        is_active: true,
        attributes: { color: "Green", size: "Large" },
        stock_quantity: 75,
        data_version: 1,
        pulled_at: new Date().toISOString()
      });

      // Reserve variant stock
      await reserveStock({
        saleId,
        items: [{ itemId: 3, variantId: 102, quantity: 25 }],
        companyId: TEST_COMPANY_ID,
        outletId: TEST_OUTLET_ID
      });

      // Check reservation was created with variant_id
      const reservations = await posDb.stock_reservations.where("sale_id").equals(saleId).toArray();
      expect(reservations).toHaveLength(1);
      expect(reservations[0]?.variant_id).toBe(102);
      expect(reservations[0]?.quantity).toBe(25);
    });

    it("should prevent overselling variant when multiple reservations exist", async () => {
      // Setup variant with limited stock
      await posDb.variants_cache.add({
        pk: `${TEST_COMPANY_ID}:${TEST_OUTLET_ID}:103`,
        company_id: TEST_COMPANY_ID,
        outlet_id: TEST_OUTLET_ID,
        item_id: 4,
        variant_id: 103,
        sku: "VAR-004-LIMITED",
        variant_name: "Limited Edition",
        price: 500,
        barcode: null,
        is_active: true,
        attributes: { edition: "Special" },
        stock_quantity: 10,
        data_version: 1,
        pulled_at: new Date().toISOString()
      });

      // Create multiple existing reservations
      await posDb.stock_reservations.bulkAdd([
        {
          reservation_id: crypto.randomUUID(),
          sale_id: crypto.randomUUID(),
          company_id: TEST_COMPANY_ID,
          outlet_id: TEST_OUTLET_ID,
          item_id: 4,
          variant_id: 103,
          quantity: 4,
          created_at: new Date().toISOString(),
          expires_at: null
        },
        {
          reservation_id: crypto.randomUUID(),
          sale_id: crypto.randomUUID(),
          company_id: TEST_COMPANY_ID,
          outlet_id: TEST_OUTLET_ID,
          item_id: 4,
          variant_id: 103,
          quantity: 3,
          created_at: new Date().toISOString(),
          expires_at: null
        }
      ]);

      // Try to reserve 4 more (10 - 7 = 3 available, so should fail)
      await expect(
        validateStockForItems({
          items: [{ itemId: 4, variantId: 103, quantity: 4 }],
          companyId: TEST_COMPANY_ID,
          outletId: TEST_OUTLET_ID
        })
      ).rejects.toThrow(InsufficientStockError);
    });

    it("should handle mixed cart with variant and non-variant items", async () => {
      // Setup product without variants
      await posDb.products_cache.add({
        pk: `${TEST_COMPANY_ID}:${TEST_OUTLET_ID}:5`,
        company_id: TEST_COMPANY_ID,
        outlet_id: TEST_OUTLET_ID,
        item_id: 5,
        sku: "SIMPLE-001",
        name: "Simple Product",
        item_type: "PRODUCT",
        price_snapshot: 50,
        is_active: true,
        item_updated_at: new Date().toISOString(),
        price_updated_at: new Date().toISOString(),
        data_version: 1,
        pulled_at: new Date().toISOString(),
        track_stock: true,
        low_stock_threshold: 5
      });

      await posDb.inventory_stock.add({
        pk: `${TEST_COMPANY_ID}:${TEST_OUTLET_ID}:5`,
        company_id: TEST_COMPANY_ID,
        outlet_id: TEST_OUTLET_ID,
        item_id: 5,
        quantity_on_hand: 100,
        quantity_reserved: 0,
        quantity_available: 100,
        last_updated_at: new Date().toISOString(),
        data_version: 1
      });

      // Setup variant
      await posDb.variants_cache.add({
        pk: `${TEST_COMPANY_ID}:${TEST_OUTLET_ID}:200`,
        company_id: TEST_COMPANY_ID,
        outlet_id: TEST_OUTLET_ID,
        item_id: 6,
        variant_id: 200,
        sku: "VAR-MIXED-001",
        variant_name: "Variant Item",
        price: 150,
        barcode: null,
        is_active: true,
        attributes: { type: "variant" },
        stock_quantity: 30,
        data_version: 1,
        pulled_at: new Date().toISOString()
      });

      // Should validate both successfully
      await expect(
        validateStockForItems({
          items: [
            { itemId: 5, quantity: 50 }, // Non-variant
            { itemId: 6, variantId: 200, quantity: 20 } // Variant
          ],
          companyId: TEST_COMPANY_ID,
          outletId: TEST_OUTLET_ID
        })
      ).resolves.not.toThrow();
    });
  });
});
