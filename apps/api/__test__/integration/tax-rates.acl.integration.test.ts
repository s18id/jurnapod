// @ts-nocheck
// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Phase 4: Tax rates ACL integration tests - tenant isolation and cross-company boundary
// Run with: npm --prefix apps/api run test:integration -- tests/integration/tax-rates.acl.integration.test.mjs

import assert from "node:assert/strict";
import { test, describe, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import {
  setupIntegrationTests,
  loginUser,
  readEnv,
  TEST_TIMEOUT_MS,
  createCleanupHelper
} from "../../tests/integration/integration-harness.js";

const testContext = setupIntegrationTests();

async function apiRequest(baseUrl, token, path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      authorization: token ? `Bearer ${token}` : undefined,
      ...(options.headers ?? {})
    }
  });
  const body = await response.json().catch(() => ({}));
  return { status: response.status, body };
}

test(
  "@slow tax rates ACL: tenant isolation and cross-company access control",
  { timeout: TEST_TIMEOUT_MS, concurrent: false },
  async () => {
    const { db, baseUrl } = testContext;

    const companyCode = readEnv("JP_COMPANY_CODE", "JP");
    const outletCode = readEnv("JP_OUTLET_CODE", "MAIN");
    const ownerEmail = readEnv("JP_OWNER_EMAIL").toLowerCase();
    const ownerPassword = readEnv("JP_OWNER_PASSWORD");
    const runId = Date.now().toString(36);

    const companyBCode = `JP-B-${runId}`.slice(0, 10).toUpperCase();
    const companyBEmail = `owner-b-${runId}@example.com`;

    const createdCompanyIds = [];
    const createdUserIds = [];
    const createdOutletIds = [];
    const createdAccountIds = [];
    const createdTaxRateIds = [];

    // Use cleanup helper for proper cleanup order
    const cleanup = createCleanupHelper(db);

    let companyAId = null;
    let companyBId = null;
    let companyAOwnerToken = null;
    let companyBOwnerToken = null;
    let companyAOwnerUserId = null;

    try {
      // ========================================
      // Setup: Get Company A owner info
      // ========================================
      const [ownerRows] = await db.execute(
        `SELECT u.id, u.company_id, u.password_hash
         FROM users u
         INNER JOIN companies c ON c.id = u.company_id
         INNER JOIN outlets o ON o.company_id = u.company_id
         WHERE c.code = ?
           AND u.email = ?
           AND u.is_active = 1
           AND o.code = ?
         LIMIT 1`,
        [companyCode, ownerEmail, outletCode]
      );
      const owner = ownerRows[0];
      if (!owner) {
        throw new Error("owner fixture not found");
      }

      companyAId = Number(owner.company_id);
      companyAOwnerUserId = Number(owner.id);
      const ownerPasswordHash = String(owner.password_hash);

      // ========================================
      // Setup: Create Company B
      // ========================================
      const [companyBResult] = await db.execute(
        `INSERT INTO companies (code, name) VALUES (?, ?) ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id), name = VALUES(name)`,
        [companyBCode, `Test Company B ${runId}`]
      );
      companyBId = Number(companyBResult.insertId);
      createdCompanyIds.push(companyBId);

      // Create outlet for Company B
      const [outletBResult] = await db.execute(
        `INSERT INTO outlets (company_id, code, name) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE name = VALUES(name), id = LAST_INSERT_ID(id), updated_at = CURRENT_TIMESTAMP`,
        [companyBId, `MAIN-B-${runId}`, "Main Outlet B"]
      );
      const outletBId = Number(outletBResult.insertId);
      createdOutletIds.push(outletBId);

      // Create owner user for Company B
      const [userBResult] = await db.execute(
        `INSERT INTO users (company_id, email, password_hash, is_active) VALUES (?, ?, ?, 1)`,
        [companyBId, companyBEmail, ownerPasswordHash]
      );
      const companyBOwnerUserId = Number(userBResult.insertId);
      createdUserIds.push(companyBOwnerUserId);

      // Get OWNER role
      const [roleRows] = await db.execute(
        `SELECT id FROM roles WHERE code = 'OWNER' LIMIT 1`
      );
      const ownerRoleId = Number(roleRows[0].id);

      // Assign OWNER role to Company B user (global role - outlet_id NULL)
      await db.execute(
        `INSERT INTO user_role_assignments (user_id, role_id, outlet_id, company_id) VALUES (?, ?, NULL, ?)`,
        [companyBOwnerUserId, ownerRoleId, companyBId]
      );

      // ACL guard for tax-rates requires settings module permission in addition to role.
      await db.execute(
        `INSERT INTO module_roles (company_id, role_id, module, permission_mask)
         VALUES (?, ?, 'settings', 15)
         ON DUPLICATE KEY UPDATE permission_mask = 15`,
        [companyBId, ownerRoleId]
      );

      // Add outlet access via role assignment
      await db.execute(
        `INSERT INTO user_role_assignments (user_id, role_id, outlet_id, company_id)
         SELECT ?, r.id, ?, o.company_id
         FROM roles r
         CROSS JOIN outlets o
         WHERE r.code = 'CASHIER'
           AND o.id = ?
         LIMIT 1`,
        [companyBOwnerUserId, outletBId, outletBId]
      );

      // ========================================
      // Setup: Create account in Company A (for cross-company test)
      // ========================================
      const [accountAResult] = await db.execute(
        `INSERT INTO accounts (company_id, code, name, type_name, normal_balance, report_group, is_active)
         VALUES (?, ?, ?, ?, 'D', 'NRC', 1)`,
        [companyAId, `ACC-A-${runId}`, "Company A Account", "Expense"]
      );
      const companyAAccountId = Number(accountAResult.insertId);
      createdAccountIds.push(companyAAccountId);

      // ========================================
      // Setup: Login both owners
      // ========================================
      companyAOwnerToken = await loginUser(baseUrl, companyCode, ownerEmail, ownerPassword);
      companyBOwnerToken = await loginUser(baseUrl, companyBCode, companyBEmail, ownerPassword);

      // ========================================
      // Test 1: Company A creates tax rate
      // ========================================
      const taxRateCodeA = `VAT-A-${runId}`;
      const createResA = await apiRequest(baseUrl, companyAOwnerToken, "/api/settings/tax-rates", {
        method: "POST",
        body: JSON.stringify({
          code: taxRateCodeA,
          name: "VAT Company A",
          rate_percent: 10,
          is_inclusive: false
        })
      });
      assert.equal(createResA.status, 201, `Create tax rate A failed: ${JSON.stringify(createResA.body)}`);
      const taxRateAId = Number(createResA.body.data);
      createdTaxRateIds.push(taxRateAId);

      // ========================================
      // Test 2: Company A creates tax rate with liability account
      // ========================================
      const taxRateCodeA2 = `VAT-A-LIAB-${runId}`;
      const createResA2 = await apiRequest(baseUrl, companyAOwnerToken, "/api/settings/tax-rates", {
        method: "POST",
        body: JSON.stringify({
          code: taxRateCodeA2,
          name: "VAT Company A with Liability",
          rate_percent: 11,
          account_id: companyAAccountId,
          is_inclusive: false
        })
      });
      assert.equal(createResA2.status, 201, `Create tax rate A with account failed: ${JSON.stringify(createResA2.body)}`);
      createdTaxRateIds.push(Number(createResA2.body.data));

      // ========================================
      // Test 3: Company B cannot see Company A's tax rates
      // ========================================
      const listResB = await apiRequest(baseUrl, companyBOwnerToken, "/api/settings/tax-rates");
      assert.equal(listResB.status, 200, `List tax rates B failed: ${JSON.stringify(listResB.body)}`);
      const companyBRates = listResB.body.data || [];
      const companyARateIds = companyBRates.map((r) => r.id);
      assert.equal(
        companyARateIds.includes(taxRateAId),
        false,
        "Company B should not see Company A's tax rates"
      );

      // ========================================
      // Test 4: Company B cannot update Company A's tax rate
      // ========================================
      const updateResB = await apiRequest(
        baseUrl,
        companyBOwnerToken,
        `/api/settings/tax-rates/${taxRateAId}`,
        {
          method: "PUT",
          body: JSON.stringify({ name: "Hacked Name" })
        }
      );
      assert.equal(
        updateResB.status,
        404,
        `Update Company A tax rate from B should be 404: ${JSON.stringify(updateResB.body)}`
      );

      // ========================================
      // Test 5: Company B cannot delete Company A's tax rate
      // ========================================
      const deleteResB = await apiRequest(
        baseUrl,
        companyBOwnerToken,
        `/api/settings/tax-rates/${taxRateAId}`,
        { method: "DELETE" }
      );
      assert.equal(
        deleteResB.status,
        404,
        `Delete Company A tax rate from B should be 404: ${JSON.stringify(deleteResB.body)}`
      );

      // ========================================
      // Test 6: Company B cannot use Company A's account_id
      // ========================================
      const createResBCrossCompany = await apiRequest(baseUrl, companyBOwnerToken, "/api/settings/tax-rates", {
        method: "POST",
        body: JSON.stringify({
          code: `VAT-B-${runId}`,
          name: "VAT Company B",
          rate_percent: 10,
          account_id: companyAAccountId, // Trying to use Company A's account
          is_inclusive: false
        })
      });
      assert.equal(
        createResBCrossCompany.status,
        400,
        `Create tax rate with cross-company account should fail: ${JSON.stringify(createResBCrossCompany.body)}`
      );
      assert.equal(
        createResBCrossCompany.body.error?.code,
        "INVALID_ACCOUNT",
        "Error should be INVALID_ACCOUNT"
      );

      // ========================================
      // Test 7: Company A can still read their own tax rates
      // ========================================
      const listResA = await apiRequest(baseUrl, companyAOwnerToken, "/api/settings/tax-rates");
      assert.equal(listResA.status, 200, `List tax rates A failed: ${JSON.stringify(listResA.body)}`);
      const companyARates = listResA.body.data || [];
      const companyARateIdSet = new Set(companyARates.map((r) => r.id));
      assert.equal(
        companyARateIdSet.has(taxRateAId),
        true,
        "Company A should see their own tax rates"
      );

      // ========================================
      // Test 8: Company B can create their own tax rate
      // ========================================
      const createResB = await apiRequest(baseUrl, companyBOwnerToken, "/api/settings/tax-rates", {
        method: "POST",
        body: JSON.stringify({
          code: `VAT-B-${runId}`,
          name: "VAT Company B",
          rate_percent: 12,
          is_inclusive: false
        })
      });
      assert.equal(createResB.status, 201, `Create tax rate B failed: ${JSON.stringify(createResB.body)}`);
      createdTaxRateIds.push(Number(createResB.body.data));

      // ========================================
      // Test 9: Unauthenticated request is rejected
      // ========================================
      const listResNoAuth = await apiRequest(baseUrl, null, "/api/settings/tax-rates");
      assert.equal(listResNoAuth.status, 401, `Unauthenticated request should be 401: ${JSON.stringify(listResNoAuth.body)}`);

    } finally {
      // ========================================
      // Cleanup
      // ========================================
      await cleanup.execute();
    }
  }
);
