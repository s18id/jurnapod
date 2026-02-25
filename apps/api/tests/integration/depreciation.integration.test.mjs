import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
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

const DEPRECIATION_DOC_TYPE = "DEPRECIATION";

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
    PORT: String(port)
  };

  const child = spawn(process.execPath, [nextCliPath, "dev", "--port", String(port)], {
    cwd: apiRoot,
    env: childEnv,
    stdio: ["ignore", "pipe", "pipe"]
  });

  let stdoutData = "";
  let stderrData = "";

  child.stdout.on("data", (chunk) => {
    stdoutData += String(chunk);
  });

  child.stderr.on("data", (chunk) => {
    stderrData += String(chunk);
  });

  return {
    process: child,
    getStdout: () => stdoutData,
    getStderr: () => stderrData
  };
}

async function waitForServerReady(port, maxWaitMs = 30000) {
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (response.ok) {
        return;
      }
    } catch {
      // Server not ready yet
    }

    await delay(500);
  }

  throw new Error("Server did not become ready in time");
}

async function authenticate(port, companyCode, email, password) {
  const response = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ company_code: companyCode, email, password })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Authentication failed: ${response.status} ${text}`);
  }

  const json = await response.json();
  if (!json.ok || !json.access_token) {
    throw new Error("Authentication response missing access_token");
  }

  return json.access_token;
}

test("Depreciation integration tests", { timeout: TEST_TIMEOUT_MS }, async (t) => {
  if (typeof loadEnvFile === "function") {
    try {
      loadEnvFile(ENV_PATH);
    } catch {
      // Ignore if .env doesn't exist
    }
  }

  const dbConfig = dbConfigFromEnv();
  const companyCode = readEnv("JP_COMPANY_CODE", "JP");
  const email = readEnv("JP_OWNER_EMAIL").toLowerCase();
  const password = readEnv("JP_OWNER_PASSWORD");
  const port = await getFreePort();

  const server = startApiServer(port);
  const baseUrl = `http://127.0.0.1:${port}`;

  let connection;
  let accessToken;

  try {
    await waitForServerReady(port, 45000);
    connection = await mysql.createConnection(dbConfig);
    accessToken = await authenticate(port, companyCode, email, password);

    // Get user info to find outlet
    const meResponse = await fetch(`${baseUrl}/api/me`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const meData = await meResponse.json();
    const outletId = meData.user?.outlets?.[0]?.id ?? 1;
    const companyId = meData.user?.company_id ?? 1;

    t.diagnostic(`Using companyId: ${companyId}, outletId: ${outletId}`);

    await t.test("Create fixed asset and depreciation plan", async () => {
      // Create fixed asset
      const assetTag = `TEST-ASSET-${randomUUID().substring(0, 8)}`;
      const createAssetResponse = await fetch(`${baseUrl}/api/fixed-assets`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          outlet_id: outletId,
          asset_tag: assetTag,
          name: "Test Equipment for Depreciation",
          purchase_date: "2024-01-01",
          purchase_cost: 12000,
          is_active: true
        })
      });

      const assetData = await createAssetResponse.json();
      
      if (!createAssetResponse.ok) {
        t.diagnostic(`Failed to create fixed asset. Status: ${createAssetResponse.status}, Response: ${JSON.stringify(assetData)}`);
      }
      
      assert.strictEqual(createAssetResponse.ok, true, "Failed to create fixed asset");
      assert.strictEqual(assetData.ok, true);
      assert.ok(assetData.asset, "Response should contain asset object");
      const assetId = assetData.asset.id;

      // Get accounts for depreciation
      const accountsResponse = await fetch(`${baseUrl}/api/accounts?company_id=${companyId}`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const accountsData = await accountsResponse.json();
      
      // Find expense and accumulated depreciation accounts (or use first two)
      const expenseAccount = accountsData.data[0]?.id ?? 1;
      const accumAccount = accountsData.data[1]?.id ?? 2;

      // Create depreciation plan
      const createPlanResponse = await fetch(`${baseUrl}/api/fixed-assets/${assetId}/depreciation-plan`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          asset_id: assetId,
          method: "STRAIGHT_LINE",
          useful_life_months: 60,
          salvage_value: 0,
          expense_account_id: expenseAccount,
          accum_depr_account_id: accumAccount,
          status: "ACTIVE"
        })
      });

      assert.strictEqual(createPlanResponse.ok, true, "Failed to create depreciation plan");
      const planData = await createPlanResponse.json();
      assert.strictEqual(planData.ok, true);
      assert.strictEqual(planData.plan.asset_id, assetId);
      assert.strictEqual(planData.plan.useful_life_months, 60);
      assert.strictEqual(planData.plan.status, "ACTIVE");

      t.diagnostic(`Created fixed asset ${assetId} with depreciation plan ${planData.plan.id}`);
    });

    await t.test("Run depreciation for a period posts journal batch", async () => {
      // Create a new asset and plan for this test
      const assetTag = `TEST-ASSET-${randomUUID().substring(0, 8)}`;
      const createAssetResponse = await fetch(`${baseUrl}/api/fixed-assets`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          outlet_id: outletId,
          asset_tag: assetTag,
          name: "Test Asset for Run",
          purchase_date: "2024-01-01",
          purchase_cost: 12000,
          is_active: true
        })
      });

      const assetData = await createAssetResponse.json();
      const assetId = assetData.asset.id;

      const accountsResponse = await fetch(`${baseUrl}/api/accounts?company_id=${companyId}`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const accountsData = await accountsResponse.json();
      const expenseAccount = accountsData.data[0]?.id ?? 1;
      const accumAccount = accountsData.data[1]?.id ?? 2;

      const createPlanResponse = await fetch(`${baseUrl}/api/fixed-assets/${assetId}/depreciation-plan`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          asset_id: assetId,
          method: "STRAIGHT_LINE",
          useful_life_months: 60,
          salvage_value: 0,
          expense_account_id: expenseAccount,
          accum_depr_account_id: accumAccount,
          status: "ACTIVE"
        })
      });

      const planData = await createPlanResponse.json();
      const planId = planData.plan.id;

      // Run depreciation for a period
      const runResponse = await fetch(`${baseUrl}/api/depreciation/run`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          plan_id: planId,
          period_year: 2024,
          period_month: 2
        })
      });

      assert.strictEqual(runResponse.ok, true, "Failed to run depreciation");
      const runData = await runResponse.json();
      assert.strictEqual(runData.ok, true);
      assert.strictEqual(runData.duplicate, false);
      assert.strictEqual(runData.run.period_year, 2024);
      assert.strictEqual(runData.run.period_month, 2);
      assert.ok(runData.run.journal_batch_id, "Journal batch ID should be set");

      // Verify journal batch was created
      const [journalRows] = await connection.execute(
        `SELECT * FROM journal_batches WHERE id = ? AND doc_type = ?`,
        [runData.run.journal_batch_id, DEPRECIATION_DOC_TYPE]
      );

      assert.strictEqual(journalRows.length, 1, "Journal batch should exist");
      assert.strictEqual(Number(journalRows[0].doc_id), runData.run.id);

      // Verify journal lines are balanced
      const [lineRows] = await connection.execute(
        `SELECT debit, credit FROM journal_lines WHERE journal_batch_id = ?`,
        [runData.run.journal_batch_id]
      );

      assert.strictEqual(lineRows.length, 2, "Should have 2 journal lines");
      
      const totalDebit = lineRows.reduce((sum, row) => sum + Number(row.debit), 0);
      const totalCredit = lineRows.reduce((sum, row) => sum + Number(row.credit), 0);
      
      assert.ok(Math.abs(totalDebit - totalCredit) < 0.01, "Journal lines should be balanced");
      assert.ok(totalDebit > 0, "Total debit should be positive");

      t.diagnostic(`Run posted journal batch ${runData.run.journal_batch_id} with balanced lines`);
    });

    await t.test("Duplicate run returns duplicate status without new journal", async () => {
      // Create asset and plan
      const assetTag = `TEST-ASSET-${randomUUID().substring(0, 8)}`;
      const createAssetResponse = await fetch(`${baseUrl}/api/fixed-assets`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          outlet_id: outletId,
          asset_tag: assetTag,
          name: "Test Asset for Idempotency",
          purchase_date: "2024-01-01",
          purchase_cost: 12000,
          is_active: true
        })
      });

      const assetData = await createAssetResponse.json();
      const assetId = assetData.asset.id;

      const accountsResponse = await fetch(`${baseUrl}/api/accounts?company_id=${companyId}`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const accountsData = await accountsResponse.json();
      const expenseAccount = accountsData.data[0]?.id ?? 1;
      const accumAccount = accountsData.data[1]?.id ?? 2;

      const createPlanResponse = await fetch(`${baseUrl}/api/fixed-assets/${assetId}/depreciation-plan`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          asset_id: assetId,
          method: "STRAIGHT_LINE",
          useful_life_months: 60,
          salvage_value: 0,
          expense_account_id: expenseAccount,
          accum_depr_account_id: accumAccount,
          status: "ACTIVE"
        })
      });

      const planData = await createPlanResponse.json();
      const planId = planData.plan.id;

      // First run
      const firstRunResponse = await fetch(`${baseUrl}/api/depreciation/run`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          plan_id: planId,
          period_year: 2024,
          period_month: 3
        })
      });

      const firstRunData = await firstRunResponse.json();
      assert.strictEqual(firstRunData.duplicate, false);
      const firstJournalBatchId = firstRunData.run.journal_batch_id;

      // Second run (duplicate)
      const secondRunResponse = await fetch(`${baseUrl}/api/depreciation/run`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          plan_id: planId,
          period_year: 2024,
          period_month: 3
        })
      });

      assert.strictEqual(secondRunResponse.ok, true);
      const secondRunData = await secondRunResponse.json();
      assert.strictEqual(secondRunData.duplicate, true, "Second run should be marked as duplicate");
      assert.strictEqual(secondRunData.run.journal_batch_id, firstJournalBatchId, "Should return same journal batch ID");

      // Verify only one journal batch exists for this period
      const [journalRows] = await connection.execute(
        `SELECT COUNT(*) as count FROM journal_batches WHERE doc_type = ? AND doc_id = ?`,
        [DEPRECIATION_DOC_TYPE, secondRunData.run.id]
      );

      assert.strictEqual(Number(journalRows[0].count), 1, "Should have exactly one journal batch");

      t.diagnostic("Duplicate run correctly returned existing journal without creating new one");
    });

    await t.test("Plan update blocked after posted runs", async () => {
      // Create asset and plan
      const assetTag = `TEST-ASSET-${randomUUID().substring(0, 8)}`;
      const createAssetResponse = await fetch(`${baseUrl}/api/fixed-assets`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          outlet_id: outletId,
          asset_tag: assetTag,
          name: "Test Asset for Update Block",
          purchase_date: "2024-01-01",
          purchase_cost: 12000,
          is_active: true
        })
      });

      const assetData = await createAssetResponse.json();
      const assetId = assetData.asset.id;

      const accountsResponse = await fetch(`${baseUrl}/api/accounts?company_id=${companyId}`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const accountsData = await accountsResponse.json();
      const expenseAccount = accountsData.data[0]?.id ?? 1;
      const accumAccount = accountsData.data[1]?.id ?? 2;

      const createPlanResponse = await fetch(`${baseUrl}/api/fixed-assets/${assetId}/depreciation-plan`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          asset_id: assetId,
          method: "STRAIGHT_LINE",
          useful_life_months: 60,
          salvage_value: 0,
          expense_account_id: expenseAccount,
          accum_depr_account_id: accumAccount,
          status: "ACTIVE"
        })
      });

      const planData = await createPlanResponse.json();
      const planId = planData.plan.id;

      // Post a run
      await fetch(`${baseUrl}/api/depreciation/run`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          plan_id: planId,
          period_year: 2024,
          period_month: 4
        })
      });

      // Try to update the plan (should fail)
      const updateResponse = await fetch(`${baseUrl}/api/fixed-assets/${assetId}/depreciation-plan`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          useful_life_months: 48
        })
      });

      assert.strictEqual(updateResponse.status, 409, "Update should be blocked with 409 Conflict");
      
      t.diagnostic("Plan update correctly blocked after posted runs");
    });

  } finally {
    if (connection) {
      await connection.end();
    }

    if (server.process) {
      server.process.kill("SIGTERM");
      await delay(1000);
      if (!server.process.killed) {
        server.process.kill("SIGKILL");
      }
    }
  }
});
