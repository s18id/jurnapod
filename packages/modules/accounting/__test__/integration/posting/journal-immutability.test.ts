// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Integration tests for Journal Immutability (Story 50.3)
 *
 * Tests:
 * - journal_batches rows cannot be UPDATEd (DB trigger enforcement)
 * - journal_batches rows cannot be DELETED (DB trigger enforcement)
 * - journal_lines rows cannot be UPDATEd (DB trigger enforcement)
 * - journal_lines rows cannot be DELETED (DB trigger enforcement)
 * - VOID/REFUND pattern creates new entries, does not mutate original
 * - Original journal data unchanged after void operations
 *
 * POLICY COMPLIANCE:
 * - Uses hrtime-based counter for deterministic run-unique IDs (not Date.now)
 * - Dynamic account codes per test (SKT-IMMUT-{id}) with dedup handling
 * - beforeEach cleanup for test-created accounts not referenced by journal_lines
 * - Uses canonical fixtures from @jurnapod/modules-platform for company/outlet
 * - No hardcoded COMPANY_ID/OUTLET_ID — uses ctx from fixtures
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { createKysely, type KyselySchema } from "@jurnapod/db";
import { ensureSalesOutletMappings } from "../../../src/index.js";
import {
  postSalesInvoice,
  postCreditNote,
  voidCreditNote,
  type SalesInvoicePostingData,
  type SalesCreditNotePostingData,
  type SalesPostingExecutor,
} from "../../../src/posting/sales.js";
import { createTestCompanyMinimal } from "@jurnapod/modules-platform";
import { createTestOutletMinimal } from "@jurnapod/modules-platform";
import { createPostingIdGenerator } from "./id-utils.js";

// -----------------------------------------------------------------------------
// Test context — unique company+outlet per describe block (per-run isolation)
// -----------------------------------------------------------------------------
interface TestContext {
  companyId: number;
  outletId: number;
  canonicalTaxRateId: number;
}

// Deterministic test dates
const FIXED_INVOICE_DATE = "2026-04-01 10:00:00";
const FIXED_UPDATED_AT = "2026-04-01T10:00:00";
const FIXED_CN_DATE = "2026-04-01 14:00:00";
const FIXED_CN_UPDATED_AT = "2026-04-01T14:00:00";

// -----------------------------------------------------------------------------
// Deterministic run-unique counter — file-specific namespace (JNL).
// Prevents cross-file ID collision with cogs-posting.test.ts (COGS).
// No beforeEach cleanup: each test creates accounts with unique codes so
// accumulation across runs is harmless (no conflict risk). The prior cleanup
// introduced a race where it could delete accounts getOrCreateTaxAccount had
// just inserted but not yet referenced in journal_lines.
// -----------------------------------------------------------------------------
const ids = createPostingIdGenerator("JNL");

// -----------------------------------------------------------------------------
// Mock executor for posting
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
        SALES_RETURNS: salesRevenueAccountId,
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
        if (info) result.set(id, info);
      }
      return result;
    },
  };
}

