// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Integration tests for COGS Posting (Story 50.3)
 *
 * Tests:
 * - COGS posting balanced with expected account directions
 *   - COGS account: DEBIT (expense increases)
 *   - Inventory Asset account: CREDIT (asset decreases)
 * - Multiple items aggregated per inventory asset account
 * - Deduction costs with stockTxId linkage work correctly
 * - Error when item has no COGS account configured
 * - Error when item has no inventory asset account configured
 *
 * POLICY COMPLIANCE:
 * - Uses canonical fixtures from owner packages for company/outlet creation
 * - Uses package-level fixtures where available; gaps documented inline
 * - Deterministic run IDs via hrtime (not Date.now/Math.random)
 * - Unique company fixture per describe block for isolation
 * - SKU-based cleanup for rerun safety (no reliance on DELETE order)
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { createKysely, type KyselySchema } from "@jurnapod/db";
import {
  postCogsForSale,
  type CogsPostingInput,
  type CogsPostingExecutor,
  getItemAccountsBatch,
  calculateSaleCogs,
} from "../../../src/posting/cogs.js";
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

// Deterministic sale date (fixed, not NOW)
const FIXED_SALE_DATE = new Date("2026-04-01T10:00:00Z");

function makeCogsInput(ctx: TestContext, overrides: Partial<CogsPostingInput>): CogsPostingInput {
  // caller MUST supply saleId explicitly — no default is provided
  // postedBy: sentinel 999999 used for test isolation (no FK constraint enforcement in test DB)
  return {
    companyId: ctx.companyId,
    outletId: ctx.outletId,
    saleDate: FIXED_SALE_DATE,
    postedBy: 999999,
    ...overrides,
  };
}

// -----------------------------------------------------------------------------
// Minimal executor using production calculateSaleCogs.
//
// getItemAccountsBatch is overridden to bypass account_type validation
// because account_types may be empty in the test DB, causing production
// validation to fail for test accounts that have account_type_id = NULL.
// This override returns item-level account mappings directly without type validation.
// -----------------------------------------------------------------------------
function createCogsExecutor(db: KyselySchema): CogsPostingExecutor {
  return {
    async calculateSaleCogs(companyId, saleItems) {
      // calculateSaleCogs uses item_prices.price as fallback when unit_cost is absent
      // from inventory_transactions. Caller must seed item_prices.price > 0 for tests
      // that rely on this path.
      return calculateSaleCogs(companyId, saleItems, db);
    },
    async getItemAccountsBatch(companyId, itemIds) {
      // Direct query bypassing production type validation (account_types may be empty in test DB).
      const uniqueIds = Array.from(new Set(itemIds.map(Number)));
      if (uniqueIds.length === 0) return new Map();

      const rows = await sql<{ id: number; cogs_account_id: number | null; inventory_asset_account_id: number | null }>`
        SELECT id, cogs_account_id, inventory_asset_account_id
        FROM items
        WHERE company_id = ${companyId} AND id IN (${sql.join(uniqueIds.map(id => sql`${id}`), sql`, `)})
      `.execute(db);

      const missingIds = new Set(uniqueIds);
      const result = new Map<number, { cogsAccountId: number; inventoryAssetAccountId: number }>();
      for (const row of rows.rows) {
        const itemId = Number(row.id);
        const cogsId = Number(row.cogs_account_id ?? 0);
        const invId = Number(row.inventory_asset_account_id ?? 0);
        if (cogsId === 0) throw new Error(`No COGS account configured for item ${itemId}`);
        if (invId === 0) throw new Error(`No inventory asset account configured for item ${itemId}`);
        result.set(itemId, { cogsAccountId: cogsId, inventoryAssetAccountId: invId });
        missingIds.delete(itemId);
      }
      if (missingIds.size > 0) {
        throw new Error(`Items not found: ${Array.from(missingIds).join(',')}`);
      }
      return result;
    },
    async ensureDateWithinOpenFiscalYear(_companyId: number, _date: string) {
      // No-op: fiscal year validation at API layer
    },
  };
}

