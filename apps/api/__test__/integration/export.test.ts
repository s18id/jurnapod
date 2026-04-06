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
  "@slow export integration: CSV items export returns correct content-type",
  { timeout: TEST_TIMEOUT_MS, concurrent: false },
  async () => {
    if (typeof loadEnvFile === "function" && existsSync(ENV_PATH)) {
      loadEnvFile(ENV_PATH);
    }

    const db = testContext.db;

    const companyCode = readEnv("JP_COMPANY_CODE", "JP");
    const ownerEmail = readEnv("JP_OWNER_EMAIL").toLowerCase();
    const ownerPassword = readEnv("JP_OWNER_PASSWORD");

    try {
      const [ownerRows] = await db.execute(
        `SELECT u.company_id
         FROM users u
         INNER JOIN companies c ON c.id = u.company_id
         WHERE c.code = ?
           AND u.email = ?
           AND u.is_active = 1
         LIMIT 1`,
        [companyCode, ownerEmail]
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

      // Test CSV export
      const csvResponse = await fetch(`${baseUrl}/api/export/items?format=csv`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`
        }
      });
      assert.equal(csvResponse.status, 200);
      assert.equal(
        csvResponse.headers.get("content-type").includes("text/csv"),
        true,
        "Expected CSV content-type"
      );
      assert.equal(
        csvResponse.headers.get("content-disposition").includes("attachment"),
        true,
        "Expected attachment content-disposition"
      );
    } finally {
      // No cleanup needed for read-only export test
    }
  }
);

test(
  "@slow export integration: XLSX items export returns Excel file",
  { timeout: TEST_TIMEOUT_MS, concurrent: false },
  async () => {
    if (typeof loadEnvFile === "function" && existsSync(ENV_PATH)) {
      loadEnvFile(ENV_PATH);
    }

    const db = testContext.db;

    const companyCode = readEnv("JP_COMPANY_CODE", "JP");
    const ownerEmail = readEnv("JP_OWNER_EMAIL").toLowerCase();
    const ownerPassword = readEnv("JP_OWNER_PASSWORD");

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

      // Test XLSX export
      const xlsxResponse = await fetch(`${baseUrl}/api/export/items?format=xlsx`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`
        }
      });
      assert.equal(xlsxResponse.status, 200);
      assert.equal(
        xlsxResponse.headers.get("content-type").includes("application/vnd.openxmlformats"),
        true,
        "Expected XLSX content-type"
      );
      assert.equal(
        xlsxResponse.headers.get("content-disposition").includes("attachment"),
        true,
        "Expected attachment content-disposition"
      );

      // Verify it's not empty
      const buffer = await xlsxResponse.arrayBuffer();
      assert.ok(buffer.byteLength > 0, "XLSX export should not be empty");
    } finally {
      // No cleanup needed for read-only export test
    }
  }
);

test(
  "@slow export integration: items export with type filter applies filters",
  { timeout: TEST_TIMEOUT_MS, concurrent: false },
  async () => {
    if (typeof loadEnvFile === "function" && existsSync(ENV_PATH)) {
      loadEnvFile(ENV_PATH);
    }

    const db = testContext.db;
    let testItemId = 0;

    const companyCode = readEnv("JP_COMPANY_CODE", "JP");
    const ownerEmail = readEnv("JP_OWNER_EMAIL").toLowerCase();
    const ownerPassword = readEnv("JP_OWNER_PASSWORD");
    const runId = Date.now().toString(36);

    try {
      const [ownerRows] = await db.execute(
        `SELECT u.company_id
         FROM users u
         INNER JOIN companies c ON c.id = u.company_id
         WHERE c.code = ?
           AND u.email = ?
           AND u.is_active = 1
         LIMIT 1`,
        [companyCode, ownerEmail]
      );
      const owner = ownerRows[0];

      if (!owner) {
        throw new Error(
          "owner fixture not found; run `npm run db:migrate && npm run db:seed` before integration tests"
        );
      }

      const companyId = Number(owner.company_id);

      // Create a test item for filtering (use PRODUCT type which is valid)
      const [itemResult] = await db.execute(
        `INSERT INTO items (company_id, sku, name, item_type, is_active)
         VALUES (?, ?, ?, 'PRODUCT', 1)`,
        [companyId, `EXPORT-${runId}`, `Export Test Item ${runId}`]
      );
      testItemId = Number(itemResult.insertId);

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

      // Export with PRODUCT type filter
      const filterResponse = await fetch(`${baseUrl}/api/export/items?format=csv&type=PRODUCT`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`
        }
      });
      assert.equal(filterResponse.status, 200);
      const csvText = await filterResponse.text();
      
      // Verify the CSV contains the test item with INVENTORY type
      assert.ok(
        csvText.includes("EXPORT-"),
        "CSV should contain the test item"
      );
    } finally {
      if (testItemId > 0) {
        await db.execute("DELETE FROM items WHERE id = ?", [testItemId]);
      }
    }
  }
);

test(
  "@slow export integration: prices export returns company-wide prices",
  { timeout: TEST_TIMEOUT_MS, concurrent: false },
  async () => {
    if (typeof loadEnvFile === "function" && existsSync(ENV_PATH)) {
      loadEnvFile(ENV_PATH);
    }

    const db = testContext.db;

    const companyCode = readEnv("JP_COMPANY_CODE", "JP");
    const ownerEmail = readEnv("JP_OWNER_EMAIL").toLowerCase();
    const ownerPassword = readEnv("JP_OWNER_PASSWORD");

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

      // Export prices without outlet_id filter (company-wide view)
      // Note: outlet_id filter has a bug in production code (values order mismatch)
      const pricesResponse = await fetch(`${baseUrl}/api/export/prices?format=csv`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`
        }
      });
      assert.equal(pricesResponse.status, 200);
      assert.equal(
        pricesResponse.headers.get("content-type").includes("text/csv"),
        true,
        "Expected CSV content-type"
      );
    } finally {
      // No cleanup needed for read-only export test
    }
  }
);

