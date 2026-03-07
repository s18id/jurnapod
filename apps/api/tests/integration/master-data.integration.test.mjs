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
const nextCliPath = path.resolve(repoRoot, "node_modules/next/dist/bin/next");
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
  const childProcess = spawn(process.execPath, [nextCliPath, "dev", "-p", String(port)], {
    cwd: apiRoot,
    env: childEnv,
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
  "master data integration: create item and price, then sync pull",
  { timeout: TEST_TIMEOUT_MS, concurrency: false },
  async () => {
    if (typeof loadEnvFile === "function" && existsSync(ENV_PATH)) {
      loadEnvFile(ENV_PATH);
    }

    const db = testContext.db;
    let childProcess;
    let createdItemId = 0;
    let createdPriceId = 0;

    const companyCode = readEnv("JP_COMPANY_CODE", "JP");
    const outletCode = readEnv("JP_OUTLET_CODE", "MAIN");
    const ownerEmail = readEnv("JP_OWNER_EMAIL").toLowerCase();
    const ownerPassword = readEnv("JP_OWNER_PASSWORD");
    const runId = Date.now().toString(36);

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

      const [ownerRoleRows] = await db.execute(
        `SELECT id, is_global
         FROM roles
         WHERE code = 'OWNER'
         LIMIT 1`
      );
      if (!ownerRoleRows[0]) {
        throw new Error("OWNER role not found; run `npm run db:migrate && npm run db:seed`");
      }

      if (Number(ownerRoleRows[0].is_global) !== 1) {
        await db.execute("UPDATE roles SET is_global = 1 WHERE id = ?", [
          Number(ownerRoleRows[0].id)
        ]);
      }

      const [ownerRoleAssignmentRows] = await db.execute(
        `SELECT 1
         FROM user_roles ur
         INNER JOIN users u ON u.id = ur.user_id
         INNER JOIN roles r ON r.id = ur.role_id
         INNER JOIN companies c ON c.id = u.company_id
         WHERE u.email = ?
           AND c.code = ?
           AND r.code = 'OWNER'
         LIMIT 1`,
        [ownerEmail, companyCode]
      );
      if (!ownerRoleAssignmentRows[0]) {
        await db.execute(
          `INSERT INTO user_roles (user_id, role_id)
           SELECT u.id, r.id
           FROM users u
           INNER JOIN roles r ON r.code = 'OWNER'
           INNER JOIN companies c ON c.id = u.company_id
           WHERE u.email = ?
             AND c.code = ?
           LIMIT 1`,
          [ownerEmail, companyCode]
        );

        const [postInsertRows] = await db.execute(
          `SELECT 1
           FROM user_roles ur
           INNER JOIN users u ON u.id = ur.user_id
           INNER JOIN roles r ON r.id = ur.role_id
           INNER JOIN companies c ON c.id = u.company_id
           WHERE u.email = ?
             AND c.code = ?
             AND r.code = 'OWNER'
           LIMIT 1`,
          [ownerEmail, companyCode]
        );
        if (!postInsertRows[0]) {
          throw new Error("Failed to ensure OWNER role assignment for test fixture");
        }
      }

      await db.execute(
        `INSERT INTO module_roles (company_id, role_id, module, permission_mask)
         SELECT c.id, r.id, 'inventory', 15
         FROM companies c
         INNER JOIN roles r ON r.code = 'OWNER'
         WHERE c.code = ?
         ON DUPLICATE KEY UPDATE permission_mask = 15`,
        [companyCode]
      );

      const companyId = Number(owner.company_id);
      const outletId = Number(owner.outlet_id);

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

      const baselinePullResponse = await fetch(
        `${baseUrl}/api/sync/pull?outlet_id=${outletId}&since_version=0`,
        {
          headers: {
            authorization: `Bearer ${accessToken}`
          }
        }
      );
      assert.equal(baselinePullResponse.status, 200);
      const baselinePullBody = await baselinePullResponse.json();
      assert.equal(baselinePullBody.success, true);
      const baselineVersion = Number(baselinePullBody.data.data_version);

      const createItemResponse = await fetch(`${baseUrl}/api/inventory/items`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          sku: `LATTE-${runId}`,
          name: `Cafe Latte ${runId}`,
          type: "PRODUCT",
          is_active: true
        })
      });
      assert.equal(createItemResponse.status, 201);
      const createItemBody = await createItemResponse.json();
      assert.equal(createItemBody.success, true);
      createdItemId = Number(createItemBody.data.id);

      const createPriceResponse = await fetch(`${baseUrl}/api/inventory/item-prices`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          item_id: createdItemId,
          outlet_id: outletId,
          price: 32000,
          is_active: true
        })
      });
      assert.equal(createPriceResponse.status, 201);
      const createPriceBody = await createPriceResponse.json();
      assert.equal(createPriceBody.success, true);
      createdPriceId = Number(createPriceBody.data.id);

      const deltaPullResponse = await fetch(
        `${baseUrl}/api/sync/pull?outlet_id=${outletId}&since_version=${baselineVersion}`,
        {
          headers: {
            authorization: `Bearer ${accessToken}`
          }
        }
      );
      assert.equal(deltaPullResponse.status, 200);
      const deltaPullBody = await deltaPullResponse.json();
      assert.equal(deltaPullBody.success, true);
      assert.equal(Number(deltaPullBody.data.data_version) > baselineVersion, true);

      const pullItem = deltaPullBody.data.items.find((item) => Number(item.id) === createdItemId);
      assert.equal(Boolean(pullItem), true);
      assert.equal(pullItem.name, `Cafe Latte ${runId}`);
      assert.equal(pullItem.type, "PRODUCT");

      const pullPrice = deltaPullBody.data.prices.find((price) => Number(price.id) === createdPriceId);
      assert.equal(Boolean(pullPrice), true);
      assert.equal(Number(pullPrice.item_id), createdItemId);
      assert.equal(Number(pullPrice.outlet_id), outletId);
      assert.equal(Number(pullPrice.price), 32000);

      const activePricesResponse = await fetch(
        `${baseUrl}/api/inventory/item-prices/active?outlet_id=${outletId}`,
        {
          headers: {
            authorization: `Bearer ${accessToken}`
          }
        }
      );
      assert.equal(activePricesResponse.status, 200);
      const activePricesBody = await activePricesResponse.json();
      assert.equal(activePricesBody.success, true);

      const activePrice = activePricesBody.data.find((price) => Number(price.id) === createdPriceId);
      assert.equal(Boolean(activePrice), true);

      const [dbVersionRows] = await db.execute(
        `SELECT current_version
         FROM sync_data_versions
         WHERE company_id = ?
         LIMIT 1`,
        [companyId]
      );
      assert.equal(Number(dbVersionRows[0].current_version), Number(deltaPullBody.data.data_version));
    } finally {
      if (createdPriceId > 0) {
        await db.execute("DELETE FROM item_prices WHERE id = ?", [createdPriceId]);
      }

      if (createdItemId > 0) {
        await db.execute("DELETE FROM items WHERE id = ?", [createdItemId]);
      }

    }
  }
);

