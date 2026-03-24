// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
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

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getOpenFiscalYearDate(db, companyId) {
  const [rows] = await db.execute(
    `SELECT DATE_FORMAT(start_date, '%Y-%m-%d') AS start_date,
            DATE_FORMAT(end_date, '%Y-%m-%d') AS end_date
     FROM fiscal_years
     WHERE company_id = ? AND status = 'OPEN'
     ORDER BY start_date DESC
     LIMIT 1`,
    [companyId]
  );

  if (rows.length > 0) {
    return rows[0].start_date ?? rows[0].end_date;
  }

  return new Date().toISOString().split("T")[0];
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

test(
  "fixed asset lifecycle: acquisition, book, ledger, transfer, impairment, disposal",
  { timeout: TEST_TIMEOUT_MS, concurrency: false },
  async () => {
    if (typeof loadEnvFile === "function" && existsSync(ENV_PATH)) {
      loadEnvFile(ENV_PATH);
    }

    const db = testContext.db;
    let createdAssetId = 0;
    let createdCategoryId = 0;
    let createdExpenseAccountId = 0;
    let createdCashAccountId = 0;
    let createdAssetAccountId = 0;
    let createdOutletId = 0;
    let createdLossAccountId = 0;
    let createdDisposalExpenseAccountId = 0;

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
        throw new Error("owner fixture not found");
      }

      const companyId = Number(owner.company_id);
      const originalOutletId = Number(owner.outlet_id);
      const baseUrl = testContext.baseUrl;

      const eventDate = await getOpenFiscalYearDate(db, companyId);

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

      const [expenseAccountResult] = await db.execute(
        `INSERT INTO accounts (company_id, code, name)
         VALUES (?, ?, ?)`,
        [companyId, `FA-EXP-${runId}`, `FA Expense ${runId}`]
      );
      createdExpenseAccountId = Number(expenseAccountResult.insertId);

      const [assetAccountResult] = await db.execute(
        `INSERT INTO accounts (company_id, code, name)
         VALUES (?, ?, ?)`,
        [companyId, `FA-${runId}`, `Fixed Asset ${runId}`]
      );
      createdAssetAccountId = Number(assetAccountResult.insertId);

      const [cashAccountResult] = await db.execute(
        `INSERT INTO accounts (company_id, code, name)
         VALUES (?, ?, ?)`,
        [companyId, `CASH-${runId}`, `Cash Account ${runId}`]
      );
      createdCashAccountId = Number(cashAccountResult.insertId);

      const [lossAccountResult] = await db.execute(
        `INSERT INTO accounts (company_id, code, name) VALUES (?, ?, ?)`,
        [companyId, `FA-LOSS-${runId}`, `FA Loss ${runId}`]
      );
      createdLossAccountId = Number(lossAccountResult.insertId);

      const [disposalExpenseAccountResult] = await db.execute(
        `INSERT INTO accounts (company_id, code, name) VALUES (?, ?, ?)`,
        [companyId, `FA-DISP-EXP-${runId}`, `FA Disposal Exp ${runId}`]
      );
      createdDisposalExpenseAccountId = Number(disposalExpenseAccountResult.insertId);

      const [outletResult] = await db.execute(
        `INSERT INTO outlets (company_id, code, name) VALUES (?, ?, ?)`,
        [companyId, `OUT${runId}`.slice(0, 10).toUpperCase(), `Test Outlet ${runId}`]
      );
      createdOutletId = Number(outletResult.insertId);

      const [assetResult] = await db.execute(
        `INSERT INTO fixed_assets (company_id, outlet_id, category_id, name, purchase_cost, is_active)
         VALUES (?, ?, ?, ?, 10000000, 1)`,
        [companyId, originalOutletId, createdCategoryId, `Asset ${runId}`]
      );
      createdAssetId = Number(assetResult.insertId);

      // ACQUISITION
      const idempotentKey = `idem-${runId}`;
      const acquisitionResponse = await fetch(`${baseUrl}/api/accounts/fixed-assets/${createdAssetId}/acquisition`, {
        method: "POST",
        headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
        body: JSON.stringify({
          event_date: eventDate,
          cost: 10000000,
          useful_life_months: 60,
          salvage_value: 500000,
          asset_account_id: createdAssetAccountId,
          offset_account_id: createdCashAccountId,
          notes: "Test acquisition",
          idempotency_key: idempotentKey
        })
      });
      assert.equal(acquisitionResponse.status, 201, "Acquisition should succeed");
      const acquisitionBody = await acquisitionResponse.json();
      assert.equal(acquisitionBody.success, true);
      assert.equal(typeof acquisitionBody.data.event_id, "number");
      assert.equal(typeof acquisitionBody.data.journal_batch_id, "number");
      assert.equal(acquisitionBody.data.book.cost_basis, 10000000);
      assert.equal(acquisitionBody.data.book.carrying_amount, 9500000);
      assert.equal(acquisitionBody.data.duplicate, false, "First keyed request should not be duplicate");

      // Verify journal lines have correct account mapping
      const [journalLines] = await db.execute(
        `SELECT account_id, debit, credit FROM journal_lines WHERE journal_batch_id = ? ORDER BY debit DESC`,
        [acquisitionBody.data.journal_batch_id]
      );
      assert.equal(journalLines.length, 2, "Should have 2 journal lines");
      const debitLine = journalLines.find((l) => Number(l.debit) > 0);
      const creditLine = journalLines.find((l) => Number(l.credit) > 0);
      assert.equal(Number(debitLine.account_id), createdAssetAccountId, "Debit should be to asset account");
      assert.equal(Number(creditLine.account_id), createdCashAccountId, "Credit should be to offset account");
      assert.equal(Number(debitLine.debit), 10000000, "Debit amount should match cost");
      assert.equal(Number(creditLine.credit), 10000000, "Credit amount should match cost");

      // IDEMPOTENCY - duplicate request with same key
      const duplicateResponse = await fetch(`${baseUrl}/api/accounts/fixed-assets/${createdAssetId}/acquisition`, {
        method: "POST",
        headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
        body: JSON.stringify({
          event_date: eventDate,
          cost: 99999999,
          useful_life_months: 12,
          asset_account_id: createdAssetAccountId,
          offset_account_id: createdCashAccountId,
          idempotency_key: idempotentKey
        })
      });
      assert.equal(duplicateResponse.status, 201);
      const duplicateBody = await duplicateResponse.json();
      assert.equal(duplicateBody.data.duplicate, true, "Second keyed request should be duplicate");
      assert.equal(duplicateBody.data.event_id, acquisitionBody.data.event_id);
      assert.equal(duplicateBody.data.journal_batch_id, acquisitionBody.data.journal_batch_id);
      assert.equal(duplicateBody.data.book.cost_basis, 10000000);
      assert.equal(duplicateBody.data.book.carrying_amount, 9500000);

      const [idempotencyRows] = await db.execute(
        `SELECT COUNT(*) AS cnt
         FROM fixed_asset_events
         WHERE company_id = ? AND asset_id = ? AND event_type = 'ACQUISITION' AND idempotency_key = ?`,
        [companyId, createdAssetId, idempotentKey]
      );
      assert.equal(Number(idempotencyRows[0].cnt), 1, "Same idempotency key must create exactly one event");

      // BOOK
      const bookResponse = await fetch(`${baseUrl}/api/accounts/fixed-assets/${createdAssetId}/book`, {
        headers: { authorization: `Bearer ${accessToken}` }
      });
      assert.equal(bookResponse.status, 200);
      const bookBody = await bookResponse.json();
      assert.equal(bookBody.success, true);
      assert.equal(bookBody.data.cost_basis, 10000000);
      assert.equal(bookBody.data.accum_depreciation, 0);
      assert.equal(bookBody.data.accum_impairment, 0);
      assert.equal(bookBody.data.carrying_amount, 9500000);

      // LEDGER
      const ledgerResponse = await fetch(`${baseUrl}/api/accounts/fixed-assets/${createdAssetId}/ledger`, {
        headers: { authorization: `Bearer ${accessToken}` }
      });
      assert.equal(ledgerResponse.status, 200);
      const ledgerBody = await ledgerResponse.json();
      assert.equal(ledgerBody.success, true);
      assert.equal(ledgerBody.data.events.length, 1);
      assert.equal(ledgerBody.data.events[0].event_type, "ACQUISITION");
      assert.equal(ledgerBody.data.events[0].status, "POSTED");

      // TRANSFER
      const transferResponse = await fetch(`${baseUrl}/api/accounts/fixed-assets/${createdAssetId}/transfer`, {
        method: "POST",
        headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
        body: JSON.stringify({
          to_outlet_id: createdOutletId,
          transfer_date: eventDate,
          notes: "Test transfer"
        })
      });
      assert.equal(transferResponse.status, 201, "Transfer should succeed");
      const transferBody = await transferResponse.json();
      assert.equal(transferBody.success, true);
      assert.equal(transferBody.data.to_outlet_id, createdOutletId);
      assert.equal(typeof transferBody.data.duplicate === "boolean", true, "Transfer response should have duplicate field");

      // Verify outlet was updated
      const [assetAfterTransfer] = await db.execute(
        `SELECT outlet_id FROM fixed_assets WHERE id = ?`,
        [createdAssetId]
      );
      assert.equal(Number(assetAfterTransfer[0].outlet_id), createdOutletId, "Outlet should be updated");

      // IMPAIRMENT
      const impairmentResponse = await fetch(`${baseUrl}/api/accounts/fixed-assets/${createdAssetId}/impairment`, {
        method: "POST",
        headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
        body: JSON.stringify({
          impairment_date: eventDate,
          impairment_amount: 2000000,
          reason: "Obsolescence",
          expense_account_id: createdExpenseAccountId,
          accum_impairment_account_id: createdExpenseAccountId
        })
      });
      assert.equal(impairmentResponse.status, 201, "Impairment should succeed");
      const impairmentBody = await impairmentResponse.json();
      assert.equal(impairmentBody.success, true);
      assert.equal(impairmentBody.data.book.accum_impairment, 2000000);
      assert.equal(impairmentBody.data.book.carrying_amount, 7500000);
      assert.equal(typeof impairmentBody.data.duplicate === "boolean", true, "Impairment response should have duplicate field");

      // Verify book after impairment
      const bookAfterImpairmentResponse = await fetch(`${baseUrl}/api/accounts/fixed-assets/${createdAssetId}/book`, {
        headers: { authorization: `Bearer ${accessToken}` }
      });
      const bookAfterImpairmentBody = await bookAfterImpairmentResponse.json();
      assert.equal(bookAfterImpairmentBody.data.accum_impairment, 2000000);
      assert.equal(bookAfterImpairmentBody.data.carrying_amount, 7500000);

      // Verify ledger has impairment event
      const ledgerAfterImpairmentResponse = await fetch(`${baseUrl}/api/accounts/fixed-assets/${createdAssetId}/ledger`, {
        headers: { authorization: `Bearer ${accessToken}` }
      });
      const ledgerAfterImpairmentBody = await ledgerAfterImpairmentResponse.json();
      assert.equal(ledgerAfterImpairmentBody.data.events.length, 3);
      assert.equal(ledgerAfterImpairmentBody.data.events[1].event_type, "TRANSFER");
      assert.equal(ledgerAfterImpairmentBody.data.events[2].event_type, "IMPAIRMENT");

      // DISPOSAL (SALE) - with loss and disposal cost
      const disposalResponse = await fetch(`${baseUrl}/api/accounts/fixed-assets/${createdAssetId}/disposal`, {
        method: "POST",
        headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
        body: JSON.stringify({
          disposal_date: eventDate,
          disposal_type: "SALE",
          proceeds: 6000000,
          disposal_cost: 100000,
          cash_account_id: createdCashAccountId,
          asset_account_id: createdAssetAccountId,
          accum_depr_account_id: createdExpenseAccountId,
          accum_impairment_account_id: createdExpenseAccountId,
          loss_account_id: createdLossAccountId,
          disposal_expense_account_id: createdDisposalExpenseAccountId,
          notes: "Test sale"
        })
      });
      assert.equal(disposalResponse.status, 201, "Disposal should succeed");
      const disposalBody = await disposalResponse.json();
      assert.equal(disposalBody.success, true);
      assert.equal(disposalBody.data.book.carrying_amount, 0, "Carrying amount should be zero after disposal");
      assert.equal(disposalBody.data.disposal.cost_removed, 10000000);
      assert.equal(disposalBody.data.disposal.gain_loss, -2000000, "Gain/loss = proceeds - nbv (cost - accum_depr - accum_impair) = 6000000 - 8000000 = -2000000 (loss)");
      assert.equal(typeof disposalBody.data.duplicate === "boolean", true, "Disposal response should have duplicate field");

      // Verify asset is marked as disposed
      const [assetAfterDisposal] = await db.execute(
        `SELECT disposed_at FROM fixed_assets WHERE id = ?`,
        [createdAssetId]
      );
      assert.notEqual(assetAfterDisposal[0].disposed_at, null, "Asset should be marked as disposed");

      // Try to perform action on disposed asset - should fail
      const actionOnDisposedResponse = await fetch(`${baseUrl}/api/accounts/fixed-assets/${createdAssetId}/impairment`, {
        method: "POST",
        headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
        body: JSON.stringify({
          impairment_date: eventDate,
          impairment_amount: 100000,
          reason: "Test",
          expense_account_id: createdExpenseAccountId,
          accum_impairment_account_id: createdExpenseAccountId
        })
      });
      assert.equal(actionOnDisposedResponse.status, 409, "Action on disposed asset should fail");

    } finally {
      // Note: journal_lines and journal_batches are immutable (BEFORE DELETE triggers)
      // Events are voided via API which nullifies entries rather than deleting
      // Accounts cannot be deleted when referenced by journal_lines (FK constraint)
      // Outlets cannot be deleted when referenced by journal_batches (FK constraint)
      if (createdAssetId > 0) {
        await db.execute("DELETE FROM asset_depreciation_plans WHERE asset_id = ?", [createdAssetId]);
        await db.execute("DELETE FROM fixed_asset_disposals WHERE asset_id = ?", [createdAssetId]);
        await db.execute("DELETE FROM fixed_asset_events WHERE asset_id = ?", [createdAssetId]);
        await db.execute("DELETE FROM fixed_asset_books WHERE asset_id = ?", [createdAssetId]);
        await db.execute("DELETE FROM fixed_assets WHERE id = ?", [createdAssetId]);
      }
      if (createdCategoryId > 0) {
        await db.execute("DELETE FROM fixed_asset_categories WHERE id = ?", [createdCategoryId]);
      }
      // Note: Accounts and Outlets are intentionally not deleted - they may be referenced
      // by journal_lines/journal_batches which cannot be deleted due to BEFORE DELETE triggers.
    }
  }
);

