// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { setupIntegrationTests } from "./integration-harness.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const apiRoot = path.resolve(__dirname, "../..");
const repoRoot = path.resolve(apiRoot, "../..");
const ENV_PATH = path.resolve(repoRoot, ".env");
const TEST_TIMEOUT_MS = 180000;

const testContext = setupIntegrationTests(test);

function readEnv(name, fallback = null) {
  const value = process.env[name];
  if (value == null || value.length === 0) {
    if (fallback != null) {
      return fallback;
    }
    throw new Error(`${name} is required for integration test`);
  }
  return value;
}

// =============================================================================
// Test 1: Valid FKs pass validation
// =============================================================================

test(
  "import FK validation: should pass validation when item_group_id exists",
  { timeout: TEST_TIMEOUT_MS, concurrency: false },
  async () => {
    const loadEnvFile = process.loadEnvFile;
    if (typeof loadEnvFile === "function") {
      loadEnvFile(ENV_PATH);
    }

    const db = testContext.db;
    const companyCode = readEnv("JP_COMPANY_CODE", "JP");
    const ownerEmail = readEnv("JP_OWNER_EMAIL").toLowerCase();
    const ownerPassword = readEnv("JP_OWNER_PASSWORD");
    const baseUrl = testContext.baseUrl;
    const runId = Date.now().toString(36);

    // Login as owner
    const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ companyCode, email: ownerEmail, password: ownerPassword })
    });
    assert.equal(loginResponse.status, 200);
    const loginBody = await loginResponse.json();
    const accessToken = loginBody.data.access_token;

    // Get user info to find company_id
    const meResponse = await fetch(`${baseUrl}/api/users/me`, {
      headers: { authorization: `Bearer ${accessToken}` }
    });
    const meBody = await meResponse.json();
    const companyId = meBody.data.company_id;

    let itemGroupId = null;
    const itemGroupCode = `FK-TEST-${runId}`;
    const testSku = `FK-VALID-${runId}`;

    try {
      // Step 1: Create an item_group via API
      const createGroupResponse = await fetch(`${baseUrl}/api/inventory/item-groups`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          name: `FK Test Group ${runId}`,
          code: itemGroupCode,
          is_active: true
        })
      });

      assert.equal(createGroupResponse.status, 201, "Should create item group successfully");
      const groupData = await createGroupResponse.json();
      itemGroupId = Number(groupData.data.id);
      assert.ok(itemGroupId > 0, "Should have valid item group ID");

      // Step 2: Upload CSV with item referencing the item_group_id
      // Note: DB constraint only allows SERVICE, PRODUCT, INGREDIENT, RECIPE (not INVENTORY)
      const csvContent = `sku,name,item_type,barcode,item_group_id,is_active
${testSku},Test Item With Valid FK,SERVICE,${runId}0001,${itemGroupId},true`;

      const formData = new FormData();
      const csvBlob = new Blob([csvContent], { type: "text/csv" });
      formData.append("file", csvBlob, "items.csv");

      const uploadResponse = await fetch(`${baseUrl}/api/import/items/upload`, {
        method: "POST",
        headers: { authorization: `Bearer ${accessToken}` },
        body: formData
      });

      assert.equal(uploadResponse.status, 200);
      const uploadBody = await uploadResponse.json();
      const uploadId = uploadBody.data.uploadId;

      // Step 3: Validate - should succeed because FK exists
      const validateResponse = await fetch(`${baseUrl}/api/import/items/validate`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          uploadId,
          mappings: [
            { sourceColumn: "sku", targetField: "sku" },
            { sourceColumn: "name", targetField: "name" },
            { sourceColumn: "item_type", targetField: "item_type" },
            { sourceColumn: "barcode", targetField: "barcode" },
            { sourceColumn: "item_group_id", targetField: "item_group_id" },
            { sourceColumn: "is_active", targetField: "is_active" }
          ]
        })
      });

      assert.equal(validateResponse.status, 200);
      const validateBody = await validateResponse.json();
      assert.equal(validateBody.success, true, "Validation should succeed");
      assert.equal(validateBody.data.errorRows, 0, "Should have no error rows");
      assert.equal(validateBody.data.validRows, 1, "Should have 1 valid row");

      // Step 4: Apply and verify item was created
      const applyResponse = await fetch(`${baseUrl}/api/import/items/apply`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          uploadId,
          mappings: [
            { sourceColumn: "sku", targetField: "sku" },
            { sourceColumn: "name", targetField: "name" },
            { sourceColumn: "item_type", targetField: "item_type" },
            { sourceColumn: "barcode", targetField: "barcode" },
            { sourceColumn: "item_group_id", targetField: "item_group_id" },
            { sourceColumn: "is_active", targetField: "is_active" }
          ]
        })
      });

      assert.equal(applyResponse.status, 200);
      const applyBody = await applyResponse.json();
      assert.equal(applyBody.success, true, `Apply should succeed. Errors: ${JSON.stringify(applyBody.error || applyBody)}`);
      assert.ok(applyBody.data.created >= 1 || applyBody.data.updated >= 1, `Should have created or updated at least 1 item. Got: ${JSON.stringify(applyBody.data)}`);

      // Verify item exists with correct FK
      const [items] = await db.execute(
        `SELECT id, sku, item_group_id FROM items WHERE company_id = ? AND sku = ?`,
        [companyId, testSku]
      );
      assert.ok(items.length === 1, "Item should exist");
      assert.equal(Number(items[0].item_group_id), itemGroupId, "Item should have correct item_group_id");
    } finally {
      // Cleanup: delete item first (foreign key dependency)
      await db.execute(`DELETE FROM items WHERE company_id = ? AND sku = ?`, [companyId, testSku]);
      // Then delete item group
      if (itemGroupId !== null) {
        await db.execute(`DELETE FROM item_groups WHERE company_id = ? AND id = ?`, [companyId, itemGroupId]);
      }
    }
  }
);

