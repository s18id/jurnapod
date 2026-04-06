// @ts-nocheck
// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test, describe, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { setupIntegrationTests, loginOwner, readEnv, TEST_TIMEOUT_MS, createCleanupHelper } from "../../tests/integration/integration-harness.js";

const testContext = setupIntegrationTests();

async function runSubtest(name: string, optsOrFn: any, maybeFn?: any) {
  const fn = typeof optsOrFn === 'function' ? optsOrFn : maybeFn;
  if (!fn) throw new Error(`Missing subtest fn for ${name}`);
  await fn();
}

async function apiRequest(baseUrl, token, path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
      ...(options.headers ?? {})
    }
  });
  const body = await response.json().catch(() => ({}));
  return { status: response.status, body };
}

async function ensureOpenFiscalYear(db, companyId, userId) {
  const [rows] = await db.execute(
    `SELECT id FROM fiscal_years WHERE company_id = ? AND status = 'OPEN' LIMIT 1`,
    [companyId]
  );
  if (rows.length > 0) {
    return;
  }

  const year = new Date().getUTCFullYear();
  await db.execute(
    `INSERT INTO fiscal_years (
       company_id, code, name, start_date, end_date, status, created_by_user_id, updated_by_user_id
     ) VALUES (?, ?, ?, ?, ?, 'OPEN', ?, ?)`,
    [companyId, `FY-${year}-${randomUUID().slice(0, 6)}`, `FY ${year}`, `${year}-01-01`, `${year}-12-31`, userId, userId]
  );
}

async function createCashBankAccount(db, companyId, code, name, typeName = "Cash") {
  const [result] = await db.execute(
    `INSERT INTO accounts (company_id, code, name, type_name, normal_balance, report_group, is_active)
     VALUES (?, ?, ?, ?, 'D', 'NRC', 1)`,
    [companyId, code, name, typeName]
  );
  return Number(result.insertId);
}