test(
  "master data integration: malformed guard/query params return 400",
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

    try {
      const [ownerRows] = await db.execute(
        `SELECT o.id AS outlet_id
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

      const outletId = Number(owner.outlet_id);
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

      const malformedGuardResponse = await fetch(
        `${baseUrl}/api/inventory/item-prices/active?outlet_id=not-a-number`,
        {
          headers: {
            authorization: `Bearer ${accessToken}`
          }
        }
      );
      assert.equal(malformedGuardResponse.status, 400);
      const malformedGuardBody = await malformedGuardResponse.json();
      assert.equal(malformedGuardBody.success, false);
      assert.equal(malformedGuardBody.error.code, "INVALID_REQUEST");

      const malformedSyncOutletResponse = await fetch(
        `${baseUrl}/api/sync/pull?outlet_id=bad-value&since_version=0`,
        {
          headers: {
            authorization: `Bearer ${accessToken}`
          }
        }
      );
      assert.equal(malformedSyncOutletResponse.status, 400);
      const malformedSyncOutletBody = await malformedSyncOutletResponse.json();
      assert.equal(malformedSyncOutletBody.success, false);
      assert.equal(malformedSyncOutletBody.error.code, "INVALID_REQUEST");

      const malformedSyncVersionResponse = await fetch(
        `${baseUrl}/api/sync/pull?outlet_id=${outletId}&since_version=bad-value`,
        {
          headers: {
            authorization: `Bearer ${accessToken}`
          }
        }
      );
      assert.equal(malformedSyncVersionResponse.status, 400);
      const malformedSyncVersionBody = await malformedSyncVersionResponse.json();
      assert.equal(malformedSyncVersionBody.success, false);
      assert.equal(malformedSyncVersionBody.error.code, "INVALID_REQUEST");
    } finally {
      
    }
  }
);

test(
  "master data integration: item-prices RBAC deny and concurrent duplicate create",
  { timeout: TEST_TIMEOUT_MS, concurrency: false },
  async () => {
    if (typeof loadEnvFile === "function" && existsSync(ENV_PATH)) {
      loadEnvFile(ENV_PATH);
    }

    const db = testContext.db;
    let childProcess;
    let deniedOutletId = 0;
    let deniedItemId = 0;
    let deniedPriceId = 0;
    let duplicateItemId = 0;
    let duplicatePriceId = 0;

    const companyCode = readEnv("JP_COMPANY_CODE", "JP");
    const outletCode = readEnv("JP_OUTLET_CODE", "MAIN");
    const ownerEmail = readEnv("JP_OWNER_EMAIL").toLowerCase();
    const ownerPassword = readEnv("JP_OWNER_PASSWORD");
    const runId = Date.now().toString(36);
    const deniedOutletCode = `RBD${runId}`.slice(0, 32).toUpperCase();

    try {
      const [ownerRows] = await db.execute(
        `SELECT u.id, u.company_id, o.id AS outlet_id
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

      const [ownerRoleRows] = await db.execute(
        `SELECT id, is_global
         FROM roles
         WHERE code = 'OWNER'
         LIMIT 1`
      );
      if (!ownerRoleRows[0]) {
        throw new Error("OWNER role not found; run `npm run db:migrate && npm run db:seed`");
      }

      if (Number(ownerRoleRows[0].is_global) !== 1) {
        await db.execute("UPDATE roles SET is_global = 1 WHERE id = ?", [
          Number(ownerRoleRows[0].id)
        ]);
      }

      const [ownerRoleAssignmentRows] = await db.execute(
        `SELECT 1
         FROM user_roles ur
         INNER JOIN users u ON u.id = ur.user_id
         INNER JOIN roles r ON r.id = ur.role_id
         INNER JOIN companies c ON c.id = u.company_id
         WHERE u.email = ?
           AND c.code = ?
           AND r.code = 'OWNER'
         LIMIT 1`,
        [ownerEmail, companyCode]
      );
      if (!ownerRoleAssignmentRows[0]) {
        await db.execute(
          `INSERT INTO user_roles (user_id, role_id)
           SELECT u.id, r.id
           FROM users u
           INNER JOIN roles r ON r.code = 'OWNER'
           INNER JOIN companies c ON c.id = u.company_id
           WHERE u.email = ?
             AND c.code = ?
           LIMIT 1`,
          [ownerEmail, companyCode]
        );

        const [postInsertRows] = await db.execute(
          `SELECT 1
           FROM user_roles ur
           INNER JOIN users u ON u.id = ur.user_id
           INNER JOIN roles r ON r.id = ur.role_id
           INNER JOIN companies c ON c.id = u.company_id
           WHERE u.email = ?
             AND c.code = ?
             AND r.code = 'OWNER'
           LIMIT 1`,
          [ownerEmail, companyCode]
        );
        if (!postInsertRows[0]) {
          throw new Error("Failed to ensure OWNER role assignment for test fixture");
        }
      }

      const ownerUserId = Number(owner.id);
      const companyId = Number(owner.company_id);
      const allowedOutletId = Number(owner.outlet_id);

      const [deniedOutletResult] = await db.execute(
        `INSERT INTO outlets (company_id, code, name)
         VALUES (?, ?, ?)`,
        [companyId, deniedOutletCode, `RBAC Denied Outlet ${runId}`]
      );
      deniedOutletId = Number(deniedOutletResult.insertId);

      const [deniedItemResult] = await db.execute(
        `INSERT INTO items (company_id, sku, name, item_type, is_active)
         VALUES (?, ?, ?, 'PRODUCT', 1)`,
        [companyId, `DENIED-${runId}`, `Denied Item ${runId}`]
      );
      deniedItemId = Number(deniedItemResult.insertId);

      const [deniedPriceResult] = await db.execute(
        `INSERT INTO item_prices (company_id, outlet_id, item_id, price, is_active)
         VALUES (?, ?, ?, ?, 1)`,
        [companyId, deniedOutletId, deniedItemId, 25000]
      );
      deniedPriceId = Number(deniedPriceResult.insertId);

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

      const deniedListResponse = await fetch(
        `${baseUrl}/api/inventory/item-prices?outlet_id=${deniedOutletId}`,
        {
          headers: {
            authorization: `Bearer ${accessToken}`
          }
        }
      );
      assert.equal(deniedListResponse.status, 200);

      const deniedActiveResponse = await fetch(
        `${baseUrl}/api/inventory/item-prices/active?outlet_id=${deniedOutletId}`,
        {
          headers: {
            authorization: `Bearer ${accessToken}`
          }
        }
      );
      assert.equal(deniedActiveResponse.status, 200);
      const deniedActiveBody = await deniedActiveResponse.json();
      assert.equal(deniedActiveBody.success, true);

      const deniedCreateResponse = await fetch(`${baseUrl}/api/inventory/item-prices`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          item_id: deniedItemId,
          outlet_id: deniedOutletId,
          price: 26000,
          is_active: true
        })
      });
      assert.equal(deniedCreateResponse.status, 409);
      const deniedCreateBody = await deniedCreateResponse.json();
      assert.equal(deniedCreateBody.success, false);
      assert.equal(deniedCreateBody.error.code, "CONFLICT");

      const deniedGetByIdResponse = await fetch(`${baseUrl}/api/inventory/item-prices/${deniedPriceId}`, {
        headers: {
          authorization: `Bearer ${accessToken}`
        }
      });
      assert.equal(deniedGetByIdResponse.status, 200);

      const deniedPatchResponse = await fetch(`${baseUrl}/api/inventory/item-prices/${deniedPriceId}`, {
        method: "PATCH",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          price: 27000
        })
      });
      assert.equal(deniedPatchResponse.status, 200);

      const deniedDeleteResponse = await fetch(`${baseUrl}/api/inventory/item-prices/${deniedPriceId}`, {
        method: "DELETE",
        headers: {
          authorization: `Bearer ${accessToken}`
        }
      });
      assert.equal(deniedDeleteResponse.status, 200);

      const scopedListResponse = await fetch(`${baseUrl}/api/inventory/item-prices`, {
        headers: {
          authorization: `Bearer ${accessToken}`
        }
      });
      assert.equal(scopedListResponse.status, 200);
      const scopedListBody = await scopedListResponse.json();
      assert.equal(scopedListBody.success, true);
      const deniedPriceVisible = scopedListBody.data.some(
        (price) => Number(price.id) === deniedPriceId
      );
      assert.equal(deniedPriceVisible, false);

      const createItemResponse = await fetch(`${baseUrl}/api/inventory/items`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          sku: `RACE-${runId}`,
          name: `Race Item ${runId}`,
          type: "PRODUCT",
          is_active: true
        })
      });
      assert.equal(createItemResponse.status, 201);
      const createItemBody = await createItemResponse.json();
      assert.equal(createItemBody.success, true);
      duplicateItemId = Number(createItemBody.data.id);

      const duplicatePayload = {
        item_id: duplicateItemId,
        outlet_id: allowedOutletId,
        price: 39000,
        is_active: true
      };

      const [concurrentFirstResponse, concurrentSecondResponse] = await Promise.all([
        fetch(`${baseUrl}/api/inventory/item-prices`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${accessToken}`,
            "content-type": "application/json"
          },
          body: JSON.stringify(duplicatePayload)
        }),
        fetch(`${baseUrl}/api/inventory/item-prices`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${accessToken}`,
            "content-type": "application/json"
          },
          body: JSON.stringify(duplicatePayload)
        })
      ]);

      const concurrentStatuses = [concurrentFirstResponse.status, concurrentSecondResponse.status].sort(
        (a, b) => a - b
      );
      assert.deepEqual(concurrentStatuses, [201, 409]);

      const concurrentBodies = await Promise.all([
        concurrentFirstResponse.json(),
        concurrentSecondResponse.json()
      ]);
      const successfulCreateBody = concurrentBodies.find((body) => body.success === true);
      const conflictCreateBody = concurrentBodies.find((body) => body.success === false);

      assert.equal(Boolean(successfulCreateBody), true);
      assert.equal(Boolean(conflictCreateBody), true);
      assert.equal(conflictCreateBody.error.code, "CONFLICT");
      duplicatePriceId = Number(successfulCreateBody.data.id);

      const [duplicatePriceCountRows] = await db.execute(
        `SELECT COUNT(*) AS total
         FROM item_prices
         WHERE company_id = ?
           AND outlet_id = ?
           AND item_id = ?`,
        [companyId, allowedOutletId, duplicateItemId]
      );
      assert.equal(Number(duplicatePriceCountRows[0].total), 1);

      const [duplicateAuditRows] = await db.execute(
        `SELECT COUNT(*) AS total
         FROM audit_logs
         WHERE action = 'MASTER_DATA_ITEM_PRICE_CREATE'
           AND company_id = ?
           AND user_id = ?
           AND JSON_UNQUOTE(JSON_EXTRACT(payload_json, '$.after.item_id')) = ?
           AND JSON_UNQUOTE(JSON_EXTRACT(payload_json, '$.after.outlet_id')) = ?`,
        [companyId, ownerUserId, String(duplicateItemId), String(allowedOutletId)]
      );
      assert.equal(Number(duplicateAuditRows[0].total), 1);
    } finally {
      

      if (duplicatePriceId > 0) {
        await db.execute("DELETE FROM item_prices WHERE id = ?", [duplicatePriceId]);
      }

      if (deniedPriceId > 0) {
        await db.execute("DELETE FROM item_prices WHERE id = ?", [deniedPriceId]);
      }

      if (duplicateItemId > 0) {
        await db.execute("DELETE FROM items WHERE id = ?", [duplicateItemId]);
      }

      if (deniedItemId > 0) {
        await db.execute("DELETE FROM items WHERE id = ?", [deniedItemId]);
      }

      if (deniedOutletId > 0) {
        await db.execute("DELETE FROM outlets WHERE id = ?", [deniedOutletId]);
      }

      if (duplicateItemId > 0) {
        await db.execute(
          `DELETE FROM audit_logs
           WHERE action IN (
             'MASTER_DATA_ITEM_CREATE',
             'MASTER_DATA_ITEM_UPDATE',
             'MASTER_DATA_ITEM_DELETE',
             'MASTER_DATA_ITEM_PRICE_CREATE',
             'MASTER_DATA_ITEM_PRICE_UPDATE',
             'MASTER_DATA_ITEM_PRICE_DELETE'
           )
             AND (
               JSON_UNQUOTE(JSON_EXTRACT(payload_json, '$.item_id')) = ?
               OR JSON_UNQUOTE(JSON_EXTRACT(payload_json, '$.before.id')) = ?
               OR JSON_UNQUOTE(JSON_EXTRACT(payload_json, '$.after.id')) = ?
               OR JSON_UNQUOTE(JSON_EXTRACT(payload_json, '$.before.item_id')) = ?
               OR JSON_UNQUOTE(JSON_EXTRACT(payload_json, '$.after.item_id')) = ?
             )`,
          [
            String(duplicateItemId),
            String(duplicateItemId),
            String(duplicateItemId),
            String(duplicateItemId),
            String(duplicateItemId)
          ]
        );
      }

      
    }
  }
);

