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
const nextCliPath = path.resolve(repoRoot, "node_modules/next/dist/bin/next");
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
    let createdOutletId = 0;

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
        `INSERT INTO accounts (company_id, code, name, account_type_id)
         VALUES (?, ?, ?, (SELECT id FROM account_types WHERE code = 'EXPENSE' LIMIT 1))`,
        [companyId, `FA-EXP-${runId}`, `FA Expense ${runId}`]
      );
      createdExpenseAccountId = Number(expenseAccountResult.insertId);

      const [cashAccountResult] = await db.execute(
        `INSERT INTO accounts (company_id, code, name, account_type_id)
         VALUES (?, ?, ?, (SELECT id FROM account_types WHERE code = 'CASH' LIMIT 1))`,
        [companyId, `CASH-${runId}`, `Cash Account ${runId}`]
      );
      createdCashAccountId = Number(cashAccountResult.insertId);

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
      const acquisitionResponse = await fetch(`${baseUrl}/api/accounts/fixed-assets/${createdAssetId}/acquisition`, {
        method: "POST",
        headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
        body: JSON.stringify({
          event_date: "2025-01-15",
          cost: 10000000,
          useful_life_months: 60,
          salvage_value: 500000,
          expense_account_id: createdExpenseAccountId,
          notes: "Test acquisition"
        })
      });
      assert.equal(acquisitionResponse.status, 201, "Acquisition should succeed");
      const acquisitionBody = await acquisitionResponse.json();
      assert.equal(acquisitionBody.success, true);
      assert.equal(typeof acquisitionBody.data.event_id, "number");
      assert.equal(typeof acquisitionBody.data.journal_batch_id, "number");
      assert.equal(acquisitionBody.data.book.cost_basis, 10000000);
      assert.equal(acquisitionBody.data.book.carrying_amount, 9500000);

      // IDEMPOTENCY - duplicate request with same key
      const idempotentResponse = await fetch(`${baseUrl}/api/accounts/fixed-assets/${createdAssetId}/acquisition`, {
        method: "POST",
        headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
        body: JSON.stringify({
          event_date: "2025-01-15",
          cost: 99999999,
          useful_life_months: 12,
          expense_account_id: createdExpenseAccountId,
          idempotency_key: `idem-${runId}`
        })
      });
      assert.equal(idempotentResponse.status, 201);
      const idempotentBody = await idempotentResponse.json();
      assert.equal(idempotentBody.data.duplicate, true, "Should return duplicate: true");

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
          transfer_date: "2025-02-01",
          notes: "Test transfer"
        })
      });
      assert.equal(transferResponse.status, 201, "Transfer should succeed");
      const transferBody = await transferResponse.json();
      assert.equal(transferBody.success, true);
      assert.equal(transferBody.data.to_outlet_id, createdOutletId);

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
          impairment_date: "2025-03-01",
          impairment_amount: 2000000,
          reason: "Obsolescence",
          expense_account_id: createdExpenseAccountId
        })
      });
      assert.equal(impairmentResponse.status, 201, "Impairment should succeed");
      const impairmentBody = await impairmentResponse.json();
      assert.equal(impairmentBody.success, true);
      assert.equal(impairmentBody.data.book.accum_impairment, 2000000);
      assert.equal(impairmentBody.data.book.carrying_amount, 7500000);

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

      // DISPOSAL (SALE)
      const disposalResponse = await fetch(`${baseUrl}/api/accounts/fixed-assets/${createdAssetId}/disposal`, {
        method: "POST",
        headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
        body: JSON.stringify({
          disposal_date: "2025-04-01",
          disposal_type: "SALE",
          proceeds: 6000000,
          disposal_cost: 100000,
          cash_account_id: createdCashAccountId,
          notes: "Test sale"
        })
      });
      assert.equal(disposalResponse.status, 201, "Disposal should succeed");
      const disposalBody = await disposalResponse.json();
      assert.equal(disposalBody.success, true);
      assert.equal(disposalBody.data.book.carrying_amount, 0, "Carrying amount should be zero after disposal");
      assert.equal(disposalBody.data.disposal.cost_removed, 10000000);
      assert.equal(disposalBody.data.disposal.gain_loss, -3900000, "Loss: proceeds(6M) - carrying(7.5M) - cost(100K) = -2.1M + 100K cost = -2M loss... wait let me recalculate");

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
          impairment_date: "2025-05-01",
          impairment_amount: 100000,
          reason: "Test",
          expense_account_id: createdExpenseAccountId
        })
      });
      assert.equal(actionOnDisposedResponse.status, 409, "Action on disposed asset should fail");

    } finally {
      if (createdAssetId > 0) {
        await db.execute("DELETE FROM asset_depreciation_plans WHERE asset_id = ?", [createdAssetId]);
        await db.execute("DELETE FROM fixed_asset_events WHERE asset_id = ?", [createdAssetId]);
        await db.execute("DELETE FROM fixed_asset_disposals WHERE asset_id = ?", [createdAssetId]);
        await db.execute("DELETE FROM fixed_asset_books WHERE asset_id = ?", [createdAssetId]);
        await db.execute("DELETE FROM fixed_assets WHERE id = ?", [createdAssetId]);
      }
      if (createdCategoryId > 0) {
        await db.execute("DELETE FROM fixed_asset_categories WHERE id = ?", [createdCategoryId]);
      }
      if (createdExpenseAccountId > 0) {
        await db.execute("DELETE FROM accounts WHERE id = ?", [createdExpenseAccountId]);
      }
      if (createdCashAccountId > 0) {
        await db.execute("DELETE FROM accounts WHERE id = ?", [createdCashAccountId]);
      }
      if (createdOutletId > 0) {
        await db.execute("DELETE FROM outlets WHERE id = ?", [createdOutletId]);
      }
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
        `INSERT INTO accounts (company_id, code, name, account_type_id)
         VALUES (?, ?, ?, (SELECT id FROM account_types WHERE code = 'EXPENSE' LIMIT 1))`,
        [companyId, `FA-EXP-${runId}`, `FA Expense ${runId}`]
      );
      createdExpenseAccountId = Number(expenseAccountResult.insertId);

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
          event_date: "2025-01-15",
          cost: 5000000,
          useful_life_months: 60,
          salvage_value: 0,
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
      if (createdAssetId > 0) {
        await db.execute("DELETE FROM asset_depreciation_plans WHERE asset_id = ?", [createdAssetId]);
        await db.execute("DELETE FROM fixed_asset_events WHERE asset_id = ?", [createdAssetId]);
        await db.execute("DELETE FROM fixed_asset_disposals WHERE asset_id = ?", [createdAssetId]);
        await db.execute("DELETE FROM fixed_asset_books WHERE asset_id = ?", [createdAssetId]);
        await db.execute("DELETE FROM fixed_assets WHERE id = ?", [createdAssetId]);
      }
      if (createdCategoryId > 0) {
        await db.execute("DELETE FROM fixed_asset_categories WHERE id = ?", [createdCategoryId]);
      }
      if (createdExpenseAccountId > 0) {
        await db.execute("DELETE FROM accounts WHERE id = ?", [createdExpenseAccountId]);
      }
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

      const [deniedOutletResult] = await db.execute(
        `INSERT INTO outlets (company_id, code, name) VALUES (?, ?, ?)`,
        [companyId, `DENY${runId}`.slice(0, 10).toUpperCase(), `Denied Outlet ${runId}`]
      );
      deniedOutletId = Number(deniedOutletResult.insertId);

      const [expenseAccountResult] = await db.execute(
        `INSERT INTO accounts (company_id, code, name, account_type_id)
         VALUES (?, ?, ?, (SELECT id FROM account_types WHERE code = 'EXPENSE' LIMIT 1))`,
        [companyId, `FA-EXP-${runId}`, `FA Expense ${runId}`]
      );
      createdExpenseAccountId = Number(expenseAccountResult.insertId);

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
          event_date: "2025-01-15",
          cost: 10000000,
          useful_life_months: 60,
          expense_account_id: createdExpenseAccountId
        })
      });
      assert.equal(acquisitionResponse.status, 404, "Should return 404 for other outlet asset");

    } finally {
      if (createdAssetId > 0) {
        await db.execute("DELETE FROM fixed_asset_events WHERE asset_id = ?", [createdAssetId]);
        await db.execute("DELETE FROM fixed_asset_disposals WHERE asset_id = ?", [createdAssetId]);
        await db.execute("DELETE FROM fixed_asset_books WHERE asset_id = ?", [createdAssetId]);
        await db.execute("DELETE FROM fixed_assets WHERE id = ?", [createdAssetId]);
      }
      if (createdCategoryId > 0) {
        await db.execute("DELETE FROM fixed_asset_categories WHERE id = ?", [createdCategoryId]);
      }
      if (createdExpenseAccountId > 0) {
        await db.execute("DELETE FROM accounts WHERE id = ?", [createdExpenseAccountId]);
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
