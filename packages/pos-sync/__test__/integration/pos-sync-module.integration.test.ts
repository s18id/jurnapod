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
import { createKysely, type KyselySchema } from '@jurnapod/db';
import { sql } from 'kysely';
import { PosSyncModule } from '../../src/pos-sync-module.js';
import type { PullSyncParams } from '../../src/pull/types.js';
import type {
  TransactionPush,
  ActiveOrderPush,
  OrderUpdatePush,
  ItemCancellationPush,
  VariantSalePush,
  VariantStockAdjustmentPush,
} from '../../src/push/types.js';

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
  db: KyselySchema;
  testUserId: number;
  testCompanyId: number;
  testOutletId: number;
  testItemId: number;
}

async function setupTestFixtures(): Promise<TestFixtures> {
  const config = loadTestConfig();
  
  // Create Kysely instance using environment variables
  const db = createKysely({
    host: process.env.DB_HOST ?? '127.0.0.1',
    port: Number(process.env.DB_PORT ?? '3306'),
    user: process.env.DB_USER ?? 'root',
    password: process.env.DB_PASSWORD ?? '',
    database: process.env.DB_NAME ?? 'jurnapod',
  });

  // Find a CASHIER user in this company (not owner - owner may not have cashier role)
  // The user must have a role with 'cashier' in the name to pass isCashierInCompany validation
  const userRows = await sql`
    SELECT u.id as user_id, u.company_id
    FROM users u
    INNER JOIN companies c ON c.id = u.company_id
    INNER JOIN user_role_assignments ura ON ura.user_id = u.id
    INNER JOIN roles r ON r.id = ura.role_id
    WHERE c.code = ${config.companyCode}
      AND LOWER(r.name) LIKE '%cashier%'
      AND u.is_active = 1
    LIMIT 1
  `.execute(db);

  if (userRows.rows.length === 0) {
    throw new Error(
      `Cashier fixture not found; run database seed first. ` +
      `Looking for company=${config.companyCode} with a user having cashier role`
    );
  }

  // Get outlet by code
  const outletRows = await db
    .selectFrom('outlets as o')
    .innerJoin('companies as c', 'c.id', 'o.company_id')
    .select(['o.id as outlet_id'])
    .where('c.code', '=', config.companyCode)
    .where('o.code', '=', config.outletCode)
    .limit(1)
    .execute();

  if (outletRows.length === 0) {
    throw new Error(
      `Outlet fixture not found; run database seed first. ` +
      `Looking for company=${config.companyCode}, outlet=${config.outletCode}`
    );
  }

  // Find a real item for this company
  const companyId = Number((userRows.rows[0] as { user_id: number; company_id: number }).company_id);
  const itemRows = await sql`
    SELECT id FROM items 
    WHERE company_id = ${companyId}
    LIMIT 1
  `.execute(db);

  if (itemRows.rows.length === 0) {
    throw new Error(
      `Test requires at least one item in company ${config.companyCode} — run seed first`
    );
  }
  const testItemId = Number((itemRows.rows[0] as { id: number }).id);

  return {
    db,
    testUserId: Number((userRows.rows[0] as { user_id: number; company_id: number }).user_id),
    testCompanyId: companyId,
    testOutletId: Number(outletRows[0].outlet_id),
    testItemId,
  };
}

async function closeDb(db: KyselySchema): Promise<void> {
  await db.destroy();
}

// ============================================================================
// Test Suite
// ============================================================================

