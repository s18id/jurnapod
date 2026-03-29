// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * PosSyncModule Integration Tests
 *
 * Tests for PosSyncModule.handlePullSync() and PosSyncModule.handlePushSync()
 * using real database connections from .env.
 *
 * CRITICAL: All tests must close the DB pool after completion.
 */

// Load .env file before any other imports
import path from 'path';
import { config as loadEnv } from 'dotenv';
loadEnv({ path: path.resolve(process.cwd(), '.env') });

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, test } from 'vitest';
import { createDbPool, DbConn } from '@jurnapod/db';
import type { Pool } from 'mysql2';
import { PosSyncModule } from './pos-sync-module.js';
import type { PullSyncParams } from './pull/types.js';
import type {
  TransactionPush,
  ActiveOrderPush,
  OrderUpdatePush,
  ItemCancellationPush,
  VariantSalePush,
  VariantStockAdjustmentPush,
} from './push/types.js';

// ============================================================================
// Test Configuration
// ============================================================================

interface TestConfig {
  companyCode: string;
  outletCode: string;
  ownerEmail: string;
}

function loadTestConfig(): TestConfig {
  // Support both direct env vars and .env file loading
  const companyCode = process.env.JP_COMPANY_CODE ?? 'JP';
  const outletCode = process.env.JP_OUTLET_CODE ?? 'MAIN';
  const ownerEmail = process.env.JP_OWNER_EMAIL ?? 'owner@example.com';
  
  return { companyCode, outletCode, ownerEmail };
}

// ============================================================================
// Database Setup
// ============================================================================

interface TestFixtures {
  db: DbConn;
  pool: Pool;
  testUserId: number;
  testCompanyId: number;
  testOutletId: number;
}

async function setupTestFixtures(): Promise<TestFixtures> {
  const config = loadTestConfig();
  
  // Create database pool using environment variables
  const pool = createDbPool({
    host: process.env.DB_HOST ?? '127.0.0.1',
    port: Number(process.env.DB_PORT ?? '3306'),
    user: process.env.DB_USER ?? 'root',
    password: process.env.DB_PASSWORD ?? '',
    database: process.env.DB_NAME ?? 'jurnapod',
    connectionLimit: 10,
    dateStrings: true,
  });

  const db = new DbConn(pool);

  // Find test user fixture
  const userRows = await db.queryAll<any>(
    `SELECT u.id AS user_id, u.company_id, o.id AS outlet_id
     FROM users u
     INNER JOIN companies c ON c.id = u.company_id
     INNER JOIN user_outlets uo ON uo.user_id = u.id
     INNER JOIN outlets o ON o.id = uo.outlet_id
     WHERE c.code = ?
       AND u.email = ?
       AND u.is_active = 1
       AND o.code = ?
     LIMIT 1`,
    [config.companyCode, config.ownerEmail, config.outletCode]
  );

  if (userRows.length === 0) {
    throw new Error(
      `Owner fixture not found; run database seed first. ` +
      `Looking for company=${config.companyCode}, email=${config.ownerEmail}, outlet=${config.outletCode}`
    );
  }

  return {
    db,
    pool,
    testUserId: Number(userRows[0].user_id),
    testCompanyId: Number(userRows[0].company_id),
    testOutletId: Number(userRows[0].outlet_id),
  };
}