test(
  "fixed asset lifecycle: acquisition rejects salvage value above cost",
  { timeout: TEST_TIMEOUT_MS, concurrency: false },
  async () => {
    if (typeof loadEnvFile === "function" && existsSync(ENV_PATH)) {
      loadEnvFile(ENV_PATH);
    }

    const db = testContext.db;
    let createdAssetId = 0;
    let createdCategoryId = 0;
    let createdAssetAccountId = 0;
    let createdCashAccountId = 0;

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
        throw new Error("owner fixture not found");
      }

      const companyId = Number(owner.company_id);
      const outletId = Number(owner.outlet_id);
      const baseUrl = testContext.baseUrl;

      const eventDate = await getOpenFiscalYearDate(db, companyId);

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
        [companyId, `CAT-${runId}`, `Invalid Salvage ${runId}`]
      );
      createdCategoryId = Number(categoryResult.insertId);

      const [assetAccountResult] = await db.execute(
        `INSERT INTO accounts (company_id, code, name) VALUES (?, ?, ?)`,
        [companyId, `FA-${runId}`, `Fixed Asset ${runId}`]
      );
      createdAssetAccountId = Number(assetAccountResult.insertId);

      const [cashAccountResult] = await db.execute(
        `INSERT INTO accounts (company_id, code, name) VALUES (?, ?, ?)`,
        [companyId, `CASH-${runId}`, `Cash ${runId}`]
      );
      createdCashAccountId = Number(cashAccountResult.insertId);

      const [assetResult] = await db.execute(
        `INSERT INTO fixed_assets (company_id, outlet_id, category_id, name, purchase_cost, is_active)
         VALUES (?, ?, ?, ?, 10000000, 1)`,
        [companyId, outletId, createdCategoryId, `Asset ${runId}`]
      );
      createdAssetId = Number(assetResult.insertId);

      const invalidAcqResponse = await fetch(`${baseUrl}/api/accounts/fixed-assets/${createdAssetId}/acquisition`, {
        method: "POST",
        headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
        body: JSON.stringify({
          event_date: eventDate,
          cost: 10000000,
          useful_life_months: 60,
          salvage_value: 10000001,
          asset_account_id: createdAssetAccountId,
          offset_account_id: createdCashAccountId,
          notes: "Invalid - salvage exceeds cost"
        })
      });
      assert.equal(invalidAcqResponse.status, 400, "Acquisition with salvage > cost should return 400");
      const errorBody = await invalidAcqResponse.json();
      assert.equal(errorBody.error?.code, "INVALID_REQUEST", "Error code should be INVALID_REQUEST");

      const [eventCount] = await db.execute(
        `SELECT COUNT(*) as cnt FROM fixed_asset_events WHERE asset_id = ? AND event_type = 'ACQUISITION'`,
        [createdAssetId]
      );
      assert.equal(Number(eventCount[0].cnt), 0, "No acquisition event should be created");

      const [bookCount] = await db.execute(
        `SELECT COUNT(*) as cnt FROM fixed_asset_books WHERE asset_id = ?`,
        [createdAssetId]
      );
      assert.equal(Number(bookCount[0].cnt), 0, "No book row should be created");

    } finally {
      // Note: journal_lines and journal_batches are immutable (BEFORE DELETE triggers)
      // Accounts cannot be deleted when referenced by journal_lines (FK constraint)
      if (createdAssetId > 0) {
        await db.execute("DELETE FROM fixed_asset_events WHERE asset_id = ?", [createdAssetId]);
        await db.execute("DELETE FROM fixed_asset_books WHERE asset_id = ?", [createdAssetId]);
        await db.execute("DELETE FROM fixed_assets WHERE id = ?", [createdAssetId]);
      }
      if (createdCategoryId > 0) {
        await db.execute("DELETE FROM fixed_asset_categories WHERE id = ?", [createdCategoryId]);
      }
      // Note: Accounts are intentionally not deleted - they may be referenced by journal_lines
    }
  }
);

test(
  "fixed asset lifecycle: cross-asset acquisition idempotency returns conflict",
  { timeout: TEST_TIMEOUT_MS, concurrency: false },
  async () => {
    if (typeof loadEnvFile === "function" && existsSync(ENV_PATH)) {
      loadEnvFile(ENV_PATH);
    }

    const db = testContext.db;
    let createdAssetId1 = 0;
    let createdAssetId2 = 0;
    let createdCategoryId = 0;
    let createdAssetAccountId = 0;
    let createdCashAccountId = 0;

    const companyCode = readEnv("JP_COMPANY_CODE", "JP");
    const outletCode = readEnv("JP_OUTLET_CODE", "MAIN");
    const ownerEmail = readEnv("JP_OWNER_EMAIL").toLowerCase();
    const ownerPassword = readEnv("JP_OWNER_PASSWORD");
    const runId = Date.now().toString(36);
    const sharedIdempotencyKey = `cross-asset-acq-${runId}`;

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
        throw new Error("owner fixture not found");
      }

      const companyId = Number(owner.company_id);
      const outletId = Number(owner.outlet_id);
      const baseUrl = testContext.baseUrl;

      const eventDate = await getOpenFiscalYearDate(db, companyId);

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
        [companyId, `CAT-${runId}`, `Cross Asset Acq ${runId}`]
      );
      createdCategoryId = Number(categoryResult.insertId);

      const [assetAccountResult] = await db.execute(
        `INSERT INTO accounts (company_id, code, name) VALUES (?, ?, ?)`,
        [companyId, `FA-${runId}`, `Fixed Asset ${runId}`]
      );
      createdAssetAccountId = Number(assetAccountResult.insertId);

      const [cashAccountResult] = await db.execute(
        `INSERT INTO accounts (company_id, code, name) VALUES (?, ?, ?)`,
        [companyId, `CASH-${runId}`, `Cash ${runId}`]
      );
      createdCashAccountId = Number(cashAccountResult.insertId);

      const [assetResult1] = await db.execute(
        `INSERT INTO fixed_assets (company_id, outlet_id, category_id, name, purchase_cost, is_active)
         VALUES (?, ?, ?, ?, 10000000, 1)`,
        [companyId, outletId, createdCategoryId, `Asset1 ${runId}`]
      );
      createdAssetId1 = Number(assetResult1.insertId);

      const [assetResult2] = await db.execute(
        `INSERT INTO fixed_assets (company_id, outlet_id, category_id, name, purchase_cost, is_active)
         VALUES (?, ?, ?, ?, 10000000, 1)`,
        [companyId, outletId, createdCategoryId, `Asset2 ${runId}`]
      );
      createdAssetId2 = Number(assetResult2.insertId);

      const firstAcqResponse = await fetch(`${baseUrl}/api/accounts/fixed-assets/${createdAssetId1}/acquisition`, {
        method: "POST",
        headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
        body: JSON.stringify({
          event_date: eventDate,
          cost: 10000000,
          useful_life_months: 60,
          salvage_value: 0,
          asset_account_id: createdAssetAccountId,
          offset_account_id: createdCashAccountId,
          idempotency_key: sharedIdempotencyKey,
          notes: "First asset acquisition"
        })
      });
      assert.equal(firstAcqResponse.status, 201);

      const crossAssetAcqResponse = await fetch(`${baseUrl}/api/accounts/fixed-assets/${createdAssetId2}/acquisition`, {
        method: "POST",
        headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
        body: JSON.stringify({
          event_date: eventDate,
          cost: 8000000,
          useful_life_months: 60,
          salvage_value: 0,
          asset_account_id: createdAssetAccountId,
          offset_account_id: createdCashAccountId,
          idempotency_key: sharedIdempotencyKey,
          notes: "Different asset - should fail"
        })
      });
      assert.equal(crossAssetAcqResponse.status, 409, "Cross-asset idempotency should return conflict");
      const conflictBody = await crossAssetAcqResponse.json();
      assert.equal(conflictBody.error?.code, "CONFLICT", "Error code should be CONFLICT");
      assert.equal(conflictBody.data, undefined, "No data should be exposed in conflict response");

    } finally {
      // Note: journal_lines and journal_batches are immutable (BEFORE DELETE triggers)
      // Accounts cannot be deleted when referenced by journal_lines (FK constraint)
      if (createdAssetId1 > 0) {
        await db.execute("DELETE FROM fixed_asset_events WHERE asset_id = ?", [createdAssetId1]);
        await db.execute("DELETE FROM fixed_asset_books WHERE asset_id = ?", [createdAssetId1]);
        await db.execute("DELETE FROM fixed_assets WHERE id = ?", [createdAssetId1]);
      }
      if (createdAssetId2 > 0) {
        await db.execute("DELETE FROM fixed_asset_events WHERE asset_id = ?", [createdAssetId2]);
        await db.execute("DELETE FROM fixed_asset_books WHERE asset_id = ?", [createdAssetId2]);
        await db.execute("DELETE FROM fixed_assets WHERE id = ?", [createdAssetId2]);
      }
      if (createdCategoryId > 0) {
        await db.execute("DELETE FROM fixed_asset_categories WHERE id = ?", [createdCategoryId]);
      }
      // Note: Accounts are intentionally not deleted - they may be referenced by journal_lines
    }
  }
);

