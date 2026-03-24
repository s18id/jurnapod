// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import { getDbPool, closeDbPool } from "./db";
import type { PoolConnection } from "mysql2/promise";
import type { RowDataPacket } from "mysql2";
import {
  calculateSaleCogs,
  getItemAccounts,
  postCogsForSale,
  CogsCalculationError,
  CogsAccountConfigError,
  __cogsPostingTestables
} from "./cogs-posting";

// Test data - use timestamp-based IDs to avoid conflicts with parallel/sequential runs
const TEST_COMPANY_ID = 900000 + (Date.now() % 100000);
const TEST_OUTLET_ID = TEST_COMPANY_ID + 1;
const TEST_USER_ID = TEST_COMPANY_ID + 2;

// Shared state
let pool: ReturnType<typeof getDbPool>;
let conn: PoolConnection;
let supportsUnitCost: boolean;
let supportsMappingTypeId: boolean;
let cogsAccountId: number;
let inventoryAccountId: number;
let testItemId: number;

// Test helpers
async function createTestAccount(
  conn: PoolConnection,
  companyId: number,
  code: string,
  name: string,
  accountType: string,
  normalBalance: 'D' | 'C'
): Promise<number> {
  let [typeRows] = await conn.execute(
    `SELECT id FROM account_types WHERE UPPER(name) = ?`,
    [accountType.toUpperCase()]
  );

  if ((typeRows as any[]).length === 0) {
    await conn.execute(
      `INSERT INTO account_types (company_id, name, category, normal_balance, report_group, is_active)
       VALUES (?, ?, ?, ?, ?, 1)`,
      [
        companyId,
        accountType.toUpperCase(),
        accountType.toUpperCase(),
        normalBalance,
        accountType.toUpperCase() === "REVENUE" || accountType.toUpperCase() === "EXPENSE" ? "PL" : "NRC"
      ]
    );

    [typeRows] = await conn.execute(
      `SELECT id FROM account_types WHERE company_id = ? AND UPPER(name) = ? LIMIT 1`,
      [companyId, accountType.toUpperCase()]
    );
  }

  if ((typeRows as any[]).length === 0) {
    throw new Error(`Account type ${accountType} not found`);
  }
  
  const accountTypeId = (typeRows as any[])[0].id;
  
  const [result] = await conn.execute(
    `INSERT INTO accounts (company_id, code, name, account_type_id, normal_balance, is_active)
     VALUES (?, ?, ?, ?, ?, 1)`,
    [companyId, code, name, accountTypeId, normalBalance]
  );
  
  return (result as any).insertId;
}

async function createTestItem(
  conn: PoolConnection,
  companyId: number,
  name: string,
  itemType: string,
  trackStock: boolean = false,
  cogsAccountId?: number,
  inventoryAccountId?: number
): Promise<number> {
  const [result] = await conn.execute(
    `INSERT INTO items (company_id, name, item_type, track_stock, cogs_account_id, inventory_asset_account_id, is_active)
     VALUES (?, ?, ?, ?, ?, ?, 1)`,
    [companyId, name, itemType, trackStock ? 1 : 0, cogsAccountId ?? null, inventoryAccountId ?? null]
  );
  
  return (result as any).insertId;
}

async function createInventoryTransaction(
  conn: PoolConnection,
  companyId: number,
  productId: number,
  quantityDelta: number,
  unitCost: number
): Promise<number> {
  const [columnRows] = await conn.execute<RowDataPacket[]>(
    `SELECT COUNT(*) AS column_exists
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'inventory_transactions'
       AND COLUMN_NAME = 'unit_cost'`
  );
  const hasUnitCost = Number(columnRows[0]?.column_exists ?? 0) > 0;

  const [result] = hasUnitCost
    ? await conn.execute(
        `INSERT INTO inventory_transactions 
         (company_id, product_id, transaction_type, quantity_delta, unit_cost, created_at)
         VALUES (?, ?, 6, ?, ?, NOW())`,
        [companyId, productId, quantityDelta, unitCost]
      )
    : await conn.execute(
        `INSERT INTO inventory_transactions 
         (company_id, product_id, transaction_type, quantity_delta, created_at)
         VALUES (?, ?, 6, ?, NOW())`,
        [companyId, productId, quantityDelta]
      );
  
  return (result as any).insertId;
}

