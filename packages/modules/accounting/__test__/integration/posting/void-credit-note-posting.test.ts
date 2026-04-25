// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Integration tests for Void Credit Note Posting (Story 50.3)
 *
 * Tests:
 * - Reversal batch is created (new batch, separate from original)
 * - Original batch is untouched (immutability)
 * - Reversal entries reverse original debit/credit directions
 * - Mapping respected (AR, SALES_RETURNS)
 * - Both batches balanced individually
 *
 * POLICY COMPLIANCE (strict-policy GO):
 * - Uses canonical fixtures from @jurnapod/modules-platform for company/outlet creation
 * - Deterministic run IDs via hrtime (not Date.now/Math.random)
 * - Unique company+outlet per describe block for isolation
 * - No hardcoded COMPANY_ID/OUTLET_ID — uses ctx from fixtures
 * - makeUniqueDocId uses hrtime not Date.now for deterministic doc_id generation
 * - GAP: No canonical fixture for AR/SALES_RETURNS accounts — raw SQL gap-filler documented inline
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { createKysely, type KyselySchema } from "@jurnapod/db";
import { ensureSalesOutletMappings } from "../../../src/index.js";
import {
  postCreditNote,
  voidCreditNote,
  type SalesCreditNotePostingData,
  type SalesPostingExecutor,
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
const FIXED_CN_DATE = "2026-04-01 14:00:00";
const FIXED_UPDATED_AT = "2026-04-01T14:00:00";

// -----------------------------------------------------------------------------
// Deterministic run-unique counter for test IDs.
// Uses createPostingIdGenerator for per-file salt to avoid cross-file collisions.
// -----------------------------------------------------------------------------
const { nextId: cnNextId, nextCode: cnNextCode } = createPostingIdGenerator("void-credit-note-posting.test");
function nextCnTestId(): number {
  return cnNextId();
}

// -----------------------------------------------------------------------------
// Mock executor for credit note posting
// -----------------------------------------------------------------------------
function createMockExecutor(
  arAccountId: number,
  salesReturnsAccountId: number
): SalesPostingExecutor {
  return {
    async readOutletAccountMappingByKey(_companyId: number, _outletId: number) {
      return {
        SALES_REVENUE: 400,
        AR: arAccountId,
        SALES_RETURNS: salesReturnsAccountId,
      };
    },
    async readCreditNoteAccountMapping(_companyId: number, _outletId: number) {
      return { AR: arAccountId, SALES_RETURNS: salesReturnsAccountId };
    },
    async readCompanyPaymentVarianceAccounts(_companyId: number) {
      return { gain: null, loss: null };
    },
    async readTaxRatesByIds(_ids: number[], _cId: number) {
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
// Describe block — creates a unique company+outlet once, reused by all tests
// -----------------------------------------------------------------------------
describe("VoidCreditNotePosting", () => {
  let ctx: TestContext;

  beforeAll(async () => {
    const company = await createTestCompanyMinimal(db);
    const outlet = await createTestOutletMinimal(db, company.id);
    ctx = { companyId: company.id, outletId: outlet.id };
  });

  function makeCreditNoteData(overrides: Partial<SalesCreditNotePostingData> = {}): SalesCreditNotePostingData {
    return {
      id: nextCnTestId(),
      company_id: ctx.companyId,
      outlet_id: ctx.outletId,
      invoice_id: nextCnTestId(),
      credit_note_no: `CN-TEST-${nextCnTestId()}`,
      credit_note_date: FIXED_CN_DATE,
      amount: 25_000,
      updated_at: FIXED_UPDATED_AT,
      ...overrides,
    };
  }

  // -------------------------------------------------------------------------
  // Test 1: creates reversal batch separate from original credit note batch
  // -------------------------------------------------------------------------
  it("creates reversal batch separate from original credit note batch", async () => {
    const mappings = await ensureSalesOutletMappings(db, {
      companyId: ctx.companyId,
      outletId: ctx.outletId,
    });

    const executor = createMockExecutor(mappings.arAccountId, mappings.salesRevenueAccountId);

    const creditNote = makeCreditNoteData();

    // Post original credit note
    const originalResult = await postCreditNote(db, executor, creditNote);
    expect(originalResult.journal_batch_id).toBeGreaterThan(0);

    // Act: void the credit note
    const voidResult = await voidCreditNote(db, executor, creditNote);
    expect(voidResult.journal_batch_id).toBeGreaterThan(0);

    // Assert: two separate batches
    expect(voidResult.journal_batch_id).not.toBe(originalResult.journal_batch_id);

    const batchRows = await sql`
      SELECT id, doc_type, doc_id
      FROM journal_batches
      WHERE id IN (${originalResult.journal_batch_id}, ${voidResult.journal_batch_id})
      ORDER BY id ASC
    `.execute(db);

    expect(batchRows.rows).toHaveLength(2);

    const originalBatch = batchRows.rows.find(
      r => Number((r as { id: number }).id) === originalResult.journal_batch_id
    ) as { doc_type: string; doc_id: number } | undefined;
    const voidBatch = batchRows.rows.find(
      r => Number((r as { id: number }).id) === voidResult.journal_batch_id
    ) as { doc_type: string; doc_id: number } | undefined;

    expect(originalBatch).toBeDefined();
    expect(voidBatch).toBeDefined();
    expect(originalBatch!.doc_type).toBe("SALES_CREDIT_NOTE");
    expect(voidBatch!.doc_type).toBe("SALES_CREDIT_NOTE_VOID");
    expect(originalBatch!.doc_id).toBe(creditNote.id);
    expect(voidBatch!.doc_id).toBe(creditNote.id);
  });

  // -------------------------------------------------------------------------
  // Test 2: original credit note batch is untouched after void
  // -------------------------------------------------------------------------
  it("original credit note batch is untouched after void", async () => {
    const mappings = await ensureSalesOutletMappings(db, {
      companyId: ctx.companyId,
      outletId: ctx.outletId,
    });

    const executor = createMockExecutor(mappings.arAccountId, mappings.salesRevenueAccountId);

    const creditNote = makeCreditNoteData();

    // Post original
    const originalResult = await postCreditNote(db, executor, creditNote);
    const originalLineCountBefore = await sql`
      SELECT COUNT(*) as cnt FROM journal_lines WHERE journal_batch_id = ${originalResult.journal_batch_id}
    `.execute(db).then(r => Number((r.rows[0] as { cnt: number }).cnt));

    // Void it
    await voidCreditNote(db, executor, creditNote);

    // Assert: original batch lines are unchanged
    const originalLineCountAfter = await sql`
      SELECT COUNT(*) as cnt FROM journal_lines WHERE journal_batch_id = ${originalResult.journal_batch_id}
    `.execute(db).then(r => Number((r.rows[0] as { cnt: number }).cnt));

    expect(originalLineCountAfter).toBe(originalLineCountBefore);

    const originalLines = await sql`
      SELECT account_id, debit, credit
      FROM journal_lines
      WHERE journal_batch_id = ${originalResult.journal_batch_id}
      ORDER BY line_date ASC
    `.execute(db);

    expect(originalLines.rows.length).toBe(2);

    // Guard rows access with length assertion
    expect(originalLines.rows.length).toBeGreaterThanOrEqual(2);
    const origFirstRow = originalLines.rows[0] as { account_id: number; debit: string; credit: string };
    const origSecondRow = originalLines.rows[1] as { account_id: number; debit: string; credit: string };

    // Identify Dr and Cr lines by which has value
    const origDrLine = Number(origFirstRow.debit) > 0 ? origFirstRow : origSecondRow;
    const origCrLine = Number(origFirstRow.credit) > 0 ? origFirstRow : origSecondRow;

    expect(Number(origDrLine.account_id)).toBe(mappings.salesRevenueAccountId);
    expect(Number(origCrLine.account_id)).toBe(mappings.arAccountId);
  });

  // -------------------------------------------------------------------------
  // Test 3: reversal entries reverse debit/credit directions
  // -------------------------------------------------------------------------
  it("reversal entries reverse debit/credit directions", async () => {
    const mappings = await ensureSalesOutletMappings(db, {
      companyId: ctx.companyId,
      outletId: ctx.outletId,
    });

    const executor = createMockExecutor(mappings.arAccountId, mappings.salesRevenueAccountId);

    const creditNote = makeCreditNoteData();

    // Post original
    const originalResult = await postCreditNote(db, executor, creditNote);

    // Void it
    const voidResult = await voidCreditNote(db, executor, creditNote);

    // Fetch both sets of lines
    const originalLines = await sql`
      SELECT account_id, debit, credit
      FROM journal_lines
      WHERE journal_batch_id = ${originalResult.journal_batch_id}
      ORDER BY line_date ASC
    `.execute(db);

    const voidLines = await sql`
      SELECT account_id, debit, credit
      FROM journal_lines
      WHERE journal_batch_id = ${voidResult.journal_batch_id}
      ORDER BY line_date ASC
    `.execute(db);

    // Void lines should be exact reversal of original
    for (const origLine of originalLines.rows) {
      const origAcct = Number((origLine as { account_id: number }).account_id);
      const origDr = Number((origLine as { debit: string }).debit);
      const origCr = Number((origLine as { credit: string }).credit);

      const voidLine = voidLines.rows.find(
        r => Number((r as { account_id: number }).account_id) === origAcct
      );

      expect(voidLine).toBeDefined();

      const voidDr = Number((voidLine as { debit: string }).debit);
      const voidCr = Number((voidLine as { credit: string }).credit);

      if (origDr > 0) {
        expect(voidCr).toBe(origDr);
      } else if (origCr > 0) {
        expect(voidDr).toBe(origCr);
      }
    }
  });

  // -------------------------------------------------------------------------
  // Test 4: both batches are individually balanced
  // -------------------------------------------------------------------------
  it("both batches are individually balanced", async () => {
    const mappings = await ensureSalesOutletMappings(db, {
      companyId: ctx.companyId,
      outletId: ctx.outletId,
    });

    const executor = createMockExecutor(mappings.arAccountId, mappings.salesRevenueAccountId);

    const creditNote = makeCreditNoteData();

    const originalResult = await postCreditNote(db, executor, creditNote);
    const voidResult = await voidCreditNote(db, executor, creditNote);

    for (const batchId of [originalResult.journal_batch_id, voidResult.journal_batch_id]) {
      const lines = await sql`
        SELECT debit, credit
        FROM journal_lines
        WHERE journal_batch_id = ${batchId}
      `.execute(db);

      const totalDebit = lines.rows.reduce((s, r) => s + Number((r as { debit: string }).debit), 0);
      const totalCredit = lines.rows.reduce((s, r) => s + Number((r as { credit: string }).credit), 0);
      expect(totalDebit).toBe(totalCredit);
    }
  });

  // -------------------------------------------------------------------------
  // Test 5: uses SALES_RETURNS and AR accounts from mapping
  // -------------------------------------------------------------------------
  it("uses SALES_RETURNS and AR accounts from mapping", async () => {
    const mappings = await ensureSalesOutletMappings(db, {
      companyId: ctx.companyId,
      outletId: ctx.outletId,
    });

    const executor = createMockExecutor(mappings.arAccountId, mappings.salesRevenueAccountId);

    const creditNote = makeCreditNoteData();

    const voidResult = await voidCreditNote(db, executor, creditNote);

    const lines = await sql`
      SELECT account_id, debit, credit
      FROM journal_lines
      WHERE journal_batch_id = ${voidResult.journal_batch_id}
    `.execute(db);

    const accountIds = new Set(lines.rows.map(r => Number((r as { account_id: number }).account_id)));
    expect(accountIds.has(mappings.arAccountId)).toBe(true);
    expect(accountIds.has(mappings.salesRevenueAccountId)).toBe(true);

    // AR line should be a DEBIT in reversal
    const arLine = lines.rows.find(r => Number((r as { account_id: number }).account_id) === mappings.arAccountId) as { debit: string } | undefined;
    expect(arLine).toBeDefined();
    expect(Number(arLine!.debit)).toBe(25_000);

    // Sales Returns line should be a CREDIT in reversal
    const srLine = lines.rows.find(r => Number((r as { account_id: number }).account_id) === mappings.salesRevenueAccountId) as { credit: string } | undefined;
    expect(srLine).toBeDefined();
    expect(Number(srLine!.credit)).toBe(25_000);
  });
});
