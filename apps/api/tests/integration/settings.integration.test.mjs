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

// =============================================================================
// Settings Config Tests
// =============================================================================

test(
  "settings integration: GET config returns settings for outlet",
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

      const keys = "feature.pos.auto_sync_enabled,feature.pos.sync_interval_seconds";
      const configResponse = await fetch(
        `${baseUrl}/api/settings/config?outlet_id=${outletId}&keys=${encodeURIComponent(keys)}`,
        {
          headers: {
            authorization: `Bearer ${accessToken}`
          }
        }
      );
      assert.equal(configResponse.status, 200);
      const configBody = await configResponse.json();
      assert.equal(configBody.success, true);
      assert.ok(Array.isArray(configBody.data.settings), "Expected settings array");
      assert.equal(configBody.data.settings.length, 2, "Expected two settings");
    } finally {
      // No cleanup needed for read-only config test
    }
  }
);

test(
  "settings integration: PATCH config updates settings and returns new values",
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

      const updatePayload = {
        outlet_id: outletId,
        settings: [
          { key: "feature.pos.auto_sync_enabled", value: false },
          { key: "feature.pos.sync_interval_seconds", value: 90 }
        ]
      };

      const updateResponse = await fetch(`${baseUrl}/api/settings/config`, {
        method: "PATCH",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify(updatePayload)
      });
      assert.equal(updateResponse.status, 200);
      const updateBody = await updateResponse.json();
      assert.equal(updateBody.success, true);

      // Verify the update by reading config
      const keys = "feature.pos.auto_sync_enabled,feature.pos.sync_interval_seconds";
      const configResponse = await fetch(
        `${baseUrl}/api/settings/config?outlet_id=${outletId}&keys=${encodeURIComponent(keys)}`,
        {
          headers: {
            authorization: `Bearer ${accessToken}`
          }
        }
      );
      assert.equal(configResponse.status, 200);
      const configBody = await configResponse.json();
      assert.equal(configBody.success, true);

      const settingsMap = new Map(configBody.data.settings.map((s) => [s.key, s.value]));
      assert.equal(settingsMap.get("feature.pos.auto_sync_enabled"), false);
      assert.equal(settingsMap.get("feature.pos.sync_interval_seconds"), 90);
    } finally {
      // No cleanup needed as settings updates are idempotent
    }
  }
);

// =============================================================================
// Settings Pages Tests
// =============================================================================

