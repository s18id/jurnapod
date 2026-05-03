// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Inventory Subledger Reconciliation — Non-Zero Inventory Path (Action Item E54-A5)
 *
 * Tests seeded-data inventory reconciliation path where cost layers exist.
 *
 * Scenario:
 * 1. Create cost layers via createTestStock() — 100 units at $10/unit
 * 2. Verify cost layers exist in inventory_cost_layers
 * 3. Verify inventory_item_costs summary
 * 4. Partial consumption — deduct 30 units and verify cost layer state
 * 5. Subledger balance — verify SUM(remaining_qty * unit_cost) matches inventory_item_costs
 *
 * Uses vitest with globals: true
 * Uses real DB via .env
 * Uses canonical fixtures: createTestCompanyMinimal, createTestOutletMinimal, createTestUser,
 *                          createTestItem, createTestStock
 * Cleans up in afterAll
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { closeTestDb } from "../helpers/db";
import { acquireReadLock, releaseReadLock } from "../helpers/setup";
import {
  resetFixtureRegistry,
  createTestCompanyMinimal,
  createTestOutletMinimal,
  createTestUser,
  createTestItem,
  createTestStock,
  createTestPrice,
} from "../fixtures";
import { getDb } from "@/lib/db";
import { deductStockWithCost } from "@/lib/stock";
import { sql } from "kysely";
import { makeTag } from "../helpers/tags";

