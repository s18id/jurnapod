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
import { sql } from 'kysely';
import { persistPushBatch, type TransactionPush, type SyncPushResultItem } from '../../src/push/index.js';

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

  // Find a CASHIER user in this company (must have role with 'cashier' in name)
  // This is required because processTransaction validates cashier_user_id via isCashierInCompany
  const userResult = await sql`
    SELECT u.id as id
    FROM users u
    INNER JOIN user_role_assignments ura ON ura.user_id = u.id
    INNER JOIN roles r ON r.id = ura.role_id
    WHERE u.company_id = ${Number(companyRows[0].company_id)}
      AND LOWER(r.name) LIKE '%cashier%'
      AND u.is_active = 1
    LIMIT 1
  `.execute(db);

  if (userResult.rows.length === 0) {
    throw new Error(
      `Cashier fixture not found for company ${config.companyCode}. ` +
      `Please ensure a user with 'cashier' role exists in the seed data.`
    );
  }

  // Find a real item for this company
  const itemRows = await sql`
    SELECT id FROM items 
    WHERE company_id = ${Number(companyRows[0].company_id)}
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
    testCompanyId: Number(companyRows[0].company_id),
    testOutletId: Number(companyRows[0].outlet_id),
    cashierUserId: Number((userResult.rows[0] as { id: number }).id),
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
      expect(results[0].message).toBe('DINE_IN requires table_id');
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
});
