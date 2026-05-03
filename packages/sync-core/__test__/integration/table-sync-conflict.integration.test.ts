// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Table-Sync Conflict Detection Integration Tests
 *
 * Tests for idempotency conflict detection at the table-sync layer.
 * Verifies the canonical sync contract: status OK | DUPLICATE | ERROR only.
 *
 * Test scenarios:
 * 1. Push transaction with client_tx_id=X, payload A → expect OK
 * 2. Push same client_tx_id=X with identical payload A → expect DUPLICATE
 * 3. Push same client_tx_id=X with different payload B → expect ERROR
 *
 * CRITICAL: All tests must close the DB pool after completion.
 */

// Load .env file before any other imports
import path from 'path';
import { config as loadEnv } from 'dotenv';
loadEnv({ path: path.resolve(process.cwd(), '.env') });

import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createKysely, type KyselySchema } from '@jurnapod/db';
import { createHash } from 'crypto';
import { SyncIdempotencyService } from '../../src/idempotency/sync-idempotency.js';
import {
  readPosTransactionByClientTxId,
  insertPosTransaction,
  type PosTransactionInsertInput,
} from '../../src/data/transaction-queries.js';

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
  testCashierUserId: number;
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

  // Find a cashier user for the company
  const userRows = await db
    .selectFrom('users as u')
    .innerJoin('user_role_assignments as ura', 'ura.user_id', 'u.id')
    .innerJoin('roles as r', 'r.id', 'ura.role_id')
    .select(['u.id as user_id'])
    .where('ura.company_id', '=', Number(companyRows[0].company_id))
    .where('r.code', '=', 'CASHIER')
    .limit(1)
    .execute();

  const cashierUserId = userRows.length > 0
    ? Number(userRows[0].user_id)
    : 1; // fallback

  return {
    db,
    testCompanyId: Number(companyRows[0].company_id),
    testOutletId: Number(companyRows[0].outlet_id),
    testCashierUserId: cashierUserId,
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Generate deterministic SHA256 hash for payload
 */
function sha256(payload: string): string {
  return createHash('sha256').update(payload).digest('hex');
}

/**
 * Deterministic timestamp for test transactions
 */
function fixedTimestamp(daysOffset = 0): number {
  const base = new Date('2026-03-28T00:00:00Z').getTime();
  return base + daysOffset * 24 * 60 * 60 * 1000;
}

/**
 * Create a test transaction payload
 */
function createPayload(itemCount: number, amount: number): string {
  return JSON.stringify({
    items: Array.from({ length: itemCount }, (_, i) => ({
      item_id: i + 1,
      qty: 1,
      price: amount,
    })),
    total: amount,
  });
}

/**
 * Build a minimal PosTransactionInsertInput for testing
 */
function buildTransactionInput(
  clientTxId: string,
  payload: string,
  companyId: number,
  outletId: number,
  cashierUserId: number,
  trxTs: number,
  status: 'COMPLETED' | 'VOID' | 'REFUND' = 'COMPLETED'
): PosTransactionInsertInput {
  return {
    client_tx_id: clientTxId,
    company_id: companyId,
    outlet_id: outletId,
    cashier_user_id: cashierUserId,
    status,
    service_type: 'TAKEAWAY',
    trx_at: new Date(trxTs).toISOString(),
    trx_at_ts: trxTs,
    payload_sha256: sha256(payload),
    payload_hash_version: 2,
  };
}

/**
 * Insert a test transaction and return its ID
 */
async function insertTestTransaction(
  db: KyselySchema,
  input: PosTransactionInsertInput
): Promise<number> {
  return insertPosTransaction(db, input);
}

/**
 * Check idempotency outcome using the idempotency service
 */
function checkIdempotencyOutcome(
  service: SyncIdempotencyService,
  existingRecord: { payload_sha256: string; payload_hash_version: number } | null,
  incomingPayloadHash: string
): 'OK' | 'DUPLICATE' | 'ERROR' {
  const result = service.determineReplayOutcome(
    existingRecord
      ? {
          pos_transaction_id: 1,
          payload_sha256: existingRecord.payload_sha256,
          payload_hash_version: existingRecord.payload_hash_version,
          status: 'COMPLETED',
          trx_at: new Date().toISOString(),
        }
      : null,
    incomingPayloadHash,
    existingRecord?.payload_sha256 ?? null,
    existingRecord?.payload_hash_version ?? null
  );

  const code = service.getResultCode(result.outcome);
  return code as 'OK' | 'DUPLICATE' | 'ERROR';
}

// ============================================================================
// Test Suite
// ============================================================================

describe('Table-Sync Conflict Detection Integration', () => {
  let fixtures: TestFixtures;
  let idempotencyService: SyncIdempotencyService;

  beforeAll(async () => {
    fixtures = await setupTestFixtures();
    idempotencyService = new SyncIdempotencyService();
  });

  afterAll(async () => {
    await fixtures.db.destroy();
  });

  beforeEach(async () => {
    // Clean up test transactions by client_tx_id prefix
    const testPrefix = 'TEST-CONFLICT-';
    await fixtures.db
      .deleteFrom('pos_transactions')
      .where('client_tx_id', 'like', `${testPrefix}%`)
      .execute();
  });

  describe('Scenario 1: First transaction push', () => {
    test('should return OK for new client_tx_id with payload A', async () => {
      const clientTxId = `TEST-CONFLICT-${Date.now()}-SCENARIO1`;
      const payloadA = createPayload(2, 100);

      // Check no existing record
      const existing = await readPosTransactionByClientTxId(
        fixtures.db,
        clientTxId,
        fixtures.testCompanyId,
        fixtures.testOutletId
      );
      expect(existing).toBeNull();

      // Determine outcome - should be PROCESS (OK)
      const outcome = checkIdempotencyOutcome(
        idempotencyService,
        null,
        sha256(payloadA)
      );
      expect(outcome).toBe('OK');

      // Insert the transaction
      const input = buildTransactionInput(
        clientTxId,
        payloadA,
        fixtures.testCompanyId,
        fixtures.testOutletId,
        fixtures.testCashierUserId,
        fixedTimestamp(0)
      );
      const txId = await insertTestTransaction(fixtures.db, input);
      expect(txId).toBeGreaterThan(0);

      // Verify inserted correctly
      const inserted = await readPosTransactionByClientTxId(
        fixtures.db,
        clientTxId,
        fixtures.testCompanyId,
        fixtures.testOutletId
      );
      expect(inserted).not.toBeNull();
      expect(inserted!.client_tx_id).toBe(clientTxId);
      expect(inserted!.payload_sha256).toBe(sha256(payloadA));
    });
  });

  describe('Scenario 2: Duplicate idempotent replay', () => {
    test('should return DUPLICATE for same client_tx_id with identical payload', async () => {
      const clientTxId = `TEST-CONFLICT-${Date.now()}-SCENARIO2`;
      const payloadA = createPayload(2, 100);

      // Insert first transaction
      const input = buildTransactionInput(
        clientTxId,
        payloadA,
        fixtures.testCompanyId,
        fixtures.testOutletId,
        fixtures.testCashierUserId,
        fixedTimestamp(0)
      );
      await insertTestTransaction(fixtures.db, input);

      // Read back the existing record
      const existing = await readPosTransactionByClientTxId(
        fixtures.db,
        clientTxId,
        fixtures.testCompanyId,
        fixtures.testOutletId
      );
      expect(existing).not.toBeNull();

      // Determine outcome - should be RETURN_CACHED (DUPLICATE) since payload matches
      const outcome = checkIdempotencyOutcome(
        idempotencyService,
        { payload_sha256: existing!.payload_sha256, payload_hash_version: existing!.payload_hash_version },
        sha256(payloadA) // same payload
      );
      expect(outcome).toBe('DUPLICATE');
    });
  });

  describe('Scenario 3: Idempotency conflict - payload mismatch', () => {
    test('should return ERROR for same client_tx_id with different payload', async () => {
      const clientTxId = `TEST-CONFLICT-${Date.now()}-SCENARIO3`;
      const payloadA = createPayload(2, 100);
      const payloadB = createPayload(2, 200); // different total

      // Insert first transaction with payload A
      const input = buildTransactionInput(
        clientTxId,
        payloadA,
        fixtures.testCompanyId,
        fixtures.testOutletId,
        fixtures.testCashierUserId,
        fixedTimestamp(0)
      );
      await insertTestTransaction(fixtures.db, input);

      // Read back the existing record
      const existing = await readPosTransactionByClientTxId(
        fixtures.db,
        clientTxId,
        fixtures.testCompanyId,
        fixtures.testOutletId
      );
      expect(existing).not.toBeNull();
      expect(existing!.payload_sha256).toBe(sha256(payloadA));

      // Determine outcome - should be CONFLICT (ERROR) since payload differs
      const outcome = checkIdempotencyOutcome(
        idempotencyService,
        { payload_sha256: existing!.payload_sha256, payload_hash_version: existing!.payload_hash_version },
        sha256(payloadB) // different payload
      );
      expect(outcome).toBe('ERROR');
    });
  });

  describe('End-to-end conflict detection flow', () => {
    test('should correctly handle OK → DUPLICATE → ERROR sequence', async () => {
      const clientTxId = `TEST-CONFLICT-${Date.now()}-E2E`;
      const payloadA = createPayload(2, 100);
      const payloadB = createPayload(2, 200);

      // Step 1: First push - should be OK
      let existing = await readPosTransactionByClientTxId(
        fixtures.db,
        clientTxId,
        fixtures.testCompanyId,
        fixtures.testOutletId
      );
      let outcome = checkIdempotencyOutcome(idempotencyService, existing, sha256(payloadA));
      expect(outcome).toBe('OK');

      // Insert transaction
      const input = buildTransactionInput(
        clientTxId,
        payloadA,
        fixtures.testCompanyId,
        fixtures.testOutletId,
        fixtures.testCashierUserId,
        fixedTimestamp(0)
      );
      await insertTestTransaction(fixtures.db, input);

      // Step 2: Replay with same payload - should be DUPLICATE
      existing = await readPosTransactionByClientTxId(
        fixtures.db,
        clientTxId,
        fixtures.testCompanyId,
        fixtures.testOutletId
      );
      outcome = checkIdempotencyOutcome(idempotencyService, existing, sha256(payloadA));
      expect(outcome).toBe('DUPLICATE');

      // Step 3: Replay with different payload - should be ERROR
      existing = await readPosTransactionByClientTxId(
        fixtures.db,
        clientTxId,
        fixtures.testCompanyId,
        fixtures.testOutletId
      );
      outcome = checkIdempotencyOutcome(idempotencyService, existing, sha256(payloadB));
      expect(outcome).toBe('ERROR');
    });
  });

  describe('Edge cases', () => {
    test('should handle legacy records with null payload_sha256 as duplicates', () => {
      // Legacy record (no hash) - should be treated as duplicate
      const legacyRecord = {
        payload_sha256: '',
        payload_hash_version: null as number | null,
      };
      const outcome = checkIdempotencyOutcome(
        idempotencyService,
        legacyRecord,
        sha256('any payload')
      );
      expect(outcome).toBe('DUPLICATE');
    });

    test('should return OK when no existing record exists', () => {
      const outcome = checkIdempotencyOutcome(
        idempotencyService,
        null,
        sha256('any payload')
      );
      expect(outcome).toBe('OK');
    });

    test('should detect payload hash version 1 (legacy) with matching legacy hash', () => {
      const legacyRecord = {
        payload_sha256: sha256('legacy payload'),
        payload_hash_version: 1, // legacy version
      };
      // With legacy version and matching hash, should be DUPLICATE
      const outcome = checkIdempotencyOutcome(
        idempotencyService,
        legacyRecord,
        sha256('legacy payload')
      );
      expect(outcome).toBe('DUPLICATE');
    });
  });
});