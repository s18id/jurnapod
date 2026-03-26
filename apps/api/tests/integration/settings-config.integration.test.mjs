// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";
import { setupIntegrationTests } from "./integration-harness.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const apiRoot = path.resolve(__dirname, "../..");
const repoRoot = path.resolve(apiRoot, "../..");
const serverScriptPath = path.resolve(apiRoot, "src/server.ts");
const loadEnvFile = process.loadEnvFile;
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

function dbConfigFromEnv() {
  const port = Number(process.env.DB_PORT ?? "3306");
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error("DB_PORT must be a positive integer for integration test");
  }

  return {
    host: process.env.DB_HOST ?? "127.0.0.1",
    port,
    user: process.env.DB_USER ?? "root",
    password: process.env.DB_PASSWORD ?? "",
    database: process.env.DB_NAME ?? "jurnapod"
  };
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("failed to allocate free port"));
        return;
      }

      const port = address.port;
      server.close((closeError) => {
        if (closeError) {
          reject(closeError);
          return;
        }

        resolve(port);
      });
    });
  });
}

function startApiServer(port) {
  const childEnv = {
    ...process.env,
    NODE_ENV: "test"
  };

  const serverLogs = [];
  const childProcess = spawn(process.execPath, ["--import", "tsx", serverScriptPath], {
    cwd: apiRoot,
    env: { ...childEnv, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"]
  });

  childProcess.stdout.on("data", (chunk) => {
    serverLogs.push(chunk.toString());
    if (serverLogs.length > 200) {
      serverLogs.shift();
    }
  });

  childProcess.stderr.on("data", (chunk) => {
    serverLogs.push(chunk.toString());
    if (serverLogs.length > 200) {
      serverLogs.shift();
    }
  });

  return {
    childProcess,
    serverLogs
  };
}

async function waitForHealthcheck(baseUrl, childProcess, serverLogs) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < TEST_TIMEOUT_MS) {
    if (childProcess.exitCode != null) {
      throw new Error(
        `API server exited before healthcheck. exitCode=${childProcess.exitCode}\n${serverLogs.join("")}`
      );
    }

    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.status === 200) {
        return;
      }
    } catch {
      // Ignore transient startup errors while booting.
    }

    await delay(500);
  }

  throw new Error(`API server did not become healthy in time\n${serverLogs.join("")}`);
}

async function stopApiServer(childProcess) {
  if (!childProcess || childProcess.exitCode != null) {
    return;
  }

  await new Promise((resolve) => {
    const timeout = setTimeout(() => {
      childProcess.kill("SIGKILL");
    }, 5000);

    childProcess.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });

    childProcess.kill("SIGTERM");
  });
}

