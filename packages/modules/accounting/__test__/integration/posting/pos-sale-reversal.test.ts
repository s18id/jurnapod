// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Integration tests for POS_SALE reversal journal correctness (Story 59.8).
 *
 * Tests:
 *   - VOID reversal: creates POS_SALE_REVERSAL batch with balanced lines
 *   - REFUND reversal: creates POS_SALE_REVERSAL batch with balanced lines
 *   - Original journal immutability: original lines unchanged after reversal
 *   - Reversal balance: total debit === total credit
 *   - Linkage tags: REV:VOID/REFUND|OB:|OT:|CT:|CTX: present
 *   - No-op when no POS_SALE journal exists (returns null)
 *   - Deduplication: second reversal attempt returns no-op
 *
 * POLICY COMPLIANCE:
 *   - Real database only (no mocking)
 *   - Uses canonical fixtures from owner packages
 *   - Deterministic test data (fixed timestamps, no Date.now/Math.random)
 *   - Partial fixture mode for journal setup (tables owned by accounting package)
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { createKysely, type KyselySchema } from "@jurnapod/db";
import { createTestCompanyMinimal, createTestOutletMinimal } from "@jurnapod/modules-platform";
import {
  createPosSaleReversalJournalsForCorrection,
  type PosSaleReversalParams,
} from "../../../src/posting/sync-push.js";
import { createPosSaleJournalFixture } from "../../../src/test-fixtures/pos-sale-journal-fixtures.js";
import { createTestAccount } from "../../../src/test-fixtures/account-fixtures.js";
import { createPostingIdGenerator } from "./id-utils.js";

// =============================================================================
// Test Context
// =============================================================================

interface TestContext {
  companyId: number;
  outletId: number;
  arAccountId: number;
  revenueAccountId: number;
}

// =============================================================================
// Deterministic IDs
// =============================================================================
const ids = createPostingIdGenerator("PSR");

// =============================================================================
// Fixed timestamps
// =============================================================================
const ORIGINAL_POSTED_AT = "2026-05-01 10:00:00";
const CORRECTION_POSTED_AT = "2026-05-02 12:00:00";
const LINE_DATE = "2026-05-01";

// =============================================================================
// Database setup/teardown
// =============================================================================
let db: KyselySchema;

beforeAll(async () => {
  db = createKysely({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USER ?? "root",
    password: process.env.DB_PASSWORD ?? "",
    database: process.env.DB_NAME ?? "jurnapod_test",
  });

  // Seed account_types if empty
  const typeCount = await sql`
    SELECT COUNT(*) as cnt FROM account_types
  `.execute(db).then(r => Number((r.rows[0] as { cnt: number }).cnt));

  if (typeCount === 0) {
    await sql`
      INSERT IGNORE INTO account_types (id, name) VALUES
        (1, 'ASSET'),
        (2, 'EXPENSE'),
        (3, 'LIABILITY'),
        (4, 'INCOME')
    `.execute(db);
  }
});

afterAll(async () => {
  await db.destroy();
});

// =============================================================================
// Fixture Setup Helpers
// =============================================================================

async function createTestAccounts(ctx: TestContext): Promise<void> {
  // Create AR account (ASSET, normal balance DEBIT)
  const ar = await createTestAccount(db, {
    companyId: ctx.companyId,
    code: "AR-" + ids.nextId(),
    name: "Accounts Receivable Test",
    typeName: "ASSET",
  });
  ctx.arAccountId = ar.id;

  // Create SALES_REVENUE account (INCOME, normal balance CREDIT)
  const rev = await createTestAccount(db, {
    companyId: ctx.companyId,
    code: "REV-" + ids.nextId(),
    name: "Sales Revenue Test",
    typeName: "REVENUE",
  });
  ctx.revenueAccountId = rev.id;
}

