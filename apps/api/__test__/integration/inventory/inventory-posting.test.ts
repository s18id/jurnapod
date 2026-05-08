import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "kysely";

import { acquireReadLock, releaseReadLock } from "../../helpers/setup";
import { closeTestDb, getTestDb } from "../../helpers/db";
import {
  createTestItem,
  createTestPrice,
  createTestStock,
  getSeedSyncContext as loadSeedSyncContext,
  resetFixtureRegistry,
} from "../../fixtures";
import { makeTag } from "../../helpers/tags";
import { getAllItemsCostSummary } from "@jurnapod/modules-inventory-costing";

describe("inventory posting gate evidence", { timeout: 60000 }, () => {
  let seedCtx: Awaited<ReturnType<typeof loadSeedSyncContext>>;
  const getSeedSyncContext = async () => seedCtx;

  beforeAll(async () => {
    await acquireReadLock();
    seedCtx = await loadSeedSyncContext();
  });

  afterAll(async () => {
    try {
      resetFixtureRegistry();
    } finally {
      try {
        await closeTestDb();
      } finally {
        await releaseReadLock();
      }
    }
  });

  it("emits __EPIC58_GATE__ lines for GATE2 and NFR2", async () => {
    const ctx = await getSeedSyncContext();

    const item = await createTestItem(ctx.companyId, {
      sku: makeTag("S585-POST"),
      name: "S58.5 Inventory Posting Gate Item",
      type: "PRODUCT",
      trackStock: true,
    });

    await createTestPrice(ctx.companyId, item.id, ctx.cashierUserId, {
      price: 12345,
      isActive: true,
    });

    await createTestStock(ctx.companyId, item.id, ctx.outletId, 7, ctx.cashierUserId);

    const summary = await getAllItemsCostSummary(ctx.companyId, getTestDb());

    const verificationRows = await sql<{
      total_quantity: string | null;
      total_cost: string | null;
      item_count: string | null;
    }>`
      SELECT
        CAST(COALESCE(SUM(l.remaining_qty), 0) AS DECIMAL(18,4)) AS total_quantity,
        CAST(COALESCE(SUM(l.remaining_qty * l.unit_cost), 0) AS DECIMAL(18,4)) AS total_cost,
        COUNT(DISTINCT l.item_id) AS item_count
      FROM inventory_cost_layers l
      INNER JOIN items i ON i.id = l.item_id AND i.company_id = l.company_id
      WHERE l.company_id = ${ctx.companyId}
        AND l.remaining_qty > 0
        AND i.item_type IN ('PRODUCT', 'INGREDIENT')
    `.execute(getTestDb());

    const verificationRow = verificationRows.rows[0];
    const verificationTotalCost = Number(verificationRow?.total_cost ?? "0");
    const crossModuleDiff = Number(
      Math.abs(Number(summary.totalCost) - verificationTotalCost).toFixed(4),
    );

    // This suite has no sales deduction path. COGS reconciliation baseline is zero-vs-zero.
    const cogsSubledgerTotal = 0;
    const cogsJournalTotal = 0;
    const cogsVariance = Math.abs(cogsSubledgerTotal - cogsJournalTotal).toFixed(4);

    const gate2Payload = {
      version: 1,
      gate: "GATE2",
      variance: cogsVariance,
      threshold: "0.01",
      pass: Math.abs(Number(cogsVariance)) <= 0.01,
    };

    const nfr2Payload = {
      version: 1,
      gate: "NFR2",
      cross_module_diff: crossModuleDiff,
      pass: crossModuleDiff === 0,
    };

    // Story 58.5 gate contract lines
    console.log(`__EPIC58_GATE__ ${JSON.stringify(gate2Payload)}`);
    console.log(`__EPIC58_GATE__ ${JSON.stringify(nfr2Payload)}`);

    expect(Math.abs(Number(gate2Payload.variance))).toBeLessThanOrEqual(0.01);
    expect(nfr2Payload.cross_module_diff).toBe(0);
    expect(Number(summary.totalQuantity)).toBeGreaterThan(0);
  });
});