// =============================================================================
// Test 2: Invalid FKs fail validation
// =============================================================================

test(
  "import FK validation: should fail validation when item_group_id does not exist",
  { timeout: TEST_TIMEOUT_MS, concurrency: false },
  async () => {
    const loadEnvFile = process.loadEnvFile;
    if (typeof loadEnvFile === "function") {
      loadEnvFile(ENV_PATH);
    }

    const companyCode = readEnv("JP_COMPANY_CODE", "JP");
    const ownerEmail = readEnv("JP_OWNER_EMAIL").toLowerCase();
    const ownerPassword = readEnv("JP_OWNER_PASSWORD");
    const baseUrl = testContext.baseUrl;
    const runId = Date.now().toString(36);
    const testSku = `FK-INVALID-${runId}`;

    // Login as owner
    const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ companyCode, email: ownerEmail, password: ownerPassword })
    });
    assert.equal(loginResponse.status, 200);
    const loginBody = await loginResponse.json();
    const accessToken = loginBody.data.access_token;

    try {
      // Upload CSV with non-existent item_group_id (999999)
      // Note: DB constraint only allows SERVICE, PRODUCT, INGREDIENT, RECIPE (not INVENTORY)
      const csvContent = `sku,name,item_type,barcode,item_group_id,is_active
${testSku},Test Item With Invalid FK,SERVICE,${runId}0001,999999,true`;

      const formData = new FormData();
      const csvBlob = new Blob([csvContent], { type: "text/csv" });
      formData.append("file", csvBlob, "items.csv");

      const uploadResponse = await fetch(`${baseUrl}/api/import/items/upload`, {
        method: "POST",
        headers: { authorization: `Bearer ${accessToken}` },
        body: formData
      });

      assert.equal(uploadResponse.status, 200);
      const uploadBody = await uploadResponse.json();
      const uploadId = uploadBody.data.uploadId;

      // Validate - should fail because FK doesn't exist
      const validateResponse = await fetch(`${baseUrl}/api/import/items/validate`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          uploadId,
          mappings: [
            { sourceColumn: "sku", targetField: "sku" },
            { sourceColumn: "name", targetField: "name" },
            { sourceColumn: "item_type", targetField: "item_type" },
            { sourceColumn: "barcode", targetField: "barcode" },
            { sourceColumn: "item_group_id", targetField: "item_group_id" },
            { sourceColumn: "is_active", targetField: "is_active" }
          ]
        })
      });

      assert.equal(validateResponse.status, 200);
      const validateBody = await validateResponse.json();
      assert.equal(validateBody.success, true, "Validation should return success but mark rows as invalid");
      assert.equal(validateBody.data.errorRows, 1, "Should have 1 error row");
      assert.equal(validateBody.data.validRows, 0, "Should have 0 valid rows");

      // Verify the error mentions the invalid FK
      const fkErrors = validateBody.data.errors.filter(
        e => e.column === "item_group_id" || e.message.includes("item_group")
      );
      assert.ok(fkErrors.length > 0, "Should have error about invalid item_group_id");
      assert.ok(
        fkErrors.some(e => e.message.toLowerCase().includes("does not exist") || e.message.includes("999999")),
        "Error should mention the invalid FK value"
      );
    } finally {
      // No cleanup needed - item was not created
    }
  }
);

