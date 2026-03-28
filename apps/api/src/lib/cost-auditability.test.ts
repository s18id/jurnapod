// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)
// Scope: Story 4.6 Task 5 - Unit tests for cost auditability endpoints (API layer)

import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import { getDbPool, closeDbPool } from "./db";
import type { PoolConnection } from "mysql2/promise";
import {
  getItemCostLayersWithConsumption,
  getItemCostSummaryExtended,
  createCostLayer,
} from "./cost-tracking";
import { createItem } from "./items/index.js";
import { createCompanyBasic } from "./companies.js";
import { createOutletBasic } from "./outlets.js";

// Dynamic IDs - created in before() hook
let TEST_COMPANY_ID: number;
let TEST_OUTLET_ID: number;
const RUN_ID = Date.now().toString(36);

let conn: PoolConnection;

// Helper to create inventory transaction (needed for cost layer FK)
async function createInventoryTransaction(
  connection: PoolConnection,
  companyId: number,
  itemId: number,
  quantity: number
): Promise<number> {
  const [result] = await connection.execute(
    `INSERT INTO inventory_transactions
     (company_id, product_id, quantity_delta, transaction_type, reference_type, reference_id, created_by, created_at)
     VALUES (?, ?, ?, 6, 'PURCHASE', 'TEST-REF', 1, NOW())`,
    [companyId, itemId, quantity]
  );
  return (result as any).insertId;
}

// Helper to set costing method
async function setCompanyCostingMethod(
  connection: PoolConnection,
  companyId: number,
  method: "AVG" | "FIFO" | "LIFO"
): Promise<void> {
  await connection.execute(
    `DELETE FROM company_settings
     WHERE company_id = ? AND \`key\` IN (?, ?) AND outlet_id IS NULL`,
    [companyId, "inventory.costing_method", "inventory_costing_method"]
  );

  await connection.execute(
    `INSERT INTO company_settings (company_id, \`key\`, value_json, value_type, outlet_id)
     VALUES (?, ?, ?, 'string', NULL)`,
    [companyId, "inventory.costing_method", JSON.stringify(method)]
  );
}

// Helper to cleanup
async function cleanupTestData(connection: PoolConnection, companyId: number): Promise<void> {
  await connection.execute(
    `DELETE FROM cost_layer_consumption WHERE layer_id IN (
       SELECT id FROM inventory_cost_layers WHERE company_id = ?
     )`,
    [companyId]
  );
  await connection.execute(
    `DELETE FROM inventory_cost_layers WHERE company_id = ?`,
    [companyId]
  );
  await connection.execute(
    `DELETE FROM inventory_item_costs WHERE company_id = ?`,
    [companyId]
  );
  await connection.execute(
    `DELETE FROM inventory_transactions WHERE company_id = ?`,
    [companyId]
  );
  await connection.execute(
    `DELETE FROM company_settings WHERE company_id = ? AND \`key\` IN (?, ?)`,
    [companyId, "inventory_costing_method", "inventory.costing_method"]
  );
  await connection.execute(
    `DELETE FROM items WHERE company_id = ?`,
    [companyId]
  );
  await connection.execute(
    `DELETE FROM outlets WHERE company_id = ?`,
    [companyId]
  );
  await connection.execute(
    `DELETE FROM companies WHERE id = ?`,
    [companyId]
  );
}

