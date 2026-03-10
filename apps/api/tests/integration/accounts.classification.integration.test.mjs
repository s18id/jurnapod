// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Integration tests for accounts classification and inheritance behavior
// Tests verify API endpoint behavior for:
// 1. GET /api/accounts report_group PL filter includes both PL and LR (backward compatibility)
// 2. GET /api/accounts report_group NRC filter is strict (no LR fallback)
// 3. PUT /api/accounts explicit override preserved on reparent
// 4. PUT /api/accounts reparent-to-root clears inheriting classification
// 5. PUT /api/accounts root account uses template classification

import assert from "node:assert/strict";
import { test } from "node:test";
import { createIntegrationTestContext, setupIntegrationTests } from "./integration-harness.mjs";

const testContext = setupIntegrationTests(test);
const TEST_TIMEOUT_MS = 180000;

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

test(
  "GET /api/accounts report_group=PL includes legacy LR (backward compatibility)",
  { concurrency: false, timeout: TEST_TIMEOUT_MS },
  async () => {
    const { db, baseUrl } = testContext;
    const runId = Date.now().toString(36);

    const companyCode = readEnv("JP_COMPANY_CODE", null) ?? "JP";
    const ownerEmail = readEnv("JP_OWNER_EMAIL", null) ?? "owner@example.com";
    const ownerPassword = readEnv("JP_OWNER_PASSWORD", "password123");

    let companyId = 0;
    const createdAccountIds = [];

    try {
      // Get company and login
      const [ownerRows] = await db.execute(
        `SELECT u.id, u.company_id
         FROM users u
         INNER JOIN companies c ON c.id = u.company_id
         WHERE c.code = ? AND u.email = ? AND u.is_active = 1
         LIMIT 1`,
        [companyCode, ownerEmail]
      );
      assert.ok(ownerRows.length > 0, "Owner fixture not found");
      companyId = Number(ownerRows[0].company_id);

      // Login to get token
      const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ companyCode, email: ownerEmail, password: ownerPassword })
      });
      assert.equal(loginResponse.status, 200);
      const loginBody = await loginResponse.json();
      const accessToken = loginBody.data.access_token;

      // Create test accounts with different report_group values
      await db.execute(
        `INSERT INTO accounts (company_id, code, name, report_group, is_active) VALUES (?, ?, ?, 'PL', 1)`,
        [companyId, `PL-${runId}`, `PL Account ${runId}`]
      );
      await db.execute(
        `INSERT INTO accounts (company_id, code, name, report_group, is_active) VALUES (?, ?, ?, 'LR', 1)`,
        [companyId, `LR-${runId}`, `LR Account ${runId}`]
      );
      await db.execute(
        `INSERT INTO accounts (company_id, code, name, report_group, is_active) VALUES (?, ?, ?, 'NRC', 1)`,
        [companyId, `NRC-${runId}`, `NRC Account ${runId}`]
      );

      // Get IDs for cleanup
      const [plRow] = await db.execute(`SELECT id FROM accounts WHERE code = ?`, [`PL-${runId}`]);
      const [lrRow] = await db.execute(`SELECT id FROM accounts WHERE code = ?`, [`LR-${runId}`]);
      const [nrcRow] = await db.execute(`SELECT id FROM accounts WHERE code = ?`, [`NRC-${runId}`]);
      if (plRow.length) createdAccountIds.push(Number(plRow[0].id));
      if (lrRow.length) createdAccountIds.push(Number(lrRow[0].id));
      if (nrcRow.length) createdAccountIds.push(Number(nrcRow[0].id));

      // Call GET /api/accounts with report_group=PL
      const accountsResponse = await fetch(
        `${baseUrl}/api/accounts?company_id=${companyId}&report_group=PL`,
        { headers: { authorization: `Bearer ${accessToken}` } }
      );
      assert.equal(accountsResponse.status, 200);
      const accountsBody = await accountsResponse.json();
      assert.equal(accountsBody.success, true);

      const returnedCodes = accountsBody.data.map(a => a.code);

      // Should include both PL and LR (backward compatibility)
      assert.ok(returnedCodes.includes(`PL-${runId}`), "Should include PL account");
      assert.ok(returnedCodes.includes(`LR-${runId}`), "Should include LR legacy account for backward compatibility");
      assert.ok(!returnedCodes.includes(`NRC-${runId}`), "Should NOT include NRC account");

      // Verify strict NRC filter
      const nrcResponse = await fetch(
        `${baseUrl}/api/accounts?company_id=${companyId}&report_group=NRC`,
        { headers: { authorization: `Bearer ${accessToken}` } }
      );
      assert.equal(nrcResponse.status, 200);
      const nrcBody = await nrcResponse.json();
      const nrcCodes = nrcBody.data.map(a => a.code);

      assert.ok(nrcCodes.includes(`NRC-${runId}`), "NRC filter should be strict");
      assert.ok(!nrcCodes.includes(`PL-${runId}`), "NRC filter should NOT include PL");
      assert.ok(!nrcCodes.includes(`LR-${runId}`), "NRC filter should NOT include LR");

      console.log(`✅ GET /api/accounts PL/LR backward compatibility test passed`);

    } finally {
      for (const id of createdAccountIds) {
        try {
          await db.execute(`DELETE FROM accounts WHERE id = ?`, [id]);
        } catch (e) { /* ignore */ }
      }
    }
  }
);

