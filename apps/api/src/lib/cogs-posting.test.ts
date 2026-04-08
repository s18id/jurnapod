// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import { getDb, closeDbPool } from "./db";
import type { KyselySchema } from "@/lib/db";
import { sql } from "kysely";
import {
  calculateSaleCogs,
  getItemAccounts,
  getItemAccountsBatch,
  postCogsForSale,
  CogsCalculationError,
  CogsAccountConfigError,
} from "@jurnapod/modules-accounting/posting/cogs";
import { normalizeMoney } from "@jurnapod/modules-accounting";
import { createItem } from "./items/index.js";
import { itemPricesAdapter } from "./item-prices/adapter.js";
import { createCompanyBasic } from "./companies.js";
import { createOutletBasic } from "./outlets.js";
import { createUserBasic } from "./users.js";
import { createAccount } from "./accounts.js";

// Dynamic IDs - created in before() hook
let TEST_COMPANY_ID: number;
let TEST_OUTLET_ID: number;
let TEST_USER_ID: number;
const RUN_ID = Date.now().toString(36);

// Shared state
let db: KyselySchema;
let supportsUnitCost: boolean;
let cogsAccountId: number;
let inventoryAccountId: number;
let testItemId: number;

// Test helpers
async function createTestAccount(
  db: KyselySchema,
  companyId: number,
  code: string,
  name: string,
  accountType: string,
  normalBalance: 'D' | 'C'
): Promise<number> {
  const typeResult = await sql`
    SELECT id
    FROM account_types
    WHERE UPPER(name) = ${accountType.toUpperCase()}
      AND (company_id = ${companyId} OR company_id IS NULL)
    ORDER BY company_id IS NULL ASC, id ASC
    LIMIT 1
  `.execute(db);

  if ((typeResult.rows as any[]).length === 0) {
    await sql`
      INSERT INTO account_types (company_id, name, category, normal_balance, report_group, is_active)
      VALUES (${companyId}, ${accountType.toUpperCase()}, ${accountType.toUpperCase()}, ${normalBalance}, ${accountType.toUpperCase() === "REVENUE" || accountType.toUpperCase() === "EXPENSE" ? "PL" : "NRC"}, 1)
    `.execute(db);

    await sql`
      SELECT id FROM account_types WHERE company_id = ${companyId} AND UPPER(name) = ${accountType.toUpperCase()} LIMIT 1
    `.execute(db);
  }

  const accountTypeResult = await sql`
    SELECT id
    FROM account_types
    WHERE UPPER(name) = ${accountType.toUpperCase()}
      AND (company_id = ${companyId} OR company_id IS NULL)
    ORDER BY company_id IS NULL ASC, id ASC
    LIMIT 1
  `.execute(db);

  if ((accountTypeResult.rows as any[]).length === 0) {
    throw new Error(`Account type ${accountType} not found`);
  }
  
  const accountTypeId = (accountTypeResult.rows as any[])[0].id;
  
  // Map 'C' to 'K' for schema compatibility (schema uses 'K' for Kredit/Credit)
  const mappedNormalBalance = normalBalance === 'C' ? 'K' : normalBalance;
  
  // Use library function instead of direct INSERT
  const account = await createAccount({
    company_id: companyId,
    code: code,
    name: name,
    account_type_id: accountTypeId,
    normal_balance: mappedNormalBalance,
    is_group: false,
    is_payable: false,
    is_active: true
  });
  
  return account.id;
}

async function createInventoryTransaction(
  db: KyselySchema,
  companyId: number,
  productId: number,
  quantityDelta: number,
  unitCost: number
): Promise<number> {
  const columnResult = await sql`
    SELECT COUNT(*) AS column_exists
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'inventory_transactions'
      AND COLUMN_NAME = 'unit_cost'
  `.execute(db);
  const hasUnitCost = Number((columnResult.rows[0] as any)?.column_exists ?? 0) > 0;

  const result = hasUnitCost
    ? await sql`
        INSERT INTO inventory_transactions 
        (company_id, product_id, transaction_type, quantity_delta, unit_cost, created_at)
        VALUES (${companyId}, ${productId}, 6, ${quantityDelta}, ${unitCost}, NOW())
      `.execute(db)
    : await sql`
        INSERT INTO inventory_transactions 
        (company_id, product_id, transaction_type, quantity_delta, created_at)
        VALUES (${companyId}, ${productId}, 6, ${quantityDelta}, NOW())
      `.execute(db);
  
  return Number(result.insertId);
}

