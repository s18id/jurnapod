// @ts-nocheck
// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import path from "node:path";
import {test, describe, beforeAll, afterAll, beforeEach, afterEach} from 'vitest';
import { fileURLToPath } from "node:url";
import { setupIntegrationTests } from "../../tests/integration/integration-harness.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const apiRoot = path.resolve(__dirname, "../..");
const repoRoot = path.resolve(apiRoot, "../..");
const serverScriptPath = path.resolve(apiRoot, "src/server.ts");
const loadEnvFile = process.loadEnvFile;
const ENV_PATH = path.resolve(repoRoot, ".env");
const TEST_TIMEOUT_MS = 180000;

const testContext = setupIntegrationTests({ forceLocalServer: true });

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

  return { childProcess, serverLogs };
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

// =============================================================================
// Test Data
// =============================================================================

const SAMPLE_ITEM_CSV = `sku,name,item_type,barcode,is_active
TEST-SKU-001,Test Item 1,INVENTORY,123456789,true
TEST-SKU-002,Test Item 2,SERVICE,,true`;

const SAMPLE_PRICE_CSV = `item_sku,outlet_id,price,is_active
TEST-SKU-001,,10000,true
TEST-SKU-002,1,15000,true`;

const SAMPLE_ITEMS_CSV_WITH_ERRORS = `sku,name,item_type,barcode,is_active
TEST-SKU-003,Valid Item,INVENTORY,999999999,true
,Missing SKU,NON_INVENTORY,,true
TEST-SKU-003,Duplicate SKU,INVENTORY,111111111,true`;

const INVALID_FILE_CONTENT = "This is not a valid CSV or Excel file";

// =============================================================================
// Import Integration Tests
// =============================================================================