test(
  "PUT /api/accounts: explicit override preserved on reparent",
  { concurrency: false, timeout: TEST_TIMEOUT_MS },
  async () => {
    const { db, baseUrl } = testContext;
    const runId = Date.now().toString(36);

    const companyCode = readEnv("JP_COMPANY_CODE", null) ?? "JP";
    const ownerEmail = readEnv("JP_OWNER_EMAIL", null) ?? "owner@example.com";
    const ownerPassword = readEnv("JP_OWNER_PASSWORD", "password123");

    let companyId = 0;
    const createdAccountIds = [];

    try {
      // Get company and login
      const [ownerRows] = await db.execute(
        `SELECT u.id, u.company_id FROM users u INNER JOIN companies c ON c.id = u.company_id WHERE c.code = ? AND u.email = ? AND u.is_active = 1 LIMIT 1`,
        [companyCode, ownerEmail]
      );
      assert.ok(ownerRows.length > 0, "Owner fixture not found");
      companyId = Number(ownerRows[0].company_id);

      const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ companyCode, email: ownerEmail, password: ownerPassword })
      });
      assert.equal(loginResponse.status, 200);
      const loginBody = await loginResponse.json();
      const accessToken = loginBody.data.access_token;

      // Create parent account with PL classification
      const [parentResult] = await db.execute(
        `INSERT INTO accounts (company_id, code, name, type_name, normal_balance, report_group, is_group, is_active) VALUES (?, ?, ?, 'Kas', 'D', 'PL', 1, 1)`,
        [companyId, `PAR-${runId}`, `Parent ${runId}`]
      );
      const parentId = Number(parentResult.insertId);
      createdAccountIds.push(parentId);

      // Create child with EXPLICIT NRC override
      const [childResult] = await db.execute(
        `INSERT INTO accounts (company_id, code, name, parent_account_id, type_name, normal_balance, report_group, is_group, is_active) VALUES (?, ?, ?, ?, 'Piutang', 'D', 'NRC', 0, 1)`,
        [companyId, `CHI-${runId}`, `Child ${runId}`, parentId]
      );
      const childId = Number(childResult.insertId);
      createdAccountIds.push(childId);

      // Create new parent with different classification
      const [newParentResult] = await db.execute(
        `INSERT INTO accounts (company_id, code, name, type_name, normal_balance, report_group, is_group, is_active) VALUES (?, ?, ?, 'Bank', 'D', 'NRC', 1, 1)`,
        [companyId, `NEW-${runId}`, `New Parent ${runId}`]
      );
      const newParentId = Number(newParentResult.insertId);
      createdAccountIds.push(newParentId);

      // Verify initial state
      const [beforeRes] = await db.execute(
        `SELECT type_name, report_group FROM accounts WHERE id = ?`, [childId]
      );
      assert.strictEqual(beforeRes[0].type_name, "Piutang", "Initial: explicit type_name");
      assert.strictEqual(beforeRes[0].report_group, "NRC", "Initial: explicit report_group");

      // Call PUT /api/accounts/:id to reparent (without classification fields - should preserve explicit)
      const updateResponse = await fetch(`${baseUrl}/api/accounts/${childId}`, {
        method: "PUT",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          parent_account_id: newParentId
        })
      });

      // STRICT: require 200 OK
      assert.equal(updateResponse.status, 200, "PUT /api/accounts/:id should return 200");
      
      const updateBody = await updateResponse.json();
      assert.equal(updateBody.success, true, "PUT should succeed");
      
      // Verify explicit values preserved after reparent
      const [afterRes] = await db.execute(
        `SELECT type_name, report_group, parent_account_id FROM accounts WHERE id = ?`, [childId]
      );

      assert.strictEqual(afterRes[0].parent_account_id, newParentId, "Parent should be updated");
      assert.strictEqual(afterRes[0].type_name, "Piutang", 
        "Explicit override should be preserved after reparent");
      assert.strictEqual(afterRes[0].report_group, "NRC", 
        "Explicit report_group should be preserved after reparent");

      console.log(`✅ Explicit override preservation test passed`);

    } finally {
      for (const id of createdAccountIds) {
        try {
          await db.execute(`DELETE FROM accounts WHERE id = ?`, [id]);
        } catch (e) { /* ignore */ }
      }
    }
  }
);

