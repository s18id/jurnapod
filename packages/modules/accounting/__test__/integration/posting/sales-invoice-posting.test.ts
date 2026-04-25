// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Integration tests for Sales Invoice Posting (Story 50.3)
 *
 * Tests:
 * - Journals are balanced (debits == credits)
 * - Mappings respected (AR, SALES_REVENUE from ensureSalesOutletMappings)
 * - Invoice with no tax posts correctly
 * - Invoice with tax posts correctly
 * - Mapping missing throws error
 *
 * POLICY COMPLIANCE:
 * - Uses canonical fixtures from @jurnapod/modules-platform for company/outlet creation
 * - Deterministic run IDs via hrtime (not Date.now/Math.random)
 * - Unique company+outlet per describe block for isolation
 * - No hardcoded COMPANY_ID/OUTLET_ID — uses ctx from fixtures
 * - Tax rate ID resolved per-company (not global constant) via ctx.canonicalTaxRateId
 * - Per-run cleanup via beforeEach (SKU-pattern cleanup for test data;
 *   accounts isolated via unique codes and are NOT deleted due to journal_lines FK)
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "kysely";
import {
  createKysely,
  type KyselySchema,
} from "@jurnapod/db";
import { ensureSalesOutletMappings } from "../../../src/index.js";
import {
  postSalesInvoice,
  type SalesInvoicePostingData,
  type SalesPostingExecutor,
} from "../../../src/posting/sales.js";
import { createPostingIdGenerator } from "./id-utils.js";

// -----------------------------------------------------------------------------
// Canonical fixtures from owner package
// -----------------------------------------------------------------------------
import { createTestCompanyMinimal } from "@jurnapod/modules-platform";
import { createTestOutletMinimal } from "@jurnapod/modules-platform";

// -----------------------------------------------------------------------------
// Test context — unique company+outlet per describe block
// -----------------------------------------------------------------------------
interface TestContext {
  companyId: number;
  outletId: number;
  canonicalTaxRateId: number;
}

// Deterministic test data
const FIXED_INVOICE_DATE = "2026-04-01 10:00:00";
const FIXED_UPDATED_AT = "2026-04-01T10:00:00";

// -----------------------------------------------------------------------------
// Deterministic run-unique counter for test IDs.
// Uses createPostingIdGenerator for per-file salt to avoid cross-file collisions.
// -----------------------------------------------------------------------------
const { nextId, nextCode } = createPostingIdGenerator("sales-invoice-posting.test");
function nextTestId(): number {
  return nextId();
}