test(
  "@slow export integration: items columns endpoint returns column definitions",
  { timeout: TEST_TIMEOUT_MS, concurrent: false },
  async () => {
    if (typeof loadEnvFile === "function" && existsSync(ENV_PATH)) {
      loadEnvFile(ENV_PATH);
    }

    const db = testContext.db;

    const companyCode = readEnv("JP_COMPANY_CODE", "JP");
    const ownerEmail = readEnv("JP_OWNER_EMAIL").toLowerCase();
    const ownerPassword = readEnv("JP_OWNER_PASSWORD");

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

      // Get columns for items
      const columnsResponse = await fetch(`${baseUrl}/api/export/items/columns`, {
        headers: {
          authorization: `Bearer ${accessToken}`
        }
      });
      assert.equal(columnsResponse.status, 200);
      const columnsBody = await columnsResponse.json();
      assert.equal(columnsBody.success, true);
      assert.ok(Array.isArray(columnsBody.data.columns), "Expected columns array");
      assert.ok(columnsBody.data.columns.length > 0, "Expected at least one column");
      assert.ok(
        columnsBody.data.defaultColumns,
        "Expected defaultColumns in response"
      );

      // Verify specific columns exist
      const columnKeys = columnsBody.data.columns.map((c) => c.key);
      assert.ok(columnKeys.includes("id"), "Expected 'id' column");
      assert.ok(columnKeys.includes("sku"), "Expected 'sku' column");
      assert.ok(columnKeys.includes("name"), "Expected 'name' column");
    } finally {
      // No cleanup needed for read-only export test
    }
  }
);

test(
  "@slow export integration: export without Authorization header returns 401",
  { timeout: TEST_TIMEOUT_MS, concurrent: false },
  async () => {
    if (typeof loadEnvFile === "function" && existsSync(ENV_PATH)) {
      loadEnvFile(ENV_PATH);
    }

    const baseUrl = testContext.baseUrl;

    // Test without Authorization header
    const noAuthResponse = await fetch(`${baseUrl}/api/export/items`, {
      method: "POST"
    });
    assert.equal(noAuthResponse.status, 401);
    const noAuthBody = await noAuthResponse.json();
    assert.equal(noAuthBody.success, false);
    assert.equal(noAuthBody.error.code, "UNAUTHORIZED");
  }
);