test(
  "PUT /api/accounts: reparent to root clears inherited classification",
  { concurrency: false, timeout: TEST_TIMEOUT_MS },
  async () => {
    const { db, baseUrl } = testContext;
    const runId = Date.now().toString(36);

    const companyCode = readEnv("JP_COMPANY_CODE", null) ?? "JP";
    const ownerEmail = readEnv("JP_OWNER_EMAIL", null) ?? "owner@example.com";
    const ownerPassword = readEnv("JP_OWNER_PASSWORD", "password123");

    let companyId = 0;
    const createdAccountIds = [];

    try {
      // Get company and login
      const [ownerRows] = await db.execute(
        `SELECT u.id, u.company_id FROM users u INNER JOIN companies c ON c.id = u.company_id WHERE c.code = ? AND u.email = ? AND u.is_active = 1 LIMIT 1`,
        [companyCode, ownerEmail]
      );
      assert.ok(ownerRows.length > 0, "Owner fixture not found");
      companyId = Number(ownerRows[0].company_id);

      const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ companyCode, email: ownerEmail, password: ownerPassword })
      });
      assert.equal(loginResponse.status, 200);
      const loginBody = await loginResponse.json();
      const accessToken = loginBody.data.access_token;

      // Create parent account with classification
      const [parentResult] = await db.execute(
        `INSERT INTO accounts (company_id, code, name, type_name, normal_balance, report_group, is_group, is_active) VALUES (?, ?, ?, 'Kas', 'D', 'PL', 1, 1)`,
        [companyId, `PAR-${runId}`, `Parent ${runId}`]
      );
      const parentId = Number(parentResult.insertId);
      createdAccountIds.push(parentId);

      // Create child with parent-matching values to simulate materialized inheritance
      const [childResult] = await db.execute(
        `INSERT INTO accounts (company_id, code, name, parent_account_id, type_name, normal_balance, report_group, is_group, is_active)
         VALUES (?, ?, ?, ?, 'Kas', 'D', 'PL', 0, 1)`,
        [companyId, `CHI-${runId}`, `Child ${runId}`, parentId]
      );
      const childId = Number(childResult.insertId);
      createdAccountIds.push(childId);

      // Verify child currently carries parent-matching classification before reparent
      const [beforeRes] = await db.execute(
        `SELECT type_name, normal_balance, report_group, parent_account_id FROM accounts WHERE id = ?`,
        [childId]
      );
      assert.strictEqual(beforeRes[0].parent_account_id, parentId, "Child should start under original parent");
      assert.strictEqual(beforeRes[0].type_name, "Kas", "Precondition: child has parent-matching type_name");
      assert.strictEqual(beforeRes[0].normal_balance, "D", "Precondition: child has parent-matching normal_balance");
      assert.strictEqual(beforeRes[0].report_group, "PL", "Precondition: child has parent-matching report_group");

      // Call PUT /api/accounts/:id to reparent to root (null)
      const updateResponse = await fetch(`${baseUrl}/api/accounts/${childId}`, {
        method: "PUT",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          parent_account_id: null
        })
      });

      // STRICT: require 200 OK
      assert.equal(updateResponse.status, 200, "PUT /api/accounts/:id should return 200 when reparenting to root");
      
      const updateBody = await updateResponse.json();
      assert.equal(updateBody.success, true, "PUT should succeed");

      // Verify parent is now null
      const [afterRes] = await db.execute(
        `SELECT type_name, normal_balance, report_group, parent_account_id FROM accounts WHERE id = ?`,
        [childId]
      );

      assert.strictEqual(afterRes[0].parent_account_id, null, "Parent should be null after reparent to root");
      
      // When reparenting to root with no template, unresolved inheriting fields must clear
      assert.strictEqual(afterRes[0].type_name, null, "type_name must clear on reparent-to-root without template");
      assert.strictEqual(afterRes[0].normal_balance, null, "normal_balance must clear on reparent-to-root without template");
      assert.strictEqual(afterRes[0].report_group, null, "report_group must clear on reparent-to-root without template");

      console.log(`✅ Reparent-to-root test passed`);

    } finally {
      for (const id of createdAccountIds) {
        try {
          await db.execute(`DELETE FROM accounts WHERE id = ?`, [id]);
        } catch (e) { /* ignore */ }
      }
    }
  }
);