async function cleanupTestData(db: KyselySchema, companyId: number): Promise<void> {
  // Note: journal_lines and journal_batches are immutable - they use VOID patterns
  // So we only clean up the mutable tables
  
  try {
    await sql`DELETE FROM inventory_transactions WHERE company_id = ${companyId}`.execute(db);
  } catch {
    // May fail if table doesn't exist or has constraints
  }
  
  try {
    await sql`DELETE FROM item_prices WHERE company_id = ${companyId}`.execute(db);
  } catch {
    // May fail if table doesn't exist
  }
  
  await sql`DELETE FROM items WHERE company_id = ${companyId}`.execute(db);
  
  try {
    await sql`DELETE FROM company_account_mappings WHERE company_id = ${companyId}`.execute(db);
  } catch {
    // May fail if table doesn't exist
  }
  
  try {
    await sql`DELETE FROM account_mappings WHERE company_id = ${companyId}`.execute(db);
  } catch {
    // May fail if table doesn't exist
  }
  
  // Accounts may have journal_lines referencing them - use try/catch
  try {
    await sql`DELETE FROM accounts WHERE company_id = ${companyId}`.execute(db);
  } catch {
    // May fail if journal_lines reference these accounts
  }
  
  try {
    await sql`DELETE FROM account_types WHERE company_id = ${companyId}`.execute(db);
  } catch {
    // May fail if table doesn't exist
  }
  
  await sql`DELETE FROM outlets WHERE company_id = ${companyId}`.execute(db);
  await sql`DELETE FROM users WHERE company_id = ${companyId}`.execute(db);
  await sql`DELETE FROM companies WHERE id = ${companyId}`.execute(db);
}

// Setup
before(async () => {
  db = getDb();
  
  const unitCostColumnResult = await sql`
    SELECT COUNT(*) AS column_exists
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'inventory_transactions'
      AND COLUMN_NAME = 'unit_cost'
  `.execute(db);
  supportsUnitCost = Number((unitCostColumnResult.rows[0] as any)?.column_exists ?? 0) > 0;
  


  await cleanupTestData(db, 0);

  // Create company dynamically
  const company = await createCompanyBasic({
    code: `TEST-COGS-${RUN_ID}`,
    name: `Test COGS Company ${RUN_ID}`
  });
  TEST_COMPANY_ID = company.id;

  // Create outlet dynamically
  const outlet = await createOutletBasic({
    company_id: TEST_COMPANY_ID,
    code: `OUTLET-${RUN_ID}`,
    name: `Outlet ${RUN_ID}`
  });
  TEST_OUTLET_ID = outlet.id;

  // Create test user dynamically for postedBy
  const user = await createUserBasic({
    companyId: TEST_COMPANY_ID,
    email: `cogs-test-${RUN_ID}@example.com`,
    password: 'test-password',
    name: `COGS Test User ${RUN_ID}`
  });
  TEST_USER_ID = user.id;

  cogsAccountId = await createTestAccount(db, TEST_COMPANY_ID, '6100-TEST', 'Test COGS', 'EXPENSE', 'D');
  inventoryAccountId = await createTestAccount(db, TEST_COMPANY_ID, '1100-TEST', 'Test Inventory', 'ASSET', 'D');

  // Insert into the consolidated account_mappings table (cogs-posting.ts reads from here).
  // COGS_DEFAULT=7, INVENTORY_ASSET_DEFAULT=8; outlet_id IS NULL for company-wide defaults.
  await sql`
    INSERT INTO account_mappings (company_id, outlet_id, mapping_type_id, mapping_key, account_id)
    VALUES (${TEST_COMPANY_ID}, NULL, 7, 'COGS_DEFAULT', ${cogsAccountId}), (${TEST_COMPANY_ID}, NULL, 8, 'INVENTORY_ASSET_DEFAULT', ${inventoryAccountId})
  `.execute(db);
});

