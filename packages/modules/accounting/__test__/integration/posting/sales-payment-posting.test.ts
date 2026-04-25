// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Integration tests for Sales Payment Posting (Story 50.3)
 *
 * Tests:
 * - Journals are balanced (debits == credits)
 * - Payment with delta > 0 uses variance gain account
 * - Payment with delta < 0 uses variance loss account
 * - Payment with delta = 0 posts without variance lines
 * - Split payment entries are balanced
 * - Mapping missing throws error
 *
 * POLICY COMPLIANCE (strict-policy GO):
 * - Uses canonical fixtures from @jurnapod/modules-platform for company/outlet creation
 * - Deterministic run IDs via hrtime (not Date.now/Math.random)
 * - Unique company+outlet per describe block for isolation
 * - No hardcoded COMPANY_ID/OUTLET_ID — uses ctx from fixtures
 * - Unique cash/bank account codes per test to avoid duplicate key collisions
 * - Hardcoded cash account IDs (e.g. 501/504/505/13/3) replaced with created/queryable ids
 * - makeUniqueDocId uses hrtime not Date.now for deterministic doc_id generation
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "kysely";
import {
  createKysely,
  type KyselySchema,
} from "@jurnapod/db";
import { ensureSalesOutletMappings, ensurePaymentVarianceMappings } from "../../../src/index.js";
import {
  postSalesPayment,
  type SalesPaymentPostingData,
  type SalesPostingExecutor,
  PaymentVarianceConfigError,
} from "../../../src/posting/sales.js";
import { createPostingIdGenerator } from "./id-utils.js";

// -----------------------------------------------------------------------------
// Canonical fixtures from owner packages
// -----------------------------------------------------------------------------
import { createTestCompanyMinimal } from "@jurnapod/modules-platform";
import { createTestOutletMinimal } from "@jurnapod/modules-platform";

// -----------------------------------------------------------------------------
// Test context — unique company+outlet per describe block
// -----------------------------------------------------------------------------
interface TestContext {
  companyId: number;
  outletId: number;
}

// Deterministic fixed dates
const FIXED_PAYMENT_DATE = "2026-04-01 12:00:00";
const FIXED_UPDATED_AT = "2026-04-01T12:00:00";

// -----------------------------------------------------------------------------
// Deterministic run-unique counter for test IDs.
// Uses createPostingIdGenerator for per-file salt to avoid cross-file collisions.
// -----------------------------------------------------------------------------
const { nextId: paymentNextId, nextCode: paymentNextCode } = createPostingIdGenerator("sales-payment-posting.test");
function nextPaymentTestId(): number {
  return paymentNextId();
}

// -----------------------------------------------------------------------------
// Mock executor for sales payment posting
// -----------------------------------------------------------------------------
function createMockExecutor(
  arAccountId: number,
  cashBankAccountId: number,
  varianceAccounts: { gain: number | null; loss: number | null }
): SalesPostingExecutor {
  return {
    async readOutletAccountMappingByKey(_companyId: number, _outletId: number) {
      return {
        SALES_REVENUE: 400,
        AR: arAccountId,
        SALES_RETURNS: 400,
      };
    },
    async readCreditNoteAccountMapping(_companyId: number, _outletId: number) {
      return { AR: arAccountId, SALES_RETURNS: 400 };
    },
    async readCompanyPaymentVarianceAccounts(_companyId: number) {
      return varianceAccounts;
    },
    async readTaxRatesByIds(_taxRateIds: number[], _companyId: number) {
      return new Map();
    },
  };
}

// -----------------------------------------------------------------------------
// Database setup/teardown
// -----------------------------------------------------------------------------
let db: KyselySchema;

beforeAll(async () => {
  db = createKysely({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USER ?? "root",
    password: process.env.DB_PASSWORD ?? "",
    database: process.env.DB_NAME ?? "jurnapod_test",
  });
});

afterAll(async () => {
  await db?.destroy();
});