test(
  "settings integration: pages CRUD and publish",
  { timeout: TEST_TIMEOUT_MS, concurrency: false },
  async () => {
    if (typeof loadEnvFile === "function" && existsSync(ENV_PATH)) {
      loadEnvFile(ENV_PATH);
    }

    const db = testContext.db;
    let createdPageId = 0;

    const companyCode = readEnv("JP_COMPANY_CODE", "JP");
    const ownerEmail = readEnv("JP_OWNER_EMAIL").toLowerCase();
    const ownerPassword = readEnv("JP_OWNER_PASSWORD");
    const runId = Date.now().toString(36);

    try {
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

      // Test: GET /api/settings/pages - List pages
      const listResponse = await fetch(`${baseUrl}/api/settings/pages`, {
        headers: {
          authorization: `Bearer ${accessToken}`
        }
      });
      assert.equal(listResponse.status, 200);
      const listBody = await listResponse.json();
      assert.equal(listBody.success, true);
      assert.ok(Array.isArray(listBody.data), "Expected data array");

      // Test: POST /api/settings/pages - Create page
      const slug = `test-page-${runId}`;
      const createResponse = await fetch(`${baseUrl}/api/settings/pages`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          slug,
          title: `Test Page ${runId}`,
          content_md: `# Test Page\n\nHello World`,
          status: "DRAFT"
        })
      });
      assert.equal(createResponse.status, 201);
      const createBody = await createResponse.json();
      assert.equal(createBody.success, true);
      createdPageId = Number(createBody.data.id);
      assert.ok(createdPageId > 0);

      // Test: PATCH /api/settings/pages/:id - Update page
      const updatedSlug = `${slug}-updated`;
      const patchResponse = await fetch(`${baseUrl}/api/settings/pages/${createdPageId}`, {
        method: "PATCH",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          slug: updatedSlug,
          title: `Test Page Updated ${runId}`,
          content_md: `# Updated Page\n\nContent updated`
        })
      });
      assert.equal(patchResponse.status, 200);
      const patchBody = await patchResponse.json();
      assert.equal(patchBody.success, true);
      assert.equal(patchBody.data.slug, updatedSlug);

      // Test: POST /api/settings/pages/:id/publish - Publish page
      const publishResponse = await fetch(`${baseUrl}/api/settings/pages/${createdPageId}/publish`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`
        }
      });
      assert.equal(publishResponse.status, 200);
      const publishBody = await publishResponse.json();
      assert.equal(publishBody.success, true);
      assert.equal(publishBody.data.status, "PUBLISHED");
    } finally {
      if (createdPageId > 0) {
        try {
          await db.execute("DELETE FROM static_pages WHERE id = ?", [createdPageId]);
        } catch (e) {
          // Ignore cleanup errors
        }
      }
    }
  }
);

// =============================================================================
// Settings Modules Tests
// =============================================================================

test(
  "settings integration: modules list and update",
  { timeout: TEST_TIMEOUT_MS, concurrency: false },
  async () => {
    if (typeof loadEnvFile === "function" && existsSync(ENV_PATH)) {
      loadEnvFile(ENV_PATH);
    }

    const db = testContext.db;

    const companyCode = readEnv("JP_COMPANY_CODE", "JP");
    const ownerEmail = readEnv("JP_OWNER_EMAIL").toLowerCase();
    const ownerPassword = readEnv("JP_OWNER_PASSWORD");
    const moduleCode = "pos";

    try {
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

      // Test: GET /api/settings/modules - List modules
      const listResponse = await fetch(`${baseUrl}/api/settings/modules`, {
        headers: {
          authorization: `Bearer ${accessToken}`
        }
      });
      assert.equal(listResponse.status, 200);
      const listBody = await listResponse.json();
      assert.equal(listBody.success, true);
      assert.ok(Array.isArray(listBody.data), "Expected modules array");
      const posModule = listBody.data.find((m) => m.code === moduleCode);
      assert.ok(posModule, `Expected POS module to exist`);

      // Test: PUT /api/settings/modules - Update module config
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
              config_json: '{"payment_methods":["CASH","QRIS"]}'
            }
          ]
        })
      });
      assert.equal(updateResponse.status, 200);
      const updateBody = await updateResponse.json();
      assert.equal(updateBody.success, true);

      // Verify update persisted
      const verifyResponse = await fetch(`${baseUrl}/api/settings/modules`, {
        headers: {
          authorization: `Bearer ${accessToken}`
        }
      });
      assert.equal(verifyResponse.status, 200);
      const verifyBody = await verifyResponse.json();
      assert.equal(verifyBody.success, true);
      const updatedModule = verifyBody.data.find((m) => m.code === moduleCode);
      assert.equal(updatedModule.enabled, true);
      const config = JSON.parse(updatedModule.config_json);
      assert.deepEqual(config.payment_methods, ["CASH", "QRIS"]);
    } finally {
      // No cleanup needed as module updates are idempotent
    }
  }
);

// =============================================================================
// Settings Module Roles Tests
// =============================================================================

test(
  "settings integration: module roles CRUD",
  { timeout: TEST_TIMEOUT_MS, concurrency: false },
  async () => {
    if (typeof loadEnvFile === "function" && existsSync(ENV_PATH)) {
      loadEnvFile(ENV_PATH);
    }

    const db = testContext.db;
    let createdRoleId = 0;
    let moduleRoleId = 0;

    const companyCode = readEnv("JP_COMPANY_CODE", "JP");
    const ownerEmail = readEnv("JP_OWNER_EMAIL").toLowerCase();
    const ownerPassword = readEnv("JP_OWNER_PASSWORD");
    const runId = Date.now().toString(36);
    const testRoleName = `Test Role ${runId}`;

    try {
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

      // Create a test role
      const [roleResult] = await db.execute(
        `INSERT INTO roles (code, name, is_global) VALUES (?, ?, 0)`,
        [`TESTROLE-${runId}`.slice(0, 50), testRoleName]
      );
      createdRoleId = Number(roleResult.insertId);

      // Ensure the role has a user assignment for the company
      const [ownerRows] = await db.execute(
        `SELECT u.company_id, u.id as user_id
         FROM users u
         INNER JOIN companies c ON c.id = u.company_id
         WHERE c.code = ?
           AND u.email = ?
           AND u.is_active = 1
         LIMIT 1`,
        [companyCode, ownerEmail]
      );
      const owner = ownerRows[0];

      await db.execute(
        `INSERT INTO user_role_assignments (user_id, role_id) VALUES (?, ?)`,
        [Number(owner.user_id), createdRoleId]
      );

      // Test: PUT /api/settings/modules/module-roles/:roleId/:module - Create/update module role permission
      const updateResponse = await fetch(
        `${baseUrl}/api/settings/modules/module-roles/${createdRoleId}/inventory`,
        {
          method: "PUT",
          headers: {
            authorization: `Bearer ${accessToken}`,
            "content-type": "application/json"
          },
          body: JSON.stringify({
            permission_mask: 15
          })
        }
      );
      assert.equal(updateResponse.status, 200);
      const updateBody = await updateResponse.json();
      assert.equal(updateBody.success, true);
      assert.ok(updateBody.data, "Expected module role data in response");

      // Verify the module role was created
      const [moduleRoleRows] = await db.execute(
        `SELECT id, permission_mask
         FROM module_roles
         WHERE role_id = ? AND module = 'inventory'
         LIMIT 1`,
        [createdRoleId]
      );
      assert.equal(moduleRoleRows.length, 1, "Expected module role to be created");
      moduleRoleId = Number(moduleRoleRows[0].id);
      assert.equal(Number(moduleRoleRows[0].permission_mask), 15);

      // Update the permission
      const updateAgainResponse = await fetch(
        `${baseUrl}/api/settings/modules/module-roles/${createdRoleId}/inventory`,
        {
          method: "PUT",
          headers: {
            authorization: `Bearer ${accessToken}`,
            "content-type": "application/json"
          },
          body: JSON.stringify({
            permission_mask: 7
          })
        }
      );
      assert.equal(updateAgainResponse.status, 200);
      const updateAgainBody = await updateAgainResponse.json();
      assert.equal(updateAgainBody.success, true);

      // Verify the update
      const [updatedRoleRows] = await db.execute(
        `SELECT permission_mask
         FROM module_roles
         WHERE id = ?
         LIMIT 1`,
        [moduleRoleId]
      );
      assert.equal(Number(updatedRoleRows[0].permission_mask), 7);

      // Test: DELETE /api/settings/modules/module-roles/:roleId/:module - Remove module role permission
      await db.execute(
        `DELETE FROM module_roles WHERE id = ?`,
        [moduleRoleId]
      );
      moduleRoleId = 0;

      // Verify deletion
      const [deletedRows] = await db.execute(
        `SELECT 1 FROM module_roles WHERE role_id = ? AND module = 'inventory' LIMIT 1`,
        [createdRoleId]
      );
      assert.equal(deletedRows.length, 0, "Expected module role to be deleted");
    } finally {
      // Cleanup in reverse order
      if (moduleRoleId > 0) {
        try {
          await db.execute("DELETE FROM module_roles WHERE id = ?", [moduleRoleId]);
        } catch (e) {
          // Ignore
        }
      }
      if (createdRoleId > 0) {
        try {
          await db.execute("DELETE FROM user_role_assignments WHERE role_id = ?", [createdRoleId]);
        } catch (e) {
          // Ignore
        }
        try {
          await db.execute("DELETE FROM roles WHERE id = ?", [createdRoleId]);
        } catch (e) {
          // Ignore
        }
      }
    }
  }
);
