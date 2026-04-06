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

test(
  "@slow modules integration: list and update",
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
    const moduleCode = "pos";

    try {
      const [ownerRows] = await db.execute(
        `SELECT u.company_id, o.id AS outlet_id
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
        throw new Error(
          "owner fixture not found; run `npm run db:migrate && npm run db:seed` before integration tests"
        );
      }

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

      const updateResponse = await fetch(`${baseUrl}/api/settings/modules`, {
        method: "PUT",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          modules: [
            {
              code: moduleCode,
              enabled: true,
              config_json: "{\"payment_methods\":[\"CASH\",\"QRIS\"]}"
            }
          ]
        })
      });
      assert.equal(updateResponse.status, 200);
      const updateBody = await updateResponse.json();
      assert.equal(updateBody.success, true);

      const listResponse = await fetch(`${baseUrl}/api/settings/modules`, {
        headers: {
          authorization: `Bearer ${accessToken}`
        }
      });
      assert.equal(listResponse.status, 200);
      const listBody = await listResponse.json();
      assert.equal(listBody.success, true);
      const posModule = listBody.data.find((mod) => mod.code === moduleCode);
      assert.ok(posModule);
      assert.equal(posModule.enabled, true);
      const config = JSON.parse(posModule.config_json);
      assert.deepEqual(config.payment_methods, ["CASH", "QRIS"]);
    } finally {
      
    }
  }
);
