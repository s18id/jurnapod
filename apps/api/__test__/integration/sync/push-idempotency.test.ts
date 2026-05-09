// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Sync Push Idempotency Contract Tests — Story 59.2
 *
 * Verifies that duplicate client_tx_id submissions are safely deduplicated
 * and return canonical DUPLICATE responses without creating double-posting effects.
 *
 * AC1: Unique client_tx_id → OK (pos_transaction created, journal effects posted)
 * AC2: Duplicate client_tx_id → DUPLICATE
 * AC3: Duplicate does NOT create double journal/posting effects
 * AC4: Missing client_tx_id → 400 with "client_tx_id is required"
 * AC5: Invalid client_tx_id format → 400 with machine-readable error
 * AC6: Cross-tenant isolation — same client_tx_id in different company → OK
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestBaseUrl } from '../../helpers/env';
import { closeTestDb, getTestDb } from '../../helpers/db';
import { acquireReadLock, releaseReadLock } from '../../helpers/setup';
import {
  createTestItem,
  getTestAccessToken,
  getSeedSyncContext,
  createTestCompany,
  createTestOutletMinimal,
  loginForTest,
  createTestUser,
  getRoleIdByCode,
  assignUserGlobalRole,
  assignUserOutletRole,
  resetFixtureRegistry,
} from '../../fixtures';
import type { ItemFixture } from '../../fixtures';

// ============================================================================
// Helpers
// ============================================================================

/**
 * Deterministic UUID from a seed number — avoids collisions with persistent DB rows
 * while keeping IDs deterministic and reproducible per test run.
 */
function deterministicUuidFromSeed(seed: number): string {
  const suffix = Math.abs(seed).toString(16).padStart(12, '0').slice(-12);
  return `550e8400-e29b-41d4-a716-${suffix}`;
}

// Fixed trx_at for deterministic payload hashing
const FIXTURE_TRX_AT = '2024-01-15T10:30:00Z';

// ============================================================================
// Suite-scoped state
// ============================================================================

let baseUrl: string;
let accessToken: string;
let companyId: number;
let outletId: number;
let cashierUserId: number;
let itemId: number;

// Deterministic client_tx_id seeds — derived from item IDs to avoid collisions
let firstTxId: string;
let dupTxId: string;

/**
 * Number of journal_batches with doc_type='COGS' for a given pos_transaction_id.
 * If 0 it means no COGS posting was performed (e.g. stockless item), which is fine.
 */
async function countCogsBatches(db: ReturnType<typeof getTestDb>, posTransactionId: number): Promise<number> {
  const rows = await db
    .selectFrom('journal_batches')
    .select(db.fn.countAll<number>().as('cnt'))
    .where('company_id', '=', companyId)
    .where('doc_type', '=', 'COGS')
    .where('doc_id', '=', posTransactionId)
    .execute();
  return Number(rows[0]?.cnt ?? 0);
}