test("@slow cash-bank integration", { timeout: TEST_TIMEOUT_MS }, async () => {
  const { db, baseUrl } = testContext;
  const companyCode = readEnv("JP_COMPANY_CODE", "JP");
  const ownerEmail = readEnv("JP_OWNER_EMAIL").toLowerCase();
  const ownerPassword = readEnv("JP_OWNER_PASSWORD");

  const token = await loginOwner(baseUrl, companyCode, ownerEmail, ownerPassword);

  const [ownerRows] = await db.execute(
    `SELECT u.id, u.company_id
     FROM users u
     INNER JOIN companies c ON c.id = u.company_id
     WHERE c.code = ? AND u.email = ?
     LIMIT 1`,
    [companyCode, ownerEmail]
  );
  assert.ok(ownerRows.length > 0);
  const userId = Number(ownerRows[0].id);
  const companyId = Number(ownerRows[0].company_id);

  await ensureOpenFiscalYear(db, companyId, userId);

  const accountIds = [];
  const txIds = [];
  try {
    const cashAccountId = await createCashBankAccount(
      db,
      companyId,
      `CBC-${randomUUID().slice(0, 6)}`,
      "Test Cash Account",
      "Cash"
    );
    const bankAccountId = await createCashBankAccount(
      db,
      companyId,
      `CBB-${randomUUID().slice(0, 6)}`,
      "Test Bank Account",
      "Bank"
    );
    const fxAccountId = await createCashBankAccount(
      db,
      companyId,
      `CBF-${randomUUID().slice(0, 6)}`,
      "FX Account",
      "Cash"
    );
    const sourceAccountId = cashAccountId;
    const destinationAccountId = bankAccountId;
    accountIds.push(cashAccountId, bankAccountId, fxAccountId);

    await runSubtest("create draft success", async () => {
      const createRes = await apiRequest(baseUrl, token, "/api/cash-bank-transactions", {
        method: "POST",
        body: JSON.stringify({
          transaction_type: "MUTATION",
          transaction_date: new Date().toISOString().slice(0, 10),
          description: "Transfer cash",
          source_account_id: sourceAccountId,
          destination_account_id: destinationAccountId,
          amount: 500000
        })
      });
      assert.equal(createRes.status, 201, JSON.stringify(createRes.body));
      assert.equal(createRes.body.data.status, "DRAFT");
      txIds.push(Number(createRes.body.data.id));
    });

    await runSubtest("post success and idempotency", async () => {
      const txId = txIds[0];
      const post1 = await apiRequest(baseUrl, token, `/api/cash-bank-transactions/${txId}/post`, {
        method: "POST"
      });
      assert.equal(post1.status, 200, JSON.stringify(post1.body));
      assert.equal(post1.body.data.status, "POSTED");

      const post2 = await apiRequest(baseUrl, token, `/api/cash-bank-transactions/${txId}/post`, {
        method: "POST"
      });
      assert.equal(post2.status, 200, JSON.stringify(post2.body));
      assert.equal(post2.body.data.status, "POSTED");

      const [batches] = await db.execute(
        `SELECT id
         FROM journal_batches
         WHERE company_id = ?
           AND doc_type = 'CASH_BANK_MUTATION'
           AND doc_id = ?`,
        [companyId, txId]
      );
      assert.equal(batches.length, 1);

      const [sumRows] = await db.execute(
        `SELECT SUM(debit) as debit_total, SUM(credit) as credit_total
         FROM journal_lines
         WHERE journal_batch_id = ?`,
        [Number(batches[0].id)]
      );
      assert.equal(Number(sumRows[0].debit_total), Number(sumRows[0].credit_total));
    });

    await runSubtest("void success creates contra effect", async () => {
      const txId = txIds[0];
      const voidRes = await apiRequest(baseUrl, token, `/api/cash-bank-transactions/${txId}/void`, {
        method: "POST"
      });
      assert.equal(voidRes.status, 200, JSON.stringify(voidRes.body));
      assert.equal(voidRes.body.data.status, "VOID");

      const [voidBatches] = await db.execute(
        `SELECT id
         FROM journal_batches
         WHERE company_id = ?
           AND doc_type = 'CASH_BANK_MUTATION_VOID'
           AND doc_id = ?`,
        [companyId, txId]
      );
      assert.equal(voidBatches.length, 1);
    });

    await runSubtest("FOREX creates draft and can post", async () => {
      const createRes = await apiRequest(baseUrl, token, "/api/cash-bank-transactions", {
        method: "POST",
        body: JSON.stringify({
          transaction_type: "FOREX",
          transaction_date: new Date().toISOString().slice(0, 10),
          description: "FOREX buy",
          source_account_id: sourceAccountId,
          destination_account_id: destinationAccountId,
          amount: 100,
          currency_code: "USD",
          exchange_rate: 16000,
          base_amount: 110,
          fx_account_id: fxAccountId
        })
      });
      assert.equal(createRes.status, 201, JSON.stringify(createRes.body));
      const txId = Number(createRes.body.data.id);
      txIds.push(txId);

      const postRes = await apiRequest(baseUrl, token, `/api/cash-bank-transactions/${txId}/post`, {
        method: "POST"
      });
      assert.equal(postRes.status, 200, JSON.stringify(postRes.body));
      assert.equal(postRes.body.data.status, "POSTED");
    });

    await runSubtest("closed fiscal year rejected on post", async () => {
      const createRes = await apiRequest(baseUrl, token, "/api/cash-bank-transactions", {
        method: "POST",
        body: JSON.stringify({
          transaction_type: "MUTATION",
          transaction_date: "2000-01-01",
          description: "Old period transaction",
          source_account_id: sourceAccountId,
          destination_account_id: destinationAccountId,
          amount: 10
        })
      });
      assert.equal(createRes.status, 201, JSON.stringify(createRes.body));
      const txId = Number(createRes.body.data.id);
      txIds.push(txId);

      const postRes = await apiRequest(baseUrl, token, `/api/cash-bank-transactions/${txId}/post`, {
        method: "POST"
      });
      assert.equal(postRes.status, 400);
      assert.equal(postRes.body.error.code, "FISCAL_YEAR_CLOSED");
    });

    await runSubtest("TOP_UP requires cash source and bank destination", async () => {
      const createRes = await apiRequest(baseUrl, token, "/api/cash-bank-transactions", {
        method: "POST",
        body: JSON.stringify({
          transaction_type: "TOP_UP",
          transaction_date: new Date().toISOString().slice(0, 10),
          description: "TOP_UP valid",
          source_account_id: cashAccountId,
          destination_account_id: bankAccountId,
          amount: 100000
        })
      });
      assert.equal(createRes.status, 201, JSON.stringify(createRes.body));
      txIds.push(Number(createRes.body.data.id));
    });

    await runSubtest("TOP_UP rejects reversed direction (bank to cash)", async () => {
      const createRes = await apiRequest(baseUrl, token, "/api/cash-bank-transactions", {
        method: "POST",
        body: JSON.stringify({
          transaction_type: "TOP_UP",
          transaction_date: new Date().toISOString().slice(0, 10),
          description: "TOP_UP invalid",
          source_account_id: bankAccountId,
          destination_account_id: cashAccountId,
          amount: 100000
        })
      });
      assert.equal(createRes.status, 400, JSON.stringify(createRes.body));
      assert.ok(createRes.body.error.message.includes("TOP_UP requires source cash"));
    });

    await runSubtest("WITHDRAWAL requires bank source and cash destination", async () => {
      const createRes = await apiRequest(baseUrl, token, "/api/cash-bank-transactions", {
        method: "POST",
        body: JSON.stringify({
          transaction_type: "WITHDRAWAL",
          transaction_date: new Date().toISOString().slice(0, 10),
          description: "WITHDRAWAL valid",
          source_account_id: bankAccountId,
          destination_account_id: cashAccountId,
          amount: 100000
        })
      });
      assert.equal(createRes.status, 201, JSON.stringify(createRes.body));
      txIds.push(Number(createRes.body.data.id));
    });

    await runSubtest("WITHDRAWAL rejects reversed direction (cash to bank)", async () => {
      const createRes = await apiRequest(baseUrl, token, "/api/cash-bank-transactions", {
        method: "POST",
        body: JSON.stringify({
          transaction_type: "WITHDRAWAL",
          transaction_date: new Date().toISOString().slice(0, 10),
          description: "WITHDRAWAL invalid",
          source_account_id: cashAccountId,
          destination_account_id: bankAccountId,
          amount: 100000
        })
      });
      assert.equal(createRes.status, 400, JSON.stringify(createRes.body));
      assert.ok(createRes.body.error.message.includes("WITHDRAWAL requires source bank"));
    });
  } finally {
    // Note: journal_lines and journal_batches cannot be deleted due to immutability triggers
    // Only attempt to delete cash_bank_transactions which are not protected
    if (txIds.length > 0) {
      const txPlaceholders = txIds.map(() => "?").join(", ");
      try {
        await db.execute(
          `DELETE FROM cash_bank_transactions
           WHERE company_id = ?
             AND id IN (${txPlaceholders})`,
          [companyId, ...txIds]
        );
      } catch (e) {
        // Ignore - may fail due to FK constraints or already deleted
      }
    }

    for (const accountId of accountIds) {
      try {
        // First delete any fixed asset categories that reference these accounts
        await db.execute(
          `DELETE FROM fixed_asset_categories 
           WHERE company_id = ? AND (accum_depr_account_id = ? OR expense_account_id = ?)`,
          [companyId, accountId, accountId]
        );
      } catch (e) {
        // Ignore
      }
      try {
        await db.execute(`DELETE FROM accounts WHERE company_id = ? AND id = ?`, [companyId, accountId]);
      } catch (e) {
        // Ignore - may be referenced by immutable journal_lines
      }
    }

    // Note: accounts may remain due to FK references from immutable journal_lines
    // This is acceptable for test isolation
  }
});