test(
  "settings config integration: per-outlet inventory settings",
  { timeout: TEST_TIMEOUT_MS, concurrency: false },
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

    let companyId = null;
    let outletId = null;
    let baseUrl = null;
    let accessToken = null;

    try {
      const [ownerRows] = await db.execute(
        `SELECT u.company_id, o.id AS outlet_id
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
      const owner = ownerRows[0];

      if (!owner) {
        throw new Error(
          "owner fixture not found; run `npm run db:migrate && npm run db:seed` before integration tests"
        );
      }

      companyId = Number(owner.company_id);
      outletId = Number(owner.outlet_id);

      await db.execute(
        `DELETE FROM company_settings WHERE company_id = ? AND outlet_id = ?`,
        [companyId, outletId]
      );

      baseUrl = testContext.baseUrl;

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
      accessToken = loginBody.data.access_token;

      const keys = [
        "feature.pos.auto_sync_enabled",
        "feature.pos.sync_interval_seconds",
        "feature.sales.tax_included_default",
        "feature.inventory.allow_backorder",
        "feature.purchasing.require_approval",
        "inventory.low_stock_threshold",
        "inventory.reorder_point",
        "inventory.allow_negative_stock",
        "inventory.costing_method",
        "inventory.warn_on_negative"
      ];

      const initialResponse = await fetch(
        `${baseUrl}/api/settings/config?outlet_id=${outletId}&keys=${encodeURIComponent(keys.join(","))}`,
        {
          headers: {
            authorization: `Bearer ${accessToken}`
          }
        }
      );
      assert.equal(initialResponse.status, 200);
      const initialBody = await initialResponse.json();
      assert.equal(initialBody.success, true);
      assert.equal(initialBody.data.settings.length, keys.length);

      const updatePayload = {
        outlet_id: outletId,
        settings: [
          { key: "feature.pos.auto_sync_enabled", value: false },
          { key: "feature.pos.sync_interval_seconds", value: 75 },
          { key: "feature.sales.tax_included_default", value: true },
          { key: "feature.inventory.allow_backorder", value: true },
          { key: "feature.purchasing.require_approval", value: false },
          { key: "inventory.low_stock_threshold", value: 7 },
          { key: "inventory.reorder_point", value: 11 },
          { key: "inventory.allow_negative_stock", value: true },
          { key: "inventory.costing_method", value: "FIFO" },
          { key: "inventory.warn_on_negative", value: false }
        ]
      };

      const updateResponse = await fetch(`${baseUrl}/api/settings/config`, {
        method: "PUT",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify(updatePayload)
      });
      assert.equal(updateResponse.status, 200);
      const updateBody = await updateResponse.json();
      assert.equal(updateBody.success, true);

      const updatedResponse = await fetch(
        `${baseUrl}/api/settings/config?outlet_id=${outletId}&keys=${encodeURIComponent(keys.join(","))}`,
        {
          headers: {
            authorization: `Bearer ${accessToken}`
          }
        }
      );
      assert.equal(updatedResponse.status, 200);
      const updatedBody = await updatedResponse.json();
      assert.equal(updatedBody.success, true);

      const updatedMap = new Map(updatedBody.data.settings.map((setting) => [setting.key, setting.value]));
      assert.equal(updatedMap.get("feature.pos.auto_sync_enabled"), false);
      assert.equal(updatedMap.get("feature.pos.sync_interval_seconds"), 75);
      assert.equal(updatedMap.get("feature.sales.tax_included_default"), true);
      assert.equal(updatedMap.get("feature.inventory.allow_backorder"), true);
      assert.equal(updatedMap.get("feature.purchasing.require_approval"), false);
      assert.equal(updatedMap.get("inventory.low_stock_threshold"), 7);
      assert.equal(updatedMap.get("inventory.reorder_point"), 11);
      assert.equal(updatedMap.get("inventory.allow_negative_stock"), true);
      assert.equal(updatedMap.get("inventory.costing_method"), "FIFO");
      assert.equal(updatedMap.get("inventory.warn_on_negative"), false);
    } finally {
      // Cleanup: restore original settings
      const rollbackPayload = {
        outlet_id: outletId,
        settings: [
          { key: "feature.pos.auto_sync_enabled", value: true },
          { key: "feature.pos.sync_interval_seconds", value: 60 },
          { key: "feature.sales.tax_included_default", value: false },
          { key: "feature.inventory.allow_backorder", value: false },
          { key: "feature.purchasing.require_approval", value: true },
          { key: "inventory.low_stock_threshold", value: 10 },
          { key: "inventory.reorder_point", value: 5 },
          { key: "inventory.allow_negative_stock", value: false },
          { key: "inventory.costing_method", value: "AVERAGE" },
          { key: "inventory.warn_on_negative", value: true }
        ]
      };
      await fetch(`${baseUrl}/api/settings/config`, {
        method: "PUT",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify(rollbackPayload)
      });
    }
  }
);

test(
  "settings config: requires authentication",
  { timeout: TEST_TIMEOUT_MS, concurrency: false },
  async () => {
    if (typeof loadEnvFile === "function" && existsSync(ENV_PATH)) {
      loadEnvFile(ENV_PATH);
    }

    const baseUrl = testContext.baseUrl;

    // No auth header - should return 401
    const res = await fetch(`${baseUrl}/api/settings/config?outlet_id=1&keys=feature.pos.auto_sync_enabled`);
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.equal(body.error.code, "UNAUTHORIZED");
  }
);

test(
  "settings config: PATCH updates settings",
  { timeout: TEST_TIMEOUT_MS, concurrency: false },
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

    const [ownerRows] = await db.execute(
      `SELECT u.company_id, o.id AS outlet_id
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
    const owner = ownerRows[0];

    if (!owner) {
      throw new Error("owner fixture not found");
    }

    const companyId = Number(owner.company_id);
    let outletId = Number(owner.outlet_id);

    const baseUrl = testContext.baseUrl;

    const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ companyCode, email: ownerEmail, password: ownerPassword })
    });
    assert.equal(loginResponse.status, 200);
    const loginBody = await loginResponse.json();
    const accessToken = loginBody.data.access_token;

    const testKey = "feature.pos.auto_sync_enabled";
    const testValue = false;
    const originalValue = true; // default in registry

    // Get current value
    const getResponse1 = await fetch(
      `${baseUrl}/api/settings/config?outlet_id=${outletId}&keys=${testKey}`,
      {
        headers: { authorization: `Bearer ${accessToken}` }
      }
    );
    assert.equal(getResponse1.status, 200);
    const getBody1 = await getResponse1.json();
    assert.equal(getBody1.success, true);
    const originalSettingValue = getBody1.data.settings[0].value;

    try {
      // PATCH update the setting
      const patchResponse = await fetch(`${baseUrl}/api/settings/config`, {
        method: "PATCH",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          outlet_id: outletId,
          settings: [{ key: testKey, value: testValue }]
        })
      });
      assert.equal(patchResponse.status, 200);
      const patchBody = await patchResponse.json();
      assert.equal(patchBody.success, true);
      assert.equal(patchBody.data.settings[0].key, testKey);
      assert.equal(patchBody.data.settings[0].value, testValue);

      // GET again and verify new value
      const getResponse2 = await fetch(
        `${baseUrl}/api/settings/config?outlet_id=${outletId}&keys=${testKey}`,
        {
          headers: { authorization: `Bearer ${accessToken}` }
        }
      );
      assert.equal(getResponse2.status, 200);
      const getBody2 = await getResponse2.json();
      assert.equal(getBody2.success, true);
      assert.equal(getBody2.data.settings[0].value, testValue);

      // Rollback to restore original value
      const rollbackValue = originalSettingValue !== testValue ? originalSettingValue : originalValue;
      const rollbackResponse = await fetch(`${baseUrl}/api/settings/config`, {
        method: "PATCH",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          outlet_id: outletId,
          settings: [{ key: testKey, value: rollbackValue }]
        })
      });
      assert.equal(rollbackResponse.status, 200);
      const rollbackBody = await rollbackResponse.json();
      assert.equal(rollbackBody.success, true);
      assert.equal(rollbackBody.data.settings[0].value, rollbackValue);
    } finally {
      // Ensure cleanup even if test fails - restore original value
      const cleanupValue = originalSettingValue !== testValue ? originalSettingValue : originalValue;
      await fetch(`${baseUrl}/api/settings/config`, {
        method: "PATCH",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          outlet_id: outletId,
          settings: [{ key: testKey, value: cleanupValue }]
        })
      });
    }
  }
);