describe('sync.push idempotency contract', { timeout: 60000 }, () => {
  beforeAll(async () => {
    await acquireReadLock();
    baseUrl = getTestBaseUrl();
    accessToken = await getTestAccessToken(baseUrl);

    const ctx = await getSeedSyncContext();
    companyId = ctx.companyId;
    outletId = ctx.outletId;
    cashierUserId = ctx.cashierUserId;

    // Create a test item (no stock tracking — keeps test simple since we validate
    // idempotency, not stock behaviour)
    const item = await createTestItem(companyId, {
      name: 'Idempotency Contract Test Item',
      type: 'PRODUCT',
      trackStock: false,
    });
    itemId = item.id;

    // Deterministic client_tx_ids derived from item.id for uniqueness across runs
    firstTxId = deterministicUuidFromSeed(itemId * 100 + 1);
    dupTxId = deterministicUuidFromSeed(itemId * 100 + 2);
  });

  afterAll(async () => {
    try {
      // Teardown transactions created by this suite using deterministic IDs
      const db = getTestDb();
      await db
        .deleteFrom('pos_transactions')
        .where('company_id', '=', companyId)
        .where('client_tx_id', 'in', [firstTxId, dupTxId])
        .execute();
    } catch {
      // Best-effort teardown — ignore errors
    }

    try {
      await resetFixtureRegistry();
      await closeTestDb();
    } finally {
      await releaseReadLock();
    }
  });

  // ==========================================================================
  // AC1: Unique client_tx_id → OK
  // ==========================================================================
  it('AC1: first submit with unique client_tx_id returns OK', async () => {
    const res = await fetch(`${baseUrl}/api/sync/push`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        outlet_id: outletId,
        transactions: [
          {
            client_tx_id: firstTxId,
            company_id: companyId,
            outlet_id: outletId,
            cashier_user_id: cashierUserId,
            trx_at: FIXTURE_TRX_AT,
            status: 'COMPLETED',
            items: [
              { item_id: itemId, qty: 1, price_snapshot: 15000, name_snapshot: 'AC1 Test Item' },
            ],
            payments: [{ method: 'CASH', amount: 15000 }],
          },
        ],
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    const txResult = body.data?.results?.[0];
    expect(txResult?.result).toBe('OK');
    expect(txResult?.client_tx_id).toBe(firstTxId);

    // Verify persistence: exactly one pos_transaction row
    const db = getTestDb();
    const rows = await db
      .selectFrom('pos_transactions')
      .select(['id', 'client_tx_id', 'status'])
      .where('company_id', '=', companyId)
      .where('client_tx_id', '=', firstTxId)
      .execute();
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('COMPLETED');
  });

  // ==========================================================================
  // AC2: Duplicate → DUPLICATE
  // ==========================================================================
  it('AC2: duplicate submit with same client_tx_id returns DUPLICATE', async () => {
    // First submission — must succeed
    const firstRes = await fetch(`${baseUrl}/api/sync/push`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        outlet_id: outletId,
        transactions: [
          {
            client_tx_id: dupTxId,
            company_id: companyId,
            outlet_id: outletId,
            cashier_user_id: cashierUserId,
            trx_at: FIXTURE_TRX_AT,
            status: 'COMPLETED',
            items: [
              { item_id: itemId, qty: 1, price_snapshot: 20000, name_snapshot: 'AC2 Test Item' },
            ],
            payments: [{ method: 'CASH', amount: 20000 }],
          },
        ],
      }),
    });
    expect(firstRes.status).toBe(200);
    const firstBody = await firstRes.json();
    const firstTx = firstBody.data?.results?.[0];
    expect(firstTx?.result).toBe('OK');

    // Second submission — same client_tx_id → DUPLICATE
    const secondRes = await fetch(`${baseUrl}/api/sync/push`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        outlet_id: outletId,
        transactions: [
          {
            client_tx_id: dupTxId,
            company_id: companyId,
            outlet_id: outletId,
            cashier_user_id: cashierUserId,
            trx_at: FIXTURE_TRX_AT,
            status: 'COMPLETED',
            items: [
              { item_id: itemId, qty: 1, price_snapshot: 20000, name_snapshot: 'AC2 Test Item' },
            ],
            payments: [{ method: 'CASH', amount: 20000 }],
          },
        ],
      }),
    });
    expect(secondRes.status).toBe(200);
    const secondBody = await secondRes.json();
    const secondTx = secondBody.data?.results?.[0];
    expect(secondTx?.result).toBe('DUPLICATE');

    // Persistence invariant: only one row
    const db = getTestDb();
    const rows = await db
      .selectFrom('pos_transactions')
      .select(['id'])
      .where('company_id', '=', companyId)
      .where('client_tx_id', '=', dupTxId)
      .execute();
    expect(rows).toHaveLength(1);
  });

  // ==========================================================================
  // AC3: No double journal/posting effects on duplicate
  // ==========================================================================
  it('AC3: duplicate does NOT create additional journal batches', async () => {
    // First submission already done in AC2 above.
    // Count journal_batches for the dupTxId transaction BEFORE duplicate resend.

    const db = getTestDb();

    // Resolve the pos_transaction_id for dupTxId
    const txRows = await db
      .selectFrom('pos_transactions')
      .select(['id'])
      .where('company_id', '=', companyId)
      .where('client_tx_id', '=', dupTxId)
      .execute();
    expect(txRows).toHaveLength(1);
    const posTransactionId = txRows[0].id;

    // Count COGS batches before duplicate resend
    const beforeCogsCount = await countCogsBatches(db, posTransactionId);

    // Resubmit the duplicate once more (third send for this test)
    const res = await fetch(`${baseUrl}/api/sync/push`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        outlet_id: outletId,
        transactions: [
          {
            client_tx_id: dupTxId,
            company_id: companyId,
            outlet_id: outletId,
            cashier_user_id: cashierUserId,
            trx_at: FIXTURE_TRX_AT,
            status: 'COMPLETED',
            items: [
              { item_id: itemId, qty: 1, price_snapshot: 20000, name_snapshot: 'AC2 Test Item' },
            ],
            payments: [{ method: 'CASH', amount: 20000 }],
          },
        ],
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data?.results?.[0]?.result).toBe('DUPLICATE');

    // Count COGS batches AFTER duplicate — must match before count
    const afterCogsCount = await countCogsBatches(db, posTransactionId);
    expect(afterCogsCount).toBe(beforeCogsCount);

    // Additional check: pos_transactions still has exactly 1 row
    const rowsAfter = await db
      .selectFrom('pos_transactions')
      .select(['id'])
      .where('company_id', '=', companyId)
      .where('client_tx_id', '=', dupTxId)
      .execute();
    expect(rowsAfter).toHaveLength(1);
  });

  // ==========================================================================
  // AC4: Missing client_tx_id → 400
  // ==========================================================================
  it('AC4: missing client_tx_id rejected with specific error', async () => {
    const res = await fetch(`${baseUrl}/api/sync/push`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        outlet_id: outletId,
        transactions: [
          {
            // client_tx_id intentionally omitted
            company_id: companyId,
            outlet_id: outletId,
            cashier_user_id: cashierUserId,
            trx_at: FIXTURE_TRX_AT,
            status: 'COMPLETED',
            items: [
              { item_id: itemId, qty: 1, price_snapshot: 10000, name_snapshot: 'AC4 Test Item' },
            ],
            payments: [{ method: 'CASH', amount: 10000 }],
          },
        ],
      }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.message).toContain('client_tx_id');
  });

  // ==========================================================================
  // AC5: Invalid client_tx_id format → 400
  // ==========================================================================
  it('AC5: empty string client_tx_id rejected', async () => {
    const res = await fetch(`${baseUrl}/api/sync/push`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        outlet_id: outletId,
        transactions: [
          {
            client_tx_id: '', // empty string — not a valid UUID
            company_id: companyId,
            outlet_id: outletId,
            cashier_user_id: cashierUserId,
            trx_at: FIXTURE_TRX_AT,
            status: 'COMPLETED',
            items: [
              { item_id: itemId, qty: 1, price_snapshot: 10000, name_snapshot: 'AC5 Test Item' },
            ],
            payments: [{ method: 'CASH', amount: 10000 }],
          },
        ],
      }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('AC5: non-UUID client_tx_id rejected', async () => {
    const res = await fetch(`${baseUrl}/api/sync/push`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        outlet_id: outletId,
        transactions: [
          {
            client_tx_id: 'not-a-valid-uuid',
            company_id: companyId,
            outlet_id: outletId,
            cashier_user_id: cashierUserId,
            trx_at: FIXTURE_TRX_AT,
            status: 'COMPLETED',
            items: [
              { item_id: itemId, qty: 1, price_snapshot: 10000, name_snapshot: 'AC5b Test Item' },
            ],
            payments: [{ method: 'CASH', amount: 10000 }],
          },
        ],
      }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('AC5: non-string client_tx_id rejected', async () => {
    const res = await fetch(`${baseUrl}/api/sync/push`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        outlet_id: outletId,
        transactions: [
          {
            client_tx_id: 12345, // number instead of string
            company_id: companyId,
            outlet_id: outletId,
            cashier_user_id: cashierUserId,
            trx_at: FIXTURE_TRX_AT,
            status: 'COMPLETED',
            items: [
              { item_id: itemId, qty: 1, price_snapshot: 10000, name_snapshot: 'AC5c Test Item' },
            ],
            payments: [{ method: 'CASH', amount: 10000 }],
          },
        ],
      }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('sync.push idempotency cross-tenant isolation', { timeout: 60000 }, () => {
  let secondCompanyId: number;
  let secondOutletId: number;
  let secondAccessToken: string;
  let secondAdminUserId: number;
  let crossTenantTxId: string;
  let itemB: ItemFixture;

  beforeAll(async () => {
    await acquireReadLock();
    baseUrl = getTestBaseUrl();

    const testPassword = process.env.JP_OWNER_PASSWORD ?? 'password';

    // Create a second company with its own outlet and cashier user
    const companyB = await createTestCompany({
      name: 'Cross-Tenant Company B',
      code: `XTB-${Date.now().toString(36).toUpperCase()}`.slice(0, 20),
    });
    secondCompanyId = companyB.id;

    const outletB = await createTestOutletMinimal(secondCompanyId, {
      name: 'Cross-Tenant Outlet B',
    });
    secondOutletId = outletB.id;

    // Create an ADMIN user for Company B (ADMIN is in the route's requireAccess role list)
    const user = await createTestUser(secondCompanyId, {
      email: `cross-tenant-admin-${Date.now()}@example.com`,
      name: 'Cross-Tenant Admin',
      password: testPassword,
    });
    secondAdminUserId = user.id;

    // Admin role for requireAccess authorization check
    const adminRoleId = await getRoleIdByCode('ADMIN');
    await assignUserOutletRole(user.id, adminRoleId, secondOutletId);

    // Cashier role for isCashierInCompany check (requires role name containing 'cashier')
    const cashierRoleId = await getRoleIdByCode('CASHIER');
    await assignUserGlobalRole(user.id, cashierRoleId);

    // Login as the company B cashier
    secondAccessToken = await loginForTest(baseUrl, companyB.code, user.email, testPassword);

    // Create a test item in company B for the transaction
    itemB = await createTestItem(secondCompanyId, {
      name: 'Cross-Tenant Item B',
      type: 'PRODUCT',
      trackStock: false,
    });

    // Deterministic cross-tenant client_tx_id
    crossTenantTxId = deterministicUuidFromSeed(secondCompanyId * 100 + 77);
  });

  afterAll(async () => {
    try {
      // Clean up the cross-tenant transaction
      const db = getTestDb();
      await db
        .deleteFrom('pos_transactions')
        .where('company_id', '=', secondCompanyId)
        .where('client_tx_id', '=', crossTenantTxId)
        .execute();
    } catch {
      // Best-effort
    }

    try {
      await resetFixtureRegistry();
      await closeTestDb();
    } finally {
      await releaseReadLock();
    }
  });

  // ==========================================================================
  // AC6: Cross-tenant isolation
  // ==========================================================================
  it('AC6: same client_tx_id in different company is treated as new transaction', async () => {
    // Use the seed context for company A
    const ctxA = await getSeedSyncContext();
    const accessTokenA = await getTestAccessToken(baseUrl);
    const companyIdA = ctxA.companyId;
    const outletIdA = ctxA.outletId;
    const cashierA = ctxA.cashierUserId;

    // Create an item in company A
    const itemA = await createTestItem(companyIdA, {
      name: 'Cross-Tenant Item A',
      type: 'PRODUCT',
      trackStock: false,
    });

    // Submit to company A first
    const resA = await fetch(`${baseUrl}/api/sync/push`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessTokenA}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        outlet_id: outletIdA,
        transactions: [
          {
            client_tx_id: crossTenantTxId,
            company_id: companyIdA,
            outlet_id: outletIdA,
            cashier_user_id: cashierA,
            trx_at: FIXTURE_TRX_AT,
            status: 'COMPLETED',
            items: [
              { item_id: itemA.id, qty: 1, price_snapshot: 5000, name_snapshot: 'Company A Item' },
            ],
            payments: [{ method: 'CASH', amount: 5000 }],
          },
        ],
      }),
    });
    expect(resA.status).toBe(200);
    const bodyA = await resA.json();
    expect(bodyA.data?.results?.[0]?.result).toBe('OK');

    // Now submit the SAME client_tx_id to company B — should be OK, NOT duplicate
    const resB = await fetch(`${baseUrl}/api/sync/push`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secondAccessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        outlet_id: secondOutletId,
        transactions: [
          {
            client_tx_id: crossTenantTxId,
            company_id: secondCompanyId,
            outlet_id: secondOutletId,
            cashier_user_id: secondAdminUserId,
            trx_at: FIXTURE_TRX_AT,
            status: 'COMPLETED',
            items: [
              { item_id: itemB.id, qty: 1, price_snapshot: 5000, name_snapshot: 'Company B Item' },
            ],
            payments: [{ method: 'CASH', amount: 5000 }],
          },
        ],
      }),
    });
    // Debug: capture error body before assertion
    const resBStatus = resB.status;
    expect(resB.status).toBe(200);
    const bodyB = await resB.json();
    if (bodyB.data?.results?.[0]?.result !== 'OK') {
      console.error('AC6 company B push OK but ERROR:', JSON.stringify(bodyB.data?.results?.[0], null, 2));
    }
    expect(bodyB.data?.results?.[0]?.result).toBe('OK');

    // Each company should have its own row
    const db = getTestDb();
    const rowsA = await db
      .selectFrom('pos_transactions')
      .select(['id'])
      .where('company_id', '=', companyIdA)
      .where('client_tx_id', '=', crossTenantTxId)
      .execute();
    expect(rowsA).toHaveLength(1);

    const rowsB = await db
      .selectFrom('pos_transactions')
      .select(['id'])
      .where('company_id', '=', secondCompanyId)
      .where('client_tx_id', '=', crossTenantTxId)
      .execute();
    expect(rowsB).toHaveLength(1);

    // They should be different rows (different company_scoped IDs)
    expect(rowsA[0].id).not.toBe(rowsB[0].id);
  });
});