async function cleanupTestData(conn: PoolConnection): Promise<void> {
  // Note: journal_lines and journal_batches are immutable - they use VOID patterns
  // So we only clean up the mutable tables
  
  try {
    await conn.execute(`DELETE FROM inventory_transactions WHERE company_id = ?`, [TEST_COMPANY_ID]);
  } catch (e) {
    // May fail if table doesn't exist or has constraints
  }
  
  try {
    await conn.execute(`DELETE FROM item_prices WHERE company_id = ?`, [TEST_COMPANY_ID]);
  } catch (e) {
    // May fail if table doesn't exist
  }
  
  await conn.execute(`DELETE FROM items WHERE company_id = ?`, [TEST_COMPANY_ID]);
  
  try {
    await conn.execute(`DELETE FROM company_account_mappings WHERE company_id = ?`, [TEST_COMPANY_ID]);
  } catch (e) {
    // May fail if table doesn't exist
  }
  
  await conn.execute(`DELETE FROM accounts WHERE company_id = ?`, [TEST_COMPANY_ID]);
  
  try {
    await conn.execute(`DELETE FROM account_types WHERE company_id = ?`, [TEST_COMPANY_ID]);
  } catch (e) {
    // May fail if table doesn't exist
  }
  
  await conn.execute(`DELETE FROM outlets WHERE company_id = ?`, [TEST_COMPANY_ID]);
  await conn.execute(`DELETE FROM companies WHERE id = ?`, [TEST_COMPANY_ID]);
}

// Setup
before(async () => {
  pool = getDbPool();
  conn = await pool.getConnection();
  
  const [unitCostColumnRows] = await conn.execute<RowDataPacket[]>(
    `SELECT COUNT(*) AS column_exists
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'inventory_transactions'
       AND COLUMN_NAME = 'unit_cost'`
  );
  supportsUnitCost = Number(unitCostColumnRows[0]?.column_exists ?? 0) > 0;
  
  const [mappingTypeColumnRows] = await conn.execute<RowDataPacket[]>(
    `SELECT COUNT(*) AS column_exists
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'company_account_mappings'
       AND COLUMN_NAME = 'mapping_type_id'`
  );
  supportsMappingTypeId = Number(mappingTypeColumnRows[0]?.column_exists ?? 0) > 0;

  // Use unique codes to avoid conflicts
  const runId = Date.now().toString(36);

  await cleanupTestData(conn);

  await conn.execute(
    `INSERT INTO companies (id, code, name, timezone, currency_code)
     VALUES (?, ?, ?, 'UTC', 'IDR')`,
    [TEST_COMPANY_ID, `TEST-COGS-${runId}`, `Test COGS Company ${runId}`]
  );

  await conn.execute(
    `INSERT INTO outlets (id, company_id, code, name, timezone, is_active)
     VALUES (?, ?, ?, ?, 'UTC', 1)`,
    [TEST_OUTLET_ID, TEST_COMPANY_ID, `TEST-OUTLET-${runId}`, `Test Outlet ${runId}`]
  );

  cogsAccountId = await createTestAccount(conn, TEST_COMPANY_ID, '6100-TEST', 'Test COGS', 'EXPENSE', 'D');
  inventoryAccountId = await createTestAccount(conn, TEST_COMPANY_ID, '1100-TEST', 'Test Inventory', 'ASSET', 'D');

  if (supportsMappingTypeId) {
    await conn.execute(
      `INSERT INTO company_account_mappings (company_id, mapping_key, mapping_type_id, account_id)
       VALUES (?, 'COGS_DEFAULT', 7, ?), (?, 'INVENTORY_ASSET_DEFAULT', 8, ?)`,
      [TEST_COMPANY_ID, cogsAccountId, TEST_COMPANY_ID, inventoryAccountId]
    );
  } else {
    await conn.execute(
      `INSERT INTO company_account_mappings (company_id, mapping_key, account_id)
       VALUES (?, 'COGS_DEFAULT', ?), (?, 'INVENTORY_ASSET_DEFAULT', ?)`,
      [TEST_COMPANY_ID, cogsAccountId, TEST_COMPANY_ID, inventoryAccountId]
    );
  }
});

// Cleanup
after(async () => {
  if (conn) {
    conn.release();
  }
  await closeDbPool();
});