// =============================================================================
// Test 3: Mixed valid/invalid FKs - partial failure
// =============================================================================

test(
  "import FK validation: should handle mixed valid and invalid FKs correctly",
  { timeout: TEST_TIMEOUT_MS, concurrency: false },
  async () => {
    const loadEnvFile = process.loadEnvFile;
    if (typeof loadEnvFile === "function") {
      loadEnvFile(ENV_PATH);
    }

    const db = testContext.db;
    const companyCode = readEnv("JP_COMPANY_CODE", "JP");
    const ownerEmail = readEnv("JP_OWNER_EMAIL").toLowerCase();
    const ownerPassword = readEnv("JP_OWNER_PASSWORD");
    const baseUrl = testContext.baseUrl;
    const runId = Date.now().toString(36);

    // Login as owner
    const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ companyCode, email: ownerEmail, password: ownerPassword })
    });
    assert.equal(loginResponse.status, 200);
    const loginBody = await loginResponse.json();
    const accessToken = loginBody.data.access_token;

    // Get user info to find company_id
    const meResponse = await fetch(`${baseUrl}/api/users/me`, {
      headers: { authorization: `Bearer ${accessToken}` }
    });
    const meBody = await meResponse.json();
    const companyId = meBody.data.company_id;

    let itemGroupId = null;
    const itemGroupCode = `MIXED-${runId}`;
    const testSku1 = `MIXED-VALID-${runId}`;
    const testSku2 = `MIXED-INVALID-${runId}`;

    try {
      // Step 1: Create an item_group via API
      const createGroupResponse = await fetch(`${baseUrl}/api/inventory/item-groups`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          name: `Mixed Test Group ${runId}`,
          code: itemGroupCode,
          is_active: true
        })
      });

      assert.equal(createGroupResponse.status, 201, "Should create item group successfully");
      const groupData = await createGroupResponse.json();
      itemGroupId = Number(groupData.data.id);

      // Step 2: Upload CSV with mixed FKs - row 1 valid, row 2 invalid
      // Note: DB constraint only allows SERVICE, PRODUCT, INGREDIENT, RECIPE (not INVENTORY)
      const csvContent = `sku,name,item_type,barcode,item_group_id,is_active
${testSku1},Valid FK Item,SERVICE,${runId}0001,${itemGroupId},true
${testSku2},Invalid FK Item,SERVICE,${runId}0002,999999,true`;

      const formData = new FormData();
      const csvBlob = new Blob([csvContent], { type: "text/csv" });
      formData.append("file", csvBlob, "items.csv");

      const uploadResponse = await fetch(`${baseUrl}/api/import/items/upload`, {
        method: "POST",
        headers: { authorization: `Bearer ${accessToken}` },
        body: formData
      });

      assert.equal(uploadResponse.status, 200);
      const uploadBody = await uploadResponse.json();
      const uploadId = uploadBody.data.uploadId;

      // Step 3: Validate - should have partial failure
      const validateResponse = await fetch(`${baseUrl}/api/import/items/validate`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          uploadId,
          mappings: [
            { sourceColumn: "sku", targetField: "sku" },
            { sourceColumn: "name", targetField: "name" },
            { sourceColumn: "item_type", targetField: "item_type" },
            { sourceColumn: "barcode", targetField: "barcode" },
            { sourceColumn: "item_group_id", targetField: "item_group_id" },
            { sourceColumn: "is_active", targetField: "is_active" }
          ]
        })
      });

      assert.equal(validateResponse.status, 200);
      const validateBody = await validateResponse.json();
      assert.equal(validateBody.success, true);
      assert.equal(validateBody.data.totalRows, 2, "Should have 2 total rows");
      assert.equal(validateBody.data.validRows, 1, "Should have 1 valid row (row 1 with valid FK)");
      assert.equal(validateBody.data.errorRows, 1, "Should have 1 error row (row 2 with invalid FK)");

      // Verify error mentions invalid FK
      const fkErrors = validateBody.data.errors.filter(
        e => e.column === "item_group_id"
      );
      assert.ok(fkErrors.length > 0, "Should have error about invalid item_group_id");
      assert.ok(
        fkErrors.some(e => e.message.includes("999999")),
        "Error should mention the invalid FK value"
      );
    } finally {
      // Cleanup
      await db.execute(`DELETE FROM items WHERE company_id = ? AND sku IN (?, ?)`, [companyId, testSku1, testSku2]);
      if (itemGroupId !== null) {
        await db.execute(`DELETE FROM item_groups WHERE company_id = ? AND id = ?`, [companyId, itemGroupId]);
      }
    }
  }
);

