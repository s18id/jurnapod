// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * POS Stock Sync Tests
 *
 * Tests for stock synchronization from server to POS
 */

import { describe, test, expect, beforeEach, vi } from "vitest";
import {
  syncStockFromServer,
  isStockStale,
  type StockSyncContext
} from "../stock.js";
import type { PosStoragePort } from "../../ports/storage-port.js";
import type { SyncTransport } from "../../ports/sync-transport.js";
import type { InventoryStockRow } from "@jurnapod/offline-db/dexie";

// Mock fetch globally
global.fetch = vi.fn();

const TEST_COMPANY_ID = 1;
const TEST_OUTLET_ID = 1;
const TEST_BASE_URL = "https://api.test.com";
const TEST_TOKEN = "test-token";

// Mock storage
const createMockStorage = (): PosStoragePort => {
  const stockData = new Map<string, InventoryStockRow>();

  return {
    getInventoryStock: async ({ company_id, outlet_id, item_id }) => {
      const pk = `${company_id}:${outlet_id}:${item_id}`;
      return stockData.get(pk);
    },
    putInventoryStock: async (stock) => {
      stockData.set(stock.pk, stock);
    },
    getInventoryStockByOutlet: async ({ company_id, outlet_id }) => {
      return Array.from(stockData.values()).filter(
        (s) => s.company_id === company_id && s.outlet_id === outlet_id && s.item_id !== 0
      );
    },
    // Add other required methods as no-ops
    getProductsByOutlet: vi.fn(),
    upsertProducts: vi.fn(),
    getOutletTablesByOutlet: vi.fn(),
    upsertOutletTables: vi.fn(),
    getReservationsByOutlet: vi.fn(),
    upsertReservations: vi.fn(),
    clearScopeCache: vi.fn(),
    getActiveOrdersByOutlet: vi.fn(),
    getActiveOrder: vi.fn(),
    upsertActiveOrders: vi.fn(),
    deleteActiveOrder: vi.fn(),
    getActiveOrderLines: vi.fn(),
    replaceActiveOrderLines: vi.fn(),
    putActiveOrderUpdate: vi.fn(),
    listPendingActiveOrderUpdates: vi.fn(),
    listActiveOrderUpdatesByOrder: vi.fn(),
    markActiveOrderUpdateSyncResult: vi.fn(),
    putItemCancellation: vi.fn(),
    listItemCancellationsByOrder: vi.fn(),
    createSale: vi.fn(),
    getSale: vi.fn(),
    updateSaleStatus: vi.fn(),
    createSaleItems: vi.fn(),
    getSaleItems: vi.fn(),
    createPayments: vi.fn(),
    getPayments: vi.fn(),
    createOutboxJob: vi.fn(),
    getOutboxJob: vi.fn(),
    listPendingOutboxJobs: vi.fn(),
    listUnsyncedOutboxJobs: vi.fn(),
    listDueOutboxJobs: vi.fn(),
    updateOutboxJob: vi.fn(),
    countPendingOutboxJobs: vi.fn(),
    countFailedOutboxJobs: vi.fn(),
    countUnsyncedOutboxJobs: vi.fn(),
    countUnsyncedOutboxJobsForScope: vi.fn(),
    countGlobalDueOutboxJobs: vi.fn(),
    getSyncMetadata: vi.fn(),
    upsertSyncMetadata: vi.fn(),
    getSyncScopeConfig: vi.fn(),
    upsertSyncScopeConfig: vi.fn(),
    transaction: vi.fn()
  };
};

// Mock transport
const createMockTransport = (): SyncTransport => ({
  pull: vi.fn(),
  push: vi.fn()
});