describe('sync.push idempotency edge cases', { timeout: 30000 }, () => {
  let edgeTxId: string;

  beforeAll(async () => {
    await acquireReadLock();
    baseUrl = getTestBaseUrl();
    accessToken = await getTestAccessToken(baseUrl);
    const ctx = await getSeedSyncContext();
    companyId = ctx.companyId;
    outletId = ctx.outletId;
    cashierUserId = ctx.cashierUserId;

    const item = await createTestItem(companyId, {
      name: 'Edge Case Item',
      type: 'PRODUCT',
      trackStock: false,
    });
    itemId = item.id;

    edgeTxId = deterministicUuidFromSeed(itemId * 100 + 9);
  });

  afterAll(async () => {
    try {
      const db = getTestDb();
      await db
        .deleteFrom('pos_transactions')
        .where('company_id', '=', companyId)
        .where('client_tx_id', '=', edgeTxId)
        .execute();
    } catch {
      // Best-effort
    }

    try {
      await resetFixtureRegistry();
      await closeTestDb();
    } finally {
      await releaseReadLock();
    }
  });

  it('retry after DUPLICATE returns same deterministic DUPLICATE response', async () => {
    // First submission
    const firstRes = await fetch(`${baseUrl}/api/sync/push`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        outlet_id: outletId,
        transactions: [
          {
            client_tx_id: edgeTxId,
            company_id: companyId,
            outlet_id: outletId,
            cashier_user_id: cashierUserId,
            trx_at: FIXTURE_TRX_AT,
            status: 'COMPLETED',
            items: [
              { item_id: itemId, qty: 1, price_snapshot: 10000, name_snapshot: 'Edge Test Item' },
            ],
            payments: [{ method: 'CASH', amount: 10000 }],
          },
        ],
      }),
    });
    expect(firstRes.status).toBe(200);
    expect((await firstRes.json()).data?.results?.[0]?.result).toBe('OK');

    // Second submission → DUPLICATE
    const secondRes = await fetch(`${baseUrl}/api/sync/push`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        outlet_id: outletId,
        transactions: [
          {
            client_tx_id: edgeTxId,
            company_id: companyId,
            outlet_id: outletId,
            cashier_user_id: cashierUserId,
            trx_at: FIXTURE_TRX_AT,
            status: 'COMPLETED',
            items: [
              { item_id: itemId, qty: 1, price_snapshot: 10000, name_snapshot: 'Edge Test Item' },
            ],
            payments: [{ method: 'CASH', amount: 10000 }],
          },
        ],
      }),
    });
    expect(secondRes.status).toBe(200);
    expect((await secondRes.json()).data?.results?.[0]?.result).toBe('DUPLICATE');

    // Third submission (retry after DUPLICATE) → DUPLICATE again (deterministic)
    const thirdRes = await fetch(`${baseUrl}/api/sync/push`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        outlet_id: outletId,
        transactions: [
          {
            client_tx_id: edgeTxId,
            company_id: companyId,
            outlet_id: outletId,
            cashier_user_id: cashierUserId,
            trx_at: FIXTURE_TRX_AT,
            status: 'COMPLETED',
            items: [
              { item_id: itemId, qty: 1, price_snapshot: 10000, name_snapshot: 'Edge Test Item' },
            ],
            payments: [{ method: 'CASH', amount: 10000 }],
          },
        ],
      }),
    });
    expect(thirdRes.status).toBe(200);
    expect((await thirdRes.json()).data?.results?.[0]?.result).toBe('DUPLICATE');

    // Persistence: still exactly 1 row
    const db = getTestDb();
    const rows = await db
      .selectFrom('pos_transactions')
      .select(['id'])
      .where('company_id', '=', companyId)
      .where('client_tx_id', '=', edgeTxId)
      .execute();
    expect(rows).toHaveLength(1);
  });
});
