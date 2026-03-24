// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  setupIntegrationTests,
  readEnv,
  loginUser,
  TEST_TIMEOUT_MS
} from "./integration-harness.mjs";

const testContext = setupIntegrationTests(test);

test(
  "module permissions ACL: permission denial tests for sales, reports, and journals",
  { timeout: TEST_TIMEOUT_MS, concurrency: false },
  async () => {
    const db = testContext.db;
    const baseUrl = testContext.baseUrl;

    const companyCode = readEnv("JP_COMPANY_CODE", "JP");
    const outletCode = readEnv("JP_OUTLET_CODE", "MAIN");
    const ownerEmail = readEnv("JP_OWNER_EMAIL").toLowerCase();
    const ownerPassword = readEnv("JP_OWNER_PASSWORD");

    const runId = Date.now().toString(36);
    const testUserEmailPrefix = `modpermtest+${runId}`;

    let companyId;
    let outletId;
    let adminRoleId;
    let createdUserId = null;
    let salesReadOnlyToken = null;
    let reportsNoAccessToken = null;
    let journalsNoCreateToken = null;
    const trackedModules = ["sales", "accounting", "journals"];
    const modulePermissionsOriginal = new Map();

    try {
      // ========================================
      // Setup: Get company and outlet info
      // ========================================
      const [ownerRows] = await db.execute(
        `SELECT u.id, u.company_id, u.password_hash, o.id AS outlet_id
         FROM users u
         INNER JOIN companies c ON c.id = u.company_id
         INNER JOIN user_outlets uo ON uo.user_id = u.id
         INNER JOIN outlets o ON o.id = uo.outlet_id
         WHERE c.code = ?
           AND u.email = ?
           AND u.is_active = 1
           AND o.code = ?
         LIMIT 1`,
        [companyCode, ownerEmail, outletCode]
      );

      assert.ok(ownerRows.length > 0, "Owner fixture not found; run database seed first");
      const owner = ownerRows[0];
      companyId = Number(owner.company_id);
      outletId = Number(owner.outlet_id);
      const ownerPasswordHash = String(owner.password_hash);

      // ========================================
      // Setup: Get ADMIN role ID
      // ========================================
      const [roleRows] = await db.execute(
        `SELECT id FROM roles WHERE code = 'ADMIN' LIMIT 1`
      );
      assert.ok(roleRows.length > 0, "ADMIN role not found");
      adminRoleId = Number(roleRows[0].id);

      const [moduleRows] = await db.execute(
        `SELECT module, permission_mask
         FROM module_roles
         WHERE company_id = ?
           AND role_id = ?
           AND module IN ('sales', 'reports', 'journals')`,
        [companyId, adminRoleId]
      );
      for (const row of moduleRows) {
        modulePermissionsOriginal.set(row.module, Number(row.permission_mask));
      }
      for (const moduleName of trackedModules) {
        if (!modulePermissionsOriginal.has(moduleName)) {
          modulePermissionsOriginal.set(moduleName, null);
        }
      }

      // ========================================
      // Test 1: Sales write with read-only permission expects 403
      // ========================================
      const salesReadOnlyEmail = `${testUserEmailPrefix}-salesreadonly@example.com`;

      // Create user with ADMIN role
      const [salesUserInsert] = await db.execute(
        `INSERT INTO users (company_id, email, password_hash, is_active)
         VALUES (?, ?, ?, 1)`,
        [companyId, salesReadOnlyEmail, ownerPasswordHash]
      );
      const salesUserId = Number(salesUserInsert.insertId);
      createdUserId = salesUserId;

      // Assign ADMIN role
      await db.execute(
        `INSERT INTO user_role_assignments (user_id, outlet_id, role_id)
         VALUES (?, ?, ?)`,
        [salesUserId, outletId, adminRoleId]
      );

      // Set sales permission to read-only (permission_mask = 2 for read)
      await db.execute(
        `INSERT INTO module_roles (company_id, role_id, module, permission_mask)
         VALUES (?, ?, 'sales', 2)
         ON DUPLICATE KEY UPDATE permission_mask = 2`,
        [companyId, adminRoleId]
      );

      // Login as read-only user
      salesReadOnlyToken = await loginUser(
        baseUrl,
        companyCode,
        salesReadOnlyEmail,
        ownerPassword
      );

      // Attempt to create an invoice (should fail with 403)
      const createInvoiceResponse = await fetch(`${baseUrl}/api/sales/invoices`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${salesReadOnlyToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          outlet_id: outletId,
          invoice_date: new Date().toISOString().slice(0, 10),
          customer_name: "Test Customer",
          items: [
            {
              item_id: 1,
              description: "Test Item",
              qty: 1,
              price: 100.0,
              tax_rate: 0.0
            }
          ],
          payment_method: "CASH",
          payment_status: "PAID"
        })
      });

      assert.equal(
        createInvoiceResponse.status,
        403,
        "Sales write with read-only permission should return 403"
      );

      const createInvoiceBody = await createInvoiceResponse.json();
      assert.equal(createInvoiceBody.success, false);
      assert.equal(createInvoiceBody.error.code, "FORBIDDEN");

      // Cleanup for Test 1
      await db.execute(
        `DELETE FROM module_roles WHERE company_id = ? AND role_id = ? AND module = 'sales'`,
        [companyId, adminRoleId]
      );
      await db.execute(`DELETE FROM user_role_assignments WHERE user_id = ?`, [salesUserId]);
      await db.execute(`DELETE FROM users WHERE id = ?`, [salesUserId]);
      createdUserId = null;

      // ========================================
      // Test 2: Reports read with missing module permission expects 403
      // Note: The trial-balance route checks 'accounting' module permission, not 'reports'
      // ========================================
      const reportsNoAccessEmail = `${testUserEmailPrefix}-reportsnoaccess@example.com`;

      // Create user with ADMIN role
      const [reportsUserInsert] = await db.execute(
        `INSERT INTO users (company_id, email, password_hash, is_active)
         VALUES (?, ?, ?, 1)`,
        [companyId, reportsNoAccessEmail, ownerPasswordHash]
      );
      const reportsUserId = Number(reportsUserInsert.insertId);
      createdUserId = reportsUserId;

      // Assign ADMIN role
      await db.execute(
        `INSERT INTO user_role_assignments (user_id, outlet_id, role_id)
         VALUES (?, ?, ?)`,
        [reportsUserId, outletId, adminRoleId]
      );

      // Remove accounting permission (if exists) - trial-balance checks 'accounting' module
      await db.execute(
        `DELETE FROM module_roles WHERE company_id = ? AND role_id = ? AND module = 'accounting'`,
        [companyId, adminRoleId]
      );

      // Login as user without accounting permission
      reportsNoAccessToken = await loginUser(
        baseUrl,
        companyCode,
        reportsNoAccessEmail,
        ownerPassword
      );

      // Attempt to access trial balance report (should fail with 403)
      const trialBalanceResponse = await fetch(
        `${baseUrl}/api/reports/trial-balance?outlet_id=${outletId}&date_from=2025-01-01&date_to=2026-12-31`,
        {
          headers: {
            authorization: `Bearer ${reportsNoAccessToken}`
          }
        }
      );

      assert.equal(
        trialBalanceResponse.status,
        403,
        "Reports read with missing accounting permission should return 403"
      );

      const trialBalanceBody = await trialBalanceResponse.json();
      assert.equal(trialBalanceBody.success, false);
      assert.equal(trialBalanceBody.error.code, "FORBIDDEN");

      // Cleanup for Test 2
      await db.execute(`DELETE FROM user_role_assignments WHERE user_id = ?`, [reportsUserId]);
      await db.execute(`DELETE FROM users WHERE id = ?`, [reportsUserId]);
      createdUserId = null;

      // ========================================
      // Test 3: Journals POST with missing permission expects 403
      // ========================================
      const journalsNoCreateEmail = `${testUserEmailPrefix}-journalsnocreate@example.com`;

      // Create user with ADMIN role
      const [journalsUserInsert] = await db.execute(
        `INSERT INTO users (company_id, email, password_hash, is_active)
         VALUES (?, ?, ?, 1)`,
        [companyId, journalsNoCreateEmail, ownerPasswordHash]
      );
      const journalsUserId = Number(journalsUserInsert.insertId);
      createdUserId = journalsUserId;

      // Assign ADMIN role
      await db.execute(
        `INSERT INTO user_role_assignments (user_id, outlet_id, role_id)
         VALUES (?, ?, ?)`,
        [journalsUserId, outletId, adminRoleId]
      );

      // Set journals permission to read-only (permission_mask = 2)
      await db.execute(
        `INSERT INTO module_roles (company_id, role_id, module, permission_mask)
         VALUES (?, ?, 'journals', 2)
         ON DUPLICATE KEY UPDATE permission_mask = 2`,
        [companyId, adminRoleId]
      );

      // Login as user without journals create permission
      journalsNoCreateToken = await loginUser(
        baseUrl,
        companyCode,
        journalsNoCreateEmail,
        ownerPassword
      );

      // Get a valid account ID for the journal entry
      const [accountRows] = await db.execute(
        `SELECT id FROM accounts WHERE company_id = ? AND is_active = 1 LIMIT 2`,
        [companyId]
      );
      assert.ok(accountRows.length >= 2, "Need at least 2 active accounts for journal test");
      const accountId1 = Number(accountRows[0].id);
      const accountId2 = Number(accountRows[1].id);

      // Attempt to create a journal entry (should fail with 403)
      const createJournalResponse = await fetch(`${baseUrl}/api/journals`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${journalsNoCreateToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          company_id: companyId,
          outlet_id: outletId,
          entry_date: new Date().toISOString().slice(0, 10),
          description: "Test journal entry",
          lines: [
            {
              account_id: accountId1,
              debit: 100.0,
              credit: 0,
              description: "Test debit"
            },
            {
              account_id: accountId2,
              debit: 0,
              credit: 100.0,
              description: "Test credit"
            }
          ]
        })
      });

      assert.equal(
        createJournalResponse.status,
        403,
        "Journals POST with read-only permission should return 403"
      );

      const createJournalBody = await createJournalResponse.json();
      assert.equal(createJournalBody.success, false);
      assert.equal(createJournalBody.error.code, "FORBIDDEN");

      // Cleanup for Test 3
      await db.execute(
        `DELETE FROM module_roles WHERE company_id = ? AND role_id = ? AND module = 'journals'`,
        [companyId, adminRoleId]
      );
      await db.execute(`DELETE FROM user_role_assignments WHERE user_id = ?`, [journalsUserId]);
      await db.execute(`DELETE FROM users WHERE id = ?`, [journalsUserId]);
      createdUserId = null;

    } finally {
      // Final cleanup in case of early exit
      if (createdUserId) {
        await db.execute(`DELETE FROM user_role_assignments WHERE user_id = ?`, [createdUserId]);
        await db.execute(`DELETE FROM users WHERE id = ?`, [createdUserId]);
      }

      if (companyId && adminRoleId) {
        for (const [moduleName, permissionMask] of modulePermissionsOriginal.entries()) {
          if (permissionMask == null) {
            await db.execute(
              `DELETE FROM module_roles WHERE company_id = ? AND role_id = ? AND module = ?`,
              [companyId, adminRoleId, moduleName]
            );
            continue;
          }

          await db.execute(
            `INSERT INTO module_roles (company_id, role_id, module, permission_mask)
             VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask)`,
            [companyId, adminRoleId, moduleName, permissionMask]
          );
        }
      }
    }
  }
);
