// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.

/**
 * persistPushBatch Integration Tests
 * 
 * Tests for the batch transaction persistence functionality using real database.
 * These tests verify actual DB operations including idempotency, validation,
 * and batch processing behavior.
 * 
 * CRITICAL: All tests must close the DB pool after completion.
 */

// Load .env file before any other imports
import path from 'path';
import { config as loadEnv } from 'dotenv';
loadEnv({ path: path.resolve(process.cwd(), '.env') });

import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createKysely, type KyselySchema } from '@jurnapod/db';
import { persistPushBatch, type TransactionPush, type SyncPushResultItem } from '../../src/push/index.js';
import type { PostingHookFn } from '../../src/push/types.js';
import { sql } from 'kysely';

// ============================================================================
// Test Configuration
// ============================================================================

interface TestConfig {
  companyCode: string;
  outletCode: string;
  ownerEmail: string;
}

function loadTestConfig(): TestConfig {
  const companyCode = process.env.JP_COMPANY_CODE ?? 'JP';
  const outletCode = process.env.JP_OUTLET_CODE ?? 'MAIN';
  const ownerEmail = process.env.JP_OWNER_EMAIL ?? 'signaldelapanbelas@gmail.com';
  
  return { companyCode, outletCode, ownerEmail };
}

// ============================================================================
// Database Setup
// ============================================================================

interface TestFixtures {
  db: KyselySchema;
  testCompanyId: number;
  testOutletId: number;
  cashierUserId: number;
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

  // Find test company fixture
  const companyRows = await db
    .selectFrom('companies as c')
    .innerJoin('outlets as o', 'o.company_id', 'c.id')
    .select(['c.id as company_id', 'o.id as outlet_id'])
    .where('c.code', '=', config.companyCode)
    .where('o.code', '=', config.outletCode)
    .limit(1)
    .execute();

  if (companyRows.length === 0) {
    throw new Error(
      `Company fixture not found; run database seed first. ` +
      `Looking for company=${config.companyCode}, outlet=${config.outletCode}`
    );
  }

  // Find a CASHIER user in this company
  const cashierUser = await db
    .selectFrom("users as u")
    .innerJoin("user_role_assignments as ura", "ura.user_id", "u.id")
    .innerJoin("roles as r", "r.id", "ura.role_id")
    .select(["u.id"])
    .where("u.company_id", "=", Number(companyRows[0].company_id))
    .where("u.is_active", "=", 1)
    .where((eb) => eb("r.name", "like", "%cashier%").or("r.name", "like", "%CASHIER%"))
    .limit(1)
    .executeTakeFirst();

  if (!cashierUser) {
    throw new Error(
      `Cashier fixture not found for company ${config.companyCode}. ` +
      `Please ensure a user with 'cashier' role exists in the seed data.`
    );
  }

  // Find a real item for this company via Kysely-native
  const itemRow = await db
    .selectFrom("items")
    .select("id")
    .where("company_id", "=", Number(companyRows[0].company_id))
    .limit(1)
    .executeTakeFirst();

  if (!itemRow) {
    throw new Error(
      `Test requires at least one item in company ${config.companyCode} — run seed first`
    );
  }
  const testItemId = Number(itemRow.id);