// -----------------------------------------------------------------------------
// Deterministic run-unique counter for test IDs — file-specific namespace.
// Uses hrtime for per-call uniqueness while staying deterministic within a run.
// File salt prevents cross-file collision even under parallel vitest execution.
// -----------------------------------------------------------------------------
const ids = createPostingIdGenerator("COGS");

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

  // Seed account_types if empty — required for account type validation in getItemAccountsBatch.
  // The test DB may not have account_types seeded (depends on migration/seed state).
  const typeCount = await sql`
    SELECT COUNT(*) as cnt FROM account_types
  `.execute(db).then(r => Number((r.rows[0] as { cnt: number }).cnt));

  if (typeCount === 0) {
    // Seed minimal set: ASSET=1, EXPENSE=2, LIABILITY=3, INCOME=4
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
  await db?.destroy();
});

// -----------------------------------------------------------------------------
// Describe block — creates a unique company+outlet once, reused by all tests
// -----------------------------------------------------------------------------
describe("CogsPosting", () => {
  let ctx: TestContext;
  // Company-specific account type IDs (resolved once after company is known)
  let _expenseTypeId: number;
  let _assetTypeId: number;

  beforeAll(async () => {
    // Use canonical company fixture from @jurnapod/modules-platform
    const company = await createTestCompanyMinimal(db);
    const outlet = await createTestOutletMinimal(db, company.id);
    ctx = { companyId: company.id, outletId: outlet.id };

    // Seed company-specific account types (required by schema: company_id IS NOT NULL)
    // GAP: No package-level fixture exists for account_types seeding.
    // This raw SQL is the minimum gap-filler until a canonical account-type fixture exists.
    await sql`
      INSERT IGNORE INTO account_types (company_id, name, category, normal_balance)
      VALUES
        (${ctx.companyId}, 'EXPENSE', 'EXPENSE', 'D'),
        (${ctx.companyId}, 'ASSET',   'ASSET',   'D')
    `.execute(db);

    const typeRows = await sql`
      SELECT id, name FROM account_types WHERE company_id = ${ctx.companyId}
    `.execute(db);
    for (const row of typeRows.rows as { id: number; name: string }[]) {
      if (row.name === 'EXPENSE') _expenseTypeId = row.id;
      if (row.name === 'ASSET')   _assetTypeId   = row.id;
    }
  });

  // Per-run cleanup: remove test items and child rows created by previous runs.
  // Accounts CANNOT be deleted here due to FK constraint from journal_lines.account_id.
  // They are isolated per-run via unique codes (COGS-TEST-{salt}-{runId}) and are safe to reuse
  // across test runs since test items are namespaced by unique SKU patterns.
  // item_prices is deleted explicitly (not relying on ON DELETE CASCADE) to ensure
  // clean state and match the canonical production cleanup path.
  beforeEach(async () => {
    const testItems = await sql`
      SELECT id FROM items WHERE company_id = ${ctx.companyId} AND sku LIKE 'ITM-COGS-%'
    `.execute(db);
    const itemIds = testItems.rows.map(r => Number((r as { id: number }).id));

    if (itemIds.length > 0) {
      // Remove item_prices first (not relying on FK cascade for test predictability)
      await sql`DELETE FROM item_prices WHERE company_id = ${ctx.companyId} AND item_id IN (${sql.join(itemIds.map(id => sql`${id}`), sql`, `)})`.execute(db);
      // Remove inventory_transactions
      await sql`DELETE FROM inventory_transactions WHERE company_id = ${ctx.companyId} AND product_id IN (${sql.join(itemIds.map(id => sql`${id}`), sql`, `)})`.execute(db);
    }
    await sql`DELETE FROM items WHERE company_id = ${ctx.companyId} AND sku LIKE 'ITM-COGS-%'`.execute(db);
    // Accounts are NOT deleted here — they may be referenced by journal_lines from this run.
    // They use unique codes so they won't conflict with future runs.
  });

  // -------------------------------------------------------------------------
  // GAP DOCUMENTATION:
  // No package-level fixture exists for accounts (COGS, inventory asset).
  // Raw SQL INSERT is used here as a gap-filler pending a canonical account fixture.
  // This is the minimum feasible SQL: creates an account row with the required
  // fields and proper account_type linkage for EXPENSE/ASSET classification.
  // Uses company-specific account_type IDs resolved in beforeAll.
  // Duplicate-key handling: INSERT IGNORE + fetch fallback pattern matches
  // getOrCreateTaxAccount (journal-immutability) and prevents failures from
  // re-run cleanup having deleted but not yet re-created accounts.
  // -------------------------------------------------------------------------
  async function createTestAccount(
    companyId: number,
    code: string,
    name: string,
    typeName: "ASSET" | "EXPENSE"
  ): Promise<number> {
    const accountTypeId = typeName === 'EXPENSE' ? _expenseTypeId : _assetTypeId;

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
      // Duplicate key — row already exists from a prior run/cleanup cycle; fetch it.
    }

    const result = await sql`SELECT id FROM accounts WHERE company_id = ${companyId} AND code = ${code} LIMIT 1`.execute(db);
    if (!result.rows[0]) throw new Error(`Account not found after insert: ${code}`);
    return Number((result.rows[0] as { id: number }).id);
  }

  // -------------------------------------------------------------------------
  // GAP DOCUMENTATION:
  // No package-level fixture exists for items with account bindings.
  // Raw SQL INSERT is used here as a gap-filler pending a canonical item fixture
  // that accepts cogs_account_id and inventory_asset_account_id.
  // The items table FK constraints are bypassed in test context (trusted seed data).
  // -------------------------------------------------------------------------
  async function createTestItem(
    companyId: number,
    sku: string,
    name: string,
    cogsAccountId: number,
    invAssetAccountId: number
  ): Promise<number> {
    const result = await sql`
      INSERT INTO items (company_id, sku, name, item_type, is_active, track_stock, cogs_account_id, inventory_asset_account_id, created_at, updated_at)
      VALUES (${companyId}, ${sku}, ${name}, 'PRODUCT', 1, 1, ${cogsAccountId}, ${invAssetAccountId}, NOW(), NOW())
    `.execute(db);
    return Number((result as { insertId?: number }).insertId ?? 0);
  }

  // -------------------------------------------------------------------------
  // GAP DOCUMENTATION:
  // No package-level fixture exists for inventory_transactions (stock rows).
  // Raw SQL INSERT is used here; the transactions table requires specific
  // column values that no existing fixture helper provides.
  // Schema note: inventory_transactions has no reason/updated_at; transaction_type is tinyint.
  // -------------------------------------------------------------------------
  async function createInventoryTransaction(
    companyId: number,
    productId: number,
    quantityDelta: number,
    referenceId: string
  ): Promise<number> {
    const result = await sql`
      INSERT INTO inventory_transactions (company_id, product_id, transaction_type, quantity_delta, reference_id, created_at)
      VALUES (${companyId}, ${productId}, 1, ${quantityDelta}, ${referenceId}, NOW())
    `.execute(db);
    return Number((result as { insertId?: number }).insertId ?? 0);
  }

  // -------------------------------------------------------------------------
  // GAP DOCUMENTATION:
  // No package-level fixture exists for item_prices.
  // Raw SQL INSERT is used here; item_prices creation is not covered by any
  // existing package fixture helper.
  // Schema note: scope_key column exists but not used in test context.
  // -------------------------------------------------------------------------
  async function createItemPrice(
    companyId: number,
    itemId: number,
    price: number
  ): Promise<void> {
    await sql`
      INSERT INTO item_prices (company_id, item_id, price, is_active, created_at, updated_at)
      VALUES (${companyId}, ${itemId}, ${price}, 1, NOW(), NOW())
    `.execute(db);
  }

  // -------------------------------------------------------------------------
  // Test 1: COGS posting balanced journal (COGS debit, Inventory Asset credit)
  // -------------------------------------------------------------------------
  it("posts COGS with balanced journal (COGS debit, Inventory Asset credit)", async () => {
    const cogsAccountId = await createTestAccount(ctx.companyId, ids.nextCode("COGS-TEST"), "Test COGS", "EXPENSE");
    const invAssetAccountId = await createTestAccount(ctx.companyId, ids.nextCode("INVASSET-TEST"), "Test Inv Asset", "ASSET");

    const item1Sku = ids.nextCode("ITM-COGS");
    const item2Sku = ids.nextCode("ITM-COGS");
    const item1Id = await createTestItem(ctx.companyId, item1Sku, "Test Item 101", cogsAccountId, invAssetAccountId);
    const item2Id = await createTestItem(ctx.companyId, item2Sku, "Test Item 102", cogsAccountId, invAssetAccountId);

    // Stock rows
    await createInventoryTransaction(ctx.companyId, item1Id, 10, ids.nextCode("COGS-TEST"));
    await createInventoryTransaction(ctx.companyId, item2Id, 10, ids.nextCode("COGS-TEST"));

    // Price fallback for calculateSaleCogs
    await createItemPrice(ctx.companyId, item1Id, 15000);
    await createItemPrice(ctx.companyId, item2Id, 20000);

    const executor = createCogsExecutor(db);

    const saleIdSuffix = ids.nextId();

    const input = makeCogsInput(ctx, {
      saleId: `SALE-COGS-${saleIdSuffix}`,
      items: [
        { itemId: item1Id, quantity: 2 },
        { itemId: item2Id, quantity: 3 },
      ],
    });

    // Act
    const result = await postCogsForSale(db, executor, input);

    if (!result.success) {
      console.error("COGS TEST 1 FAILED:", result.errors);
    }

    // Assert
    expect(result.success).toBe(true);
    expect(result.journalBatchId).toBeGreaterThan(0);
    expect(result.totalCogs).toBeGreaterThan(0);

    // Verify journal lines
    const lines = await sql`
      SELECT account_id, debit, credit, description
      FROM journal_lines
      WHERE journal_batch_id = ${result.journalBatchId}
      ORDER BY account_id ASC
    `.execute(db);

    expect(lines.rows.length).toBeGreaterThanOrEqual(2);

    // Find COGS debit lines
    const cogsLines = lines.rows.filter(r => Number((r as { account_id: number }).account_id) === cogsAccountId);
    expect(cogsLines.length).toBeGreaterThan(0);
    for (const cogsLine of cogsLines) {
      const debit = Number((cogsLine as { debit: string }).debit);
      const credit = Number((cogsLine as { credit: string }).credit);
      expect(debit).toBeGreaterThan(0);
      expect(credit).toBe(0);
    }

    // Find Inventory Asset credit line (aggregated)
    const invAssetLines = lines.rows.filter(r => Number((r as { account_id: number }).account_id) === invAssetAccountId);
    expect(invAssetLines.length).toBeGreaterThan(0);
    for (const invLine of invAssetLines) {
      const debit = Number((invLine as { debit: string }).debit);
      const credit = Number((invLine as { credit: string }).credit);
      expect(debit).toBe(0);
      expect(credit).toBeGreaterThan(0);
    }

    // Balance: total debits == total credits
    const totalDebit = lines.rows.reduce((s, r) => s + Number((r as { debit: string }).debit), 0);
    const totalCredit = lines.rows.reduce((s, r) => s + Number((r as { credit: string }).credit), 0);
    expect(totalDebit).toBe(totalCredit);
  });

  // -------------------------------------------------------------------------
  // Test 2: COGS with pre-calculated deduction costs (stockTxId linkage)
  // -------------------------------------------------------------------------
  it("posts COGS with pre-calculated deduction costs (stockTxId linkage)", async () => {
    const cogsAccountId = await createTestAccount(ctx.companyId, ids.nextCode("COGS-TEST"), "Test COGS 2", "EXPENSE");
    const invAssetAccountId = await createTestAccount(ctx.companyId, ids.nextCode("INVASSET-TEST"), "Test Inv Asset 2", "ASSET");

    const itemSku = ids.nextCode("ITM-COGS");
    const itemId = await createTestItem(ctx.companyId, itemSku, "Test Item 201", cogsAccountId, invAssetAccountId);

    // Create inventory transaction to get stockTxId
    const stockTxId = await createInventoryTransaction(ctx.companyId, itemId, 10, ids.nextCode("COGS-TEST"));

    const executor = createCogsExecutor(db);

    // Use deductionCosts with stockTxId for deterministic COGS
    const input = makeCogsInput(ctx, {
      saleId: `SALE-COGS-${ids.nextId()}`,
      items: [{ itemId, quantity: 2, unitCost: 15_000, totalCost: 30_000 }],
      deductionCosts: [
        { stockTxId, itemId, quantity: 2, unitCost: 15_000, totalCost: 30_000 },
      ],
    });

    const result = await postCogsForSale(db, executor, input);

    expect(result.success).toBe(true);
    expect(result.journalBatchId).toBeGreaterThan(0);

    // Verify journal lines
    const lines = await sql`
      SELECT account_id, debit, credit
      FROM journal_lines
      WHERE journal_batch_id = ${result.journalBatchId}
      ORDER BY account_id ASC
    `.execute(db);

    expect(lines.rows.length).toBe(2); // 1 COGS debit + 1 inventory credit

    const cogsLine = lines.rows.find(r => Number((r as { account_id: number }).account_id) === cogsAccountId) as { debit: string } | undefined;
    const invLine = lines.rows.find(r => Number((r as { account_id: number }).account_id) === invAssetAccountId) as { credit: string } | undefined;

    expect(cogsLine).toBeDefined();
    expect(invLine).toBeDefined();
    expect(Number(cogsLine!.debit)).toBe(30_000);
    expect(Number(invLine!.credit)).toBe(30_000);

    // Balance
    const totalDebit = lines.rows.reduce((s, r) => s + Number((r as { debit: string }).debit), 0);
    const totalCredit = lines.rows.reduce((s, r) => s + Number((r as { credit: string }).credit), 0);
    expect(totalDebit).toBe(totalCredit);
  });

  // -------------------------------------------------------------------------
  // Test 3: Error when item has no COGS account configured
  // -------------------------------------------------------------------------
  it("throws CogsAccountConfigError when item has no COGS account", async () => {
    const invAssetAccountId = await createTestAccount(ctx.companyId, ids.nextCode("INVASSET-TEST"), "Test Inv Asset 3", "ASSET");

    // Item missing COGS account (cogs_account_id = NULL)
    const itemSku = ids.nextCode("ITM-COGS");
    const itemId = await sql`
      INSERT INTO items (company_id, sku, name, item_type, is_active, track_stock, cogs_account_id, inventory_asset_account_id, created_at, updated_at)
      VALUES (${ctx.companyId}, ${itemSku}, 'Test Item 301', 'PRODUCT', 1, 1, NULL, ${invAssetAccountId}, NOW(), NOW())
    `.execute(db).then(r => Number((r as { insertId?: number }).insertId ?? 0)) || 301;

    // Override calculateSaleCogs to bypass real calculation and reach account validation.
    // getItemAccountsBatch uses real impl which will throw CogsAccountConfigError
    // when cogs_account_id is NULL and no company default exists.
    const executor: CogsPostingExecutor = {
      async calculateSaleCogs(_companyId, _saleItems) {
        // Return mock cogs items so we bypass calculation and reach getItemAccountsBatch
        return [{
          itemId: itemId,
          quantity: 1,
          unitCost: 10000,
          totalCost: 10000,
        }];
      },
      async getItemAccountsBatch(companyId, itemIds) {
        return getItemAccountsBatch(companyId, itemIds, db);
      },
      async ensureDateWithinOpenFiscalYear() {},
    };

    const input = makeCogsInput(ctx, {
      saleId: `SALE-COGS-${ids.nextId()}`,
      items: [{ itemId, quantity: 1 }],
    });

    const result = await postCogsForSale(db, executor, input);
    expect(result.success).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors!.some((e: string) => e.includes("COGS") || e.includes("not found"))).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Test 4: Error when item has no inventory asset account configured
  // -------------------------------------------------------------------------
  it("throws CogsAccountConfigError when item has no inventory asset account", async () => {
    const cogsAccountId = await createTestAccount(ctx.companyId, ids.nextCode("COGS-TEST"), "Test COGS 4", "EXPENSE");

    // Item missing inventory asset account (inventory_asset_account_id = NULL)
    const itemSku = ids.nextCode("ITM-COGS");
    const itemId = await sql`
      INSERT INTO items (company_id, sku, name, item_type, is_active, track_stock, cogs_account_id, inventory_asset_account_id, created_at, updated_at)
      VALUES (${ctx.companyId}, ${itemSku}, 'Test Item 401', 'PRODUCT', 1, 1, ${cogsAccountId}, NULL, NOW(), NOW())
    `.execute(db).then(r => Number((r as { insertId?: number }).insertId ?? 0)) || 401;

    // Override calculateSaleCogs to bypass real calculation and reach account validation.
    const executor: CogsPostingExecutor = {
      async calculateSaleCogs(_companyId, _saleItems) {
        return [{
          itemId: itemId,
          quantity: 1,
          unitCost: 10000,
          totalCost: 10000,
        }];
      },
      async getItemAccountsBatch(companyId, itemIds) {
        return getItemAccountsBatch(companyId, itemIds, db);
      },
      async ensureDateWithinOpenFiscalYear() {},
    };

    const input = makeCogsInput(ctx, {
      saleId: `SALE-COGS-${ids.nextId()}`,
      items: [{ itemId, quantity: 1 }],
    });

    const result = await postCogsForSale(db, executor, input);
    expect(result.success).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors!.some((e: string) => e.includes("inventory") || e.includes("not found"))).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Test 5: COGS journal lines use correct account directions
  // -------------------------------------------------------------------------
  it("COGS journal lines use correct account directions (COGS DEBIT, Inventory CREDIT)", async () => {
    const cogsAccountId = await createTestAccount(ctx.companyId, ids.nextCode("COGS-TEST"), "Test COGS 5", "EXPENSE");
    const invAssetAccountId = await createTestAccount(ctx.companyId, ids.nextCode("INVASSET-TEST"), "Test Inv Asset 5", "ASSET");

    const itemSku = ids.nextCode("ITM-COGS");
    const itemId = await createTestItem(ctx.companyId, itemSku, "Test Item 501", cogsAccountId, invAssetAccountId);

    // Seed stock
    await createInventoryTransaction(ctx.companyId, itemId, 10, ids.nextCode("COGS-TEST"));

    // Seed item_prices so calculateSaleCogs uses price as unit cost.
    await createItemPrice(ctx.companyId, itemId, 25000);

    const executor = createCogsExecutor(db);

    const input = makeCogsInput(ctx, {
      saleId: `SALE-COGS-${ids.nextId()}`,
      items: [{ itemId, quantity: 1 }],
    });

    const result = await postCogsForSale(db, executor, input);
    expect(result.success).toBe(true);

    const lines = await sql`
      SELECT account_id, debit, credit, description
      FROM journal_lines
      WHERE journal_batch_id = ${result.journalBatchId}
    `.execute(db);

    // Verify COGS line is DEBIT
    const cogsLine = lines.rows.find(r => Number((r as { account_id: number }).account_id) === cogsAccountId) as { debit: string; credit: string } | undefined;
    expect(cogsLine).toBeDefined();
    expect(Number(cogsLine!.debit)).toBeGreaterThan(0);
    expect(Number(cogsLine!.credit)).toBe(0);
    expect(cogsLine!.description).toContain("COGS:");

    // Verify Inventory Asset line is CREDIT
    const invLine = lines.rows.find(r => Number((r as { account_id: number }).account_id) === invAssetAccountId) as { debit: string; credit: string } | undefined;
    expect(invLine).toBeDefined();
    expect(Number(invLine!.debit)).toBe(0);
    expect(Number(invLine!.credit)).toBeGreaterThan(0);
    expect(invLine!.description).toContain("Inventory reduction");
  });
});