// Tests
test("calculateSaleCogs - should calculate COGS using inventory average cost", async () => {
  if (!supportsUnitCost) {
    return; // Skip
  }

  testItemId = await createTestItem(conn, TEST_COMPANY_ID, 'Test Coffee', 'PRODUCT', true);
  await createInventoryTransaction(conn, TEST_COMPANY_ID, testItemId, 10, 5.0);
  
  const saleItems = [{ itemId: testItemId, quantity: 3 }];
  const cogsDetails = await calculateSaleCogs(TEST_COMPANY_ID, saleItems, conn);
  
  assert.strictEqual(cogsDetails.length, 1);
  assert.strictEqual(cogsDetails[0].itemId, testItemId);
  assert.strictEqual(cogsDetails[0].quantity, 3);
  assert.strictEqual(cogsDetails[0].unitCost, 5.0);
  assert.strictEqual(cogsDetails[0].totalCost, 15.0);
});

test("calculateSaleCogs - should calculate COGS for multiple items", async () => {
  if (!supportsUnitCost) {
    return; // Skip
  }

  const item1Id = await createTestItem(conn, TEST_COMPANY_ID, 'Coffee', 'PRODUCT', true);
  const item2Id = await createTestItem(conn, TEST_COMPANY_ID, 'Sandwich', 'PRODUCT', true);
  
  await createInventoryTransaction(conn, TEST_COMPANY_ID, item1Id, 10, 2.0);
  await createInventoryTransaction(conn, TEST_COMPANY_ID, item2Id, 5, 3.5);
  
  const saleItems = [
    { itemId: item1Id, quantity: 2 },
    { itemId: item2Id, quantity: 1 }
  ];
  
  const cogsDetails = await calculateSaleCogs(TEST_COMPANY_ID, saleItems, conn);
  
  assert.strictEqual(cogsDetails.length, 2);
  assert.strictEqual(cogsDetails[0].totalCost, 4.0);
  assert.strictEqual(cogsDetails[1].totalCost, 3.5);
});

test("calculateSaleCogs - should throw error when cost cannot be determined", async () => {
  const itemId = await createTestItem(conn, TEST_COMPANY_ID, 'No Cost Item', 'PRODUCT', true);
  
  await assert.rejects(
    async () => await calculateSaleCogs(TEST_COMPANY_ID, [{ itemId, quantity: 1 }], conn),
    CogsCalculationError
  );
});

test("calculateSaleCogs - should fall back to base_cost from item_prices", async () => {
  const itemId = await createTestItem(conn, TEST_COMPANY_ID, 'Price Item', 'PRODUCT', true);
  
  await conn.execute(
    `INSERT INTO item_prices (company_id, item_id, outlet_id, price)
     VALUES (?, ?, NULL, 7.5)`,
    [TEST_COMPANY_ID, itemId]
  );
  
  const saleItems = [{ itemId, quantity: 2 }];
  const cogsDetails = await calculateSaleCogs(TEST_COMPANY_ID, saleItems, conn);
  
  assert.strictEqual(cogsDetails[0].unitCost, 7.5);
  assert.strictEqual(cogsDetails[0].totalCost, 15.0);
});

test("getItemAccounts - should return item-specific accounts when configured", async () => {
  const itemCogsId = await createTestAccount(conn, TEST_COMPANY_ID, '6101-ITEM', 'Item COGS', 'EXPENSE', 'D');
  const itemInvId = await createTestAccount(conn, TEST_COMPANY_ID, '1101-ITEM', 'Item Inventory', 'ASSET', 'D');
  
  const itemId = await createTestItem(
    conn, TEST_COMPANY_ID, 'Accounted Item', 'PRODUCT', true,
    itemCogsId, itemInvId
  );
  
  const accounts = await getItemAccounts(TEST_COMPANY_ID, itemId, conn);
  
  assert.strictEqual(accounts.cogsAccountId, itemCogsId);
  assert.strictEqual(accounts.inventoryAssetAccountId, itemInvId);
});

test("getItemAccounts - should fall back to company defaults when item accounts not set", async () => {
  const itemId = await createTestItem(conn, TEST_COMPANY_ID, 'Default Account Item', 'PRODUCT', true);
  
  const accounts = await getItemAccounts(TEST_COMPANY_ID, itemId, conn);
  
  assert.strictEqual(accounts.cogsAccountId, cogsAccountId);
  assert.strictEqual(accounts.inventoryAssetAccountId, inventoryAccountId);
});