test(
  "fixed asset lifecycle: same-asset acquisition with transfer idempotency key returns conflict",
  { timeout: TEST_TIMEOUT_MS, concurrency: false },
  async () => {
    if (typeof loadEnvFile === "function" && existsSync(ENV_PATH)) {
      loadEnvFile(ENV_PATH);
    }

    const db = testContext.db;
    let createdAssetId = 0;
    let createdCategoryId = 0;
    let createdAssetAccountId = 0;
    let createdCashAccountId = 0;
    let targetOutletId = 0;

    const companyCode = readEnv("JP_COMPANY_CODE", "JP");
    const outletCode = readEnv("JP_OUTLET_CODE", "MAIN");
    const ownerEmail = readEnv("JP_OWNER_EMAIL").toLowerCase();
    const ownerPassword = readEnv("JP_OWNER_PASSWORD");
    const runId = Date.now().toString(36);
    const sharedIdempotencyKey = `acq-transfer-type-${runId}`;

    try {
      const [ownerRows] = await db.execute(
        `SELECT u.company_id, u.id as user_id, o.id AS outlet_id
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
        throw new Error("owner fixture not found");
      }

      const companyId = Number(owner.company_id);
      const outletId = Number(owner.outlet_id);
      const userId = Number(owner.user_id);
      const baseUrl = testContext.baseUrl;

      const eventDate = await getOpenFiscalYearDate(db, companyId);

      const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ companyCode, email: ownerEmail, password: ownerPassword })
      });
      assert.equal(loginResponse.status, 200);
      const { access_token: accessToken } = (await loginResponse.json()).data;

      const [targetOutletResult] = await db.execute(
        `INSERT INTO outlets (company_id, code, name) VALUES (?, ?, ?)`,
        [companyId, `TARGET-${runId}`, `Target ${runId}`]
      );
      targetOutletId = Number(targetOutletResult.insertId);
      await db.execute(
        `INSERT INTO user_outlets (user_id, outlet_id) VALUES (?, ?)`,
        [userId, targetOutletId]
      );

      const [categoryResult] = await db.execute(
        `INSERT INTO fixed_asset_categories (company_id, code, name, depreciation_method, useful_life_months, residual_value_pct, is_active)
         VALUES (?, ?, ?, 'STRAIGHT_LINE', 60, 5, 1)`,
        [companyId, `CAT-${runId}`, `Type Collision ${runId}`]
      );
      createdCategoryId = Number(categoryResult.insertId);

      const [assetAccountResult] = await db.execute(
        `INSERT INTO accounts (company_id, code, name) VALUES (?, ?, ?)`,
        [companyId, `FA-${runId}`, `Fixed Asset ${runId}`]
      );
      createdAssetAccountId = Number(assetAccountResult.insertId);

      const [cashAccountResult] = await db.execute(
        `INSERT INTO accounts (company_id, code, name) VALUES (?, ?, ?)`,
        [companyId, `CASH-${runId}`, `Cash ${runId}`]
      );
      createdCashAccountId = Number(cashAccountResult.insertId);

      const [assetResult] = await db.execute(
        `INSERT INTO fixed_assets (company_id, outlet_id, category_id, name, purchase_cost, is_active)
         VALUES (?, ?, ?, ?, 10000000, 1)`,
        [companyId, outletId, createdCategoryId, `Asset ${runId}`]
      );
      createdAssetId = Number(assetResult.insertId);

      const acqResponse = await fetch(`${baseUrl}/api/accounts/fixed-assets/${createdAssetId}/acquisition`, {
        method: "POST",
        headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
        body: JSON.stringify({
          event_date: eventDate,
          cost: 10000000,
          useful_life_months: 60,
          salvage_value: 0,
          asset_account_id: createdAssetAccountId,
          offset_account_id: createdCashAccountId,
          idempotency_key: sharedIdempotencyKey,
          notes: "Acquisition with shared key"
        })
      });
      assert.equal(acqResponse.status, 201);

      const transferWithAcqKeyResponse = await fetch(`${baseUrl}/api/accounts/fixed-assets/${createdAssetId}/transfer`, {
        method: "POST",
        headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
        body: JSON.stringify({
          to_outlet_id: targetOutletId,
          transfer_date: eventDate,
          idempotency_key: sharedIdempotencyKey,
          notes: "Transfer using acquisition key - should fail"
        })
      });
      assert.equal(transferWithAcqKeyResponse.status, 409, "Same-asset non-acquisition key reuse should return conflict");
      const conflictBody = await transferWithAcqKeyResponse.json();
      assert.equal(conflictBody.error?.code, "CONFLICT", "Error code should be CONFLICT");
      assert.equal(conflictBody.data, undefined, "No data should be exposed in conflict response");

    } finally {
      // Note: journal_lines and journal_batches are immutable (BEFORE DELETE triggers)
      // Accounts cannot be deleted when referenced by journal_lines (FK constraint)
      if (createdAssetId > 0) {
        await db.execute("DELETE FROM fixed_asset_events WHERE asset_id = ?", [createdAssetId]);
        await db.execute("DELETE FROM fixed_asset_books WHERE asset_id = ?", [createdAssetId]);
        await db.execute("DELETE FROM fixed_assets WHERE id = ?", [createdAssetId]);
      }
      if (targetOutletId > 0) {
        await db.execute("DELETE FROM user_outlets WHERE outlet_id = ?", [targetOutletId]);
        await db.execute("DELETE FROM outlets WHERE id = ?", [targetOutletId]);
      }
      if (createdCategoryId > 0) {
        await db.execute("DELETE FROM fixed_asset_categories WHERE id = ?", [createdCategoryId]);
      }
      // Note: Accounts are intentionally not deleted - they may be referenced by journal_lines
    }
  }
);

test(
  "fixed asset lifecycle: same-asset acquisition idempotent retry returns duplicate success",
  { timeout: TEST_TIMEOUT_MS, concurrency: false },
  async () => {
    if (typeof loadEnvFile === "function" && existsSync(ENV_PATH)) {
      loadEnvFile(ENV_PATH);
    }

    const db = testContext.db;
    let createdAssetId = 0;
    let createdCategoryId = 0;
    let createdAssetAccountId = 0;
    let createdCashAccountId = 0;

    const companyCode = readEnv("JP_COMPANY_CODE", "JP");
    const outletCode = readEnv("JP_OUTLET_CODE", "MAIN");
    const ownerEmail = readEnv("JP_OWNER_EMAIL").toLowerCase();
    const ownerPassword = readEnv("JP_OWNER_PASSWORD");
    const runId = Date.now().toString(36);
    const idempotencyKey = `acq-retry-${runId}`;

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
        throw new Error("owner fixture not found");
      }

      const companyId = Number(owner.company_id);
      const outletId = Number(owner.outlet_id);
      const baseUrl = testContext.baseUrl;

      const eventDate = await getOpenFiscalYearDate(db, companyId);

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
        [companyId, `CAT-${runId}`, `Retry ${runId}`]
      );
      createdCategoryId = Number(categoryResult.insertId);

      const [assetAccountResult] = await db.execute(
        `INSERT INTO accounts (company_id, code, name) VALUES (?, ?, ?)`,
        [companyId, `FA-${runId}`, `Fixed Asset ${runId}`]
      );
      createdAssetAccountId = Number(assetAccountResult.insertId);

      const [cashAccountResult] = await db.execute(
        `INSERT INTO accounts (company_id, code, name) VALUES (?, ?, ?)`,
        [companyId, `CASH-${runId}`, `Cash ${runId}`]
      );
      createdCashAccountId = Number(cashAccountResult.insertId);

      const [assetResult] = await db.execute(
        `INSERT INTO fixed_assets (company_id, outlet_id, category_id, name, purchase_cost, is_active)
         VALUES (?, ?, ?, ?, 10000000, 1)`,
        [companyId, outletId, createdCategoryId, `Asset ${runId}`]
      );
      createdAssetId = Number(assetResult.insertId);

      const firstAcqResponse = await fetch(`${baseUrl}/api/accounts/fixed-assets/${createdAssetId}/acquisition`, {
        method: "POST",
        headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
        body: JSON.stringify({
          event_date: eventDate,
          cost: 10000000,
          useful_life_months: 60,
          salvage_value: 0,
          asset_account_id: createdAssetAccountId,
          offset_account_id: createdCashAccountId,
          idempotency_key: idempotencyKey,
          notes: "First acquisition"
        })
      });
      assert.equal(firstAcqResponse.status, 201, "First acquisition should succeed");
      const firstBody = await firstAcqResponse.json();
      assert.equal(firstBody.success, true);
      const firstEventId = firstBody.data.event_id;

      const retryAcqResponse = await fetch(`${baseUrl}/api/accounts/fixed-assets/${createdAssetId}/acquisition`, {
        method: "POST",
        headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
        body: JSON.stringify({
          event_date: eventDate,
          cost: 10000000,
          useful_life_months: 60,
          salvage_value: 0,
          asset_account_id: createdAssetAccountId,
          offset_account_id: createdCashAccountId,
          idempotency_key: idempotencyKey,
          notes: "Retry acquisition"
        })
      });
      assert.equal(retryAcqResponse.status, 201, "Retry acquisition should return duplicate success");
      const retryBody = await retryAcqResponse.json();
      assert.equal(retryBody.success, true);
      assert.equal(retryBody.data.duplicate, true, "duplicate flag should be true");
      assert.equal(retryBody.data.event_id, firstEventId, "Should return canonical event_id");
      assert.equal(retryBody.data.book.cost_basis, 10000000, "Should return correct cost_basis");
      assert.equal(retryBody.data.book.carrying_amount, 10000000, "Should return correct carrying_amount");

    } finally {
      // Note: journal_lines and journal_batches are immutable (BEFORE DELETE triggers)
      // Accounts cannot be deleted when referenced by journal_lines (FK constraint)
      if (createdAssetId > 0) {
        await db.execute("DELETE FROM fixed_asset_events WHERE asset_id = ?", [createdAssetId]);
        await db.execute("DELETE FROM fixed_asset_books WHERE asset_id = ?", [createdAssetId]);
        await db.execute("DELETE FROM fixed_assets WHERE id = ?", [createdAssetId]);
      }
      if (createdCategoryId > 0) {
        await db.execute("DELETE FROM fixed_asset_categories WHERE id = ?", [createdCategoryId]);
      }
      // Note: Accounts are intentionally not deleted - they may be referenced by journal_lines
    }
  }
);

test(
  "fixed asset lifecycle: void acquisition reverses journal",
  { timeout: TEST_TIMEOUT_MS, concurrency: false },
  async () => {
    if (typeof loadEnvFile === "function" && existsSync(ENV_PATH)) {
      loadEnvFile(ENV_PATH);
    }

    const db = testContext.db;
    let createdAssetId = 0;
    let createdCategoryId = 0;
    let createdExpenseAccountId = 0;
    let createdAssetAccountId = 0;
    let createdCashAccountId = 0;
    let createdEventId = 0;

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
        throw new Error("owner fixture not found");
      }

      const companyId = Number(owner.company_id);
      const outletId = Number(owner.outlet_id);
      const baseUrl = testContext.baseUrl;

      const eventDate = await getOpenFiscalYearDate(db, companyId);

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

      const [expenseAccountResult] = await db.execute(
        `INSERT INTO accounts (company_id, code, name)
         VALUES (?, ?, ?)`,
        [companyId, `FA-EXP-${runId}`, `FA Expense ${runId}`]
      );
      createdExpenseAccountId = Number(expenseAccountResult.insertId);

      const [assetAccountResult] = await db.execute(
        `INSERT INTO accounts (company_id, code, name)
         VALUES (?, ?, ?)`,
        [companyId, `FA-${runId}`, `Fixed Asset ${runId}`]
      );
      createdAssetAccountId = Number(assetAccountResult.insertId);

      const [cashAccountResult] = await db.execute(
        `INSERT INTO accounts (company_id, code, name)
         VALUES (?, ?, ?)`,
        [companyId, `CASH-${runId}`, `Cash Account ${runId}`]
      );
      createdCashAccountId = Number(cashAccountResult.insertId);

      const [assetResult] = await db.execute(
        `INSERT INTO fixed_assets (company_id, outlet_id, category_id, name, purchase_cost, is_active)
         VALUES (?, ?, ?, ?, 5000000, 1)`,
        [companyId, outletId, createdCategoryId, `Asset ${runId}`]
      );
      createdAssetId = Number(assetResult.insertId);

      // Create acquisition event directly
      const acquisitionResponse = await fetch(`${baseUrl}/api/accounts/fixed-assets/${createdAssetId}/acquisition`, {
        method: "POST",
        headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
        body: JSON.stringify({
          event_date: eventDate,
          cost: 5000000,
          useful_life_months: 60,
          salvage_value: 0,
          asset_account_id: createdAssetAccountId,
          offset_account_id: createdCashAccountId,
          expense_account_id: createdExpenseAccountId
        })
      });
      assert.equal(acquisitionResponse.status, 201);
      const acquisitionBody = await acquisitionResponse.json();
      createdEventId = acquisitionBody.data.event_id;

      // Get the event to void
      const ledgerResponse = await fetch(`${baseUrl}/api/accounts/fixed-assets/${createdAssetId}/ledger`, {
        headers: { authorization: `Bearer ${accessToken}` }
      });
      const ledgerBody = await ledgerResponse.json();
      assert.equal(ledgerBody.data.events[0].id, createdEventId);

      // VOID the acquisition
      const voidResponse = await fetch(`${baseUrl}/api/accounts/fixed-assets/events/${createdEventId}/void`, {
        method: "POST",
        headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
        body: JSON.stringify({
          void_reason: "Incorrect acquisition amount"
        })
      });
      assert.equal(voidResponse.status, 201, "Void should succeed");
      const voidBody = await voidResponse.json();
      assert.equal(voidBody.success, true);
      assert.equal(voidBody.data.original_event_id, createdEventId);
      assert.equal(typeof voidBody.data.void_event_id, "number");
      assert.equal(typeof voidBody.data.duplicate === "boolean", true, "Void response should have duplicate field");

      // Verify original event is now voided
      const ledgerAfterVoidResponse = await fetch(`${baseUrl}/api/accounts/fixed-assets/${createdAssetId}/ledger`, {
        headers: { authorization: `Bearer ${accessToken}` }
      });
      const ledgerAfterVoidBody = await ledgerAfterVoidResponse.json();
      assert.equal(ledgerAfterVoidBody.data.events[0].status, "VOIDED");
      assert.equal(ledgerAfterVoidBody.data.events[1].event_type, "VOID");

      // Verify book is reset
      const bookAfterVoidResponse = await fetch(`${baseUrl}/api/accounts/fixed-assets/${createdAssetId}/book`, {
        headers: { authorization: `Bearer ${accessToken}` }
      });
      const bookAfterVoidBody = await bookAfterVoidResponse.json();
      assert.equal(bookAfterVoidBody.data.cost_basis, 0, "Cost basis should be reset after void");
      assert.equal(bookAfterVoidBody.data.carrying_amount, 0, "Carrying amount should be reset");

    } finally {
      // Note: journal_lines and journal_batches are immutable (BEFORE DELETE triggers)
      // Accounts cannot be deleted when referenced by journal_lines (FK constraint)
      if (createdAssetId > 0) {
        await db.execute("DELETE FROM asset_depreciation_plans WHERE asset_id = ?", [createdAssetId]);
        await db.execute("DELETE FROM fixed_asset_disposals WHERE asset_id = ?", [createdAssetId]);
        await db.execute("DELETE FROM fixed_asset_events WHERE asset_id = ?", [createdAssetId]);
        await db.execute("DELETE FROM fixed_asset_books WHERE asset_id = ?", [createdAssetId]);
        await db.execute("DELETE FROM fixed_assets WHERE id = ?", [createdAssetId]);
      }
      if (createdCategoryId > 0) {
        await db.execute("DELETE FROM fixed_asset_categories WHERE id = ?", [createdCategoryId]);
      }
      // Note: Accounts are intentionally not deleted - they may be referenced by journal_lines
    }
  }
);

test(
  "fixed asset lifecycle: outlet-scoped user cannot access other outlet assets",
  { timeout: TEST_TIMEOUT_MS, concurrency: false },
  async () => {
    if (typeof loadEnvFile === "function" && existsSync(ENV_PATH)) {
      loadEnvFile(ENV_PATH);
    }

    const db = testContext.db;
    let createdAssetId = 0;
    let createdCategoryId = 0;
    let restrictedUserId = 0;
    let deniedOutletId = 0;
    let createdExpenseAccountId = 0;
    let createdAssetAccountId = 0;
    let createdCashAccountId = 0;
    let createdEventId = 0;
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
        throw new Error("owner fixture not found");
      }

      companyId = Number(owner.company_id);
      const allowedOutletId = Number(owner.outlet_id);
      const baseUrl = testContext.baseUrl;

      const eventDate = await getOpenFiscalYearDate(db, companyId);

      const [deniedOutletResult] = await db.execute(
        `INSERT INTO outlets (company_id, code, name) VALUES (?, ?, ?)`,
        [companyId, `DENY${runId}`.slice(0, 10).toUpperCase(), `Denied Outlet ${runId}`]
      );
      deniedOutletId = Number(deniedOutletResult.insertId);

      const [expenseAccountResult] = await db.execute(
        `INSERT INTO accounts (company_id, code, name)
         VALUES (?, ?, ?)`,
        [companyId, `FA-EXP-${runId}`, `FA Expense ${runId}`]
      );
      createdExpenseAccountId = Number(expenseAccountResult.insertId);

      const [assetAccountResult] = await db.execute(
        `INSERT INTO accounts (company_id, code, name)
         VALUES (?, ?, ?)`,
        [companyId, `FA-${runId}`, `Fixed Asset ${runId}`]
      );
      createdAssetAccountId = Number(assetAccountResult.insertId);

      const [cashAccountResult] = await db.execute(
        `INSERT INTO accounts (company_id, code, name)
         VALUES (?, ?, ?)`,
        [companyId, `CASH-${runId}`, `Cash Account ${runId}`]
      );
      createdCashAccountId = Number(cashAccountResult.insertId);

      const [categoryResult] = await db.execute(
        `INSERT INTO fixed_asset_categories (company_id, code, name, depreciation_method, useful_life_months, residual_value_pct, is_active)
         VALUES (?, ?, ?, 'STRAIGHT_LINE', 60, 5, 1)`,
        [companyId, `CAT-${runId}`, `Test Category ${runId}`]
      );
      createdCategoryId = Number(categoryResult.insertId);

      const [assetResult] = await db.execute(
        `INSERT INTO fixed_assets (company_id, outlet_id, category_id, name, purchase_cost, is_active)
         VALUES (?, ?, ?, ?, 10000000, 1)`,
        [companyId, deniedOutletId, createdCategoryId, `Denied Asset ${runId}`]
      );
      createdAssetId = Number(assetResult.insertId);

      const [ownerPasswordRows] = await db.execute(
        `SELECT password_hash FROM users WHERE id = ? LIMIT 1`,
        [Number(owner.id)]
      );
      const passwordHash = ownerPasswordRows[0]?.password_hash;
      if (!passwordHash) {
        throw new Error("owner password hash not found");
      }

      const [adminRoleRows] = await db.execute(
        `SELECT id
         FROM roles
         WHERE code = 'ADMIN'
           AND company_id IS NULL
           AND is_global = 0
         LIMIT 1`
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

      // Try to get book for denied outlet asset
      const bookResponse = await fetch(`${baseUrl}/api/accounts/fixed-assets/${createdAssetId}/book`, {
        headers: { authorization: `Bearer ${accessToken}` }
      });
      assert.equal(bookResponse.status, 404, "Should return 404 for other outlet asset");

      // Try to get ledger for denied outlet asset
      const ledgerResponse = await fetch(`${baseUrl}/api/accounts/fixed-assets/${createdAssetId}/ledger`, {
        headers: { authorization: `Bearer ${accessToken}` }
      });
      assert.equal(ledgerResponse.status, 404, "Should return 404 for other outlet asset");

      // Try to perform action on denied outlet asset
      const acquisitionResponse = await fetch(`${baseUrl}/api/accounts/fixed-assets/${createdAssetId}/acquisition`, {
        method: "POST",
        headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
        body: JSON.stringify({
          event_date: eventDate,
          cost: 10000000,
          useful_life_months: 60,
          asset_account_id: createdAssetAccountId,
          offset_account_id: createdCashAccountId,
          expense_account_id: createdExpenseAccountId
        })
      });
      assert.equal(acquisitionResponse.status, 404, "Should return 404 for other outlet asset");

      // Try to perform impairment on denied outlet asset
      const impairmentResponse = await fetch(`${baseUrl}/api/accounts/fixed-assets/${createdAssetId}/impairment`, {
        method: "POST",
        headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
        body: JSON.stringify({
          impairment_date: eventDate,
          impairment_amount: 1000000,
          reason: "Test impairment",
          expense_account_id: createdExpenseAccountId,
          accum_impairment_account_id: createdExpenseAccountId
        })
      });
      assert.equal(impairmentResponse.status, 404, "Should return 404 for other outlet asset");

      // Try to perform disposal on denied outlet asset
      const disposalResponse = await fetch(`${baseUrl}/api/accounts/fixed-assets/${createdAssetId}/disposal`, {
        method: "POST",
        headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
        body: JSON.stringify({
          disposal_date: eventDate,
          disposal_type: "SALE",
          proceeds: 5000000,
          cash_account_id: createdCashAccountId,
          asset_account_id: createdAssetAccountId,
          accum_depr_account_id: createdExpenseAccountId
        })
      });
      assert.equal(disposalResponse.status, 404, "Should return 404 for other outlet asset");

      // Try to transfer from denied outlet asset
      const transferResponse = await fetch(`${baseUrl}/api/accounts/fixed-assets/${createdAssetId}/transfer`, {
        method: "POST",
        headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
        body: JSON.stringify({
          to_outlet_id: allowedOutletId,
          transfer_date: eventDate
        })
      });
      assert.equal(transferResponse.status, 404, "Should return 404 for other outlet asset");

      // Create an event in denied outlet that we can try to void
      const [eventResult] = await db.execute(
        `INSERT INTO fixed_asset_events (company_id, asset_id, event_type, event_date, outlet_id, journal_batch_id, status, idempotency_key, event_data, created_by)
         VALUES (?, ?, 'ACQUISITION', ?, ?, NULL, 'POSTED', ?, '{}', ?)`,
        [companyId, createdAssetId, eventDate, deniedOutletId, `void-test-${runId}`, owner.id]
      );
      const createdEventId = Number(eventResult.insertId);

      // Try to void event from denied outlet
      const voidResponse = await fetch(`${baseUrl}/api/accounts/fixed-assets/events/${createdEventId}/void`, {
        method: "POST",
        headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
        body: JSON.stringify({
          void_reason: "Test void from denied outlet"
        })
      });
      assert.equal(voidResponse.status, 404, "Should return 404 for voiding event in other outlet");

    } finally {
      // Note: journal_lines and journal_batches are immutable (BEFORE DELETE triggers)
      // Accounts cannot be deleted when referenced by journal_lines (FK constraint)
      if (createdAssetId > 0) {
        await db.execute("DELETE FROM asset_depreciation_plans WHERE asset_id = ?", [createdAssetId]);
        await db.execute("DELETE FROM fixed_asset_disposals WHERE asset_id = ?", [createdAssetId]);
        await db.execute("DELETE FROM fixed_asset_events WHERE asset_id = ?", [createdAssetId]);
        await db.execute("DELETE FROM fixed_asset_books WHERE asset_id = ?", [createdAssetId]);
        await db.execute("DELETE FROM fixed_assets WHERE id = ?", [createdAssetId]);
      }
      if (createdCategoryId > 0) {
        await db.execute("DELETE FROM fixed_asset_categories WHERE id = ?", [createdCategoryId]);
      }
      // Note: Accounts are intentionally not deleted - they may be referenced by journal_lines
      if (deniedOutletId > 0) {
        await db.execute("DELETE FROM outlets WHERE id = ?", [deniedOutletId]);
      }
      if (restrictedUserId > 0) {
        await db.execute("DELETE FROM user_role_assignments WHERE user_id = ?", [restrictedUserId]);
        await db.execute("DELETE FROM users WHERE id = ?", [restrictedUserId]);
      }
    }
  }
);

test(
  "fixed asset lifecycle: void disposal restores pre-disposal book",
  { timeout: TEST_TIMEOUT_MS, concurrency: false },
  async () => {
    if (typeof loadEnvFile === "function" && existsSync(ENV_PATH)) {
      loadEnvFile(ENV_PATH);
    }

    const db = testContext.db;
    let createdAssetId = 0;
    let createdCategoryId = 0;
    let createdExpenseAccountId = 0;
    let createdAssetAccountId = 0;
    let createdCashAccountId = 0;
    let createdDisposalEventId = 0;
    let createdLossAccountId = 0;
    let createdDisposalExpenseAccountId = 0;

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
        throw new Error("owner fixture not found");
      }

      const companyId = Number(owner.company_id);
      const outletId = Number(owner.outlet_id);
      const baseUrl = testContext.baseUrl;

      const eventDate = await getOpenFiscalYearDate(db, companyId);

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

      const [expenseAccountResult] = await db.execute(
        `INSERT INTO accounts (company_id, code, name)
         VALUES (?, ?, ?)`,
        [companyId, `FA-EXP-${runId}`, `FA Expense ${runId}`]
      );
      createdExpenseAccountId = Number(expenseAccountResult.insertId);

      const [assetAccountResult] = await db.execute(
        `INSERT INTO accounts (company_id, code, name)
         VALUES (?, ?, ?)`,
        [companyId, `FA-${runId}`, `Fixed Asset ${runId}`]
      );
      createdAssetAccountId = Number(assetAccountResult.insertId);

      const [cashAccountResult] = await db.execute(
        `INSERT INTO accounts (company_id, code, name)
         VALUES (?, ?, ?)`,
        [companyId, `CASH-${runId}`, `Cash Account ${runId}`]
      );
      createdCashAccountId = Number(cashAccountResult.insertId);

      const [lossAccountResult] = await db.execute(
        `INSERT INTO accounts (company_id, code, name)
         VALUES (?, ?, ?)`,
        [companyId, `FA-LOSS-${runId}`, `FA Loss ${runId}`]
      );
      createdLossAccountId = Number(lossAccountResult.insertId);

      const [disposalExpenseAccountResult] = await db.execute(
        `INSERT INTO accounts (company_id, code, name)
         VALUES (?, ?, ?)`,
        [companyId, `FA-DISP-EXP-${runId}`, `FA Disposal Exp ${runId}`]
      );
      createdDisposalExpenseAccountId = Number(disposalExpenseAccountResult.insertId);

      const [assetResult] = await db.execute(
        `INSERT INTO fixed_assets (company_id, outlet_id, category_id, name, purchase_cost, is_active)
         VALUES (?, ?, ?, ?, 10000000, 1)`,
        [companyId, outletId, createdCategoryId, `Asset ${runId}`]
      );
      createdAssetId = Number(assetResult.insertId);

      // Acquisition
      const acquisitionResponse = await fetch(`${baseUrl}/api/accounts/fixed-assets/${createdAssetId}/acquisition`, {
        method: "POST",
        headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
        body: JSON.stringify({
          event_date: eventDate,
          cost: 10000000,
          useful_life_months: 60,
          salvage_value: 0,
          asset_account_id: createdAssetAccountId,
          offset_account_id: createdCashAccountId
        })
      });
      assert.equal(acquisitionResponse.status, 201);

      // Impairment
      const impairmentResponse = await fetch(`${baseUrl}/api/accounts/fixed-assets/${createdAssetId}/impairment`, {
        method: "POST",
        headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
        body: JSON.stringify({
          impairment_date: eventDate,
          impairment_amount: 1000000,
          reason: "Test impairment",
          expense_account_id: createdExpenseAccountId,
          accum_impairment_account_id: createdExpenseAccountId
        })
      });
      assert.equal(impairmentResponse.status, 201);

      // Disposal
      const disposalResponse = await fetch(`${baseUrl}/api/accounts/fixed-assets/${createdAssetId}/disposal`, {
        method: "POST",
        headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
        body: JSON.stringify({
          disposal_date: eventDate,
          disposal_type: "SALE",
          proceeds: 8000000,
          disposal_cost: 0,
          cash_account_id: createdCashAccountId,
          asset_account_id: createdAssetAccountId,
          accum_depr_account_id: createdExpenseAccountId,
          accum_impairment_account_id: createdExpenseAccountId,
          loss_account_id: createdLossAccountId
        })
      });
      assert.equal(disposalResponse.status, 201);
      const disposalBody = await disposalResponse.json();
      createdDisposalEventId = disposalBody.data.event_id;

      // Verify disposed
      const [assetAfterDisposal] = await db.execute(
        `SELECT disposed_at FROM fixed_assets WHERE id = ?`,
        [createdAssetId]
      );
      assert.notEqual(assetAfterDisposal[0].disposed_at, null, "Asset should be disposed");

      // Void the disposal
      const voidResponse = await fetch(`${baseUrl}/api/accounts/fixed-assets/events/${createdDisposalEventId}/void`, {
        method: "POST",
        headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
        body: JSON.stringify({
          void_reason: "Incorrect disposal"
        })
      });
      assert.equal(voidResponse.status, 201, "Void should succeed");

      // Verify book restored
      const bookAfterVoidResponse = await fetch(`${baseUrl}/api/accounts/fixed-assets/${createdAssetId}/book`, {
        headers: { authorization: `Bearer ${accessToken}` }
      });
      const bookAfterVoid = await bookAfterVoidResponse.json();
      assert.equal(bookAfterVoid.data.cost_basis, 10000000, "Cost basis should be restored");
      assert.equal(bookAfterVoid.data.accum_impairment, 1000000, "Accumulated impairment should be restored");
      assert.equal(bookAfterVoid.data.carrying_amount, 9000000, "Carrying amount should be restored");

      // Verify disposed_at cleared
      const [assetAfterVoid] = await db.execute(
        `SELECT disposed_at FROM fixed_assets WHERE id = ?`,
        [createdAssetId]
      );
      assert.equal(assetAfterVoid[0].disposed_at, null, "disposed_at should be cleared after void");

    } finally {
      // Note: journal_lines and journal_batches are immutable (BEFORE DELETE triggers)
      // Accounts cannot be deleted when referenced by journal_lines (FK constraint)
      if (createdAssetId > 0) {
        await db.execute("DELETE FROM asset_depreciation_plans WHERE asset_id = ?", [createdAssetId]);
        await db.execute("DELETE FROM fixed_asset_disposals WHERE asset_id = ?", [createdAssetId]);
        await db.execute("DELETE FROM fixed_asset_events WHERE asset_id = ?", [createdAssetId]);
        await db.execute("DELETE FROM fixed_asset_books WHERE asset_id = ?", [createdAssetId]);
        await db.execute("DELETE FROM fixed_assets WHERE id = ?", [createdAssetId]);
      }
      if (createdCategoryId > 0) {
        await db.execute("DELETE FROM fixed_asset_categories WHERE id = ?", [createdCategoryId]);
      }
      // Note: Accounts are intentionally not deleted - they may be referenced by journal_lines
    }
  }
);

test(
  "fixed asset lifecycle: void disposal restores pre-disposal carrying with acquisition salvage",
  { timeout: TEST_TIMEOUT_MS, concurrency: false },
  async () => {
    if (typeof loadEnvFile === "function" && existsSync(ENV_PATH)) {
      loadEnvFile(ENV_PATH);
    }

    const db = testContext.db;
    let createdAssetId = 0;
    let createdCategoryId = 0;
    let createdAssetAccountId = 0;
    let createdCashAccountId = 0;
    let createdLossAccountId = 0;
    let createdDisposalEventId = 0;

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
        throw new Error("owner fixture not found");
      }

      const companyId = Number(owner.company_id);
      const outletId = Number(owner.outlet_id);
      const baseUrl = testContext.baseUrl;

      const eventDate = await getOpenFiscalYearDate(db, companyId);

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
        [companyId, `CAT-${runId}`, `Salvage Void ${runId}`]
      );
      createdCategoryId = Number(categoryResult.insertId);

      const [assetAccountResult] = await db.execute(
        `INSERT INTO accounts (company_id, code, name) VALUES (?, ?, ?)`,
        [companyId, `FA-${runId}`, `Fixed Asset ${runId}`]
      );
      createdAssetAccountId = Number(assetAccountResult.insertId);

      const [cashAccountResult] = await db.execute(
        `INSERT INTO accounts (company_id, code, name) VALUES (?, ?, ?)`,
        [companyId, `CASH-${runId}`, `Cash ${runId}`]
      );
      createdCashAccountId = Number(cashAccountResult.insertId);

      const [assetResult] = await db.execute(
        `INSERT INTO fixed_assets (company_id, outlet_id, category_id, name, purchase_cost, is_active)
         VALUES (?, ?, ?, ?, 10000000, 1)`,
        [companyId, outletId, createdCategoryId, `Asset ${runId}`]
      );
      createdAssetId = Number(assetResult.insertId);

      const acqResponse = await fetch(`${baseUrl}/api/accounts/fixed-assets/${createdAssetId}/acquisition`, {
        method: "POST",
        headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
        body: JSON.stringify({
          event_date: eventDate,
          cost: 10000000,
          useful_life_months: 60,
          salvage_value: 500000,
          asset_account_id: createdAssetAccountId,
          offset_account_id: createdCashAccountId,
          notes: "Acquisition with salvage"
        })
      });
      assert.equal(acqResponse.status, 201);
      const acqBody = await acqResponse.json();
      assert.equal(acqBody.data.book.carrying_amount, 9500000, "Initial carrying amount should be cost - salvage");

      const bookResponse = await fetch(`${baseUrl}/api/accounts/fixed-assets/${createdAssetId}/book`, {
        headers: { authorization: `Bearer ${accessToken}` }
      });
      assert.equal(bookResponse.status, 200);
      const bookBody = await bookResponse.json();
      assert.equal(bookBody.data.cost_basis, 10000000, "Cost basis should be full acquisition cost");
      assert.equal(bookBody.data.carrying_amount, 9500000, "Carrying amount should reflect salvage");

      const disposalDate = new Date(eventDate);
      disposalDate.setMonth(disposalDate.getMonth() + 6);
      const disposalDateStr = disposalDate.toISOString().split("T")[0];

      const [lossAccountResult] = await db.execute(
        `INSERT INTO accounts (company_id, code, name) VALUES (?, ?, ?)`,
        [companyId, `LOSS-${runId}`, `Loss ${runId}`]
      );
      createdLossAccountId = Number(lossAccountResult.insertId);

      const disposalResponse = await fetch(`${baseUrl}/api/accounts/fixed-assets/${createdAssetId}/disposal`, {
        method: "POST",
        headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
        body: JSON.stringify({
          disposal_date: disposalDateStr,
          disposal_type: "SCRAP",
          disposal_cost: 0,
          cash_account_id: createdCashAccountId,
          asset_account_id: createdAssetAccountId,
          accum_depr_account_id: createdAssetAccountId,
          loss_account_id: createdLossAccountId,
          notes: "Disposal"
        })
      });
      assert.equal(disposalResponse.status, 201);
      const disposalBody = await disposalResponse.json();
      createdDisposalEventId = disposalBody.data.event_id;

      const voidResponse = await fetch(`${baseUrl}/api/accounts/fixed-assets/events/${createdDisposalEventId}/void`, {
        method: "POST",
        headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
        body: JSON.stringify({
          void_reason: "Void disposal to restore book"
        })
      });
      assert.equal(voidResponse.status, 201, "Void disposal should succeed");

      const bookAfterVoidResponse = await fetch(`${baseUrl}/api/accounts/fixed-assets/${createdAssetId}/book`, {
        headers: { authorization: `Bearer ${accessToken}` }
      });
      assert.equal(bookAfterVoidResponse.status, 200);
      const bookAfterVoid = await bookAfterVoidResponse.json();
      assert.equal(bookAfterVoid.data.cost_basis, 10000000, "Cost basis should be restored");
      assert.equal(bookAfterVoid.data.carrying_amount, 9500000, "Carrying amount should be restored with salvage preserved (cost - salvage)");

    } finally {
      // Note: journal_lines and journal_batches are immutable (BEFORE DELETE triggers)
      // Accounts cannot be deleted when referenced by journal_lines (FK constraint)
      if (createdAssetId > 0) {
        await db.execute("DELETE FROM asset_depreciation_plans WHERE asset_id = ?", [createdAssetId]);
        await db.execute("DELETE FROM fixed_asset_disposals WHERE asset_id = ?", [createdAssetId]);
        await db.execute("DELETE FROM fixed_asset_events WHERE asset_id = ?", [createdAssetId]);
        await db.execute("DELETE FROM fixed_asset_books WHERE asset_id = ?", [createdAssetId]);
        await db.execute("DELETE FROM fixed_assets WHERE id = ?", [createdAssetId]);
      }
      if (createdCategoryId > 0) {
        await db.execute("DELETE FROM fixed_asset_categories WHERE id = ?", [createdCategoryId]);
      }
      // Note: Accounts are intentionally not deleted - they may be referenced by journal_lines
    }
  }
);

test(
  "fixed asset lifecycle: void legacy FA_ACQUISITION event",
  { timeout: TEST_TIMEOUT_MS, concurrency: false },
  async () => {
    if (typeof loadEnvFile === "function" && existsSync(ENV_PATH)) {
      loadEnvFile(ENV_PATH);
    }

    const db = testContext.db;
    let createdAssetId = 0;
    let createdCategoryId = 0;
    let createdAssetAccountId = 0;
    let createdCashAccountId = 0;
    let createdEventId = 0;
    let journalBatchId = 0;

    const companyCode = readEnv("JP_COMPANY_CODE", "JP");
    const outletCode = readEnv("JP_OUTLET_CODE", "MAIN");
    const ownerEmail = readEnv("JP_OWNER_EMAIL").toLowerCase();
    const ownerPassword = readEnv("JP_OWNER_PASSWORD");
    const runId = Date.now().toString(36);

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
        throw new Error("owner fixture not found");
      }

      const companyId = Number(owner.company_id);
      const outletId = Number(owner.outlet_id);
      const baseUrl = testContext.baseUrl;
      const userId = Number(owner.id);

      const eventDate = await getOpenFiscalYearDate(db, companyId);

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
        [companyId, `CAT-${runId}`, `Legacy Test ${runId}`]
      );
      createdCategoryId = Number(categoryResult.insertId);

      const [assetAccountResult] = await db.execute(
        `INSERT INTO accounts (company_id, code, name) VALUES (?, ?, ?)`,
        [companyId, `FA-${runId}`, `Fixed Asset ${runId}`]
      );
      createdAssetAccountId = Number(assetAccountResult.insertId);

      const [cashAccountResult] = await db.execute(
        `INSERT INTO accounts (company_id, code, name) VALUES (?, ?, ?)`,
        [companyId, `CASH-${runId}`, `Cash ${runId}`]
      );
      createdCashAccountId = Number(cashAccountResult.insertId);

      const [assetResult] = await db.execute(
        `INSERT INTO fixed_assets (company_id, outlet_id, category_id, name, purchase_cost, is_active)
         VALUES (?, ?, ?, ?, 5000000, 1)`,
        [companyId, outletId, createdCategoryId, `Legacy Asset ${runId}`]
      );
      createdAssetId = Number(assetResult.insertId);

      const [batchResult] = await db.execute(
        `INSERT INTO journal_batches (company_id, outlet_id, doc_type, doc_id, posted_at) VALUES (?, ?, ?, ?, ?)`,
        [companyId, outletId, "FA_ACQUISITION", createdAssetId, eventDate]
      );
      journalBatchId = Number(batchResult.insertId);

      await db.execute(
        `INSERT INTO journal_lines (journal_batch_id, company_id, outlet_id, account_id, line_date, debit, credit, description)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          journalBatchId, companyId, outletId, createdAssetAccountId, eventDate, 5000000, 0, "Legacy FA Acq - Asset",
          journalBatchId, companyId, outletId, createdCashAccountId, eventDate, 0, 5000000, "Legacy FA Acq - Offset"
        ]
      );

      const [eventResult] = await db.execute(
        `INSERT INTO fixed_asset_events (company_id, asset_id, event_type, event_date, outlet_id, journal_batch_id, status, idempotency_key, event_data, created_by)
         VALUES (?, ?, 'FA_ACQUISITION', ?, ?, ?, 'POSTED', ?, ?, ?)`,
        [companyId, createdAssetId, eventDate, outletId, journalBatchId, `fa-legacy-${runId}`, JSON.stringify({ cost: 5000000, useful_life_months: 60, salvage_value: 0 }), userId]
      );
      createdEventId = Number(eventResult.insertId);

      await db.execute(
        `INSERT INTO fixed_asset_books (company_id, asset_id, cost_basis, accum_depreciation, accum_impairment, carrying_amount, as_of_date, last_event_id)
         VALUES (?, ?, ?, 0, 0, ?, ?, ?)`,
        [companyId, createdAssetId, 5000000, 5000000, eventDate, createdEventId]
      );

      const voidResponse = await fetch(`${baseUrl}/api/accounts/fixed-assets/events/${createdEventId}/void`, {
        method: "POST",
        headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
        body: JSON.stringify({ void_reason: "Void legacy FA_ACQUISITION" })
      });
      assert.equal(voidResponse.status, 201, "Void legacy ACQUISITION should succeed");
      const voidBody = await voidResponse.json();
      assert.equal(voidBody.success, true);
      assert.equal(voidBody.data.original_event_id, createdEventId);

      const [voidedRows] = await db.execute(
        `SELECT status FROM fixed_asset_events WHERE id = ?`,
        [createdEventId]
      );
      assert.equal(voidedRows[0].status, "VOIDED", "Legacy event should be voided");

      const bookAfterVoid = await fetch(`${baseUrl}/api/accounts/fixed-assets/${createdAssetId}/book`, {
        headers: { authorization: `Bearer ${accessToken}` }
      });
      const bookData = await bookAfterVoid.json();
      assert.equal(bookData.data.cost_basis, 0, "Cost basis should reset after void");
      assert.equal(bookData.data.carrying_amount, 0, "Carrying amount should reset");

    } finally {
      // Note: journal_lines and journal_batches are immutable (BEFORE DELETE triggers)
      // Legacy FA_ACQUISITION events have their journals kept as historical record
      // Accounts cannot be deleted when referenced by journal_lines (FK constraint)
      if (createdAssetId > 0) {
        await db.execute("DELETE FROM fixed_asset_events WHERE asset_id = ?", [createdAssetId]);
        await db.execute("DELETE FROM fixed_asset_books WHERE asset_id = ?", [createdAssetId]);
        await db.execute("DELETE FROM fixed_assets WHERE id = ?", [createdAssetId]);
      }
      if (createdCategoryId > 0) {
        await db.execute("DELETE FROM fixed_asset_categories WHERE id = ?", [createdCategoryId]);
      }
      // Note: Accounts are intentionally not deleted - they may be referenced by journal_lines
    }
  }
);

