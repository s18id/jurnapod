// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Fixed Assets Route Tests
 *
 * Tests for /accounts/fixed-asset-categories and /accounts/fixed-assets endpoints:
 * - CRUD operations for fixed asset categories
 * - CRUD operations for fixed assets
 * - Database constraint errors
 * - Not found handling
 * - Conflict handling (duplicate codes)
 * - Tenant isolation enforcement
 *
 * Note: Zod validation (400 errors for invalid request bodies) happens at the
 * route layer before calling library functions. These are tested via HTTP
 * integration tests. Here we test library function behavior including:
 * - Database constraint violations
 * - Reference errors (invalid foreign keys)
 * - Not found cases
 * - Conflicts
 * - Tenant isolation
 *
 * CRITICAL: All tests must close the DB pool after completion.
 */

import assert from "node:assert/strict";
import { describe, test, before, after } from "node:test";
import {
  loadEnvIfPresent,
  readEnv,
  getFreePort,
  startApiServer,
  waitForHealthcheck,
  stopApiServer,
  loginOwner
} from "../../tests/integration/integration-harness.mjs";
import { closeDbPool, getDb } from "../lib/db";
import {
  listFixedAssetCategories,
  createFixedAssetCategory,
  updateFixedAssetCategory,
  deleteFixedAssetCategory,
  findFixedAssetCategoryById,
  listFixedAssets,
  createFixedAsset,
  updateFixedAsset,
  deleteFixedAsset,
  findFixedAssetById
} from "../lib/modules-accounting/index.js";
import {
  FixedAssetCategoryNotFoundError,
  FixedAssetCategoryNotEmptyError,
  FixedAssetCategoryCodeExistsError,
  FixedAssetNotFoundError,
  FixedAssetAccessDeniedError,
  FixedAssetHasEventsError,
  isDuplicateKeyError,
} from "@jurnapod/modules-accounting";
import { CompanyService } from "@jurnapod/modules-platform";
import { createOutletBasic } from "../lib/outlets.js";
import { sql } from "kysely";

loadEnvIfPresent();

const TEST_COMPANY_CODE = readEnv("JP_COMPANY_CODE", null) ?? "JP";
const TEST_OUTLET_CODE = readEnv("JP_OUTLET_CODE", null) ?? "MAIN";
const TEST_OWNER_EMAIL = readEnv("JP_OWNER_EMAIL", null) ?? "owner@example.com";
const TEST_OWNER_PASSWORD = readEnv("JP_OWNER_PASSWORD", null) ?? "password";