describe("POS Stock Sync", () => {
  let storage: PosStoragePort;
  let transport: SyncTransport;
  let context: StockSyncContext;

  beforeEach(() => {
    storage = createMockStorage();
    transport = createMockTransport();
    context = {
      company_id: TEST_COMPANY_ID,
      outlet_id: TEST_OUTLET_ID,
      baseUrl: TEST_BASE_URL,
      accessToken: TEST_TOKEN
    };
    vi.resetAllMocks();
  });

  describe("syncStockFromServer", () => {
    test("should fetch and apply stock updates", async () => {
      const mockStockItems = [
        {
          product_id: 1,
          outlet_id: TEST_OUTLET_ID,
          quantity: 100,
          reserved_quantity: 10,
          available_quantity: 90,
          updated_at: new Date().toISOString()
        },
        {
          product_id: 2,
          outlet_id: TEST_OUTLET_ID,
          quantity: 50,
          reserved_quantity: 5,
          available_quantity: 45,
          updated_at: new Date().toISOString()
        }
      ];

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: mockStockItems,
          has_more: false,
          sync_timestamp: new Date().toISOString()
        })
      });

      const result = await syncStockFromServer(transport, storage, context);

      expect(result.success).toBe(true);
      expect(result.items_synced).toBe(2);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/v1/sync/stock"),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: `Bearer ${TEST_TOKEN}`
          })
        })
      );
    });

    test("should handle pagination", async () => {
      const page1Items = [
        {
          product_id: 1,
          outlet_id: TEST_OUTLET_ID,
          quantity: 100,
          reserved_quantity: 10,
          available_quantity: 90,
          updated_at: new Date().toISOString()
        }
      ];

      const page2Items = [
        {
          product_id: 2,
          outlet_id: TEST_OUTLET_ID,
          quantity: 50,
          reserved_quantity: 5,
          available_quantity: 45,
          updated_at: new Date().toISOString()
        }
      ];

      const nextCursor = "cursor123";

      (global.fetch as any)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            items: page1Items,
            has_more: true,
            next_cursor: nextCursor,
            sync_timestamp: new Date().toISOString()
          })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            items: page2Items,
            has_more: false,
            sync_timestamp: new Date().toISOString()
          })
        });

      const result = await syncStockFromServer(transport, storage, context);

      expect(result.success).toBe(true);
      expect(result.items_synced).toBe(2);
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    test("should handle server errors", async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        statusText: "Internal Server Error",
        json: async () => ({ message: "Server error" })
      });

      const result = await syncStockFromServer(transport, storage, context);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Stock sync failed");
    });

    test("should handle empty stock list", async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [],
          has_more: false,
          sync_timestamp: new Date().toISOString()
        })
      });

      const result = await syncStockFromServer(transport, storage, context);

      expect(result.success).toBe(true);
      expect(result.items_synced).toBe(0);
    });
  });

  describe("isStockStale", () => {
    test("should return true when no stock data exists", async () => {
      const isStale = await isStockStale(storage, TEST_COMPANY_ID, TEST_OUTLET_ID);
      expect(isStale).toBe(true);
    });

    test("should return false for recent stock data", async () => {
      // Add recent stock data
      await storage.putInventoryStock({
        pk: `${TEST_COMPANY_ID}:${TEST_OUTLET_ID}:1`,
        company_id: TEST_COMPANY_ID,
        outlet_id: TEST_OUTLET_ID,
        item_id: 1,
        quantity_on_hand: 100,
        quantity_reserved: 10,
        quantity_available: 90,
        last_updated_at: new Date().toISOString(),
        data_version: 1
      });

      const isStale = await isStockStale(storage, TEST_COMPANY_ID, TEST_OUTLET_ID, 60);
      expect(isStale).toBe(false);
    });

    test("should return true for old stock data", async () => {
      // Add old stock data (2 hours ago)
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      await storage.putInventoryStock({
        pk: `${TEST_COMPANY_ID}:${TEST_OUTLET_ID}:1`,
        company_id: TEST_COMPANY_ID,
        outlet_id: TEST_OUTLET_ID,
        item_id: 1,
        quantity_on_hand: 100,
        quantity_reserved: 10,
        quantity_available: 90,
        last_updated_at: twoHoursAgo,
        data_version: 1
      });

      const isStale = await isStockStale(storage, TEST_COMPANY_ID, TEST_OUTLET_ID, 60);
      expect(isStale).toBe(true);
    });

    test("should use custom threshold", async () => {
      // Add stock data from 30 minutes ago
      const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
      await storage.putInventoryStock({
        pk: `${TEST_COMPANY_ID}:${TEST_OUTLET_ID}:1`,
        company_id: TEST_COMPANY_ID,
        outlet_id: TEST_OUTLET_ID,
        item_id: 1,
        quantity_on_hand: 100,
        quantity_reserved: 10,
        quantity_available: 90,
        last_updated_at: thirtyMinutesAgo,
        data_version: 1
      });

      // With 60-minute threshold, should not be stale
      const isStale60 = await isStockStale(storage, TEST_COMPANY_ID, TEST_OUTLET_ID, 60);
      expect(isStale60).toBe(false);

      // With 15-minute threshold, should be stale
      const isStale15 = await isStockStale(storage, TEST_COMPANY_ID, TEST_OUTLET_ID, 15);
      expect(isStale15).toBe(true);
    });
  });

  describe("Conflict Resolution", () => {
    test("should handle server wins conflict resolution", async () => {
      // First, set some local stock
      await storage.putInventoryStock({
        pk: `${TEST_COMPANY_ID}:${TEST_OUTLET_ID}:1`,
        company_id: TEST_COMPANY_ID,
        outlet_id: TEST_OUTLET_ID,
        item_id: 1,
        quantity_on_hand: 50,
        quantity_reserved: 5,
        quantity_available: 45,
        last_updated_at: new Date(Date.now() - 1000).toISOString(),
        data_version: 1
      });

      // Server returns different values (server wins)
      const serverStock = {
        product_id: 1,
        outlet_id: TEST_OUTLET_ID,
        quantity: 100,
        reserved_quantity: 10,
        available_quantity: 90,
        updated_at: new Date().toISOString()
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [serverStock],
          has_more: false,
          sync_timestamp: new Date().toISOString()
        })
      });

      await syncStockFromServer(transport, storage, context);

      // Verify server values were applied
      const localStock = await storage.getInventoryStock({
        company_id: TEST_COMPANY_ID,
        outlet_id: TEST_OUTLET_ID,
        item_id: 1
      });

      expect(localStock?.quantity_on_hand).toBe(100);
      expect(localStock?.quantity_available).toBe(90);
    });
  });
});