// Cleanup
after(async () => {
  await closeDbPool();
});

// Tests
test("calculateSaleCogs - should calculate COGS using inventory average cost", async () => {
  if (!supportsUnitCost) {
    return; // Skip
  }

  const coffeeItem = await createItem(TEST_COMPANY_ID, {
    name: 'Test Coffee',
    type: 'PRODUCT',
    track_stock: true
  });
  testItemId = coffeeItem.id;
  await createInventoryTransaction(db, TEST_COMPANY_ID, testItemId, 10, 5.0);
  
  const saleItems = [{ itemId: testItemId, quantity: 3 }];
  const cogsDetails = await calculateSaleCogs(TEST_COMPANY_ID, saleItems, db);
  
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

  const coffeeItem = await createItem(TEST_COMPANY_ID, {
    name: 'Coffee',
    type: 'PRODUCT',
    track_stock: true
  });
  const item1Id = coffeeItem.id;
  const sandwichItem = await createItem(TEST_COMPANY_ID, {
    name: 'Sandwich',
    type: 'PRODUCT',
    track_stock: true
  });
  const item2Id = sandwichItem.id;
  
  await createInventoryTransaction(db, TEST_COMPANY_ID, item1Id, 10, 2.0);
  await createInventoryTransaction(db, TEST_COMPANY_ID, item2Id, 5, 3.5);
  
  const saleItems = [
    { itemId: item1Id, quantity: 2 },
    { itemId: item2Id, quantity: 1 }
  ];
  
  const cogsDetails = await calculateSaleCogs(TEST_COMPANY_ID, saleItems, db);
  
  assert.strictEqual(cogsDetails.length, 2);
  assert.strictEqual(cogsDetails[0].totalCost, 4.0);
  assert.strictEqual(cogsDetails[1].totalCost, 3.5);
});

test("calculateSaleCogs - should throw error when cost cannot be determined", async () => {
  const noCostItem = await createItem(TEST_COMPANY_ID, {
    name: 'No Cost Item',
    type: 'PRODUCT',
    track_stock: true
  });
  const itemId = noCostItem.id;
  
  await assert.rejects(
    async () => await calculateSaleCogs(TEST_COMPANY_ID, [{ itemId, quantity: 1 }], db),
    CogsCalculationError
  );
});

test("calculateSaleCogs - should fall back to base_cost from item_prices", async () => {
  const priceItem = await createItem(TEST_COMPANY_ID, {
    name: 'Price Item',
    type: 'PRODUCT',
    track_stock: true
  });
  const itemId = priceItem.id;
  
  await itemPricesAdapter.createItemPrice(TEST_COMPANY_ID, {
    item_id: itemId,
    outlet_id: null,
    price: 7.5
  });
  
  const saleItems = [{ itemId, quantity: 2 }];
  const cogsDetails = await calculateSaleCogs(TEST_COMPANY_ID, saleItems, db);
  
  assert.strictEqual(cogsDetails[0].unitCost, 7.5);
  assert.strictEqual(cogsDetails[0].totalCost, 15.0);
});

