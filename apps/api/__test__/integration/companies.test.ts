// @ts-nocheck
// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import {test, describe, beforeAll, afterAll, beforeEach, afterEach} from 'vitest';
import { fileURLToPath } from "node:url";
import { setupIntegrationTests, readEnv, TEST_TIMEOUT_MS, loadEnvIfPresent } from "../../tests/integration/integration-harness.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const apiRoot = path.resolve(__dirname, "../..");
const repoRoot = path.resolve(apiRoot, "../..");
const ENV_PATH = path.resolve(repoRoot, ".env");

const testContext = setupIntegrationTests();

describe("Companies Integration", () => {
  beforeAll(async () => { await testContext.start(); });
  afterAll(async () => { await testContext.stop(); });

test(
  "@slow companies integration: bootstrap module roles and modules",
  { timeout: TEST_TIMEOUT_MS, concurrent: false },
  async () => {
    loadEnvIfPresent();

    const db = testContext.db;

    const companyCodeForLogin = readEnv("JP_COMPANY_CODE", "JP");
    const superAdminEmail = readEnv("JP_SUPER_ADMIN_EMAIL").toLowerCase();
    const superAdminPassword = readEnv("JP_SUPER_ADMIN_PASSWORD");

    const runId = Date.now().toString(36);
    const companyCode = `T${runId}`.slice(0, 32).toUpperCase();
    const companyName = `Test Company ${runId}`;

    const expectedRoleCodes = ["OWNER", "COMPANY_ADMIN", "ADMIN", "CASHIER", "ACCOUNTANT"];
    const expectedModuleCodes = [
      "accounts",
      "inventory",
      "journals",
      "platform",
      "pos",
      "purchasing",
      "reports",
      "sales",
      "settings"
    ];

    try {
      const [roleRowsBefore] = await db.execute(`SELECT code FROM roles ORDER BY code ASC`);
      const roleCodesBefore = roleRowsBefore.map((row) => row.code);
      const roleCountBefore = roleRowsBefore.length;

      for (const code of expectedRoleCodes) {
        assert.ok(roleCodesBefore.includes(code), `roles seeded: ${code}`);
      }

      const baseUrl = testContext.baseUrl;

      const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          companyCode: companyCodeForLogin,
          email: superAdminEmail,
          password: superAdminPassword
        })
      });

      assert.equal(loginResponse.status, 200);
      const loginBody = await loginResponse.json();
      assert.equal(loginBody.success, true);
      assert.ok(loginBody.data.access_token);

      const authHeader = {
        authorization: `Bearer ${loginBody.data.access_token}`,
        "content-type": "application/json"
      };

      const createResponse = await fetch(`${baseUrl}/api/companies`, {
        method: "POST",
        headers: authHeader,
        body: JSON.stringify({
          code: companyCode,
          name: companyName,
          legal_name: "PT " + companyName,
          tax_id: "01.234.567.8-901.000",
          email: "contact@" + companyCode.toLowerCase() + ".com",
          phone: "+62 21 1234 5678",
          address_line1: "Jl. Sudirman No. 123",
          address_line2: "Tower A, Lt. 10",
          city: "Jakarta",
          postal_code: "10220"
        })
      });

      assert.equal(createResponse.status, 201);
      const createBody = await createResponse.json();
      assert.equal(createBody.success, true);
      const companyId = Number(createBody.data.id);
      assert.ok(companyId > 0);
      assert.equal(createBody.data.legal_name, "PT " + companyName);
      assert.equal(createBody.data.tax_id, "01.234.567.8-901.000");
      assert.equal(createBody.data.email, "contact@" + companyCode.toLowerCase() + ".com");
      assert.equal(createBody.data.phone, "+62 21 1234 5678");
      assert.equal(createBody.data.address_line1, "Jl. Sudirman No. 123");
      assert.equal(createBody.data.address_line2, "Tower A, Lt. 10");
      assert.equal(createBody.data.city, "Jakarta");
      assert.equal(createBody.data.postal_code, "10220");

      const getResponse = await fetch(`${baseUrl}/api/companies/${companyId}`, {
        method: "GET",
        headers: authHeader
      });
      assert.equal(getResponse.status, 200);
      const getBody = await getResponse.json();
      assert.equal(getBody.data.legal_name, "PT " + companyName);
      assert.equal(getBody.data.tax_id, "01.234.567.8-901.000");
      assert.equal(getBody.data.email, "contact@" + companyCode.toLowerCase() + ".com");

      const patchResponse = await fetch(`${baseUrl}/api/companies/${companyId}`, {
        method: "PATCH",
        headers: authHeader,
        body: JSON.stringify({
          legal_name: null,
          tax_id: null,
          city: "Surabaya"
        })
      });
      assert.equal(patchResponse.status, 200);
      const patchBody = await patchResponse.json();
      assert.equal(patchBody.data.legal_name, null);
      assert.equal(patchBody.data.tax_id, null);
      assert.equal(patchBody.data.city, "Surabaya");

      const [roleRowsAfter] = await db.execute(`SELECT code FROM roles ORDER BY code ASC`);
      const roleCountAfter = roleRowsAfter.length;
      assert.equal(roleCountAfter, roleCountBefore);

      const [companyModuleRows] = await db.execute(
        `SELECT m.code
         FROM company_modules cm
         INNER JOIN modules m ON m.id = cm.module_id
         WHERE cm.company_id = ?
         ORDER BY m.code ASC`,
        [companyId]
      );
      const moduleCodes = companyModuleRows.map((row) => row.code);
      assert.deepEqual(moduleCodes, [...expectedModuleCodes].sort());

      const [moduleRolesColumns] = await db.execute(
        `SELECT COLUMN_NAME
         FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'module_roles'
           AND COLUMN_NAME = 'company_id'`
      );
      assert.ok(
        moduleRolesColumns.length > 0,
        "module_roles.company_id missing; run db migrations (0040/0041)"
      );

      const [moduleRolesIndexRows] = await db.execute(
        `SELECT INDEX_NAME
         FROM information_schema.STATISTICS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'module_roles'
           AND INDEX_NAME = 'uq_module_roles_company_role_module'`
      );
      assert.ok(
        moduleRolesIndexRows.length > 0,
        "module_roles is not company-scoped; run db migrations (0040/0041)"
      );

      const [moduleRoleRows] = await db.execute(
        `SELECT r.code AS role_code, mr.module, mr.permission_mask
         FROM module_roles mr
         INNER JOIN roles r ON r.id = mr.role_id
         WHERE mr.company_id = ?
           AND r.code IN ("OWNER", "ADMIN", "CASHIER", "ACCOUNTANT")
           AND mr.module IN ("users", "accounts")`,
        [companyId]
      );
      assert.ok(
        moduleRoleRows.length > 0,
        "module_roles rows were not created for the new company"
      );

      const moduleRoleMap = new Map(
        moduleRoleRows.map((row) => [`${row.role_code}:${row.module}`, Number(row.permission_mask)])
      );

      const moduleRoleKeys = [...moduleRoleMap.keys()].sort().join(", ");
      assert.equal(
        moduleRoleMap.get("OWNER:users"),
        15,
        `missing OWNER:users; found ${moduleRoleKeys}`
      );
      assert.equal(
        moduleRoleMap.get("ADMIN:users"),
        15,
        `missing ADMIN:users; found ${moduleRoleKeys}`
      );
      assert.equal(
        moduleRoleMap.get("CASHIER:users"),
        0,
        `missing CASHIER:users; found ${moduleRoleKeys}`
      );
      assert.equal(
        moduleRoleMap.get("ACCOUNTANT:accounts"),
        2,
        `missing ACCOUNTANT:accounts; found ${moduleRoleKeys}`
      );
    } finally {
      
    }
  }
);

