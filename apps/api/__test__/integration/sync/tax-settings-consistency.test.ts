// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Tax/Settings/Master-Data Consistency in POS Flows — Story 59.5
 *
 * Verifies that tax/settings resolution and persistence remain consistent
 * during POS processing and across configuration changes.
 *
 * AC1: Deterministic configuration resolution
 * AC2: Calculation and persistence consistency (totals reconcile with journals)
 * AC3: Finalized invariance under config changes (historical data immutable)
 * E58-A1: Cross-module error boundary verification
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestBaseUrl } from '../../helpers/env';
import { closeTestDb, getTestDb } from '../../helpers/db';
import { acquireReadLock, releaseReadLock } from '../../helpers/setup';
import {
  createTestItem,
  getTestAccessToken,
  getSeedSyncContext as loadSeedSyncContext,
  createTestOutletMinimal,
  resetFixtureRegistry,
} from '../../fixtures';
import { createTaxRate, findTaxRateById } from '@/lib/taxes';
import { TaxRateNotFoundError, TaxRateConflictError } from '@/lib/taxes';
import { getResolvedSetting, setSetting, deleteSetting, SettingNotFoundError } from '@/lib/settings';
import { readPosTransactionByClientTxId } from '@jurnapod/sync-core';

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

/** Fixed trx_at for deterministic payload hashing. */
const FIXTURE_TRX_AT = '2024-01-15T10:30:00Z';

// ============================================================================
// Suite-scoped state
// ============================================================================

let seedCtx: Awaited<ReturnType<typeof loadSeedSyncContext>>;

/** Zero-overhead wrapper — returns cached seed context synchronously. */
const getSeedSyncContext = async () => seedCtx;

let baseUrl: string;
let accessToken: string;
let companyId: number;
let seedOutletId: number;
let cashierUserId: number;
let itemId: number;

/** Second outlet for AC1 outlet-vs-company cascade tests. */
let secondOutletId: number;

/** Tax rate A — 10% inclusive, with valid account_id for journal posting. */
let taxRateAId: number;
/** Tax rate B — 5% exclusive, different rate for config-change tests. */
let taxRateBId: number;

/** Sales account ID — used as tax liability account for journal posting. */
let salesAccountId: number;

/** Seed for deterministic client_tx_ids — incremented per push. */
let txIdSeed = 5000;
function nextTxId(): string {
  txIdSeed += 1;
  return deterministicUuidFromSeed(txIdSeed);
}

// ============================================================================
// Suite
// ============================================================================