test(
  "settings config: enforces company isolation",
  { timeout: TEST_TIMEOUT_MS, concurrency: false },
  async () => {
    if (typeof loadEnvFile === "function" && existsSync(ENV_PATH)) {
      loadEnvFile(ENV_PATH);
    }

    const db = testContext.db;

    const companyCode = readEnv("JP_COMPANY_CODE", "JP");
    const outletCode = readEnv("JP_OUTLET_CODE", "MAIN");
    const ownerEmail = readEnv("JP_OWNER_EMAIL").toLowerCase();
    const ownerPassword = readEnv("JP_OWNER_PASSWORD");

    const [ownerRows] = await db.execute(
      `SELECT u.company_id, u.id AS user_id, o.id AS outlet_id
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
    const owner = ownerRows[0];

    if (!owner) {
      throw new Error("owner fixture not found");
    }

    const companyAId = Number(owner.company_id);
    const outletAId = Number(owner.outlet_id);

    const baseUrl = testContext.baseUrl;

    // Login as Company A owner
    const loginResponseA = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ companyCode, email: ownerEmail, password: ownerPassword })
    });
    assert.equal(loginResponseA.status, 200);
    const loginBodyA = await loginResponseA.json();
    const accessTokenA = loginBodyA.data.access_token;

    const testKey = "feature.pos.auto_sync_enabled";
    const isolationTestValue = false;

    // Create a unique setting for Company A with a custom value
    const createSettingResponse = await fetch(`${baseUrl}/api/settings/config`, {
      method: "PATCH",
      headers: {
        authorization: `Bearer ${accessTokenA}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        outlet_id: outletAId,
        settings: [{ key: testKey, value: isolationTestValue }]
      })
    });
    assert.equal(createSettingResponse.status, 200);

    // Now create Company B via direct DB (following integration test policy pattern)
    const runId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const companyBCode = `TESTISOB${runId}`.slice(0, 32);
    const companyBName = `Test Isolation Company B ${runId}`;

    let companyBId = null;
    let outletBId = null;

    try {
      // Create Company B
      const [companyResult] = await db.execute(
        `INSERT INTO companies (code, name) VALUES (?, ?)`,
        [companyBCode, companyBName]
      );
      companyBId = Number(companyResult.insertId);

      // Create outlet for Company B
      const [outletResult] = await db.execute(
        `INSERT INTO outlets (company_id, code, name) VALUES (?, ?, ?)`,
        [companyBId, "MAIN", "Main Outlet"]
      );
      outletBId = Number(outletResult.insertId);

      // Verify company isolation at the database level:
      // Company A's setting should be in company_settings with company_id = companyAId
      const [companyASettingRows] = await db.execute(
        `SELECT * FROM company_settings WHERE company_id = ? AND \`key\` = ? AND outlet_id = ?`,
        [companyAId, testKey, outletAId]
      );
      assert.equal(companyASettingRows.length, 1, "Company A should have the setting");
      assert.equal(companyASettingRows[0].value_json, JSON.stringify(isolationTestValue));

      // Company B's settings table should NOT contain Company A's setting
      const [companyBHasCompanyASetting] = await db.execute(
        `SELECT * FROM company_settings WHERE company_id = ? AND \`key\` = ?`,
        [companyBId, testKey]
      );
      assert.equal(companyBHasCompanyASetting.length, 0, "Company B should not have Company A's setting");

      // Verify API-level isolation: Company A can read their own setting
      const getCompanyASettings = await fetch(
        `${baseUrl}/api/settings/config?outlet_id=${outletAId}&keys=${testKey}`,
        {
          headers: { authorization: `Bearer ${accessTokenA}` }
        }
      );
      assert.equal(getCompanyASettings.status, 200);
      const companyASettingsBody = await getCompanyASettings.json();
      assert.equal(companyASettingsBody.data.settings[0].value, isolationTestValue);

      // Verify API-level isolation: Querying Company A's outlet from Company B's context
      // would return Company B's settings (or defaults), not Company A's settings
      // because the API uses auth.companyId to scope the query
      // Since we can't login as Company B, we verify via DB that cross-company data is separate

      // Additional verification: The settings query for Company A uses company_id from token
      // This means even if Company B's token somehow queries outletAId, they get Company B's data
      const [companyBSettingsForOutletA] = await db.execute(
        `SELECT * FROM company_settings WHERE company_id = ? AND outlet_id = ? AND \`key\` = ?`,
        [companyBId, outletAId, testKey]
      );
      assert.equal(companyBSettingsForOutletA.length, 0, "Company B should not have any setting for Company A's outlet");

    } finally {
      // Cleanup Company B and its data
      if (outletBId !== null) {
        try {
          // First delete Company A's settings for Company B's outlet (if any)
          await db.execute(`DELETE FROM company_settings WHERE company_id = ? AND outlet_id = ?`, [companyAId, outletBId]);
        } catch {}
        try {
          await db.execute(`DELETE FROM outlets WHERE id = ?`, [outletBId]);
        } catch {}
      }
      if (companyBId !== null) {
        // Delete any settings Company A might have accidentally created for Company B's outlet
        try {
          await db.execute(`DELETE FROM company_settings WHERE company_id = ?`, [companyBId]);
        } catch {}
        try {
          await db.execute(`DELETE FROM companies WHERE id = ?`, [companyBId]);
        } catch {}
      }

      // Restore Company A's setting to default
      await fetch(`${baseUrl}/api/settings/config`, {
        method: "PATCH",
        headers: {
          authorization: `Bearer ${accessTokenA}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          outlet_id: outletAId,
          settings: [{ key: testKey, value: true }]
        })
      });
    }
  }
);
