// @ts-nocheck
// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import path from "node:path";
import { test, describe, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";
import { setupIntegrationTests } from "../../tests/integration/integration-harness.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const apiRoot = path.resolve(__dirname, "../..");
const repoRoot = path.resolve(apiRoot, "../..");
const serverScriptPath = path.resolve(apiRoot, "src/server.ts");
const loadEnvFile = process.loadEnvFile;
const ENV_PATH = path.resolve(repoRoot, ".env");
const TEST_TIMEOUT_MS = 180000;

const testContext = setupIntegrationTests();

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
      try {
        childProcess.kill("SIGKILL");
      } catch {
        // ignore forced kill errors
      }
    }, 8000);

    childProcess.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });

    try {
      childProcess.kill("SIGTERM");
    } catch {
      clearTimeout(timeout);
      resolve();
    }
  });

  try {
    childProcess.stdout?.destroy();
  } catch {
    // ignore
  }
  try {
    childProcess.stderr?.destroy();
  } catch {
    // ignore
  }
}

test(
  "@slow fixed asset categories integration: create, update, assign asset",
  { timeout: TEST_TIMEOUT_MS, concurrent: false },
  async () => {
    if (typeof loadEnvFile === "function" && existsSync(ENV_PATH)) {
      loadEnvFile(ENV_PATH);
    }

    const db = testContext.db;
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
      assert.equal(createCategoryBody.success, true);
      createdCategoryId = Number(createCategoryBody.data.id);

      const listCategoryResponse = await fetch(`${baseUrl}/api/accounts/fixed-asset-categories`, {
        headers: {
          authorization: `Bearer ${accessToken}`
        }
      });
      assert.equal(listCategoryResponse.status, 200);
      const listCategoryBody = await listCategoryResponse.json();
      assert.equal(listCategoryBody.success, true);
      const listedCategory = listCategoryBody.data.find(
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
      assert.equal(patchCategoryBody.success, true);
      assert.equal(patchCategoryBody.data.name, `Furniture Updated ${runId}`);

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
      assert.equal(createAssetBody.success, true);
      createdAssetId = Number(createAssetBody.data.id);
      assert.equal(Number(createAssetBody.data.category_id), createdCategoryId);

      const listAssetsResponse = await fetch(`${baseUrl}/api/accounts/fixed-assets`, {
        headers: {
          authorization: `Bearer ${accessToken}`
        }
      });
      assert.equal(listAssetsResponse.status, 200);
      const listAssetsBody = await listAssetsResponse.json();
      assert.equal(listAssetsBody.success, true);
      const listedAsset = listAssetsBody.data.find((asset) => Number(asset.id) === createdAssetId);
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
      if (createdAssetId > 0) {
        await db.execute("DELETE FROM fixed_assets WHERE id = ?", [createdAssetId]);
      }

      if (createdCategoryId > 0) {
        await db.execute("DELETE FROM fixed_asset_categories WHERE id = ?", [createdCategoryId]);
      }

    }
  }
);