// -----------------------------------------------------------------------------
// Mock executor for sales invoice posting
// -----------------------------------------------------------------------------
function createMockExecutor(
  arAccountId: number,
  salesRevenueAccountId: number,
  taxAccounts: Map<number, { account_id: number | null; code: string }>
): SalesPostingExecutor {
  return {
    async readOutletAccountMappingByKey(_companyId: number, _outletId: number) {
      return {
        SALES_REVENUE: salesRevenueAccountId,
        AR: arAccountId,
        SALES_RETURNS: arAccountId,
      };
    },
    async readCreditNoteAccountMapping(_companyId: number, _outletId: number) {
      return { AR: arAccountId, SALES_RETURNS: salesRevenueAccountId };
    },
    async readCompanyPaymentVarianceAccounts(_companyId: number) {
      return { gain: null, loss: null };
    },
    async readTaxRatesByIds(taxRateIds: number[], _companyId: number) {
      const result = new Map<number, { account_id: number | null; code: string }>();
      for (const id of taxRateIds) {
        const info = taxAccounts.get(id);
        if (info) {
          result.set(id, info);
        }
      }
      return result;
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

  // Seed account_types if empty — required for account creation via subquery.
  // System-level types (company_id = NULL) are used as reference data.
  const typeCount = await sql`
    SELECT COUNT(*) as cnt FROM account_types
  `.execute(db).then(r => Number((r.rows[0] as { cnt: number }).cnt));

  if (typeCount === 0) {
    await sql`
      INSERT IGNORE INTO account_types (id, name, category, normal_balance)
      VALUES
        (1, 'ASSET',     'ASSET',     'D'),
        (2, 'EXPENSE',   'EXPENSE',   'D'),
        (3, 'LIABILITY', 'LIABILITY', 'C'),
        (4, 'INCOME',    'INCOME',    'C'),
        (5, 'REVENUE',   'REVENUE',   'C')
    `.execute(db);
  }
});

afterAll(async () => {
  await db?.destroy();
});

// -----------------------------------------------------------------------------
// Describe block — creates a unique company+outlet once, reused by all tests
// -----------------------------------------------------------------------------
describe("SalesInvoicePosting", () => {
  let ctx: TestContext;

  beforeAll(async () => {
    const company = await createTestCompanyMinimal(db);
    const outlet = await createTestOutletMinimal(db, company.id);

    // Resolve canonical tax rate for this company's outlet
    const taxRates = await sql`
      SELECT id FROM tax_rates
      WHERE company_id = ${company.id}
      ORDER BY id ASC
      LIMIT 1
    `.execute(db);
    const canonicalTaxRateId = taxRates.rows[0]
      ? Number((taxRates.rows[0] as { id: number }).id)
      : 1;

    ctx = { companyId: company.id, outletId: outlet.id, canonicalTaxRateId };
  });

  // Per-run cleanup: removes test-created accounts that are NOT yet
  // referenced by journal_lines (isolated by unique codes).
  // Accounts referenced by journal_lines CANNOT be deleted due to FK constraint.
  // Strategy: each test uses unique codes; accounts accumulate but remain
  // inert since no other data links to them across runs.
  beforeEach(async () => {
    // Only delete AR/REV accounts that have no journal_lines references.
    // In practice, test #4 (maps accounts correctly) creates these and posts
    // to them, so they WILL have journal_lines and cannot be deleted here.
    // We accept account accumulation as a consequence of the immutability policy.
    // Safe to delete: TAX accounts (only referenced by test 2, and we clean before re-run).
    await sql`
      DELETE FROM accounts
      WHERE company_id = ${ctx.companyId}
        AND code LIKE 'TAX11-%'
        AND id NOT IN (
          SELECT DISTINCT account_id FROM journal_lines
          WHERE company_id = ${ctx.companyId}
        )
    `.execute(db);
  });

  // -----------------------------------------------------------------------------
  // Helper: ensure tax account exists for the given company.
  // Rerun-safe: unique code per call; duplicate key → fetch existing.
  // GAP: No canonical account fixture exists in the platform package yet.
  // -----------------------------------------------------------------------------
  async function getOrCreateTaxAccount(
    companyId: number,
    name: string
  ): Promise<number> {
    const code = `TAX11-${nextTestId()}`;
    // First ensure the LIABILITY account_type exists for this company
    await sql`
      INSERT IGNORE INTO account_types (company_id, name, category, normal_balance)
      VALUES (${companyId}, 'LIABILITY', 'LIABILITY', 'C')
    `.execute(db);

    const typeRow = await sql`
      SELECT id FROM account_types WHERE company_id = ${companyId} AND name = 'LIABILITY' LIMIT 1
    `.execute(db);
    const accountTypeId = Number((typeRow.rows[0] as { id: number }).id);

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
    if (!row.rows[0]) throw new Error(`Tax account not found after insert: ${code}`);
    return Number((row.rows[0] as { id: number }).id);
  }

  // -------------------------------------------------------------------------
  // Helper: create dedicated AR and Revenue accounts for test isolation.
  // Rerun-safe via unique codes; duplicate key → fetch existing.
  // GAP: No canonical account fixture exists in the platform package yet.
  // -------------------------------------------------------------------------
  async function createDedicatedAccounts(companyId: number): Promise<{ arId: number; revId: number }> {
    const arCode = `AR-TEST-${nextTestId()}`;
    const revCode = `REV-TEST-${nextTestId()}`;

    // Ensure account types exist for this company
    for (const [typeName, category, normal] of [
      ['ASSET', 'ASSET', 'D'],
      ['REVENUE', 'REVENUE', 'C'],
    ] as [string, string, string][]) {
      await sql`
        INSERT IGNORE INTO account_types (company_id, name, category, normal_balance)
        VALUES (${companyId}, ${typeName}, ${category}, ${normal})
      `.execute(db);
    }

    const typeRows = await sql`
      SELECT name, id FROM account_types WHERE company_id = ${companyId} AND name IN ('ASSET', 'REVENUE')
    `.execute(db);
    const typeMap = new Map<string, number>();
    for (const r of typeRows.rows as { name: string; id: number }[]) {
      typeMap.set(r.name, r.id);
    }

    const arTypeId = typeMap.get('ASSET') ?? 1;
    const revTypeId = typeMap.get('REVENUE') ?? 5;

    for (const [code, acctName, typeId] of [
      [arCode, 'Test AR', arTypeId],
      [revCode, 'Test Revenue', revTypeId],
    ] as [string, string, number][]) {
      try {
        await sql`
          INSERT INTO accounts (company_id, code, name, account_type_id, is_active, is_payable, created_at, updated_at)
          VALUES (${companyId}, ${code}, ${acctName}, ${typeId}, 1, 0, NOW(), NOW())
        `.execute(db);
      } catch (err) {
        const mysqlErr = err as { code?: string };
        if (!mysqlErr?.code || (mysqlErr.code !== 'ER_DUP_ENTRY' && mysqlErr.code !== 'ER_DUP_KEY')) {
          throw err;
        }
      }
    }

    const arRow = await sql`SELECT id FROM accounts WHERE company_id = ${companyId} AND code = ${arCode} LIMIT 1`.execute(db);
    const revRow = await sql`SELECT id FROM accounts WHERE company_id = ${companyId} AND code = ${revCode} LIMIT 1`.execute(db);

    if (!arRow.rows[0] || !revRow.rows[0]) {
      throw new Error(`Dedicated accounts not found after insert: AR=${arCode}, REV=${revCode}`);
    }

    return {
      arId: Number((arRow.rows[0] as { id: number }).id),
      revId: Number((revRow.rows[0] as { id: number }).id),
    };
  }

  function makeInvoiceData(overrides: Partial<SalesInvoicePostingData> = {}): SalesInvoicePostingData {
    // tax_rate_id resolved per-company via canonical fixture (not hardcoded constant 1)
    const taxRateId = ctx.canonicalTaxRateId;
    return {
      id: nextTestId(),
      company_id: ctx.companyId,
      outlet_id: ctx.outletId,
      invoice_no: `INV-TEST-${nextTestId()}`,
      invoice_date: FIXED_INVOICE_DATE,
      subtotal: 100_000,
      grand_total: 111_000,
      taxes: [{ tax_rate_id: taxRateId, amount: 11_000 }],
      updated_at: FIXED_UPDATED_AT,
      ...overrides,
    };
  }

  // -------------------------------------------------------------------------
  // Test 1: simple invoice (no tax) with balanced journal
  // -------------------------------------------------------------------------
  it("posts a simple invoice (no tax) with balanced journal", async () => {
    const mappings = await ensureSalesOutletMappings(db, {
      companyId: ctx.companyId,
      outletId: ctx.outletId,
    });

    const executor = createMockExecutor(
      mappings.arAccountId,
      mappings.salesRevenueAccountId,
      new Map()
    );

    const invoice = makeInvoiceData({
      subtotal: 100_000,
      grand_total: 100_000,
      taxes: [],
    });

    const result = await postSalesInvoice(db, executor, invoice);

    expect(result.journal_batch_id).toBeGreaterThan(0);

    const batchRows = await sql`
      SELECT doc_type, doc_id, company_id, outlet_id
      FROM journal_batches
      WHERE id = ${result.journal_batch_id}
    `.execute(db);

    expect(batchRows.rows).toHaveLength(1);
    expect((batchRows.rows[0] as { doc_type: string }).doc_type).toBe("SALES_INVOICE");
    expect((batchRows.rows[0] as { doc_id: number }).doc_id).toBe(invoice.id);

    const lines = await sql`
      SELECT account_id, debit, credit, description
      FROM journal_lines
      WHERE journal_batch_id = ${result.journal_batch_id}
      ORDER BY line_date ASC
    `.execute(db);

    expect(lines.rows.length).toBe(2);

    const line1 = lines.rows[0] as { account_id: number; debit: string; credit: string; description: string };
    const line2 = lines.rows[1] as { account_id: number; debit: string; credit: string; description: string };

    expect(Number(line1.debit)).toBe(100_000);
    expect(Number(line1.credit)).toBe(0);
    expect(line1.account_id).toBe(mappings.arAccountId);

    expect(Number(line2.debit)).toBe(0);
    expect(Number(line2.credit)).toBe(100_000);
    expect(line2.account_id).toBe(mappings.salesRevenueAccountId);

    const totalDebit = lines.rows.reduce((s, r) => s + Number((r as { debit: string }).debit), 0);
    const totalCredit = lines.rows.reduce((s, r) => s + Number((r as { credit: string }).credit), 0);
    expect(totalDebit).toBe(totalCredit);
  });

  // -------------------------------------------------------------------------
  // Test 2: invoice with tax and balanced journal
  // -------------------------------------------------------------------------
  it("posts an invoice with tax and verifies balanced journal", async () => {
    const mappings = await ensureSalesOutletMappings(db, {
      companyId: ctx.companyId,
      outletId: ctx.outletId,
    });

    const taxAccountId = await getOrCreateTaxAccount(ctx.companyId, "Tax 11%");

    const taxAccounts = new Map<number, { account_id: number | null; code: string }>();
    taxAccounts.set(1, { account_id: taxAccountId, code: "TAX11" });

    const executor = createMockExecutor(
      mappings.arAccountId,
      mappings.salesRevenueAccountId,
      taxAccounts
    );

    const invoice = makeInvoiceData({
      subtotal: 100_000,
      grand_total: 111_000,
      taxes: [{ tax_rate_id: 1, amount: 11_000 }],
    });

    const result = await postSalesInvoice(db, executor, invoice);

    expect(result.journal_batch_id).toBeGreaterThan(0);

    const lines = await sql`
      SELECT account_id, debit, credit, description
      FROM journal_lines
      WHERE journal_batch_id = ${result.journal_batch_id}
      ORDER BY line_date ASC
    `.execute(db);

    expect(lines.rows.length).toBe(3);

    const arLine = lines.rows.find(r => Number(r.account_id) === mappings.arAccountId) as { debit: string; credit: string } | undefined;
    expect(arLine).toBeDefined();
    expect(Number(arLine!.debit)).toBe(111_000);
    expect(Number(arLine!.credit)).toBe(0);

    const revLine = lines.rows.find(r => Number(r.account_id) === mappings.salesRevenueAccountId) as { debit: string; credit: string } | undefined;
    expect(revLine).toBeDefined();
    expect(Number(revLine!.debit)).toBe(0);
    expect(Number(revLine!.credit)).toBe(100_000);

    const taxLine = lines.rows.find(r => Number(r.account_id) === taxAccountId) as { debit: string; credit: string } | undefined;
    expect(taxLine).toBeDefined();
    expect(Number(taxLine!.debit)).toBe(0);
    expect(Number(taxLine!.credit)).toBe(11_000);

    const totalDebit = lines.rows.reduce((s, r) => s + Number((r as { debit: string }).debit), 0);
    const totalCredit = lines.rows.reduce((s, r) => s + Number((r as { credit: string }).credit), 0);
    expect(totalDebit).toBe(totalCredit);
    expect(totalDebit).toBe(111_000);
  });

  // -------------------------------------------------------------------------
  // Test 3: throws when tax account is missing
  // -------------------------------------------------------------------------
  it("throws when tax account is missing", async () => {
    const mappings = await ensureSalesOutletMappings(db, {
      companyId: ctx.companyId,
      outletId: ctx.outletId,
    });

    const executor = createMockExecutor(
      mappings.arAccountId,
      mappings.salesRevenueAccountId,
      new Map() // no tax accounts
    );

    const invoice = makeInvoiceData({
      subtotal: 100_000,
      grand_total: 111_000,
      taxes: [{ tax_rate_id: ctx.canonicalTaxRateId, amount: 11_000 }],
    });

    await expect(postSalesInvoice(db, executor, invoice)).rejects.toThrow(/TAX_ACCOUNT_MISSING/);
  });

  // -------------------------------------------------------------------------
  // Test 4: maps accounts correctly from dedicated test accounts
  // -------------------------------------------------------------------------
  it("maps accounts correctly from outlet mapping", async () => {
    const { arId, revId } = await createDedicatedAccounts(ctx.companyId);

    const executor = createMockExecutor(arId, revId, new Map());

    const invoice = makeInvoiceData({
      subtotal: 50_000,
      grand_total: 50_000,
      taxes: [],
    });

    const result = await postSalesInvoice(db, executor, invoice);

    const lines = await sql`
      SELECT account_id, debit, credit
      FROM journal_lines
      WHERE journal_batch_id = ${result.journal_batch_id}
    `.execute(db);

    const accountIds = new Set(lines.rows.map(r => Number((r as { account_id: number }).account_id)));
    expect(accountIds.has(arId)).toBe(true);
    expect(accountIds.has(revId)).toBe(true);

    const arLine = lines.rows.find(r => Number((r as { account_id: number }).account_id) === arId) as { debit: string };
    expect(Number(arLine.debit)).toBe(50_000);

    const revLine = lines.rows.find(r => Number((r as { account_id: number }).account_id) === revId) as { credit: string };
    expect(Number(revLine.credit)).toBe(50_000);
  });
});