test("calculateSaleCogs - should batch mixed inventory and fallback price lookups", async () => {
  const invItem = await createItem(TEST_COMPANY_ID, {
    name: 'Batch Inv Item',
    type: 'PRODUCT',
    track_stock: true
  });
  const inventoryItemId = invItem.id;
  const priceItem = await createItem(TEST_COMPANY_ID, {
    name: 'Batch Price Item',
    type: 'PRODUCT',
    track_stock: true
  });
  const fallbackPriceItemId = priceItem.id;

  if (supportsUnitCost) {
    await createInventoryTransaction(db, TEST_COMPANY_ID, inventoryItemId, 8, 2.5);
  } else {
    await itemPricesAdapter.createItemPrice(TEST_COMPANY_ID, {
      item_id: inventoryItemId,
      outlet_id: null,
      price: 2.5
    });
  }

  await itemPricesAdapter.createItemPrice(TEST_COMPANY_ID, {
    item_id: fallbackPriceItemId,
    outlet_id: null,
    price: 4.25
  });

  const cogsDetails = await calculateSaleCogs(
    TEST_COMPANY_ID,
    [
      { itemId: inventoryItemId, quantity: 2 },
      { itemId: fallbackPriceItemId, quantity: 3 }
    ],
    db
  );

  assert.strictEqual(cogsDetails.length, 2);
  assert.strictEqual(cogsDetails[0].itemId, inventoryItemId);
  assert.strictEqual(cogsDetails[0].unitCost, 2.5);
  assert.strictEqual(cogsDetails[0].totalCost, 5);

  assert.strictEqual(cogsDetails[1].itemId, fallbackPriceItemId);
  assert.strictEqual(cogsDetails[1].unitCost, 4.25);
  assert.strictEqual(cogsDetails[1].totalCost, 12.75);
});

test("getItemAccounts - should return item-specific accounts when configured", async () => {
  const itemCogsId = await createTestAccount(db, TEST_COMPANY_ID, '6101-ITEM', 'Item COGS', 'EXPENSE', 'D');
  const itemInvId = await createTestAccount(db, TEST_COMPANY_ID, '1101-ITEM', 'Item Inventory', 'ASSET', 'D');
  
  const accountedItem = await createItem(TEST_COMPANY_ID, {
    name: 'Accounted Item',
    type: 'PRODUCT',
    track_stock: true,
    cogs_account_id: itemCogsId,
    inventory_asset_account_id: itemInvId
  });
  const itemId = accountedItem.id;
  
  const accounts = await getItemAccounts(TEST_COMPANY_ID, itemId, db);
  
  assert.strictEqual(accounts.cogsAccountId, itemCogsId);
  assert.strictEqual(accounts.inventoryAssetAccountId, itemInvId);
});

test("getItemAccounts - should fall back to company defaults when item accounts not set", async () => {
  const defaultAccountItem = await createItem(TEST_COMPANY_ID, {
    name: 'Default Account Item',
    type: 'PRODUCT',
    track_stock: true
  });
  const itemId = defaultAccountItem.id;
  
  const accounts = await getItemAccounts(TEST_COMPANY_ID, itemId, db);
  
  assert.strictEqual(accounts.cogsAccountId, cogsAccountId);
  assert.strictEqual(accounts.inventoryAssetAccountId, inventoryAccountId);
});

test("getItemAccounts - should throw error when COGS account is not expense type", async () => {
  const wrongTypeAccount = await createTestAccount(db, TEST_COMPANY_ID, '5100-WRONG', 'Wrong Type', 'REVENUE', 'C');
  
  const wrongTypeItem = await createItem(TEST_COMPANY_ID, {
    name: 'Wrong Type Item',
    type: 'PRODUCT',
    track_stock: true,
    cogs_account_id: wrongTypeAccount,
    inventory_asset_account_id: inventoryAccountId
  });
  const itemId = wrongTypeItem.id;
  
  await assert.rejects(
    async () => await getItemAccounts(TEST_COMPANY_ID, itemId, db),
    CogsAccountConfigError
  );
});

test("getItemAccounts - should throw error when inventory account is not asset type", async () => {
  const wrongTypeAccount = await createTestAccount(db, TEST_COMPANY_ID, '2100-WRONG', 'Wrong Type', 'LIABILITY', 'C');
  
  const wrongInvItem = await createItem(TEST_COMPANY_ID, {
    name: 'Wrong Type Item',
    type: 'PRODUCT',
    track_stock: true,
    cogs_account_id: cogsAccountId,
    inventory_asset_account_id: wrongTypeAccount
  });
  const itemId = wrongInvItem.id;
  
  await assert.rejects(
    async () => await getItemAccounts(TEST_COMPANY_ID, itemId, db),
    CogsAccountConfigError
  );
});