test(
  "fixed asset lifecycle: transfer to unauthorized outlet returns 404",
  { timeout: TEST_TIMEOUT_MS, concurrency: false },
  async () => {
    if (typeof loadEnvFile === "function" && existsSync(ENV_PATH)) {
      loadEnvFile(ENV_PATH);
    }

    const db = testContext.db;
    let createdAssetId = 0;
    let createdCategoryId = 0;
    let deniedOutletId = 0;
    let createdAssetAccountId = 0;
    let createdCashAccountId = 0;
    let restrictedUserId = 0;
    let adminRoleId = null;
    let companyId = null;

    const companyCode = readEnv("JP_COMPANY_CODE", "JP");
    const outletCode = readEnv("JP_OUTLET_CODE", "MAIN");
    const ownerEmail = readEnv("JP_OWNER_EMAIL").toLowerCase();
    const ownerPassword = readEnv("JP_OWNER_PASSWORD");
    const runId = Date.now().toString(36);
    const restrictedEmail = `restrict-xfer-${runId}@example.com`;

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
        throw new Error("owner fixture not found");
      }

      companyId = Number(owner.company_id);
      const allowedOutletId = Number(owner.outlet_id);
      const baseUrl = testContext.baseUrl;

      const eventDate = await getOpenFiscalYearDate(db, companyId);

      const [deniedOutletResult] = await db.execute(
        `INSERT INTO outlets (company_id, code, name) VALUES (?, ?, ?)`,
        [companyId, `DENYX${runId}`.slice(0, 10).toUpperCase(), `Denied Xfer ${runId}`]
      );
      deniedOutletId = Number(deniedOutletResult.insertId);

      const [assetAccountResult] = await db.execute(
        `INSERT INTO accounts (company_id, code, name) VALUES (?, ?, ?)`,
        [companyId, `FA-${runId}`, `Fixed Asset ${runId}`]
      );
      createdAssetAccountId = Number(assetAccountResult.insertId);

      const [cashAccountResult] = await db.execute(
        `INSERT INTO accounts (company_id, code, name) VALUES (?, ?, ?)`,
        [companyId, `CASH-${runId}`, `Cash ${runId}`]
      );
      createdCashAccountId = Number(cashAccountResult.insertId);

      const [categoryResult] = await db.execute(
        `INSERT INTO fixed_asset_categories (company_id, code, name, depreciation_method, useful_life_months, residual_value_pct, is_active)
         VALUES (?, ?, ?, 'STRAIGHT_LINE', 60, 5, 1)`,
        [companyId, `CAT-${runId}`, `Test ${runId}`]
      );
      createdCategoryId = Number(categoryResult.insertId);

      const [assetResult] = await db.execute(
        `INSERT INTO fixed_assets (company_id, outlet_id, category_id, name, purchase_cost, is_active)
         VALUES (?, ?, ?, ?, 10000000, 1)`,
        [companyId, allowedOutletId, createdCategoryId, `Xfer Asset ${runId}`]
      );
      createdAssetId = Number(assetResult.insertId);

      const [ownerPwRows] = await db.execute(
        `SELECT password_hash FROM users WHERE id = ? LIMIT 1`,
        [Number(owner.id)]
      );
      const passwordHash = ownerPwRows[0]?.password_hash;
      if (!passwordHash) {
        throw new Error("owner password hash not found");
      }

      const [adminRoleRows] = await db.execute(
        `SELECT id FROM roles WHERE code = 'ADMIN' AND company_id IS NULL AND is_global = 0 LIMIT 1`
      );
      adminRoleId = adminRoleRows[0]?.id;
      if (!adminRoleId) {
        throw new Error("ADMIN role not found");
      }

      const [userInsert] = await db.execute(
        `INSERT INTO users (company_id, email, password_hash, is_active) VALUES (?, ?, ?, 1)`,
        [companyId, restrictedEmail, passwordHash]
      );
      restrictedUserId = Number(userInsert.insertId);

      await db.execute(
        `INSERT INTO user_role_assignments (user_id, outlet_id, role_id) VALUES (?, ?, ?)`,
        [restrictedUserId, allowedOutletId, Number(adminRoleId)]
      );

      await db.execute(
        `INSERT INTO module_roles (company_id, role_id, module, permission_mask)
         VALUES (?, ?, 'accounts', 15) ON DUPLICATE KEY UPDATE permission_mask = 15`,
        [companyId, Number(adminRoleId)]
      );

      const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ companyCode, email: restrictedEmail, password: ownerPassword })
      });
      assert.equal(loginResponse.status, 200);
      const { access_token: accessToken } = (await loginResponse.json()).data;

      const transferResponse = await fetch(`${baseUrl}/api/accounts/fixed-assets/${createdAssetId}/transfer`, {
        method: "POST",
        headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
        body: JSON.stringify({
          to_outlet_id: deniedOutletId,
          transfer_date: eventDate
        })
      });
      assert.equal(transferResponse.status, 404, "Transfer to unauthorized outlet should return 404");

      const [assetAfter] = await db.execute(
        `SELECT outlet_id FROM fixed_assets WHERE id = ?`,
        [createdAssetId]
      );
      assert.equal(Number(assetAfter[0].outlet_id), allowedOutletId, "Asset outlet should be unchanged");

    } finally {
      if (createdAssetId > 0) {
        await db.execute("DELETE FROM fixed_asset_events WHERE asset_id = ?", [createdAssetId]);
        await db.execute("DELETE FROM fixed_asset_books WHERE asset_id = ?", [createdAssetId]);
        await db.execute("DELETE FROM fixed_assets WHERE id = ?", [createdAssetId]);
      }
      if (createdCategoryId > 0) {
        await db.execute("DELETE FROM fixed_asset_categories WHERE id = ?", [createdCategoryId]);
      }
      if (createdAssetAccountId > 0) {
        await db.execute("DELETE FROM accounts WHERE id = ?", [createdAssetAccountId]);
      }
      if (createdCashAccountId > 0) {
        await db.execute("DELETE FROM accounts WHERE id = ?", [createdCashAccountId]);
      }
      if (deniedOutletId > 0) {
        await db.execute("DELETE FROM outlets WHERE id = ?", [deniedOutletId]);
      }
      if (restrictedUserId > 0) {
        await db.execute("DELETE FROM user_role_assignments WHERE user_id = ?", [restrictedUserId]);
        await db.execute("DELETE FROM users WHERE id = ?", [restrictedUserId]);
      }
    }
  }
);