// =============================================================================
// Test 4: Company isolation in FK validation
// =============================================================================

test(
  "import FK validation: should enforce company isolation - cannot reference other company's item_group",
  { timeout: TEST_TIMEOUT_MS, concurrency: false },
  async () => {
    const loadEnvFile = process.loadEnvFile;
    if (typeof loadEnvFile === "function") {
      loadEnvFile(ENV_PATH);
    }

    const db = testContext.db;
    const companyCode = readEnv("JP_COMPANY_CODE", "JP");
    const ownerEmail = readEnv("JP_OWNER_EMAIL").toLowerCase();
    const ownerPassword = readEnv("JP_OWNER_PASSWORD");
    const baseUrl = testContext.baseUrl;
    const runId = Date.now().toString(36);

    // Login as owner of company A
    const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ companyCode, email: ownerEmail, password: ownerPassword })
    });
    assert.equal(loginResponse.status, 200);
    const loginBody = await loginResponse.json();
    const accessTokenCompanyA = loginBody.data.access_token;

    // Get company A info
    const meResponseA = await fetch(`${baseUrl}/api/users/me`, {
      headers: { authorization: `Bearer ${accessTokenCompanyA}` }
    });
    const meBodyA = await meResponseA.json();
    const companyAId = meBodyA.data.company_id;

    // Create item_group in Company A
    const itemGroupCodeA = `ISOL-A-${runId}`;
    const createGroupResponseA = await fetch(`${baseUrl}/api/inventory/item-groups`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${accessTokenCompanyA}`
      },
      body: JSON.stringify({
        name: `Company A Group ${runId}`,
        code: itemGroupCodeA,
        is_active: true
      })
    });

    assert.equal(createGroupResponseA.status, 201);
    const groupDataA = await createGroupResponseA.json();
    const itemGroupIdA = Number(groupDataA.data.id);

    // Create Company B via direct DB (as other tests do)
    const companyBCode = `ISOL-B-${runId}`.slice(0, 32);
    const companyBName = `Isolation Test Company B ${runId}`;
    let companyBId = null;
    let companyBOutletId = null;
    let companyBUserId = null;

    try {
      // Insert Company B
      const [companyResult] = await db.execute(
        `INSERT INTO companies (code, name) VALUES (?, ?)`,
        [companyBCode, companyBName]
      );
      companyBId = Number(companyResult.insertId);

      // Insert outlet for Company B
      const [outletResult] = await db.execute(
        `INSERT INTO outlets (company_id, code, name) VALUES (?, ?, ?)`,
        [companyBId, "MAIN", "Main Outlet"]
      );
      companyBOutletId = Number(outletResult.insertId);

      // Create a user for Company B
      const userEmailB = `test+${runId}@companyb.example.com`;
      const [userResult] = await db.execute(
        `INSERT INTO users (company_id, email, password_hash, is_active) VALUES (?, ?, ?, ?)`,
        [companyBId, userEmailB, "$argon2id$v=19$m=65536,t=3,p=1$placeholder", true]
      );
      companyBUserId = Number(userResult.insertId);

      // Assign user to outlet
      await db.execute(
        `INSERT INTO user_outlets (user_id, outlet_id) VALUES (?, ?)`,
        [companyBUserId, companyBOutletId]
      );

      // Assign OWNER role to user in Company B
      const [roleRows] = await db.execute(
        `SELECT id FROM roles WHERE code = 'OWNER' LIMIT 1`
      );
      if (roleRows[0]) {
        await db.execute(
          `INSERT INTO user_role_assignments (user_id, role_id) VALUES (?, ?)`,
          [companyBUserId, Number(roleRows[0].id)]
        );
      }

      // Create a temp password for Company B user (directly set hash)
      // We'll use a workaround: change password via API or use a seeded user
      // Actually, let's just use the owner from Company A but create the item as Company B
      // Since we can't easily create a Company B owner, let's use a different approach:
      // We simulate Company B's context by having Company A try to import with a FK from Company A
      // into a scenario where FK lookup is company-scoped

      // For this test, we verify that when importing as Company A,
      // an item_group_id from Company A is valid, but Company A cannot see Company B's groups
      // This is inherently tested by the fact that batchValidateForeignKeys uses companyId in WHERE clause

      // Let's create an item_group in Company B directly in DB
      const [groupResultB] = await db.execute(
        `INSERT INTO item_groups (company_id, code, name, is_active) VALUES (?, ?, ?, ?)`,
        [companyBId, `ISOL-B-GROUP-${runId}`, "Company B Group", true]
      );
      const itemGroupIdB = Number(groupResultB.insertId);

      // Now login as Company A owner and try to import with Company B's item_group_id
      // Note: DB constraint only allows SERVICE, PRODUCT, INGREDIENT, RECIPE (not INVENTORY)
      const testSku = `ISOL-TEST-${runId}`;
      const csvContent = `sku,name,item_type,barcode,item_group_id,is_active
${testSku},Cross-Company FK Item,SERVICE,${runId}0001,${itemGroupIdB},true`;

      const formData = new FormData();
      const csvBlob = new Blob([csvContent], { type: "text/csv" });
      formData.append("file", csvBlob, "items.csv");

      const uploadResponse = await fetch(`${baseUrl}/api/import/items/upload`, {
        method: "POST",
        headers: { authorization: `Bearer ${accessTokenCompanyA}` },
        body: formData
      });

      assert.equal(uploadResponse.status, 200);
      const uploadBody = await uploadResponse.json();
      const uploadId = uploadBody.data.uploadId;

      // Validate - should fail because Company A cannot see Company B's item_groups
      const validateResponse = await fetch(`${baseUrl}/api/import/items/validate`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessTokenCompanyA}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          uploadId,
          mappings: [
            { sourceColumn: "sku", targetField: "sku" },
            { sourceColumn: "name", targetField: "name" },
            { sourceColumn: "item_type", targetField: "item_type" },
            { sourceColumn: "barcode", targetField: "barcode" },
            { sourceColumn: "item_group_id", targetField: "item_group_id" },
            { sourceColumn: "is_active", targetField: "is_active" }
          ]
        })
      });

      assert.equal(validateResponse.status, 200);
      const validateBody = await validateResponse.json();
      assert.equal(validateBody.success, true);
      assert.equal(validateBody.data.errorRows, 1, "Should have 1 error row - Company B's item_group not visible to Company A");
      assert.equal(validateBody.data.validRows, 0, "Should have 0 valid rows");

      // Verify the error is about the FK not existing (not about permission)
      const fkErrors = validateBody.data.errors.filter(
        e => e.column === "item_group_id"
      );
      assert.ok(fkErrors.length > 0, "Should have error about item_group_id");
      assert.ok(
        fkErrors.some(e => e.message.includes("does not exist")),
        "Error should indicate item_group does not exist in Company A's scope"
      );

      // Cleanup Company B's item_group
      await db.execute(`DELETE FROM item_groups WHERE id = ?`, [itemGroupIdB]);
    } finally {
      // Cleanup Company B resources in correct order
      if (companyBUserId !== null) {
        await db.execute(`DELETE FROM user_role_assignments WHERE user_id = ?`, [companyBUserId]).catch(() => {});
        await db.execute(`DELETE FROM user_outlets WHERE user_id = ?`, [companyBUserId]).catch(() => {});
        await db.execute(`DELETE FROM users WHERE id = ?`, [companyBUserId]).catch(() => {});
      }
      if (companyBOutletId !== null) {
        await db.execute(`DELETE FROM outlets WHERE id = ?`, [companyBOutletId]).catch(() => {});
      }
      if (companyBId !== null) {
        await db.execute(`DELETE FROM companies WHERE id = ?`, [companyBId]).catch(() => {});
      }

      // Cleanup Company A's item_group
      await db.execute(`DELETE FROM item_groups WHERE company_id = ? AND id = ?`, [companyAId, itemGroupIdA]).catch(() => {});
    }
  }
);