test("getItemAccounts - should throw error when no accounts are configured", async () => {
  // Delete from account_mappings (the consolidated table the code reads from),
  // not company_account_mappings which is a legacy/archived table.
  await sql`DELETE FROM account_mappings WHERE company_id = ${TEST_COMPANY_ID}`.execute(db);
  
  const noAccountItem = await createItem(TEST_COMPANY_ID, {
    name: 'No Account Item',
    type: 'PRODUCT',
    track_stock: true
  });
  const itemId = noAccountItem.id;
  
  await assert.rejects(
    async () => await getItemAccounts(TEST_COMPANY_ID, itemId, db),
    CogsAccountConfigError
  );
  
  // Restore defaults into the consolidated account_mappings table
  await sql`
    INSERT INTO account_mappings (company_id, outlet_id, mapping_type_id, mapping_key, account_id)
    VALUES (${TEST_COMPANY_ID}, NULL, 7, 'COGS_DEFAULT', ${cogsAccountId}), (${TEST_COMPANY_ID}, NULL, 8, 'INVENTORY_ASSET_DEFAULT', ${inventoryAccountId})
  `.execute(db);
});

test("getItemAccountsBatch - should resolve mixed item-specific and default accounts in one call", async () => {
  const itemSpecificCogsId = await createTestAccount(db, TEST_COMPANY_ID, '6102-BATCH', 'Batch COGS', 'EXPENSE', 'D');
  const itemSpecificInvId = await createTestAccount(db, TEST_COMPANY_ID, '1102-BATCH', 'Batch Inventory', 'ASSET', 'D');

  const specificItem = await createItem(TEST_COMPANY_ID, {
    name: 'Batch Specific Item',
    type: 'PRODUCT',
    track_stock: true,
    cogs_account_id: itemSpecificCogsId,
    inventory_asset_account_id: itemSpecificInvId
  });
  const itemWithSpecificAccounts = specificItem.id;
  const defaultItem = await createItem(TEST_COMPANY_ID, {
    name: 'Batch Default Item',
    type: 'PRODUCT',
    track_stock: true
  });
  const itemUsingDefaults = defaultItem.id;

  const accountsByItemId = await getItemAccountsBatch(
    TEST_COMPANY_ID,
    [itemWithSpecificAccounts, itemUsingDefaults],
    db
  );

  assert.deepStrictEqual(accountsByItemId.get(itemWithSpecificAccounts), {
    cogsAccountId: itemSpecificCogsId,
    inventoryAssetAccountId: itemSpecificInvId
  });
  assert.deepStrictEqual(accountsByItemId.get(itemUsingDefaults), {
    cogsAccountId: cogsAccountId,
    inventoryAssetAccountId: inventoryAccountId
  });
});