// -----------------------------------------------------------------------------
// GAP HELPER: get or create CASH/BANK account per company.
// Rerun-safe: unique code per call; duplicate key → fetch existing.
// GAP: No canonical account fixture exists in the platform package yet.
// -----------------------------------------------------------------------------
async function getOrCreateCashAccount(companyId: number, name: string): Promise<number> {
  const code = `CASH-PAY-${nextPaymentTestId()}`;

  // Ensure CASH account_type exists for this company
  await sql`
    INSERT IGNORE INTO account_types (company_id, name, category, normal_balance)
    VALUES (${companyId}, 'CASH', 'ASSET', 'D')
  `.execute(db);

  const typeRow = await sql`
    SELECT id FROM account_types WHERE company_id = ${companyId} AND name = 'CASH' LIMIT 1
  `.execute(db);
  const accountTypeId = typeRow.rows[0] ? Number((typeRow.rows[0] as { id: number }).id) : 1;

  try {
    await sql`
      INSERT INTO accounts (company_id, code, name, account_type_id, is_active, is_payable, created_at, updated_at)
      VALUES (${companyId}, ${code}, ${name}, ${accountTypeId}, 1, 0, NOW(), NOW())
    `.execute(db);
  } catch (err) {
    const mysqlErr = err as { code?: string };
    if (!mysqlErr?.code || (mysqlErr.code !== 'ER_DUP_ENTRY' && mysqlErr.code !== 'ER_DUP_KEY')) {
      throw err;
    }
  }

  const row = await sql`
    SELECT id FROM accounts WHERE company_id = ${companyId} AND code = ${code} LIMIT 1
  `.execute(db);
  if (!row.rows[0]) throw new Error(`Cash account not found after insert: ${code}`);
  return Number((row.rows[0] as { id: number }).id);
}

async function getOrCreateBankAccount(companyId: number, name: string): Promise<number> {
  const code = `BANK-PAY-${nextPaymentTestId()}`;

  await sql`
    INSERT IGNORE INTO account_types (company_id, name, category, normal_balance)
    VALUES (${companyId}, 'BANK', 'ASSET', 'D')
  `.execute(db);

  const typeRow = await sql`
    SELECT id FROM account_types WHERE company_id = ${companyId} AND name = 'BANK' LIMIT 1
  `.execute(db);
  const accountTypeId = typeRow.rows[0] ? Number((typeRow.rows[0] as { id: number }).id) : 1;

  try {
    await sql`
      INSERT INTO accounts (company_id, code, name, account_type_id, is_active, is_payable, created_at, updated_at)
      VALUES (${companyId}, ${code}, ${name}, ${accountTypeId}, 1, 0, NOW(), NOW())
    `.execute(db);
  } catch (err) {
    const mysqlErr = err as { code?: string };
    if (!mysqlErr?.code || (mysqlErr.code !== 'ER_DUP_ENTRY' && mysqlErr.code !== 'ER_DUP_KEY')) {
      throw err;
    }
  }

  const row = await sql`
    SELECT id FROM accounts WHERE company_id = ${companyId} AND code = ${code} LIMIT 1
  `.execute(db);
  if (!row.rows[0]) throw new Error(`Bank account not found after insert: ${code}`);
  return Number((row.rows[0] as { id: number }).id);
}