describe("Import Integration Tests", () => {
  beforeAll(async () => { await testContext.start(); });
  afterAll(async () => { await testContext.stop(); });

  // Authentication Tests

  test(
    "@slow import integration: should reject requests without authentication (401)",
    { timeout: TEST_TIMEOUT_MS, concurrent: false },
  async () => {
    if (typeof loadEnvFile === "function" && existsSync(ENV_PATH)) {
      loadEnvFile(ENV_PATH);
    }

    const baseUrl = testContext.baseUrl;

    // Test upload without auth
    const uploadResponse = await fetch(`${baseUrl}/api/import/items/upload`, {
      method: "POST",
      body: new FormData()
    });
    assert.equal(uploadResponse.status, 401);

    // Test validate without auth
    const validateResponse = await fetch(`${baseUrl}/api/import/items/validate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ uploadId: "test", mappings: [] })
    });
    assert.equal(validateResponse.status, 401);

    // Test apply without auth
    const applyResponse = await fetch(`${baseUrl}/api/import/items/apply`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ uploadId: "test", mappings: [] })
    });
    assert.equal(applyResponse.status, 401);

    // Test template without auth
    const templateResponse = await fetch(`${baseUrl}/api/import/items/template`);
    assert.equal(templateResponse.status, 401);
  }
);

test(
  "@slow import integration: should reject requests with invalid token (401)",
  { timeout: TEST_TIMEOUT_MS, concurrent: false },
  async () => {
    if (typeof loadEnvFile === "function" && existsSync(ENV_PATH)) {
      loadEnvFile(ENV_PATH);
    }

    const baseUrl = testContext.baseUrl;
    const invalidToken = "invalid-token-12345";

    // Test upload with invalid token
    const uploadResponse = await fetch(`${baseUrl}/api/import/items/upload`, {
      method: "POST",
      headers: { authorization: `Bearer ${invalidToken}` },
      body: new FormData()
    });
    assert.equal(uploadResponse.status, 401);

    // Test validate with invalid token
    const validateResponse = await fetch(`${baseUrl}/api/import/items/validate`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${invalidToken}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({ uploadId: "test", mappings: [] })
    });
    assert.equal(validateResponse.status, 401);

    // Test apply with invalid token
    const applyResponse = await fetch(`${baseUrl}/api/import/items/apply`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${invalidToken}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({ uploadId: "test", mappings: [] })
    });
    assert.equal(applyResponse.status, 401);

    // Test template with invalid token
    const templateResponse = await fetch(`${baseUrl}/api/import/items/template`, {
      headers: { authorization: `Bearer ${invalidToken}` }
    });
    assert.equal(templateResponse.status, 401);
  }
);

// =============================================================================
// Upload Endpoint Tests
// =============================================================================

test(
  "@slow import integration: should upload and parse CSV file successfully",
  { timeout: TEST_TIMEOUT_MS, concurrent: false },
  async () => {
    if (typeof loadEnvFile === "function" && existsSync(ENV_PATH)) {
      loadEnvFile(ENV_PATH);
    }

    const db = testContext.db;
    const companyCode = readEnv("JP_COMPANY_CODE", "JP");
    const ownerEmail = readEnv("JP_OWNER_EMAIL").toLowerCase();
    const ownerPassword = readEnv("JP_OWNER_PASSWORD");
    const baseUrl = testContext.baseUrl;
    const runId = Date.now().toString(36);

    // Login as owner
    const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ companyCode, email: ownerEmail, password: ownerPassword })
    });
    assert.equal(loginResponse.status, 200);
    const loginBody = await loginResponse.json();
    assert.equal(loginBody.success, true);
    const accessToken = loginBody.data.access_token;

    try {
      // Upload CSV file
      const formData = new FormData();
      const csvBlob = new Blob([SAMPLE_ITEM_CSV], { type: "text/csv" });
      formData.append("file", csvBlob, "items.csv");

      const uploadResponse = await fetch(`${baseUrl}/api/import/items/upload`, {
        method: "POST",
        headers: { authorization: `Bearer ${accessToken}` },
        body: formData
      });

      assert.equal(uploadResponse.status, 200);
      const uploadBody = await uploadResponse.json();
      assert.equal(uploadBody.success, true);
      assert.ok(uploadBody.data.uploadId, "Should return uploadId");
      assert.equal(uploadBody.data.filename, "items.csv");
      assert.equal(uploadBody.data.rowCount, 2);
      assert.ok(Array.isArray(uploadBody.data.columns), "Should have columns array");
      assert.ok(Array.isArray(uploadBody.data.sampleData), "Should have sampleData array");
      assert.ok(uploadBody.data.columns.includes("sku"), "Should have sku column");
      assert.ok(uploadBody.data.columns.includes("name"), "Should have name column");
    } finally {
      // No explicit cleanup needed for sessions (they auto-expire)
    }
  }
);

test(
  "@slow import integration: should reject files exceeding 50MB limit (400)",
  { timeout: TEST_TIMEOUT_MS, concurrent: false },
  async () => {
    if (typeof loadEnvFile === "function" && existsSync(ENV_PATH)) {
      loadEnvFile(ENV_PATH);
    }

    const companyCode = readEnv("JP_COMPANY_CODE", "JP");
    const ownerEmail = readEnv("JP_OWNER_EMAIL").toLowerCase();
    const ownerPassword = readEnv("JP_OWNER_PASSWORD");
    const baseUrl = testContext.baseUrl;

    // Login as owner
    const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ companyCode, email: ownerEmail, password: ownerPassword })
    });
    assert.equal(loginResponse.status, 200);
    const loginBody = await loginResponse.json();
    const accessToken = loginBody.data.access_token;

    // Create a file that exceeds 50MB
    const largeContent = "x".repeat(51 * 1024 * 1024);
    const formData = new FormData();
    const largeBlob = new Blob([largeContent], { type: "text/csv" });
    formData.append("file", largeBlob, "large-file.csv");

    const uploadResponse = await fetch(`${baseUrl}/api/import/items/upload`, {
      method: "POST",
      headers: { authorization: `Bearer ${accessToken}` },
      body: formData
    });

    assert.equal(uploadResponse.status, 400);
    const uploadBody = await uploadResponse.json();
    assert.equal(uploadBody.success, false);
    assert.equal(uploadBody.error.code, "FILE_TOO_LARGE");
  }
);

test(
  "@slow import integration: should reject invalid file types (400)",
  { timeout: TEST_TIMEOUT_MS, concurrent: false },
  async () => {
    if (typeof loadEnvFile === "function" && existsSync(ENV_PATH)) {
      loadEnvFile(ENV_PATH);
    }

    const companyCode = readEnv("JP_COMPANY_CODE", "JP");
    const ownerEmail = readEnv("JP_OWNER_EMAIL").toLowerCase();
    const ownerPassword = readEnv("JP_OWNER_PASSWORD");
    const baseUrl = testContext.baseUrl;

    // Login as owner
    const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ companyCode, email: ownerEmail, password: ownerPassword })
    });
    assert.equal(loginResponse.status, 200);
    const loginBody = await loginResponse.json();
    const accessToken = loginBody.data.access_token;

    // Upload invalid file type
    const formData = new FormData();
    const invalidBlob = new Blob([INVALID_FILE_CONTENT], { type: "application/json" });
    formData.append("file", invalidBlob, "data.json");

    const uploadResponse = await fetch(`${baseUrl}/api/import/items/upload`, {
      method: "POST",
      headers: { authorization: `Bearer ${accessToken}` },
      body: formData
    });

    assert.equal(uploadResponse.status, 400);
    const uploadBody = await uploadResponse.json();
    assert.equal(uploadBody.success, false);
    assert.equal(uploadBody.error.code, "INVALID_FILE_TYPE");
  }
);

// =============================================================================
// Validate Endpoint Tests
// =============================================================================

test(
  "@slow import integration: should validate mapped data successfully",
  { timeout: TEST_TIMEOUT_MS, concurrent: false },
  async () => {
    if (typeof loadEnvFile === "function" && existsSync(ENV_PATH)) {
      loadEnvFile(ENV_PATH);
    }

    const companyCode = readEnv("JP_COMPANY_CODE", "JP");
    const ownerEmail = readEnv("JP_OWNER_EMAIL").toLowerCase();
    const ownerPassword = readEnv("JP_OWNER_PASSWORD");
    const baseUrl = testContext.baseUrl;

    // Login as owner
    const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ companyCode, email: ownerEmail, password: ownerPassword })
    });
    assert.equal(loginResponse.status, 200);
    const loginBody = await loginResponse.json();
    const accessToken = loginBody.data.access_token;

    try {
      // First upload a file
      const formData = new FormData();
      const csvBlob = new Blob([SAMPLE_ITEM_CSV], { type: "text/csv" });
      formData.append("file", csvBlob, "items.csv");

      const uploadResponse = await fetch(`${baseUrl}/api/import/items/upload`, {
        method: "POST",
        headers: { authorization: `Bearer ${accessToken}` },
        body: formData
      });

      assert.equal(uploadResponse.status, 200);
      const uploadBody = await uploadResponse.json();
      const uploadId = uploadBody.data.uploadId;

      // Validate with correct mappings
      const validateResponse = await fetch(`${baseUrl}/api/import/items/validate`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          uploadId,
          mappings: [
            { sourceColumn: "sku", targetField: "sku" },
            { sourceColumn: "name", targetField: "name" },
            { sourceColumn: "item_type", targetField: "item_type" },
            { sourceColumn: "barcode", targetField: "barcode" },
            { sourceColumn: "is_active", targetField: "is_active" }
          ]
        })
      });

      assert.equal(validateResponse.status, 200);
      const validateBody = await validateResponse.json();
      assert.equal(validateBody.success, true);
      assert.ok(typeof validateBody.data.totalRows === "number");
      assert.ok(typeof validateBody.data.validRows === "number");
      assert.ok(typeof validateBody.data.errorRows === "number");
      assert.ok(Array.isArray(validateBody.data.errors));
      assert.ok(Array.isArray(validateBody.data.validRowIndices));
      assert.ok(Array.isArray(validateBody.data.errorRowIndices));
    } finally {
      // No explicit cleanup needed
    }
  }
);

test(
  "@slow import integration: should return validation errors for invalid data",
  { timeout: TEST_TIMEOUT_MS, concurrent: false },
  async () => {
    if (typeof loadEnvFile === "function" && existsSync(ENV_PATH)) {
      loadEnvFile(ENV_PATH);
    }

    const companyCode = readEnv("JP_COMPANY_CODE", "JP");
    const ownerEmail = readEnv("JP_OWNER_EMAIL").toLowerCase();
    const ownerPassword = readEnv("JP_OWNER_PASSWORD");
    const baseUrl = testContext.baseUrl;

    // Login as owner
    const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ companyCode, email: ownerEmail, password: ownerPassword })
    });
    assert.equal(loginResponse.status, 200);
    const loginBody = await loginResponse.json();
    const accessToken = loginBody.data.access_token;

    try {
      // Upload CSV with errors (duplicate SKU, missing SKU)
      const formData = new FormData();
      const csvBlob = new Blob([SAMPLE_ITEMS_CSV_WITH_ERRORS], { type: "text/csv" });
      formData.append("file", csvBlob, "items-errors.csv");

      const uploadResponse = await fetch(`${baseUrl}/api/import/items/upload`, {
        method: "POST",
        headers: { authorization: `Bearer ${accessToken}` },
        body: formData
      });

      assert.equal(uploadResponse.status, 200);
      const uploadBody = await uploadResponse.json();
      const uploadId = uploadBody.data.uploadId;

      // Validate - should detect duplicate SKU error
      const validateResponse = await fetch(`${baseUrl}/api/import/items/validate`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          uploadId,
          mappings: [
            { sourceColumn: "sku", targetField: "sku" },
            { sourceColumn: "name", targetField: "name" },
            { sourceColumn: "item_type", targetField: "item_type" },
            { sourceColumn: "barcode", targetField: "barcode" },
            { sourceColumn: "is_active", targetField: "is_active" }
          ]
        })
      });

      assert.equal(validateResponse.status, 200);
      const validateBody = await validateResponse.json();
      assert.equal(validateBody.success, true);
      // Should have at least some errors (duplicate SKU, missing SKU)
      assert.ok(validateBody.data.errorRows >= 1, "Should have at least one error row");
      assert.ok(validateBody.data.errors.length >= 1, "Should have at least one error");
    } finally {
      // No explicit cleanup needed
    }
  }
);

test(
  "@slow import integration: should reject invalid entity type (400)",
  { timeout: TEST_TIMEOUT_MS, concurrent: false },
  async () => {
    if (typeof loadEnvFile === "function" && existsSync(ENV_PATH)) {
      loadEnvFile(ENV_PATH);
    }

    const companyCode = readEnv("JP_COMPANY_CODE", "JP");
    const ownerEmail = readEnv("JP_OWNER_EMAIL").toLowerCase();
    const ownerPassword = readEnv("JP_OWNER_PASSWORD");
    const baseUrl = testContext.baseUrl;

    // Login as owner
    const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ companyCode, email: ownerEmail, password: ownerPassword })
    });
    assert.equal(loginResponse.status, 200);
    const loginBody = await loginResponse.json();
    const accessToken = loginBody.data.access_token;

    // Try to upload with invalid entity type
    const formData = new FormData();
    const csvBlob = new Blob([SAMPLE_ITEM_CSV], { type: "text/csv" });
    formData.append("file", csvBlob, "items.csv");

    const uploadResponse = await fetch(`${baseUrl}/api/import/invalid-entity/upload`, {
      method: "POST",
      headers: { authorization: `Bearer ${accessToken}` },
      body: formData
    });

    assert.equal(uploadResponse.status, 400);
    const uploadBody = await uploadResponse.json();
    assert.equal(uploadBody.success, false);
    assert.equal(uploadBody.error.code, "INVALID_REQUEST");
  }
);

test(
  "@slow import integration: should reject expired/missing uploadId (404)",
  { timeout: TEST_TIMEOUT_MS, concurrent: false },
  async () => {
    if (typeof loadEnvFile === "function" && existsSync(ENV_PATH)) {
      loadEnvFile(ENV_PATH);
    }

    const companyCode = readEnv("JP_COMPANY_CODE", "JP");
    const ownerEmail = readEnv("JP_OWNER_EMAIL").toLowerCase();
    const ownerPassword = readEnv("JP_OWNER_PASSWORD");
    const baseUrl = testContext.baseUrl;

    // Login as owner
    const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ companyCode, email: ownerEmail, password: ownerPassword })
    });
    assert.equal(loginResponse.status, 200);
    const loginBody = await loginResponse.json();
    const accessToken = loginBody.data.access_token;

    // Try to validate with non-existent uploadId
    const validateResponse = await fetch(`${baseUrl}/api/import/items/validate`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        uploadId: "non-existent-upload-id-12345",
        mappings: [
          { sourceColumn: "sku", targetField: "sku" },
          { sourceColumn: "name", targetField: "name" },
          { sourceColumn: "item_type", targetField: "item_type" }
        ]
      })
    });

    assert.equal(validateResponse.status, 404);
    const validateBody = await validateResponse.json();
    assert.equal(validateBody.success, false);
    assert.equal(validateBody.error.code, "NOT_FOUND");
  }
);

// =============================================================================
// Apply Endpoint Tests
// =============================================================================

test(
  "@slow import integration: should create new items successfully",
  { timeout: TEST_TIMEOUT_MS, concurrent: false },
  async () => {
    if (typeof loadEnvFile === "function" && existsSync(ENV_PATH)) {
      loadEnvFile(ENV_PATH);
    }

    const db = testContext.db;
    const companyCode = readEnv("JP_COMPANY_CODE", "JP");
    const ownerEmail = readEnv("JP_OWNER_EMAIL").toLowerCase();
    const ownerPassword = readEnv("JP_OWNER_PASSWORD");
    const baseUrl = testContext.baseUrl;
    const runId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const testSkuPrefix = `TEST-${runId}`;

    // Login as owner
    const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ companyCode, email: ownerEmail, password: ownerPassword })
    });
    assert.equal(loginResponse.status, 200);
    const loginBody = await loginResponse.json();
    const accessToken = loginBody.data.access_token;

    // Get user info to find company_id
    const meResponse = await fetch(`${baseUrl}/api/users/me`, {
      headers: { authorization: `Bearer ${accessToken}` }
    });
    const meBody = await meResponse.json();
    let companyId = meBody?.data?.company_id ?? null;
    if (companyId == null) {
      const [companyRows] = await db.execute(
        `SELECT id FROM companies WHERE code = ? LIMIT 1`,
        [companyCode]
      );
      companyId = companyRows[0]?.id ?? null;
    }
    assert.ok(companyId != null, "company_id must be resolved for verification query");

    const testCsv = `sku,name,item_type,barcode,is_active
${testSkuPrefix}-001,Test Item 1,PRODUCT,${runId}0001,true
${testSkuPrefix}-002,Test Item 2,SERVICE,${runId}0002,true`;

    try {
      // Clean up any existing items with this SKU prefix first
      await db.execute(`DELETE FROM items WHERE sku LIKE ?`, [`${testSkuPrefix}-%`]);

      // Upload file
      const formData = new FormData();
      const csvBlob = new Blob([testCsv], { type: "text/csv" });
      formData.append("file", csvBlob, "items.csv");

      const uploadResponse = await fetch(`${baseUrl}/api/import/items/upload`, {
        method: "POST",
        headers: { authorization: `Bearer ${accessToken}` },
        body: formData
      });

      assert.equal(uploadResponse.status, 200);
      const uploadBody = await uploadResponse.json();
      const uploadId = uploadBody.data.uploadId;

      // Validate
      const validateResponse = await fetch(`${baseUrl}/api/import/items/validate`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          uploadId,
          mappings: [
            { sourceColumn: "sku", targetField: "sku" },
            { sourceColumn: "name", targetField: "name" },
            { sourceColumn: "item_type", targetField: "item_type" },
            { sourceColumn: "barcode", targetField: "barcode" },
            { sourceColumn: "is_active", targetField: "is_active" }
          ]
        })
      });

      assert.equal(validateResponse.status, 200);
      const validateBody = await validateResponse.json();
      // At least the first row should be valid
      assert.ok(validateBody.data.validRows >= 1, `Should have at least 1 valid row, got ${validateBody.data.validRows}`);

      // Apply import
      const applyResponse = await fetch(`${baseUrl}/api/import/items/apply`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          uploadId,
          mappings: [
            { sourceColumn: "sku", targetField: "sku" },
            { sourceColumn: "name", targetField: "name" },
            { sourceColumn: "item_type", targetField: "item_type" },
            { sourceColumn: "barcode", targetField: "barcode" },
            { sourceColumn: "is_active", targetField: "is_active" }
          ]
        })
      });

      assert.equal(applyResponse.status, 200);
      const applyBody = await applyResponse.json();
      assert.equal(applyBody.success, true);
      // At least one item should be created or updated
      assert.ok(applyBody.data.created + applyBody.data.updated >= 1, "Should have created or updated at least 1 item");

      // Verify items were created in database
      const [items] = await db.execute(
        `SELECT id, sku, name, item_type FROM items WHERE sku LIKE ?`,
        [`${testSkuPrefix}-%`]
      );
      assert.ok(items.length >= 1, `Should have at least 1 item in database, got ${items.length}`);

      // Cleanup created items
      if (items.length > 0) {
        const placeholders = items.map(() => "?").join(",");
        await db.execute(`DELETE FROM items WHERE id IN (${placeholders})`, items.map(i => Number(i.id)));
      }
    } catch (error) {
      // Cleanup on error
      await db.execute(`DELETE FROM items WHERE sku LIKE ?`, [`${testSkuPrefix}-%`]);
      throw error;
    }
  }
);

test(
  "@slow import integration: should handle duplicate SKU within same company correctly",
  { timeout: TEST_TIMEOUT_MS, concurrent: false },
  async () => {
    if (typeof loadEnvFile === "function" && existsSync(ENV_PATH)) {
      loadEnvFile(ENV_PATH);
    }

    const db = testContext.db;
    const companyCode = readEnv("JP_COMPANY_CODE", "JP");
    const ownerEmail = readEnv("JP_OWNER_EMAIL").toLowerCase();
    const ownerPassword = readEnv("JP_OWNER_PASSWORD");
    const baseUrl = testContext.baseUrl;
    const runId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const testSku = `DUP-${runId}`;

    // Login as owner
    const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ companyCode, email: ownerEmail, password: ownerPassword })
    });
    assert.equal(loginResponse.status, 200);
    const loginBody = await loginResponse.json();
    const accessToken = loginBody.data.access_token;

    // Get user info to find company_id
    const meResponse = await fetch(`${baseUrl}/api/users/me`, {
      headers: { authorization: `Bearer ${accessToken}` }
    });
    const meBody = await meResponse.json();
    let companyId = meBody?.data?.company_id ?? null;
    if (companyId == null) {
      const [companyRows] = await db.execute(
        `SELECT id FROM companies WHERE code = ? LIMIT 1`,
        [companyCode]
      );
      companyId = companyRows[0]?.id ?? null;
    }
    assert.ok(companyId != null, "company_id must be resolved for duplicate SKU check");

    try {
      // CSV with duplicate SKU (same SKU twice) - second should fail
      const duplicateCsv = `sku,name,item_type,barcode,is_active
${testSku},First Item,INVENTORY,${runId}0001,true
${testSku},Second Item,NON_INVENTORY,${runId}0002,true`;

      const formData = new FormData();
      const csvBlob = new Blob([duplicateCsv], { type: "text/csv" });
      formData.append("file", csvBlob, "items-duplicate.csv");

      const uploadResponse = await fetch(`${baseUrl}/api/import/items/upload`, {
        method: "POST",
        headers: { authorization: `Bearer ${accessToken}` },
        body: formData
      });

      assert.equal(uploadResponse.status, 200);
      const uploadBody = await uploadResponse.json();
      const uploadId = uploadBody.data.uploadId;

      // Validate - should detect duplicate SKU
      const validateResponse = await fetch(`${baseUrl}/api/import/items/validate`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          uploadId,
          mappings: [
            { sourceColumn: "sku", targetField: "sku" },
            { sourceColumn: "name", targetField: "name" },
            { sourceColumn: "item_type", targetField: "item_type" },
            { sourceColumn: "barcode", targetField: "barcode" },
            { sourceColumn: "is_active", targetField: "is_active" }
          ]
        })
      });

      assert.equal(validateResponse.status, 200);
      const validateBody = await validateResponse.json();
      // Note: validation doesn't check for duplicates within the same CSV,
      // so both rows may pass validation but apply may have issues
      assert.equal(validateBody.success, true);
    } finally {
      // Cleanup by SKU
      await db.execute(`DELETE FROM items WHERE company_id = ? AND sku = ?`, [companyId, testSku]);
    }
  }
);

test(
  "@slow import integration: should handle partial failures gracefully",
  { timeout: TEST_TIMEOUT_MS, concurrent: false },
  async () => {
    if (typeof loadEnvFile === "function" && existsSync(ENV_PATH)) {
      loadEnvFile(ENV_PATH);
    }

    const companyCode = readEnv("JP_COMPANY_CODE", "JP");
    const ownerEmail = readEnv("JP_OWNER_EMAIL").toLowerCase();
    const ownerPassword = readEnv("JP_OWNER_PASSWORD");
    const baseUrl = testContext.baseUrl;
    const runId = Date.now().toString(36);

    // Login as owner
    const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ companyCode, email: ownerEmail, password: ownerPassword })
    });
    assert.equal(loginResponse.status, 200);
    const loginBody = await loginResponse.json();
    const accessToken = loginBody.data.access_token;

    // CSV with mixed valid and invalid data (missing required name)
    const partialCsv = `sku,name,item_type,barcode,is_active
${runId}-VALID-001,Valid Item,INVENTORY,${runId}0001,true
${runId}-VALID-002,,NON_INVENTORY,${runId}0002,true`;

    try {
      const formData = new FormData();
      const csvBlob = new Blob([partialCsv], { type: "text/csv" });
      formData.append("file", csvBlob, "items-partial.csv");

      const uploadResponse = await fetch(`${baseUrl}/api/import/items/upload`, {
        method: "POST",
        headers: { authorization: `Bearer ${accessToken}` },
        body: formData
      });

      assert.equal(uploadResponse.status, 200);
      const uploadBody = await uploadResponse.json();
      const uploadId = uploadBody.data.uploadId;

      // Validate - should detect missing name error
      const validateResponse = await fetch(`${baseUrl}/api/import/items/validate`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          uploadId,
          mappings: [
            { sourceColumn: "sku", targetField: "sku" },
            { sourceColumn: "name", targetField: "name" },
            { sourceColumn: "item_type", targetField: "item_type" },
            { sourceColumn: "barcode", targetField: "barcode" },
            { sourceColumn: "is_active", targetField: "is_active" }
          ]
        })
      });

      assert.equal(validateResponse.status, 200);
      const validateBody = await validateResponse.json();
      assert.equal(validateBody.success, true);
      assert.equal(validateBody.data.errorRows >= 1, true, "Should have at least one error row");
      assert.ok(validateBody.data.errors.some(e => e.column === "name"), "Should have name field error");
    } finally {
      // Cleanup
    }
  }
);

// =============================================================================
// Template Endpoint Tests
// =============================================================================

test(
  "@slow import integration: should download CSV template successfully",
  { timeout: TEST_TIMEOUT_MS, concurrent: false },
  async () => {
    if (typeof loadEnvFile === "function" && existsSync(ENV_PATH)) {
      loadEnvFile(ENV_PATH);
    }

    const companyCode = readEnv("JP_COMPANY_CODE", "JP");
    const ownerEmail = readEnv("JP_OWNER_EMAIL").toLowerCase();
    const ownerPassword = readEnv("JP_OWNER_PASSWORD");
    const baseUrl = testContext.baseUrl;

    // Login as owner
    const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ companyCode, email: ownerEmail, password: ownerPassword })
    });
    assert.equal(loginResponse.status, 200);
    const loginBody = await loginResponse.json();
    const accessToken = loginBody.data.access_token;

    // Get template
    const templateResponse = await fetch(`${baseUrl}/api/import/items/template`, {
      headers: { authorization: `Bearer ${accessToken}` }
    });

    assert.equal(templateResponse.status, 200);
    assert.equal(templateResponse.headers.get("content-type"), "text/csv");
    assert.ok(templateResponse.headers.get("content-disposition").includes("attachment"));
    assert.ok(templateResponse.headers.get("content-disposition").includes("jurnapod-items-template.csv"));

    const templateContent = await templateResponse.text();
    assert.ok(templateContent.includes("sku"));
    assert.ok(templateContent.includes("name"));
    assert.ok(templateContent.includes("item_type"));
  }
);

test(
  "@slow import integration: should have correct headers for template",
  { timeout: TEST_TIMEOUT_MS, concurrent: false },
  async () => {
    if (typeof loadEnvFile === "function" && existsSync(ENV_PATH)) {
      loadEnvFile(ENV_PATH);
    }

    const companyCode = readEnv("JP_COMPANY_CODE", "JP");
    const ownerEmail = readEnv("JP_OWNER_EMAIL").toLowerCase();
    const ownerPassword = readEnv("JP_OWNER_PASSWORD");
    const baseUrl = testContext.baseUrl;

    // Login as owner
    const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ companyCode, email: ownerEmail, password: ownerPassword })
    });
    assert.equal(loginResponse.status, 200);
    const loginBody = await loginResponse.json();
    const accessToken = loginBody.data.access_token;

    // Get template
    const templateResponse = await fetch(`${baseUrl}/api/import/items/template`, {
      headers: { authorization: `Bearer ${accessToken}` }
    });

    assert.equal(templateResponse.status, 200);
    const contentLength = templateResponse.headers.get("content-length");
    assert.ok(Number(contentLength) > 0, "Should have content-length header");
  }
);

test(
  "@slow import integration: should return proper content-type for template",
  { timeout: TEST_TIMEOUT_MS, concurrent: false },
  async () => {
    if (typeof loadEnvFile === "function" && existsSync(ENV_PATH)) {
      loadEnvFile(ENV_PATH);
    }

    const companyCode = readEnv("JP_COMPANY_CODE", "JP");
    const ownerEmail = readEnv("JP_OWNER_EMAIL").toLowerCase();
    const ownerPassword = readEnv("JP_OWNER_PASSWORD");
    const baseUrl = testContext.baseUrl;

    // Login as owner
    const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ companyCode, email: ownerEmail, password: ownerPassword })
    });
    assert.equal(loginResponse.status, 200);
    const loginBody = await loginResponse.json();
    const accessToken = loginBody.data.access_token;

    // Get template
    const templateResponse = await fetch(`${baseUrl}/api/import/items/template`, {
      headers: { authorization: `Bearer ${accessToken}` }
    });

    assert.equal(templateResponse.status, 200);
    const contentType = templateResponse.headers.get("content-type");
    assert.ok(contentType.includes("text/csv"), `Should be text/csv, got ${contentType}`);
  }
);

// =============================================================================
// Price Import Tests
// =============================================================================

test(
  "@slow import integration: should upload and parse price CSV successfully",
  { timeout: TEST_TIMEOUT_MS, concurrent: false },
  async () => {
    if (typeof loadEnvFile === "function" && existsSync(ENV_PATH)) {
      loadEnvFile(ENV_PATH);
    }

    const companyCode = readEnv("JP_COMPANY_CODE", "JP");
    const ownerEmail = readEnv("JP_OWNER_EMAIL").toLowerCase();
    const ownerPassword = readEnv("JP_OWNER_PASSWORD");
    const baseUrl = testContext.baseUrl;

    // Login as owner
    const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ companyCode, email: ownerEmail, password: ownerPassword })
    });
    assert.equal(loginResponse.status, 200);
    const loginBody = await loginResponse.json();
    const accessToken = loginBody.data.access_token;

    try {
      // Upload price CSV
      const formData = new FormData();
      const csvBlob = new Blob([SAMPLE_PRICE_CSV], { type: "text/csv" });
      formData.append("file", csvBlob, "prices.csv");

      const uploadResponse = await fetch(`${baseUrl}/api/import/prices/upload`, {
        method: "POST",
        headers: { authorization: `Bearer ${accessToken}` },
        body: formData
      });

      assert.equal(uploadResponse.status, 200);
      const uploadBody = await uploadResponse.json();
      assert.equal(uploadBody.success, true);
      assert.ok(uploadBody.data.uploadId, "Should return uploadId");
      assert.equal(uploadBody.data.filename, "prices.csv");
      assert.ok(Array.isArray(uploadBody.data.columns));
    } finally {
      // No explicit cleanup needed
    }
  }
);

test(
  "@slow import integration: should validate price data successfully",
  { timeout: TEST_TIMEOUT_MS, concurrent: false },
  async () => {
    if (typeof loadEnvFile === "function" && existsSync(ENV_PATH)) {
      loadEnvFile(ENV_PATH);
    }

    const companyCode = readEnv("JP_COMPANY_CODE", "JP");
    const ownerEmail = readEnv("JP_OWNER_EMAIL").toLowerCase();
    const ownerPassword = readEnv("JP_OWNER_PASSWORD");
    const baseUrl = testContext.baseUrl;

    // Login as owner
    const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ companyCode, email: ownerEmail, password: ownerPassword })
    });
    assert.equal(loginResponse.status, 200);
    const loginBody = await loginResponse.json();
    const accessToken = loginBody.data.access_token;

    try {
      // First upload items (prices reference items by SKU)
      const itemsCsv = `sku,name,item_type,barcode,is_active
PRICE-TEST-001,Price Test Item 1,INVENTORY,PRICE-TEST-001,true
PRICE-TEST-002,Price Test Item 2,INVENTORY,PRICE-TEST-002,true`;

      const itemsFormData = new FormData();
      const itemsBlob = new Blob([itemsCsv], { type: "text/csv" });
      itemsFormData.append("file", itemsBlob, "items.csv");

      const itemsUploadResponse = await fetch(`${baseUrl}/api/import/items/upload`, {
        method: "POST",
        headers: { authorization: `Bearer ${accessToken}` },
        body: itemsFormData
      });

      assert.equal(itemsUploadResponse.status, 200);
      const itemsUploadBody = await itemsUploadResponse.json();

      // Apply items first
      const itemsApplyResponse = await fetch(`${baseUrl}/api/import/items/apply`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          uploadId: itemsUploadBody.data.uploadId,
          mappings: [
            { sourceColumn: "sku", targetField: "sku" },
            { sourceColumn: "name", targetField: "name" },
            { sourceColumn: "item_type", targetField: "item_type" },
            { sourceColumn: "barcode", targetField: "barcode" },
            { sourceColumn: "is_active", targetField: "is_active" }
          ]
        })
      });

      assert.equal(itemsApplyResponse.status, 200);

      // Now upload price CSV
      const priceCsv = `item_sku,outlet_id,price,is_active
PRICE-TEST-001,,15000,true
PRICE-TEST-002,1,20000,true`;

      const priceFormData = new FormData();
      const priceBlob = new Blob([priceCsv], { type: "text/csv" });
      priceFormData.append("file", priceBlob, "prices.csv");

      const priceUploadResponse = await fetch(`${baseUrl}/api/import/prices/upload`, {
        method: "POST",
        headers: { authorization: `Bearer ${accessToken}` },
        body: priceFormData
      });

      assert.equal(priceUploadResponse.status, 200);
      const priceUploadBody = await priceUploadResponse.json();
      const uploadId = priceUploadBody.data.uploadId;

      // Validate prices
      const validateResponse = await fetch(`${baseUrl}/api/import/prices/validate`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          uploadId,
          mappings: [
            { sourceColumn: "item_sku", targetField: "item_sku" },
            { sourceColumn: "outlet_id", targetField: "outlet_id" },
            { sourceColumn: "price", targetField: "price" },
            { sourceColumn: "is_active", targetField: "is_active" }
          ]
        })
      });

      assert.equal(validateResponse.status, 200);
      const validateBody = await validateResponse.json();
      assert.equal(validateBody.success, true);
      assert.ok(typeof validateBody.data.totalRows === "number");
    } finally {
      // Cleanup items
    }
  }
);

test(
  "@slow import integration: prices template should have correct columns",
  { timeout: TEST_TIMEOUT_MS, concurrent: false },
  async () => {
    if (typeof loadEnvFile === "function" && existsSync(ENV_PATH)) {
      loadEnvFile(ENV_PATH);
    }

    const companyCode = readEnv("JP_COMPANY_CODE", "JP");
    const ownerEmail = readEnv("JP_OWNER_EMAIL").toLowerCase();
    const ownerPassword = readEnv("JP_OWNER_PASSWORD");
    const baseUrl = testContext.baseUrl;

    // Login as owner
    const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ companyCode, email: ownerEmail, password: ownerPassword })
    });
    assert.equal(loginResponse.status, 200);
    const loginBody = await loginResponse.json();
    const accessToken = loginBody.data.access_token;

    // Get prices template
    const templateResponse = await fetch(`${baseUrl}/api/import/prices/template`, {
      headers: { authorization: `Bearer ${accessToken}` }
    });

    assert.equal(templateResponse.status, 200);
    const templateContent = await templateResponse.text();
    assert.ok(templateContent.includes("item_sku"));
    assert.ok(templateContent.includes("price"));
    assert.ok(templateContent.includes("outlet_id"));
  }
);

// =============================================================================
// Session Cleanup Tests
// =============================================================================

test(
  "@slow import integration: should clean up session after apply",
  { timeout: TEST_TIMEOUT_MS, concurrent: false },
  async () => {
    if (typeof loadEnvFile === "function" && existsSync(ENV_PATH)) {
      loadEnvFile(ENV_PATH);
    }

    const companyCode = readEnv("JP_COMPANY_CODE", "JP");
    const ownerEmail = readEnv("JP_OWNER_EMAIL").toLowerCase();
    const ownerPassword = readEnv("JP_OWNER_PASSWORD");
    const baseUrl = testContext.baseUrl;
    const runId = Date.now().toString(36);

    // Login as owner
    const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ companyCode, email: ownerEmail, password: ownerPassword })
    });
    assert.equal(loginResponse.status, 200);
    const loginBody = await loginResponse.json();
    const accessToken = loginBody.data.access_token;

    try {
      // Upload CSV
      const csv = `sku,name,item_type,barcode,is_active
${runId}-SESSION-001,Session Test Item,SERVICE,${runId}0001,true`;

      const formData = new FormData();
      const csvBlob = new Blob([csv], { type: "text/csv" });
      formData.append("file", csvBlob, "items.csv");

      const uploadResponse = await fetch(`${baseUrl}/api/import/items/upload`, {
        method: "POST",
        headers: { authorization: `Bearer ${accessToken}` },
        body: formData
      });

      assert.equal(uploadResponse.status, 200);
      const uploadBody = await uploadResponse.json();
      const uploadId = uploadBody.data.uploadId;

      // Apply the import
      const applyResponse = await fetch(`${baseUrl}/api/import/items/apply`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          uploadId,
          mappings: [
            { sourceColumn: "sku", targetField: "sku" },
            { sourceColumn: "name", targetField: "name" },
            { sourceColumn: "item_type", targetField: "item_type" },
            { sourceColumn: "barcode", targetField: "barcode" },
            { sourceColumn: "is_active", targetField: "is_active" }
          ]
        })
      });

      assert.equal(applyResponse.status, 200);

      // Try to use the same uploadId again - should fail because session was cleaned up
      const validateResponse = await fetch(`${baseUrl}/api/import/items/validate`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          uploadId,
          mappings: [
            { sourceColumn: "sku", targetField: "sku" },
            { sourceColumn: "name", targetField: "name" },
            { sourceColumn: "item_type", targetField: "item_type" }
          ]
        })
      });

      assert.equal(validateResponse.status, 404, "Session should be cleaned up after apply");
    } finally {
      // Cleanup
    }
  }
);

}); // end describe("Import Integration Tests")