async function createPosSaleBatch(
  ctx: TestContext,
  posTransactionId: number,
  overrides?: { debitAmount?: number; creditAmount?: number }
): Promise<number> {
  const debitAmount = overrides?.debitAmount ?? 100.00;
  const creditAmount = overrides?.creditAmount ?? 100.00;

  const fixture = await createPosSaleJournalFixture({
    db,
    companyId: ctx.companyId,
    outletId: ctx.outletId,
    posTransactionId,
    postedAt: ORIGINAL_POSTED_AT,
    lineDate: LINE_DATE,
    lineEntries: [
      {
        accountId: ctx.arAccountId,
        debit: debitAmount,
        credit: 0,
        description: "POS AR receipt",
      },
      {
        accountId: ctx.revenueAccountId,
        debit: 0,
        credit: creditAmount,
        description: "POS sales revenue",
      },
    ],
  });
  return fixture.batchId;
}

async function createTestContext(): Promise<TestContext> {
  const company = await createTestCompanyMinimal(db);
  const outlet = await createTestOutletMinimal(db, company.id);
  const ctx: TestContext = {
    companyId: company.id,
    outletId: outlet.id,
    arAccountId: 0,
    revenueAccountId: 0,
  };
  await createTestAccounts(ctx);
  return ctx;
}

async function assertBatchExists(
  docType: string,
  docId: number,
  companyId: number,
  outletId: number
): Promise<number> {
  const result = await sql<{ id: number }>`
    SELECT id FROM journal_batches
    WHERE company_id = ${companyId}
      AND outlet_id = ${outletId}
      AND doc_type = ${docType}
      AND doc_id = ${docId}
    ORDER BY id ASC
  `.execute(db);

  return result.rows.length > 0 ? Number(result.rows[0].id) : 0;
}

async function assertLinesBalanced(batchId: number): Promise<{ totalDebit: number; totalCredit: number }> {
  const result = await sql<{ total_debit: string; total_credit: string }>`
    SELECT
      COALESCE(SUM(debit), 0) as total_debit,
      COALESCE(SUM(credit), 0) as total_credit
    FROM journal_lines
    WHERE journal_batch_id = ${batchId}
  `.execute(db);

  const totalDebit = Number(result.rows[0].total_debit);
  const totalCredit = Number(result.rows[0].total_credit);
  return { totalDebit, totalCredit };
}

async function getLinesForBatch(batchId: number): Promise<
  Array<{ account_id: number; debit: number; credit: number; description: string }>
> {
  const result = await sql<{
    account_id: number;
    debit: string | number;
    credit: string | number;
    description: string;
  }>`
    SELECT account_id, debit, credit, description
    FROM journal_lines
    WHERE journal_batch_id = ${batchId}
      AND company_id IS NOT NULL
    ORDER BY id ASC
  `.execute(db);

  return result.rows.map((r) => ({
    account_id: Number(r.account_id),
    debit: Number(r.debit),
    credit: Number(r.credit),
    description: String(r.description),
  }));
}

// =============================================================================
// Test Cases
// =============================================================================