test(
  "fixed asset lifecycle: duplicate acquisition returns canonical journal_batch_id",
  { timeout: TEST_TIMEOUT_MS, concurrency: false },
  async () => {
    if (typeof loadEnvFile === "function" && existsSync(ENV_PATH)) {
      loadEnvFile(ENV_PATH);
    }

    const db = testContext.db;
    let createdAssetId = 0;
    let createdCategoryId = 0;
    let createdAssetAccountId = 0;
    let createdCashAccountId = 0;

    const companyCode = readEnv("JP_COMPANY_CODE", "JP");
    const outletCode = readEnv("JP_OUTLET_CODE", "MAIN");
    const ownerEmail = readEnv("JP_OWNER_EMAIL").toLowerCase();
    const ownerPassword = readEnv("JP_OWNER_PASSWORD");
    const runId = Date.now().toString(36);
    const idempotentKey = `canon-dup-${runId}`;

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
        throw new Error("owner fixture not found");
      }

      const companyId = Number(owner.company_id);
      const outletId = Number(owner.outlet_id);
      const baseUrl = testContext.baseUrl;

      const eventDate = await getOpenFiscalYearDate(db, companyId);

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
        [companyId, `CAT-${runId}`, `Canon ${runId}`]
      );
      createdCategoryId = Number(categoryResult.insertId);

      const [assetAccountResult] = await db.execute(
        `INSERT INTO accounts (company_id, code, name) VALUES (?, ?, ?)`,
        [companyId, `FA-${runId}`, `Fixed Asset ${runId}`]
      );
      createdAssetAccountId = Number(assetAccountResult.insertId);

      const [cashAccountResult] = await db.execute(
        `INSERT INTO accounts (company_id, code, name) VALUES (?, ?, ?)`,
        [companyId, `CASH-${runId}`, `Cash ${runId}`]
      );
      createdCashAccountId = Number(cashAccountResult.insertId);

      const [assetResult] = await db.execute(
        `INSERT INTO fixed_assets (company_id, outlet_id, category_id, name, purchase_cost, is_active)
         VALUES (?, ?, ?, ?, 10000000, 1)`,
        [companyId, outletId, createdCategoryId, `Canon Asset ${runId}`]
      );
      createdAssetId = Number(assetResult.insertId);

      const firstResponse = await fetch(`${baseUrl}/api/accounts/fixed-assets/${createdAssetId}/acquisition`, {
        method: "POST",
        headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
        body: JSON.stringify({
          event_date: eventDate,
          cost: 10000000,
          useful_life_months: 60,
          salvage_value: 0,
          asset_account_id: createdAssetAccountId,
          offset_account_id: createdCashAccountId,
          idempotency_key: idempotentKey
        })
      });
      assert.equal(firstResponse.status, 201);
      const firstBody = await firstResponse.json();
      const originalEventId = firstBody.data.event_id;
      const originalBatchId = firstBody.data.journal_batch_id;
      assert.ok(originalBatchId > 0, "Original should have valid journal batch id");

      const dupResponse = await fetch(`${baseUrl}/api/accounts/fixed-assets/${createdAssetId}/acquisition`, {
        method: "POST",
        headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
        body: JSON.stringify({
          event_date: eventDate,
          cost: 99999999,
          useful_life_months: 12,
          asset_account_id: createdAssetAccountId,
          offset_account_id: createdCashAccountId,
          idempotency_key: idempotentKey
        })
      });
      assert.equal(dupResponse.status, 201);
      const dupBody = await dupResponse.json();
      assert.equal(dupBody.data.duplicate, true, "Should be marked duplicate");
      assert.equal(dupBody.data.event_id, originalEventId, "Event id should match original");
      assert.equal(dupBody.data.journal_batch_id, originalBatchId, "Journal batch id should be canonical");
      assert.ok(dupBody.data.journal_batch_id > 0, "Duplicate should return original batch id, not zero");

      const [idempotencyRows] = await db.execute(
        `SELECT COUNT(*) AS cnt FROM fixed_asset_events
         WHERE company_id = ? AND asset_id = ? AND idempotency_key = ?`,
        [companyId, createdAssetId, idempotentKey]
      );
      assert.equal(Number(idempotencyRows[0].cnt), 1, "Exactly one event for idempotency key");

    } finally {
      // Note: journal_lines and journal_batches are immutable (BEFORE DELETE triggers)
      // Accounts cannot be deleted when referenced by journal_lines (FK constraint)
      if (createdAssetId > 0) {
        await db.execute("DELETE FROM asset_depreciation_plans WHERE asset_id = ?", [createdAssetId]);
        await db.execute("DELETE FROM fixed_asset_disposals WHERE asset_id = ?", [createdAssetId]);
        await db.execute("DELETE FROM fixed_asset_events WHERE asset_id = ?", [createdAssetId]);
        await db.execute("DELETE FROM fixed_asset_books WHERE asset_id = ?", [createdAssetId]);
        await db.execute("DELETE FROM fixed_assets WHERE id = ?", [createdAssetId]);
      }
      if (createdCategoryId > 0) {
        await db.execute("DELETE FROM fixed_asset_categories WHERE id = ?", [createdCategoryId]);
      }
      // Note: Accounts are intentionally not deleted - they may be referenced by journal_lines
    }
  }
);