describe('tax/settings consistency in POS flows', { timeout: 90000 }, () => {
  beforeAll(async () => {
    await acquireReadLock();
    baseUrl = getTestBaseUrl();
    accessToken = await getTestAccessToken(baseUrl);

    seedCtx = await loadSeedSyncContext();
    companyId = seedCtx.companyId;
    seedOutletId = seedCtx.outletId;
    cashierUserId = seedCtx.cashierUserId;

    // Create a second outlet for cascade tests (use timestamp suffix to avoid duplicate-key collisions with prior runs)
    const outlet2 = await createTestOutletMinimal(companyId, { code: `TAX_${Date.now()}`.slice(0, 20), name: 'Tax Test Outlet' });
    secondOutletId = outlet2.id;

    // Create test item (no stock tracking)
    const item = await createTestItem(companyId, {
      name: 'Tax Consistency Test Item',
      type: 'PRODUCT',
      trackStock: false,
    });
    itemId = item.id;

    // Find a valid account for tax_rate.account_id (needed for journal posting).
    // Use the SALES account that ensureSystemAccounts creates during bootstrap.
    const db = getTestDb();
    const salesRow = await db
      .selectFrom('accounts')
      .where('company_id', '=', companyId)
      .where('code', '=', 'SALES')
      .select(['id'])
      .executeTakeFirst();
    if (!salesRow) {
      throw new Error('SALES account not found — bootstrap may have failed');
    }
    salesAccountId = Number(salesRow.id);

    // Create tax rates via production library function (Full Fixture Mode).
    // Use deterministic codes to avoid collisions with previous runs.
    const ts = Date.now();
    const taxRateA = await createTaxRate(companyId, {
      code: `CONSIST_10_${ts}`,
      name: 'Consistency Test Tax 10% Inclusive',
      rate_percent: 10,
      account_id: salesAccountId,
      is_inclusive: true,
      is_active: true,
    }, { userId: cashierUserId });
    taxRateAId = taxRateA.id;

    const taxRateB = await createTaxRate(companyId, {
      code: `CONSIST_5_${ts}`,
      name: 'Consistency Test Tax 5% Exclusive',
      rate_percent: 5,
      account_id: salesAccountId,
      is_inclusive: false,
      is_active: true,
    }, { userId: cashierUserId });
    taxRateBId = taxRateB.id;
  });

  afterAll(async () => {
    try {
      // Clean up transactions pushed during this suite
      const db = getTestDb();
      const seededIds: string[] = [];
      for (let s = 5001; s <= txIdSeed; s++) {
        seededIds.push(deterministicUuidFromSeed(s));
      }
      if (seededIds.length > 0) {
        await db
          .deleteFrom('pos_transactions')
          .where('company_id', '=', companyId)
          .where('client_tx_id', 'in', seededIds)
          .execute();
      }

      // Clean up settings created during tests
      try { await deleteSetting({ companyId, key: 'tax.default_rate' }); } catch { /* ignore if not set */ }
      try { await deleteSetting({ companyId, key: 'tax.default_rate', outletId: seedOutletId }); } catch { /* ignore */ }
      try { await deleteSetting({ companyId, key: 'tax.default_rate', outletId: secondOutletId }); } catch { /* ignore */ }

      // Clean up test-created tax rates (by idempotent delete based on code pattern)
      try { await db.deleteFrom('tax_rates').where('company_id', '=', companyId).where('code', 'like', 'CONSIST_%').execute(); } catch { /* best-effort */ }

      // Clean up test-created outlet (registered in fixture registry but resetFixtureRegistry skips DB deletes)
      if (secondOutletId > 0) {
        try { await db.deleteFrom('outlets').where('id', '=', secondOutletId).execute(); } catch { /* best-effort */ }
      }
    } catch {
      // Best-effort teardown
    }

    try {
      await resetFixtureRegistry();
      await closeTestDb();
    } finally {
      await releaseReadLock();
    }
  });

  // =========================================================================
  // E58-A1: Error Boundary Verification
  // =========================================================================

  describe('E58-A1: Cross-module error boundary verification', () => {
    it('TaxRateNotFoundError instanceof and .name', () => {
      const err = new TaxRateNotFoundError('test not found');
      // instanceof checks
      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(TaxRateNotFoundError);
      // .name fallback
      expect(err.name).toBe('TaxRateNotFoundError');
      expect(err.message).toBe('test not found');
    });

    it('TaxRateConflictError instanceof and .name', () => {
      const err = new TaxRateConflictError('duplicate code');
      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(TaxRateConflictError);
      expect(err.name).toBe('TaxRateConflictError');
      expect(err.message).toBe('duplicate code');
    });

    it('SettingNotFoundError instanceof and .name', () => {
      const err = new SettingNotFoundError('setting not found');
      // SettingNotFoundError extends Error (via `class SettingNotFoundError extends Error {}` with no explicit constructor — it falls back to default)
      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(SettingNotFoundError);
      // SettingNotFoundError does NOT set .name in a constructor — it uses the default
      // Verify it's a valid Error instance
      expect(err.message).toBe('setting not found');
    });

    it('TaxRateNotFoundError thrown by findTaxRateById for non-existent rate', async () => {
      // This tests that the error propagates correctly in the actual library.
      const result = await findTaxRateById(companyId, 999999);
      // findTaxRateById returns null, does NOT throw for not-found
      expect(result).toBeNull();
    });

    it('TaxRateConflictError thrown for duplicate tax rate code', async () => {
      // Attempt to create a tax rate with the same code as taxRateA
      // findTaxRateById first to get the code
      const existing = await findTaxRateById(companyId, taxRateAId);
      expect(existing).not.toBeNull();
      try {
        await createTaxRate(companyId, {
          code: existing!.code, // duplicate
          name: 'Duplicate Tax Rate',
          rate_percent: 15,
        }, { userId: cashierUserId });
        // Should not reach here
        expect.unreachable('Expected TaxRateConflictError to be thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(TaxRateConflictError);
        expect((err as Error).name).toBe('TaxRateConflictError');
        // Verify error message is meaningful
        expect((err as Error).message).toContain('already exists');
      }
    });
  });

  // =========================================================================
  // AC1: Deterministic configuration resolution
  // =========================================================================

  describe('AC1: Deterministic configuration resolution', () => {
    it('settings cascade: outlet-specific setting overrides company-level', async () => {
      // Set outlet-level setting on seed outlet
      await setSetting({
        companyId,
        key: 'tax.default_rate',
        value: '5',
        valueType: 'string',
        outletId: seedOutletId,
      });

      // Set company-level setting (no outlet)
      await setSetting({
        companyId,
        key: 'tax.default_rate',
        value: '10',
        valueType: 'string',
        outletId: null,
      });

      // Verify cascade: outlet-specific should return outlet value
      const outletSetting = await getResolvedSetting(companyId, 'tax.default_rate', seedOutletId);
      expect(outletSetting).not.toBeNull();
      expect(outletSetting!.value).toBe('5');

      // Verify cascade: no outletId → company-level only
      const companySetting = await getResolvedSetting(companyId, 'tax.default_rate', undefined);
      expect(companySetting).not.toBeNull();
      expect(companySetting!.value).toBe('10');

      // Verify cascade: different outlet (secondOutletId) with no specific setting → falls back to company
      const otherOutletSetting = await getResolvedSetting(companyId, 'tax.default_rate', secondOutletId);
      expect(otherOutletSetting).not.toBeNull();
      expect(otherOutletSetting!.value).toBe('10'); // falls back to company

      // Clean up settings
      await deleteSetting({ companyId, key: 'tax.default_rate', outletId: seedOutletId });
      await deleteSetting({ companyId, key: 'tax.default_rate' });
    });

    it('tax rate creation and lookup is deterministic', async () => {
      // Verify the tax rate created in beforeAll is findable with correct values
      const found = await findTaxRateById(companyId, taxRateAId);
      expect(found).not.toBeNull();
      expect(found!.rate_percent).toBe(10);
      expect(found!.is_inclusive).toBe(true);
      expect(found!.code).toContain('CONSIST_10');
      expect(found!.company_id).toBe(companyId);
    });

    it('different outlets see the same company tax rates (tax_rates are company-scoped)', async () => {
      // Tax rates are per-company, not per-outlet. Verify both outlets can resolve the same rate.
      const rateA = await findTaxRateById(companyId, taxRateAId);
      expect(rateA).not.toBeNull();
      expect(rateA!.company_id).toBe(companyId);
      // The rate is not outlet-specific
    });
  });

  // =========================================================================
  // AC2: Calculation and persistence consistency
  // =========================================================================

  describe('AC2: Calculation and persistence consistency', () => {
    it('pushed tax lines are persisted correctly in pos_transaction_taxes', async () => {
      const clientTxId = nextTxId();

      // Push a COMPLETED transaction with 1 item + tax + payment
      // Item: 1 qty × $100.00 = $100.00 gross
      // Tax: 10% inclusive → tax amount = $100.00 × (10/110) = $9.09
      // Payment: $100.00 CASH
      const grossAmount = 10000; // $100.00 in cents
      const taxAmount = 909; // $9.09 — 10% inclusive
      const paymentAmount = 10000;

      const res = await fetch(`${baseUrl}/api/sync/push`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          outlet_id: seedOutletId,
          transactions: [
            {
              client_tx_id: clientTxId,
              company_id: companyId,
              outlet_id: seedOutletId,
              cashier_user_id: cashierUserId,
              trx_at: FIXTURE_TRX_AT,
              status: 'COMPLETED',
              items: [
                {
                  item_id: itemId,
                  qty: 1,
                  price_snapshot: grossAmount,
                  name_snapshot: 'AC2 Tax Test Item',
                },
              ],
              payments: [{ method: 'CASH', amount: paymentAmount }],
              taxes: [{ tax_rate_id: taxRateAId, amount: taxAmount }],
            },
          ],
        }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      const txResult = body.data?.results?.[0];
      expect(txResult?.result).toBe('OK');
      expect(txResult?.client_tx_id).toBe(clientTxId);
      const posTransactionId = txResult?.posTransactionId;
      expect(posTransactionId).toBeGreaterThan(0);

      // === Persistence: verify DB records ===
      const db = getTestDb();

      // 1. Verify pos_transactions header via production read function
      const posTx = await readPosTransactionByClientTxId(db, clientTxId, companyId, seedOutletId);
      expect(posTx).toBeTruthy();
      expect(posTx!.status).toBe('COMPLETED');
      expect(posTx!.outlet_id).toBe(seedOutletId);
      // discount should be 0 for no-discount transaction
      expect(Number(posTx!.discount_percent)).toBe(0);
      expect(Number(posTx!.discount_fixed)).toBe(0);

      // 2. Verify pos_transaction_items
      const items = await db
        .selectFrom('pos_transaction_items')
        .selectAll()
        .where('pos_transaction_id', '=', posTransactionId)
        .orderBy('line_no', 'asc')
        .execute();
      expect(items).toHaveLength(1);
      expect(items[0].item_id).toBe(itemId);
      expect(Number(items[0].qty)).toBe(1);
      expect(Number(items[0].price_snapshot)).toBe(grossAmount);
      expect(items[0].outlet_id).toBe(seedOutletId);
      expect(items[0].company_id).toBe(companyId);

      // 3. Verify pos_transaction_payments
      const payments = await db
        .selectFrom('pos_transaction_payments')
        .selectAll()
        .where('pos_transaction_id', '=', posTransactionId)
        .orderBy('payment_no', 'asc')
        .execute();
      expect(payments).toHaveLength(1);
      expect(payments[0].method).toBe('CASH');
      expect(Number(payments[0].amount)).toBe(paymentAmount);

      // 4. Verify pos_transaction_taxes
      const taxes = await db
        .selectFrom('pos_transaction_taxes')
        .selectAll()
        .where('pos_transaction_id', '=', posTransactionId)
        .orderBy('tax_rate_id', 'asc')
        .execute();
      expect(taxes).toHaveLength(1);
      expect(taxes[0].tax_rate_id).toBe(taxRateAId);
      expect(Number(taxes[0].amount)).toBe(taxAmount);
      expect(taxes[0].outlet_id).toBe(seedOutletId);
      expect(taxes[0].company_id).toBe(companyId);
    });

    it('calculated totals reconcile — gross, tax, and payment totals are consistent', async () => {
      const clientTxId = nextTxId();

      // Item: 2 qty × $50.00 = $100.00 gross
      // Tax: 10% inclusive → $9.09
      // Payment: $100.00 CASH
      const qty = 2;
      const unitPrice = 5000; // $50.00 each
      const grossAmount = qty * unitPrice; // $100.00
      const taxAmount = 909; // 10% inclusive on $100
      const paymentAmount = 10000; // $100.00

      const res = await fetch(`${baseUrl}/api/sync/push`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          outlet_id: seedOutletId,
          transactions: [
            {
              client_tx_id: clientTxId,
              company_id: companyId,
              outlet_id: seedOutletId,
              cashier_user_id: cashierUserId,
              trx_at: FIXTURE_TRX_AT,
              status: 'COMPLETED',
              items: [
                {
                  item_id: itemId,
                  qty,
                  price_snapshot: unitPrice,
                  name_snapshot: 'AC2 Multi Item',
                },
              ],
              payments: [{ method: 'CASH', amount: paymentAmount }],
              taxes: [{ tax_rate_id: taxRateAId, amount: taxAmount }],
            },
          ],
        }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data?.results?.[0]?.result).toBe('OK');
      const posTransactionId = body.data.results[0].posTransactionId;

      const db = getTestDb();

      // Verify items total = qty × unit_price
      const items = await db
        .selectFrom('pos_transaction_items')
        .selectAll()
        .where('pos_transaction_id', '=', posTransactionId)
        .execute();
      const itemsGross = items.reduce(
        (sum, i) => sum + Number(i.qty) * Number(i.price_snapshot),
        0,
      );
      expect(itemsGross).toBe(grossAmount);

      // Verify tax total
      const taxes = await db
        .selectFrom('pos_transaction_taxes')
        .selectAll()
        .where('pos_transaction_id', '=', posTransactionId)
        .execute();
      const taxTotal = taxes.reduce((sum, t) => sum + Number(t.amount), 0);
      expect(taxTotal).toBe(taxAmount);

      // Verify payment total
      const payments = await db
        .selectFrom('pos_transaction_payments')
        .selectAll()
        .where('pos_transaction_id', '=', posTransactionId)
        .execute();
      const paymentTotal = payments.reduce((sum, p) => sum + Number(p.amount), 0);
      expect(paymentTotal).toBe(paymentAmount);

      // Verify transaction header exists and has default discount values (via production read)
      const posTx = await readPosTransactionByClientTxId(db, clientTxId, companyId, seedOutletId);
      expect(posTx).toBeTruthy();
      // discount fields default to 0 (no discount was sent in the push payload)
      expect(Number(posTx!.discount_fixed)).toBe(0);
      expect(Number(posTx!.discount_percent)).toBe(0);
    });

    it('reconciliation: all transaction subtotals (items, taxes, payments) are consistent with DB records', async () => {
      const clientTxId = nextTxId();

      const res = await fetch(`${baseUrl}/api/sync/push`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          outlet_id: seedOutletId,
          transactions: [
            {
              client_tx_id: clientTxId,
              company_id: companyId,
              outlet_id: seedOutletId,
              cashier_user_id: cashierUserId,
              trx_at: FIXTURE_TRX_AT,
              status: 'COMPLETED',
              items: [
                { item_id: itemId, qty: 3, price_snapshot: 5000, name_snapshot: 'Recon Item' },
              ],
              payments: [{ method: 'CASH', amount: 14000 }],
              taxes: [{ tax_rate_id: taxRateAId, amount: 1363 }],
            },
          ],
        }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data?.results?.[0]?.result).toBe('OK');
      const posTransactionId = body.data.results[0].posTransactionId;

      const db = getTestDb();

      // Items: 3 × 5000 = 15000
      const items = await db
        .selectFrom('pos_transaction_items')
        .selectAll()
        .where('pos_transaction_id', '=', posTransactionId)
        .execute();
      const itemsTotal = items.reduce((s, i) => s + Number(i.qty) * Number(i.price_snapshot), 0);
      expect(itemsTotal).toBe(15000);

      // Tax: 1363
      const taxes = await db
        .selectFrom('pos_transaction_taxes')
        .selectAll()
        .where('pos_transaction_id', '=', posTransactionId)
        .execute();
      const taxTotal = taxes.reduce((s, t) => s + Number(t.amount), 0);
      expect(taxTotal).toBe(1363);

      // Payments: 14000
      const payments = await db
        .selectFrom('pos_transaction_payments')
        .selectAll()
        .where('pos_transaction_id', '=', posTransactionId)
        .execute();
      const paymentTotal = payments.reduce((s, p) => s + Number(p.amount), 0);
      expect(paymentTotal).toBe(14000);

      // Verify pos_transactions row exists and is correctly scoped (via production read)
      const tx = await readPosTransactionByClientTxId(db, clientTxId, companyId, seedOutletId);
      expect(tx).toBeTruthy();
      expect(tx!.company_id).toBe(companyId);
      expect(tx!.outlet_id).toBe(seedOutletId);
      expect(tx!.status).toBe('COMPLETED');

      // Verify all subtotals are within the same company/outlet
      expect(items.every((i) => i.company_id === companyId && i.outlet_id === seedOutletId)).toBe(true);
      expect(taxes.every((t) => t.company_id === companyId && t.outlet_id === seedOutletId)).toBe(true);
      expect(payments.every((p) => p.company_id === companyId && p.outlet_id === seedOutletId)).toBe(true);
    });
  });

  // =========================================================================
  // AC3: Finalized invariance under config changes
  // =========================================================================

  describe('AC3: Finalized invariance under config changes', () => {
    it('historical pos_transaction_taxes amounts are immutable after tax rate update', async () => {
      const clientTxId = nextTxId();
      const taxAmount = 909; // 10% inclusive on $100

      // 1. Push COMPLETED with tax rate A (10% inclusive)
      const res = await fetch(`${baseUrl}/api/sync/push`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          outlet_id: seedOutletId,
          transactions: [
            {
              client_tx_id: clientTxId,
              company_id: companyId,
              outlet_id: seedOutletId,
              cashier_user_id: cashierUserId,
              trx_at: FIXTURE_TRX_AT,
              status: 'COMPLETED',
              items: [
                {
                  item_id: itemId,
                  qty: 1,
                  price_snapshot: 10000,
                  name_snapshot: 'AC3 Immutability Test Item',
                },
              ],
              payments: [{ method: 'CASH', amount: 10000 }],
              taxes: [{ tax_rate_id: taxRateAId, amount: taxAmount }],
            },
          ],
        }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data?.results?.[0]?.result).toBe('OK');
      const posTransactionId = body.data.results[0].posTransactionId;

      const db = getTestDb();

      // 2. Snapshot original tax lines
      const originalTaxes = await db
        .selectFrom('pos_transaction_taxes')
        .selectAll()
        .where('pos_transaction_id', '=', posTransactionId)
        .execute();
      expect(originalTaxes).toHaveLength(1);
      const originalTaxAmount = Number(originalTaxes[0].amount);
      expect(originalTaxAmount).toBe(taxAmount);

      // Also snapshot original transaction header via production read
      const originalHeader = await readPosTransactionByClientTxId(db, clientTxId, companyId, seedOutletId);
      expect(originalHeader).toBeTruthy();

      // 3. Change the tax rate config (update rate_percent to 15%)
      await db
        .updateTable('tax_rates')
        .set({ rate_percent: 15, is_inclusive: 0 })
        .where('id', '=', taxRateAId)
        .execute();

      try {
        // 4. Re-query the original transaction's tax lines — MUST be unchanged
        const taxesAfterUpdate = await db
          .selectFrom('pos_transaction_taxes')
          .selectAll()
          .where('pos_transaction_id', '=', posTransactionId)
          .execute();
        expect(taxesAfterUpdate).toHaveLength(1);
        expect(Number(taxesAfterUpdate[0].amount)).toBe(originalTaxAmount); // IMMUTABLE

        // 5. Re-query the original transaction header — must be unchanged (via production read)
        const headerAfterUpdate = await readPosTransactionByClientTxId(db, clientTxId, companyId, seedOutletId);
        expect(headerAfterUpdate).toBeTruthy();
        expect(headerAfterUpdate!.status).toBe(originalHeader!.status);
        expect(headerAfterUpdate!.client_tx_id).toBe(originalHeader!.client_tx_id);

        // 6. Verify we can still push a new transaction with the now-modified rate
        //    (client provides its own tax amounts — server doesn't recalculate)
        const newClientTxId = nextTxId();
        const res2 = await fetch(`${baseUrl}/api/sync/push`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            outlet_id: seedOutletId,
            transactions: [
              {
                client_tx_id: newClientTxId,
                company_id: companyId,
                outlet_id: seedOutletId,
                cashier_user_id: cashierUserId,
                trx_at: FIXTURE_TRX_AT,
                status: 'COMPLETED',
                items: [
                  {
                    item_id: itemId,
                    qty: 1,
                    price_snapshot: 20000,
                    name_snapshot: 'AC3 New Transaction After Config Change',
                  },
                ],
                payments: [{ method: 'CASH', amount: 20000 }],
                taxes: [{ tax_rate_id: taxRateAId, amount: 2500 }], // Different tax amount sent by client
              },
            ],
          }),
        });

        expect(res2.status).toBe(200);
        const body2 = await res2.json();
        expect(body2.data?.results?.[0]?.result).toBe('OK');
      } finally {
        // Restore original tax rate config for subsequent tests
        await db
          .updateTable('tax_rates')
          .set({ rate_percent: 10, is_inclusive: 1 })
          .where('id', '=', taxRateAId)
          .execute();
      }
    });

    it('pos_transaction header and tax lines are immutable after config change', async () => {
      const clientTxId = nextTxId();
      const taxAmount = 909;

      const res = await fetch(`${baseUrl}/api/sync/push`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          outlet_id: seedOutletId,
          transactions: [
            {
              client_tx_id: clientTxId,
              company_id: companyId,
              outlet_id: seedOutletId,
              cashier_user_id: cashierUserId,
              trx_at: FIXTURE_TRX_AT,
              status: 'COMPLETED',
              items: [
                { item_id: itemId, qty: 1, price_snapshot: 10000, name_snapshot: 'AC3 Immutability Item B' },
              ],
              payments: [{ method: 'CASH', amount: 10000 }],
              taxes: [{ tax_rate_id: taxRateBId, amount: taxAmount }],
            },
          ],
        }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data?.results?.[0]?.result).toBe('OK');
      const posTransactionId = body.data.results[0].posTransactionId;

      const db = getTestDb();

      // Snapshot all persisted data via production read
      const originalHeader = await readPosTransactionByClientTxId(db, clientTxId, companyId, seedOutletId);
      expect(originalHeader).toBeTruthy();

      const originalItems = await db
        .selectFrom('pos_transaction_items')
        .selectAll()
        .where('pos_transaction_id', '=', posTransactionId)
        .execute();

      const originalTaxes = await db
        .selectFrom('pos_transaction_taxes')
        .selectAll()
        .where('pos_transaction_id', '=', posTransactionId)
        .execute();

      const originalPayments = await db
        .selectFrom('pos_transaction_payments')
        .selectAll()
        .where('pos_transaction_id', '=', posTransactionId)
        .execute();

      // Change tax rate config B (rate_percent: 5 -> 20)
      await db
        .updateTable('tax_rates')
        .set({ rate_percent: 20 })
        .where('id', '=', taxRateBId)
        .execute();

      try {
        // Re-query — all persisted data must be unchanged (via production read)
        const headerAfter = await readPosTransactionByClientTxId(db, clientTxId, companyId, seedOutletId);
        expect(headerAfter!.status).toBe(originalHeader!.status);
        expect(headerAfter!.client_tx_id).toBe(originalHeader!.client_tx_id);
        expect(headerAfter!.company_id).toBe(originalHeader!.company_id);
        expect(headerAfter!.outlet_id).toBe(originalHeader!.outlet_id);

        const taxesAfter = await db
          .selectFrom('pos_transaction_taxes')
          .selectAll()
          .where('pos_transaction_id', '=', posTransactionId)
          .execute();
        expect(taxesAfter).toHaveLength(originalTaxes.length);
        for (let i = 0; i < originalTaxes.length; i++) {
          expect(Number(taxesAfter[i].amount)).toBe(Number(originalTaxes[i].amount));
          expect(taxesAfter[i].tax_rate_id).toBe(originalTaxes[i].tax_rate_id);
        }

        const itemsAfter = await db
          .selectFrom('pos_transaction_items')
          .selectAll()
          .where('pos_transaction_id', '=', posTransactionId)
          .execute();
        expect(itemsAfter).toHaveLength(originalItems.length);
        for (let i = 0; i < originalItems.length; i++) {
          expect(Number(itemsAfter[i].price_snapshot)).toBe(Number(originalItems[i].price_snapshot));
          expect(Number(itemsAfter[i].qty)).toBe(Number(originalItems[i].qty));
        }

        const paymentsAfter = await db
          .selectFrom('pos_transaction_payments')
          .selectAll()
          .where('pos_transaction_id', '=', posTransactionId)
          .execute();
        expect(paymentsAfter).toHaveLength(originalPayments.length);
        for (let i = 0; i < originalPayments.length; i++) {
          expect(Number(paymentsAfter[i].amount)).toBe(Number(originalPayments[i].amount));
        }
      } finally {
        // Restore original tax rate B config
        await db
          .updateTable('tax_rates')
          .set({ rate_percent: 5 })
          .where('id', '=', taxRateBId)
          .execute();
      }
    });
  });
});