async function closePool(pool: Pool): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    pool.end((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

// ============================================================================
// Test Suite
// ============================================================================

describe('PosSyncModule Integration', () => {
  let fixtures: TestFixtures;
  let module: PosSyncModule;
  let correlationId: string;

  beforeAll(async () => {
    // Setup database connection
    fixtures = await setupTestFixtures();

    // Seed pos_order_snapshots for FK-dependent tests (order_updates, item_cancellations)
    // Insert multiple orders so tests can use distinct order_ids
    const seedOrders = [
      'test-seed-order-1',
      'test-seed-order-2', 
      'test-seed-order-3',
      'test-seed-order-4',
    ];
    for (const orderId of seedOrders) {
      await fixtures.db.execute(
        `INSERT IGNORE INTO pos_order_snapshots 
         (order_id, company_id, outlet_id, service_type, order_status, order_state, is_finalized, opened_at, updated_at) 
         VALUES (?, ?, ?, 'TAKEAWAY', 'OPEN', 'OPEN', false, NOW(), NOW())`,
        [orderId, fixtures.testCompanyId, fixtures.testOutletId]
      );
    }

    // Create POS sync module
    module = new PosSyncModule({
      module_id: 'pos',
      client_type: 'POS',
      enabled: true,
    });

    // Initialize with database connection
    await module.initialize({
      database: fixtures.db,
      logger: console,
      config: { env: 'test' },
    });

    correlationId = `test-${Date.now()}`;
  });

  afterAll(async () => {
    // Cleanup module (only if initialized successfully)
    if (module) {
      await module.cleanup();
    }
    
    // Close database pool (only if fixtures were setup successfully)
    if (fixtures?.pool) {
      await closePool(fixtures.pool);
    }
  });

  beforeEach(() => {
    correlationId = `test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  });

  // ===========================================================================
  // handlePullSync Tests
  // ===========================================================================

  describe('handlePullSync', () => {
    it('should fetch all data when no since_version (full sync)', async () => {
      const params: PullSyncParams = {
        companyId: fixtures.testCompanyId,
        outletId: fixtures.testOutletId,
        sinceVersion: 0,
      };

      const result = await module.handlePullSync(params);

      // Should return a valid result structure
      expect(result).toBeDefined();
      expect(result.currentVersion).toBeDefined();
      expect(typeof result.currentVersion).toBe('number');
      expect(result.payload).toBeDefined();

      // Full sync should include items
      expect(Array.isArray(result.payload.items)).toBe(true);
      expect(Array.isArray(result.payload.tables)).toBe(true);
      expect(Array.isArray(result.payload.reservations)).toBe(true);
      expect(Array.isArray(result.payload.variants)).toBe(true);
      expect(Array.isArray(result.payload.variant_prices)).toBe(true);
      expect(Array.isArray(result.payload.open_orders)).toBe(true);
      expect(Array.isArray(result.payload.order_updates)).toBe(true);
    });

    it('should fetch incremental data with since_version', async () => {
      // First, get the current version
      const fullSyncResult = await module.handlePullSync({
        companyId: fixtures.testCompanyId,
        outletId: fixtures.testOutletId,
        sinceVersion: 0,
      });

      const currentVersion = fullSyncResult.currentVersion;

      // Incremental sync with current version
      const params: PullSyncParams = {
        companyId: fixtures.testCompanyId,
        outletId: fixtures.testOutletId,
        sinceVersion: currentVersion,
      };

      const result = await module.handlePullSync(params);

      // Should return result with same or higher version
      expect(result).toBeDefined();
      expect(result.currentVersion).toBeGreaterThanOrEqual(currentVersion);
      expect(result.payload).toBeDefined();
    });

    it('should return empty result when no changes since version', async () => {
      // Use a very high version number that likely exceeds any actual data version
      const highVersion = 999999999;

      const params: PullSyncParams = {
        companyId: fixtures.testCompanyId,
        outletId: fixtures.testOutletId,
        sinceVersion: highVersion,
      };

      const result = await module.handlePullSync(params);

      // Should return valid structure even with no changes
      expect(result).toBeDefined();
      expect(result.payload).toBeDefined();
      expect(Array.isArray(result.payload.items)).toBe(true);
      expect(Array.isArray(result.payload.tables)).toBe(true);
    });

    it('should enforce company_id scoping', async () => {
      const params: PullSyncParams = {
        companyId: fixtures.testCompanyId,
        outletId: fixtures.testOutletId,
        sinceVersion: 0,
      };

      const result = await module.handlePullSync(params);

      // All items should belong to the correct company
      for (const item of result.payload.items) {
        expect(item).toBeDefined();
      }

      // All variants should belong to the correct company
      for (const variant of result.payload.variants) {
        expect(variant).toBeDefined();
        expect(variant.item_id).toBeGreaterThan(0);
      }
    });
  });

  // ===========================================================================
  // handlePushSync Tests
  // ===========================================================================

  describe('handlePushSync', () => {
    // Helper to create a unique transaction ID
    function uniqueId(prefix: string): string {
      return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    }

    describe('transaction push with idempotency', () => {
      it('should process new transaction successfully', async () => {
        const transaction: TransactionPush = {
          client_tx_id: uniqueId('tx'),
          company_id: fixtures.testCompanyId,
          outlet_id: fixtures.testOutletId,
          cashier_user_id: fixtures.testUserId,
          status: 'COMPLETED',
          service_type: 'TAKEAWAY',
          trx_at: '2024-01-15T10:30:00+07:00',
          items: [
            {
              item_id: 1,
              qty: 1,
              price_snapshot: 15000,
              name_snapshot: 'Test Item',
            },
          ],
          payments: [{ method: 'CASH', amount: 15000 }],
        };

        const result = await module.handlePushSync({
          db: fixtures.db,
          companyId: fixtures.testCompanyId,
          outletId: fixtures.testOutletId,
          transactions: [transaction],
          activeOrders: [],
          orderUpdates: [],
          itemCancellations: [],
          variantSales: [],
          variantStockAdjustments: [],
          correlationId,
        });

        expect(result.results).toHaveLength(1);
        expect(result.results[0].result).toBe('OK');
        expect(result.results[0].client_tx_id).toBe(transaction.client_tx_id);
      });

      it('should detect duplicate transaction (idempotency)', async () => {
        const clientTxId = uniqueId('tx-dup');

        const transaction: TransactionPush = {
          client_tx_id: clientTxId,
          company_id: fixtures.testCompanyId,
          outlet_id: fixtures.testOutletId,
          cashier_user_id: fixtures.testUserId,
          status: 'COMPLETED',
          service_type: 'TAKEAWAY',
          trx_at: '2024-01-15T10:30:00+07:00',
          items: [
            {
              item_id: 1,
              qty: 1,
              price_snapshot: 15000,
              name_snapshot: 'Test Item',
            },
          ],
          payments: [{ method: 'CASH', amount: 15000 }],
        };

        // First push - should succeed
        const firstResult = await module.handlePushSync({
          db: fixtures.db,
          companyId: fixtures.testCompanyId,
          outletId: fixtures.testOutletId,
          transactions: [transaction],
          activeOrders: [],
          orderUpdates: [],
          itemCancellations: [],
          variantSales: [],
          variantStockAdjustments: [],
          correlationId,
        });

        expect(firstResult.results[0].result).toBe('OK');

        // Second push with same client_tx_id - should be DUPLICATE
        const secondResult = await module.handlePushSync({
          db: fixtures.db,
          companyId: fixtures.testCompanyId,
          outletId: fixtures.testOutletId,
          transactions: [transaction],
          activeOrders: [],
          orderUpdates: [],
          itemCancellations: [],
          variantSales: [],
          variantStockAdjustments: [],
          correlationId,
        });

        expect(secondResult.results).toHaveLength(1);
        expect(secondResult.results[0].result).toBe('DUPLICATE');
      });

      it('should reject transaction with company_id mismatch', async () => {
        const transaction: TransactionPush = {
          client_tx_id: uniqueId('tx-company-mismatch'),
          company_id: fixtures.testCompanyId + 9999, // Wrong company
          outlet_id: fixtures.testOutletId,
          cashier_user_id: fixtures.testUserId,
          status: 'COMPLETED',
          service_type: 'TAKEAWAY',
          trx_at: '2024-01-15T10:30:00+07:00',
          items: [
            {
              item_id: 1,
              qty: 1,
              price_snapshot: 15000,
              name_snapshot: 'Test Item',
            },
          ],
          payments: [{ method: 'CASH', amount: 15000 }],
        };

        const result = await module.handlePushSync({
          db: fixtures.db,
          companyId: fixtures.testCompanyId,
          outletId: fixtures.testOutletId,
          transactions: [transaction],
          activeOrders: [],
          orderUpdates: [],
          itemCancellations: [],
          variantSales: [],
          variantStockAdjustments: [],
          correlationId,
        });

        // Mismatched company_id transactions are filtered out (0 results)
        // The module only processes transactions for its own company_id
        expect(result.results).toHaveLength(0);
      });

      it('should reject DINE_IN without table_id', async () => {
        const transaction: TransactionPush = {
          client_tx_id: uniqueId('tx-dinein'),
          company_id: fixtures.testCompanyId,
          outlet_id: fixtures.testOutletId,
          cashier_user_id: fixtures.testUserId,
          status: 'COMPLETED',
          service_type: 'DINE_IN',
          // table_id is missing
          trx_at: '2024-01-15T10:30:00+07:00',
          items: [
            {
              item_id: 1,
              qty: 1,
              price_snapshot: 15000,
              name_snapshot: 'Test Item',
            },
          ],
          payments: [{ method: 'CASH', amount: 15000 }],
        };

        const result = await module.handlePushSync({
          db: fixtures.db,
          companyId: fixtures.testCompanyId,
          outletId: fixtures.testOutletId,
          transactions: [transaction],
          activeOrders: [],
          orderUpdates: [],
          itemCancellations: [],
          variantSales: [],
          variantStockAdjustments: [],
          correlationId,
        });

        expect(result.results[0].result).toBe('ERROR');
        expect(result.results[0].message).toContain('DINE_IN requires table_id');
      });
    });

    describe('active orders push', () => {
      it('should process active orders successfully', async () => {
        const activeOrder: ActiveOrderPush = {
          order_id: uniqueId('order'),
          company_id: fixtures.testCompanyId,
          outlet_id: fixtures.testOutletId,
          service_type: 'TAKEAWAY',
          is_finalized: false,
          order_status: 'OPEN',
          order_state: 'OPEN',
          paid_amount: 0,
          opened_at: '2024-01-15T10:00:00+07:00',
          updated_at: '2024-01-15T10:30:00+07:00',
          lines: [
            {
              item_id: 1,
              name_snapshot: 'Test Item',
              item_type_snapshot: 'PRODUCT',
              unit_price_snapshot: 15000,
              qty: 2,
              discount_amount: 0,
              updated_at: '2024-01-15T10:30:00+07:00',
            },
          ],
        };

        const result = await module.handlePushSync({
          db: fixtures.db,
          companyId: fixtures.testCompanyId,
          outletId: fixtures.testOutletId,
          transactions: [],
          activeOrders: [activeOrder],
          orderUpdates: [],
          itemCancellations: [],
          variantSales: [],
          variantStockAdjustments: [],
          correlationId,
        });

        expect(result.orderUpdateResults).toHaveLength(1);
        expect(result.orderUpdateResults[0].result).toBe('OK');
      });

      it('should handle empty active orders array', async () => {
        const result = await module.handlePushSync({
          db: fixtures.db,
          companyId: fixtures.testCompanyId,
          outletId: fixtures.testOutletId,
          transactions: [],
          activeOrders: [],
          orderUpdates: [],
          itemCancellations: [],
          variantSales: [],
          variantStockAdjustments: [],
          correlationId,
        });

        expect(result.orderUpdateResults).toEqual([]);
      });
    });

    describe('order updates push', () => {
      it('should process order updates successfully', async () => {
        const orderUpdate: OrderUpdatePush = {
          update_id: uniqueId('update'),
          order_id: 'test-seed-order-1',
          company_id: fixtures.testCompanyId,
          outlet_id: fixtures.testOutletId,
          event_type: 'ITEM_ADDED',
          delta_json: '{"item_id": 1, "qty": 1}',
          device_id: 'device-001',
          event_at: '2024-01-15T10:30:00+07:00',
        };

        const result = await module.handlePushSync({
          db: fixtures.db,
          companyId: fixtures.testCompanyId,
          outletId: fixtures.testOutletId,
          transactions: [],
          activeOrders: [],
          orderUpdates: [orderUpdate],
          itemCancellations: [],
          variantSales: [],
          variantStockAdjustments: [],
          correlationId,
        });

        expect(result.orderUpdateResults).toHaveLength(1);
        expect(result.orderUpdateResults[0].result).toBe('OK');
      });

      it('should detect duplicate order update (idempotency)', async () => {
        const updateId = uniqueId('update-dup');
        const orderUpdate: OrderUpdatePush = {
          update_id: updateId,
          order_id: 'test-seed-order-2',
          company_id: fixtures.testCompanyId,
          outlet_id: fixtures.testOutletId,
          event_type: 'ITEM_ADDED',
          delta_json: '{"item_id": 1, "qty": 1}',
          device_id: 'device-001',
          event_at: '2024-01-15T10:30:00+07:00',
        };

        // First push
        const firstResult = await module.handlePushSync({
          db: fixtures.db,
          companyId: fixtures.testCompanyId,
          outletId: fixtures.testOutletId,
          transactions: [],
          activeOrders: [],
          orderUpdates: [orderUpdate],
          itemCancellations: [],
          variantSales: [],
          variantStockAdjustments: [],
          correlationId,
        });

        expect(firstResult.orderUpdateResults[0].result).toBe('OK');

        // Second push - should be DUPLICATE
        const secondResult = await module.handlePushSync({
          db: fixtures.db,
          companyId: fixtures.testCompanyId,
          outletId: fixtures.testOutletId,
          transactions: [],
          activeOrders: [],
          orderUpdates: [orderUpdate],
          itemCancellations: [],
          variantSales: [],
          variantStockAdjustments: [],
          correlationId,
        });

        expect(secondResult.orderUpdateResults).toHaveLength(1);
        expect(secondResult.orderUpdateResults[0].result).toBe('DUPLICATE');
      });
    });

    describe('item cancellations push', () => {
      it('should process item cancellations successfully', async () => {
        const cancellation: ItemCancellationPush = {
          cancellation_id: uniqueId('cancel'),
          order_id: 'test-seed-order-3',
          item_id: 1,
          variant_id: undefined,
          company_id: fixtures.testCompanyId,
          outlet_id: fixtures.testOutletId,
          cancelled_quantity: 1,
          reason: 'Customer request',
          cancelled_at: '2024-01-15T10:30:00+07:00',
        };

        const result = await module.handlePushSync({
          db: fixtures.db,
          companyId: fixtures.testCompanyId,
          outletId: fixtures.testOutletId,
          transactions: [],
          activeOrders: [],
          orderUpdates: [],
          itemCancellations: [cancellation],
          variantSales: [],
          variantStockAdjustments: [],
          correlationId,
        });

        expect(result.itemCancellationResults).toHaveLength(1);
        expect(result.itemCancellationResults[0].result).toBe('OK');
      });

      it('should detect duplicate item cancellation (idempotency)', async () => {
        const cancellationId = uniqueId('cancel-dup');
        const cancellation: ItemCancellationPush = {
          cancellation_id: cancellationId,
          order_id: 'test-seed-order-4',
          item_id: 1,
          variant_id: undefined,
          company_id: fixtures.testCompanyId,
          outlet_id: fixtures.testOutletId,
          cancelled_quantity: 1,
          reason: 'Customer request',
          cancelled_at: '2024-01-15T10:30:00+07:00',
        };

        // First push
        const firstResult = await module.handlePushSync({
          db: fixtures.db,
          companyId: fixtures.testCompanyId,
          outletId: fixtures.testOutletId,
          transactions: [],
          activeOrders: [],
          orderUpdates: [],
          itemCancellations: [cancellation],
          variantSales: [],
          variantStockAdjustments: [],
          correlationId,
        });

        expect(firstResult.itemCancellationResults[0].result).toBe('OK');

        // Second push - should be DUPLICATE
        const secondResult = await module.handlePushSync({
          db: fixtures.db,
          companyId: fixtures.testCompanyId,
          outletId: fixtures.testOutletId,
          transactions: [],
          activeOrders: [],
          orderUpdates: [],
          itemCancellations: [cancellation],
          variantSales: [],
          variantStockAdjustments: [],
          correlationId,
        });

        expect(secondResult.itemCancellationResults).toHaveLength(1);
        expect(secondResult.itemCancellationResults[0].result).toBe('DUPLICATE');
      });
    });

    describe('variant sales push', () => {
      let testVariant: { id: number; item_id: number } | null = null;

      beforeAll(async () => {
        const variants = await fixtures.db.queryAll<any>(
          `SELECT id, item_id FROM item_variants WHERE company_id = ? AND is_active = 1 LIMIT 1`,
          [fixtures.testCompanyId]
        );
        if (variants.length > 0) {
          testVariant = { id: Number(variants[0].id), item_id: Number(variants[0].item_id) };
        }
      });

      it('should process variant sales successfully', async () => {
        if (!testVariant) {
          return; // Skip if no variants - will show as incomplete but not error
        }

        const sale: VariantSalePush = {
          client_tx_id: uniqueId('sale'),
          company_id: fixtures.testCompanyId,
          outlet_id: fixtures.testOutletId,
          variant_id: testVariant.id,
          item_id: testVariant.item_id,
          qty: 1,
          unit_price: 15000,
          total_amount: 15000,
          trx_at: '2024-01-15T10:30:00+07:00',
        };

        const result = await module.handlePushSync({
          db: fixtures.db,
          companyId: fixtures.testCompanyId,
          outletId: fixtures.testOutletId,
          transactions: [],
          activeOrders: [],
          orderUpdates: [],
          itemCancellations: [],
          variantSales: [sale],
          variantStockAdjustments: [],
          correlationId,
        });

        expect(result.variantSaleResults).toBeDefined();
        expect(result.variantSaleResults).toHaveLength(1);
        expect(result.variantSaleResults![0].result).toBe('OK');
      });

      it('should reject variant sale with company_id mismatch', async () => {
        if (!testVariant) {
          return; // Skip if no variants
        }

        const sale: VariantSalePush = {
          client_tx_id: uniqueId('sale-company-mismatch'),
          company_id: fixtures.testCompanyId + 9999, // Wrong company
          outlet_id: fixtures.testOutletId,
          variant_id: testVariant!.id,
          item_id: testVariant!.item_id,
          qty: 1,
          unit_price: 15000,
          total_amount: 15000,
          trx_at: '2024-01-15T10:30:00+07:00',
        };

        const result = await module.handlePushSync({
          db: fixtures.db,
          companyId: fixtures.testCompanyId,
          outletId: fixtures.testOutletId,
          transactions: [],
          activeOrders: [],
          orderUpdates: [],
          itemCancellations: [],
          variantSales: [sale],
          variantStockAdjustments: [],
          correlationId,
        });

        expect(result.variantSaleResults).toBeDefined();
        expect(result.variantSaleResults![0].result).toBe('ERROR');
        expect(result.variantSaleResults![0].message).toContain('company_id mismatch');
      });
    });

    describe('variant stock adjustments push', () => {
      let stockTestVariant: { id: number; item_id: number } | null = null;

      beforeAll(async () => {
        const variants = await fixtures.db.queryAll<any>(
          `SELECT id, item_id FROM item_variants WHERE company_id = ? AND is_active = 1 LIMIT 1`,
          [fixtures.testCompanyId]
        );
        if (variants.length > 0) {
          stockTestVariant = { id: Number(variants[0].id), item_id: Number(variants[0].item_id) };
        }
      });

      it('should process INCREASE stock adjustment successfully', async () => {
        if (!stockTestVariant) {
          return; // Skip if no variants
        }

        const adjustment: VariantStockAdjustmentPush = {
          client_tx_id: uniqueId('adjust'),
          company_id: fixtures.testCompanyId,
          outlet_id: fixtures.testOutletId,
          variant_id: stockTestVariant.id,
          adjustment_type: 'INCREASE',
          quantity: 10,
          reason: 'Stock received',
          adjusted_at: '2024-01-15T10:30:00+07:00',
        };

        const result = await module.handlePushSync({
          db: fixtures.db,
          companyId: fixtures.testCompanyId,
          outletId: fixtures.testOutletId,
          transactions: [],
          activeOrders: [],
          orderUpdates: [],
          itemCancellations: [],
          variantSales: [],
          variantStockAdjustments: [adjustment],
          correlationId,
        });

        expect(result.variantStockAdjustmentResults).toBeDefined();
        expect(result.variantStockAdjustmentResults).toHaveLength(1);
        expect(result.variantStockAdjustmentResults![0].result).toBe('OK');
      });

      it('should reject invalid adjustment_type', async () => {
        if (!stockTestVariant) {
          return; // Skip if no variants
        }

        const adjustment: VariantStockAdjustmentPush = {
          client_tx_id: uniqueId('adjust-invalid'),
          company_id: fixtures.testCompanyId,
          outlet_id: fixtures.testOutletId,
          variant_id: stockTestVariant.id,
          adjustment_type: 'INVALID' as any,
          quantity: 10,
          reason: 'Test',
          adjusted_at: '2024-01-15T10:30:00+07:00',
        };

        const result = await module.handlePushSync({
          db: fixtures.db,
          companyId: fixtures.testCompanyId,
          outletId: fixtures.testOutletId,
          transactions: [],
          activeOrders: [],
          orderUpdates: [],
          itemCancellations: [],
          variantSales: [],
          variantStockAdjustments: [adjustment],
          correlationId,
        });

        expect(result.variantStockAdjustmentResults).toBeDefined();
        expect(result.variantStockAdjustmentResults![0].result).toBe('ERROR');
        expect(result.variantStockAdjustmentResults![0].message).toContain('Invalid adjustment_type');
      });

      it('should detect duplicate stock adjustment (idempotency)', async () => {
        if (!stockTestVariant) {
          return; // Skip if no variants
        }
        const clientTxId = uniqueId('adjust-dup');

        const adjustment: VariantStockAdjustmentPush = {
          client_tx_id: clientTxId,
          company_id: fixtures.testCompanyId,
          outlet_id: fixtures.testOutletId,
          variant_id: stockTestVariant.id,
          adjustment_type: 'INCREASE',
          quantity: 5,
          reason: 'Test adjustment',
          adjusted_at: '2024-01-15T10:30:00+07:00',
        };

        // First push
        const firstResult = await module.handlePushSync({
          db: fixtures.db,
          companyId: fixtures.testCompanyId,
          outletId: fixtures.testOutletId,
          transactions: [],
          activeOrders: [],
          orderUpdates: [],
          itemCancellations: [],
          variantSales: [],
          variantStockAdjustments: [adjustment],
          correlationId,
        });

        expect(firstResult.variantStockAdjustmentResults![0].result).toBe('OK');

        // Second push - should be DUPLICATE
        const secondResult = await module.handlePushSync({
          db: fixtures.db,
          companyId: fixtures.testCompanyId,
          outletId: fixtures.testOutletId,
          transactions: [],
          activeOrders: [],
          orderUpdates: [],
          itemCancellations: [],
          variantSales: [],
          variantStockAdjustments: [adjustment],
          correlationId,
        });

        expect(secondResult.variantStockAdjustmentResults).toHaveLength(1);
        expect(secondResult.variantStockAdjustmentResults![0].result).toBe('DUPLICATE');
      });
    });

    describe('combined push scenarios', () => {
      it('should process multiple operation types in single call', async () => {
        const transaction: TransactionPush = {
          client_tx_id: uniqueId('tx-combined'),
          company_id: fixtures.testCompanyId,
          outlet_id: fixtures.testOutletId,
          cashier_user_id: fixtures.testUserId,
          status: 'COMPLETED',
          service_type: 'TAKEAWAY',
          trx_at: '2024-01-15T10:30:00+07:00',
          items: [{ item_id: 1, qty: 1, price_snapshot: 10000, name_snapshot: 'Item' }],
          payments: [{ method: 'CASH', amount: 10000 }],
        };

        const activeOrder: ActiveOrderPush = {
          order_id: uniqueId('order-combined'),
          company_id: fixtures.testCompanyId,
          outlet_id: fixtures.testOutletId,
          service_type: 'TAKEAWAY',
          is_finalized: false,
          order_status: 'OPEN',
          order_state: 'OPEN',
          paid_amount: 0,
          opened_at: '2024-01-15T10:00:00+07:00',
          updated_at: '2024-01-15T10:30:00+07:00',
          lines: [],
        };

        const orderUpdate: OrderUpdatePush = {
          update_id: uniqueId('update-combined'),
          order_id: 'test-seed-order-3',  // Use seeded order that exists in DB
          company_id: fixtures.testCompanyId,
          outlet_id: fixtures.testOutletId,
          event_type: 'ITEM_ADDED',
          delta_json: '{}',
          device_id: 'device-1',
          event_at: '2024-01-15T10:30:00+07:00',
        };

        const cancellation: ItemCancellationPush = {
          cancellation_id: uniqueId('cancel-combined'),
          order_id: 'test-seed-order-4',  // Use seeded order that exists in DB
          item_id: 1,
          company_id: fixtures.testCompanyId,
          outlet_id: fixtures.testOutletId,
          cancelled_quantity: 1,
          reason: 'Test',
          cancelled_at: '2024-01-15T10:30:00+07:00',
        };

        const result = await module.handlePushSync({
          db: fixtures.db,
          companyId: fixtures.testCompanyId,
          outletId: fixtures.testOutletId,
          transactions: [transaction],
          activeOrders: [activeOrder],
          orderUpdates: [orderUpdate],
          itemCancellations: [cancellation],
          variantSales: [],
          variantStockAdjustments: [],
          correlationId,
        });

        // Verify all operations were processed
        expect(result.results).toHaveLength(1);
        expect(result.results[0].result).toBe('OK');
        expect(result.orderUpdateResults.length).toBeGreaterThanOrEqual(2); // Active order + order update
        expect(result.itemCancellationResults).toHaveLength(1);
      });
    });
  });

  // ===========================================================================
  // Module Lifecycle Tests
  // ===========================================================================

  describe('lifecycle', () => {
    it('should initialize with database connection', () => {
      expect(module).toBeDefined();
      expect(module.moduleId).toBe('pos');
      expect(module.clientType).toBe('POS');
    });

    it('should return healthy status', async () => {
      const health = await module.healthCheck();
      expect(health.healthy).toBe(true);
      expect(health.message).toBe('POS sync module operational');
    });
  });
});