test(
  "@slow fixed asset: PATCH preserves omitted fields",
  { timeout: TEST_TIMEOUT_MS, concurrent: false },
  async () => {
    if (typeof loadEnvFile === "function" && existsSync(ENV_PATH)) {
      loadEnvFile(ENV_PATH);
    }

    const db = testContext.db;
    let createdAssetId = 0;
    let createdCategoryId = 0;

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
        throw new Error("owner fixture not found");
      }

      const companyId = Number(owner.company_id);
      const outletId = Number(owner.outlet_id);
      const baseUrl = testContext.baseUrl;

      const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ companyCode, email: ownerEmail, password: ownerPassword })
      });
      assert.equal(loginResponse.status, 200);
      const { access_token: accessToken } = (await loginResponse.json()).data;

      const [categoryResult] = await db.execute(
        `INSERT INTO fixed_asset_categories (company_id, code, name, depreciation_method, useful_life_months, residual_value_pct, is_active)
         VALUES (?, ?, ?, 'STRAIGHT_LINE', 60, 5, 1)`,
        [companyId, `CAT-${runId}`, `Test Category ${runId}`]
      );
      createdCategoryId = Number(categoryResult.insertId);

      const [assetResult] = await db.execute(
        `INSERT INTO fixed_assets (company_id, outlet_id, category_id, asset_tag, name, serial_number, purchase_date, purchase_cost, is_active)
         VALUES (?, ?, ?, ?, ?, ?, '2025-01-15', 10000000, 1)`,
        [companyId, outletId, createdCategoryId, `TAG-${runId}`, `Asset ${runId}`, `SN-${runId}`]
      );
      createdAssetId = Number(assetResult.insertId);

      const getBeforeResponse = await fetch(`${baseUrl}/api/accounts/fixed-assets/${createdAssetId}`, {
        headers: { authorization: `Bearer ${accessToken}` }
      });
      const assetBefore = (await getBeforeResponse.json()).data;
      assert.equal(assetBefore.name, `Asset ${runId}`);
      assert.equal(assetBefore.outlet_id, outletId);
      assert.equal(assetBefore.category_id, createdCategoryId);

      const patchResponse = await fetch(`${baseUrl}/api/accounts/fixed-assets/${createdAssetId}`, {
        method: "PATCH",
        headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
        body: JSON.stringify({ name: `Asset Updated ${runId}` })
      });
      assert.equal(patchResponse.status, 200);

      const getAfterResponse = await fetch(`${baseUrl}/api/accounts/fixed-assets/${createdAssetId}`, {
        headers: { authorization: `Bearer ${accessToken}` }
      });
      const assetAfter = (await getAfterResponse.json()).data;

      assert.equal(assetAfter.name, `Asset Updated ${runId}`);
      assert.equal(assetAfter.outlet_id, outletId, "outlet_id should be preserved");
      assert.equal(assetAfter.category_id, createdCategoryId, "category_id should be preserved");
      assert.equal(assetAfter.asset_tag, `TAG-${runId}`, "asset_tag should be preserved");
      assert.equal(assetAfter.serial_number, `SN-${runId}`, "serial_number should be preserved");
    } finally {
      if (createdAssetId > 0) {
        await db.execute("DELETE FROM fixed_assets WHERE id = ?", [createdAssetId]);
      }
      if (createdCategoryId > 0) {
        await db.execute("DELETE FROM fixed_asset_categories WHERE id = ?", [createdCategoryId]);
      }
    }
  }
);

test(
  "@slow fixed asset: depreciation plan rejects cross-company accounts",
  { timeout: TEST_TIMEOUT_MS, concurrent: false },
  async () => {
    if (typeof loadEnvFile === "function" && existsSync(ENV_PATH)) {
      loadEnvFile(ENV_PATH);
    }

    const db = testContext.db;
    let createdAssetId = 0;
    let createdCategoryId = 0;
    let foreignAccountId = 0;
    let foreignCompanyId = 0;
    let sameCompanyExpenseAccountId = 0;
    let sameCompanyAccumAccountId = 0;

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
        throw new Error("owner fixture not found");
      }

      const companyId = Number(owner.company_id);
      const outletId = Number(owner.outlet_id);
      const baseUrl = testContext.baseUrl;

      const foreignCompanyCode = `TESTCO-${runId}`.slice(0, 20).toUpperCase();
      const [companyResult] = await db.execute(
        `INSERT INTO companies (code, name) VALUES (?, ?)`,
        [foreignCompanyCode, `Test Company ${runId}`]
      );
      foreignCompanyId = Number(companyResult.insertId);

      const [accountResult] = await db.execute(
        `INSERT INTO accounts (company_id, code, name)
         VALUES (?, ?, ?)`,
        [foreignCompanyId, `EXP-${runId}`, `Foreign Expense Account ${runId}`]
      );
      foreignAccountId = Number(accountResult.insertId);

      const [sameCompanyExpenseResult] = await db.execute(
        `INSERT INTO accounts (company_id, code, name)
         VALUES (?, ?, ?)`,
        [companyId, `DEP-EXP-${runId}`, `Depreciation Expense ${runId}`]
      );
      sameCompanyExpenseAccountId = Number(sameCompanyExpenseResult.insertId);

      const [sameCompanyAccumResult] = await db.execute(
        `INSERT INTO accounts (company_id, code, name)
         VALUES (?, ?, ?)`,
        [companyId, `DEP-ACC-${runId}`, `Accumulated Depreciation ${runId}`]
      );
      sameCompanyAccumAccountId = Number(sameCompanyAccumResult.insertId);

      const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ companyCode, email: ownerEmail, password: ownerPassword })
      });
      assert.equal(loginResponse.status, 200);
      const { access_token: accessToken } = (await loginResponse.json()).data;

      const [categoryResult] = await db.execute(
        `INSERT INTO fixed_asset_categories (company_id, code, name, depreciation_method, useful_life_months, residual_value_pct, is_active)
         VALUES (?, ?, ?, 'STRAIGHT_LINE', 60, 5, 1)`,
        [companyId, `CAT-${runId}`, `Test Category ${runId}`]
      );
      createdCategoryId = Number(categoryResult.insertId);

      const [assetResult] = await db.execute(
        `INSERT INTO fixed_assets (company_id, outlet_id, category_id, name, purchase_cost, is_active)
         VALUES (?, ?, ?, ?, 10000000, 1)`,
        [companyId, outletId, createdCategoryId, `Asset ${runId}`]
      );
      createdAssetId = Number(assetResult.insertId);

      const createPlanResponse = await fetch(`${baseUrl}/api/accounts/fixed-assets/${createdAssetId}/depreciation-plan`, {
        method: "POST",
        headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
        body: JSON.stringify({
          asset_id: createdAssetId,
          expense_account_id: foreignAccountId,
          accum_depr_account_id: sameCompanyAccumAccountId,
          useful_life_months: 60,
          salvage_value: 0
        })
      });
      assert.equal(createPlanResponse.status, 400);
      const createPlanBody = await createPlanResponse.json();
      assert.equal(createPlanBody.success, false);
      assert.equal(createPlanBody.error.code, "INVALID_REFERENCE");
    } finally {
      if (createdAssetId > 0) {
        await db.execute("DELETE FROM asset_depreciation_plans WHERE asset_id = ?", [createdAssetId]);
        await db.execute("DELETE FROM fixed_assets WHERE id = ?", [createdAssetId]);
      }
      if (createdCategoryId > 0) {
        await db.execute("DELETE FROM fixed_asset_categories WHERE id = ?", [createdCategoryId]);
      }
      if (sameCompanyExpenseAccountId > 0) {
        await db.execute("DELETE FROM accounts WHERE id = ?", [sameCompanyExpenseAccountId]);
      }
      if (sameCompanyAccumAccountId > 0) {
        await db.execute("DELETE FROM accounts WHERE id = ?", [sameCompanyAccumAccountId]);
      }
      if (foreignAccountId > 0) {
        await db.execute("DELETE FROM accounts WHERE id = ?", [foreignAccountId]);
      }
      if (foreignCompanyId > 0) {
        await db.execute("DELETE FROM companies WHERE id = ?", [foreignCompanyId]);
      }
    }
  }
);