describe("POS_SALE Reversal Journal Correctness (Story 59.8)", () => {
  describe("VOID reversal", () => {
    let ctx: TestContext;

    beforeAll(async () => {
      ctx = await createTestContext();
    });

    it("creates POS_SALE_REVERSAL batch with balanced lines", async () => {
      const originalTxId = ids.nextId();
      const correctionTxId = ids.nextId();
      const originalBatchId = await createPosSaleBatch(ctx, originalTxId);

      const params: PosSaleReversalParams = {
        companyId: ctx.companyId,
        outletId: ctx.outletId,
        status: "VOID",
        originalPosTransactionId: originalTxId,
        correctionPosTransactionId: correctionTxId,
        correctionPostedAt: CORRECTION_POSTED_AT,
        clientTxId: "test-void-" + ids.nextId(),
      };

      const result = await createPosSaleReversalJournalsForCorrection(db, params);
      expect(result).not.toBeNull();
      expect(result!.reversalBatchId).toBeGreaterThan(0);

      // Verify batch exists
      const batchId = await assertBatchExists(
        "POS_SALE_REVERSAL",
        originalTxId,
        ctx.companyId,
        ctx.outletId
      );
      expect(batchId).toBe(result!.reversalBatchId);

      // Verify balance
      const { totalDebit, totalCredit } = await assertLinesBalanced(batchId);
      expect(totalDebit).toBe(totalCredit);
      expect(totalDebit).toBeGreaterThan(0);

      // Verify lines have swapped debit/credit
      const reversalLines = await getLinesForBatch(batchId);
      expect(reversalLines.length).toBe(2);

      // AR line: original debit=100, reversal credit=100
      const arLine = reversalLines.find((l) => l.account_id === ctx.arAccountId);
      expect(arLine).toBeDefined();
      expect(arLine!.debit).toBe(0);
      expect(arLine!.credit).toBe(100);

      // Revenue line: original credit=100, reversal debit=100
      const revLine = reversalLines.find((l) => l.account_id === ctx.revenueAccountId);
      expect(revLine).toBeDefined();
      expect(revLine!.debit).toBe(100);
      expect(revLine!.credit).toBe(0);
    });

    it("has correct linkage tags in reversal lines", async () => {
      const originalTxId = ids.nextId();
      const correctionTxId = ids.nextId();
      const clientTxId = "test-linkage-" + ids.nextId();
      await createPosSaleBatch(ctx, originalTxId);

      const params: PosSaleReversalParams = {
        companyId: ctx.companyId,
        outletId: ctx.outletId,
        status: "VOID",
        originalPosTransactionId: originalTxId,
        correctionPosTransactionId: correctionTxId,
        correctionPostedAt: CORRECTION_POSTED_AT,
        clientTxId,
      };

      const result = await createPosSaleReversalJournalsForCorrection(db, params);
      expect(result).not.toBeNull();

      const reversalLines = await getLinesForBatch(result!.reversalBatchId);
      for (const line of reversalLines) {
        expect(line.description).toMatch(
          /^\[REV:VOID\|OB:\d+\|OT:\d+\|CT:\d+\|CTX:.+\]$/
        );
        expect(line.description).toContain(`REV:VOID`);
        expect(line.description).toContain(`OT:${originalTxId}`);
        expect(line.description).toContain(`CT:${correctionTxId}`);
        expect(line.description).toContain(`CTX:${clientTxId}`);
      }
    });

    it("does not modify original POS_SALE journal lines", async () => {
      const originalTxId = ids.nextId();
      const correctionTxId = ids.nextId();
      const originalBatchId = await createPosSaleBatch(ctx, originalTxId);

      // Snapshot original lines before reversal
      const originalLines = await getLinesForBatch(originalBatchId);

      const params: PosSaleReversalParams = {
        companyId: ctx.companyId,
        outletId: ctx.outletId,
        status: "VOID",
        originalPosTransactionId: originalTxId,
        correctionPosTransactionId: correctionTxId,
        correctionPostedAt: CORRECTION_POSTED_AT,
        clientTxId: "test-immut-" + ids.nextId(),
      };

      await createPosSaleReversalJournalsForCorrection(db, params);

      // Verify original lines unchanged
      const afterLines = await getLinesForBatch(originalBatchId);
      expect(afterLines.length).toBe(originalLines.length);
      for (let i = 0; i < originalLines.length; i++) {
        expect(afterLines[i].debit).toBe(originalLines[i].debit);
        expect(afterLines[i].credit).toBe(originalLines[i].credit);
      }
    });
  });

  describe("REFUND reversal", () => {
    let ctx: TestContext;

    beforeAll(async () => {
      ctx = await createTestContext();
    });

    it("creates POS_SALE_REVERSAL batch with REFUND linkage tag", async () => {
      const originalTxId = ids.nextId();
      const correctionTxId = ids.nextId();
      const clientTxId = "test-refund-" + ids.nextId();
      await createPosSaleBatch(ctx, originalTxId);

      const params: PosSaleReversalParams = {
        companyId: ctx.companyId,
        outletId: ctx.outletId,
        status: "REFUND",
        originalPosTransactionId: originalTxId,
        correctionPosTransactionId: correctionTxId,
        correctionPostedAt: CORRECTION_POSTED_AT,
        clientTxId,
      };

      const result = await createPosSaleReversalJournalsForCorrection(db, params);
      expect(result).not.toBeNull();
      expect(result!.reversalBatchId).toBeGreaterThan(0);

      // Verify REFUND in linkage tag
      const reversalLines = await getLinesForBatch(result!.reversalBatchId);
      for (const line of reversalLines) {
        expect(line.description).toContain("REV:REFUND");
      }

      // Verify balance
      const { totalDebit, totalCredit } = await assertLinesBalanced(result!.reversalBatchId);
      expect(totalDebit).toBe(totalCredit);
    });
  });

  describe("edge cases", () => {
    let ctx: TestContext;

    beforeAll(async () => {
      ctx = await createTestContext();
    });

    it("returns null when no POS_SALE journal exists", async () => {
      const nonExistentTxId = ids.nextId();

      const params: PosSaleReversalParams = {
        companyId: ctx.companyId,
        outletId: ctx.outletId,
        status: "VOID",
        originalPosTransactionId: nonExistentTxId,
        correctionPosTransactionId: ids.nextId(),
        correctionPostedAt: CORRECTION_POSTED_AT,
        clientTxId: "test-noop-" + ids.nextId(),
      };

      const result = await createPosSaleReversalJournalsForCorrection(db, params);
      expect(result).toBeNull();

      // Verify no POS_SALE_REVERSAL batch was created
      const batchId = await assertBatchExists(
        "POS_SALE_REVERSAL",
        nonExistentTxId,
        ctx.companyId,
        ctx.outletId
      );
      expect(batchId).toBe(0);
    });

    it("deduplication: second call returns existing batch", async () => {
      const originalTxId = ids.nextId();
      const correctionTxId = ids.nextId();
      const clientTxId = "test-dedup-" + ids.nextId();
      await createPosSaleBatch(ctx, originalTxId);

      const params: PosSaleReversalParams = {
        companyId: ctx.companyId,
        outletId: ctx.outletId,
        status: "VOID",
        originalPosTransactionId: originalTxId,
        correctionPosTransactionId: correctionTxId,
        correctionPostedAt: CORRECTION_POSTED_AT,
        clientTxId,
      };

      // First call
      const result1 = await createPosSaleReversalJournalsForCorrection(db, params);
      expect(result1).not.toBeNull();

      // Second call (retry)
      const result2 = await createPosSaleReversalJournalsForCorrection(db, params);
      expect(result2).not.toBeNull();
      expect(result2!.reversalBatchId).toBe(result1!.reversalBatchId);

      // Verify only one POS_SALE_REVERSAL batch exists
      const count = await sql<{ cnt: number }>`
        SELECT COUNT(*) as cnt FROM journal_batches
        WHERE company_id = ${ctx.companyId}
          AND outlet_id = ${ctx.outletId}
          AND doc_type = 'POS_SALE_REVERSAL'
          AND doc_id = ${originalTxId}
      `.execute(db);
      expect(Number(count.rows[0].cnt)).toBe(1);
    });
  });

  describe("reversal integrity", () => {
    let ctx: TestContext;

    beforeAll(async () => {
      ctx = await createTestContext();
    });

    it("reversal sum equals original sum (balanced swap)", async () => {
      const originalTxId = ids.nextId();
      const originalBatchId = await createPosSaleBatch(ctx, originalTxId);

      // Get original totals
      const origBalance = await assertLinesBalanced(originalBatchId);

      const params: PosSaleReversalParams = {
        companyId: ctx.companyId,
        outletId: ctx.outletId,
        status: "VOID",
        originalPosTransactionId: originalTxId,
        correctionPosTransactionId: ids.nextId(),
        correctionPostedAt: CORRECTION_POSTED_AT,
        clientTxId: "test-sum-" + ids.nextId(),
      };

      const result = await createPosSaleReversalJournalsForCorrection(db, params);
      expect(result).not.toBeNull();

      // Get reversal totals
      const revBalance = await assertLinesBalanced(result!.reversalBatchId);

      // Reversal debits = original credits, reversal credits = original debits
      expect(revBalance.totalDebit).toBe(origBalance.totalCredit);
      expect(revBalance.totalCredit).toBe(origBalance.totalDebit);
    });
  });
});
