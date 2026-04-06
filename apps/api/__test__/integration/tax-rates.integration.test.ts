// @ts-nocheck
// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import { test, describe, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { fileURLToPath } from "node:url";
import {
  setupIntegrationTests,
  readEnv,
  dbConfigFromEnv,
  delay,
  getFreePort,
  startApiServer,
  waitForHealthcheck,
  stopApiServer,
} from "../../tests/integration/integration-harness.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const apiRoot = path.resolve(__dirname, "../..");
const repoRoot = path.resolve(apiRoot, "../..");
const loadEnvFile = process.loadEnvFile;
const ENV_PATH = path.resolve(repoRoot, ".env");
const TEST_TIMEOUT_MS = 180000;

const testContext = setupIntegrationTests();

describe("Tax Rates Integration", () => {
  beforeAll(async () => { await testContext.start(); });
  afterAll(async () => { await testContext.stop(); });

test(
  "@slow tax rates integration: create, list, defaults",
  { timeout: TEST_TIMEOUT_MS, concurrent: false },
  async () => {
    if (typeof loadEnvFile === "function" && existsSync(ENV_PATH)) {
      loadEnvFile(ENV_PATH);
    }

    const db = testContext.db;
    let childProcess;

    const companyCode = readEnv("JP_COMPANY_CODE", "JP");
    const outletCode = readEnv("JP_OUTLET_CODE", "MAIN");
    const ownerEmail = readEnv("JP_OWNER_EMAIL").toLowerCase();
    const ownerPassword = readEnv("JP_OWNER_PASSWORD");
    const rateCode = "VAT_TEST";
    let owner = null;

    try {
      const [ownerRows] = await db.execute(
        `SELECT u.company_id
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
      owner = ownerRows[0] ?? null;

      if (!owner) {
        throw new Error(
          "owner fixture not found; run `npm run db:migrate && npm run db:seed` before integration tests"
        );
      }

      const companyId = Number(owner.company_id);
      // Clean up in proper order to respect foreign key constraints
      await db.execute(
        `DELETE sit FROM sales_invoice_taxes sit
         INNER JOIN sales_invoices si ON si.id = sit.sales_invoice_id
         WHERE si.company_id = ?`,
        [companyId]
      );
      await db.execute(
        `DELETE FROM company_tax_defaults WHERE company_id = ?`,
        [companyId]
      );
      await db.execute(
        `DELETE FROM tax_rates WHERE company_id = ? AND code = ?`,
        [companyId, rateCode]
      );

      const baseUrl = testContext.baseUrl;

      const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          companyCode,
          email: ownerEmail,
          password: ownerPassword
        })
      });
      assert.equal(loginResponse.status, 200);
      const loginBody = await loginResponse.json();
      assert.equal(loginBody.success, true);
      const accessToken = loginBody.data.access_token;

      const createResponse = await fetch(`${baseUrl}/api/settings/tax-rates`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          code: rateCode,
          name: "VAT Test",
          rate_percent: 12,
          is_inclusive: false
        })
      });
      assert.equal(createResponse.status, 201);
      const createBody = await createResponse.json();
      assert.equal(createBody.success, true);

      const listResponse = await fetch(`${baseUrl}/api/settings/tax-rates`, {
        headers: {
          authorization: `Bearer ${accessToken}`
        }
      });
      assert.equal(listResponse.status, 200);
      const listBody = await listResponse.json();
      assert.equal(listBody.success, true);
      const createdRate = listBody.data.find((rate) => rate.code === rateCode);
      assert.ok(createdRate);

      const defaultsResponse = await fetch(`${baseUrl}/api/settings/tax-rates/defaults`, {
        method: "PUT",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          tax_rate_ids: [createdRate.id]
        })
      });
      assert.equal(defaultsResponse.status, 200);
      const defaultsBody = await defaultsResponse.json();
      assert.equal(defaultsBody.success, true);

      const getDefaultsResponse = await fetch(`${baseUrl}/api/settings/tax-rates/defaults`, {
        headers: {
          authorization: `Bearer ${accessToken}`
        }
      });
      assert.equal(getDefaultsResponse.status, 200);
      const getDefaultsBody = await getDefaultsResponse.json();
      assert.equal(getDefaultsBody.success, true);
      assert.equal(getDefaultsBody.data.includes(createdRate.id), true);
    } finally {
      try {
        await db.execute(
          `DELETE FROM company_tax_defaults WHERE company_id = ?`,
          [Number(owner?.company_id ?? 0)]
        );
        await db.execute(
          `DELETE FROM tax_rates WHERE company_id = ? AND code = ?`,
          [Number(owner?.company_id ?? 0), rateCode]
        );
      } catch {
        // Ignore cleanup errors.
      }
      
    }
  }
);
}); // end describe("Tax Rates Integration")