test(
  "@slow fixed asset: outlet-scoped user cannot read other outlet assets",
  { timeout: TEST_TIMEOUT_MS, concurrent: false },
  async () => {
    if (typeof loadEnvFile === "function" && existsSync(ENV_PATH)) {
      loadEnvFile(ENV_PATH);
    }

    const db = testContext.db;
    let createdAssetId = 0;
    let deniedOutletId = 0;
    let restrictedUserId = 0;
    let unassignedAssetId = 0;
    let previousAccountsPermissionMask = null;
    let hadExistingAccountsModuleRole = false;
    let adminRoleId = null;
    let companyId = null;

    const companyCode = readEnv("JP_COMPANY_CODE", "JP");
    const outletCode = readEnv("JP_OUTLET_CODE", "MAIN");
    const ownerEmail = readEnv("JP_OWNER_EMAIL").toLowerCase();
    const ownerPassword = readEnv("JP_OWNER_PASSWORD");
    const runId = Date.now().toString(36);
    const restrictedEmail = `restricted-${runId}@example.com`;

    try {
      const [ownerRows] = await db.execute(
        `SELECT u.id, u.company_id, o.id AS outlet_id
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
        throw new Error("owner fixture not found");
      }

      companyId = Number(owner.company_id);
      const allowedOutletId = Number(owner.outlet_id);
      const baseUrl = testContext.baseUrl;

      const [deniedOutletResult] = await db.execute(
        `INSERT INTO outlets (company_id, code, name) VALUES (?, ?, ?)`,
        [companyId, `DENY${runId}`.slice(0, 10).toUpperCase(), `Denied Outlet ${runId}`]
      );
      deniedOutletId = Number(deniedOutletResult.insertId);

      const [assetResult] = await db.execute(
        `INSERT INTO fixed_assets (company_id, outlet_id, name, purchase_cost, is_active)
         VALUES (?, ?, ?, 10000000, 1)`,
        [companyId, deniedOutletId, `Denied Asset ${runId}`]
      );
      createdAssetId = Number(assetResult.insertId);

      const [unassignedAssetResult] = await db.execute(
        `INSERT INTO fixed_assets (company_id, outlet_id, name, purchase_cost, is_active)
         VALUES (?, NULL, ?, 5000000, 1)`,
        [companyId, `Unassigned Asset ${runId}`]
      );
      unassignedAssetId = Number(unassignedAssetResult.insertId);

      const [ownerPasswordRows] = await db.execute(
        `SELECT password_hash FROM users WHERE id = ? LIMIT 1`,
        [Number(owner.id)]
      );
      const passwordHash = ownerPasswordRows[0]?.password_hash;
      if (!passwordHash) {
        throw new Error("owner password hash not found");
      }

      const [adminRoleRows] = await db.execute(
        `SELECT id FROM roles WHERE code = 'ADMIN' LIMIT 1`
      );
      adminRoleId = adminRoleRows[0]?.id;
      if (!adminRoleId) {
        throw new Error("ADMIN role not found");
      }

      const [userInsert] = await db.execute(
        `INSERT INTO users (company_id, email, password_hash, is_active)
         VALUES (?, ?, ?, 1)`,
        [companyId, restrictedEmail, passwordHash]
      );
      restrictedUserId = Number(userInsert.insertId);

      await db.execute(
        `INSERT INTO user_role_assignments (user_id, outlet_id, role_id)
         VALUES (?, ?, ?)`,
        [restrictedUserId, allowedOutletId, Number(adminRoleId)]
      );

      const [existingModuleRoleRows] = await db.execute(
        `SELECT permission_mask
         FROM module_roles
         WHERE company_id = ?
           AND role_id = ?
           AND module = 'accounts'
         LIMIT 1`,
        [companyId, Number(adminRoleId)]
      );

      if (existingModuleRoleRows[0]) {
        hadExistingAccountsModuleRole = true;
        previousAccountsPermissionMask = Number(existingModuleRoleRows[0].permission_mask);
      }

      await db.execute(
        `INSERT INTO module_roles (company_id, role_id, module, permission_mask)
         VALUES (?, ?, 'accounts', 15)
         ON DUPLICATE KEY UPDATE permission_mask = 15`,
        [companyId, Number(adminRoleId)]
      );

      const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ companyCode, email: restrictedEmail, password: ownerPassword })
      });
      assert.equal(loginResponse.status, 200);
      const { access_token: accessToken } = (await loginResponse.json()).data;

      const listResponse = await fetch(`${baseUrl}/api/accounts/fixed-assets`, {
        headers: { authorization: `Bearer ${accessToken}` }
      });
      assert.equal(listResponse.status, 200);
      const listBody = await listResponse.json();
      const assetInList = listBody.data.find((a) => Number(a.id) === createdAssetId);
      assert.equal(assetInList, undefined, "asset from denied outlet should not appear in list");

      const unassignedAssetInList = listBody.data.find((a) => Number(a.id) === unassignedAssetId);
      assert.equal(Boolean(unassignedAssetInList), true, "unassigned asset should be visible to outlet-scoped user");

      const getResponse = await fetch(`${baseUrl}/api/accounts/fixed-assets/${createdAssetId}`, {
        headers: { authorization: `Bearer ${accessToken}` }
      });
      assert.equal(getResponse.status, 404, "asset from denied outlet should return 404");
    } finally {
      if (createdAssetId > 0) {
        await db.execute("DELETE FROM fixed_assets WHERE id = ?", [createdAssetId]);
      }
      if (unassignedAssetId > 0) {
        await db.execute("DELETE FROM fixed_assets WHERE id = ?", [unassignedAssetId]);
      }
      if (deniedOutletId > 0) {
        await db.execute("DELETE FROM outlets WHERE id = ?", [deniedOutletId]);
      }
      if (companyId !== null && adminRoleId && hadExistingAccountsModuleRole && previousAccountsPermissionMask !== null) {
        await db.execute(
          `UPDATE module_roles
           SET permission_mask = ?
           WHERE company_id = ?
             AND role_id = ?
             AND module = 'accounts'`,
          [previousAccountsPermissionMask, companyId, Number(adminRoleId)]
        );
      } else if (companyId !== null && adminRoleId) {
        await db.execute(
          `DELETE FROM module_roles
           WHERE company_id = ?
             AND role_id = ?
             AND module = 'accounts'`,
          [companyId, Number(adminRoleId)]
        );
      }
      if (restrictedUserId > 0) {
        await db.execute("DELETE FROM user_role_assignments WHERE user_id = ?", [restrictedUserId]);
        await db.execute("DELETE FROM users WHERE id = ?", [restrictedUserId]);
      }
    }
  }
);