describe("inventory-reconciliation-seeded", { timeout: 60000 }, () => {
  let companyId: number;
  let outletId: number;
  let ownerUserId: number;

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  async function queryCostLayers(itemId: number) {
    const db = getDb();
    return sql<{
      id: number;
      original_qty: string;
      remaining_qty: string;
      unit_cost: string;
    }>`
      SELECT id, original_qty, remaining_qty, unit_cost
      FROM inventory_cost_layers
      WHERE company_id = ${companyId} AND item_id = ${itemId}
      ORDER BY id ASC
    `.execute(db);
  }

  async function queryItemCosts(itemId: number) {
    const db = getDb();
    return sql<{
      current_avg_cost: string | null;
      total_layers_qty: string;
      total_layers_cost: string;
      costing_method: string;
    }>`
      SELECT current_avg_cost, total_layers_qty, total_layers_cost, costing_method
      FROM inventory_item_costs
      WHERE company_id = ${companyId} AND item_id = ${itemId}
    `.execute(db);
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  beforeAll(async () => {
    await acquireReadLock();

    const company = await createTestCompanyMinimal();
    companyId = company.id;

    const outlet = await createTestOutletMinimal(companyId);
    outletId = outlet.id;

    const ownerUser = await createTestUser(companyId, {
      name: "Inventory Recon Seeded Owner",
    });
    ownerUserId = ownerUser.id;
  });

  afterAll(async () => {
    resetFixtureRegistry();
    await closeTestDb();
    await releaseReadLock();
  });

  // ---------------------------------------------------------------------------
  // Scenario 1 & 2: Create cost layers via createTestStock and verify existence
  // ---------------------------------------------------------------------------

  describe("scenario 1: cost layer creation via createTestStock", () => {
    it("creates cost layer with correct original_qty, remaining_qty, unit_cost", async () => {
      // Create item with price (price is used to derive unit cost for positive adjustments)
      const item = await createTestItem(companyId, {
        sku: makeTag("COSTLAYER"),
        name: "Cost Layer Test Item",
        type: "PRODUCT",
        trackStock: true,
      });

      await createTestPrice(companyId, item.id, ownerUserId, {
        price: 10_000, // $10.00 in minor units
        isActive: true,
      });

      // Create 100 units of stock — this should create a cost layer
      await createTestStock(companyId, item.id, outletId, 100, ownerUserId);

      // Verify cost layer
      const layerResult = await queryCostLayers(item.id);
      expect(layerResult.rows.length).toBeGreaterThan(0);

      const layer = layerResult.rows[0] as {
        id: number;
        original_qty: string;
        remaining_qty: string;
        unit_cost: string;
      };

      expect(Number(layer.original_qty)).toBe(100);
      expect(Number(layer.remaining_qty)).toBe(100);
      expect(Number(layer.unit_cost)).toBe(10_000); // $10.00 in minor units
    });
  });

  // ---------------------------------------------------------------------------
  // Scenario 3: Verify inventory_item_costs summary
  // ---------------------------------------------------------------------------

  describe("scenario 3: inventory_item_costs summary verification", () => {
    it("current_avg_cost is $10.00 and total_layers_qty is 100", async () => {
      const item = await createTestItem(companyId, {
        sku: makeTag("INVCOST"),
        name: "Inventory Costs Summary Test Item",
        type: "PRODUCT",
        trackStock: true,
      });

      await createTestPrice(companyId, item.id, ownerUserId, {
        price: 10_000, // $10.00
        isActive: true,
      });

      await createTestStock(companyId, item.id, outletId, 100, ownerUserId);

      const costResult = await queryItemCosts(item.id);
      expect(costResult.rows.length).toBeGreaterThan(0);

      const costs = costResult.rows[0] as {
        current_avg_cost: string | null;
        total_layers_qty: string;
        total_layers_cost: string;
        costing_method: string;
      };

      expect(Number(costs.current_avg_cost)).toBe(10_000); // $10.00
      expect(Number(costs.total_layers_qty)).toBe(100);
      expect(Number(costs.total_layers_cost)).toBe(1_000_000); // 100 * $10.00 = $1000.00
    });
  });

  // ---------------------------------------------------------------------------
  // Scenario 4: Partial consumption — deduct 30 units
  // ---------------------------------------------------------------------------

  describe("scenario 4: partial consumption", () => {
    it("remaining_qty on cost layer is 70 after deducting 30 units", async () => {
      const item = await createTestItem(companyId, {
        sku: makeTag("PARTIAL"),
        name: "Partial Consumption Test Item",
        type: "PRODUCT",
        trackStock: true,
      });

      await createTestPrice(companyId, item.id, ownerUserId, {
        price: 10_000,
        isActive: true,
      });

      await createTestStock(companyId, item.id, outletId, 100, ownerUserId);

      // Get the cost layer ID before deduction
      const beforeLayers = await queryCostLayers(item.id);
      const beforeLayer = beforeLayers.rows[0] as { id: number };
      const layerId = beforeLayer.id;

      // Consume cost layers by deducting 30 units via library function
      const deductResult = await deductStockWithCost(
        companyId,
        outletId,
        [{ product_id: item.id, quantity: 30 }],
        makeTag("DEDUCT"),
        ownerUserId
      );

      expect(deductResult).toHaveLength(1);

      // Verify remaining_qty on the cost layer is now 70
      const afterLayers = await sql<{ remaining_qty: string }>`
        SELECT remaining_qty FROM inventory_cost_layers WHERE id = ${layerId}
      `.execute(getDb());

      expect(afterLayers.rows.length).toBe(1);
      expect(Number((afterLayers.rows[0] as { remaining_qty: string }).remaining_qty)).toBe(70);
    });

    it("total_layers_qty on inventory_item_costs is 70 after partial consumption", async () => {
      const item = await createTestItem(companyId, {
        sku: makeTag("TOTQTY"),
        name: "Total Layers Qty Test Item",
        type: "PRODUCT",
        trackStock: true,
      });

      await createTestPrice(companyId, item.id, ownerUserId, {
        price: 10_000,
        isActive: true,
      });

      await createTestStock(companyId, item.id, outletId, 100, ownerUserId);

      // Consume cost layers by deducting 30 units
      await deductStockWithCost(
        companyId,
        outletId,
        [{ product_id: item.id, quantity: 30 }],
        makeTag("TOTQTY"),
        ownerUserId
      );

      const costResult = await queryItemCosts(item.id);
      const costs = costResult.rows[0] as {
        total_layers_qty: string;
        current_avg_cost: string | null;
      };

      expect(Number(costs.total_layers_qty)).toBe(70);
      // Moving average: $10.00 stays the same (only one layer at this cost)
      expect(Number(costs.current_avg_cost)).toBe(10_000);
    });

    it("current_avg_cost remains $10.00 after partial consumption (moving average)", async () => {
      const item = await createTestItem(companyId, {
        sku: makeTag("AVGCOST"),
        name: "Average Cost Moving Test Item",
        type: "PRODUCT",
        trackStock: true,
      });

      await createTestPrice(companyId, item.id, ownerUserId, {
        price: 10_000,
        isActive: true,
      });

      await createTestStock(companyId, item.id, outletId, 100, ownerUserId);

      // Consume cost layers by deducting 30 units
      await deductStockWithCost(
        companyId,
        outletId,
        [{ product_id: item.id, quantity: 30 }],
        makeTag("AVGCOST"),
        ownerUserId
      );

      const costResult = await queryItemCosts(item.id);
      const costs = costResult.rows[0] as {
        current_avg_cost: string | null;
      };

      // AVG method: moving average = (100 * $10 - 30 * $10) / 70 = $10.00
      expect(Number(costs.current_avg_cost)).toBe(10_000);
    });
  });

  // ---------------------------------------------------------------------------
  // Scenario 5: Subledger balance verification
  // ---------------------------------------------------------------------------

  describe("scenario 5: subledger balance", () => {
    it("SUM(remaining_qty * unit_cost) matches inventory_item_costs.total_layers_cost", async () => {
      const item = await createTestItem(companyId, {
        sku: makeTag("SUBLGR"),
        name: "Subledger Balance Test Item",
        type: "PRODUCT",
        trackStock: true,
      });

      await createTestPrice(companyId, item.id, ownerUserId, {
        price: 10_000,
        isActive: true,
      });

      await createTestStock(companyId, item.id, outletId, 100, ownerUserId);

      // Consume cost layers by deducting 30 units
      await deductStockWithCost(
        companyId,
        outletId,
        [{ product_id: item.id, quantity: 30 }],
        makeTag("SUBLGR"),
        ownerUserId
      );

      const db = getDb();

      // Calculate subledger balance from cost layers
      const layersResult = await sql<{ remaining_qty: string; unit_cost: string }>`
        SELECT remaining_qty, unit_cost
        FROM inventory_cost_layers
        WHERE company_id = ${companyId} AND item_id = ${item.id}
      `.execute(db);

      const calculatedBalance = layersResult.rows.reduce(
        (sum: number, row: { remaining_qty: string; unit_cost: string }) =>
          sum + Number(row.remaining_qty) * Number(row.unit_cost),
        0
      );

      // Get total_layers_cost from inventory_item_costs
      const costsResult = await sql<{ total_layers_cost: number }>`
        SELECT total_layers_cost
        FROM inventory_item_costs
        WHERE company_id = ${companyId} AND item_id = ${item.id}
      `.execute(db);

      expect(costsResult.rows.length).toBe(1);
      const storedBalance = Number(
        (costsResult.rows[0] as { total_layers_cost: number }).total_layers_cost
      );

      // 70 remaining units * $10.00 = $700.00 = 700_000 in minor units
      expect(calculatedBalance).toBe(700_000);
      expect(storedBalance).toBe(700_000);
      expect(calculatedBalance).toBe(storedBalance);
    });
  });
});