test(
  "@slow companies integration: default outlet inherits company timezone",
  { timeout: TEST_TIMEOUT_MS, concurrent: false },
  async () => {
    loadEnvIfPresent();

    const db = testContext.db;

    const companyCodeForLogin = readEnv("JP_COMPANY_CODE", "JP");
    const superAdminEmail = readEnv("JP_SUPER_ADMIN_EMAIL").toLowerCase();
    const superAdminPassword = readEnv("JP_SUPER_ADMIN_PASSWORD");

    const runId = Date.now().toString(36);
    const companyCode = `TZ${runId}`.slice(0, 32).toUpperCase();
    const companyName = `Test Timezone Company ${runId}`;

    try {
      const baseUrl = testContext.baseUrl;

      const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          companyCode: companyCodeForLogin,
          email: superAdminEmail,
          password: superAdminPassword
        })
      });

      assert.equal(loginResponse.status, 200);
      const loginBody = await loginResponse.json();
      assert.equal(loginBody.success, true);
      assert.ok(loginBody.data.access_token);

      const authHeader = {
        authorization: `Bearer ${loginBody.data.access_token}`,
        "content-type": "application/json"
      };

      const createResponse = await fetch(`${baseUrl}/api/companies`, {
        method: "POST",
        headers: authHeader,
        body: JSON.stringify({
          code: companyCode,
          name: companyName,
          timezone: "America/New_York"
        })
      });

      assert.equal(createResponse.status, 201);
      const createBody = await createResponse.json();
      assert.equal(createBody.success, true);
      const companyId = Number(createBody.data.id);
      assert.ok(companyId > 0);
      assert.equal(createBody.data.timezone, "America/New_York");

      // Verify default outlet inherited company timezone
      const [outletRows] = await db.execute(
        `SELECT timezone FROM outlets WHERE company_id = ? AND code = ?`,
        [companyId, "MAIN"]
      );

      assert.equal(outletRows.length, 1, "Default outlet should exist");
      assert.equal(
        outletRows[0].timezone,
        "America/New_York",
        "Default outlet should inherit company timezone"
      );
    } finally {
      
    }
  }
);

}); // end describe("Companies Integration")
