// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * COGS Projection vs Source-of-Truth Journal Entries Reconciliation
 * (Story 62.2 AC2, AC3, AC4)
 *
 * Tests:
 * - AC2: COGS journal batch total matches posting result with zero variance
 * - AC3: Deterministic projection outputs
 * - AC4: EPIC62 GATE evidence emission
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { sql } from "kysely";
import { acquireReadLock, releaseReadLock } from "../../helpers/setup";
import { closeTestDb, getTestDb } from "../../helpers/db";
import {
  createTestCompanyMinimal,
  createTestOutletMinimal,
  createTestUser,
  createTestItem,
  createTestPrice,
  createTestStock,
  createTestInventoryGLAccount,
  createTestVarianceAccount,
  getRoleIdByCode,
  assignUserGlobalRole,
  cleanupTestFixtures,
} from "../../fixtures";
import { makeTag } from "../../helpers/tags";
import { postCogsForSale } from "@jurnapod/modules-accounting/posting/cogs";

describe("cogs-projection-reconciliation", { timeout: 60000 }, () => {
  let companyId: number;
  let outletId: number;
  let userId: number;
  let batchId: number | undefined;
  let postingTotalCogs: number;
  let postingSuccess: boolean;

  beforeAll(async () => {
    await acquireReadLock();

    // 1. Create isolated company + outlet + OWNER user
    const company = await createTestCompanyMinimal();
    companyId = company.id;
    const outlet = await createTestOutletMinimal(companyId);
    outletId = outlet.id;
    const user = await createTestUser(companyId);
    userId = user.id;

    const ownerRoleId = await getRoleIdByCode("OWNER");
    await assignUserGlobalRole(userId, ownerRoleId);

    // 2. Create item (type "PRODUCT", trackStock: true)
    const item = await createTestItem(companyId, {
      sku: makeTag("COGS"),
      name: "S62.2 COGS Projection Gate Item",
      type: "PRODUCT",
      trackStock: true,
    });

    // 3. Create price, create stock (quantity 5)
    await createTestPrice(companyId, item.id, userId, {
      price: 9876,
      isActive: true,
    });

    await createTestStock(companyId, item.id, outletId, 5, userId);

    // 4. Create COGS account via createTestVarianceAccount
    const cogsAccount = await createTestVarianceAccount(companyId, {
      code: makeTag("COGS"),
      name: "COGS Account",
    });

    // 5. Create inventory asset account via createTestInventoryGLAccount
    const invAssetAccount = await createTestInventoryGLAccount(companyId, {
      code: makeTag("INV"),
      name: "Inventory Asset",
    });

    // 6. Create account_mappings for COGS_DEFAULT (mapping_type_id=7)
    //    and INVENTORY_ASSET_DEFAULT (mapping_type_id=8)
    await sql`
      INSERT INTO account_mappings (company_id, outlet_id, mapping_type_id, mapping_key, account_id)
      VALUES
        (${companyId}, NULL, 7, 'COGS_DEFAULT', ${cogsAccount.id}),
        (${companyId}, NULL, 8, 'INVENTORY_ASSET_DEFAULT', ${invAssetAccount.id})
    `.execute(getTestDb());

    // 8. Post COGS: postCogsForSale with 2 units of the item
    const saleDate = new Date("2026-04-01");
    try {
      const cogsResult = await postCogsForSale(
        {
          saleId: makeTag("SALE"),
          companyId,
          outletId,
          items: [{ itemId: item.id, quantity: 2 }],
          saleDate,
          postedBy: userId,
        },
        getTestDb(),
      );
      postingSuccess = cogsResult.success;
      postingTotalCogs = cogsResult.totalCogs;
      batchId = cogsResult.journalBatchId;
    } catch (err) {
      postingSuccess = false;
      postingTotalCogs = 0;
      batchId = undefined;
    }
  });

  afterAll(async () => {
    try {
      await cleanupTestFixtures();
    } finally {
      try {
        await closeTestDb();
      } finally {
        await releaseReadLock();
      }
    }
  });

  // =============================================================================
  // Story 62.2 AC2: COGS posting produces non-zero journal total
  // =============================================================================

  it("COGS posting produces non-zero journal total", async () => {
    expect(postingSuccess).toBe(true);
    expect(postingTotalCogs).toBeGreaterThan(0);
    expect(batchId).toBeDefined();
  });

  // =============================================================================
  // Story 62.2 AC2: COGS journal batch total matches posting result
  // =============================================================================

  it("COGS journal batch total matches posting result (AC2)", async () => {
    // Query COGS journal total — scoped to the specific batch to avoid
    // picking up residual data from prior test runs for the same seed company.
    const cogsJournalRows = await sql<{ total_cogs: string | null }>`
      SELECT CAST(COALESCE(SUM(jl.debit), 0) AS DECIMAL(18,4)) AS total_cogs
      FROM journal_lines jl
      INNER JOIN journal_batches jb ON jb.id = jl.journal_batch_id
      WHERE ${batchId !== undefined ? sql`jb.id = ${batchId}` : sql`FALSE`}
    `.execute(getTestDb());

    const journalTotal = Number(cogsJournalRows.rows[0]?.total_cogs ?? "0");

    // Verify the batch has doc_type = 'COGS'
    if (batchId !== undefined) {
      const docTypeRows = await sql<{ doc_type: string }>`
        SELECT doc_type FROM journal_batches
        WHERE id = ${batchId} AND company_id = ${companyId}
      `.execute(getTestDb());
      expect(docTypeRows.rows[0]?.doc_type).toBe("COGS");
    }

    // Assert journal total matches posting total (to 4 decimal places)
    expect(journalTotal.toFixed(4)).toBe(postingTotalCogs.toFixed(4));

    // Emit GATE evidence with variance "0.0000", projection "cogs-posting"
    const variance = Math.abs(journalTotal - postingTotalCogs).toFixed(4);
    console.log(
      JSON.stringify({
        gate: "__EPIC62_GATE__",
        test: expect.getState().currentTestName ?? "unknown",
        projection: "cogs-posting",
        variance,
        timestamp: new Date().toISOString(),
      })
    );
  });

  // =============================================================================
  // COGS journal is balanced (debits = credits)
  // =============================================================================

  it("COGS journal is balanced (debits = credits)", async () => {
    const balanceRows = await sql<{
      total_debit: string | null;
      total_credit: string | null;
    }>`
      SELECT
        CAST(SUM(jl.debit) AS DECIMAL(18,4)) AS total_debit,
        CAST(SUM(jl.credit) AS DECIMAL(18,4)) AS total_credit
      FROM journal_lines jl
      WHERE ${batchId !== undefined ? sql`jl.journal_batch_id = ${batchId}` : sql`FALSE`}
    `.execute(getTestDb());

    const totalDebit = Number(balanceRows.rows[0]?.total_debit ?? "0");
    const totalCredit = Number(balanceRows.rows[0]?.total_credit ?? "0");

    expect(totalDebit.toFixed(4)).toBe(totalCredit.toFixed(4));
  });

  // =============================================================================
  // Story 62.2 AC3: Deterministic output
  // =============================================================================

  it("COGS journal batch produces deterministic output (AC3)", async () => {
    const queryCogsJournal = async () => {
      const rows = await sql<{ total_cogs: string | null }>`
        SELECT CAST(COALESCE(SUM(jl.debit), 0) AS DECIMAL(18,4)) AS total_cogs
        FROM journal_lines jl
        INNER JOIN journal_batches jb ON jb.id = jl.journal_batch_id
        WHERE ${batchId !== undefined ? sql`jb.id = ${batchId}` : sql`FALSE`}
      `.execute(getTestDb());
      return Number(rows.rows[0]?.total_cogs ?? "0");
    };

    const firstQuery = await queryCogsJournal();
    const secondQuery = await queryCogsJournal();

    // Assert identical results across repeated queries
    expect(firstQuery.toFixed(4)).toBe(secondQuery.toFixed(4));
    expect(firstQuery).toBe(secondQuery);
  });

  // =============================================================================
  // Story 62.2 AC4: GATE evidence format
  // =============================================================================

  it("emits EPIC62 GATE evidence with correct projection and variance (AC4)", async () => {
    // Query COGS journal total for evidence
    const cogsJournalRows = await sql<{ total_cogs: string | null }>`
      SELECT CAST(COALESCE(SUM(jl.debit), 0) AS DECIMAL(18,4)) AS total_cogs
      FROM journal_lines jl
      INNER JOIN journal_batches jb ON jb.id = jl.journal_batch_id
      WHERE ${batchId !== undefined ? sql`jb.id = ${batchId}` : sql`FALSE`}
    `.execute(getTestDb());

    const journalTotal = Number(cogsJournalRows.rows[0]?.total_cogs ?? "0");
    const variance = Math.abs(journalTotal - postingTotalCogs).toFixed(4);

    const gatePayload = {
      gate: "__EPIC62_GATE__",
      test: expect.getState().currentTestName ?? "unknown",
      projection: "cogs-posting",
      variance,
      timestamp: new Date().toISOString(),
    };

    console.log(JSON.stringify(gatePayload));

    // Verify payload structure
    expect(gatePayload.gate).toBe("__EPIC62_GATE__");
    expect(gatePayload.projection).toBe("cogs-posting");
    expect(gatePayload.variance).toBe("0.0000");
    expect(gatePayload.timestamp).toBeDefined();
  });
});