test("Cost Auditability API Layer Tests", async (t) => {
  conn = await getDbPool().getConnection();

  before(async () => {
    await cleanupTestData(conn, 0);

    // Create company dynamically
    const company = await createCompanyBasic({
      code: `TEST-COST-AUDIT-${RUN_ID}`,
      name: `Test Cost Audit Company ${RUN_ID}`
    });
    TEST_COMPANY_ID = company.id;

    // Create outlet dynamically
    const outlet = await createOutletBasic({
      company_id: TEST_COMPANY_ID,
      code: `OUTLET-${RUN_ID}`,
      name: `Outlet ${RUN_ID}`
    });
    TEST_OUTLET_ID = outlet.id;
  });

  after(async () => {
    await cleanupTestData(conn, TEST_COMPANY_ID);
    conn.release();
    await closeDbPool();
  });

  await t.test("getItemCostLayersWithConsumption returns layers with consumption history", async () => {
    // Setup
    await setCompanyCostingMethod(conn, TEST_COMPANY_ID, "FIFO");
    const item = await createItem(TEST_COMPANY_ID, { name: "Layer Test", type: "PRODUCT" });
    const itemId = item.id;
    const txId = await createInventoryTransaction(conn, TEST_COMPANY_ID, itemId, 5);
    const layer = await createCostLayer(
      { companyId: TEST_COMPANY_ID, itemId, transactionId: txId, unitCost: 10000, quantity: 5 },
      conn
    );
    const layerId = layer.id;
    
    // Create a consumption record - first need a transaction for the FK
    const consumptionTxId = await createInventoryTransaction(conn, TEST_COMPANY_ID, itemId, -2);
    await conn.execute(
      `INSERT INTO cost_layer_consumption (company_id, layer_id, transaction_id, consumed_qty, unit_cost, total_cost, consumed_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      [TEST_COMPANY_ID, layerId, consumptionTxId, 2, 10000, 20000]
    );

    // Test
    const layers = await getItemCostLayersWithConsumption(TEST_COMPANY_ID, itemId, conn);

    // Verify
    assert.strictEqual(layers.length, 1);
    assert.strictEqual(layers[0].id, layerId);
    assert.strictEqual(layers[0].unitCost, 10000);
    assert.strictEqual(layers[0].originalQty, 5);
    assert.strictEqual(layers[0].remainingQty, 5);
    assert.ok(layers[0].consumedBy);
    assert.strictEqual(layers[0].consumedBy!.length, 1);
    assert.strictEqual(layers[0].consumedBy![0].quantity, 2);
    assert.strictEqual(layers[0].consumedBy![0].transactionId, consumptionTxId);
  });

  await t.test("getItemCostLayersWithConsumption returns empty array for non-existent item", async () => {
    const layers = await getItemCostLayersWithConsumption(TEST_COMPANY_ID, 999999, conn);
    assert.strictEqual(layers.length, 0);
  });

  await t.test("getItemCostSummaryExtended returns method-specific data for AVG", async () => {
    // Setup
    await setCompanyCostingMethod(conn, TEST_COMPANY_ID, "AVG");
    const item = await createItem(TEST_COMPANY_ID, { name: "AVG Summary Test", type: "PRODUCT" });
    const itemId = item.id;
    const txId1 = await createInventoryTransaction(conn, TEST_COMPANY_ID, itemId, 5);
    const txId2 = await createInventoryTransaction(conn, TEST_COMPANY_ID, itemId, 5);
    await createCostLayer({ companyId: TEST_COMPANY_ID, itemId, transactionId: txId1, unitCost: 10000, quantity: 5 }, conn);
    await createCostLayer({ companyId: TEST_COMPANY_ID, itemId, transactionId: txId2, unitCost: 12000, quantity: 5 }, conn);

    // Update summary table
    await conn.execute(
      `INSERT INTO inventory_item_costs
       (company_id, item_id, costing_method, current_avg_cost, total_layers_qty, total_layers_cost, updated_at)
       VALUES (?, ?, 'AVG', 11000, 10, 110000, NOW())
       ON DUPLICATE KEY UPDATE
       current_avg_cost = VALUES(current_avg_cost),
       total_layers_qty = VALUES(total_layers_qty),
       total_layers_cost = VALUES(total_layers_cost),
       updated_at = NOW()`,
      [TEST_COMPANY_ID, itemId]
    );

    // Test
    const summary = await getItemCostSummaryExtended(TEST_COMPANY_ID, itemId, conn);

    // Verify
    assert.ok(summary);
    assert.strictEqual(summary!.costingMethod, "AVG");
    assert.ok(summary!.methodSpecific);
    assert.ok(summary!.methodSpecific!.avg);
    assert.strictEqual(summary!.totalLayersQty, 10);
    assert.strictEqual(summary!.methodSpecific!.avg!.weightedAverage, 11000);
  });

  await t.test("getItemCostSummaryExtended returns method-specific data for FIFO", async () => {
    // Setup
    await setCompanyCostingMethod(conn, TEST_COMPANY_ID, "FIFO");
    const item = await createItem(TEST_COMPANY_ID, { name: "FIFO Summary Test", type: "PRODUCT" });
    const itemId = item.id;
    const txId1 = await createInventoryTransaction(conn, TEST_COMPANY_ID, itemId, 5);
    const txId2 = await createInventoryTransaction(conn, TEST_COMPANY_ID, itemId, 5);
    await createCostLayer({ companyId: TEST_COMPANY_ID, itemId, transactionId: txId1, unitCost: 10000, quantity: 5 }, conn);
    await createCostLayer({ companyId: TEST_COMPANY_ID, itemId, transactionId: txId2, unitCost: 12000, quantity: 5 }, conn);

    // Update summary table
    await conn.execute(
      `INSERT INTO inventory_item_costs
       (company_id, item_id, costing_method, current_avg_cost, total_layers_qty, total_layers_cost, updated_at)
       VALUES (?, ?, 'FIFO', 11000, 10, 110000, NOW())
       ON DUPLICATE KEY UPDATE
       current_avg_cost = VALUES(current_avg_cost),
       total_layers_qty = VALUES(total_layers_qty),
       total_layers_cost = VALUES(total_layers_cost),
       updated_at = NOW()`,
      [TEST_COMPANY_ID, itemId]
    );

    // Test
    const summary = await getItemCostSummaryExtended(TEST_COMPANY_ID, itemId, conn);

    // Verify
    assert.ok(summary);
    assert.strictEqual(summary!.costingMethod, "FIFO");
    assert.ok(summary!.methodSpecific);
    assert.ok(summary!.methodSpecific!.fifo);
    assert.strictEqual(summary!.methodSpecific!.fifo!.layerCount, 2);
    assert.strictEqual(summary!.methodSpecific!.fifo!.oldestLayerCost, 10000);
  });

  await t.test("getItemCostSummaryExtended returns method-specific data for LIFO", async () => {
    // Setup
    await setCompanyCostingMethod(conn, TEST_COMPANY_ID, "LIFO");
    const item = await createItem(TEST_COMPANY_ID, { name: "LIFO Summary Test", type: "PRODUCT" });
    const itemId = item.id;
    const txId1 = await createInventoryTransaction(conn, TEST_COMPANY_ID, itemId, 5);
    const txId2 = await createInventoryTransaction(conn, TEST_COMPANY_ID, itemId, 5);
    await createCostLayer({ companyId: TEST_COMPANY_ID, itemId, transactionId: txId1, unitCost: 10000, quantity: 5 }, conn);
    await createCostLayer({ companyId: TEST_COMPANY_ID, itemId, transactionId: txId2, unitCost: 12000, quantity: 5 }, conn);

    // Update summary table
    await conn.execute(
      `INSERT INTO inventory_item_costs
       (company_id, item_id, costing_method, current_avg_cost, total_layers_qty, total_layers_cost, updated_at)
       VALUES (?, ?, 'LIFO', 11000, 10, 110000, NOW())
       ON DUPLICATE KEY UPDATE
       current_avg_cost = VALUES(current_avg_cost),
       total_layers_qty = VALUES(total_layers_qty),
       total_layers_cost = VALUES(total_layers_cost),
       updated_at = NOW()`,
      [TEST_COMPANY_ID, itemId]
    );

    // Test
    const summary = await getItemCostSummaryExtended(TEST_COMPANY_ID, itemId, conn);

    // Verify
    assert.ok(summary);
    assert.strictEqual(summary!.costingMethod, "LIFO");
    assert.ok(summary!.methodSpecific);
    assert.ok(summary!.methodSpecific!.lifo);
    assert.strictEqual(summary!.methodSpecific!.lifo!.layerCount, 2);
    assert.strictEqual(summary!.methodSpecific!.lifo!.newestLayerCost, 12000);
  });

  await t.test("getItemCostSummaryExtended returns null when no cost data", async () => {
    const item = await createItem(TEST_COMPANY_ID, { name: "No Cost Test", type: "PRODUCT" });
    const itemId = item.id;
    const summary = await getItemCostSummaryExtended(TEST_COMPANY_ID, itemId, conn);
    assert.strictEqual(summary, null);
  });
});