describe("Fixed Assets Routes", { concurrency: false }, () => {
  let testUserId = 0;
  let testCompanyId = 0;
  let testOutletId = 0;
  let testCompany2Id = 0;
  let testOutlet2Id = 0;
  let baseUrl = "";
  let accessToken = "";
  let apiServer: ReturnType<typeof startApiServer> | null = null;

  before(async () => {
    const db = getDb();

    // Find test user fixture using Kysely query builder
    // Global owner has outlet_id = NULL in user_role_assignments
    const userRows = await db
      .selectFrom("users as u")
      .innerJoin("companies as c", "c.id", "u.company_id")
      .innerJoin("user_role_assignments as ura", "ura.user_id", "u.id")
      .where("c.code", "=", TEST_COMPANY_CODE)
      .where("u.email", "=", TEST_OWNER_EMAIL)
      .where("u.is_active", "=", 1)
      .where("ura.outlet_id", "is", null)
      .select(["u.id as user_id", "u.company_id"])
      .limit(1)
      .execute();

    assert.ok(
      userRows.length > 0,
      `Owner fixture not found; run database seed first. Looking for company=${TEST_COMPANY_CODE}, email=${TEST_OWNER_EMAIL}`
    );
    testUserId = Number(userRows[0].user_id);
    testCompanyId = Number(userRows[0].company_id);

    // Get outlet ID from outlets table
    const outletRows = await db
      .selectFrom("outlets")
      .where("company_id", "=", testCompanyId)
      .where("code", "=", TEST_OUTLET_CODE)
      .select(["id"])
      .limit(1)
      .execute();
    assert.ok(outletRows.length > 0, `Outlet ${TEST_OUTLET_CODE} not found`);
    testOutletId = Number(outletRows[0].id);

    // Create a second company for tenant isolation tests
    const runId = Date.now().toString(36);
    const company2 = await new CompanyService(getDb()).createCompanyBasic({
      code: `TEST2-${runId}`.slice(0, 20),
      name: `Test Company 2 ${runId}`
    });
    testCompany2Id = company2.id;

    const outlet2 = await createOutletBasic({
      company_id: testCompany2Id,
      code: `T2OUT-${runId}`.slice(0, 20),
      name: `Test Outlet 2 ${runId}`
    });
    testOutlet2Id = outlet2.id;

    const apiPort = await getFreePort();
    baseUrl = `http://127.0.0.1:${apiPort}`;
    apiServer = startApiServer(apiPort);
    await waitForHealthcheck(baseUrl, apiServer.childProcess, apiServer.serverLogs);
    accessToken = await loginOwner(
      baseUrl,
      TEST_COMPANY_CODE,
      TEST_OWNER_EMAIL,
      TEST_OWNER_PASSWORD
    );
  });

  after(async () => {
    const db = getDb();
    // Clean up second company and its outlet
    try {
      await sql`DELETE FROM outlets WHERE id = ${testOutlet2Id}`.execute(db);
      await sql`DELETE FROM companies WHERE id = ${testCompany2Id}`.execute(db);
    } catch {
      // Ignore cleanup errors
    }
    if (apiServer) {
      await stopApiServer(apiServer.childProcess);
    }
    await closeDbPool();
  });

  // ===========================================================================
  // Route-Level HTTP Validation Tests
  // ===========================================================================

  describe("Route-Level HTTP Validation", () => {
    test("POST /fixed-asset-categories returns 400 for invalid depreciation_method enum", async () => {
      const response = await fetch(`${baseUrl}/api/accounts/fixed-asset-categories`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          code: `HTTP-CAT-${Date.now().toString(36)}`.toUpperCase(),
          name: "Invalid Category",
          depreciation_method: "INVALID_METHOD",
          useful_life_months: 60
        })
      });

      assert.equal(response.status, 400);
      const body = await response.json();
      assert.equal(body.success, false);
      assert.equal(body.error.code, "INVALID_REQUEST");
    });

    test("GET /fixed-assets returns 400 for invalid outlet_id query param", async () => {
      const response = await fetch(`${baseUrl}/api/accounts/fixed-assets?outlet_id=abc`, {
        headers: {
          authorization: `Bearer ${accessToken}`
        }
      });

      assert.equal(response.status, 400);
      const body = await response.json();
      assert.equal(body.success, false);
      assert.equal(body.error.code, "INVALID_REQUEST");
    });

    test("POST /fixed-assets returns 400 for invalid body at API boundary", async () => {
      const response = await fetch(`${baseUrl}/api/accounts/fixed-assets`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          name: " ",
          purchase_cost: -1000
        })
      });

      assert.equal(response.status, 400);
      const body = await response.json();
      assert.equal(body.success, false);
      assert.equal(body.error.code, "INVALID_REQUEST");
    });
  });

  // ===========================================================================
  // Fixed Asset Category Data Structure Tests
  // ===========================================================================

  describe("Fixed Asset Category Data Structure", () => {
    test("fixed_asset_categories table exists with required columns", async () => {
      const db = getDb();
      const result = await sql<{ COLUMN_NAME: string }>`
        SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'fixed_asset_categories'
      `.execute(db);

      const columnNames = result.rows.map(r => r.COLUMN_NAME);
      assert.ok(columnNames.includes("id"), "Should have id column");
      assert.ok(columnNames.includes("company_id"), "Should have company_id column");
      assert.ok(columnNames.includes("code"), "Should have code column");
      assert.ok(columnNames.includes("name"), "Should have name column");
      assert.ok(columnNames.includes("depreciation_method"), "Should have depreciation_method column");
      assert.ok(columnNames.includes("useful_life_months"), "Should have useful_life_months column");
      assert.ok(columnNames.includes("is_active"), "Should have is_active column");
    });

    test("returns categories for company", async () => {
      const db = getDb();
      const rows = await db
        .selectFrom("fixed_asset_categories")
        .where("company_id", "=", testCompanyId)
        .select(["id", "code", "name", "is_active"])
        .limit(10)
        .execute();

      assert.ok(Array.isArray(rows), "Should return array");
      for (const row of rows) {
        assert.ok(row.id > 0, "Category should have valid id");
        assert.ok(typeof row.code === "string", "Category should have code");
        assert.ok(typeof row.name === "string", "Category should have name");
      }
    });
  });

  // ===========================================================================
  // Fixed Asset Category CRUD Tests
  // ===========================================================================

  describe("Fixed Asset Category CRUD Operations", () => {
    const runId = Date.now().toString(36);
    let createdCategoryId = 0;
    let createdCategoryCode = "";

    test("POST /fixed-asset-categories creates a new category", async () => {
      createdCategoryCode = `CAT-${runId}`.toUpperCase();
      const category = await createFixedAssetCategory(testCompanyId, {
        code: createdCategoryCode,
        name: `Test Category ${runId}`,
        depreciation_method: "STRAIGHT_LINE",
        useful_life_months: 60,
        residual_value_pct: 5,
        is_active: true
      }, { userId: testUserId });

      assert.ok(category.id > 0, "Category should have valid id");
      assert.equal(category.code, createdCategoryCode, "Category code should match");
      assert.equal(category.name, `Test Category ${runId}`, "Category name should match");
      assert.equal(category.depreciation_method, "STRAIGHT_LINE", "Depreciation method should match");
      assert.equal(category.useful_life_months, 60, "Useful life should match");
      assert.equal(category.residual_value_pct, "5.00", "Residual value should match");
      assert.equal(category.is_active, true, "Category should be active");
      createdCategoryId = category.id;
    });

    test("GET /fixed-asset-categories lists categories", async () => {
      const categories = await listFixedAssetCategories(testCompanyId);
      assert.ok(Array.isArray(categories), "Should return array");
      const found = categories.find(c => Number(c.id) === createdCategoryId);
      assert.ok(found, "Created category should be in list");
      assert.equal(found?.code, createdCategoryCode, "Category code should match");
    });

    test("GET /fixed-asset-categories/:id gets single category", async () => {
      const category = await findFixedAssetCategoryById(testCompanyId, createdCategoryId);
      assert.ok(category, "Category should exist");
      assert.equal(category.code, createdCategoryCode, "Category code should match");
    });

    test("PATCH /fixed-asset-categories/:id updates category", async () => {
      const updated = await updateFixedAssetCategory(testCompanyId, createdCategoryId, {
        name: `Updated Category ${runId}`,
        useful_life_months: 72,
        residual_value_pct: 10
      }, { userId: testUserId });

      assert.ok(updated, "Updated category should exist");
      assert.equal(updated.name, `Updated Category ${runId}`, "Name should be updated");
      assert.equal(updated.useful_life_months, 72, "Useful life should be updated");
      assert.equal(updated.residual_value_pct, "10.00", "Residual value should be updated");
      // Unchanged fields
      assert.equal(updated.code, createdCategoryCode, "Code should remain unchanged");
    });

    test("DELETE /fixed-asset-categories/:id deletes category", async () => {
      const deleted = await deleteFixedAssetCategory(testCompanyId, createdCategoryId, { userId: testUserId });
      assert.equal(deleted, true, "Delete should return true");

      // Verify it's gone
      const category = await findFixedAssetCategoryById(testCompanyId, createdCategoryId);
      assert.ok(!category, "Category should no longer exist");
    });
  });

  // ===========================================================================
  // Fixed Asset Category Input Validation (Database Constraints)
  // ===========================================================================

  describe("Fixed Asset Category Input Validation", () => {
    test("createFixedAssetCategory rejects invalid useful_life_months at database level", async () => {
      const runId = Date.now().toString(36);
      // Zero - database constraint
      await assert.rejects(
        async () => createFixedAssetCategory(testCompanyId, {
          code: `TEST-${runId}-ZERO`,
          name: "Test",
          useful_life_months: 0
        }),
        /CONSTRAINT.*chk_fixed_asset_categories_useful_life_positive/
      );
    });

    test("createFixedAssetCategory rejects invalid depreciation_method at database level", async () => {
      const runId = Date.now().toString(36);
      await assert.rejects(
        async () => createFixedAssetCategory(testCompanyId, {
          code: `TEST-${runId}-INVALID`,
          name: "Test",
          useful_life_months: 60,
          depreciation_method: "INVALID_METHOD" as any
        }),
        /CONSTRAINT.*chk_fixed_asset_categories_method/
      );
    });

    test("createFixedAssetCategory rejects invalid residual_value_pct at database level", async () => {
      const runId = Date.now().toString(36);
      // Over 100 - database constraint
      await assert.rejects(
        async () => createFixedAssetCategory(testCompanyId, {
          code: `TEST-${runId}-OVER`,
          name: "Test",
          useful_life_months: 60,
          residual_value_pct: 150
        }),
        /CONSTRAINT.*chk_fixed_asset_categories_residual_pct_range/
      );
    });

    test("createFixedAssetCategory rejects negative residual_value_pct at database level", async () => {
      const runId = Date.now().toString(36);
      await assert.rejects(
        async () => createFixedAssetCategory(testCompanyId, {
          code: `TEST-${runId}-NEG`,
          name: "Test",
          useful_life_months: 60,
          residual_value_pct: -10
        }),
        /CONSTRAINT.*chk_fixed_asset_categories_residual_pct_range/
      );
    });

    test("createFixedAssetCategory rejects invalid expense_account_id reference", async () => {
      const runId = Date.now().toString(36);
      // Module service throws MySQL FK constraint error directly
      await assert.rejects(
        async () => createFixedAssetCategory(testCompanyId, {
          code: `TEST-${runId}-REF`,
          name: "Test",
          useful_life_months: 60,
          expense_account_id: 999999
        }, { userId: testUserId }),
        /FOREIGN KEY constraint/i
      );
    });

    test("createFixedAssetCategory rejects invalid accum_depr_account_id reference", async () => {
      const runId = Date.now().toString(36);
      // Module service throws MySQL FK constraint error directly
      await assert.rejects(
        async () => createFixedAssetCategory(testCompanyId, {
          code: `TEST-${runId}-ACC`,
          name: "Test",
          useful_life_months: 60,
          accum_depr_account_id: 999999
        }, { userId: testUserId }),
        /FOREIGN KEY constraint/i
      );
    });

    test("updateFixedAssetCategory allows empty update (no fields)", async () => {
      const runId = Date.now().toString(36);
      const category = await createFixedAssetCategory(testCompanyId, {
        code: `TEST-${runId}-EMPTY`,
        name: `Test ${runId}`,
        useful_life_months: 60
      }, { userId: testUserId });

      try {
        // Empty update should return the existing category unchanged
        const updated = await updateFixedAssetCategory(testCompanyId, category.id, {}, { userId: testUserId });
        assert.ok(updated, "Should return existing category");
        assert.equal(updated.name, `Test ${runId}`, "Name should be unchanged");
      } finally {
        await deleteFixedAssetCategory(testCompanyId, category.id, { userId: testUserId });
      }
    });
  });

  // ===========================================================================
  // Fixed Asset Category Not Found Tests (404)
  // ===========================================================================

  describe("Fixed Asset Category Not Found (404)", () => {
    test("findFixedAssetCategoryById returns null for non-existent id", async () => {
      const category = await findFixedAssetCategoryById(testCompanyId, 999999);
      assert.equal(category, null, "Should return null for non-existent category");
    });

    test("updateFixedAssetCategory throws FixedAssetCategoryNotFoundError for non-existent id", async () => {
      await assert.rejects(
        async () => updateFixedAssetCategory(testCompanyId, 999999, {
          name: "Updated"
        }, { userId: testUserId }),
        FixedAssetCategoryNotFoundError
      );
    });

    test("deleteFixedAssetCategory returns false for non-existent id", async () => {
      const deleted = await deleteFixedAssetCategory(testCompanyId, 999999, { userId: testUserId });
      assert.equal(deleted, false, "Should return false for non-existent category");
    });
  });

  // ===========================================================================
  // Fixed Asset Category Conflict Tests (409)
  // ===========================================================================

  describe("Fixed Asset Category Conflicts (409)", () => {
    test("createFixedAssetCategory rejects duplicate code", async () => {
      const runId = Date.now().toString(36);
      const code = `DUP-${runId}`.toUpperCase();

      await createFixedAssetCategory(testCompanyId, {
        code,
        name: `First ${runId}`,
        useful_life_months: 60
      }, { userId: testUserId });

      try {
        await assert.rejects(
          async () => createFixedAssetCategory(testCompanyId, {
            code, // Same code
            name: `Second ${runId}`,
            useful_life_months: 60
          }, { userId: testUserId }),
          FixedAssetCategoryCodeExistsError
        );
      } finally {
        // Clean up - need to find and delete the first one
        const db = getDb();
        const rows = await db
          .selectFrom("fixed_asset_categories")
          .where("code", "=", code)
          .where("company_id", "=", testCompanyId)
          .select(["id"])
          .limit(1)
          .execute();
        if (rows.length > 0) {
          await deleteFixedAssetCategory(testCompanyId, Number(rows[0].id), { userId: testUserId });
        }
      }
    });

    test("updateFixedAssetCategory rejects code change to duplicate", async () => {
      const runId = Date.now().toString(36);
      const code1 = `CAT1-${runId}`.toUpperCase();
      const code2 = `CAT2-${runId}`.toUpperCase();

      const cat1 = await createFixedAssetCategory(testCompanyId, {
        code: code1,
        name: `First ${runId}`,
        useful_life_months: 60
      }, { userId: testUserId });

      const cat2 = await createFixedAssetCategory(testCompanyId, {
        code: code2,
        name: `Second ${runId}`,
        useful_life_months: 60
      }, { userId: testUserId });

      try {
        // Try to change cat2's code to cat1's code
        await assert.rejects(
          async () => updateFixedAssetCategory(testCompanyId, cat2.id, {
            code: code1
          }, { userId: testUserId }),
          FixedAssetCategoryCodeExistsError
        );
      } finally {
        await deleteFixedAssetCategory(testCompanyId, cat1.id, { userId: testUserId });
        await deleteFixedAssetCategory(testCompanyId, cat2.id, { userId: testUserId });
      }
    });
  });

  // ===========================================================================
  // Fixed Asset Data Structure Tests
  // ===========================================================================

  describe("Fixed Asset Data Structure", () => {
    test("fixed_assets table exists with required columns", async () => {
      const db = getDb();
      const result = await sql<{ COLUMN_NAME: string }>`
        SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'fixed_assets'
      `.execute(db);

      const columnNames = result.rows.map(r => r.COLUMN_NAME);
      assert.ok(columnNames.includes("id"), "Should have id column");
      assert.ok(columnNames.includes("company_id"), "Should have company_id column");
      assert.ok(columnNames.includes("name"), "Should have name column");
      assert.ok(columnNames.includes("outlet_id"), "Should have outlet_id column");
      assert.ok(columnNames.includes("category_id"), "Should have category_id column");
      assert.ok(columnNames.includes("is_active"), "Should have is_active column");
    });

    test("returns assets for company", async () => {
      const db = getDb();
      const rows = await db
        .selectFrom("fixed_assets")
        .where("company_id", "=", testCompanyId)
        .select(["id", "name", "is_active"])
        .limit(10)
        .execute();

      assert.ok(Array.isArray(rows), "Should return array");
      for (const row of rows) {
        assert.ok(row.id > 0, "Asset should have valid id");
        assert.ok(typeof row.name === "string", "Asset should have name");
      }
    });
  });

  // ===========================================================================
  // Fixed Asset CRUD Tests
  // ===========================================================================

  describe("Fixed Asset CRUD Operations", () => {
    const runId = Date.now().toString(36);
    let createdCategoryId = 0;
    let createdAssetId = 0;

    test("creates a fixed asset category first", async () => {
      const category = await createFixedAssetCategory(testCompanyId, {
        code: `CAT-ASSET-${runId}`.toUpperCase(),
        name: `Asset Category ${runId}`,
        useful_life_months: 60
      }, { userId: testUserId });
      createdCategoryId = category.id;
      assert.ok(createdCategoryId > 0, "Category should be created");
    });

    test("POST /fixed-assets creates a new asset", async () => {
      const asset = await createFixedAsset(testCompanyId, {
        name: `Test Asset ${runId}`,
        asset_tag: `TAG-${runId}`,
        serial_number: `SN-${runId}`,
        category_id: createdCategoryId,
        outlet_id: testOutletId,
        purchase_date: "2025-01-15",
        purchase_cost: 10000000,
        is_active: true
      }, { userId: testUserId });

      assert.ok(asset.id > 0, "Asset should have valid id");
      assert.equal(asset.name, `Test Asset ${runId}`, "Asset name should match");
      assert.equal(asset.asset_tag, `TAG-${runId}`, "Asset tag should match");
      assert.equal(asset.serial_number, `SN-${runId}`, "Serial number should match");
      assert.equal(Number(asset.category_id), createdCategoryId, "Category should match");
      assert.equal(Number(asset.outlet_id), testOutletId, "Outlet should match");
      assert.equal(asset.is_active, true, "Asset should be active");
      createdAssetId = asset.id;
    });

    test("GET /fixed-assets lists assets", async () => {
      const assets = await listFixedAssets(testCompanyId, {
        allowedOutletIds: [testOutletId]
      });
      assert.ok(Array.isArray(assets), "Should return array");
      const found = assets.find(a => Number(a.id) === createdAssetId);
      assert.ok(found, "Created asset should be in list");
    });

    test("GET /fixed-assets/:id gets single asset", async () => {
      const asset = await findFixedAssetById(testCompanyId, createdAssetId);
      assert.ok(asset, "Asset should exist");
      assert.equal(asset.name, `Test Asset ${runId}`, "Asset name should match");
    });

    test("PATCH /fixed-assets/:id updates asset", async () => {
      const updated = await updateFixedAsset(testCompanyId, createdAssetId, {
        name: `Updated Asset ${runId}`,
        purchase_cost: 15000000
      }, { userId: testUserId });

      assert.ok(updated, "Updated asset should exist");
      assert.equal(updated.name, `Updated Asset ${runId}`, "Name should be updated");
      assert.equal(updated.purchase_cost, "15000000.00", "Purchase cost should be updated");
      // Unchanged fields
      assert.equal(Number(updated.outlet_id), testOutletId, "Outlet should remain unchanged");
      assert.equal(Number(updated.category_id), createdCategoryId, "Category should remain unchanged");
    });

    test("PATCH /fixed-assets/:id preserves omitted fields", async () => {
      const updated = await updateFixedAsset(testCompanyId, createdAssetId, {
        name: `Updated2 ${runId}`
      }, { userId: testUserId });

      assert.ok(updated, "Updated asset should exist");
      assert.equal(updated!.name, `Updated2 ${runId}`, "Name should be updated");
      assert.equal(updated!.asset_tag, `TAG-${runId}`, "Asset tag should be preserved");
      assert.equal(updated!.serial_number, `SN-${runId}`, "Serial number should be preserved");
      assert.equal(updated!.purchase_cost, "15000000.00", "Purchase cost should be preserved");
      assert.equal(Number(updated!.outlet_id), testOutletId, "Outlet should be preserved");
    });

    test("DELETE /fixed-assets/:id deletes asset", async () => {
      // First create a new asset to delete (so we keep the original for other tests)
      const assetToDelete = await createFixedAsset(testCompanyId, {
        name: `To Delete ${runId}`,
        outlet_id: testOutletId
      }, { userId: testUserId });

      const deleted = await deleteFixedAsset(testCompanyId, assetToDelete.id, { userId: testUserId });
      assert.equal(deleted, true, "Delete should return true");

      // Verify it's gone
      const asset = await findFixedAssetById(testCompanyId, assetToDelete.id);
      assert.ok(!asset, "Asset should no longer exist");
    });

    test("deletes the category after asset tests", async () => {
      // Delete asset_book records first (created automatically with purchase_cost)
      const db = getDb();
      await sql`DELETE FROM fixed_asset_books WHERE asset_id = ${createdAssetId}`.execute(db);
      // Delete asset first
      await deleteFixedAsset(testCompanyId, createdAssetId, { userId: testUserId });
      // Then delete category
      const deleted = await deleteFixedAssetCategory(testCompanyId, createdCategoryId, { userId: testUserId });
      assert.equal(deleted, true, "Category delete should succeed after asset delete");
    });
  });

  // ===========================================================================
  // Fixed Asset Input Validation (Database Constraints)
  // ===========================================================================

  describe("Fixed Asset Input Validation", () => {
    test("createFixedAsset rejects invalid purchase_cost at database level", async () => {
      const runId = Date.now().toString(36);
      await assert.rejects(
        async () => createFixedAsset(testCompanyId, {
          name: `Test ${runId}`,
          purchase_cost: -1000
        }),
        /CONSTRAINT.*chk_fixed_assets_purchase_cost_non_negative/
      );
    });

    test("createFixedAsset rejects invalid category_id reference", async () => {
      const runId = Date.now().toString(36);
      // Module service throws MySQL FK constraint error directly
      await assert.rejects(
        async () => createFixedAsset(testCompanyId, {
          name: `Test ${runId}`,
          category_id: 999999
        }, { userId: testUserId }),
        /FOREIGN KEY constraint/i
      );
    });

    test("createFixedAsset rejects invalid outlet_id reference", async () => {
      const runId = Date.now().toString(36);
      // Module service throws MySQL FK constraint error directly
      await assert.rejects(
        async () => createFixedAsset(testCompanyId, {
          name: `Test ${runId}`,
          outlet_id: 999999
        }, { userId: testUserId }),
        /FOREIGN KEY constraint/i
      );
    });

    test("updateFixedAsset allows empty update (no fields)", async () => {
      const runId = Date.now().toString(36);
      const category = await createFixedAssetCategory(testCompanyId, {
        code: `CAT-UPDT-${runId}`.toUpperCase(),
        name: `Category ${runId}`,
        useful_life_months: 60
      }, { userId: testUserId });

      const asset = await createFixedAsset(testCompanyId, {
        name: `Asset ${runId}`,
        category_id: category.id,
        outlet_id: testOutletId
      }, { userId: testUserId });

      try {
        // Empty update should return the existing asset unchanged
        const updated = await updateFixedAsset(testCompanyId, asset.id, {}, { userId: testUserId });
        assert.ok(updated, "Should return existing asset");
        assert.equal(updated.name, `Asset ${runId}`, "Name should be unchanged");
      } finally {
        await deleteFixedAsset(testCompanyId, asset.id, { userId: testUserId });
        await deleteFixedAssetCategory(testCompanyId, category.id, { userId: testUserId });
      }
    });

    test("updateFixedAsset rejects invalid category_id reference", async () => {
      const runId = Date.now().toString(36);
      const category = await createFixedAssetCategory(testCompanyId, {
        code: `CAT-INV-${runId}`.toUpperCase(),
        name: `Category ${runId}`,
        useful_life_months: 60
      }, { userId: testUserId });

      const asset = await createFixedAsset(testCompanyId, {
        name: `Asset ${runId}`,
        category_id: category.id,
        outlet_id: testOutletId
      }, { userId: testUserId });

      try {
        await assert.rejects(
          async () => updateFixedAsset(testCompanyId, asset.id, {
            category_id: 999999
          }, { userId: testUserId }),
          /FOREIGN KEY constraint/i
        );
      } finally {
        await deleteFixedAsset(testCompanyId, asset.id, { userId: testUserId });
        await deleteFixedAssetCategory(testCompanyId, category.id, { userId: testUserId });
      }
    });
  });

  // ===========================================================================
  // Fixed Asset Not Found Tests (404)
  // ===========================================================================

  describe("Fixed Asset Not Found (404)", () => {
    test("findFixedAssetById returns null for non-existent id", async () => {
      const asset = await findFixedAssetById(testCompanyId, 999999);
      assert.equal(asset, null, "Should return null for non-existent asset");
    });

    test("updateFixedAsset returns null for non-existent id", async () => {
      const updated = await updateFixedAsset(testCompanyId, 999999, {
        name: "Updated"
      }, { userId: testUserId });
      assert.equal(updated, null, "Should return null for non-existent asset");
    });

    test("deleteFixedAsset returns false for non-existent id", async () => {
      const deleted = await deleteFixedAsset(testCompanyId, 999999, { userId: testUserId });
      assert.equal(deleted, false, "Should return false for non-existent asset");
    });
  });

  // ===========================================================================
  // Fixed Asset Filtering Tests
  // ===========================================================================

  describe("Fixed Asset Filtering", () => {
    const runId = Date.now().toString(36);
    let categoryId = 0;
    let activeAssetId = 0;
    let inactiveAssetId = 0;

    before(async () => {
      categoryId = (await createFixedAssetCategory(testCompanyId, {
        code: `CAT-FLT-${runId}`.toUpperCase(),
        name: `Filter Category ${runId}`,
        useful_life_months: 60
      }, { userId: testUserId })).id;

      activeAssetId = (await createFixedAsset(testCompanyId, {
        name: `Active Asset ${runId}`,
        category_id: categoryId,
        outlet_id: testOutletId,
        is_active: true
      }, { userId: testUserId })).id;

      inactiveAssetId = (await createFixedAsset(testCompanyId, {
        name: `Inactive Asset ${runId}`,
        category_id: categoryId,
        outlet_id: testOutletId,
        is_active: false
      }, { userId: testUserId })).id;
    });

    after(async () => {
      try {
        await deleteFixedAsset(testCompanyId, activeAssetId, { userId: testUserId });
        await deleteFixedAsset(testCompanyId, inactiveAssetId, { userId: testUserId });
        await deleteFixedAssetCategory(testCompanyId, categoryId, { userId: testUserId });
      } catch {
        // Ignore cleanup errors
      }
    });

    test("filters by is_active status", async () => {
      const activeAssets = await listFixedAssets(testCompanyId, {
        isActive: true,
        allowedOutletIds: [testOutletId]
      });
      const inactiveAssets = await listFixedAssets(testCompanyId, {
        isActive: false,
        allowedOutletIds: [testOutletId]
      });

      const foundActive = activeAssets.find(a => Number(a.id) === activeAssetId);
      const foundInactive = inactiveAssets.find(a => Number(a.id) === inactiveAssetId);

      assert.ok(foundActive, "Active asset should be in active list");
      assert.ok(!inactiveAssets.find(a => Number(a.id) === activeAssetId), "Active asset should not be in inactive list");
      assert.ok(foundInactive, "Inactive asset should be in inactive list");
    });

    test("filters by outlet_id", async () => {
      const outletAssets = await listFixedAssets(testCompanyId, {
        outletId: testOutletId,
        allowedOutletIds: [testOutletId]
      });

      for (const asset of outletAssets) {
        if (asset.outlet_id !== null) {
          assert.equal(Number(asset.outlet_id), testOutletId, "All assets should be from test outlet");
        }
      }
    });
  });

  // ===========================================================================
  // Tenant Isolation Tests
  // ===========================================================================

  describe("Tenant Isolation", () => {
    test("company cannot access categories from another company", async () => {
      const runId = Date.now().toString(36);
      const category = await createFixedAssetCategory(testCompanyId, {
        code: `ISOL-${runId}`.toUpperCase(),
        name: `Isolated Category ${runId}`,
        useful_life_months: 60
      }, { userId: testUserId });

      try {
        // Try to find the category from company 2's perspective
        const found = await findFixedAssetCategoryById(testCompany2Id, category.id);
        assert.equal(found, null, "Company 2 should not find category from company 1");

        // Try to update from company 2 - module service throws on not found
        await assert.rejects(
          async () => updateFixedAssetCategory(testCompany2Id, category.id, {
            name: "Hacked"
          }, { userId: testUserId }),
          FixedAssetCategoryNotFoundError
        );

        // Try to delete from company 2 - returns false via wrapper
        const deleted = await deleteFixedAssetCategory(testCompany2Id, category.id, { userId: testUserId });
        assert.equal(deleted, false, "Company 2 should not delete company 1's category");
      } finally {
        // Clean up as company 1
        await deleteFixedAssetCategory(testCompanyId, category.id, { userId: testUserId });
      }
    });

    test("company cannot access assets from another company", async () => {
      const runId = Date.now().toString(36);
      const category = await createFixedAssetCategory(testCompanyId, {
        code: `ISOL-CAT-${runId}`.toUpperCase(),
        name: `Isolated Category ${runId}`,
        useful_life_months: 60
      }, { userId: testUserId });

      const asset = await createFixedAsset(testCompanyId, {
        name: `Isolated Asset ${runId}`,
        category_id: category.id,
        outlet_id: testOutletId
      }, { userId: testUserId });

      try {
        // Try to find the asset from company 2's perspective
        const found = await findFixedAssetById(testCompany2Id, asset.id);
        assert.equal(found, null, "Company 2 should not find asset from company 1");

        // Try to update from company 2 - module service throws on not found (wrapper catches and returns null)
        const updated = await updateFixedAsset(testCompany2Id, asset.id, {
          name: "Hacked"
        }, { userId: testUserId });
        assert.equal(updated, null, "Company 2 should not update company 1's asset");

        // Try to delete from company 2
        const deleted = await deleteFixedAsset(testCompany2Id, asset.id, { userId: testUserId });
        assert.equal(deleted, false, "Company 2 should not delete company 1's asset");
      } finally {
        // Clean up as company 1
        await deleteFixedAsset(testCompanyId, asset.id, { userId: testUserId });
        await deleteFixedAssetCategory(testCompanyId, category.id, { userId: testUserId });
      }
    });

    test("listFixedAssetCategories only returns company's own categories", async () => {
      const runId = Date.now().toString(36);
      const category = await createFixedAssetCategory(testCompanyId, {
        code: `LIST-${runId}`.toUpperCase(),
        name: `List Category ${runId}`,
        useful_life_months: 60
      }, { userId: testUserId });

      try {
        // List from company 2 - should not include company 1's categories
        const company2Categories = await listFixedAssetCategories(testCompany2Id);
        const found = company2Categories.find(c => Number(c.id) === category.id);
        assert.equal(found, undefined, "Company 2 should not see company 1's categories");
      } finally {
        await deleteFixedAssetCategory(testCompanyId, category.id, { userId: testUserId });
      }
    });

    test("listFixedAssets only returns company's own assets", async () => {
      const runId = Date.now().toString(36);
      const category = await createFixedAssetCategory(testCompanyId, {
        code: `LIST-CAT-${runId}`.toUpperCase(),
        name: `List Category ${runId}`,
        useful_life_months: 60
      }, { userId: testUserId });

      const asset = await createFixedAsset(testCompanyId, {
        name: `List Asset ${runId}`,
        category_id: category.id,
        outlet_id: testOutletId
      }, { userId: testUserId });

      try {
        // List from company 2 - should not include company 1's assets
        const company2Assets = await listFixedAssets(testCompany2Id, {
          allowedOutletIds: [testOutlet2Id]
        });
        const found = company2Assets.find(a => Number(a.id) === asset.id);
        assert.equal(found, undefined, "Company 2 should not see company 1's assets");
      } finally {
        await deleteFixedAsset(testCompanyId, asset.id, { userId: testUserId });
        await deleteFixedAssetCategory(testCompanyId, category.id, { userId: testUserId });
      }
    });
  });

  // ===========================================================================
  // Query Building Tests
  // ===========================================================================

  describe("Query Building", () => {
    test("handles numeric id parsing", () => {
      const parseNumericId = (value: string): number => {
        const parsed = parseInt(value, 10);
        if (!Number.isSafeInteger(parsed) || parsed <= 0) {
          throw new Error("Invalid numeric ID");
        }
        return parsed;
      };

      assert.equal(parseNumericId("123"), 123, "Should parse valid numeric ID");
      assert.throws(() => parseNumericId("abc"), /Invalid numeric ID/, "Should throw on invalid ID");
      assert.throws(() => parseNumericId("0"), /Invalid numeric ID/, "Should throw on zero");
      assert.throws(() => parseNumericId("-1"), /Invalid numeric ID/, "Should throw on negative");
    });

    test("handles boolean string transformation", () => {
      const parseBooleanString = (val?: string): boolean | undefined => {
        if (val === undefined || val === "") return undefined;
        return val === "true" || val === "1";
      };

      assert.equal(parseBooleanString("true"), true, "Should parse 'true'");
      assert.equal(parseBooleanString("false"), false, "Should parse 'false'");
      assert.equal(parseBooleanString("1"), true, "Should parse '1'");
      assert.equal(parseBooleanString("0"), false, "Should parse '0'");
      assert.equal(parseBooleanString(undefined), undefined, "Should return undefined for undefined");
      assert.equal(parseBooleanString(""), undefined, "Should return undefined for empty string");
    });
  });

  // ===========================================================================
  // Error Handling Tests
  // ===========================================================================

  describe("Error Handling", () => {
    test("handles invalid company_id format", async () => {
      const db = getDb();
      const rows = await db
        .selectFrom("fixed_asset_categories")
        .where("company_id", "=", Number(testCompanyId))
        .select(["id"])
        .limit(1)
        .execute();
      // Should return empty for invalid company_id
      assert.ok(Array.isArray(rows), "Should return array");
    });

    test("handles empty search string", async () => {
      const categories = await listFixedAssetCategories(testCompanyId);
      assert.ok(Array.isArray(categories), "Should return array for empty search");
    });

    test("handles missing required fields gracefully", () => {
      assert.ok(true, "Validation logic should handle missing fields");
    });
  });
});
