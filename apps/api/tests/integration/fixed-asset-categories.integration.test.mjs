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
  "fixed asset categories integration: create, update, assign asset",
  { timeout: TEST_TIMEOUT_MS, concurrency: false },
  async () => {
    if (typeof loadEnvFile === "function" && existsSync(ENV_PATH)) {
      loadEnvFile(ENV_PATH);
    }

    const db = await mysql.createConnection(dbConfigFromEnv());
    let childProcess;
    let createdCategoryId = 0;
    let createdAssetId = 0;

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

      const createCategoryResponse = await fetch(`${baseUrl}/api/accounts/fixed-asset-categories`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          code: `FA-${runId}`.toUpperCase(),
          name: `Furniture ${runId}`,
          depreciation_method: "STRAIGHT_LINE",
          useful_life_months: 60,
          residual_value_pct: 5,
          is_active: true
        })
      });
      assert.equal(createCategoryResponse.status, 201);
      const createCategoryBody = await createCategoryResponse.json();
      assert.equal(createCategoryBody.ok, true);
      createdCategoryId = Number(createCategoryBody.category.id);

      const listCategoryResponse = await fetch(`${baseUrl}/api/accounts/fixed-asset-categories`, {
        headers: {
          authorization: `Bearer ${accessToken}`
        }
      });
      assert.equal(listCategoryResponse.status, 200);
      const listCategoryBody = await listCategoryResponse.json();
      assert.equal(listCategoryBody.ok, true);
      const listedCategory = listCategoryBody.categories.find(
        (category) => Number(category.id) === createdCategoryId
      );
      assert.equal(Boolean(listedCategory), true);
      assert.equal(listedCategory.name, `Furniture ${runId}`);

      const patchCategoryResponse = await fetch(
        `${baseUrl}/api/accounts/fixed-asset-categories/${createdCategoryId}`,
        {
          method: "PATCH",
          headers: {
            authorization: `Bearer ${accessToken}`,
            "content-type": "application/json"
          },
          body: JSON.stringify({
            name: `Furniture Updated ${runId}`,
            useful_life_months: 72,
            residual_value_pct: 10
          })
        }
      );
      assert.equal(patchCategoryResponse.status, 200);
      const patchCategoryBody = await patchCategoryResponse.json();
      assert.equal(patchCategoryBody.ok, true);
      assert.equal(patchCategoryBody.category.name, `Furniture Updated ${runId}`);

      const createAssetResponse = await fetch(`${baseUrl}/api/accounts/fixed-assets`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          name: `Espresso Machine ${runId}`,
          category_id: createdCategoryId,
          outlet_id: outletId,
          purchase_cost: 45000000,
          is_active: true
        })
      });
      assert.equal(createAssetResponse.status, 201);
      const createAssetBody = await createAssetResponse.json();
      assert.equal(createAssetBody.ok, true);
      createdAssetId = Number(createAssetBody.asset.id);
      assert.equal(Number(createAssetBody.asset.category_id), createdCategoryId);

      const listAssetsResponse = await fetch(`${baseUrl}/api/accounts/fixed-assets`, {
        headers: {
          authorization: `Bearer ${accessToken}`
        }
      });
      assert.equal(listAssetsResponse.status, 200);
      const listAssetsBody = await listAssetsResponse.json();
      assert.equal(listAssetsBody.ok, true);
      const listedAsset = listAssetsBody.assets.find((asset) => Number(asset.id) === createdAssetId);
      assert.equal(Boolean(listedAsset), true);
      assert.equal(Number(listedAsset.category_id), createdCategoryId);

      const deleteAssetResponse = await fetch(`${baseUrl}/api/accounts/fixed-assets/${createdAssetId}`, {
        method: "DELETE",
        headers: {
          authorization: `Bearer ${accessToken}`
        }
      });
      assert.equal(deleteAssetResponse.status, 200);

      const deleteCategoryResponse = await fetch(
        `${baseUrl}/api/accounts/fixed-asset-categories/${createdCategoryId}`,
        {
          method: "DELETE",
          headers: {
            authorization: `Bearer ${accessToken}`
          }
        }
      );
      assert.equal(deleteCategoryResponse.status, 200);
    } finally {
      await stopApiServer(childProcess);

      if (createdAssetId > 0) {
        await db.execute("DELETE FROM fixed_assets WHERE id = ?", [createdAssetId]);
      }

      if (createdCategoryId > 0) {
        await db.execute("DELETE FROM fixed_asset_categories WHERE id = ?", [createdCategoryId]);
      }

      await db.end();
    }
  }
);
