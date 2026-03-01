import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const apiRoot = path.resolve(__dirname, "../..");
const repoRoot = path.resolve(apiRoot, "../..");
const nextCliPath = path.resolve(repoRoot, "node_modules/next/dist/bin/next");
const loadEnvFile = process.loadEnvFile;
const ENV_PATH = path.resolve(repoRoot, ".env");
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

    const db = await mysql.createConnection(dbConfigFromEnv());
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

      const companyId = Number(owner.company_id);
      const outletId = Number(owner.outlet_id);

      const port = await getFreePort();
      const baseUrl = `http://127.0.0.1:${port}`;
      const server = startApiServer(port);
      childProcess = server.childProcess;
      await waitForHealthcheck(baseUrl, childProcess, server.serverLogs);

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
      assert.equal(loginBody.ok, true);
      const accessToken = loginBody.access_token;

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
      assert.equal(baselinePullBody.ok, true);
      const baselineVersion = Number(baselinePullBody.data_version);

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
      assert.equal(createItemBody.ok, true);
      createdItemId = Number(createItemBody.item.id);

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
      assert.equal(createPriceBody.ok, true);
      createdPriceId = Number(createPriceBody.item_price.id);

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
      assert.equal(deltaPullBody.ok, true);
      assert.equal(Number(deltaPullBody.data_version) > baselineVersion, true);

      const pullItem = deltaPullBody.items.find((item) => Number(item.id) === createdItemId);
      assert.equal(Boolean(pullItem), true);
      assert.equal(pullItem.name, `Cafe Latte ${runId}`);
      assert.equal(pullItem.type, "PRODUCT");

      const pullPrice = deltaPullBody.prices.find((price) => Number(price.id) === createdPriceId);
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
      assert.equal(activePricesBody.ok, true);

      const activePrice = activePricesBody.prices.find((price) => Number(price.id) === createdPriceId);
      assert.equal(Boolean(activePrice), true);

      const [dbVersionRows] = await db.execute(
        `SELECT current_version
         FROM sync_data_versions
         WHERE company_id = ?
         LIMIT 1`,
        [companyId]
      );
      assert.equal(Number(dbVersionRows[0].current_version), Number(deltaPullBody.data_version));
    } finally {
      await stopApiServer(childProcess);

      if (createdPriceId > 0) {
        await db.execute("DELETE FROM item_prices WHERE id = ?", [createdPriceId]);
      }

      if (createdItemId > 0) {
        await db.execute("DELETE FROM items WHERE id = ?", [createdItemId]);
      }

      await db.end();
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

    const db = await mysql.createConnection(dbConfigFromEnv());
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
      const port = await getFreePort();
      const baseUrl = `http://127.0.0.1:${port}`;
      const server = startApiServer(port);
      childProcess = server.childProcess;
      await waitForHealthcheck(baseUrl, childProcess, server.serverLogs);

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
      assert.equal(loginBody.ok, true);
      const accessToken = loginBody.access_token;

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
      assert.equal(malformedSyncVersionBody.ok, false);
      assert.equal(malformedSyncVersionBody.error.code, "INVALID_REQUEST");
    } finally {
      await stopApiServer(childProcess);
      await db.end();
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

    const db = await mysql.createConnection(dbConfigFromEnv());
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

      const port = await getFreePort();
      const baseUrl = `http://127.0.0.1:${port}`;
      const server = startApiServer(port);
      childProcess = server.childProcess;
      await waitForHealthcheck(baseUrl, childProcess, server.serverLogs);

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
      assert.equal(loginBody.ok, true);
      const accessToken = loginBody.access_token;

      const deniedListResponse = await fetch(
        `${baseUrl}/api/inventory/item-prices?outlet_id=${deniedOutletId}`,
        {
          headers: {
            authorization: `Bearer ${accessToken}`
          }
        }
      );
      assert.equal(deniedListResponse.status, 403);

      const deniedActiveResponse = await fetch(
        `${baseUrl}/api/inventory/item-prices/active?outlet_id=${deniedOutletId}`,
        {
          headers: {
            authorization: `Bearer ${accessToken}`
          }
        }
      );
      assert.equal(deniedActiveResponse.status, 403);
      const deniedActiveBody = await deniedActiveResponse.json();
      assert.equal(deniedActiveBody.success, false);
      assert.equal(deniedActiveBody.error.code, "FORBIDDEN");

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
      assert.equal(deniedCreateResponse.status, 403);
      const deniedCreateBody = await deniedCreateResponse.json();
      assert.equal(deniedCreateBody.ok, false);
      assert.equal(deniedCreateBody.error.code, "FORBIDDEN");

      const deniedGetByIdResponse = await fetch(`${baseUrl}/api/inventory/item-prices/${deniedPriceId}`, {
        headers: {
          authorization: `Bearer ${accessToken}`
        }
      });
      assert.equal(deniedGetByIdResponse.status, 403);

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
      assert.equal(deniedPatchResponse.status, 403);

      const deniedDeleteResponse = await fetch(`${baseUrl}/api/inventory/item-prices/${deniedPriceId}`, {
        method: "DELETE",
        headers: {
          authorization: `Bearer ${accessToken}`
        }
      });
      assert.equal(deniedDeleteResponse.status, 403);

      const scopedListResponse = await fetch(`${baseUrl}/api/inventory/item-prices`, {
        headers: {
          authorization: `Bearer ${accessToken}`
        }
      });
      assert.equal(scopedListResponse.status, 200);
      const scopedListBody = await scopedListResponse.json();
      assert.equal(scopedListBody.ok, true);
      const deniedPriceVisible = scopedListBody.prices.some(
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
      assert.equal(createItemBody.ok, true);
      duplicateItemId = Number(createItemBody.item.id);

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
      const successfulCreateBody = concurrentBodies.find((body) => body.ok === true);
      const conflictCreateBody = concurrentBodies.find((body) => body.ok === false);

      assert.equal(Boolean(successfulCreateBody), true);
      assert.equal(Boolean(conflictCreateBody), true);
      assert.equal(conflictCreateBody.error.code, "CONFLICT");
      duplicatePriceId = Number(successfulCreateBody.item_price.id);

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
      await stopApiServer(childProcess);

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

      await db.end();
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

    const db = await mysql.createConnection(dbConfigFromEnv());
    let childProcess;
    let deniedOutletId = 0;
    let raceItemId = 0;
    let racePriceId = 0;

    const companyCode = readEnv("JP_COMPANY_CODE", "JP");
    const outletCode = readEnv("JP_OUTLET_CODE", "MAIN");
    const ownerEmail = readEnv("JP_OWNER_EMAIL").toLowerCase();
    const ownerPassword = readEnv("JP_OWNER_PASSWORD");
    const runId = Date.now().toString(36);
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

      const port = await getFreePort();
      const baseUrl = `http://127.0.0.1:${port}`;
      const server = startApiServer(port);
      childProcess = server.childProcess;
      await waitForHealthcheck(baseUrl, childProcess, server.serverLogs);

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
      assert.equal(loginBody.ok, true);
      const accessToken = loginBody.access_token;

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
      assert.equal(patchBody.ok, false);
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
      assert.equal(deleteBody.ok, false);
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
        [companyId, ownerUserId, String(racePriceId)]
      );
      assert.equal(Number(forbiddenAuditRows[0].total), 0);
    } finally {
      await stopApiServer(childProcess);

      if (racePriceId > 0) {
        await db.execute("DELETE FROM item_prices WHERE id = ?", [racePriceId]);
      }

      if (raceItemId > 0) {
        await db.execute("DELETE FROM items WHERE id = ?", [raceItemId]);
      }

      if (deniedOutletId > 0) {
        await db.execute("DELETE FROM outlets WHERE id = ?", [deniedOutletId]);
      }

      await db.end();
    }
  }
);