// -----------------------------------------------------------------------------
// Describe block — creates a unique company+outlet once, reused by all tests
// -----------------------------------------------------------------------------
describe("SalesPaymentPosting", () => {
  let ctx: TestContext;

  beforeAll(async () => {
    const company = await createTestCompanyMinimal(db);
    const outlet = await createTestOutletMinimal(db, company.id);
    ctx = { companyId: company.id, outletId: outlet.id };
  });

  function makePaymentData(overrides: Partial<SalesPaymentPostingData> = {}): SalesPaymentPostingData {
    return {
      id: nextPaymentTestId(),
      company_id: ctx.companyId,
      outlet_id: ctx.outletId,
      payment_no: `PAY-TEST-${nextPaymentTestId()}`,
      payment_at: FIXED_PAYMENT_DATE,
      actual_amount_idr: 100_000,
      payment_amount_idr: 100_000,
      amount: 100_000,
      invoice_amount_idr: 100_000,
      payment_delta_idr: 0,
      account_id: 501,
      account_name: "Cash",
      updated_at: FIXED_UPDATED_AT,
      ...overrides,
    };
  }

  // Deterministic doc_id using only hrtime counter + label (no Date.now)
  function makeUniqueDocId(label: string): string {
    return `${label}-${nextPaymentTestId()}`;
  }

  // -------------------------------------------------------------------------
  // Test 1: payment with no variance and balanced journal
  // -------------------------------------------------------------------------
  it("posts payment with no variance and balanced journal", async () => {
    const mappings = await ensureSalesOutletMappings(db, {
      companyId: ctx.companyId,
      outletId: ctx.outletId,
    });

    const cashAccountId = await getOrCreateCashAccount(ctx.companyId, "Test Cash No Var");

    const executor = createMockExecutor(mappings.arAccountId, cashAccountId, { gain: null, loss: null });

    const payment = makePaymentData({
      actual_amount_idr: 100_000,
      payment_amount_idr: 100_000,
      invoice_amount_idr: 100_000,
      payment_delta_idr: 0,
      account_id: cashAccountId,
    });

    const result = await postSalesPayment(db, executor, payment, makeUniqueDocId("PAY"));

    expect(result.journal_batch_id).toBeGreaterThan(0);

    const batchRows = await sql`
      SELECT doc_type, doc_id
      FROM journal_batches
      WHERE id = ${result.journal_batch_id}
    `.execute(db);
    expect(batchRows.rows).toHaveLength(1);
    expect((batchRows.rows[0] as { doc_type: string }).doc_type).toBe("SALES_PAYMENT_IN");

    const lines = await sql`
      SELECT account_id, debit, credit, description
      FROM journal_lines
      WHERE journal_batch_id = ${result.journal_batch_id}
      ORDER BY line_date ASC
    `.execute(db);

    expect(lines.rows.length).toBe(2);

    const cashLine = lines.rows.find(r => Number((r as { account_id: number }).account_id) === cashAccountId) as { debit: string; credit: string } | undefined;
    expect(cashLine).toBeDefined();
    expect(Number(cashLine!.debit)).toBe(100_000);
    expect(Number(cashLine!.credit)).toBe(0);

    const arLine = lines.rows.find(r => Number((r as { account_id: number }).account_id) === mappings.arAccountId) as { debit: string; credit: string } | undefined;
    expect(arLine).toBeDefined();
    expect(Number(arLine!.debit)).toBe(0);
    expect(Number(arLine!.credit)).toBe(100_000);

    const totalDebit = lines.rows.reduce((s, r) => s + Number((r as { debit: string }).debit), 0);
    const totalCredit = lines.rows.reduce((s, r) => s + Number((r as { credit: string }).credit), 0);
    expect(totalDebit).toBe(totalCredit);
  });

  // -------------------------------------------------------------------------
  // Test 2: payment with positive delta and uses variance gain account
  // -------------------------------------------------------------------------
  it("posts payment with positive delta and uses variance gain account", async () => {
    const mappings = await ensureSalesOutletMappings(db, {
      companyId: ctx.companyId,
      outletId: ctx.outletId,
    });

    const varianceMappings = await ensurePaymentVarianceMappings(db, {
      companyId: ctx.companyId,
    });

    const cashAccountId = await getOrCreateCashAccount(ctx.companyId, "Test Cash Pos Delta");

    const executor = createMockExecutor(
      mappings.arAccountId,
      cashAccountId,
      { gain: varianceMappings.gainAccountId, loss: varianceMappings.lossAccountId }
    );

    const payment = makePaymentData({
      actual_amount_idr: 105_000,
      payment_amount_idr: 105_000,
      invoice_amount_idr: 100_000,
      payment_delta_idr: 5_000,
      account_id: cashAccountId,
    });

    const result = await postSalesPayment(db, executor, payment, makeUniqueDocId("PAY"));

    expect(result.journal_batch_id).toBeGreaterThan(0);

    const lines = await sql`
      SELECT account_id, debit, credit, description
      FROM journal_lines
      WHERE journal_batch_id = ${result.journal_batch_id}
      ORDER BY line_date ASC
    `.execute(db);

    expect(lines.rows.length).toBe(3);

    const cashLine = lines.rows.find(r => Number((r as { account_id: number }).account_id) === cashAccountId) as { debit: string } | undefined;
    expect(cashLine).toBeDefined();
    expect(Number(cashLine!.debit)).toBe(105_000);

    const arLine = lines.rows.find(r => Number((r as { account_id: number }).account_id) === mappings.arAccountId) as { credit: string } | undefined;
    expect(arLine).toBeDefined();
    expect(Number(arLine!.credit)).toBe(100_000);

    const gainLine = lines.rows.find(r => Number((r as { account_id: number }).account_id) === varianceMappings.gainAccountId) as { credit: string } | undefined;
    expect(gainLine).toBeDefined();
    expect(Number(gainLine!.credit)).toBe(5_000);

    const totalDebit = lines.rows.reduce((s, r) => s + Number((r as { debit: string }).debit), 0);
    const totalCredit = lines.rows.reduce((s, r) => s + Number((r as { credit: string }).credit), 0);
    expect(totalDebit).toBe(totalCredit);
  });

  // -------------------------------------------------------------------------
  // Test 3: payment with negative delta and uses variance loss account
  // -------------------------------------------------------------------------
  it("posts payment with negative delta and uses variance loss account", async () => {
    const mappings = await ensureSalesOutletMappings(db, {
      companyId: ctx.companyId,
      outletId: ctx.outletId,
    });

    const varianceMappings = await ensurePaymentVarianceMappings(db, {
      companyId: ctx.companyId,
    });

    const cashAccountId = await getOrCreateCashAccount(ctx.companyId, "Test Cash Neg Delta");

    const executor = createMockExecutor(
      mappings.arAccountId,
      cashAccountId,
      { gain: varianceMappings.gainAccountId, loss: varianceMappings.lossAccountId }
    );

    const payment = makePaymentData({
      actual_amount_idr: 95_000,
      payment_amount_idr: 95_000,
      invoice_amount_idr: 100_000,
      payment_delta_idr: -5_000,
      account_id: cashAccountId,
    });

    const result = await postSalesPayment(db, executor, payment, makeUniqueDocId("PAY"));

    expect(result.journal_batch_id).toBeGreaterThan(0);

    const lines = await sql`
      SELECT account_id, debit, credit
      FROM journal_lines
      WHERE journal_batch_id = ${result.journal_batch_id}
      ORDER BY line_date ASC
    `.execute(db);

    expect(lines.rows.length).toBe(3);

    const cashLine = lines.rows.find(r => Number((r as { account_id: number }).account_id) === cashAccountId) as { debit: string } | undefined;
    expect(cashLine).toBeDefined();
    expect(Number(cashLine!.debit)).toBe(95_000);

    const arLine = lines.rows.find(r => Number((r as { account_id: number }).account_id) === mappings.arAccountId) as { credit: string } | undefined;
    expect(arLine).toBeDefined();
    expect(Number(arLine!.credit)).toBe(100_000);

    const lossLine = lines.rows.find(r => Number((r as { account_id: number }).account_id) === varianceMappings.lossAccountId) as { debit: string } | undefined;
    expect(lossLine).toBeDefined();
    expect(Number(lossLine!.debit)).toBe(5_000);

    const totalDebit = lines.rows.reduce((s, r) => s + Number((r as { debit: string }).debit), 0);
    const totalCredit = lines.rows.reduce((s, r) => s + Number((r as { credit: string }).credit), 0);
    expect(totalDebit).toBe(totalCredit);
  });

  // -------------------------------------------------------------------------
  // Test 4: throws PaymentVarianceConfigError when delta > 0 but gain missing
  // -------------------------------------------------------------------------
  it("throws PaymentVarianceConfigError when delta > 0 but gain account missing", async () => {
    const mappings = await ensureSalesOutletMappings(db, {
      companyId: ctx.companyId,
      outletId: ctx.outletId,
    });

    const cashAccountId = await getOrCreateCashAccount(ctx.companyId, "Test Cash No Gain");
    const executor = createMockExecutor(mappings.arAccountId, cashAccountId, { gain: null, loss: null });

    const payment = makePaymentData({
      actual_amount_idr: 105_000,
      payment_amount_idr: 105_000,
      invoice_amount_idr: 100_000,
      payment_delta_idr: 5_000,
      account_id: cashAccountId,
    });

    await expect(postSalesPayment(db, executor, payment, makeUniqueDocId("PAY"))).rejects.toThrow(
      PaymentVarianceConfigError
    );
  });

  // -------------------------------------------------------------------------
  // Test 5: throws PaymentVarianceConfigError when delta < 0 but loss missing
  // -------------------------------------------------------------------------
  it("throws PaymentVarianceConfigError when delta < 0 but loss account missing", async () => {
    const mappings = await ensureSalesOutletMappings(db, {
      companyId: ctx.companyId,
      outletId: ctx.outletId,
    });

    const cashAccountId = await getOrCreateCashAccount(ctx.companyId, "Test Cash No Loss");
    const executor = createMockExecutor(mappings.arAccountId, cashAccountId, { gain: null, loss: null });

    const payment = makePaymentData({
      actual_amount_idr: 95_000,
      payment_amount_idr: 95_000,
      invoice_amount_idr: 100_000,
      payment_delta_idr: -5_000,
      account_id: cashAccountId,
    });

    await expect(postSalesPayment(db, executor, payment, makeUniqueDocId("PAY"))).rejects.toThrow(
      PaymentVarianceConfigError
    );
  });

  // -------------------------------------------------------------------------
  // Test 6: split payment with balanced journal
  // -------------------------------------------------------------------------
  it("posts split payment with balanced journal", async () => {
    const mappings = await ensureSalesOutletMappings(db, {
      companyId: ctx.companyId,
      outletId: ctx.outletId,
    });

    const cashAccountId = await getOrCreateCashAccount(ctx.companyId, "Test Cash Split");
    const bankAccountId = await getOrCreateBankAccount(ctx.companyId, "Test Bank Split");

    const executor = createMockExecutor(mappings.arAccountId, cashAccountId, { gain: null, loss: null });

    const payment = makePaymentData({
      account_id: cashAccountId,
      actual_amount_idr: 100_000,
      payment_amount_idr: 100_000,
      invoice_amount_idr: 100_000,
      payment_delta_idr: 0,
      splits: [
        { split_index: 0, account_id: cashAccountId, account_name: "Cash", amount: 60_000 },
        { split_index: 1, account_id: bankAccountId, account_name: "Bank", amount: 40_000 },
      ],
    });

    const result = await postSalesPayment(db, executor, payment, makeUniqueDocId("PAY"));

    expect(result.journal_batch_id).toBeGreaterThan(0);

    const lines = await sql`
      SELECT account_id, debit, credit
      FROM journal_lines
      WHERE journal_batch_id = ${result.journal_batch_id}
      ORDER BY line_date ASC
    `.execute(db);

    expect(lines.rows.length).toBe(3);

    const cashLine = lines.rows.find(r => Number((r as { account_id: number }).account_id) === cashAccountId) as { debit: string } | undefined;
    expect(Number(cashLine!.debit)).toBe(60_000);

    const bankLine = lines.rows.find(r => Number((r as { account_id: number }).account_id) === bankAccountId) as { debit: string } | undefined;
    expect(Number(bankLine!.debit)).toBe(40_000);

    const arLine = lines.rows.find(r => Number((r as { account_id: number }).account_id) === mappings.arAccountId) as { credit: string } | undefined;
    expect(Number(arLine!.credit)).toBe(100_000);

    const totalDebit = lines.rows.reduce((s, r) => s + Number((r as { debit: string }).debit), 0);
    const totalCredit = lines.rows.reduce((s, r) => s + Number((r as { credit: string }).credit), 0);
    expect(totalDebit).toBe(totalCredit);
    expect(totalDebit).toBe(100_000);
  });
});