test(
  "fixed asset lifecycle: duplicate disposal returns canonical gain_loss and journal_batch_id",
  { timeout: TEST_TIMEOUT_MS, concurrency: false },
  async () => {
    if (typeof loadEnvFile === "function" && existsSync(ENV_PATH)) {
      loadEnvFile(ENV_PATH);
    }

    const db = testContext.db;
    let createdAssetId = 0;
    let createdCategoryId = 0;
    let createdAssetAccountId = 0;
    let createdCashAccountId = 0;
    let createdExpenseAccountId = 0;
    let createdLossAccountId = 0;
    let createdDisposalExpenseAccountId = 0;

    const companyCode = readEnv("JP_COMPANY_CODE", "JP");
    const outletCode = readEnv("JP_OUTLET_CODE", "MAIN");
    const ownerEmail = readEnv("JP_OWNER_EMAIL").toLowerCase();
    const ownerPassword = readEnv("JP_OWNER_PASSWORD");
    const runId = Date.now().toString(36);
    const idempotentKey = `disp-dup-${runId}`;

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
        throw new Error("owner fixture not found");
      }

      const companyId = Number(owner.company_id);
      const outletId = Number(owner.outlet_id);
      const baseUrl = testContext.baseUrl;

      const eventDate = await getOpenFiscalYearDate(db, companyId);

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
        [companyId, `CAT-${runId}`, `Dup Disp ${runId}`]
      );
      createdCategoryId = Number(categoryResult.insertId);

      const [assetAccountResult] = await db.execute(
        `INSERT INTO accounts (company_id, code, name) VALUES (?, ?, ?)`,
        [companyId, `FA-${runId}`, `Fixed Asset ${runId}`]
      );
      createdAssetAccountId = Number(assetAccountResult.insertId);

      const [cashAccountResult] = await db.execute(
        `INSERT INTO accounts (company_id, code, name) VALUES (?, ?, ?)`,
        [companyId, `CASH-${runId}`, `Cash ${runId}`]
      );
      createdCashAccountId = Number(cashAccountResult.insertId);

      const [expenseAccountResult] = await db.execute(
        `INSERT INTO accounts (company_id, code, name) VALUES (?, ?, ?)`,
        [companyId, `EXP-${runId}`, `Expense ${runId}`]
      );
      createdExpenseAccountId = Number(expenseAccountResult.insertId);

      const [lossAccountResult] = await db.execute(
        `INSERT INTO accounts (company_id, code, name) VALUES (?, ?, ?)`,
        [companyId, `LOSS-${runId}`, `Loss ${runId}`]
      );
      createdLossAccountId = Number(lossAccountResult.insertId);

      const [disposalExpenseAccountResult] = await db.execute(
        `INSERT INTO accounts (company_id, code, name) VALUES (?, ?, ?)`,
        [companyId, `DISP-EXP-${runId}`, `Disposal Expense ${runId}`]
      );
      createdDisposalExpenseAccountId = Number(disposalExpenseAccountResult.insertId);

      const [assetResult] = await db.execute(
        `INSERT INTO fixed_assets (company_id, outlet_id, category_id, name, purchase_cost, is_active)
         VALUES (?, ?, ?, ?, 10000000, 1)`,
        [companyId, outletId, createdCategoryId, `Dup Disp Asset ${runId}`]
      );
      createdAssetId = Number(assetResult.insertId);

      const acqResponse = await fetch(`${baseUrl}/api/accounts/fixed-assets/${createdAssetId}/acquisition`, {
        method: "POST",
        headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
        body: JSON.stringify({
          event_date: eventDate,
          cost: 10000000,
          useful_life_months: 60,
          salvage_value: 0,
          asset_account_id: createdAssetAccountId,
          offset_account_id: createdCashAccountId
        })
      });
      assert.equal(acqResponse.status, 201);

      const firstDispResponse = await fetch(`${baseUrl}/api/accounts/fixed-assets/${createdAssetId}/disposal`, {
        method: "POST",
        headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
        body: JSON.stringify({
          disposal_date: eventDate,
          disposal_type: "SALE",
          proceeds: 6000000,
          disposal_cost: 100000,
          cash_account_id: createdCashAccountId,
          asset_account_id: createdAssetAccountId,
          accum_depr_account_id: createdExpenseAccountId,
          accum_impairment_account_id: createdExpenseAccountId,
          loss_account_id: createdLossAccountId,
          disposal_expense_account_id: createdDisposalExpenseAccountId,
          idempotency_key: idempotentKey,
          notes: "First disposal attempt"
        })
      });
      assert.equal(firstDispResponse.status, 201);
      const firstDispBody = await firstDispResponse.json();
      const originalEventId = firstDispBody.data.event_id;
      const originalBatchId = firstDispBody.data.journal_batch_id;
      const originalGainLoss = firstDispBody.data.disposal.gain_loss;
      assert.ok(originalBatchId > 0, "Original should have valid journal batch id");

      const dupDispResponse = await fetch(`${baseUrl}/api/accounts/fixed-assets/${createdAssetId}/disposal`, {
        method: "POST",
        headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
        body: JSON.stringify({
          disposal_date: eventDate,
          disposal_type: "SALE",
          proceeds: 9999999,
          disposal_cost: 999999,
          cash_account_id: createdCashAccountId,
          asset_account_id: createdAssetAccountId,
          accum_depr_account_id: createdExpenseAccountId,
          accum_impairment_account_id: createdExpenseAccountId,
          loss_account_id: createdLossAccountId,
          disposal_expense_account_id: createdDisposalExpenseAccountId,
          idempotency_key: idempotentKey,
          notes: "Altered payload - should be ignored"
        })
      });
      assert.equal(dupDispResponse.status, 200, "Duplicate retry should return 200");
      const dupDispBody = await dupDispResponse.json();
      assert.equal(dupDispBody.data.duplicate, true, "Should be marked duplicate");
      assert.equal(dupDispBody.data.event_id, originalEventId, "Event id should match original");
      assert.equal(dupDispBody.data.journal_batch_id, originalBatchId, "Journal batch id should be canonical");
      assert.ok(dupDispBody.data.journal_batch_id > 0, "Duplicate should return original batch id, not zero");
      assert.equal(dupDispBody.data.disposal.gain_loss, originalGainLoss, "Gain/loss should be canonical from first request");

      const [idempotencyRows] = await db.execute(
        `SELECT COUNT(*) AS cnt FROM fixed_asset_events
         WHERE company_id = ? AND asset_id = ? AND idempotency_key = ?`,
        [companyId, createdAssetId, idempotentKey]
      );
      assert.equal(Number(idempotencyRows[0].cnt), 1, "Exactly one event for idempotency key");

    } finally {
      // Note: journal_lines and journal_batches are immutable (BEFORE DELETE triggers)
      // Accounts cannot be deleted when referenced by journal_lines (FK constraint)
      if (createdAssetId > 0) {
        await db.execute("DELETE FROM fixed_asset_disposals WHERE asset_id = ?", [createdAssetId]);
        await db.execute("DELETE FROM fixed_asset_events WHERE asset_id = ?", [createdAssetId]);
        await db.execute("DELETE FROM fixed_asset_books WHERE asset_id = ?", [createdAssetId]);
        await db.execute("DELETE FROM fixed_assets WHERE id = ?", [createdAssetId]);
      }
      if (createdCategoryId > 0) {
        await db.execute("DELETE FROM fixed_asset_categories WHERE id = ?", [createdCategoryId]);
      }
      // Note: Accounts are intentionally not deleted - they may be referenced by journal_lines
    }
  }
);

test(
  "fixed asset lifecycle: cross-asset disposal idempotency returns conflict",
  { timeout: TEST_TIMEOUT_MS, concurrency: false },
  async () => {
    if (typeof loadEnvFile === "function" && existsSync(ENV_PATH)) {
      loadEnvFile(ENV_PATH);
    }

    const db = testContext.db;
    let createdAssetId1 = 0;
    let createdAssetId2 = 0;
    let createdCategoryId = 0;
    let createdAssetAccountId = 0;
    let createdCashAccountId = 0;
    let createdExpenseAccountId = 0;
    let createdLossAccountId = 0;

    const companyCode = readEnv("JP_COMPANY_CODE", "JP");
    const outletCode = readEnv("JP_OUTLET_CODE", "MAIN");
    const ownerEmail = readEnv("JP_OWNER_EMAIL").toLowerCase();
    const ownerPassword = readEnv("JP_OWNER_PASSWORD");
    const runId = Date.now().toString(36);
    const sharedIdempotencyKey = `cross-asset-${runId}`;

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
        throw new Error("owner fixture not found");
      }

      const companyId = Number(owner.company_id);
      const outletId = Number(owner.outlet_id);
      const baseUrl = testContext.baseUrl;

      const eventDate = await getOpenFiscalYearDate(db, companyId);

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
        [companyId, `CAT-${runId}`, `Cross Asset ${runId}`]
      );
      createdCategoryId = Number(categoryResult.insertId);

      const [assetAccountResult] = await db.execute(
        `INSERT INTO accounts (company_id, code, name) VALUES (?, ?, ?)`,
        [companyId, `FA-${runId}`, `Fixed Asset ${runId}`]
      );
      createdAssetAccountId = Number(assetAccountResult.insertId);

      const [cashAccountResult] = await db.execute(
        `INSERT INTO accounts (company_id, code, name) VALUES (?, ?, ?)`,
        [companyId, `CASH-${runId}`, `Cash ${runId}`]
      );
      createdCashAccountId = Number(cashAccountResult.insertId);

      const [expenseAccountResult] = await db.execute(
        `INSERT INTO accounts (company_id, code, name) VALUES (?, ?, ?)`,
        [companyId, `EXP-${runId}`, `Expense ${runId}`]
      );
      createdExpenseAccountId = Number(expenseAccountResult.insertId);

      const [lossAccountResult] = await db.execute(
        `INSERT INTO accounts (company_id, code, name) VALUES (?, ?, ?)`,
        [companyId, `LOSS-${runId}`, `Loss ${runId}`]
      );
      createdLossAccountId = Number(lossAccountResult.insertId);

      const [assetResult1] = await db.execute(
        `INSERT INTO fixed_assets (company_id, outlet_id, category_id, name, purchase_cost, is_active)
         VALUES (?, ?, ?, ?, 10000000, 1)`,
        [companyId, outletId, createdCategoryId, `Asset1 ${runId}`]
      );
      createdAssetId1 = Number(assetResult1.insertId);

      const [assetResult2] = await db.execute(
        `INSERT INTO fixed_assets (company_id, outlet_id, category_id, name, purchase_cost, is_active)
         VALUES (?, ?, ?, ?, 10000000, 1)`,
        [companyId, outletId, createdCategoryId, `Asset2 ${runId}`]
      );
      createdAssetId2 = Number(assetResult2.insertId);

      const acqResponse1 = await fetch(`${baseUrl}/api/accounts/fixed-assets/${createdAssetId1}/acquisition`, {
        method: "POST",
        headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
        body: JSON.stringify({
          event_date: eventDate,
          cost: 10000000,
          useful_life_months: 60,
          salvage_value: 0,
          asset_account_id: createdAssetAccountId,
          offset_account_id: createdCashAccountId
        })
      });
      assert.equal(acqResponse1.status, 201);

      const acqResponse2 = await fetch(`${baseUrl}/api/accounts/fixed-assets/${createdAssetId2}/acquisition`, {
        method: "POST",
        headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
        body: JSON.stringify({
          event_date: eventDate,
          cost: 10000000,
          useful_life_months: 60,
          salvage_value: 0,
          asset_account_id: createdAssetAccountId,
          offset_account_id: createdCashAccountId
        })
      });
      assert.equal(acqResponse2.status, 201);

      const firstDispResponse = await fetch(`${baseUrl}/api/accounts/fixed-assets/${createdAssetId1}/disposal`, {
        method: "POST",
        headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
        body: JSON.stringify({
          disposal_date: eventDate,
          disposal_type: "SALE",
          proceeds: 6000000,
          disposal_cost: 0,
          cash_account_id: createdCashAccountId,
          asset_account_id: createdAssetAccountId,
          accum_depr_account_id: createdExpenseAccountId,
          loss_account_id: createdLossAccountId,
          idempotency_key: sharedIdempotencyKey,
          notes: "First asset disposal"
        })
      });
      assert.equal(firstDispResponse.status, 201);

      const crossAssetDispResponse = await fetch(`${baseUrl}/api/accounts/fixed-assets/${createdAssetId2}/disposal`, {
        method: "POST",
        headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
        body: JSON.stringify({
          disposal_date: eventDate,
          disposal_type: "SALE",
          proceeds: 8000000,
          disposal_cost: 0,
          cash_account_id: createdCashAccountId,
          asset_account_id: createdAssetAccountId,
          accum_depr_account_id: createdExpenseAccountId,
          loss_account_id: createdLossAccountId,
          idempotency_key: sharedIdempotencyKey,
          notes: "Different asset - should fail"
        })
      });
      assert.equal(crossAssetDispResponse.status, 409, "Cross-asset idempotency should return conflict error");
      const crossBody = await crossAssetDispResponse.json();
      assert.equal(crossBody.error?.code, "CONFLICT", "Error code should be CONFLICT");
      assert.equal(crossBody.error?.message, "Duplicate event", "Error message should be Duplicate event");
      assert.equal(crossBody.data, undefined, "No data should be exposed in conflict response");
      assert.equal(crossBody.data?.event_id, undefined, "event_id must not be leaked");
      assert.equal(crossBody.data?.journal_batch_id, undefined, "journal_batch_id must not be leaked");
      assert.equal(crossBody.data?.disposal, undefined, "disposal must not be leaked");

    } finally {
      // Note: journal_lines and journal_batches are immutable (BEFORE DELETE triggers)
      // Accounts cannot be deleted when referenced by journal_lines (FK constraint)
      if (createdAssetId1 > 0) {
        await db.execute("DELETE FROM fixed_asset_disposals WHERE asset_id = ?", [createdAssetId1]);
        await db.execute("DELETE FROM fixed_asset_events WHERE asset_id = ?", [createdAssetId1]);
        await db.execute("DELETE FROM fixed_asset_books WHERE asset_id = ?", [createdAssetId1]);
        await db.execute("DELETE FROM fixed_assets WHERE id = ?", [createdAssetId1]);
      }
      if (createdAssetId2 > 0) {
        await db.execute("DELETE FROM fixed_asset_disposals WHERE asset_id = ?", [createdAssetId2]);
        await db.execute("DELETE FROM fixed_asset_events WHERE asset_id = ?", [createdAssetId2]);
        await db.execute("DELETE FROM fixed_asset_books WHERE asset_id = ?", [createdAssetId2]);
        await db.execute("DELETE FROM fixed_assets WHERE id = ?", [createdAssetId2]);
      }
      if (createdCategoryId > 0) {
        await db.execute("DELETE FROM fixed_asset_categories WHERE id = ?", [createdCategoryId]);
      }
      // Note: Accounts are intentionally not deleted - they may be referenced by journal_lines
    }
  }
);