test(
  "PUT /api/accounts: root account uses template classification",
  { concurrency: false, timeout: TEST_TIMEOUT_MS },
  async () => {
    const { db, baseUrl } = testContext;
    const runId = Date.now().toString(36);

    const companyCode = readEnv("JP_COMPANY_CODE", null) ?? "JP";
    const ownerEmail = readEnv("JP_OWNER_EMAIL", null) ?? "owner@example.com";
    const ownerPassword = readEnv("JP_OWNER_PASSWORD", "password123");

    let companyId = 0;
    let accountTypeId = 0;
    const createdAccountIds = [];
    const createdAccountTypeIds = [];

    try {
      // Get company and login
      const [ownerRows] = await db.execute(
        `SELECT u.id, u.company_id FROM users u INNER JOIN companies c ON c.id = u.company_id WHERE c.code = ? AND u.email = ? AND u.is_active = 1 LIMIT 1`,
        [companyCode, ownerEmail]
      );
      assert.ok(ownerRows.length > 0, "Owner fixture not found");
      companyId = Number(ownerRows[0].company_id);

      const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ companyCode, email: ownerEmail, password: ownerPassword })
      });
      assert.equal(loginResponse.status, 200);
      const loginBody = await loginResponse.json();
      const accessToken = loginBody.data.access_token;

      // Create account type template with classification
      const [typeResult] = await db.execute(
        `INSERT INTO account_types (company_id, name, category, normal_balance, report_group, is_active) VALUES (?, ?, 'ASSET', 'D', 'PL', 1)`,
        [companyId, `Template ${runId}`]
      );
      accountTypeId = Number(typeResult.insertId);
      createdAccountTypeIds.push(accountTypeId);

      // Create root account (no parent) with template reference
      const [rootResult] = await db.execute(
        `INSERT INTO accounts (company_id, code, name, account_type_id, is_group, is_active) VALUES (?, ?, ?, ?, 1, 1)`,
        [companyId, `RWT-${runId}`, `Root ${runId}`, accountTypeId]
      );
      const rootId = Number(rootResult.insertId);
      createdAccountIds.push(rootId);

      // Verify template is linked
      const [beforeRes] = await db.execute(
        `SELECT account_type_id FROM accounts WHERE id = ?`, [rootId]
      );
      assert.strictEqual(Number(beforeRes[0].account_type_id), accountTypeId, "Template should be linked");

      // Call PUT /api/accounts/:id to set classification from template (clear nulls trigger inheritance)
      const updateResponse = await fetch(`${baseUrl}/api/accounts/${rootId}`, {
        method: "PUT",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          // Setting classification fields to null should trigger template fill
          type_name: null,
          normal_balance: null,
          report_group: null
        })
      });

      // STRICT: require 200 OK
      assert.equal(updateResponse.status, 200, "PUT /api/accounts/:id should return 200");
      
      const updateBody = await updateResponse.json();
      assert.equal(updateBody.success, true, "PUT should succeed");

      // Verify classification filled from template (even without parent)
      const [afterRes] = await db.execute(
        `SELECT type_name, normal_balance, report_group FROM accounts WHERE id = ?`,
        [rootId]
      );

      // Template should have filled the classification fields
      assert.strictEqual(afterRes[0].type_name, `Template ${runId}`, 
        "type_name should be filled from template");
      assert.strictEqual(afterRes[0].normal_balance, "D", 
        "normal_balance should be filled from template");
      assert.strictEqual(afterRes[0].report_group, "PL", 
        "report_group should be filled from template");

      console.log(`✅ Root + template inheritance test passed`);

    } finally {
      for (const id of createdAccountIds) {
        try {
          await db.execute(`DELETE FROM accounts WHERE id = ?`, [id]);
        } catch (e) { /* ignore */ }
      }
      for (const id of createdAccountTypeIds) {
        try {
          await db.execute(`DELETE FROM account_types WHERE id = ?`, [id]);
        } catch (e) { /* ignore */ }
      }
    }
  }
);