describe('PosSyncModule Integration', () => {
  let fixtures: TestFixtures;
  let module: PosSyncModule;
  const TEST_ID_PREFIX = 's495';
  // Stable correlationId — deterministic per test run
  const CORRELATION_ID_BASE = 'test-correlation-001';
  let correlationId: string;

  beforeAll(async () => {
    // Setup database connection
    fixtures = await setupTestFixtures();

    // Teardown-only cleanup for deterministic test keys to keep reruns stable.
    // This removes rows created by this suite in previous runs.
    await sql`
      DELETE FROM pos_transactions
      WHERE company_id = ${fixtures.testCompanyId}
        AND client_tx_id LIKE ${`${TEST_ID_PREFIX}-%`}
    `.execute(fixtures.db);

    await sql`
      DELETE FROM pos_order_updates
      WHERE company_id = ${fixtures.testCompanyId}
        AND update_id LIKE ${`${TEST_ID_PREFIX}-%`}
    `.execute(fixtures.db);

    await sql`
      DELETE FROM pos_item_cancellations
      WHERE company_id = ${fixtures.testCompanyId}
        AND cancellation_id LIKE ${`${TEST_ID_PREFIX}-%`}
    `.execute(fixtures.db);

    await sql`
      DELETE FROM variant_sales
      WHERE company_id = ${fixtures.testCompanyId}
        AND client_tx_id LIKE ${`${TEST_ID_PREFIX}-%`}
    `.execute(fixtures.db);

    await sql`
      DELETE FROM variant_stock_adjustments
      WHERE company_id = ${fixtures.testCompanyId}
        AND client_tx_id LIKE ${`${TEST_ID_PREFIX}-%`}
    `.execute(fixtures.db);

    // Seed pos_order_snapshots for FK-dependent tests (order_updates, item_cancellations)
    // Insert multiple orders so tests can use distinct order_ids
    const seedOrders = [
      'test-seed-order-1',
      'test-seed-order-2', 
      'test-seed-order-3',
      'test-seed-order-4',
    ];
    for (const orderId of seedOrders) {
      await sql`
        INSERT IGNORE INTO pos_order_snapshots 
        (order_id, company_id, outlet_id, service_type, order_status, order_state, is_finalized, opened_at, updated_at, opened_at_ts, updated_at_ts) 
        VALUES (${orderId}, ${fixtures.testCompanyId}, ${fixtures.testOutletId}, 'TAKEAWAY', 'OPEN', 'OPEN', 0, NOW(), NOW(), UNIX_TIMESTAMP(NOW()) * 1000, UNIX_TIMESTAMP(NOW()) * 1000)
      `.execute(fixtures.db);
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

    correlationId = 'test-initial-correlation';
  });

  afterAll(async () => {
    // Cleanup module (only if initialized successfully)
    if (module) {
      await module.cleanup();
    }
    
    // Close database connection (only if fixtures were setup successfully)
    if (fixtures?.db) {
      await closeDb(fixtures.db);
    }
  });

  beforeEach(() => {
    // Correlation ID resets per test but stays deterministic (no Date.now/Math.random)
    correlationId = `${CORRELATION_ID_BASE}-${expect.getState().currentTestName ?? 'unknown'}`;
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

    it('should follow canonical pull cursor contract (since_version -> data_version)', async () => {
      const initial = await module.handlePullSync({
        companyId: fixtures.testCompanyId,
        outletId: fixtures.testOutletId,
        sinceVersion: 0,
      });

      expect(initial.payload.data_version).toBe(initial.currentVersion);
      expect(initial.payload.data_version).toBeGreaterThanOrEqual(0);

      const incremental = await module.handlePullSync({
        companyId: fixtures.testCompanyId,
        outletId: fixtures.testOutletId,
        sinceVersion: initial.payload.data_version,
      });

      expect(incremental.payload.data_version).toBeGreaterThanOrEqual(initial.payload.data_version);
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
    // Deterministic idempotency key generator per test case
    // Uses describe block index + test case counter to ensure uniqueness without Date.now/Math.random
    const _txCounter = { c: 0 };
    const _orderCounter = { c: 0 };
    const _updateCounter = { c: 0 };
    const _cancelCounter = { c: 0 };
    const _saleCounter = { c: 0 };
    const _adjustCounter = { c: 0 };
    function txId(prefix: string) { return `${TEST_ID_PREFIX}-${prefix}-t${_txCounter.c++}`; }
    function orderId(prefix: string) { return `${TEST_ID_PREFIX}-${prefix}-o${_orderCounter.c++}`; }
    function updateId(prefix: string) { return `${TEST_ID_PREFIX}-${prefix}-u${_updateCounter.c++}`; }
    function cancelId(prefix: string) { return `${TEST_ID_PREFIX}-${prefix}-c${_cancelCounter.c++}`; }
    function saleId(prefix: string) { return `${TEST_ID_PREFIX}-${prefix}-s${_saleCounter.c++}`; }
    function adjustId(prefix: string) { return `${TEST_ID_PREFIX}-${prefix}-a${_adjustCounter.c++}`; }

    describe('transaction push with idempotency', () => {
      it('should return canonical push statuses only (OK/DUPLICATE/ERROR)', async () => {
        const canonicalStatuses = new Set(['OK', 'DUPLICATE', 'ERROR']);
        const clientTxId = txId('tx-canonical-status');

        const validTransaction: TransactionPush = {
          client_tx_id: clientTxId,
          company_id: fixtures.testCompanyId,
          outlet_id: fixtures.testOutletId,
          cashier_user_id: fixtures.testUserId,
          status: 'COMPLETED',
          service_type: 'TAKEAWAY',
          trx_at: '2024-01-15T10:30:00+07:00',
          items: [
            {
              item_id: fixtures.testItemId,
              qty: 1,
              price_snapshot: 15000,
              name_snapshot: 'Test Item',
            },
          ],
          payments: [{ method: 'CASH', amount: 15000 }],
        };

        const invalidTransaction: TransactionPush = {
          client_tx_id: txId('tx-canonical-error'),
          company_id: fixtures.testCompanyId,
          outlet_id: fixtures.testOutletId,
          cashier_user_id: fixtures.testUserId,
          status: 'COMPLETED',
          service_type: 'DINE_IN',
          trx_at: '2024-01-15T10:30:00+07:00',
          items: [
            {
              item_id: fixtures.testItemId,
              qty: 1,
              price_snapshot: 15000,
              name_snapshot: 'Test Item',
            },
          ],
          payments: [{ method: 'CASH', amount: 15000 }],
        };

        const first = await module.handlePushSync({
          db: fixtures.db,
          companyId: fixtures.testCompanyId,
          outletId: fixtures.testOutletId,
          transactions: [validTransaction],
          activeOrders: [],
          orderUpdates: [],
          itemCancellations: [],
          variantSales: [],
          variantStockAdjustments: [],
          correlationId,
        });

        const duplicate = await module.handlePushSync({
          db: fixtures.db,
          companyId: fixtures.testCompanyId,
          outletId: fixtures.testOutletId,
          transactions: [validTransaction],
          activeOrders: [],
          orderUpdates: [],
          itemCancellations: [],
          variantSales: [],
          variantStockAdjustments: [],
          correlationId,
        });

        const invalid = await module.handlePushSync({
          db: fixtures.db,
          companyId: fixtures.testCompanyId,
          outletId: fixtures.testOutletId,
          transactions: [invalidTransaction],
          activeOrders: [],
          orderUpdates: [],
          itemCancellations: [],
          variantSales: [],
          variantStockAdjustments: [],
          correlationId,
        });

        const statuses = [
          ...first.results.map((r) => r.result),
          ...duplicate.results.map((r) => r.result),
          ...invalid.results.map((r) => r.result),
        ];

        expect(statuses).toContain('OK');
        expect(statuses).toContain('DUPLICATE');
        expect(statuses).toContain('ERROR');
        for (const status of statuses) {
          expect(canonicalStatuses.has(status)).toBe(true);
        }
      });

      it('should process new transaction successfully', async () => {
        const transaction: TransactionPush = {
          client_tx_id: txId('tx'),
          company_id: fixtures.testCompanyId,
          outlet_id: fixtures.testOutletId,
          cashier_user_id: fixtures.testUserId,
          status: 'COMPLETED',
          service_type: 'TAKEAWAY',
          trx_at: '2024-01-15T10:30:00+07:00',
          items: [
            {
              item_id: fixtures.testItemId,
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
        const clientTxId = txId('tx-dup');
        const trxAtIso = '2024-01-15T10:30:00+07:00';
        const expectedTrxAtTs = Date.parse(trxAtIso);

        const transaction: TransactionPush = {
          client_tx_id: clientTxId,
          company_id: fixtures.testCompanyId,
          outlet_id: fixtures.testOutletId,
          cashier_user_id: fixtures.testUserId,
          status: 'COMPLETED',
          service_type: 'TAKEAWAY',
          trx_at: trxAtIso,
          items: [
            {
              item_id: fixtures.testItemId,
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

        const persistedRows = await sql<{
          row_count: number;
          trx_at_ts: number;
        }>`
          SELECT COUNT(*) AS row_count, MAX(trx_at_ts) AS trx_at_ts
          FROM pos_transactions
          WHERE company_id = ${fixtures.testCompanyId}
            AND outlet_id = ${fixtures.testOutletId}
            AND client_tx_id = ${clientTxId}
        `.execute(fixtures.db);

        expect(Number(persistedRows.rows[0]?.row_count ?? 0)).toBe(1);
        expect(Number(persistedRows.rows[0]?.trx_at_ts ?? 0)).toBe(expectedTrxAtTs);
      });

      it('should write SKIPPED audit log entry on duplicate detection', async () => {
        const clientTxId = txId('tx-skipped-audit');

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
              item_id: fixtures.testItemId,
              qty: 1,
              price_snapshot: 15000,
              name_snapshot: 'Test Item',
            },
          ],
          payments: [{ method: 'CASH', amount: 15000 }],
        };

        // First push - OK
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

        // Second push - DUPLICATE, should create SKIPPED audit entry
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
        expect(secondResult.results[0].result).toBe('DUPLICATE');

        // Verify SKIPPED audit log entry exists
        const auditRows = await sql<{
          action: string;
          result: string;
          success: number;
          payload_json: string;
        }>`
          SELECT action, result, success, payload_json
          FROM audit_logs
          WHERE company_id = ${fixtures.testCompanyId}
            AND outlet_id = ${fixtures.testOutletId}
            AND action = 'SYNC_PUSH_DUPLICATE_SKIPPED'
            AND payload_json LIKE ${'%' + clientTxId + '%'}
          LIMIT 1
        `.execute(fixtures.db);

        expect(auditRows.rows.length).toBe(1);
        expect(auditRows.rows[0].result).toBe('SKIPPED');
        expect(Number(auditRows.rows[0].success)).toBe(0);
      });

      it('should reject transaction with company_id mismatch', async () => {
        const transaction: TransactionPush = {
          client_tx_id: txId('tx-company-mismatch'),
          company_id: fixtures.testCompanyId + 9999, // Wrong company
          outlet_id: fixtures.testOutletId,
          cashier_user_id: fixtures.testUserId,
          status: 'COMPLETED',
          service_type: 'TAKEAWAY',
          trx_at: '2024-01-15T10:30:00+07:00',
          items: [
            {
              item_id: fixtures.testItemId,
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
          client_tx_id: txId('tx-dinein'),
          company_id: fixtures.testCompanyId,
          outlet_id: fixtures.testOutletId,
          cashier_user_id: fixtures.testUserId,
          status: 'COMPLETED',
          service_type: 'DINE_IN',
          // table_id is missing
          trx_at: '2024-01-15T10:30:00+07:00',
          items: [
            {
              item_id: fixtures.testItemId,
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
        expect(result.results[0].message).toBe('DINE_IN_REQUIRES_TABLE_ID');
      });
    });

    describe('active orders push', () => {
      it('should process active orders successfully', async () => {
        const activeOrder: ActiveOrderPush = {
          order_id: orderId('order'),
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
              item_id: fixtures.testItemId,
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
          update_id: updateId('update'),
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
        const dupUpdateId = updateId('update-dup');
        const orderUpdate: OrderUpdatePush = {
          update_id: dupUpdateId,
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
          cancellation_id: cancelId('cancel'),
          order_id: 'test-seed-order-3',
          item_id: fixtures.testItemId,
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
        const cancellationId = cancelId('cancel-dup');
        const cancellation: ItemCancellationPush = {
          cancellation_id: cancellationId,
          order_id: 'test-seed-order-4',
          item_id: fixtures.testItemId,
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
        const variants = await sql<{ id: number; item_id: number }>`
          SELECT id, item_id FROM item_variants WHERE company_id = ${fixtures.testCompanyId} AND is_active = 1 LIMIT 1
        `.execute(fixtures.db);
        if (variants.rows.length > 0) {
          testVariant = { id: Number(variants.rows[0].id), item_id: Number(variants.rows[0].item_id) };
        }
      });

      it('should process variant sales successfully', async () => {
        if (!testVariant) {
          return; // Skip if no variants - will show as incomplete but not error
        }

        const sale: VariantSalePush = {
          client_tx_id: saleId('sale'),
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
          client_tx_id: saleId('sale-company-mismatch'),
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
        expect(result.variantSaleResults![0].message).toBe('COMPANY_ID_MISMATCH');
      });

      it('should detect duplicate by same client_tx_id', async () => {
        if (!testVariant) {
          return; // Skip if no variants
        }

        const clientTxId = saleId('sale-dup');
        const sale: VariantSalePush = {
          client_tx_id: clientTxId,
          company_id: fixtures.testCompanyId,
          outlet_id: fixtures.testOutletId,
          variant_id: testVariant.id,
          item_id: testVariant.item_id,
          qty: 1,
          unit_price: 15000,
          total_amount: 15000,
          trx_at: '2024-01-15T10:30:00+07:00',
        };

        // First push - should succeed
        const firstResult = await module.handlePushSync({
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

        expect(firstResult.variantSaleResults).toBeDefined();
        expect(firstResult.variantSaleResults![0].result).toBe('OK');

        // Second push with same client_tx_id - should be DUPLICATE
        const secondResult = await module.handlePushSync({
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

        expect(secondResult.variantSaleResults).toBeDefined();
        expect(secondResult.variantSaleResults![0].result).toBe('DUPLICATE');
      });

      it('should NOT detect as duplicate when same variant/trx_at but different client_tx_id', async () => {
        if (!testVariant) {
          return; // Skip if no variants
        }

        // First sale
        const sale1: VariantSalePush = {
          client_tx_id: saleId('sale-diff-tx-1'),
          company_id: fixtures.testCompanyId,
          outlet_id: fixtures.testOutletId,
          variant_id: testVariant.id,
          item_id: testVariant.item_id,
          qty: 1,
          unit_price: 15000,
          total_amount: 15000,
          trx_at: '2024-01-15T10:30:00+07:00', // Same time
        };

        // Second sale with SAME variant and same trx_at but DIFFERENT client_tx_id
        const sale2: VariantSalePush = {
          client_tx_id: saleId('sale-diff-tx-2'), // Different client_tx_id!
          company_id: fixtures.testCompanyId,
          outlet_id: fixtures.testOutletId,
          variant_id: testVariant.id,
          item_id: testVariant.item_id,
          qty: 1,
          unit_price: 15000,
          total_amount: 15000,
          trx_at: '2024-01-15T10:30:00+07:00', // Same time
        };

        // Push first sale
        const firstResult = await module.handlePushSync({
          db: fixtures.db,
          companyId: fixtures.testCompanyId,
          outletId: fixtures.testOutletId,
          transactions: [],
          activeOrders: [],
          orderUpdates: [],
          itemCancellations: [],
          variantSales: [sale1],
          variantStockAdjustments: [],
          correlationId,
        });

        expect(firstResult.variantSaleResults![0].result).toBe('OK');

        // Push second sale - should succeed (different client_tx_id, even though same variant/trx_at)
        const secondResult = await module.handlePushSync({
          db: fixtures.db,
          companyId: fixtures.testCompanyId,
          outletId: fixtures.testOutletId,
          transactions: [],
          activeOrders: [],
          orderUpdates: [],
          itemCancellations: [],
          variantSales: [sale2],
          variantStockAdjustments: [],
          correlationId,
        });

        // Should be OK, not DUPLICATE (different client_tx_id)
        expect(secondResult.variantSaleResults).toBeDefined();
        expect(secondResult.variantSaleResults![0].result).toBe('OK');
      });
    });

    describe('variant stock adjustments push', () => {
      let stockTestVariant: { id: number; item_id: number } | null = null;

      beforeAll(async () => {
        const variants = await sql<{ id: number; item_id: number }>`
          SELECT id, item_id FROM item_variants WHERE company_id = ${fixtures.testCompanyId} AND is_active = 1 LIMIT 1
        `.execute(fixtures.db);
        if (variants.rows.length > 0) {
          stockTestVariant = { id: Number(variants.rows[0].id), item_id: Number(variants.rows[0].item_id) };
        }
      });

      it('should process INCREASE stock adjustment successfully', async () => {
        if (!stockTestVariant) {
          return; // Skip if no variants
        }

        const adjustment: VariantStockAdjustmentPush = {
          client_tx_id: adjustId('adjust'),
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
          client_tx_id: adjustId('adjust-invalid'),
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
        const clientTxId = adjustId('adjust-dup');

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
          client_tx_id: txId('tx-combined'),
          company_id: fixtures.testCompanyId,
          outlet_id: fixtures.testOutletId,
          cashier_user_id: fixtures.testUserId,
          status: 'COMPLETED',
          service_type: 'TAKEAWAY',
          trx_at: '2024-01-15T10:30:00+07:00',
          items: [{ item_id: fixtures.testItemId, qty: 1, price_snapshot: 10000, name_snapshot: 'Item' }],
          payments: [{ method: 'CASH', amount: 10000 }],
        };

        const activeOrder: ActiveOrderPush = {
          order_id: orderId('order-combined'),
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
          update_id: updateId('update-combined'),
          order_id: 'test-seed-order-3',  // Use seeded order that exists in DB
          company_id: fixtures.testCompanyId,
          outlet_id: fixtures.testOutletId,
          event_type: 'ITEM_ADDED',
          delta_json: '{}',
          device_id: 'device-1',
          event_at: '2024-01-15T10:30:00+07:00',
        };

        const cancellation: ItemCancellationPush = {
          cancellation_id: cancelId('cancel-combined'),
          order_id: 'test-seed-order-4',  // Use seeded order that exists in DB
          item_id: fixtures.testItemId,
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
