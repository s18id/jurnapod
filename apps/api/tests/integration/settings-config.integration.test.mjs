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
  "settings config integration: per-outlet inventory settings",
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

      await db.execute(
        `DELETE FROM company_settings WHERE company_id = ? AND outlet_id = ?`,
        [companyId, outletId]
      );

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
      assert.equal(initialBody.ok, true);
      assert.equal(initialBody.settings.length, keys.length);

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
      assert.equal(updateBody.ok, true);

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
      assert.equal(updatedBody.ok, true);

      const updatedMap = new Map(updatedBody.settings.map((setting) => [setting.key, setting.value]));
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
      await db.end();
      await stopApiServer(childProcess);
    }
  }
);