test(
  "PUT /api/accounts: clearing one classification field keeps omitted fields unchanged",
  { concurrency: false, timeout: TEST_TIMEOUT_MS },
  async () => {
    const { db, baseUrl } = testContext;
    const runId = Date.now().toString(36);

    const companyCode = readEnv("JP_COMPANY_CODE", null) ?? "JP";
    const ownerEmail = readEnv("JP_OWNER_EMAIL", null) ?? "owner@example.com";
    const ownerPassword = readEnv("JP_OWNER_PASSWORD", "password123");

    let companyId = 0;
    const createdAccountIds = [];

    try {
      const [ownerRows] = await db.execute(
        `SELECT u.id, u.company_id FROM users u INNER JOIN companies c ON c.id = u.company_id WHERE c.code = ? AND u.email = ? AND u.is_active = 1 LIMIT 1`,
        [companyCode, ownerEmail]
      );
      assert.ok(ownerRows.length > 0, "Owner fixture not found");
      companyId = Number(ownerRows[0].company_id);

      const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ companyCode, email: ownerEmail, password: ownerPassword })
      });
      assert.equal(loginResponse.status, 200);
      const loginBody = await loginResponse.json();
      const accessToken = loginBody.data.access_token;

      const [parentResult] = await db.execute(
        `INSERT INTO accounts (company_id, code, name, type_name, normal_balance, report_group, is_group, is_active) VALUES (?, ?, ?, 'TemplateType', 'D', 'PL', 1, 1)`,
        [companyId, `PCH-${runId}`, `Parent ${runId}`]
      );
      const parentId = Number(parentResult.insertId);
      createdAccountIds.push(parentId);

      const [childResult] = await db.execute(
        `INSERT INTO accounts (company_id, code, name, parent_account_id, type_name, normal_balance, report_group, is_group, is_active) VALUES (?, ?, ?, ?, 'ManualType', 'K', 'NRC', 0, 1)`,
        [companyId, `CCH-${runId}`, `Child ${runId}`, parentId]
      );
      const childId = Number(childResult.insertId);
      createdAccountIds.push(childId);

      const [beforeRes] = await db.execute(
        `SELECT type_name, normal_balance, report_group FROM accounts WHERE id = ?`,
        [childId]
      );
      assert.strictEqual(beforeRes[0].type_name, "ManualType");
      assert.strictEqual(beforeRes[0].normal_balance, "K");
      assert.strictEqual(beforeRes[0].report_group, "NRC");

      const updateResponse = await fetch(`${baseUrl}/api/accounts/${childId}`, {
        method: "PUT",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          report_group: null
        })
      });

      assert.equal(updateResponse.status, 200, "PUT /api/accounts/:id should return 200");
      const updateBody = await updateResponse.json();
      assert.equal(updateBody.success, true, "PUT should succeed");

      const [afterRes] = await db.execute(
        `SELECT type_name, normal_balance, report_group FROM accounts WHERE id = ?`,
        [childId]
      );

      assert.strictEqual(afterRes[0].type_name, "ManualType", "Omitted type_name must remain unchanged");
      assert.strictEqual(afterRes[0].normal_balance, "K", "Omitted normal_balance must remain unchanged");
      assert.strictEqual(afterRes[0].report_group, "PL", "Cleared report_group should resolve from inheritance");
    } finally {
      for (const id of createdAccountIds) {
        try {
          await db.execute(`DELETE FROM accounts WHERE id = ?`, [id]);
        } catch (e) { /* ignore */ }
      }
    }
  }
);