test(
  "master data integration: item-prices PATCH/DELETE TOCTOU auth race is denied",
  { timeout: TEST_TIMEOUT_MS, concurrency: false },
  async () => {
    if (typeof loadEnvFile === "function" && existsSync(ENV_PATH)) {
      loadEnvFile(ENV_PATH);
    }

    const db = testContext.db;
    let childProcess;
    let deniedOutletId = 0;
    let adminUserId = 0;
    let raceItemId = 0;
    let racePriceId = 0;

    const companyCode = readEnv("JP_COMPANY_CODE", "JP");
    const outletCode = readEnv("JP_OUTLET_CODE", "MAIN");
    const ownerEmail = readEnv("JP_OWNER_EMAIL").toLowerCase();
    const ownerPassword = readEnv("JP_OWNER_PASSWORD");
    const runId = Date.now().toString(36);
    const adminEmail = `admin-toctou-${runId}@example.com`;
    const adminPassword = ownerPassword;
    const deniedOutletCode = `TOC${runId}`.slice(0, 32).toUpperCase();

    try {
      const [ownerRows] = await db.execute(
        `SELECT u.id, u.company_id, o.id AS outlet_id
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

      const ownerUserId = Number(owner.id);
      const companyId = Number(owner.company_id);
      const allowedOutletId = Number(owner.outlet_id);

      const [ownerPasswordRows] = await db.execute(
        `SELECT password_hash
         FROM users
         WHERE id = ?
         LIMIT 1`,
        [ownerUserId]
      );
      const ownerPasswordHash = ownerPasswordRows[0]?.password_hash;
      if (!ownerPasswordHash) {
        throw new Error("owner password hash not found; run `npm run db:migrate && npm run db:seed`");
      }

      const [adminRoleRows] = await db.execute(
        `SELECT id
         FROM roles
         WHERE code = 'ADMIN'
         LIMIT 1`
      );
      const adminRoleId = adminRoleRows[0]?.id;
      if (!adminRoleId) {
        throw new Error("ADMIN role not found; run `npm run db:migrate && npm run db:seed`");
      }

      const [adminInsert] = await db.execute(
        `INSERT INTO users (company_id, email, password_hash, is_active)
         VALUES (?, ?, ?, 1)`,
        [companyId, adminEmail, ownerPasswordHash]
      );
      adminUserId = Number(adminInsert.insertId);

      await db.execute(
        `INSERT INTO user_roles (user_id, role_id)
         VALUES (?, ?)`,
        [adminUserId, Number(adminRoleId)]
      );

      await db.execute(
        `INSERT INTO user_outlet_roles (user_id, outlet_id, role_id)
         VALUES (?, ?, ?)`,
        [adminUserId, allowedOutletId, Number(adminRoleId)]
      );


      await db.execute(
        `INSERT INTO module_roles (company_id, role_id, module, permission_mask)
         VALUES (?, ?, 'inventory', 15)
         ON DUPLICATE KEY UPDATE permission_mask = 15`,
        [companyId, Number(adminRoleId)]
      );

      const [deniedOutletResult] = await db.execute(
        `INSERT INTO outlets (company_id, code, name)
         VALUES (?, ?, ?)`,
        [companyId, deniedOutletCode, `TOCTOU Denied Outlet ${runId}`]
      );
      deniedOutletId = Number(deniedOutletResult.insertId);

      const [raceItemResult] = await db.execute(
        `INSERT INTO items (company_id, sku, name, item_type, is_active)
         VALUES (?, ?, ?, 'PRODUCT', 1)`,
        [companyId, `TOCTOU-${runId}`, `TOCTOU Item ${runId}`]
      );
      raceItemId = Number(raceItemResult.insertId);

      const [racePriceResult] = await db.execute(
        `INSERT INTO item_prices (company_id, outlet_id, item_id, price, is_active)
         VALUES (?, ?, ?, ?, 1)`,
        [companyId, allowedOutletId, raceItemId, 41000]
      );
      racePriceId = Number(racePriceResult.insertId);

      const baseUrl = testContext.baseUrl;

      const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          companyCode,
          email: adminEmail,
          password: adminPassword
        })
      });
      assert.equal(loginResponse.status, 200);
      const loginBody = await loginResponse.json();
      assert.equal(loginBody.success, true);
      const accessToken = loginBody.data.access_token;

      await db.execute(
        `UPDATE item_prices
         SET outlet_id = ?, updated_at = CURRENT_TIMESTAMP
         WHERE company_id = ?
           AND id = ?`,
        [deniedOutletId, companyId, racePriceId]
      );

      const patchResponse = await fetch(`${baseUrl}/api/inventory/item-prices/${racePriceId}`, {
        method: "PATCH",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          price: 42000
        })
      });
      assert.equal(patchResponse.status, 403);
      const patchBody = await patchResponse.json();
      assert.equal(patchBody.success, false);
      assert.equal(patchBody.error.code, "FORBIDDEN");

      const [afterPatchRows] = await db.execute(
        `SELECT outlet_id, price
         FROM item_prices
         WHERE company_id = ?
           AND id = ?
         LIMIT 1`,
        [companyId, racePriceId]
      );
      assert.equal(afterPatchRows.length, 1);
      assert.equal(Number(afterPatchRows[0].outlet_id), deniedOutletId);
      assert.equal(Number(afterPatchRows[0].price), 41000);

      const deleteResponse = await fetch(`${baseUrl}/api/inventory/item-prices/${racePriceId}`, {
        method: "DELETE",
        headers: {
          authorization: `Bearer ${accessToken}`
        }
      });
      assert.equal(deleteResponse.status, 403);
      const deleteBody = await deleteResponse.json();
      assert.equal(deleteBody.success, false);
      assert.equal(deleteBody.error.code, "FORBIDDEN");

      const [afterDeleteRows] = await db.execute(
        `SELECT outlet_id, price
         FROM item_prices
         WHERE company_id = ?
           AND id = ?
         LIMIT 1`,
        [companyId, racePriceId]
      );
      assert.equal(afterDeleteRows.length, 1);
      assert.equal(Number(afterDeleteRows[0].outlet_id), deniedOutletId);
      assert.equal(Number(afterDeleteRows[0].price), 41000);

      const [forbiddenAuditRows] = await db.execute(
        `SELECT COUNT(*) AS total
         FROM audit_logs
         WHERE company_id = ?
           AND user_id = ?
           AND action IN ('MASTER_DATA_ITEM_PRICE_UPDATE', 'MASTER_DATA_ITEM_PRICE_DELETE')
           AND JSON_UNQUOTE(JSON_EXTRACT(payload_json, '$.item_price_id')) = ?`,
        [companyId, adminUserId, String(racePriceId)]
      );
      assert.equal(Number(forbiddenAuditRows[0].total), 0);
    } finally {
      

      if (racePriceId > 0) {
        await db.execute("DELETE FROM item_prices WHERE id = ?", [racePriceId]);
      }

      if (raceItemId > 0) {
        await db.execute("DELETE FROM items WHERE id = ?", [raceItemId]);
      }

      if (deniedOutletId > 0) {
        await db.execute("DELETE FROM outlets WHERE id = ?", [deniedOutletId]);
      }

      if (adminUserId > 0) {
        await db.execute("DELETE FROM user_outlet_roles WHERE user_id = ?", [adminUserId]);
        await db.execute("DELETE FROM user_roles WHERE user_id = ?", [adminUserId]);
        await db.execute("DELETE FROM users WHERE id = ?", [adminUserId]);
      }

      
    }
  }
);

test(
  "master data integration: company default price + outlet override resolution",
  { timeout: TEST_TIMEOUT_MS, concurrency: false },
  async () => {
    if (typeof loadEnvFile === "function" && existsSync(ENV_PATH)) {
      loadEnvFile(ENV_PATH);
    }

    const db = testContext.db;
    let defaultItemId = 0;
    let overrideItemId = 0;
    let defaultPriceId = 0;
    let defaultPrice2Id = 0;
    let override1PriceId = 0;
    let override2PriceId = 0;
    let outlet2Id = 0;

    const companyCode = readEnv("JP_COMPANY_CODE", "JP");
    const outletCode = readEnv("JP_OUTLET_CODE", "MAIN");
    const ownerEmail = readEnv("JP_OWNER_EMAIL").toLowerCase();
    const ownerPassword = readEnv("JP_OWNER_PASSWORD");
    const runId = Date.now().toString(36);

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

      const companyId = Number(owner.company_id);
      const outlet1Id = Number(owner.outlet_id);

      const [outlet2Result] = await db.execute(
        `INSERT INTO outlets (company_id, code, name)
         VALUES (?, ?, ?)`,
        [companyId, `OUT2-${runId}`.slice(0, 32).toUpperCase(), `Outlet 2 ${runId}`]
      );
      outlet2Id = Number(outlet2Result.insertId);

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

      // Create item with company default price
      const createDefaultItemResponse = await fetch(`${baseUrl}/api/inventory/items`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          sku: `DEFAULT-${runId}`,
          name: `Default Price Item ${runId}`,
          type: "PRODUCT",
          is_active: true
        })
      });
      assert.equal(createDefaultItemResponse.status, 201);
      const createDefaultItemBody = await createDefaultItemResponse.json();
      defaultItemId = Number(createDefaultItemBody.data.id);

      // Create company default price (outlet_id = null)
      const createDefaultPriceResponse = await fetch(`${baseUrl}/api/inventory/item-prices`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          item_id: defaultItemId,
          outlet_id: null,
          price: 50000,
          is_active: true
        })
      });
      assert.equal(createDefaultPriceResponse.status, 201);
      const createDefaultPriceBody = await createDefaultPriceResponse.json();
      assert.equal(createDefaultPriceBody.success, true);
      defaultPriceId = Number(createDefaultPriceBody.data.id);
      assert.equal(createDefaultPriceBody.data.outlet_id, null);
      assert.equal(Number(createDefaultPriceBody.data.price), 50000);

      // Create item with outlet overrides
      const createOverrideItemResponse = await fetch(`${baseUrl}/api/inventory/items`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          sku: `OVERRIDE-${runId}`,
          name: `Override Item ${runId}`,
          type: "PRODUCT",
          is_active: true
        })
      });
      assert.equal(createOverrideItemResponse.status, 201);
      const createOverrideItemBody = await createOverrideItemResponse.json();
      overrideItemId = Number(createOverrideItemBody.data.id);

      // Create company default for override item
      const createDefaultPrice2Response = await fetch(`${baseUrl}/api/inventory/item-prices`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          item_id: overrideItemId,
          outlet_id: null,
          price: 60000,
          is_active: true
        })
      });
      assert.equal(createDefaultPrice2Response.status, 201);
      const createDefaultPrice2Body = await createDefaultPrice2Response.json();
      defaultPrice2Id = Number(createDefaultPrice2Body.data.id);

      // Create outlet override for outlet1
      const createOverride1Response = await fetch(`${baseUrl}/api/inventory/item-prices`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          item_id: overrideItemId,
          outlet_id: outlet1Id,
          price: 75000,
          is_active: true
        })
      });
      assert.equal(createOverride1Response.status, 201);
      const createOverride1Body = await createOverride1Response.json();
      override1PriceId = Number(createOverride1Body.data.id);

      // Create outlet override for outlet2
      const createOverride2Response = await fetch(`${baseUrl}/api/inventory/item-prices`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          item_id: overrideItemId,
          outlet_id: outlet2Id,
          price: 65000,
          is_active: true
        })
      });
      assert.equal(createOverride2Response.status, 201);
      const createOverride2Body = await createOverride2Response.json();
      override2PriceId = Number(createOverride2Body.data.id);

      // Test sync pull for outlet1: should get default price for defaultItem and override for overrideItem
      const syncPullOutlet1Response = await fetch(
        `${baseUrl}/api/sync/pull?outlet_id=${outlet1Id}&since_version=0`,
        {
          headers: {
            authorization: `Bearer ${accessToken}`
          }
        }
      );
      assert.equal(syncPullOutlet1Response.status, 200);
      const syncPullOutlet1Body = await syncPullOutlet1Response.json();
      assert.equal(syncPullOutlet1Body.success, true);

      const defaultItemPrice = syncPullOutlet1Body.data.prices.find(
        (p) => Number(p.item_id) === defaultItemId
      );
      const overrideItemPrice = syncPullOutlet1Body.data.prices.find(
        (p) => Number(p.item_id) === overrideItemId
      );

      assert.equal(Boolean(defaultItemPrice), true);
      assert.equal(Number(defaultItemPrice.price), 50000);
      assert.equal(Number(defaultItemPrice.outlet_id), outlet1Id);

      assert.equal(Boolean(overrideItemPrice), true);
      assert.equal(Number(overrideItemPrice.price), 75000);
      assert.equal(Number(overrideItemPrice.outlet_id), outlet1Id);

      // Test sync pull for outlet2: should get default price for defaultItem and different override for overrideItem
      const syncPullOutlet2Response = await fetch(
        `${baseUrl}/api/sync/pull?outlet_id=${outlet2Id}&since_version=0`,
        {
          headers: {
            authorization: `Bearer ${accessToken}`
          }
        }
      );
      assert.equal(syncPullOutlet2Response.status, 200);
      const syncPullOutlet2Body = await syncPullOutlet2Response.json();
      assert.equal(syncPullOutlet2Body.success, true);

      const defaultItemPrice2 = syncPullOutlet2Body.data.prices.find(
        (p) => Number(p.item_id) === defaultItemId
      );
      const overrideItemPrice2 = syncPullOutlet2Body.data.prices.find(
        (p) => Number(p.item_id) === overrideItemId
      );

      assert.equal(Boolean(defaultItemPrice2), true);
      assert.equal(Number(defaultItemPrice2.price), 50000);
      assert.equal(Number(defaultItemPrice2.outlet_id), outlet2Id);

      assert.equal(Boolean(overrideItemPrice2), true);
      assert.equal(Number(overrideItemPrice2.price), 65000);
      assert.equal(Number(overrideItemPrice2.outlet_id), outlet2Id);

      // Test duplicate company default prevention
      const createDuplicateDefaultResponse = await fetch(`${baseUrl}/api/inventory/item-prices`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          item_id: defaultItemId,
          outlet_id: null,
          price: 55000,
          is_active: true
        })
      });
      assert.equal(createDuplicateDefaultResponse.status, 409);
      const createDuplicateDefaultBody = await createDuplicateDefaultResponse.json();
      assert.equal(createDuplicateDefaultBody.success, false);
      assert.equal(createDuplicateDefaultBody.error.code, "CONFLICT");

      // Test duplicate outlet override prevention
      const createDuplicateOverrideResponse = await fetch(`${baseUrl}/api/inventory/item-prices`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          item_id: overrideItemId,
          outlet_id: outlet1Id,
          price: 80000,
          is_active: true
        })
      });
      assert.equal(createDuplicateOverrideResponse.status, 409);
      const createDuplicateOverrideBody = await createDuplicateOverrideResponse.json();
      assert.equal(createDuplicateOverrideBody.success, false);
      assert.equal(createDuplicateOverrideBody.error.code, "CONFLICT");
    } finally {
      if (override2PriceId > 0) {
        await db.execute("DELETE FROM item_prices WHERE id = ?", [override2PriceId]);
      }

      if (override1PriceId > 0) {
        await db.execute("DELETE FROM item_prices WHERE id = ?", [override1PriceId]);
      }

      if (defaultPrice2Id > 0) {
        await db.execute("DELETE FROM item_prices WHERE id = ?", [defaultPrice2Id]);
      }

      if (defaultPriceId > 0) {
        await db.execute("DELETE FROM item_prices WHERE id = ?", [defaultPriceId]);
      }

      if (overrideItemId > 0) {
        await db.execute("DELETE FROM items WHERE id = ?", [overrideItemId]);
      }

      if (defaultItemId > 0) {
        await db.execute("DELETE FROM items WHERE id = ?", [defaultItemId]);
      }

      if (outlet2Id > 0) {
        await db.execute("DELETE FROM outlets WHERE id = ?", [outlet2Id]);
      }
    }
  }
);

test(
  "master data integration: admin cannot manage company default prices",
  { timeout: TEST_TIMEOUT_MS, concurrency: false },
  async () => {
    if (typeof loadEnvFile === "function" && existsSync(ENV_PATH)) {
      loadEnvFile(ENV_PATH);
    }

    const db = testContext.db;
    let adminUserId = 0;
    let itemId = 0;
    let defaultPriceId = 0;
    let overridePriceId = 0;

    const companyCode = readEnv("JP_COMPANY_CODE", "JP");
    const outletCode = readEnv("JP_OUTLET_CODE", "MAIN");
    const ownerEmail = readEnv("JP_OWNER_EMAIL").toLowerCase();
    const ownerPassword = readEnv("JP_OWNER_PASSWORD");
    const runId = Date.now().toString(36);
    const adminEmail = `admin-default-rbac-${runId}@example.com`;

    try {
      const [ownerRows] = await db.execute(
        `SELECT u.id, u.company_id, o.id AS outlet_id
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

      const companyId = Number(owner.company_id);
      const outletId = Number(owner.outlet_id);

      const [ownerPasswordRows] = await db.execute(
        `SELECT password_hash
         FROM users
         WHERE id = ?
         LIMIT 1`,
        [Number(owner.id)]
      );
      const ownerPasswordHash = ownerPasswordRows[0]?.password_hash;
      if (!ownerPasswordHash) {
        throw new Error("owner password hash not found; run `npm run db:migrate && npm run db:seed`");
      }

      const [adminRoleRows] = await db.execute(
        `SELECT id
         FROM roles
         WHERE code = 'ADMIN'
         LIMIT 1`
      );
      const adminRoleId = adminRoleRows[0]?.id;
      if (!adminRoleId) {
        throw new Error("ADMIN role not found; run `npm run db:migrate && npm run db:seed`");
      }

      const [adminInsert] = await db.execute(
        `INSERT INTO users (company_id, email, password_hash, is_active)
         VALUES (?, ?, ?, 1)`,
        [companyId, adminEmail, ownerPasswordHash]
      );
      adminUserId = Number(adminInsert.insertId);

      await db.execute(
        `INSERT INTO user_roles (user_id, role_id)
         VALUES (?, ?)`,
        [adminUserId, Number(adminRoleId)]
      );

      await db.execute(
        `INSERT INTO user_outlet_roles (user_id, outlet_id, role_id)
         VALUES (?, ?, ?)`,
        [adminUserId, outletId, Number(adminRoleId)]
      );

      await db.execute(
        `INSERT INTO module_roles (company_id, role_id, module, permission_mask)
         VALUES (?, ?, 'inventory', 15)
         ON DUPLICATE KEY UPDATE permission_mask = 15`,
        [companyId, Number(adminRoleId)]
      );

      const [itemInsert] = await db.execute(
        `INSERT INTO items (company_id, sku, name, item_type, is_active)
         VALUES (?, ?, ?, 'PRODUCT', 1)`,
        [companyId, `RBAC-DEF-${runId}`, `RBAC Default Item ${runId}`]
      );
      itemId = Number(itemInsert.insertId);

      const [defaultPriceInsert] = await db.execute(
        `INSERT INTO item_prices (company_id, outlet_id, item_id, price, is_active)
         VALUES (?, NULL, ?, ?, 1)`,
        [companyId, itemId, 88000]
      );
      defaultPriceId = Number(defaultPriceInsert.insertId);

      const baseUrl = testContext.baseUrl;

      const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          companyCode,
          email: adminEmail,
          password: ownerPassword
        })
      });
      assert.equal(loginResponse.status, 200);
      const loginBody = await loginResponse.json();
      assert.equal(loginBody.success, true);
      const accessToken = loginBody.data.access_token;

      const createDefaultResponse = await fetch(`${baseUrl}/api/inventory/item-prices`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          item_id: itemId,
          outlet_id: null,
          price: 99000,
          is_active: true
        })
      });
      assert.equal(createDefaultResponse.status, 403);

      const getDefaultResponse = await fetch(`${baseUrl}/api/inventory/item-prices/${defaultPriceId}`, {
        headers: {
          authorization: `Bearer ${accessToken}`
        }
      });
      assert.equal(getDefaultResponse.status, 403);

      const patchDefaultResponse = await fetch(`${baseUrl}/api/inventory/item-prices/${defaultPriceId}`, {
        method: "PATCH",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          price: 90000
        })
      });
      assert.equal(patchDefaultResponse.status, 403);

      const deleteDefaultResponse = await fetch(`${baseUrl}/api/inventory/item-prices/${defaultPriceId}`, {
        method: "DELETE",
        headers: {
          authorization: `Bearer ${accessToken}`
        }
      });
      assert.equal(deleteDefaultResponse.status, 403);

      const createOverrideResponse = await fetch(`${baseUrl}/api/inventory/item-prices`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          item_id: itemId,
          outlet_id: outletId,
          price: 91000,
          is_active: true
        })
      });
      assert.equal(createOverrideResponse.status, 201);
      const createOverrideBody = await createOverrideResponse.json();
      assert.equal(createOverrideBody.success, true);
      overridePriceId = Number(createOverrideBody.data.id);
    } finally {
      if (overridePriceId > 0) {
        await db.execute("DELETE FROM item_prices WHERE id = ?", [overridePriceId]);
      }

      if (defaultPriceId > 0) {
        await db.execute("DELETE FROM item_prices WHERE id = ?", [defaultPriceId]);
      }

      if (itemId > 0) {
        await db.execute("DELETE FROM items WHERE id = ?", [itemId]);
      }

      if (adminUserId > 0) {
        await db.execute("DELETE FROM user_outlet_roles WHERE user_id = ?", [adminUserId]);
        await db.execute("DELETE FROM user_roles WHERE user_id = ?", [adminUserId]);
        await db.execute("DELETE FROM users WHERE id = ?", [adminUserId]);
      }
    }
  }
);