test("getItemAccounts - should throw error when COGS account is not expense type", async () => {
  const wrongTypeAccount = await createTestAccount(conn, TEST_COMPANY_ID, '5100-WRONG', 'Wrong Type', 'REVENUE', 'C');
  
  const itemId = await createTestItem(
    conn, TEST_COMPANY_ID, 'Wrong Type Item', 'PRODUCT', true,
    wrongTypeAccount, inventoryAccountId
  );
  
  await assert.rejects(
    async () => await getItemAccounts(TEST_COMPANY_ID, itemId, conn),
    CogsAccountConfigError
  );
});

test("getItemAccounts - should throw error when inventory account is not asset type", async () => {
  const wrongTypeAccount = await createTestAccount(conn, TEST_COMPANY_ID, '2100-WRONG', 'Wrong Type', 'LIABILITY', 'C');
  
  const itemId = await createTestItem(
    conn, TEST_COMPANY_ID, 'Wrong Type Item', 'PRODUCT', true,
    cogsAccountId, wrongTypeAccount
  );
  
  await assert.rejects(
    async () => await getItemAccounts(TEST_COMPANY_ID, itemId, conn),
    CogsAccountConfigError
  );
});

test("getItemAccounts - should throw error when no accounts are configured", async () => {
  await conn.execute(
    `DELETE FROM company_account_mappings WHERE company_id = ?`,
    [TEST_COMPANY_ID]
  );
  
  const itemId = await createTestItem(conn, TEST_COMPANY_ID, 'No Account Item', 'PRODUCT', true);
  
  await assert.rejects(
    async () => await getItemAccounts(TEST_COMPANY_ID, itemId, conn),
    CogsAccountConfigError
  );
  
  // Restore defaults
  if (supportsMappingTypeId) {
    await conn.execute(
      `INSERT INTO company_account_mappings (company_id, mapping_key, mapping_type_id, account_id)
       VALUES (?, 'COGS_DEFAULT', 7, ?), (?, 'INVENTORY_ASSET_DEFAULT', 8, ?)`,
      [TEST_COMPANY_ID, cogsAccountId, TEST_COMPANY_ID, inventoryAccountId]
    );
  } else {
    await conn.execute(
      `INSERT INTO company_account_mappings (company_id, mapping_key, account_id)
       VALUES (?, 'COGS_DEFAULT', ?), (?, 'INVENTORY_ASSET_DEFAULT', ?)`,
      [TEST_COMPANY_ID, cogsAccountId, TEST_COMPANY_ID, inventoryAccountId]
    );
  }
});

test("postCogsForSale - should successfully post COGS journal for sale", async () => {
  const saleDate = new Date("2026-03-17T00:00:00.000Z");

  const itemId = await createTestItem(
    conn, TEST_COMPANY_ID, 'Sale Item', 'PRODUCT', true,
    cogsAccountId, inventoryAccountId
  );
  if (supportsUnitCost) {
    await createInventoryTransaction(conn, TEST_COMPANY_ID, itemId, 10, 5.0);
  }
  
  const result = await postCogsForSale({
    saleId: 'SALE-001',
    companyId: TEST_COMPANY_ID,
    outletId: TEST_OUTLET_ID,
    items: supportsUnitCost
      ? [{ itemId, quantity: 2 }]
      : [{ itemId, quantity: 2, unitCost: 5, totalCost: 10 }],
    saleDate,
    postedBy: TEST_USER_ID
  }, conn);
  
  assert.strictEqual(result.success, true, JSON.stringify(result.errors));
  assert.strictEqual(result.totalCogs, 10.0);
  assert.ok(result.journalBatchId);
  
  const batchId = result.journalBatchId!;
  
  const [batchRows] = await conn.execute<RowDataPacket[]>(
    `SELECT * FROM journal_batches WHERE id = ?`,
    [batchId]
  );
  assert.strictEqual(batchRows.length, 1);
  
  const [lineRows] = await conn.execute<RowDataPacket[]>(
    `SELECT * FROM journal_lines WHERE journal_batch_id = ? ORDER BY id`,
    [batchId]
  );
  const lines = lineRows as any[];
  assert.strictEqual(lines.length, 2);
  
  assert.strictEqual(Number(lines[0].debit), 10.0);
  assert.strictEqual(Number(lines[0].credit), 0);
  assert.strictEqual(lines[0].account_id, cogsAccountId);
  assert.strictEqual(String(lines[0].line_date).slice(0, 10), "2026-03-17");
  
  assert.strictEqual(Number(lines[1].debit), 0);
  assert.strictEqual(Number(lines[1].credit), 10.0);
  assert.strictEqual(lines[1].account_id, inventoryAccountId);
  assert.strictEqual(String(lines[1].line_date).slice(0, 10), "2026-03-17");
});