test(
  "fixed asset lifecycle: cross-asset transfer idempotency returns conflict",
  { timeout: TEST_TIMEOUT_MS, concurrency: false },
  async () => {
    if (typeof loadEnvFile === "function" && existsSync(ENV_PATH)) {
      loadEnvFile(ENV_PATH);
    }

    const db = testContext.db;
    let createdAssetId1 = 0;
    let createdAssetId2 = 0;
    let createdCategoryId = 0;
    let createdAssetAccountId = 0;
    let createdCashAccountId = 0;
    let targetOutletId = 0;

    const companyCode = readEnv("JP_COMPANY_CODE", "JP");
    const outletCode = readEnv("JP_OUTLET_CODE", "MAIN");
    const ownerEmail = readEnv("JP_OWNER_EMAIL").toLowerCase();
    const ownerPassword = readEnv("JP_OWNER_PASSWORD");
    const runId = Date.now().toString(36);
    const sharedIdempotencyKey = `cross-asset-transfer-${runId}`;

    try {
      const [ownerRows] = await db.execute(
        `SELECT u.company_id, u.id as user_id, o.id AS outlet_id
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
        throw new Error("owner fixture not found");
      }

      const companyId = Number(owner.company_id);
      const outletId = Number(owner.outlet_id);
      const userId = Number(owner.user_id);
      const baseUrl = testContext.baseUrl;

      const eventDate = await getOpenFiscalYearDate(db, companyId);

      const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ companyCode, email: ownerEmail, password: ownerPassword })
      });
      assert.equal(loginResponse.status, 200);
      const { access_token: accessToken } = (await loginResponse.json()).data;

      const [targetOutletResult] = await db.execute(
        `INSERT INTO outlets (company_id, code, name) VALUES (?, ?, ?)`,
        [companyId, `TARGET-${runId}`, `Target ${runId}`]
      );
      targetOutletId = Number(targetOutletResult.insertId);
      await db.execute(
        `INSERT INTO user_outlets (user_id, outlet_id) VALUES (?, ?)`,
        [userId, targetOutletId]
      );

      const [categoryResult] = await db.execute(
        `INSERT INTO fixed_asset_categories (company_id, code, name, depreciation_method, useful_life_months, residual_value_pct, is_active)
         VALUES (?, ?, ?, 'STRAIGHT_LINE', 60, 5, 1)`,
        [companyId, `CAT-${runId}`, `Transfer ${runId}`]
      );
      createdCategoryId = Number(categoryResult.insertId);

      const [assetAccountResult] = await db.execute(
        `INSERT INTO accounts (company_id, code, name) VALUES (?, ?, ?)`,
        [companyId, `FA-${runId}`, `Fixed Asset ${runId}`]
      );
      createdAssetAccountId = Number(assetAccountResult.insertId);

      const [cashAccountResult] = await db.execute(
        `INSERT INTO accounts (company_id, code, name) VALUES (?, ?, ?)`,
        [companyId, `CASH-${runId}`, `Cash ${runId}`]
      );
      createdCashAccountId = Number(cashAccountResult.insertId);

      const [assetResult1] = await db.execute(
        `INSERT INTO fixed_assets (company_id, outlet_id, category_id, name, purchase_cost, is_active)
         VALUES (?, ?, ?, ?, 10000000, 1)`,
        [companyId, outletId, createdCategoryId, `Asset1 ${runId}`]
      );
      createdAssetId1 = Number(assetResult1.insertId);

      const [assetResult2] = await db.execute(
        `INSERT INTO fixed_assets (company_id, outlet_id, category_id, name, purchase_cost, is_active)
         VALUES (?, ?, ?, ?, 10000000, 1)`,
        [companyId, outletId, createdCategoryId, `Asset2 ${runId}`]
      );
      createdAssetId2 = Number(assetResult2.insertId);

      const acqResponse1 = await fetch(`${baseUrl}/api/accounts/fixed-assets/${createdAssetId1}/acquisition`, {
        method: "POST",
        headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
        body: JSON.stringify({
          event_date: eventDate,
          cost: 10000000,
          useful_life_months: 60,
          salvage_value: 0,
          asset_account_id: createdAssetAccountId,
          offset_account_id: createdCashAccountId
        })
      });
      assert.equal(acqResponse1.status, 201);

      const acqResponse2 = await fetch(`${baseUrl}/api/accounts/fixed-assets/${createdAssetId2}/acquisition`, {
        method: "POST",
        headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
        body: JSON.stringify({
          event_date: eventDate,
          cost: 10000000,
          useful_life_months: 60,
          salvage_value: 0,
          asset_account_id: createdAssetAccountId,
          offset_account_id: createdCashAccountId
        })
      });
      assert.equal(acqResponse2.status, 201);

      const firstTransferResponse = await fetch(`${baseUrl}/api/accounts/fixed-assets/${createdAssetId1}/transfer`, {
        method: "POST",
        headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
        body: JSON.stringify({
          to_outlet_id: targetOutletId,
          transfer_date: eventDate,
          idempotency_key: sharedIdempotencyKey,
          notes: "First asset transfer"
        })
      });
      assert.equal(firstTransferResponse.status, 201);

      const crossAssetTransferResponse = await fetch(`${baseUrl}/api/accounts/fixed-assets/${createdAssetId2}/transfer`, {
        method: "POST",
        headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
        body: JSON.stringify({
          to_outlet_id: targetOutletId,
          transfer_date: eventDate,
          idempotency_key: sharedIdempotencyKey,
          notes: "Different asset - should fail"
        })
      });
      assert.equal(crossAssetTransferResponse.status, 409, "Cross-asset idempotency should return conflict error");
      const crossBody = await crossAssetTransferResponse.json();
      assert.equal(crossBody.error?.code, "CONFLICT", "Error code should be CONFLICT");
      assert.equal(crossBody.error?.message, "Duplicate event", "Error message should be Duplicate event");
      assert.equal(crossBody.data, undefined, "No data should be exposed in conflict response");
      assert.equal(crossBody.data?.event_id, undefined, "event_id must not be leaked");
      assert.equal(crossBody.data?.to_outlet_id, undefined, "to_outlet_id must not be leaked");
      assert.equal(crossBody.data?.journal_batch_id, undefined, "journal_batch_id must not be leaked");

    } finally {
      // Note: journal_lines and journal_batches are immutable (BEFORE DELETE triggers)
      // Accounts cannot be deleted when referenced by journal_lines (FK constraint)
      if (createdAssetId1 > 0) {
        await db.execute("DELETE FROM fixed_asset_events WHERE asset_id = ?", [createdAssetId1]);
        await db.execute("DELETE FROM fixed_asset_books WHERE asset_id = ?", [createdAssetId1]);
        await db.execute("DELETE FROM fixed_assets WHERE id = ?", [createdAssetId1]);
      }
      if (createdAssetId2 > 0) {
        await db.execute("DELETE FROM fixed_asset_events WHERE asset_id = ?", [createdAssetId2]);
        await db.execute("DELETE FROM fixed_asset_books WHERE asset_id = ?", [createdAssetId2]);
        await db.execute("DELETE FROM fixed_assets WHERE id = ?", [createdAssetId2]);
      }
      if (targetOutletId > 0) {
        await db.execute("DELETE FROM user_outlets WHERE outlet_id = ?", [targetOutletId]);
        await db.execute("DELETE FROM outlets WHERE id = ?", [targetOutletId]);
      }
      if (createdCategoryId > 0) {
        await db.execute("DELETE FROM fixed_asset_categories WHERE id = ?", [createdCategoryId]);
      }
      // Note: Accounts are intentionally not deleted - they may be referenced by journal_lines
    }
  }
);

test(
  "fixed asset lifecycle: same-asset transfer with acquisition idempotency key returns conflict",
  { timeout: TEST_TIMEOUT_MS, concurrency: false },
  async () => {
    if (typeof loadEnvFile === "function" && existsSync(ENV_PATH)) {
      loadEnvFile(ENV_PATH);
    }

    const db = testContext.db;
    let createdAssetId = 0;
    let createdCategoryId = 0;
    let createdAssetAccountId = 0;
    let createdCashAccountId = 0;

    const companyCode = readEnv("JP_COMPANY_CODE", "JP");
    const outletCode = readEnv("JP_OUTLET_CODE", "MAIN");
    const ownerEmail = readEnv("JP_OWNER_EMAIL").toLowerCase();
    const ownerPassword = readEnv("JP_OWNER_PASSWORD");
    const runId = Date.now().toString(36);
    const sharedIdempotencyKey = `same-asset-type-collision-${runId}`;

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
        throw new Error("owner fixture not found");
      }

      const companyId = Number(owner.company_id);
      const outletId = Number(owner.outlet_id);
      const baseUrl = testContext.baseUrl;

      const eventDate = await getOpenFiscalYearDate(db, companyId);

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
        [companyId, `CAT-${runId}`, `Type Collision ${runId}`]
      );
      createdCategoryId = Number(categoryResult.insertId);

      const [assetAccountResult] = await db.execute(
        `INSERT INTO accounts (company_id, code, name) VALUES (?, ?, ?)`,
        [companyId, `FA-${runId}`, `Fixed Asset ${runId}`]
      );
      createdAssetAccountId = Number(assetAccountResult.insertId);

      const [cashAccountResult] = await db.execute(
        `INSERT INTO accounts (company_id, code, name) VALUES (?, ?, ?)`,
        [companyId, `CASH-${runId}`, `Cash ${runId}`]
      );
      createdCashAccountId = Number(cashAccountResult.insertId);

      const [assetResult] = await db.execute(
        `INSERT INTO fixed_assets (company_id, outlet_id, category_id, name, purchase_cost, is_active)
         VALUES (?, ?, ?, ?, 10000000, 1)`,
        [companyId, outletId, createdCategoryId, `Asset ${runId}`]
      );
      createdAssetId = Number(assetResult.insertId);

      const acqResponse = await fetch(`${baseUrl}/api/accounts/fixed-assets/${createdAssetId}/acquisition`, {
        method: "POST",
        headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
        body: JSON.stringify({
          event_date: eventDate,
          cost: 10000000,
          useful_life_months: 60,
          salvage_value: 0,
          asset_account_id: createdAssetAccountId,
          offset_account_id: createdCashAccountId,
          idempotency_key: sharedIdempotencyKey,
          notes: "Acquisition with shared key"
        })
      });
      assert.equal(acqResponse.status, 201, "Acquisition should succeed");

      const transferWithAcqKeyResponse = await fetch(`${baseUrl}/api/accounts/fixed-assets/${createdAssetId}/transfer`, {
        method: "POST",
        headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
        body: JSON.stringify({
          to_outlet_id: outletId,
          transfer_date: eventDate,
          idempotency_key: sharedIdempotencyKey,
          notes: "Transfer using acquisition key - should fail"
        })
      });
      assert.equal(transferWithAcqKeyResponse.status, 409, "Same-asset non-transfer key reuse should return conflict");
      const conflictBody = await transferWithAcqKeyResponse.json();
      assert.equal(conflictBody.error?.code, "CONFLICT", "Error code should be CONFLICT");
      assert.equal(conflictBody.error?.message, "Duplicate event", "Error message should be Duplicate event");
      assert.equal(conflictBody.data, undefined, "No data should be exposed in conflict response");
      assert.equal(conflictBody.data?.event_id, undefined, "event_id must not be leaked");
      assert.equal(conflictBody.data?.to_outlet_id, undefined, "to_outlet_id must not be leaked");
      assert.equal(conflictBody.data?.journal_batch_id, undefined, "journal_batch_id must not be leaked");

    } finally {
      // Note: journal_lines and journal_batches are immutable (BEFORE DELETE triggers)
      // Accounts cannot be deleted when referenced by journal_lines (FK constraint)
      if (createdAssetId > 0) {
        await db.execute("DELETE FROM fixed_asset_events WHERE asset_id = ?", [createdAssetId]);
        await db.execute("DELETE FROM fixed_asset_books WHERE asset_id = ?", [createdAssetId]);
        await db.execute("DELETE FROM fixed_assets WHERE id = ?", [createdAssetId]);
      }
      if (createdCategoryId > 0) {
        await db.execute("DELETE FROM fixed_asset_categories WHERE id = ?", [createdCategoryId]);
      }
      // Note: Accounts are intentionally not deleted - they may be referenced by journal_lines
    }
  }
);

test(
  "fixed asset lifecycle: same-asset transfer idempotent retry returns duplicate success",
  { timeout: TEST_TIMEOUT_MS, concurrency: false },
  async () => {
    if (typeof loadEnvFile === "function" && existsSync(ENV_PATH)) {
      loadEnvFile(ENV_PATH);
    }

    const db = testContext.db;
    let createdAssetId = 0;
    let createdCategoryId = 0;
    let createdAssetAccountId = 0;
    let createdCashAccountId = 0;
    let targetOutletId = 0;

    const companyCode = readEnv("JP_COMPANY_CODE", "JP");
    const outletCode = readEnv("JP_OUTLET_CODE", "MAIN");
    const ownerEmail = readEnv("JP_OWNER_EMAIL").toLowerCase();
    const ownerPassword = readEnv("JP_OWNER_PASSWORD");
    const runId = Date.now().toString(36);
    const idempotencyKey = `transfer-retry-${runId}`;

    try {
      const [ownerRows] = await db.execute(
        `SELECT u.company_id, u.id as user_id, o.id AS outlet_id
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
        throw new Error("owner fixture not found");
      }

      const companyId = Number(owner.company_id);
      const outletId = Number(owner.outlet_id);
      const userId = Number(owner.user_id);
      const baseUrl = testContext.baseUrl;

      const eventDate = await getOpenFiscalYearDate(db, companyId);

      const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ companyCode, email: ownerEmail, password: ownerPassword })
      });
      assert.equal(loginResponse.status, 200);
      const { access_token: accessToken } = (await loginResponse.json()).data;

      const [targetOutletResult] = await db.execute(
        `INSERT INTO outlets (company_id, code, name) VALUES (?, ?, ?)`,
        [companyId, `TARGET-${runId}`, `Target ${runId}`]
      );
      targetOutletId = Number(targetOutletResult.insertId);
      await db.execute(
        `INSERT INTO user_outlets (user_id, outlet_id) VALUES (?, ?)`,
        [userId, targetOutletId]
      );

      const [categoryResult] = await db.execute(
        `INSERT INTO fixed_asset_categories (company_id, code, name, depreciation_method, useful_life_months, residual_value_pct, is_active)
         VALUES (?, ?, ?, 'STRAIGHT_LINE', 60, 5, 1)`,
        [companyId, `CAT-${runId}`, `Retry ${runId}`]
      );
      createdCategoryId = Number(categoryResult.insertId);

      const [assetAccountResult] = await db.execute(
        `INSERT INTO accounts (company_id, code, name) VALUES (?, ?, ?)`,
        [companyId, `FA-${runId}`, `Fixed Asset ${runId}`]
      );
      createdAssetAccountId = Number(assetAccountResult.insertId);

      const [cashAccountResult] = await db.execute(
        `INSERT INTO accounts (company_id, code, name) VALUES (?, ?, ?)`,
        [companyId, `CASH-${runId}`, `Cash ${runId}`]
      );
      createdCashAccountId = Number(cashAccountResult.insertId);

      const [assetResult] = await db.execute(
        `INSERT INTO fixed_assets (company_id, outlet_id, category_id, name, purchase_cost, is_active)
         VALUES (?, ?, ?, ?, 10000000, 1)`,
        [companyId, outletId, createdCategoryId, `Asset ${runId}`]
      );
      createdAssetId = Number(assetResult.insertId);

      const acqResponse = await fetch(`${baseUrl}/api/accounts/fixed-assets/${createdAssetId}/acquisition`, {
        method: "POST",
        headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
        body: JSON.stringify({
          event_date: eventDate,
          cost: 10000000,
          useful_life_months: 60,
          salvage_value: 0,
          asset_account_id: createdAssetAccountId,
          offset_account_id: createdCashAccountId
        })
      });
      assert.equal(acqResponse.status, 201);

      const firstTransferResponse = await fetch(`${baseUrl}/api/accounts/fixed-assets/${createdAssetId}/transfer`, {
        method: "POST",
        headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
        body: JSON.stringify({
          to_outlet_id: targetOutletId,
          transfer_date: eventDate,
          idempotency_key: idempotencyKey,
          notes: "First transfer"
        })
      });
      assert.equal(firstTransferResponse.status, 201, "First transfer should succeed");
      const firstBody = await firstTransferResponse.json();
      assert.equal(firstBody.success, true);
      const firstEventId = firstBody.data.event_id;

      const retryTransferResponse = await fetch(`${baseUrl}/api/accounts/fixed-assets/${createdAssetId}/transfer`, {
        method: "POST",
        headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
        body: JSON.stringify({
          to_outlet_id: targetOutletId,
          transfer_date: eventDate,
          idempotency_key: idempotencyKey,
          notes: "Retry transfer"
        })
      });
      assert.equal(retryTransferResponse.status, 201, "Retry transfer should return duplicate success");
      const retryBody = await retryTransferResponse.json();
      assert.equal(retryBody.success, true);
      assert.equal(retryBody.data.duplicate, true, "duplicate flag should be true");
      assert.equal(retryBody.data.event_id, firstEventId, "Should return canonical event_id");
      assert.equal(retryBody.data.to_outlet_id, targetOutletId, "Should return correct to_outlet_id");

    } finally {
      // Note: journal_lines and journal_batches are immutable (BEFORE DELETE triggers)
      // Accounts cannot be deleted when referenced by journal_lines (FK constraint)
      if (createdAssetId > 0) {
        await db.execute("DELETE FROM fixed_asset_events WHERE asset_id = ?", [createdAssetId]);
        await db.execute("DELETE FROM fixed_asset_books WHERE asset_id = ?", [createdAssetId]);
        await db.execute("DELETE FROM fixed_assets WHERE id = ?", [createdAssetId]);
      }
      if (targetOutletId > 0) {
        await db.execute("DELETE FROM user_outlets WHERE outlet_id = ?", [targetOutletId]);
        await db.execute("DELETE FROM outlets WHERE id = ?", [targetOutletId]);
      }
      if (createdCategoryId > 0) {
        await db.execute("DELETE FROM fixed_asset_categories WHERE id = ?", [createdCategoryId]);
      }
      // Note: Accounts are intentionally not deleted - they may be referenced by journal_lines
    }
  }
);