// -----------------------------------------------------------------------------
// GAP HELPER: ensure tax account exists for company.
// Fully robust: fetch-first pattern handles all race/re-run scenarios.
// - beforeEach cleanup is removed (accounts use unique codes per call, accumulation is safe)
// - fetch-first avoids relying on cleanup timing or INSERT success
// GAP: No canonical account fixture exists in the platform package yet.
// -----------------------------------------------------------------------------
async function getOrCreateTaxAccount(
  db: KyselySchema,
  companyId: number,
  name: string
): Promise<number> {
  const code = ids.nextCode("SKT-IMMUT");

  // Ensure LIABILITY account_type exists for this company
  await sql`
    INSERT IGNORE INTO account_types (company_id, name, category, normal_balance)
    VALUES (${companyId}, 'LIABILITY', 'LIABILITY', 'C')
  `.execute(db);

  const typeRow = await sql`
    SELECT id FROM account_types WHERE company_id = ${companyId} AND name = 'LIABILITY' LIMIT 1
  `.execute(db);
  const accountTypeId = Number((typeRow.rows[0] as { id: number }).id);

  // Fetch-first: check if already exists before inserting
  const existing = await sql`
    SELECT id FROM accounts WHERE company_id = ${companyId} AND code = ${code} LIMIT 1
  `.execute(db);
  if (existing.rows[0]) {
    return Number((existing.rows[0] as { id: number }).id);
  }

  // Not found — insert with ignore as safety net for concurrent creation
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
    // Concurrent insert — another caller got it first; proceed to fetch
  }

  const row = await sql`
    SELECT id FROM accounts WHERE company_id = ${companyId} AND code = ${code} LIMIT 1
  `.execute(db);
  if (!row.rows[0]) throw new Error(`Tax account not found after insert: ${code}`);
  return Number((row.rows[0] as { id: number }).id);
}

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
// Describe block — creates a unique company+outlet once, reused by all tests
// -----------------------------------------------------------------------------
describe("JournalImmutability", () => {
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

    ctx = {
      companyId: company.id,
      outletId: outlet.id,
      canonicalTaxRateId,
    };
  });

  // No beforeEach cleanup: accounts use unique codes per call (SKT-IMMUT-<salt>-<id>).
  // Accumulation across runs is safe — no code collision with current or future runs.
  // Removed prior cleanup that raced with getOrCreateTaxAccount (deleted accounts that
  // had been inserted but not yet referenced in journal_lines).

  function makeInvoiceData(overrides: Partial<SalesInvoicePostingData> = {}): SalesInvoicePostingData {
    return {
      id: ids.nextId(),
      company_id: ctx.companyId,
      outlet_id: ctx.outletId,
      invoice_no: ids.nextCode("INV-IMMUT"),
      credit_note_no: ids.nextCode("CN-IMMUT"),
      invoice_date: FIXED_INVOICE_DATE,
      subtotal: 50_000,
      grand_total: 55_000,
      taxes: [{ tax_rate_id: ctx.canonicalTaxRateId, amount: 5_000 }],
      updated_at: FIXED_UPDATED_AT,
      ...overrides,
    };
  }

  function makeCreditNoteData(overrides: Partial<SalesCreditNotePostingData> = {}): SalesCreditNotePostingData {
    return {
      id: ids.nextId(),
      company_id: ctx.companyId,
      outlet_id: ctx.outletId,
      invoice_id: ids.nextId(),
      credit_note_no: ids.nextCode("CN-IMMUT"),
      credit_note_date: FIXED_CN_DATE,
      amount: 10_000,
      updated_at: FIXED_CN_UPDATED_AT,
      ...overrides,
    };
  }

  it("journal_batches cannot be updated via direct SQL", async () => {
    const mappings = await ensureSalesOutletMappings(db, {
      companyId: ctx.companyId,
      outletId: ctx.outletId,
    });

    const taxAccountId = await getOrCreateTaxAccount(db, ctx.companyId, "Test Tax Imm Batch Upd");

    const taxAccounts = new Map<number, { account_id: number | null; code: string }>();
    taxAccounts.set(ctx.canonicalTaxRateId, { account_id: taxAccountId, code: "TAX11" });

    const executor = createMockExecutor(mappings.arAccountId, mappings.salesRevenueAccountId, taxAccounts);

    const invoice = makeInvoiceData({ id: ids.nextId() });
    const result = await postSalesInvoice(db, executor, invoice);
    const batchId = result.journal_batch_id;

    // Attempt direct UPDATE on journal_batches
    const updateError = await sql`
      UPDATE journal_batches
      SET doc_type = 'HACKED', updated_at = NOW()
      WHERE id = ${batchId}
    `.execute(db).then(() => null).catch((e: unknown) => e as Error);

    // Expect the trigger to reject the update
    expect(updateError).not.toBeNull();
    const errorMsg = updateError!.message.toLowerCase();
    expect(
      errorMsg.includes("immut") ||
      errorMsg.includes("cannot modify") ||
      errorMsg.includes("cannot update") ||
      errorMsg.includes("trigger")
    ).toBe(true);
  });

  it("journal_batches cannot be deleted via direct SQL", async () => {
    const mappings = await ensureSalesOutletMappings(db, {
      companyId: ctx.companyId,
      outletId: ctx.outletId,
    });

    const taxAccountId = await getOrCreateTaxAccount(db, ctx.companyId, "Test Tax Imm Batch Del");

    const taxAccounts = new Map<number, { account_id: number | null; code: string }>();
    taxAccounts.set(ctx.canonicalTaxRateId, { account_id: taxAccountId, code: "TAX11" });

    const executor = createMockExecutor(mappings.arAccountId, mappings.salesRevenueAccountId, taxAccounts);

    const invoice = makeInvoiceData({ id: ids.nextId() });
    const result = await postSalesInvoice(db, executor, invoice);
    const batchId = result.journal_batch_id;

    // Attempt direct DELETE on journal_batches
    const deleteError = await sql`
      DELETE FROM journal_batches WHERE id = ${batchId}
    `.execute(db).then(() => null).catch((e: unknown) => e as Error);

    expect(deleteError).not.toBeNull();
    const errorMsg = deleteError!.message.toLowerCase();
    expect(
      errorMsg.includes("immut") ||
      errorMsg.includes("cannot delete") ||
      errorMsg.includes("trigger")
    ).toBe(true);
  });

  it("journal_lines cannot be updated via direct SQL", async () => {
    const mappings = await ensureSalesOutletMappings(db, {
      companyId: ctx.companyId,
      outletId: ctx.outletId,
    });

    const executor = createMockExecutor(mappings.arAccountId, mappings.salesRevenueAccountId, new Map());

    const invoice = makeInvoiceData({ id: ids.nextId(), subtotal: 75_000, grand_total: 75_000, taxes: [] });
    const result = await postSalesInvoice(db, executor, invoice);

    // Attempt UPDATE on journal_lines
    const updateError = await sql`
      UPDATE journal_lines
      SET debit = 999999, credit = 0
      WHERE journal_batch_id = ${result.journal_batch_id}
      LIMIT 1
    `.execute(db).then(() => null).catch((e: unknown) => e as Error);

    expect(updateError).not.toBeNull();
    const errorMsg = updateError!.message.toLowerCase();
    expect(
      errorMsg.includes("immut") ||
      errorMsg.includes("cannot modify") ||
      errorMsg.includes("cannot update") ||
      errorMsg.includes("trigger")
    ).toBe(true);
  });

  it("journal_lines cannot be deleted via direct SQL", async () => {
    const mappings = await ensureSalesOutletMappings(db, {
      companyId: ctx.companyId,
      outletId: ctx.outletId,
    });

    const executor = createMockExecutor(mappings.arAccountId, mappings.salesRevenueAccountId, new Map());

    const invoice = makeInvoiceData({ id: ids.nextId(), subtotal: 75_000, grand_total: 75_000, taxes: [] });
    const result = await postSalesInvoice(db, executor, invoice);

    // Attempt DELETE on journal_lines
    const deleteError = await sql`
      DELETE FROM journal_lines WHERE journal_batch_id = ${result.journal_batch_id} LIMIT 1
    `.execute(db).then(() => null).catch((e: unknown) => e as Error);

    expect(deleteError).not.toBeNull();
    const errorMsg = deleteError!.message.toLowerCase();
    expect(
      errorMsg.includes("immut") ||
      errorMsg.includes("cannot delete") ||
      errorMsg.includes("trigger")
    ).toBe(true);
  });

  it("void creates new batch, does not mutate original", async () => {
    const mappings = await ensureSalesOutletMappings(db, {
      companyId: ctx.companyId,
      outletId: ctx.outletId,
    });

    const executor = createMockExecutor(mappings.arAccountId, mappings.salesRevenueAccountId, new Map());

    const creditNote = makeCreditNoteData({ id: ids.nextId() });

    // Post original CN
    const originalResult = await postCreditNote(db, executor, creditNote);

    // Capture original line snapshot
    const originalLinesBefore = await sql`
      SELECT account_id, debit, credit, line_date
      FROM journal_lines
      WHERE journal_batch_id = ${originalResult.journal_batch_id}
    `.execute(db);

    const originalRowCount = originalLinesBefore.rows.length;
    // Guard rows access with length assertion
    expect(originalRowCount).toBeGreaterThanOrEqual(2);
    const origFirstRow = originalLinesBefore.rows[0] as { account_id: number; debit: string; credit: string };
    const origSecondRow = originalLinesBefore.rows[1] as { account_id: number; debit: string; credit: string };
    const originalFirstLine = {
      account_id: Number(origFirstRow.account_id),
      debit: Number(origFirstRow.debit),
      credit: Number(origFirstRow.credit),
    };

    // Void it — creates a NEW batch
    const voidResult = await voidCreditNote(db, executor, creditNote);
    expect(voidResult.journal_batch_id).not.toBe(originalResult.journal_batch_id);

    // Assert: original batch unchanged
    const originalLinesAfter = await sql`
      SELECT account_id, debit, credit, line_date
      FROM journal_lines
      WHERE journal_batch_id = ${originalResult.journal_batch_id}
    `.execute(db);

    expect(originalLinesAfter.rows).toHaveLength(originalRowCount);
    // Guard rows access with length assertion
    expect(originalLinesAfter.rows.length).toBeGreaterThanOrEqual(2);
    const afterFirstRow = originalLinesAfter.rows[0] as { account_id: number; debit: string; credit: string };
    const afterSecondRow = originalLinesAfter.rows[1] as { account_id: number; debit: string; credit: string };
    const afterFirstLine = {
      account_id: Number(afterFirstRow.account_id),
      debit: Number(afterFirstRow.debit),
      credit: Number(afterFirstRow.credit),
    };

    expect(afterFirstLine).toEqual(originalFirstLine);

    // Assert: void batch has correct entries (reversed)
    const voidLines = await sql`
      SELECT account_id, debit, credit
      FROM journal_lines
      WHERE journal_batch_id = ${voidResult.journal_batch_id}
    `.execute(db);

    expect(voidLines.rows.length).toBe(2);

    // Find AR line in void (should be debit in reversal)
    const voidArLine = voidLines.rows.find(
      r => Number((r as { account_id: number }).account_id) === mappings.arAccountId
    ) as { debit: string } | undefined;
    expect(voidArLine).toBeDefined();
    expect(Number(voidArLine!.debit)).toBe(creditNote.amount);
  });

  it("original journal_batches row content unchanged after multiple void/post operations", async () => {
    const mappings = await ensureSalesOutletMappings(db, {
      companyId: ctx.companyId,
      outletId: ctx.outletId,
    });

    const executor = createMockExecutor(mappings.arAccountId, mappings.salesRevenueAccountId, new Map());

    const creditNote = makeCreditNoteData({ id: ids.nextId() });

    // Post original
    const originalResult = await postCreditNote(db, executor, creditNote);

    // Void
    await voidCreditNote(db, executor, creditNote);

    // Void again (create another reversal)
    const voidResult2 = await voidCreditNote(db, executor, { ...creditNote, id: creditNote.id + 1 });
    expect(voidResult2.journal_batch_id).not.toBe(originalResult.journal_batch_id);

    // Verify original batch is intact
    const originalBatch = await sql`
      SELECT doc_type, doc_id, company_id, outlet_id
      FROM journal_batches
      WHERE id = ${originalResult.journal_batch_id}
    `.execute(db);

    expect(originalBatch.rows).toHaveLength(1);
    expect((originalBatch.rows[0] as { doc_type: string }).doc_type).toBe("SALES_CREDIT_NOTE");
    expect((originalBatch.rows[0] as { doc_id: number }).doc_id).toBe(creditNote.id);
  });
});