test("postCogsForSale - should calculate costs when not provided", async () => {
  const itemId = await createTestItem(
    conn, TEST_COMPANY_ID, 'Calc Item', 'PRODUCT', true,
    cogsAccountId, inventoryAccountId
  );
  if (supportsUnitCost) {
    await createInventoryTransaction(conn, TEST_COMPANY_ID, itemId, 10, 3.0);
  } else {
    await conn.execute(
      `INSERT INTO item_prices (company_id, item_id, outlet_id, price)
       VALUES (?, ?, NULL, 3.0)`,
      [TEST_COMPANY_ID, itemId]
    );
  }
  
  const result = await postCogsForSale({
    saleId: 'SALE-002',
    companyId: TEST_COMPANY_ID,
    outletId: TEST_OUTLET_ID,
    items: [{ itemId, quantity: 5 }],
    saleDate: new Date(),
    postedBy: TEST_USER_ID
  }, conn);
  
  assert.strictEqual(result.success, true, JSON.stringify(result.errors));
  assert.strictEqual(result.totalCogs, 15.0);
});

test("postCogsForSale - should return success with zero COGS for empty items", async () => {
  const result = await postCogsForSale({
    saleId: 'SALE-003',
    companyId: TEST_COMPANY_ID,
    outletId: TEST_OUTLET_ID,
    items: [],
    saleDate: new Date(),
    postedBy: TEST_USER_ID
  }, conn);
  
  assert.strictEqual(result.success, true, JSON.stringify(result.errors));
  assert.strictEqual(result.totalCogs, 0);
  assert.ok(!result.journalBatchId);
});

test("postCogsForSale - should return failure when account config is missing", async () => {
  const itemId = await createTestItem(conn, TEST_COMPANY_ID, 'No Config Item', 'PRODUCT', true);
  
  const result = await postCogsForSale({
    saleId: 'SALE-004',
    companyId: TEST_COMPANY_ID,
    outletId: TEST_OUTLET_ID,
    items: [{ itemId, quantity: 1 }],
    saleDate: new Date(),
    postedBy: TEST_USER_ID
  }, conn);
  
  assert.strictEqual(result.success, false);
  assert.ok(result.errors);
  assert.ok(result.errors!.length > 0);
});

test("postCogsForSale - should post COGS for multiple items", async () => {
  const item1Id = await createTestItem(
    conn, TEST_COMPANY_ID, 'Multi Item 1', 'PRODUCT', true,
    cogsAccountId, inventoryAccountId
  );
  const item2Id = await createTestItem(
    conn, TEST_COMPANY_ID, 'Multi Item 2', 'PRODUCT', true,
    cogsAccountId, inventoryAccountId
  );
  
  if (supportsUnitCost) {
    await createInventoryTransaction(conn, TEST_COMPANY_ID, item1Id, 10, 2.0);
    await createInventoryTransaction(conn, TEST_COMPANY_ID, item2Id, 5, 4.0);
  }
  
  const result = await postCogsForSale({
    saleId: 'SALE-005',
    companyId: TEST_COMPANY_ID,
    outletId: TEST_OUTLET_ID,
    items: supportsUnitCost
      ? [
          { itemId: item1Id, quantity: 3 },
          { itemId: item2Id, quantity: 2 }
        ]
      : [
          { itemId: item1Id, quantity: 3, unitCost: 2, totalCost: 6 },
          { itemId: item2Id, quantity: 2, unitCost: 4, totalCost: 8 }
        ],
    saleDate: new Date(),
    postedBy: TEST_USER_ID
  }, conn);
  
  assert.strictEqual(result.success, true, JSON.stringify(result.errors));
  assert.strictEqual(result.totalCogs, 14.0);
  assert.ok(result.journalBatchId);
});

test("Helper functions - normalizeMoney should handle precision correctly", () => {
  const { normalizeMoney } = __cogsPostingTestables;
  
  assert.strictEqual(normalizeMoney(10.555), 10.56);
  assert.strictEqual(normalizeMoney(10.554), 10.55);
  assert.strictEqual(normalizeMoney(10.5), 10.5);
  assert.strictEqual(normalizeMoney(10), 10);
});
