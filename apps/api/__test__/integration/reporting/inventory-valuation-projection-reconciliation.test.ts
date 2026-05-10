// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Inventory Valuation Projection Reconciliation Integration Tests (Story 62.2)
 *
 * Tests inventory valuation projection vs source-of-truth cost layers reconciliation:
 * - AC1: Inventory valuation projection matches cost layers with zero variance
 * - AC3: Deterministic projection outputs
 * - AC4: EPIC62 GATE evidence format
 *
 * The source-of-truth is the inventory_cost_layers table.
 * The projection is getAllItemsCostSummary() from @jurnapod/modules-inventory-costing.
 * Cross-module verification: projection total vs hand-rolled SQL over the same tables.
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
  getRoleIdByCode,
  assignUserGlobalRole,
  cleanupTestFixtures,
} from "../../fixtures";
import { makeTag } from "../../helpers/tags";
import { getAllItemsCostSummary } from "@jurnapod/modules-inventory-costing";

describe("inventory-valuation-projection-reconciliation", { timeout: 60000 }, () => {
  let companyId: number;
  let outletId: number;
  let userId: number;

  beforeAll(async () => {
    await acquireReadLock();
    const company = await createTestCompanyMinimal();
    companyId = company.id;
    const outlet = await createTestOutletMinimal(companyId);
    outletId = outlet.id;
    const user = await createTestUser(companyId);
    userId = user.id;

    // Assign user as OWNER so they can create items and stock
    const ownerRoleId = await getRoleIdByCode("OWNER");
    await assignUserGlobalRole(userId, ownerRoleId);
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
  // AC1: Inventory valuation projection matches cost layers with zero variance
  // =============================================================================

  describe("AC1: Valuation projection vs cost-layers source-of-truth", () => {
    // ---------------------------------------------------------------------------
    // Zero-state: no items → zero valuation
    // ---------------------------------------------------------------------------
    it("zero-state: no items produces zero valuation", async () => {
      const summary = await getAllItemsCostSummary(companyId, getTestDb());

      // totalCost is returned as a DECIMAL(18,4) string by the module
      expect(Number(summary.totalCost)).toBe(0);
      expect(summary.totalQuantity).toBe(0);
      expect(summary.itemCount).toBe(0);
      expect(summary.averageCost).toBe("0.0000");

      // Emit EPIC62 GATE evidence for zero-state
      console.log(JSON.stringify({
        gate: "__EPIC62_GATE__",
        test: expect.getState().currentTestName ?? "unknown",
        projection: "inventory-valuation",
        variance: "0.0000",
        timestamp: new Date().toISOString(),
      }));
    });

    // ---------------------------------------------------------------------------
    // Seeded data: items with cost layers
    // ---------------------------------------------------------------------------
    it("seeded data: projection total matches cost-layers source-of-truth exactly", async () => {
      const item = await createTestItem(companyId, {
        sku: makeTag("S622-IVPR"),
        name: "S62.2 Inventory Valuation Gate Item",
        type: "PRODUCT",
        trackStock: true,
      });

      // Create a price so createTestStock can resolve unit cost
      await createTestPrice(companyId, item.id, userId, {
        price: 12345,
        isActive: true,
      });

      // createTestStock triggers cost layer creation via adjustStock
      await createTestStock(companyId, item.id, outletId, 10, userId);

      const summary = await getAllItemsCostSummary(companyId, getTestDb());

      // After creating stock, there should be a cost layer with remaining_qty > 0
      expect(Number(summary.totalCost)).toBeGreaterThan(0);
      expect(summary.totalQuantity).toBeGreaterThan(0);
      expect(summary.itemCount).toBeGreaterThanOrEqual(1);

      // Direct DB verification: hand-rolled SQL against the same tables
      // with the exact same filters used by getAllItemsCostSummary:
      //   WHERE l.company_id = ? AND l.remaining_qty > 0
      //     AND i.item_type IN ('PRODUCT', 'INGREDIENT')
      const verificationRows = await sql<{
        total_cost: string | null;
      }>`
        SELECT
          CAST(COALESCE(SUM(l.remaining_qty * l.unit_cost), 0) AS DECIMAL(18,4)) AS total_cost
        FROM inventory_cost_layers l
        INNER JOIN items i ON i.id = l.item_id AND i.company_id = l.company_id
        WHERE l.company_id = ${companyId}
          AND l.remaining_qty > 0
          AND i.item_type IN ('PRODUCT', 'INGREDIENT')
      `.execute(getTestDb());

      const verificationRow = verificationRows.rows[0];
      const verificationTotalCost = Number(verificationRow?.total_cost ?? "0");

      // Cross-module diff between module summary and hand-rolled SQL — MUST be zero
      const crossModuleDiff = Number(
        Math.abs(Number(summary.totalCost) - verificationTotalCost).toFixed(4),
      );

      expect(crossModuleDiff).toBe(0);
      expect(Number(summary.totalCost)).toBe(verificationTotalCost);

      // Emit EPIC62 GATE evidence
      console.log(JSON.stringify({
        gate: "__EPIC62_GATE__",
        test: expect.getState().currentTestName ?? "unknown",
        projection: "inventory-valuation",
        variance: "0.0000",
        timestamp: new Date().toISOString(),
      }));
    });
  });

  // =============================================================================
  // AC3: Deterministic projection outputs
  // =============================================================================

  describe("AC3: Deterministic projection outputs", () => {
    it("repeated calls produce identical results", async () => {
      const summary1 = await getAllItemsCostSummary(companyId, getTestDb());
      const summary2 = await getAllItemsCostSummary(companyId, getTestDb());

      expect(Number(summary1.totalCost)).toBe(Number(summary2.totalCost));
      expect(summary1.totalQuantity).toBe(summary2.totalQuantity);
      expect(summary1.itemCount).toBe(summary2.itemCount);
      expect(summary1.averageCost).toBe(summary2.averageCost);
      expect(summary1.companyId).toBe(summary2.companyId);
    });
  });

  // =============================================================================
  // AC4: EPIC62 GATE evidence format
  // =============================================================================

  describe("AC4: EPIC62 GATE evidence", () => {
    it("emits GATE log line in exact required format with all required fields", async () => {
      const summary = await getAllItemsCostSummary(companyId, getTestDb());

      // Perform full reconciliation: projection vs source-of-truth
      const verificationRows = await sql<{
        total_cost: string | null;
      }>`
        SELECT
          CAST(COALESCE(SUM(l.remaining_qty * l.unit_cost), 0) AS DECIMAL(18,4)) AS total_cost
        FROM inventory_cost_layers l
        INNER JOIN items i ON i.id = l.item_id AND i.company_id = l.company_id
        WHERE l.company_id = ${companyId}
          AND l.remaining_qty > 0
          AND i.item_type IN ('PRODUCT', 'INGREDIENT')
      `.execute(getTestDb());

      const verificationRow = verificationRows.rows[0];
      const verificationTotalCost = Number(verificationRow?.total_cost ?? "0");
      const variance = Math.abs(Number(summary.totalCost) - verificationTotalCost).toFixed(4);

      // Emit exact GATE format
      const gatePayload = {
        gate: "__EPIC62_GATE__",
        test: expect.getState().currentTestName ?? "unknown",
        projection: "inventory-valuation",
        variance,
        timestamp: new Date().toISOString(),
      };
      console.log(JSON.stringify(gatePayload));

      // Verify the payload fields match the required format
      expect(gatePayload.gate).toBe("__EPIC62_GATE__");
      expect(gatePayload.projection).toBe("inventory-valuation");
      expect(gatePayload.variance).toBe("0.0000");
      expect(gatePayload).toHaveProperty("test");
      expect(gatePayload).toHaveProperty("timestamp");
      // Timestamp must be ISO8601 format
      expect(() => new Date(gatePayload.timestamp)).not.toThrow();
      expect(new Date(gatePayload.timestamp).toISOString()).toBe(gatePayload.timestamp);
    });
  });

  // =============================================================================
  // Error paths: library function rejects invalid input
  // =============================================================================

  describe("Error paths", () => {
    it("returns zero totals for non-existent companyId", async () => {
      // getItemsCostSummary queries with WHERE l.company_id = <id>
      // When no rows match, COALESCE(SUM(...), 0) returns zero
      const summary = await getAllItemsCostSummary(0, getTestDb());

      expect(Number(summary.totalCost)).toBe(0);
      expect(summary.totalQuantity).toBe(0);
      expect(summary.itemCount).toBe(0);
      expect(summary.averageCost).toBe("0.0000");
    });
  });
});
