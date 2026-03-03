// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

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
  if (!json.success || !json.data?.access_token) {
    throw new Error("Authentication response missing access_token");
  }

  return json.data.access_token;
}

async function listAccounts(baseUrl, accessToken, companyId, t) {
  const response = await fetch(`${baseUrl}/api/accounts?company_id=${companyId}`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  let data;
  try {
    data = await response.json();
  } catch (error) {
    data = null;
  }

  if (!response.ok) {
    if (t) {
      t.diagnostic(
        `Failed to list accounts. Status: ${response.status}, Response: ${JSON.stringify(data)}`
      );
    }
    throw new Error("Failed to list accounts");
  }

  if (!data || !Array.isArray(data.data)) {
    if (t) {
      t.diagnostic(`Unexpected accounts response: ${JSON.stringify(data)}`);
    }
    throw new Error("Invalid accounts response");
  }

  return data.data;
}

async function createAccount(baseUrl, accessToken, payload, t) {
  const response = await fetch(`${baseUrl}/api/accounts`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`
    },
    body: JSON.stringify(payload)
  });

  let data;
  try {
    data = await response.json();
  } catch (error) {
    data = null;
  }

  if (!response.ok) {
    if (t) {
      t.diagnostic(
        `Failed to create account. Status: ${response.status}, Response: ${JSON.stringify(data)}`
      );
    }
    throw new Error("Failed to create account");
  }

  return data?.data ?? null;
}

async function ensureDepreciationAccounts(baseUrl, accessToken, companyId, t) {
  let accounts = await listAccounts(baseUrl, accessToken, companyId, t);

  if (accounts.length < 2) {
    const suffix = randomUUID().slice(0, 8).toUpperCase();
    await createAccount(
      baseUrl,
      accessToken,
      {
        company_id: companyId,
        code: `DEP_EXP_${suffix}`,
        name: "Depreciation Expense"
      },
      t
    );
    await createAccount(
      baseUrl,
      accessToken,
      {
        company_id: companyId,
        code: `ACC_DEP_${suffix}`,
        name: "Accumulated Depreciation"
      },
      t
    );
    accounts = await listAccounts(baseUrl, accessToken, companyId, t);
  }

  if (accounts.length < 2) {
    if (t) {
      t.diagnostic(`Insufficient accounts found: ${accounts.length}`);
    }
    throw new Error("Not enough accounts for depreciation plan");
  }

  return {
    expenseAccountId: accounts[0].id,
    accumAccountId: accounts[1].id
  };
}

async function ensureFiscalYearExists(connection, companyId, year, t) {
  const [rows] = await connection.execute(
    `SELECT id, status
     FROM fiscal_years
     WHERE company_id = ?
       AND YEAR(start_date) = ?
     LIMIT 1`,
    [companyId, year]
  );

  if (rows.length > 0) {
    const existingStatus = rows[0].status;
    if (t) {
      t.diagnostic(`Fiscal year ${year} already exists with status ${existingStatus}`);
    }
    if (existingStatus === "CLOSED") {
      await connection.execute(
        `UPDATE fiscal_years
         SET status = 'OPEN'
         WHERE company_id = ?
           AND YEAR(start_date) = ?`,
        [companyId, year]
      );
      if (t) {
        t.diagnostic(`Updated fiscal year ${year} status from CLOSED to OPEN`);
      }
    }
    return;
  }

  await connection.execute(
    `INSERT INTO fiscal_years (
       company_id,
       code,
       name,
       start_date,
       end_date,
       status
     ) VALUES (?, ?, ?, ?, ?, 'OPEN')`,
    [
      companyId,
      `FY${year}`,
      `Fiscal Year ${year}`,
      `${year}-01-01`,
      `${year}-12-31`
    ]
  );

  if (t) {
    t.diagnostic(`Created fiscal year ${year} for company ${companyId}`);
  }
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
    const meResponse = await fetch(`${baseUrl}/api/users/me`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const meData = await meResponse.json();
    const outletId = meData.data?.outlets?.[0]?.id ?? 1;
    const companyId = meData.data?.company_id ?? 1;

    t.diagnostic(`Using companyId: ${companyId}, outletId: ${outletId}`);
    await ensureFiscalYearExists(connection, companyId, 2024, t);

    await t.test("Create fixed asset and depreciation plan", async () => {
      // Create fixed asset
      const assetTag = `TEST-ASSET-${randomUUID().substring(0, 8)}`;
      const createAssetResponse = await fetch(`${baseUrl}/api/accounts/fixed-assets`, {
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
      assert.strictEqual(assetData.success, true);
      assert.ok(assetData.data, "Response should contain asset object");
      const assetId = assetData.data.id;

      // Get accounts for depreciation
      const { expenseAccountId, accumAccountId } = await ensureDepreciationAccounts(
        baseUrl,
        accessToken,
        companyId,
        t
      );

      // Create depreciation plan
      const createPlanResponse = await fetch(`${baseUrl}/api/accounts/fixed-assets/${assetId}/depreciation-plan`, {
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
          expense_account_id: expenseAccountId,
          accum_depr_account_id: accumAccountId,
          status: "ACTIVE"
        })
      });

      assert.strictEqual(createPlanResponse.ok, true, "Failed to create depreciation plan");
      const planData = await createPlanResponse.json();
      assert.strictEqual(planData.success, true);
      assert.strictEqual(planData.data.asset_id, assetId);
      assert.strictEqual(planData.data.useful_life_months, 60);
      assert.strictEqual(planData.data.status, "ACTIVE");

      t.diagnostic(`Created fixed asset ${assetId} with depreciation plan ${planData.data.id}`);
    });

    await t.test("Run depreciation for a period posts journal batch", async () => {
      await ensureFiscalYearExists(connection, companyId, 2024, t);
      // Create a new asset and plan for this test
      const assetTag = `TEST-ASSET-${randomUUID().substring(0, 8)}`;
      const createAssetResponse = await fetch(`${baseUrl}/api/accounts/fixed-assets`, {
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
      const assetId = assetData.data.id;

      const { expenseAccountId, accumAccountId } = await ensureDepreciationAccounts(
        baseUrl,
        accessToken,
        companyId,
        t
      );

      const createPlanResponse = await fetch(`${baseUrl}/api/accounts/fixed-assets/${assetId}/depreciation-plan`, {
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
          expense_account_id: expenseAccountId,
          accum_depr_account_id: accumAccountId,
          status: "ACTIVE"
        })
      });

      const planData = await createPlanResponse.json();
      const planId = planData.data.id;

      // Run depreciation for a period
      const runResponse = await fetch(`${baseUrl}/api/accounts/depreciation/run`, {
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
      assert.strictEqual(runData.success, true);
      assert.strictEqual(runData.data.duplicate, false);
      assert.strictEqual(runData.data.run.period_year, 2024);
      assert.strictEqual(runData.data.run.period_month, 2);
      assert.ok(runData.data.run.journal_batch_id, "Journal batch ID should be set");

      // Verify journal batch was created
      const [journalRows] = await connection.execute(
        `SELECT * FROM journal_batches WHERE id = ? AND doc_type = ?`,
        [runData.data.run.journal_batch_id, DEPRECIATION_DOC_TYPE]
      );

      assert.strictEqual(journalRows.length, 1, "Journal batch should exist");
      assert.strictEqual(Number(journalRows[0].doc_id), runData.data.run.id);

      // Verify journal lines are balanced
      const [lineRows] = await connection.execute(
        `SELECT debit, credit FROM journal_lines WHERE journal_batch_id = ?`,
        [runData.data.run.journal_batch_id]
      );

      assert.strictEqual(lineRows.length, 2, "Should have 2 journal lines");
      
      const totalDebit = lineRows.reduce((sum, row) => sum + Number(row.debit), 0);
      const totalCredit = lineRows.reduce((sum, row) => sum + Number(row.credit), 0);
      
      assert.ok(Math.abs(totalDebit - totalCredit) < 0.01, "Journal lines should be balanced");
      assert.ok(totalDebit > 0, "Total debit should be positive");

      t.diagnostic(`Run posted journal batch ${runData.data.run.journal_batch_id} with balanced lines`);
    });

    await t.test("Duplicate run returns duplicate status without new journal", async () => {
      await ensureFiscalYearExists(connection, companyId, 2024, t);
      // Create asset and plan
      const assetTag = `TEST-ASSET-${randomUUID().substring(0, 8)}`;
      const createAssetResponse = await fetch(`${baseUrl}/api/accounts/fixed-assets`, {
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
      const assetId = assetData.data.id;

      const { expenseAccountId, accumAccountId } = await ensureDepreciationAccounts(
        baseUrl,
        accessToken,
        companyId,
        t
      );

      const createPlanResponse = await fetch(`${baseUrl}/api/accounts/fixed-assets/${assetId}/depreciation-plan`, {
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
          expense_account_id: expenseAccountId,
          accum_depr_account_id: accumAccountId,
          status: "ACTIVE"
        })
      });

      const planData = await createPlanResponse.json();
      const planId = planData.data.id;

      // First run
      const firstRunResponse = await fetch(`${baseUrl}/api/accounts/depreciation/run`, {
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
      assert.strictEqual(firstRunData.data.duplicate, false);
      const firstJournalBatchId = firstRunData.data.run.journal_batch_id;

      // Second run (duplicate)
      const secondRunResponse = await fetch(`${baseUrl}/api/accounts/depreciation/run`, {
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
      assert.strictEqual(secondRunData.data.duplicate, true, "Second run should be marked as duplicate");
      assert.strictEqual(
        secondRunData.data.run.journal_batch_id,
        firstJournalBatchId,
        "Should return same journal batch ID"
      );

      // Verify only one journal batch exists for this period
      const [journalRows] = await connection.execute(
        `SELECT COUNT(*) as count FROM journal_batches WHERE doc_type = ? AND doc_id = ?`,
        [DEPRECIATION_DOC_TYPE, secondRunData.data.run.id]
      );

      assert.strictEqual(Number(journalRows[0].count), 1, "Should have exactly one journal batch");

      t.diagnostic("Duplicate run correctly returned existing journal without creating new one");
    });

    await t.test("Plan update blocked after posted runs", async () => {
      await ensureFiscalYearExists(connection, companyId, 2024, t);
      // Create asset and plan
      const assetTag = `TEST-ASSET-${randomUUID().substring(0, 8)}`;
      const createAssetResponse = await fetch(`${baseUrl}/api/accounts/fixed-assets`, {
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
      const assetId = assetData.data.id;

      const { expenseAccountId, accumAccountId } = await ensureDepreciationAccounts(
        baseUrl,
        accessToken,
        companyId,
        t
      );

      const createPlanResponse = await fetch(`${baseUrl}/api/accounts/fixed-assets/${assetId}/depreciation-plan`, {
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
          expense_account_id: expenseAccountId,
          accum_depr_account_id: accumAccountId,
          status: "ACTIVE"
        })
      });

      const planData = await createPlanResponse.json();
      const planId = planData.data.id;

      // Post a run
      await fetch(`${baseUrl}/api/accounts/depreciation/run`, {
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
      const updateResponse = await fetch(`${baseUrl}/api/accounts/fixed-assets/${assetId}/depreciation-plan`, {
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