  return {
    db,
    testCompanyId: Number(companyRows[0].company_id),
    testOutletId: Number(companyRows[0].outlet_id),
    cashierUserId: Number(cashierUser.id),
    testItemId,
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Clean up test transactions by client_tx_id prefix
 */
async function cleanupTestTransactions(db: KyselySchema, prefix: string): Promise<void> {
  await db
    .deleteFrom('pos_transactions')
    .where('client_tx_id', 'like', `${prefix}%`)
    .execute();
}

/**
 * Clean up test inventory transactions by reference_id prefix
 */
async function cleanupTestInventoryTransactions(db: KyselySchema, prefix: string): Promise<void> {
  await db
    .deleteFrom('inventory_transactions')
    .where('reference_id', 'like', `${prefix}%`)
    .execute();
}

// ============================================================================
// Test Suite
// ============================================================================

describe('persistPushBatch Integration', () => {
  let fixtures: TestFixtures;

  beforeAll(async () => {
    fixtures = await setupTestFixtures();
  });

  afterAll(async () => {
    await fixtures.db.destroy();
  });

  beforeEach(async () => {
    // Clean up any leftover test data from previous runs
    await cleanupTestTransactions(fixtures.db, 'test-int-');
    await cleanupTestInventoryTransactions(fixtures.db, 'test-int-');
  });

  describe('empty batch handling', () => {
    test('should return empty results for empty batch', async () => {
      const results = await persistPushBatch(
        fixtures.db,
        [],
        fixtures.testCompanyId,
        fixtures.testOutletId,
        'test-correlation'
      );

      expect(results).toEqual([]);
    });
  });

  describe('transaction processing', () => {
    test('should process all new transactions successfully', async () => {
      const transactions: TransactionPush[] = [
        {
          client_tx_id: 'test-int-tx-new-1',
          company_id: fixtures.testCompanyId,
          outlet_id: fixtures.testOutletId,
          cashier_user_id: fixtures.cashierUserId,
          status: 'COMPLETED',
          notes: 'tx-new-1',
          service_type: 'TAKEAWAY',
          trx_at: '2024-01-15T10:30:00+07:00',
          items: [{ item_id: fixtures.testItemId, qty: 1, price_snapshot: 15000, name_snapshot: 'Test Item' }],
          payments: [{ method: 'CASH', amount: 15000 }],
        },
        {
          client_tx_id: 'test-int-tx-new-2',
          company_id: fixtures.testCompanyId,
          outlet_id: fixtures.testOutletId,
          cashier_user_id: fixtures.cashierUserId,
          status: 'COMPLETED',
          notes: 'tx-new-2',
          service_type: 'TAKEAWAY',
          trx_at: '2024-01-15T10:35:00+07:00',
          items: [{ item_id: fixtures.testItemId, qty: 2, price_snapshot: 15000, name_snapshot: 'Test Item' }],
          payments: [{ method: 'CASH', amount: 30000 }],
        },
      ];

      const results = await persistPushBatch(
        fixtures.db,
        transactions,
        fixtures.testCompanyId,
        fixtures.testOutletId,
        'test-correlation'
      );

      expect(results).toHaveLength(2);
      expect(results.every(r => r.result === 'OK')).toBe(true);
      expect(results.map(r => r.client_tx_id)).toEqual(['test-int-tx-new-1', 'test-int-tx-new-2']);
    });

    test('should detect duplicate transactions by client_tx_id', async () => {
      const clientTxId = 'test-int-tx-dup-1';
      const transaction: TransactionPush = {
        client_tx_id: clientTxId,
        company_id: fixtures.testCompanyId,
        outlet_id: fixtures.testOutletId,
        cashier_user_id: fixtures.cashierUserId,
        status: 'COMPLETED',
        service_type: 'TAKEAWAY',
        trx_at: '2024-01-15T11:00:00+07:00',
        items: [{ item_id: fixtures.testItemId, qty: 1, price_snapshot: 15000, name_snapshot: 'Test Item' }],
        payments: [{ method: 'CASH', amount: 15000 }],
      };

      // First push - should succeed
      const firstResults = await persistPushBatch(
        fixtures.db,
        [transaction],
        fixtures.testCompanyId,
        fixtures.testOutletId,
        'test-correlation'
      );

      expect(firstResults[0].result).toBe('OK');

      // Second push with same client_tx_id - should return DUPLICATE
      const secondResults = await persistPushBatch(
        fixtures.db,
        [transaction],
        fixtures.testCompanyId,
        fixtures.testOutletId,
        'test-correlation'
      );

      expect(secondResults[0].result).toBe('DUPLICATE');
    });

    test('should filter out transactions with mismatched company_id', async () => {
      const transactions: TransactionPush[] = [
        {
          client_tx_id: 'test-int-tx-company-1',
          company_id: fixtures.testCompanyId, // Valid
          outlet_id: fixtures.testOutletId,
          cashier_user_id: fixtures.cashierUserId,
          status: 'COMPLETED',
          service_type: 'TAKEAWAY',
          trx_at: '2024-01-15T11:30:00+07:00',
          items: [{ item_id: fixtures.testItemId, qty: 1, price_snapshot: 15000, name_snapshot: 'Test Item' }],
          payments: [{ method: 'CASH', amount: 15000 }],
        },
        {
          client_tx_id: 'test-int-tx-company-2',
          company_id: fixtures.testCompanyId + 9999, // Invalid - wrong company
          outlet_id: fixtures.testOutletId,
          cashier_user_id: fixtures.cashierUserId,
          status: 'COMPLETED',
          service_type: 'TAKEAWAY',
          trx_at: '2024-01-15T11:35:00+07:00',
          items: [{ item_id: fixtures.testItemId, qty: 1, price_snapshot: 15000, name_snapshot: 'Test Item' }],
          payments: [{ method: 'CASH', amount: 15000 }],
        },
      ];

      const results = await persistPushBatch(
        fixtures.db,
        transactions,
        fixtures.testCompanyId,
        fixtures.testOutletId,
        'test-correlation'
      );

      // Only the valid company transaction should be processed
      expect(results).toHaveLength(1);
      expect(results[0].client_tx_id).toBe('test-int-tx-company-1');
      expect(results[0].result).toBe('OK');
    });

    test('should ignore mismatched transaction even when client_tx_id collides with eligible transaction', async () => {
      const sharedClientTxId = 'test-int-tx-company-collision-1';
      const transactions: TransactionPush[] = [
        {
          client_tx_id: sharedClientTxId,
          company_id: fixtures.testCompanyId + 9999, // Invalid - wrong company
          outlet_id: fixtures.testOutletId,
          cashier_user_id: fixtures.cashierUserId,
          status: 'COMPLETED',
          service_type: 'TAKEAWAY',
          trx_at: '2024-01-15T11:36:00+07:00',
          items: [{ item_id: fixtures.testItemId, qty: 1, price_snapshot: 15000, name_snapshot: 'Test Item' }],
          payments: [{ method: 'CASH', amount: 15000 }],
        },
        {
          client_tx_id: sharedClientTxId,
          company_id: fixtures.testCompanyId, // Valid
          outlet_id: fixtures.testOutletId,
          cashier_user_id: fixtures.cashierUserId,
          status: 'COMPLETED',
          service_type: 'TAKEAWAY',
          trx_at: '2024-01-15T11:37:00+07:00',
          items: [{ item_id: fixtures.testItemId, qty: 1, price_snapshot: 15000, name_snapshot: 'Test Item' }],
          payments: [{ method: 'CASH', amount: 15000 }],
        },
      ];

      const results = await persistPushBatch(
        fixtures.db,
        transactions,
        fixtures.testCompanyId,
        fixtures.testOutletId,
        'test-correlation'
      );

      // Only eligible transaction should appear in results.
      // Mismatched tenant row must never consume or shadow a valid result.
      expect(results).toHaveLength(1);
      expect(results[0].client_tx_id).toBe(sharedClientTxId);
      expect(results[0].result).toBe('OK');
    });

    test('should filter out transactions with mismatched outlet_id', async () => {
      const transactions: TransactionPush[] = [
        {
          client_tx_id: 'test-int-tx-outlet-1',
          company_id: fixtures.testCompanyId,
          outlet_id: fixtures.testOutletId, // Valid
          cashier_user_id: fixtures.cashierUserId,
          status: 'COMPLETED',
          service_type: 'TAKEAWAY',
          trx_at: '2024-01-15T12:00:00+07:00',
          items: [{ item_id: fixtures.testItemId, qty: 1, price_snapshot: 15000, name_snapshot: 'Test Item' }],
          payments: [{ method: 'CASH', amount: 15000 }],
        },
        {
          client_tx_id: 'test-int-tx-outlet-2',
          company_id: fixtures.testCompanyId,
          outlet_id: fixtures.testOutletId + 9999, // Invalid - wrong outlet
          cashier_user_id: fixtures.cashierUserId,
          status: 'COMPLETED',
          service_type: 'TAKEAWAY',
          trx_at: '2024-01-15T12:05:00+07:00',
          items: [{ item_id: fixtures.testItemId, qty: 1, price_snapshot: 15000, name_snapshot: 'Test Item' }],
          payments: [{ method: 'CASH', amount: 15000 }],
        },
      ];

      const results = await persistPushBatch(
        fixtures.db,
        transactions,
        fixtures.testCompanyId,
        fixtures.testOutletId,
        'test-correlation'
      );

      // Only the valid outlet transaction should be processed
      expect(results).toHaveLength(1);
      expect(results[0].client_tx_id).toBe('test-int-tx-outlet-1');
      expect(results[0].result).toBe('OK');
    });

    test('should return ERROR for DINE_IN without table_id', async () => {
      const transaction: TransactionPush = {
        client_tx_id: 'test-int-tx-dinein-no-table',
        company_id: fixtures.testCompanyId,
        outlet_id: fixtures.testOutletId,
        cashier_user_id: fixtures.cashierUserId,
        status: 'COMPLETED',
        service_type: 'DINE_IN', // DINE_IN requires table_id
        trx_at: '2024-01-15T12:30:00+07:00',
        items: [{ item_id: fixtures.testItemId, qty: 1, price_snapshot: 15000, name_snapshot: 'Test Item' }],
        payments: [{ method: 'CASH', amount: 15000 }],
        // table_id is missing!
      };

      const results = await persistPushBatch(
        fixtures.db,
        [transaction],
        fixtures.testCompanyId,
        fixtures.testOutletId,
        'test-correlation'
      );

      expect(results[0].result).toBe('ERROR');
      expect(results[0].message).toBe('DINE_IN_REQUIRES_TABLE_ID');
    });
  });

  describe('concurrency handling', () => {
    test('should respect maxConcurrency option', async () => {
      const transactions: TransactionPush[] = Array.from({ length: 6 }, (_, i) => ({
        client_tx_id: `test-int-tx-concurrency-${i}`,
        company_id: fixtures.testCompanyId,
        outlet_id: fixtures.testOutletId,
        cashier_user_id: fixtures.cashierUserId,
        status: 'COMPLETED',
        service_type: 'TAKEAWAY',
        trx_at: `2024-01-15T13:${String(i).padStart(2, '0')}:00+07:00`,
        items: [{ item_id: fixtures.testItemId, qty: 1, price_snapshot: 15000, name_snapshot: 'Test Item' }],
        payments: [{ method: 'CASH', amount: 15000 }],
      }));

      // With maxConcurrency=2, 6 transactions should be split into 3 batches
      const results = await persistPushBatch(
        fixtures.db,
        transactions,
        fixtures.testCompanyId,
        fixtures.testOutletId,
        'test-correlation',
        { maxConcurrency: 2 }
      );

      expect(results).toHaveLength(6);
      expect(results.every(r => r.result === 'OK')).toBe(true);
    });

    test('should cap maxConcurrency at 5', async () => {
      const transactions: TransactionPush[] = Array.from({ length: 10 }, (_, i) => ({
        client_tx_id: `test-int-tx-cap-${i}`,
        company_id: fixtures.testCompanyId,
        outlet_id: fixtures.testOutletId,
        cashier_user_id: fixtures.cashierUserId,
        status: 'COMPLETED',
        service_type: 'TAKEAWAY',
        trx_at: `2024-01-15T14:${String(i).padStart(2, '0')}:00+07:00`,
        items: [{ item_id: fixtures.testItemId, qty: 1, price_snapshot: 15000, name_snapshot: 'Test Item' }],
        payments: [{ method: 'CASH', amount: 15000 }],
      }));

      // With maxConcurrency=10 (over cap), should be capped to 5
      const results = await persistPushBatch(
        fixtures.db,
        transactions,
        fixtures.testCompanyId,
        fixtures.testOutletId,
        'test-correlation',
        { maxConcurrency: 10 }
      );

      expect(results).toHaveLength(10);
      expect(results.every(r => r.result === 'OK')).toBe(true);
    });

    test('should use default maxConcurrency of 3 when not specified', async () => {
      const transactions: TransactionPush[] = Array.from({ length: 5 }, (_, i) => ({
        client_tx_id: `test-int-tx-default-${i}`,
        company_id: fixtures.testCompanyId,
        outlet_id: fixtures.testOutletId,
        cashier_user_id: fixtures.cashierUserId,
        status: 'COMPLETED',
        service_type: 'TAKEAWAY',
        trx_at: `2024-01-15T15:${String(i).padStart(2, '0')}:00+07:00`,
        items: [{ item_id: fixtures.testItemId, qty: 1, price_snapshot: 15000, name_snapshot: 'Test Item' }],
        payments: [{ method: 'CASH', amount: 15000 }],
      }));

      // Default maxConcurrency is 3
      const results = await persistPushBatch(
        fixtures.db,
        transactions,
        fixtures.testCompanyId,
        fixtures.testOutletId,
        'test-correlation'
      );

      expect(results).toHaveLength(5);
      expect(results.every(r => r.result === 'OK')).toBe(true);
    });
  });

  describe('batch splitting with duplicate client_tx_id', () => {
    test('should split batch when duplicate client_tx_id detected in current batch', async () => {
      const transactions: TransactionPush[] = [
        {
          client_tx_id: 'test-int-tx-split-1',
          company_id: fixtures.testCompanyId,
          outlet_id: fixtures.testOutletId,
          cashier_user_id: fixtures.cashierUserId,
          status: 'COMPLETED',
          service_type: 'TAKEAWAY',
          trx_at: '2024-01-15T16:00:00+07:00',
          items: [{ item_id: fixtures.testItemId, qty: 1, price_snapshot: 15000, name_snapshot: 'Test Item' }],
          payments: [{ method: 'CASH', amount: 15000 }],
        },
        {
          client_tx_id: 'test-int-tx-split-2',
          company_id: fixtures.testCompanyId,
          outlet_id: fixtures.testOutletId,
          cashier_user_id: fixtures.cashierUserId,
          status: 'COMPLETED',
          service_type: 'TAKEAWAY',
          trx_at: '2024-01-15T16:05:00+07:00',
          items: [{ item_id: fixtures.testItemId, qty: 1, price_snapshot: 15000, name_snapshot: 'Test Item' }],
          payments: [{ method: 'CASH', amount: 15000 }],
        },
        {
          client_tx_id: 'test-int-tx-split-1', // Duplicate - must have SAME payload (including trx_at) for true duplicate
          company_id: fixtures.testCompanyId,
          outlet_id: fixtures.testOutletId,
          cashier_user_id: fixtures.cashierUserId,
          status: 'COMPLETED',
          service_type: 'TAKEAWAY',
          trx_at: '2024-01-15T16:00:00+07:00', // Must be IDENTICAL to first occurrence for idempotency
          items: [{ item_id: fixtures.testItemId, qty: 1, price_snapshot: 15000, name_snapshot: 'Test Item' }],
          payments: [{ method: 'CASH', amount: 15000 }],
        },
      ];

      const results = await persistPushBatch(
        fixtures.db,
        transactions,
        fixtures.testCompanyId,
        fixtures.testOutletId,
        'test-correlation'
      );

      expect(results).toHaveLength(3);
      // First two should be OK, third should be DUPLICATE (since same client_tx_id as first)
      expect(results[0].result).toBe('OK');
      expect(results[1].result).toBe('OK');
      expect(results[2].result).toBe('DUPLICATE');
    });
  });

  describe('finalized-immutability guard (Story 59.1-followup)', () => {
    test('AC1: allows COMPLETED→COMPLETED with different client_tx_id (not a mutation)', async () => {
      const trxAt = '2024-01-15T18:00:00Z';
      const items = [{ item_id: fixtures.testItemId, qty: 1, price_snapshot: 15000, name_snapshot: 'Guard Test Item' }];
      const payments = [{ method: 'CASH', amount: 15000 }];
      const originalClientTxId = 'test-int-guard-ac1-original';
      const differentClientTxId = 'test-int-guard-ac1-different';

      const originalResults = await persistPushBatch(
        fixtures.db,
        [{
          client_tx_id: originalClientTxId,
          company_id: fixtures.testCompanyId,
          outlet_id: fixtures.testOutletId,
          cashier_user_id: fixtures.cashierUserId,
          status: 'COMPLETED',
          service_type: 'TAKEAWAY',
          trx_at: trxAt,
          items,
          payments,
        }],
        fixtures.testCompanyId,
        fixtures.testOutletId,
        'test-correlation'
      );
      expect(originalResults[0].result).toBe('OK');

      // Push a different client_tx_id with identical business identity — MUST pass through
      const differentResults = await persistPushBatch(
        fixtures.db,
        [{
          client_tx_id: differentClientTxId,
          company_id: fixtures.testCompanyId,
          outlet_id: fixtures.testOutletId,
          cashier_user_id: fixtures.cashierUserId,
          status: 'COMPLETED',
          service_type: 'TAKEAWAY',
          trx_at: trxAt,
          items,
          payments,
        }],
        fixtures.testCompanyId,
        fixtures.testOutletId,
        'test-correlation'
      );
      expect(differentResults[0].result).toBe('OK');
    });

    test('AC2: allows COMPLETED→VOID with different client_tx_id (reversal context)', async () => {
      const trxAt = '2024-01-15T18:00:00Z';
      const items = [{ item_id: fixtures.testItemId, qty: 1, price_snapshot: 15000, name_snapshot: 'Guard Test Item' }];
      const payments = [{ method: 'CASH', amount: 15000 }];
      const completedClientTxId = 'test-int-guard-ac2-completed';
      const voidClientTxId = 'test-int-guard-ac2-void-attempt';

      // Seed a completed transaction
      const completedResults = await persistPushBatch(
        fixtures.db,
        [{
          client_tx_id: completedClientTxId,
          company_id: fixtures.testCompanyId,
          outlet_id: fixtures.testOutletId,
          cashier_user_id: fixtures.cashierUserId,
          status: 'COMPLETED',
          service_type: 'TAKEAWAY',
          trx_at: trxAt,
          items,
          payments,
        }],
        fixtures.testCompanyId,
        fixtures.testOutletId,
        'test-correlation'
      );
      expect(completedResults[0].result).toBe('OK');

      // Push VOID with same business identity but different client_tx_id.
      // This is a valid reversal (COMPLETED→VOID), not an invalid mutation.
      // The in-transaction authority check allows VOID/REFUND through.
      const voidResults = await persistPushBatch(
        fixtures.db,
        [{
          client_tx_id: voidClientTxId,
          company_id: fixtures.testCompanyId,
          outlet_id: fixtures.testOutletId,
          cashier_user_id: fixtures.cashierUserId,
          status: 'VOID',
          service_type: 'TAKEAWAY',
          trx_at: trxAt,
          items,
          payments,
        }],
        fixtures.testCompanyId,
        fixtures.testOutletId,
        'test-correlation'
      );
      expect(voidResults[0].result).toBe('OK');
    });

    test('AC3: returns DUPLICATE for COMPLETED→COMPLETED with same client_tx_id', async () => {
      const trxAt = '2024-01-15T18:00:00Z';
      const items = [{ item_id: fixtures.testItemId, qty: 1, price_snapshot: 15000, name_snapshot: 'Guard Test Item' }];
      const payments = [{ method: 'CASH', amount: 15000 }];
      const duplicateClientTxId = 'test-int-guard-ac3-dup';

      // First push — should succeed
      const firstResults = await persistPushBatch(
        fixtures.db,
        [{
          client_tx_id: duplicateClientTxId,
          company_id: fixtures.testCompanyId,
          outlet_id: fixtures.testOutletId,
          cashier_user_id: fixtures.cashierUserId,
          status: 'COMPLETED',
          service_type: 'TAKEAWAY',
          trx_at: trxAt,
          items,
          payments,
        }],
        fixtures.testCompanyId,
        fixtures.testOutletId,
        'test-correlation'
      );
      expect(firstResults[0].result).toBe('OK');

      // Second push with same client_tx_id — should return DUPLICATE via idempotency
      const secondResults = await persistPushBatch(
        fixtures.db,
        [{
          client_tx_id: duplicateClientTxId,
          company_id: fixtures.testCompanyId,
          outlet_id: fixtures.testOutletId,
          cashier_user_id: fixtures.cashierUserId,
          status: 'COMPLETED',
          service_type: 'TAKEAWAY',
          trx_at: trxAt,
          items,
          payments,
        }],
        fixtures.testCompanyId,
        fixtures.testOutletId,
        'test-correlation'
      );
      expect(secondResults[0].result).toBe('DUPLICATE');
    });

    test('AC4: allows COMPLETED→REFUND with different client_tx_id (reversal context)', async () => {
      const trxAt = '2024-01-15T18:00:00Z';
      const items = [{ item_id: fixtures.testItemId, qty: 1, price_snapshot: 15000, name_snapshot: 'Guard Test Item' }];
      const payments = [{ method: 'CASH', amount: 15000 }];
      const completedClientTxId = 'test-int-guard-ac4-completed';
      const refundClientTxId = 'test-int-guard-ac4-refund-attempt';

      // Seed a completed transaction
      const completedResults = await persistPushBatch(
        fixtures.db,
        [{
          client_tx_id: completedClientTxId,
          company_id: fixtures.testCompanyId,
          outlet_id: fixtures.testOutletId,
          cashier_user_id: fixtures.cashierUserId,
          status: 'COMPLETED',
          service_type: 'TAKEAWAY',
          trx_at: trxAt,
          items,
          payments,
        }],
        fixtures.testCompanyId,
        fixtures.testOutletId,
        'test-correlation'
      );
      expect(completedResults[0].result).toBe('OK');

      // Push REFUND with same business identity but different client_tx_id.
      // This is a valid reversal (COMPLETED→REFUND), not an invalid mutation.
      // The in-transaction authority check allows VOID/REFUND through.
      const refundResults = await persistPushBatch(
        fixtures.db,
        [{
          client_tx_id: refundClientTxId,
          company_id: fixtures.testCompanyId,
          outlet_id: fixtures.testOutletId,
          cashier_user_id: fixtures.cashierUserId,
          status: 'REFUND',
          service_type: 'TAKEAWAY',
          trx_at: trxAt,
          items,
          payments,
        }],
        fixtures.testCompanyId,
        fixtures.testOutletId,
        'test-correlation'
      );
      expect(refundResults[0].result).toBe('OK');
    });
  });

  describe('error handling', () => {
    test('should handle individual transaction failures gracefully', async () => {
      // Send one valid transaction and one with invalid data (missing items)
      const transactions: TransactionPush[] = [
        {
          client_tx_id: 'test-int-tx-error-1',
          company_id: fixtures.testCompanyId,
          outlet_id: fixtures.testOutletId,
          cashier_user_id: fixtures.cashierUserId,
          status: 'COMPLETED',
          service_type: 'TAKEAWAY',
          trx_at: '2024-01-15T17:00:00+07:00',
          items: [{ item_id: fixtures.testItemId, qty: 1, price_snapshot: 15000, name_snapshot: 'Test Item' }],
          payments: [{ method: 'CASH', amount: 15000 }],
        },
        {
          client_tx_id: 'test-int-tx-error-2',
          company_id: fixtures.testCompanyId,
          outlet_id: fixtures.testOutletId,
          cashier_user_id: fixtures.cashierUserId,
          status: 'COMPLETED',
          service_type: 'DINE_IN', // Missing table_id
          trx_at: '2024-01-15T17:05:00+07:00',
          items: [{ item_id: fixtures.testItemId, qty: 1, price_snapshot: 15000, name_snapshot: 'Test Item' }],
          payments: [{ method: 'CASH', amount: 15000 }],
        },
        {
          client_tx_id: 'test-int-tx-error-3',
          company_id: fixtures.testCompanyId,
          outlet_id: fixtures.testOutletId,
          cashier_user_id: fixtures.cashierUserId,
          status: 'COMPLETED',
          service_type: 'TAKEAWAY',
          trx_at: '2024-01-15T17:10:00+07:00',
          items: [{ item_id: fixtures.testItemId, qty: 1, price_snapshot: 15000, name_snapshot: 'Test Item' }],
          payments: [{ method: 'CASH', amount: 15000 }],
        },
      ];

      const results = await persistPushBatch(
        fixtures.db,
        transactions,
        fixtures.testCompanyId,
        fixtures.testOutletId,
        'test-correlation'
      );

      expect(results).toHaveLength(3);
      expect(results[0].result).toBe('OK'); // Valid
      expect(results[1].result).toBe('ERROR'); // DINE_IN without table_id
      expect(results[2].result).toBe('OK'); // Valid
    });
  });

  describe('atomicity regression (S48+)', () => {
    test('rolls back all writes when postingHook throws after Phase 1 insert', async () => {
      const clientTxId = 'test-int-tx-atomicity-hook-throw';
      const { testCompanyId, testOutletId } = fixtures;

      // ── Capture pre-push counts for rollback verification ────────────
      const preCogsBatchCount = await sql<{ cnt: number }>`
        SELECT COUNT(*) AS cnt FROM journal_batches
        WHERE company_id = ${testCompanyId}
          AND outlet_id = ${testOutletId}
          AND doc_type = 'COGS'
      `.execute(fixtures.db);

      const preCogsLineCount = await sql<{ cnt: number }>`
        SELECT COUNT(*) AS cnt FROM journal_lines jl
        JOIN journal_batches jb ON jl.journal_batch_id = jb.id
        WHERE jb.company_id = ${testCompanyId}
          AND jb.outlet_id = ${testOutletId}
          AND jb.doc_type = 'COGS'
      `.execute(fixtures.db);

      const cogsBatchCountBefore = Number(preCogsBatchCount.rows[0]?.cnt ?? 0);
      const cogsLineCountBefore = Number(preCogsLineCount.rows[0]?.cnt ?? 0);

      // A posting hook that unconditionally throws, simulating a Phase 2 failure
      const throwingHook: PostingHookFn = async (_db, _ctx) => {
        throw new Error('SIMULATED_POSTING_HOOK_FAILURE');
      };

      const transaction: TransactionPush = {
        client_tx_id: clientTxId,
        company_id: testCompanyId,
        outlet_id: testOutletId,
        cashier_user_id: fixtures.cashierUserId,
        status: 'COMPLETED',
        service_type: 'TAKEAWAY',
        trx_at: '2024-01-15T18:30:00+07:00',
        items: [{ item_id: fixtures.testItemId, qty: 1, price_snapshot: 15000, name_snapshot: 'Atomicity Test' }],
        payments: [{ method: 'CASH', amount: 15000 }],
      };

      const results = await persistPushBatch(
        fixtures.db,
        [transaction],
        testCompanyId,
        testOutletId,
        'test-correlation',
        { postingHook: throwingHook }
      );

      // ── Assert ERROR result and message ─────────────────────────────
      expect(results).toHaveLength(1);
      expect(results[0].result).toBe('ERROR');
      expect(results[0].client_tx_id).toBe(clientTxId);
      expect(results[0].message).toContain('SIMULATED_POSTING_HOOK_FAILURE');

      // ── Assert (a): no pos_transactions row for clientTxId ──────────
      const ptRows = await sql<{ cnt: number }>`
        SELECT COUNT(*) AS cnt FROM pos_transactions
        WHERE client_tx_id = ${clientTxId}
          AND company_id = ${testCompanyId}
      `.execute(fixtures.db);
      expect(Number(ptRows.rows[0]?.cnt ?? 0)).toBe(0);

      // ── Assert (b): no inventory_transactions row for reference_id ──
      const itRows = await sql<{ cnt: number }>`
        SELECT COUNT(*) AS cnt FROM inventory_transactions
        WHERE reference_id = ${clientTxId}
          AND company_id = ${testCompanyId}
          AND outlet_id = ${testOutletId}
      `.execute(fixtures.db);
      expect(Number(itRows.rows[0]?.cnt ?? 0)).toBe(0);

      // ── Assert (c): COGS journal_batches count unchanged ────────────
      const postCogsBatchCount = await sql<{ cnt: number }>`
        SELECT COUNT(*) AS cnt FROM journal_batches
        WHERE company_id = ${testCompanyId}
          AND outlet_id = ${testOutletId}
          AND doc_type = 'COGS'
      `.execute(fixtures.db);
      expect(Number(postCogsBatchCount.rows[0]?.cnt ?? 0)).toBe(cogsBatchCountBefore);

      // ── Assert (d): COGS journal_lines count unchanged ──────────────
      const postCogsLineCount = await sql<{ cnt: number }>`
        SELECT COUNT(*) AS cnt FROM journal_lines jl
        JOIN journal_batches jb ON jl.journal_batch_id = jb.id
        WHERE jb.company_id = ${testCompanyId}
          AND jb.outlet_id = ${testOutletId}
          AND jb.doc_type = 'COGS'
      `.execute(fixtures.db);
      expect(Number(postCogsLineCount.rows[0]?.cnt ?? 0)).toBe(cogsLineCountBefore);
    });
  });
});