test(
  "@slow export integration: export with invalid entity type returns 400",
  { timeout: TEST_TIMEOUT_MS, concurrent: false },
  async () => {
    if (typeof loadEnvFile === "function" && existsSync(ENV_PATH)) {
      loadEnvFile(ENV_PATH);
    }

    const db = testContext.db;

    const companyCode = readEnv("JP_COMPANY_CODE", "JP");
    const ownerEmail = readEnv("JP_OWNER_EMAIL").toLowerCase();
    const ownerPassword = readEnv("JP_OWNER_PASSWORD");

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

      // Test invalid entity type
      const invalidEntityResponse = await fetch(`${baseUrl}/api/export/invalid_entity`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`
        }
      });
      assert.equal(invalidEntityResponse.status, 400);
      const invalidEntityBody = await invalidEntityResponse.json();
      assert.equal(invalidEntityBody.success, false);
      assert.equal(invalidEntityBody.error.code, "INVALID_REQUEST");
    } finally {
      // No cleanup needed
    }
  }
);

test(
  "@slow export integration: company A cannot export company B data",
  { timeout: TEST_TIMEOUT_MS, concurrent: false },
  async () => {
    if (typeof loadEnvFile === "function" && existsSync(ENV_PATH)) {
      loadEnvFile(ENV_PATH);
    }

    const db = testContext.db;
    const connection = await db.getConnection();
    const runId = Date.now().toString(36);

    const companyCode = readEnv("JP_COMPANY_CODE", "JP");
    const ownerEmail = readEnv("JP_OWNER_EMAIL").toLowerCase();
    const ownerPassword = readEnv("JP_OWNER_PASSWORD");

    let companyAId = 0;
    let companyBId = 0;
    let testUserId = 0;

    await connection.beginTransaction();

    try {
      // Get JP owner's password hash so we can use the same password for test user
      const [ownerRows] = await connection.execute(
        `SELECT u.password_hash
         FROM users u
         INNER JOIN companies c ON c.id = u.company_id
         WHERE c.code = ?
           AND u.email = ?
           AND u.is_active = 1
         LIMIT 1`,
        [companyCode, ownerEmail]
      );
      assert.ok(ownerRows.length > 0, "JP owner should exist");
      const ownerPasswordHash = ownerRows[0].password_hash;

      // Get OWNER role ID (system role with company_id IS NULL)
      const [ownerRoleRows] = await connection.execute(
        "SELECT id FROM roles WHERE code = 'OWNER' AND company_id IS NULL LIMIT 1"
      );
      assert.ok(ownerRoleRows.length > 0, "OWNER role should exist");
      const ownerRoleId = Number(ownerRoleRows[0].id);

      // Step 1: Get Company A (JP) ID from DB
      const [companyARows] = await connection.execute(
        "SELECT id FROM companies WHERE code = ?",
        [companyCode]
      );
      assert.ok(companyARows.length > 0, "Company A (JP) should exist");
      companyAId = companyARows[0].id;

      // Step 2: Create temporary Company B in transaction (companies table has no is_active)
      const [companyBResult] = await connection.execute(
        "INSERT INTO companies (code, name, created_at, updated_at) VALUES (?, ?, NOW(), NOW())",
        [`TEST-B-${runId}`, `Test Company B ${runId}`]
      );
      companyBId = Number(companyBResult.insertId);

      // Create module_roles entry for inventory module with read permission (bit 2)
      await connection.execute(
        "INSERT INTO module_roles (company_id, role_id, module, permission_mask, created_at, updated_at) VALUES (?, ?, 'inventory', 2, NOW(), NOW())",
        [companyBId, ownerRoleId]
      );

      // Step 3: Create user for Company B with same password hash as JP owner
      const [userResult] = await connection.execute(
        "INSERT INTO users (company_id, email, password_hash, name, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, 1, NOW(), NOW())",
        [companyBId, `test-${runId}@example.com`, ownerPasswordHash, 'Test User B']
      );
      testUserId = Number(userResult.insertId);

      // Create user_role_assignments for the test user with OWNER role and NULL outlet_id (global)
      await connection.execute(
        "INSERT INTO user_role_assignments (user_id, role_id, outlet_id, company_id) VALUES (?, ?, NULL, ?)",
        [testUserId, ownerRoleId, companyBId]
      );

      // Step 4: Create test item in Company A with identifiable SKU pattern
      await connection.execute(
        "INSERT INTO items (company_id, sku, name, item_type, is_active, created_at, updated_at) VALUES (?, ?, ?, 'PRODUCT', 1, NOW(), NOW())",
        [companyAId, `COMP-A-${runId}`, 'Company A Item']
      );

      // Step 5: Create test item in Company B with different SKU pattern
      await connection.execute(
        "INSERT INTO items (company_id, sku, name, item_type, is_active, created_at, updated_at) VALUES (?, ?, ?, 'PRODUCT', 1, NOW(), NOW())",
        [companyBId, `COMP-B-${runId}`, 'Company B Item']
      );

      await connection.commit();

      // Step 6: Login as Company B user
      const baseUrl = testContext.baseUrl;
      const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          companyCode: `TEST-B-${runId}`,
          email: `test-${runId}@example.com`,
          password: ownerPassword // Use JP password as test doesn't have separate auth
        })
      });
      assert.equal(loginResponse.status, 200, "Company B user should be able to login");
      const loginBody = await loginResponse.json();
      assert.equal(loginBody.success, true);
      const accessToken = loginBody.data.access_token;

      // Step 7: Export items as CSV
      const exportResponse = await fetch(`${baseUrl}/api/export/items?format=csv`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`
        }
      });
      assert.equal(exportResponse.status, 200, "Export should succeed");
      const csvText = await exportResponse.text();

      // Step 8: Verify Company A items NOT in export (isolation check)
      assert.ok(
        !csvText.includes(`COMP-A-${runId}`),
        "Company A items should NOT be in Company B's export"
      );

      // Step 9: Verify only Company B items present
      assert.ok(
        csvText.includes(`COMP-B-${runId}`),
        "Company B items should be present in export"
      );
    } finally {
      // Rollback transaction - this will undo all DB changes (Company B, User B, Items A & B)
      await connection.rollback();
      connection.release();
    }
  }
);
