// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import assert from "node:assert/strict";
import { test } from "node:test";
import bcrypt from "bcryptjs";
import {
  setupIntegrationTests,
  readEnv,
  loginOwner,
  TEST_TIMEOUT_MS
} from "./integration-harness.mjs";

const testContext = setupIntegrationTests(test);

test(
  "outlet role ACL: comprehensive access control tests",
  { timeout: TEST_TIMEOUT_MS, concurrency: false },
  async () => {
    const db = testContext.db;
    const baseUrl = testContext.baseUrl;

    const companyCode = readEnv("JP_COMPANY_CODE", "JP");
    const outletCode = readEnv("JP_OUTLET_CODE", "MAIN");
    const ownerEmail = readEnv("JP_OWNER_EMAIL").toLowerCase();
    const ownerPassword = readEnv("JP_OWNER_PASSWORD");
    const superAdminEmail = readEnv("JP_SUPER_ADMIN_EMAIL").toLowerCase();
    const superAdminPassword = readEnv("JP_SUPER_ADMIN_PASSWORD");

    const runId = Date.now().toString(36);
    const testUserEmailPrefix = `acltest+${runId}`;

    let ownerToken;
    let companyId;
    let outletA;
    let outletB;
    let adminUser;
    let adminToken;
    let cashierUser;
    let cashierToken;
    let globalOwnerToken;
    let superAdminToken;
    let otherCompanyId;
    let otherOutletId;
    let adminRoleId;
    let adminUsersPermissionOriginal = null;
    let adminUsersPermissionInserted = false;

    try {
      // ========================================
      // Setup: Login as owner and get company/outlet info
      // ========================================
      ownerToken = await loginOwner(baseUrl, companyCode, ownerEmail, ownerPassword);

      const [ownerRows] = await db.execute(
        `SELECT u.id, u.company_id, o.id AS outlet_id
         FROM users u
         INNER JOIN companies c ON c.id = u.company_id
         INNER JOIN user_outlets uo ON uo.user_id = u.id
         INNER JOIN outlets o ON o.id = uo.outlet_id
         WHERE c.code = ?
           AND u.email = ?
           AND o.code = ?
           AND u.is_active = 1
         LIMIT 1`,
        [companyCode, ownerEmail, outletCode]
      );

      assert.ok(ownerRows.length > 0, "Owner fixture not found");
      const owner = ownerRows[0];
      companyId = Number(owner.company_id);
      const mainOutletId = Number(owner.outlet_id);

      // ========================================
      // Setup: Create two test outlets (A and B)
      // ========================================
      const outletACode = `TESTA${runId}`.slice(0, 32).toUpperCase();
      const outletBCode = `TESTB${runId}`.slice(0, 32).toUpperCase();

      const [outletAResult] = await db.execute(
        `INSERT INTO outlets (company_id, code, name)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE name = VALUES(name), id = LAST_INSERT_ID(id), updated_at = CURRENT_TIMESTAMP`,
        [companyId, outletACode, `Test Outlet A ${runId}`]
      );
      outletA = Number(outletAResult.insertId);

      const [outletBResult] = await db.execute(
        `INSERT INTO outlets (company_id, code, name)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE name = VALUES(name), id = LAST_INSERT_ID(id), updated_at = CURRENT_TIMESTAMP`,
        [companyId, outletBCode, `Test Outlet B ${runId}`]
      );
      outletB = Number(outletBResult.insertId);

      // ========================================
      // Setup: Get role IDs
      // ========================================
      const [roleRows] = await db.execute(
        `SELECT id, code FROM roles WHERE code IN ('ADMIN', 'CASHIER', 'OWNER', 'SUPER_ADMIN')`
      );
      const roleMap = new Map(roleRows.map((r) => [r.code, Number(r.id)]));
      adminRoleId = roleMap.get("ADMIN");
      const cashierRoleId = roleMap.get("CASHIER");
      const ownerRoleId = roleMap.get("OWNER");
      const superAdminRoleId = roleMap.get("SUPER_ADMIN");

      assert.ok(adminRoleId, "ADMIN role not found");
      assert.ok(cashierRoleId, "CASHIER role not found");
      assert.ok(ownerRoleId, "OWNER role not found");
      assert.ok(superAdminRoleId, "SUPER_ADMIN role not found");

      // ========================================
      // Setup: Create outlet ADMIN user (assigned to outlet A only)
      // ========================================
      const adminEmail = `${testUserEmailPrefix}-admin@example.com`;
      const adminPassword = "AdminPass123!";

      const createAdminResponse = await fetch(`${baseUrl}/api/users`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${ownerToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          email: adminEmail,
          password: adminPassword,
          outlet_role_assignments: [
            {
              outlet_id: outletA,
              role_codes: ["ADMIN"]
            }
          ],
          outlet_ids: [outletA],
          is_active: true
        })
      });

      assert.equal(createAdminResponse.status, 201, "Failed to create ADMIN user");
      const createAdminBody = await createAdminResponse.json();
      adminUser = Number(createAdminBody.data.id);

      // Login as admin
      adminToken = await loginOwner(baseUrl, companyCode, adminEmail, adminPassword);

      // ========================================
      // Setup: Create outlet CASHIER user (assigned to outlet A only)
      // ========================================
      const cashierEmail = `${testUserEmailPrefix}-cashier@example.com`;
      const cashierPassword = "CashierPass123!";

      const createCashierResponse = await fetch(`${baseUrl}/api/users`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${ownerToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          email: cashierEmail,
          password: cashierPassword,
          outlet_role_assignments: [
            {
              outlet_id: outletA,
              role_codes: ["CASHIER"]
            }
          ],
          outlet_ids: [outletA],
          is_active: true
        })
      });

      assert.equal(createCashierResponse.status, 201, "Failed to create CASHIER user");
      const createCashierBody = await createCashierResponse.json();
      cashierUser = Number(createCashierBody.data.id);

      // Login as cashier
      cashierToken = await loginOwner(baseUrl, companyCode, cashierEmail, cashierPassword);

      // Create another company for cross-company tests
      const otherCompanyCode = `OTHER${runId}`.slice(0, 32).toUpperCase();
      const [otherCompanyResult] = await db.execute(
        `INSERT INTO companies (code, name) VALUES (?, ?)`,
        [otherCompanyCode, `Other Company ${runId}`]
      );
      otherCompanyId = Number(otherCompanyResult.insertId);

      const [otherOutletResult] = await db.execute(
        `INSERT INTO outlets (company_id, code, name) VALUES (?, ?, ?)`,
        [otherCompanyId, "MAIN", `Other Outlet ${runId}`]
      );
      otherOutletId = Number(otherOutletResult.insertId);

      // ========================================
      // Test 1: User with outlet ADMIN role can access company-wide routes
      // ========================================
      const adminUsersResponse = await fetch(`${baseUrl}/api/users`, {
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": "application/json"
        }
      });

      assert.equal(
        adminUsersResponse.status,
        200,
        "Outlet ADMIN should be able to access company-wide GET /api/users"
      );
      const adminUsersBody = await adminUsersResponse.json();
      assert.equal(adminUsersBody.success, true);
      assert.ok(Array.isArray(adminUsersBody.data), "Users list should be an array");

      // ========================================
      // Test 2: User with outlet ADMIN without create permission cannot create user
      // ========================================
      // First, verify ADMIN has read permission but not create permission
      const [adminPermRows] = await db.execute(
        `SELECT permission_mask
         FROM module_roles
         WHERE company_id = ?
           AND role_id = ?
           AND module = 'users'`,
        [companyId, adminRoleId]
      );

      // If no permission exists, create one with read-only (2)
      if (adminPermRows.length === 0) {
        await db.execute(
          `INSERT INTO module_roles (company_id, role_id, module, permission_mask)
           VALUES (?, ?, 'users', 2)`,
          [companyId, adminRoleId, "users"]
        );
        adminUsersPermissionInserted = true;
      } else {
        adminUsersPermissionOriginal = Number(adminPermRows[0].permission_mask ?? 0);
        // Update to read-only if it has create permission
        await db.execute(
          `UPDATE module_roles
           SET permission_mask = 2
           WHERE company_id = ?
             AND role_id = ?
             AND module = 'users'`,
          [companyId, adminRoleId]
        );
      }

      const adminCreateUserResponse = await fetch(`${baseUrl}/api/users`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          email: `${testUserEmailPrefix}-shouldfail@example.com`,
          password: "ShouldFail123!",
          role_codes: ["CASHIER"],
          outlet_ids: [outletA],
          is_active: true
        })
      });

      assert.equal(
        adminCreateUserResponse.status,
        403,
        "Outlet ADMIN without create permission should not be able to POST /api/users"
      );

      // ========================================
      // Test 3: User with outlet CASHIER can access assigned outlet sync pull
      // ========================================
      const cashierSyncPullAResponse = await fetch(
        `${baseUrl}/api/sync/pull?outlet_id=${outletA}&since_version=0`,
        {
          headers: {
            authorization: `Bearer ${cashierToken}`,
            "content-type": "application/json"
          }
        }
      );

      assert.equal(
        cashierSyncPullAResponse.status,
        200,
        "Outlet CASHIER should be able to access assigned outlet sync pull (outlet A)"
      );

      // ========================================
      // Test 4: User with outlet CASHIER cannot access other outlet sync pull
      // ========================================
      const cashierSyncPullBResponse = await fetch(
        `${baseUrl}/api/sync/pull?outlet_id=${outletB}&since_version=0`,
        {
          headers: {
            authorization: `Bearer ${cashierToken}`,
            "content-type": "application/json"
          }
        }
      );

      assert.equal(
        cashierSyncPullBResponse.status,
        403,
        "Outlet CASHIER should not be able to access non-assigned outlet sync pull (outlet B)"
      );

      // ========================================
      // Test 5: User with global OWNER can access all outlet settings
      // ========================================
      const globalOwnerSettingsAResponse = await fetch(
        `${baseUrl}/api/settings/config?outlet_id=${outletA}&keys=feature.pos.auto_sync_enabled`,
        {
          headers: {
            authorization: `Bearer ${ownerToken}`,
            "content-type": "application/json"
          }
        }
      );

      assert.equal(
        globalOwnerSettingsAResponse.status,
        200,
        "Global OWNER should be able to access outlet A settings"
      );

      const globalOwnerSettingsBResponse = await fetch(
        `${baseUrl}/api/settings/config?outlet_id=${outletB}&keys=feature.pos.auto_sync_enabled`,
        {
          headers: {
            authorization: `Bearer ${ownerToken}`,
            "content-type": "application/json"
          }
        }
      );

      assert.equal(
        globalOwnerSettingsBResponse.status,
        200,
        "Global OWNER should be able to access outlet B settings"
      );

      superAdminToken = await loginOwner(baseUrl, companyCode, superAdminEmail, superAdminPassword);

      // ========================================
      // Test 6: SUPER_ADMIN can access other company data
      // ========================================
      const superAdminOtherCompanyResponse = await fetch(
        `${baseUrl}/api/outlets?company_id=${otherCompanyId}`,
        {
          headers: {
            authorization: `Bearer ${superAdminToken}`,
            "content-type": "application/json"
          }
        }
      );

      assert.equal(
        superAdminOtherCompanyResponse.status,
        200,
        "SUPER_ADMIN should be able to access other company data"
      );
      const superAdminOtherCompanyBody = await superAdminOtherCompanyResponse.json();
      assert.equal(superAdminOtherCompanyBody.success, true);

      // ========================================
      // Test 7: Non-SUPER_ADMIN cannot access other company data
      // ========================================
      const adminOtherCompanyResponse = await fetch(
        `${baseUrl}/api/outlets?company_id=${otherCompanyId}`,
        {
          headers: {
            authorization: `Bearer ${adminToken}`,
            "content-type": "application/json"
          }
        }
      );

      assert.equal(
        adminOtherCompanyResponse.status,
        400,
        "Non-SUPER_ADMIN should not be able to access other company data (should return 400)"
      );

      const globalOwnerOtherCompanyResponse = await fetch(
        `${baseUrl}/api/outlets?company_id=${otherCompanyId}`,
        {
          headers: {
            authorization: `Bearer ${globalOwnerToken}`,
            "content-type": "application/json"
          }
        }
      );

      assert.equal(
        globalOwnerOtherCompanyResponse.status,
        401,
        "Global OWNER should not be able to access other company data (should return 401)"
      );

      console.log("✓ All outlet role ACL tests passed");
    } finally {
      // Cleanup: restore permissions, delete dependent rows first
      if (companyId && adminRoleId) {
        if (adminUsersPermissionInserted) {
          await db.execute(
            `DELETE FROM module_roles WHERE company_id = ? AND role_id = ? AND module = 'users'`,
            [companyId, adminRoleId]
          );
        } else if (adminUsersPermissionOriginal !== null) {
          await db.execute(
            `UPDATE module_roles
             SET permission_mask = ?
             WHERE company_id = ?
               AND role_id = ?
               AND module = 'users'`,
            [adminUsersPermissionOriginal, companyId, adminRoleId]
          );
        }
      }
      if (adminUser) {
        await db.execute(`DELETE FROM users WHERE id = ?`, [adminUser]);
      }
      if (cashierUser) {
        await db.execute(`DELETE FROM users WHERE id = ?`, [cashierUser]);
      }
      if (outletA) {
        await db.execute(`DELETE FROM outlets WHERE id = ?`, [outletA]);
      }
      if (outletB) {
        await db.execute(`DELETE FROM outlets WHERE id = ?`, [outletB]);
      }
      if (otherOutletId) {
        await db.execute(`DELETE FROM outlets WHERE id = ?`, [otherOutletId]);
      }
      if (otherCompanyId) {
        await db.execute(`DELETE FROM companies WHERE id = ?`, [otherCompanyId]);
      }
    }
  }
);