test(
  "fixed asset lifecycle: void legacy FA_DISPOSAL restores pre-disposal book",
  { timeout: TEST_TIMEOUT_MS, concurrency: false },
  async () => {
    if (typeof loadEnvFile === "function" && existsSync(ENV_PATH)) {
      loadEnvFile(ENV_PATH);
    }

    const db = testContext.db;
    let createdAssetId = 0;
    let createdCategoryId = 0;
    let createdExpenseAccountId = 0;
    let createdAssetAccountId = 0;
    let createdCashAccountId = 0;
    let createdAcqEventId = 0;
    let createdDispEventId = 0;
    let acqJournalBatchId = 0;
    let dispJournalBatchId = 0;

    const companyCode = readEnv("JP_COMPANY_CODE", "JP");
    const outletCode = readEnv("JP_OUTLET_CODE", "MAIN");
    const ownerEmail = readEnv("JP_OWNER_EMAIL").toLowerCase();
    const ownerPassword = readEnv("JP_OWNER_PASSWORD");
    const runId = Date.now().toString(36);

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
        throw new Error("owner fixture not found");
      }

      const companyId = Number(owner.company_id);
      const outletId = Number(owner.outlet_id);
      const baseUrl = testContext.baseUrl;
      const userId = Number(owner.id);

      const eventDate = await getOpenFiscalYearDate(db, companyId);

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
        [companyId, `CAT-${runId}`, `Legacy Disp ${runId}`]
      );
      createdCategoryId = Number(categoryResult.insertId);

      const [expenseAccountResult] = await db.execute(
        `INSERT INTO accounts (company_id, code, name) VALUES (?, ?, ?)`,
        [companyId, `FA-EXP-${runId}`, `FA Expense ${runId}`]
      );
      createdExpenseAccountId = Number(expenseAccountResult.insertId);

      const [assetAccountResult] = await db.execute(
        `INSERT INTO accounts (company_id, code, name) VALUES (?, ?, ?)`,
        [companyId, `FA-${runId}`, `Fixed Asset ${runId}`]
      );
      createdAssetAccountId = Number(assetAccountResult.insertId);

      const [cashAccountResult] = await db.execute(
        `INSERT INTO accounts (company_id, code, name) VALUES (?, ?, ?)`,
        [companyId, `CASH-${runId}`, `Cash ${runId}`]
      );
      createdCashAccountId = Number(cashAccountResult.insertId);

      const [assetResult] = await db.execute(
        `INSERT INTO fixed_assets (company_id, outlet_id, category_id, name, purchase_cost, is_active)
         VALUES (?, ?, ?, ?, 10000000, 1)`,
        [companyId, outletId, createdCategoryId, `Legacy Disp Asset ${runId}`]
      );
      createdAssetId = Number(assetResult.insertId);

      // Step 1: Seed legacy FA_ACQUISITION event (the pre-disposal history)
      const [acqBatchResult] = await db.execute(
        `INSERT INTO journal_batches (company_id, outlet_id, doc_type, doc_id, posted_at) VALUES (?, ?, ?, ?, ?)`,
        [companyId, outletId, "FA_ACQUISITION", createdAssetId, eventDate]
      );
      acqJournalBatchId = Number(acqBatchResult.insertId);

      await db.execute(
        `INSERT INTO journal_lines (journal_batch_id, company_id, outlet_id, account_id, line_date, debit, credit, description)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          acqJournalBatchId, companyId, outletId, createdAssetAccountId, eventDate, 10000000, 0, "Legacy FA Acq - Asset",
          acqJournalBatchId, companyId, outletId, createdCashAccountId, eventDate, 0, 10000000, "Legacy FA Acq - Offset"
        ]
      );

      const [acqEventResult] = await db.execute(
        `INSERT INTO fixed_asset_events (company_id, asset_id, event_type, event_date, outlet_id, journal_batch_id, status, idempotency_key, event_data, created_by)
         VALUES (?, ?, 'FA_ACQUISITION', ?, ?, ?, 'POSTED', ?, ?, ?)`,
        [companyId, createdAssetId, eventDate, outletId, acqJournalBatchId, `fa-acq-${runId}`, JSON.stringify({ cost: 10000000, useful_life_months: 60, salvage_value: 0 }), userId]
      );
      createdAcqEventId = Number(acqEventResult.insertId);

      await db.execute(
        `INSERT INTO fixed_asset_books (company_id, asset_id, cost_basis, accum_depreciation, accum_impairment, carrying_amount, as_of_date, last_event_id)
         VALUES (?, ?, ?, 0, 0, ?, ?, ?)`,
        [companyId, createdAssetId, 10000000, 10000000, eventDate, createdAcqEventId]
      );

      // Step 2: Seed legacy FA_DISPOSAL event
      const [dispBatchResult] = await db.execute(
        `INSERT INTO journal_batches (company_id, outlet_id, doc_type, doc_id, posted_at) VALUES (?, ?, ?, ?, ?)`,
        [companyId, outletId, "FA_DISPOSAL", createdAssetId, eventDate]
      );
      dispJournalBatchId = Number(dispBatchResult.insertId);

      const [dispEventResult] = await db.execute(
        `INSERT INTO fixed_asset_events (company_id, asset_id, event_type, event_date, outlet_id, journal_batch_id, status, idempotency_key, event_data, created_by)
         VALUES (?, ?, 'FA_DISPOSAL', ?, ?, ?, 'POSTED', ?, ?, ?)`,
        [companyId, createdAssetId, eventDate, outletId, dispJournalBatchId, `fa-disp-${runId}`, JSON.stringify({ disposal_type: "SALE", proceeds: 8000000, cost_removed: 10000000, depr_removed: 0, impairment_removed: 0, gain_loss: -2000000, cash_account_id: createdCashAccountId, asset_account_id: createdAssetAccountId, accum_depr_account_id: createdExpenseAccountId }), userId]
      );
      createdDispEventId = Number(dispEventResult.insertId);

      // Insert disposal record with valid event_id (FK-safe)
      await db.execute(
        `INSERT INTO fixed_asset_disposals (company_id, event_id, asset_id, proceeds, cost_removed, depr_removed, impairment_removed, disposal_cost, gain_loss, disposal_type, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'SALE', ?)`,
        [companyId, createdDispEventId, createdAssetId, 8000000, 10000000, 0, 0, 0, -2000000, `Legacy disposal ${runId}`]
      );

      // Update book to disposed state (use UPDATE, not INSERT - unique key on asset_id)
      await db.execute(
        `UPDATE fixed_asset_books SET cost_basis = 0, accum_depreciation = 0, accum_impairment = 0, carrying_amount = 0, as_of_date = ?, last_event_id = ? WHERE company_id = ? AND asset_id = ?`,
        [eventDate, createdDispEventId, companyId, createdAssetId]
      );

      // Mark asset as disposed
      await db.execute(
        `UPDATE fixed_assets SET disposed_at = ? WHERE id = ?`,
        [eventDate, createdAssetId]
      );

      // Step 3: Void the legacy FA_DISPOSAL event
      const voidResponse = await fetch(`${baseUrl}/api/accounts/fixed-assets/events/${createdDispEventId}/void`, {
        method: "POST",
        headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
        body: JSON.stringify({ void_reason: "Void legacy FA_DISPOSAL" })
      });
      assert.equal(voidResponse.status, 201, "Void legacy FA_DISPOSAL should succeed");
      const voidBody = await voidResponse.json();
      assert.equal(voidBody.success, true);
      assert.equal(voidBody.data.original_event_id, createdDispEventId);

      // Verify disposed_at cleared
      const [assetAfterVoid] = await db.execute(
        `SELECT disposed_at FROM fixed_assets WHERE id = ?`,
        [createdAssetId]
      );
      assert.equal(assetAfterVoid[0].disposed_at, null, "disposed_at should be cleared after void");

      // Verify book restored to pre-disposal values (from FA_ACQUISITION)
      const bookAfterVoid = await fetch(`${baseUrl}/api/accounts/fixed-assets/${createdAssetId}/book`, {
        headers: { authorization: `Bearer ${accessToken}` }
      });
      const bookData = await bookAfterVoid.json();
      assert.equal(bookData.data.cost_basis, 10000000, "Cost basis should be restored from acquisition");
      assert.equal(bookData.data.accum_depreciation, 0, "Accumulated depreciation should be restored");
      assert.equal(bookData.data.accum_impairment, 0, "Accumulated impairment should be restored");
      assert.equal(bookData.data.carrying_amount, 10000000, "Carrying amount should be restored");

    } finally {
      // Note: journal_lines and journal_batches are immutable (BEFORE DELETE triggers)
      // Legacy FA_ACQUISITION and FA_DISPOSAL events have their journals kept as historical record
      // Accounts cannot be deleted when referenced by journal_lines (FK constraint)
      if (createdAssetId > 0) {
        await db.execute("DELETE FROM fixed_asset_disposals WHERE asset_id = ?", [createdAssetId]);
        await db.execute("DELETE FROM fixed_asset_events WHERE asset_id = ?", [createdAssetId]);
        await db.execute("DELETE FROM fixed_asset_books WHERE asset_id = ?", [createdAssetId]);
        await db.execute("DELETE FROM fixed_assets WHERE id = ?", [createdAssetId]);
      }
      if (createdCategoryId > 0) {
        await db.execute("DELETE FROM fixed_asset_categories WHERE id = ?", [createdCategoryId]);
      }
      // Note: Accounts are intentionally not deleted - they may be referenced by journal_lines
    }
  }
);