test("postCogsForSale - should successfully post COGS journal for sale", async () => {
  const saleDate = new Date("2026-03-17T00:00:00.000Z");

  const saleItem = await createItem(TEST_COMPANY_ID, {
    name: 'Sale Item',
    type: 'PRODUCT',
    track_stock: true,
    cogs_account_id: cogsAccountId,
    inventory_asset_account_id: inventoryAccountId
  });
  const itemId = saleItem.id;
  if (supportsUnitCost) {
    await createInventoryTransaction(db, TEST_COMPANY_ID, itemId, 10, 5.0);
  }
  
  const cogsResult = await postCogsForSale({
    saleId: 'SALE-001',
    companyId: TEST_COMPANY_ID,
    outletId: TEST_OUTLET_ID,
    items: supportsUnitCost
      ? [{ itemId, quantity: 2 }]
      : [{ itemId, quantity: 2, unitCost: 5, totalCost: 10 }],
    saleDate,
    postedBy: TEST_USER_ID
  }, db);
  
  assert.strictEqual(cogsResult.success, true, JSON.stringify(cogsResult.errors));
  assert.strictEqual(cogsResult.totalCogs, 10.0);
  assert.ok(cogsResult.journalBatchId);
  
  const batchId = cogsResult.journalBatchId!;
  
  const batchResult = await sql`SELECT * FROM journal_batches WHERE id = ${batchId}`.execute(db);
  assert.strictEqual((batchResult.rows as any[]).length, 1);
  
  const lineResult = await sql`SELECT * FROM journal_lines WHERE journal_batch_id = ${batchId} ORDER BY id`.execute(db);
  const lines = lineResult.rows as any[];
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
  const item = await createItem(TEST_COMPANY_ID, {
    name: 'Calc Item',
    type: 'PRODUCT',
    track_stock: true,
    cogs_account_id: cogsAccountId,
    inventory_asset_account_id: inventoryAccountId
  });
  const itemId = item.id;
  if (supportsUnitCost) {
    await createInventoryTransaction(db, TEST_COMPANY_ID, itemId, 10, 3.0);
  } else {
    await itemPricesAdapter.createItemPrice(TEST_COMPANY_ID, {
      item_id: itemId,
      outlet_id: null,
      price: 3.0
    });
  }
  
  const result = await postCogsForSale({
    saleId: 'SALE-002',
    companyId: TEST_COMPANY_ID,
    outletId: TEST_OUTLET_ID,
    items: [{ itemId, quantity: 5 }],
    saleDate: new Date(),
    postedBy: TEST_USER_ID
  }, db);
  
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
  }, db);
  
  assert.strictEqual(result.success, true, JSON.stringify(result.errors));
  assert.strictEqual(result.totalCogs, 0);
  assert.ok(!result.journalBatchId);
});

test("postCogsForSale - should return failure when account config is missing", async () => {
  const item = await createItem(TEST_COMPANY_ID, {
    name: 'No Config Item',
    type: 'PRODUCT',
    track_stock: true
  });
  const itemId = item.id;
  
  const result = await postCogsForSale({
    saleId: 'SALE-004',
    companyId: TEST_COMPANY_ID,
    outletId: TEST_OUTLET_ID,
    items: [{ itemId, quantity: 1 }],
    saleDate: new Date(),
    postedBy: TEST_USER_ID
  }, db);
  
  assert.strictEqual(result.success, false);
  assert.ok(result.errors);
  assert.ok(result.errors!.length > 0);
});

test("postCogsForSale - should post COGS for multiple items", async () => {
  const item1 = await createItem(TEST_COMPANY_ID, {
    name: 'Multi Item 1',
    type: 'PRODUCT',
    track_stock: true,
    cogs_account_id: cogsAccountId,
    inventory_asset_account_id: inventoryAccountId
  });
  const item1Id = item1.id;
  const item2 = await createItem(TEST_COMPANY_ID, {
    name: 'Multi Item 2',
    type: 'PRODUCT',
    track_stock: true,
    cogs_account_id: cogsAccountId,
    inventory_asset_account_id: inventoryAccountId
  });
  const item2Id = item2.id;
  
  if (supportsUnitCost) {
    await createInventoryTransaction(db, TEST_COMPANY_ID, item1Id, 10, 2.0);
    await createInventoryTransaction(db, TEST_COMPANY_ID, item2Id, 5, 4.0);
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
  }, db);
  
  assert.strictEqual(result.success, true, JSON.stringify(result.errors));
  assert.strictEqual(result.totalCogs, 14.0);
  assert.ok(result.journalBatchId);
});

test("Helper functions - normalizeMoney should handle precision correctly", () => {
  // normalizeMoney imported at top of file
  
  assert.strictEqual(normalizeMoney(10.555), 10.56);
  assert.strictEqual(normalizeMoney(10.554), 10.55);
  assert.strictEqual(normalizeMoney(10.5), 10.5);
  assert.strictEqual(normalizeMoney(10), 10);
});
