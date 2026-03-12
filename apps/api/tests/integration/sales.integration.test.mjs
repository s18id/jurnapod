// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
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
const nextCliPath = path.resolve(repoRoot, "node_modules/next/dist/bin/next");
const loadEnvFile = process.loadEnvFile;
const ENV_PATH = path.resolve(repoRoot, ".env");
const TEST_TIMEOUT_MS = 180000;

const testContext = setupIntegrationTests(test);

const SALES_INVOICE_DOC_TYPE = "SALES_INVOICE";
const SALES_PAYMENT_IN_DOC_TYPE = "SALES_PAYMENT_IN";
const sharedJournalsDistPath = path.resolve(
  repoRoot,
  "packages/shared/dist/schemas/journals.js"
);
const sharedJournalsDist = readFileSync(sharedJournalsDistPath, "utf8");
if (!sharedJournalsDist.includes("client_ref")) {
  throw new Error(
    "ManualJournalEntryCreateRequestSchema missing client_ref; rebuild @jurnapod/shared dist"
  );
}

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

function normalizeDateValue(value) {
  if (value instanceof Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  if (typeof value === "string" && value.length > 0) {
    return value.split("T")[0];
  }
  return new Date().toISOString().split("T")[0];
}

async function resolveOpenFiscalDate(db, companyId) {
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
    return normalizeDateValue(rows[0].start_date ?? rows[0].end_date);
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

  childProcess.on("error", (err) => {
    console.error("Server process error:", err);
  });

  childProcess.on("exit", (code, signal) => {
    if (code !== 0 && code !== null) {
      console.error(`Server process exited with code ${code} signal ${signal}`);
    }
  });

  return {
    childProcess,
    serverLogs
  };
}

async function waitForServerReady(baseUrl, serverLogs, timeout = 60000) {
  const start = Date.now();
  let attempts = 0;
  
  while (Date.now() - start < timeout) {
    attempts++;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const response = await fetch(`${baseUrl}/api/health`, { 
        method: "GET",
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (response.ok) {
        console.log(`Server ready after ${attempts} attempts (${Date.now() - start}ms)`);
        return true;
      }
    } catch (err) {
      // Log every 10 attempts
      if (attempts % 10 === 0) {
        console.log(`Waiting for server... attempt ${attempts} (${Date.now() - start}ms)`);
        const recentLogs = serverLogs.slice(-5).join('\n');
        if (recentLogs) {
          console.log('Recent server logs:', recentLogs.slice(0, 500));
        }
      }
    }
    await delay(500);
  }

  console.error('Server startup failed. Last logs:', serverLogs.slice(-10).join('\n'));
  throw new Error(`Server did not become ready within ${timeout}ms after ${attempts} attempts`);
}

async function apiRequest(baseUrl, path, options = {}) {
  const url = `${baseUrl}${path}`;
  const headers = {
    "Content-Type": "application/json",
    ...options.headers
  };

  const response = await fetch(url, {
    ...options,
    headers
  });

  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }

  return { status: response.status, body };
}

async function login(baseUrl, credentials) {
  const { status, body } = await apiRequest(baseUrl, "/api/auth/login", {
    method: "POST",
    body: JSON.stringify(credentials)
  });

  if (status !== 200 || !body.success) {
    throw new Error(`Login failed: ${JSON.stringify(body)}`);
  }

  return body.data.access_token;
}

async function ensureOutletAccountMappingConstraint(db) {
  const [rows] = await db.execute(
    `SELECT check_clause
     FROM information_schema.check_constraints
     WHERE constraint_schema = DATABASE()
       AND constraint_name = 'chk_outlet_account_mappings_mapping_key'
     LIMIT 1`
  );

  const clause = rows[0]?.check_clause ?? "";
  if (
    typeof clause === "string" &&
    clause.includes("'CARD'") &&
    clause.includes("'SALES_RETURNS'")
  ) {
    return;
  }

  const dropConstraintStatements = [
    "ALTER TABLE outlet_account_mappings DROP CONSTRAINT chk_outlet_account_mappings_mapping_key",
    "ALTER TABLE outlet_account_mappings DROP CHECK chk_outlet_account_mappings_mapping_key"
  ];

  for (const statement of dropConstraintStatements) {
    try {
      await db.execute(statement);
      break;
    } catch (error) {
      const message = error?.message ?? "";
      if (typeof message === "string" && message.includes("doesn't exist")) {
        break;
      }
    }
  }

  await db.execute(
    `ALTER TABLE outlet_account_mappings
     ADD CONSTRAINT chk_outlet_account_mappings_mapping_key
     CHECK (mapping_key IN ('CASH', 'QRIS', 'CARD', 'SALES_REVENUE', 'SALES_RETURNS', 'AR'))`
  );
}

function buildTestAccountCode(mappingKey) {
  const suffix = randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();
  const base = `IT${mappingKey.replaceAll("_", "")}${suffix}`;
  return base.slice(0, 32);
}

const OUTLET_MAPPING_KEYS = ["CASH", "QRIS", "CARD", "SALES_REVENUE", "SALES_RETURNS", "AR"];
const PAYABLE_MAPPING_KEYS = new Set(["CASH", "QRIS", "CARD"]);

async function ensureOutletAccountMappings(db, companyId, outletId) {
  const mappingKeys = OUTLET_MAPPING_KEYS;
  const placeholders = mappingKeys.map(() => "?").join(", ");
  const [existingRows] = await db.execute(
    `SELECT mapping_key
     FROM outlet_account_mappings
     WHERE company_id = ?
       AND outlet_id = ?
       AND mapping_key IN (${placeholders})`,
    [companyId, outletId, ...mappingKeys]
  );

  const existingKeys = new Set(
    existingRows.map((row) => String(row.mapping_key ?? "")).filter((value) => value.length > 0)
  );

  const createdMappingKeys = [];
  const createdAccountIds = [];

  for (const mappingKey of mappingKeys) {
    if (existingKeys.has(mappingKey)) {
      continue;
    }

    const accountCode = buildTestAccountCode(mappingKey);
    const isPayable = PAYABLE_MAPPING_KEYS.has(mappingKey) ? 1 : 0;
    const [accountInsertResult] = await db.execute(
      `INSERT INTO accounts (company_id, code, name, is_payable)
       VALUES (?, ?, ?, ?)`,
      [companyId, accountCode, `Integration Test ${mappingKey}`, isPayable]
    );
    const accountId = Number(accountInsertResult.insertId);

    await db.execute(
      `INSERT INTO outlet_account_mappings (
         company_id,
         outlet_id,
         mapping_key,
         account_id
       ) VALUES (?, ?, ?, ?)`,
      [companyId, outletId, mappingKey, accountId]
    );

    createdMappingKeys.push(mappingKey);
    createdAccountIds.push(accountId);
  }

  const [mappingRows] = await db.execute(
    `SELECT mapping_key, account_id
     FROM outlet_account_mappings
     WHERE company_id = ?
       AND outlet_id = ?
       AND mapping_key IN (${placeholders})`,
    [companyId, outletId, ...mappingKeys]
  );

  const accountIdsByKey = mappingRows.reduce((accumulator, row) => {
    const key = String(row.mapping_key ?? "");
    if (key.length > 0) {
      accumulator[key] = Number(row.account_id);
    }
    return accumulator;
  }, {});

  const payableAccountIds = mappingRows
    .filter((row) => PAYABLE_MAPPING_KEYS.has(String(row.mapping_key ?? "")))
    .map((row) => Number(row.account_id))
    .filter((value) => Number.isFinite(value) && value > 0);

  if (payableAccountIds.length > 0) {
    const payablePlaceholders = payableAccountIds.map(() => "?").join(", ");
    await db.execute(
      `UPDATE accounts
       SET is_payable = 1
       WHERE company_id = ? AND id IN (${payablePlaceholders})`,
      [companyId, ...payableAccountIds]
    );
  }

  return {
    createdMappingKeys,
    createdAccountIds,
    accountIdsByKey
  };
}

async function setupTestData(db) {
  const companyId = 1;
  const outletId = 1;
  const userId = 1;

  // Ensure outlet account mappings exist
  await ensureOutletAccountMappingConstraint(db);
  const mappingFixture = await ensureOutletAccountMappings(db, companyId, outletId);
  const requiredKeys = ["CASH", "QRIS", "CARD"];
  for (const key of requiredKeys) {
    if (!mappingFixture.accountIdsByKey?.[key]) {
      throw new Error(`Missing outlet account mapping for ${key}`);
    }
  }

  return { companyId, outletId, userId, mappingFixture };
}

async function ensureOpenFiscalYear(db, companyId, userId) {
  const [rows] = await db.execute(
    `SELECT id
     FROM fiscal_years
     WHERE company_id = ?
       AND status = 'OPEN'
     LIMIT 1`,
    [companyId]
  );

  if (rows.length > 0) {
    return;
  }

  const year = new Date().getUTCFullYear();
  const startDate = `${year}-01-01`;
  const endDate = `${year}-12-31`;
  const code = `ITFY-${year}-${randomUUID().slice(0, 8)}`;

  await db.execute(
    `INSERT INTO fiscal_years (
       company_id,
       code,
       name,
       start_date,
       end_date,
       status,
       created_by_user_id,
       updated_by_user_id
     ) VALUES (?, ?, ?, ?, ?, 'OPEN', ?, ?)`,
    [companyId, code, `Integration Fiscal Year ${year}`, startDate, endDate, userId, userId]
  );
}

async function ensureDefaultNumberingTemplates(db, companyId) {
  const templates = [
    { docType: "SALES_INVOICE", pattern: "INV/{{yy}}{{mm}}/{{seq4}}" },
    { docType: "SALES_PAYMENT", pattern: "PAY/{{yy}}{{mm}}/{{seq4}}" },
    { docType: "SALES_ORDER", pattern: "SO/{{yy}}{{mm}}/{{seq4}}" },
    { docType: "CREDIT_NOTE", pattern: "CN/{{yy}}{{mm}}/{{seq4}}" }
  ];

  for (const template of templates) {
    const [rows] = await db.execute(
      `SELECT id
       FROM numbering_templates
       WHERE company_id = ?
         AND doc_type = ?
         AND outlet_id IS NULL
       LIMIT 1`,
      [companyId, template.docType]
    );

    if (rows.length > 0) {
      await db.execute(
        `UPDATE numbering_templates
         SET is_active = 1,
             pattern = ?,
             reset_period = 'MONTHLY',
             scope_key = 0
         WHERE id = ?`,
        [template.pattern, Number(rows[0].id)]
      );
      continue;
    }

    await db.execute(
      `INSERT INTO numbering_templates (
         company_id,
         outlet_id,
         scope_key,
         doc_type,
         pattern,
         reset_period,
         current_value,
         last_reset,
         is_active
       ) VALUES (?, NULL, 0, ?, ?, 'MONTHLY', 0, NULL, 1)`,
      [companyId, template.docType, template.pattern]
    );
  }
}

async function ensureDefaultTaxRates(db, companyId) {
  const runId = randomUUID().slice(0, 8);
  
  // Clean up any existing default tax associations to avoid cross-test pollution
  await db.execute(`DELETE FROM company_tax_defaults WHERE company_id = ?`, [companyId]);
  
  const [existingRates] = await db.execute(
    `SELECT id FROM tax_rates WHERE company_id = ? AND is_active = 1 AND account_id IS NOT NULL LIMIT 1`,
    [companyId]
  );
  
  if (existingRates.length > 0) {
    return { taxRateId: Number(existingRates[0].id) };
  }

  const [accountRows] = await db.execute(
    `SELECT id FROM accounts WHERE company_id = ? AND is_active = 1 AND report_group = 'LR' LIMIT 1`,
    [companyId]
  );
  
  let taxLiabilityAccountId;
  if (accountRows.length > 0) {
    taxLiabilityAccountId = Number(accountRows[0].id);
  } else {
    const [newAccount] = await db.execute(
      `INSERT INTO accounts (company_id, code, name, report_group, normal_balance, is_active)
       VALUES (?, ?, ?, 'LR', 'K', 1)`,
      [companyId, `TAX-LIAB-${runId}`, `Tax Liability ${runId}`]
    );
    taxLiabilityAccountId = Number(newAccount.insertId);
  }

  const [taxRateRows] = await db.execute(
    `INSERT INTO tax_rates (company_id, code, name, rate_percent, is_inclusive, is_active, account_id)
     VALUES (?, ?, ?, 10, 0, 1, ?)`,
    [companyId, `TAX-10-${runId}`, `VAT 10%`, taxLiabilityAccountId]
  );
  const taxRateId = Number(taxRateRows.insertId);

  return { taxRateId };
}

async function cleanupTestInvoices(db, invoiceNos) {
  if (invoiceNos.length === 0) return;

  const placeholders = invoiceNos.map(() => "?").join(", ");
  const [invoiceRows] = await db.execute(
    `SELECT id
     FROM sales_invoices
     WHERE invoice_no IN (${placeholders})`,
    invoiceNos
  );
  const invoiceIds = invoiceRows.map((row) => Number(row.id)).filter((id) => Number.isFinite(id));

  if (invoiceIds.length > 0) {
    const invoiceIdPlaceholders = invoiceIds.map(() => "?").join(", ");
    const [creditNoteRows] = await db.execute(
      `SELECT id
       FROM sales_credit_notes
       WHERE invoice_id IN (${invoiceIdPlaceholders})`,
      invoiceIds
    );
    const creditNoteIds = creditNoteRows
      .map((row) => Number(row.id))
      .filter((id) => Number.isFinite(id));

    if (creditNoteIds.length > 0) {
      const creditNotePlaceholders = creditNoteIds.map(() => "?").join(", ");
      await db.execute(
        `DELETE FROM sales_credit_note_lines
         WHERE credit_note_id IN (${creditNotePlaceholders})`,
        creditNoteIds
      );
      await db.execute(
        `DELETE FROM sales_credit_notes
         WHERE id IN (${creditNotePlaceholders})`,
        creditNoteIds
      );
    }
  }

  await db.execute(
    `DELETE FROM sales_invoices WHERE invoice_no IN (${placeholders})`,
    invoiceNos
  );
}

async function cleanupTestJournals(db, companyId, invoiceNos) {
  if (!companyId || invoiceNos.length === 0) return;

  const invoicePlaceholders = invoiceNos.map(() => "?").join(", ");
  const [invoiceRows] = await db.execute(
    `SELECT id FROM sales_invoices
     WHERE company_id = ?
       AND invoice_no IN (${invoicePlaceholders})`,
    [companyId, ...invoiceNos]
  );
  const invoiceIds = invoiceRows.map((row) => Number(row.id)).filter((id) => Number.isFinite(id));
  if (invoiceIds.length === 0) return;

  const batchPlaceholders = invoiceIds.map(() => "?").join(", ");
  const [batchRows] = await db.execute(
    `SELECT id FROM journal_batches
     WHERE company_id = ?
       AND doc_type = ?
       AND doc_id IN (${batchPlaceholders})`,
    [companyId, SALES_INVOICE_DOC_TYPE, ...invoiceIds]
  );
  const batchIds = batchRows.map((row) => Number(row.id)).filter((id) => Number.isFinite(id));
  if (batchIds.length === 0) return;

  const journalPlaceholders = batchIds.map(() => "?").join(", ");
  await db.execute(
    `DELETE FROM journal_lines
     WHERE journal_batch_id IN (${journalPlaceholders})`,
    batchIds
  );
  await db.execute(
    `DELETE FROM journal_batches
     WHERE id IN (${journalPlaceholders})`,
    batchIds
  );
}

async function cleanupTestPayments(db, paymentNos) {
  if (paymentNos.length === 0) return;

  const placeholders = paymentNos.map(() => "?").join(", ");
  await db.execute(
    `DELETE FROM sales_payments WHERE payment_no IN (${placeholders})`,
    paymentNos
  );
}

async function cleanupTestCreditNotes(db, companyId, creditNoteNos) {
  if (!companyId || creditNoteNos.length === 0) return;

  const placeholders = creditNoteNos.map(() => "?").join(", ");

  // Find credit note IDs
  const [cnRows] = await db.execute(
    `SELECT id FROM sales_credit_notes
     WHERE company_id = ? AND credit_note_no IN (${placeholders})`,
    [companyId, ...creditNoteNos]
  );
  const cnIds = cnRows.map((row) => Number(row.id)).filter((id) => Number.isFinite(id));
  if (cnIds.length === 0) return;

  // Delete related journal lines for credit notes
  const cnPlaceholders = cnIds.map(() => "?").join(", ");
  const [cnBatchRows] = await db.execute(
    `SELECT id FROM journal_batches
     WHERE company_id = ? AND doc_type IN ('SALES_CREDIT_NOTE', 'SALES_CREDIT_NOTE_VOID') AND doc_id IN (${cnPlaceholders})`,
    [companyId, ...cnIds]
  );
  const cnBatchIds = cnBatchRows.map((row) => Number(row.id)).filter((id) => Number.isFinite(id));
  if (cnBatchIds.length > 0) {
    const batchPlaceholders = cnBatchIds.map(() => "?").join(", ");
    await db.execute(
      `DELETE FROM journal_lines WHERE journal_batch_id IN (${batchPlaceholders})`,
      cnBatchIds
    );
    await db.execute(
      `DELETE FROM journal_batches WHERE id IN (${batchPlaceholders})`,
      cnBatchIds
    );
  }

  // Delete credit note lines, then credit notes
  await db.execute(
    `DELETE FROM sales_credit_note_lines WHERE credit_note_id IN (${cnPlaceholders})`,
    cnIds
  );
  await db.execute(
    `DELETE FROM sales_credit_notes WHERE id IN (${cnPlaceholders})`,
    cnIds
  );
}

test("Sales Integration Tests", { timeout: TEST_TIMEOUT_MS }, async (t) => {
  if (typeof loadEnvFile === "function") {
    try {
      loadEnvFile(ENV_PATH);
    } catch {
      // Ignore if .env doesn't exist
    }
  }

  const baseUrl = testContext.baseUrl;
  const serverLogs = [];
  const db = testContext.db;
  const testInvoiceNos = [];
  const testPaymentNos = [];
  const testCreditNoteNos = [];
  const testJournalBatchIds = [];
  let companyId = 0;
  let outletId = 0;
  let mappingFixture = null;

  try {
    await waitForServerReady(baseUrl, serverLogs);
    console.log('Server ready, setting up test data...');
    const setupResult = await setupTestData(db);
    companyId = setupResult.companyId;
    outletId = setupResult.outletId;
    mappingFixture = setupResult.mappingFixture;
    await ensureOpenFiscalYear(db, companyId, setupResult.userId);
    await ensureDefaultNumberingTemplates(db, companyId);
    await ensureDefaultTaxRates(db, companyId);
    console.log('Test data setup complete');

    const companyCode = readEnv("JP_COMPANY_CODE", "JP");
    const ownerEmail = readEnv("JP_OWNER_EMAIL").toLowerCase();
    const ownerPassword = readEnv("JP_OWNER_PASSWORD");

    const token = await login(baseUrl, {
      company_code: companyCode,
      email: ownerEmail,
      password: ownerPassword
    });

    const authHeaders = { Authorization: `Bearer ${token}` };
    const openFiscalDate = await resolveOpenFiscalDate(db, companyId);
    const openFiscalDateTime = `${openFiscalDate}T12:00:00.000Z`;

    await t.test("Invoice draft create/update + post creates journal batch", { timeout: 30000 }, async () => {
      // Setup tax rate for this specific test
      const taxSetup = await ensureDefaultTaxRates(db, companyId);
      
      const invoiceNo = `TEST-INV-${randomUUID().slice(0, 8)}`;
      testInvoiceNos.push(invoiceNo);

      // Create draft invoice
      const createRes = await apiRequest(baseUrl, "/api/sales/invoices", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          outlet_id: outletId,
          invoice_no: invoiceNo,
          invoice_date: "2024-01-15",
          tax_amount: 100,
          taxes: [
            {
              tax_rate_id: taxSetup.taxRateId,
              amount: 100
            }
          ],
          lines: [
            {
              description: "Consulting Service",
              qty: 2,
              unit_price: 500
            }
          ]
        })
      });

      assert.strictEqual(createRes.status, 201);
      assert.strictEqual(createRes.body.success, true);
      assert.strictEqual(createRes.body.data.status, "DRAFT");
      assert.strictEqual(createRes.body.data.payment_status, "UNPAID");
      assert.strictEqual(createRes.body.data.subtotal, 1000);
      assert.strictEqual(createRes.body.data.grand_total, 1100);
      // Verify new fields are present
      assert.ok(createRes.body.data.hasOwnProperty("client_ref"), "invoice should have client_ref field");
      assert.ok(createRes.body.data.hasOwnProperty("created_by_user_id"), "invoice should have created_by_user_id field");
      assert.ok(createRes.body.data.hasOwnProperty("updated_by_user_id"), "invoice should have updated_by_user_id field");
      assert.strictEqual(typeof createRes.body.data.created_by_user_id, "number", "created_by_user_id should be a number");
      assert.strictEqual(typeof createRes.body.data.updated_by_user_id, "number", "updated_by_user_id should be a number");

      const invoiceId = createRes.body.data.id;

      // Update draft invoice
      const updateRes = await apiRequest(baseUrl, `/api/sales/invoices/${invoiceId}`, {
        method: "PATCH",
        headers: authHeaders,
        body: JSON.stringify({
          tax_amount: 110,
          taxes: [
            {
              tax_rate_id: taxSetup.taxRateId,
              amount: 110
            }
          ]
        })
      });

      assert.strictEqual(updateRes.status, 200);
      assert.strictEqual(updateRes.body.data.grand_total, 1110);

      // Check no journal batch exists yet
      const [prePostBatches] = await db.execute(
        `SELECT COUNT(*) as count FROM journal_batches 
         WHERE company_id = ? AND doc_type = ? AND doc_id = ?`,
        [companyId, SALES_INVOICE_DOC_TYPE, invoiceId]
      );
      assert.strictEqual(prePostBatches[0].count, 0);

      // Post invoice
      const postRes = await apiRequest(baseUrl, `/api/sales/invoices/${invoiceId}/post`, {
        method: "POST",
        headers: authHeaders
      });

      assert.strictEqual(postRes.status, 200, JSON.stringify(postRes.body));
      assert.strictEqual(postRes.body.data.status, "POSTED");

      // Verify exactly one journal batch created
      const [batches] = await db.execute(
        `SELECT id FROM journal_batches 
         WHERE company_id = ? AND doc_type = ? AND doc_id = ?`,
        [companyId, SALES_INVOICE_DOC_TYPE, invoiceId]
      );
      assert.strictEqual(batches.length, 1);

      const batchId = batches[0].id;

      // Verify journal lines are balanced
      const [lines] = await db.execute(
        `SELECT account_id, debit, credit, description FROM journal_lines 
         WHERE journal_batch_id = ? ORDER BY id`,
        [batchId]
      );

      assert.strictEqual(lines.length, 3); // AR, Revenue, Tax

      const totalDebit = lines.reduce((sum, line) => sum + Number(line.debit), 0);
      const totalCredit = lines.reduce((sum, line) => sum + Number(line.credit), 0);

      assert.strictEqual(totalDebit, totalCredit);
      assert.strictEqual(totalDebit, 1110);
    });

    await t.test("Invoice due_date defaults to Net 30 and supports common due_term options", { timeout: 30000 }, async () => {
      const invoiceNoDefault = `TEST-INV-DUE-30-${randomUUID().slice(0, 8)}`;
      const invoiceNoNet20 = `TEST-INV-DUE-20-${randomUUID().slice(0, 8)}`;
      testInvoiceNos.push(invoiceNoDefault, invoiceNoNet20);

      const defaultRes = await apiRequest(baseUrl, "/api/sales/invoices", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          outlet_id: outletId,
          invoice_no: invoiceNoDefault,
          invoice_date: "2024-01-15",
          tax_amount: 0,
          lines: [{ description: "Service", qty: 1, unit_price: 1000 }]
        })
      });

      assert.strictEqual(defaultRes.status, 201);
      assert.strictEqual(defaultRes.body.success, true);
      assert.strictEqual(defaultRes.body.data.due_date, "2024-02-14");

      const net20Res = await apiRequest(baseUrl, "/api/sales/invoices", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          outlet_id: outletId,
          invoice_no: invoiceNoNet20,
          invoice_date: "2024-01-15",
          due_term: "NET_20",
          tax_amount: 0,
          lines: [{ description: "Service", qty: 1, unit_price: 1000 }]
        })
      });

      assert.strictEqual(net20Res.status, 201);
      assert.strictEqual(net20Res.body.success, true);
      assert.strictEqual(net20Res.body.data.due_date, "2024-02-04");
    });

    await t.test("Invoice due_date explicit value overrides due_term and PATCH due_term recalculates", { timeout: 30000 }, async () => {
      const invoiceNo = `TEST-INV-DUE-OVR-${randomUUID().slice(0, 8)}`;
      testInvoiceNos.push(invoiceNo);

      const createRes = await apiRequest(baseUrl, "/api/sales/invoices", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          outlet_id: outletId,
          invoice_no: invoiceNo,
          invoice_date: "2024-01-15",
          due_date: "2024-01-25",
          due_term: "NET_90",
          tax_amount: 0,
          lines: [{ description: "Service", qty: 1, unit_price: 1000 }]
        })
      });

      assert.strictEqual(createRes.status, 201);
      assert.strictEqual(createRes.body.success, true);
      assert.strictEqual(createRes.body.data.due_date, "2024-01-25");

      const invoiceId = createRes.body.data.id;
      const patchRes = await apiRequest(baseUrl, `/api/sales/invoices/${invoiceId}`, {
        method: "PATCH",
        headers: authHeaders,
        body: JSON.stringify({
          invoice_date: "2024-01-20",
          due_term: "NET_45"
        })
      });

      assert.strictEqual(patchRes.status, 200);
      assert.strictEqual(patchRes.body.success, true);
      assert.strictEqual(patchRes.body.data.invoice_date, "2024-01-20");
      assert.strictEqual(patchRes.body.data.due_date, "2024-03-05");
    });

    await t.test("Payment draft create + post creates journal batch", { timeout: 30000 }, async () => {
      const invoiceNo = `TEST-INV-${randomUUID().slice(0, 8)}`;
      const paymentNo = `TEST-PAY-${randomUUID().slice(0, 8)}`;
      testInvoiceNos.push(invoiceNo);
      testPaymentNos.push(paymentNo);

      // Create and post invoice
      const invoiceRes = await apiRequest(baseUrl, "/api/sales/invoices", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          outlet_id: outletId,
          invoice_no: invoiceNo,
          invoice_date: "2024-01-15",
          tax_amount: 0,
          lines: [{ description: "Service", qty: 1, unit_price: 1000 }]
        })
      });

      const invoiceId = invoiceRes.body.data.id;

      await apiRequest(baseUrl, `/api/sales/invoices/${invoiceId}/post`, {
        method: "POST",
        headers: authHeaders
      });

      // Create draft payment
      const createRes = await apiRequest(baseUrl, "/api/sales/payments", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          outlet_id: outletId,
          invoice_id: invoiceId,
          payment_no: paymentNo,
          payment_at: openFiscalDateTime,
          account_id: mappingFixture.accountIdsByKey.CASH,
          method: "CASH",
          amount: 1000
        })
      });

      assert.strictEqual(createRes.status, 201);
      assert.strictEqual(createRes.body.data.status, "DRAFT");
      // Verify new fields are present
      assert.ok(createRes.body.data.hasOwnProperty("client_ref"), "payment should have client_ref field");
      assert.ok(createRes.body.data.hasOwnProperty("created_by_user_id"), "payment should have created_by_user_id field");
      assert.ok(createRes.body.data.hasOwnProperty("updated_by_user_id"), "payment should have updated_by_user_id field");
      assert.strictEqual(typeof createRes.body.data.created_by_user_id, "number", "created_by_user_id should be a number");
      assert.strictEqual(typeof createRes.body.data.updated_by_user_id, "number", "updated_by_user_id should be a number");

      const paymentId = createRes.body.data.id;

      // Post payment
      const postRes = await apiRequest(baseUrl, `/api/sales/payments/${paymentId}/post`, {
        method: "POST",
        headers: authHeaders
      });

      assert.strictEqual(postRes.status, 200);
      assert.strictEqual(postRes.body.data.status, "POSTED");

      // Verify exactly one journal batch created
      const [batches] = await db.execute(
        `SELECT id FROM journal_batches 
         WHERE company_id = ? AND doc_type = ? AND doc_id = ?`,
        [companyId, SALES_PAYMENT_IN_DOC_TYPE, paymentId]
      );
      assert.strictEqual(batches.length, 1);

      const batchId = batches[0].id;

      // Verify journal lines are balanced
      const [lines] = await db.execute(
        `SELECT debit, credit FROM journal_lines WHERE journal_batch_id = ?`,
        [batchId]
      );

      assert.strictEqual(lines.length, 2); // Cash Dr, AR Cr

      const totalDebit = lines.reduce((sum, line) => sum + Number(line.debit), 0);
      const totalCredit = lines.reduce((sum, line) => sum + Number(line.credit), 0);

      assert.strictEqual(totalDebit, totalCredit);
      assert.strictEqual(totalDebit, 1000);
    });

    await t.test("Payment post decreases invoice outstanding correctly", { timeout: 30000 }, async () => {
      const invoiceNo = `TEST-INV-${randomUUID().slice(0, 8)}`;
      const paymentNo = `TEST-PAY-${randomUUID().slice(0, 8)}`;
      testInvoiceNos.push(invoiceNo);
      testPaymentNos.push(paymentNo);

      // Create and post invoice for 1000
      const invoiceRes = await apiRequest(baseUrl, "/api/sales/invoices", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          outlet_id: outletId,
          invoice_no: invoiceNo,
          invoice_date: "2024-01-15",
          tax_amount: 0,
          lines: [{ description: "Service", qty: 1, unit_price: 1000 }]
        })
      });

      const invoiceId = invoiceRes.body.data.id;

      await apiRequest(baseUrl, `/api/sales/invoices/${invoiceId}/post`, {
        method: "POST",
        headers: authHeaders
      });

      // Check initial state
      let getRes = await apiRequest(baseUrl, `/api/sales/invoices/${invoiceId}`, {
        headers: authHeaders
      });

      assert.strictEqual(getRes.body.data.grand_total, 1000);
      assert.strictEqual(getRes.body.data.paid_total, 0);
      assert.strictEqual(getRes.body.data.payment_status, "UNPAID");

      // Create and post payment for 1000
      const paymentRes = await apiRequest(baseUrl, "/api/sales/payments", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          outlet_id: outletId,
          invoice_id: invoiceId,
          payment_no: paymentNo,
          payment_at: openFiscalDateTime,
          account_id: mappingFixture.accountIdsByKey.CASH,
          method: "CASH",
          amount: 1000
        })
      });

      const paymentId = paymentRes.body.data.id;

      const postPaymentRes = await apiRequest(baseUrl, `/api/sales/payments/${paymentId}/post`, {
        method: "POST",
        headers: authHeaders
      });
      assert.strictEqual(postPaymentRes.status, 200, JSON.stringify(postPaymentRes.body));

      // Check invoice updated correctly
      getRes = await apiRequest(baseUrl, `/api/sales/invoices/${invoiceId}`, {
        headers: authHeaders
      });

      assert.strictEqual(getRes.body.data.paid_total, 1000);
      assert.strictEqual(getRes.body.data.payment_status, "PAID");
    });

    await t.test("Partial payment transitions UNPAID -> PARTIAL -> PAID", { timeout: 30000 }, async () => {
      const invoiceNo = `TEST-INV-${randomUUID().slice(0, 8)}`;
      const payment1No = `TEST-PAY-${randomUUID().slice(0, 8)}`;
      const payment2No = `TEST-PAY-${randomUUID().slice(0, 8)}`;
      testInvoiceNos.push(invoiceNo);
      testPaymentNos.push(payment1No, payment2No);

      // Create and post invoice for 1000
      const invoiceRes = await apiRequest(baseUrl, "/api/sales/invoices", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          outlet_id: outletId,
          invoice_no: invoiceNo,
          invoice_date: "2024-01-15",
          tax_amount: 0,
          lines: [{ description: "Service", qty: 1, unit_price: 1000 }]
        })
      });

      const invoiceId = invoiceRes.body.data.id;

      await apiRequest(baseUrl, `/api/sales/invoices/${invoiceId}/post`, {
        method: "POST",
        headers: authHeaders
      });

      // Initial state: UNPAID
      let getRes = await apiRequest(baseUrl, `/api/sales/invoices/${invoiceId}`, {
        headers: authHeaders
      });
      assert.strictEqual(getRes.body.data.payment_status, "UNPAID");

      // First payment: 400
      const payment1Res = await apiRequest(baseUrl, "/api/sales/payments", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          outlet_id: outletId,
          invoice_id: invoiceId,
          payment_no: payment1No,
          payment_at: openFiscalDateTime,
          account_id: mappingFixture.accountIdsByKey.CASH,
          method: "CASH",
          amount: 400
        })
      });

      const postPayment1Res = await apiRequest(baseUrl, `/api/sales/payments/${payment1Res.body.data.id}/post`, {
        method: "POST",
        headers: authHeaders
      });
      assert.strictEqual(postPayment1Res.status, 200, JSON.stringify(postPayment1Res.body));

      // After first payment: PARTIAL
      getRes = await apiRequest(baseUrl, `/api/sales/invoices/${invoiceId}`, {
        headers: authHeaders
      });
      assert.strictEqual(getRes.body.data.paid_total, 400);
      assert.strictEqual(getRes.body.data.payment_status, "PARTIAL");

      // Second payment: 600
      const payment2Res = await apiRequest(baseUrl, "/api/sales/payments", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          outlet_id: outletId,
          invoice_id: invoiceId,
          payment_no: payment2No,
          payment_at: openFiscalDateTime,
          account_id: mappingFixture.accountIdsByKey.QRIS,
          method: "QRIS",
          amount: 600
        })
      });

      const postPayment2Res = await apiRequest(baseUrl, `/api/sales/payments/${payment2Res.body.data.id}/post`, {
        method: "POST",
        headers: authHeaders
      });
      assert.strictEqual(postPayment2Res.status, 200, JSON.stringify(postPayment2Res.body));

      // After second payment: PAID
      getRes = await apiRequest(baseUrl, `/api/sales/invoices/${invoiceId}`, {
        headers: authHeaders
      });
      assert.strictEqual(getRes.body.data.paid_total, 1000);
      assert.strictEqual(getRes.body.data.payment_status, "PAID");
    });

    await t.test("Overpayment fails when variance gain account not configured", { timeout: 30000 }, async () => {
      const invoiceNo = `TEST-INV-${randomUUID().slice(0, 8)}`;
      const paymentNo = `TEST-PAY-${randomUUID().slice(0, 8)}`;
      testInvoiceNos.push(invoiceNo);
      testPaymentNos.push(paymentNo);

      // Create and post invoice for 1000
      const invoiceRes = await apiRequest(baseUrl, "/api/sales/invoices", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          outlet_id: outletId,
          invoice_no: invoiceNo,
          invoice_date: "2024-01-15",
          tax_amount: 0,
          lines: [{ description: "Service", qty: 1, unit_price: 1000 }]
        })
      });

      const invoiceId = invoiceRes.body.data.id;

      await apiRequest(baseUrl, `/api/sales/invoices/${invoiceId}/post`, {
        method: "POST",
        headers: authHeaders
      });

      // Create payment for 1500 (overpayment)
      const paymentRes = await apiRequest(baseUrl, "/api/sales/payments", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          outlet_id: outletId,
          invoice_id: invoiceId,
          payment_no: paymentNo,
          payment_at: openFiscalDateTime,
          account_id: mappingFixture.accountIdsByKey.CASH,
          method: "CASH",
          amount: 1500
        })
      });

      const paymentId = paymentRes.body.data.id;

      // Count journal batches before post attempt
      const [beforeBatches] = await db.execute(
        `SELECT COUNT(*) as count FROM journal_batches 
         WHERE company_id = ? AND doc_type = ? AND doc_id = ?`,
        [companyId, SALES_PAYMENT_IN_DOC_TYPE, paymentId]
      );

      // Try to post overpayment without variance gain account configured (should fail with business error)
      const postRes = await apiRequest(baseUrl, `/api/sales/payments/${paymentId}/post`, {
        method: "POST",
        headers: authHeaders
      });

      // Should fail with PAYMENT_VARIANCE_GAIN_MISSING business error, not 500
      assert.strictEqual(postRes.status, 409);
      assert.strictEqual(postRes.body.success, false);
      assert.strictEqual(postRes.body.error.code, "PAYMENT_VARIANCE_GAIN_MISSING");

      // Verify no journal batch was created (payment failed to post)
      const [afterBatches] = await db.execute(
        `SELECT COUNT(*) as count FROM journal_batches 
         WHERE company_id = ? AND doc_type = ? AND doc_id = ?`,
        [companyId, SALES_PAYMENT_IN_DOC_TYPE, paymentId]
      );

      assert.strictEqual(beforeBatches[0].count, afterBatches[0].count);

      // Verify invoice unchanged (payment not applied)
      const getRes = await apiRequest(baseUrl, `/api/sales/invoices/${invoiceId}`, {
        headers: authHeaders
      });

      assert.strictEqual(getRes.body.data.paid_total, 0);
      assert.strictEqual(getRes.body.data.payment_status, "UNPAID");

      // Verify payment still in DRAFT status
      const getPaymentRes = await apiRequest(baseUrl, `/api/sales/payments/${paymentId}`, {
        headers: authHeaders
      });
      assert.strictEqual(getPaymentRes.body.data.status, "DRAFT");
    });

    await t.test("Duplicate post calls for payments are idempotent", { timeout: 30000 }, async () => {
      const invoiceNo = `TEST-INV-${randomUUID().slice(0, 8)}`;
      const paymentNo = `TEST-PAY-${randomUUID().slice(0, 8)}`;
      testInvoiceNos.push(invoiceNo);
      testPaymentNos.push(paymentNo);

      // Create and post invoice
      const invoiceRes = await apiRequest(baseUrl, "/api/sales/invoices", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          outlet_id: outletId,
          invoice_no: invoiceNo,
          invoice_date: "2024-01-15",
          tax_amount: 0,
          lines: [{ description: "Service", qty: 1, unit_price: 1000 }]
        })
      });

      const invoiceId = invoiceRes.body.data.id;

      await apiRequest(baseUrl, `/api/sales/invoices/${invoiceId}/post`, {
        method: "POST",
        headers: authHeaders
      });

      // Create draft payment
      const paymentRes = await apiRequest(baseUrl, "/api/sales/payments", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          outlet_id: outletId,
          invoice_id: invoiceId,
          payment_no: paymentNo,
          payment_at: openFiscalDateTime,
          account_id: mappingFixture.accountIdsByKey.CASH,
          method: "CASH",
          amount: 1000
        })
      });

      const paymentId = paymentRes.body.data.id;

      // First post
      const post1Res = await apiRequest(baseUrl, `/api/sales/payments/${paymentId}/post`, {
        method: "POST",
        headers: authHeaders
      });
      assert.strictEqual(post1Res.status, 200);
      assert.strictEqual(post1Res.body.data.status, "POSTED");

      // Count journal batches after first post
      const [batches1] = await db.execute(
        `SELECT id FROM journal_batches 
         WHERE company_id = ? AND doc_type = ? AND doc_id = ?`,
        [companyId, SALES_PAYMENT_IN_DOC_TYPE, paymentId]
      );
      assert.strictEqual(batches1.length, 1);

      // Second post (duplicate) - should be idempotent (return existing)
      const post2Res = await apiRequest(baseUrl, `/api/sales/payments/${paymentId}/post`, {
        method: "POST",
        headers: authHeaders
      });
      // Should return 200 with existing posted payment, not create duplicate
      assert.strictEqual(post2Res.status, 200);
      assert.strictEqual(post2Res.body.data.status, "POSTED");

      // Verify still only one journal batch
      const [batches2] = await db.execute(
        `SELECT id FROM journal_batches 
         WHERE company_id = ? AND doc_type = ? AND doc_id = ?`,
        [companyId, SALES_PAYMENT_IN_DOC_TYPE, paymentId]
      );
      assert.strictEqual(batches2.length, 1);
    });

    await t.test("Concurrent post calls for payments create one journal batch", { timeout: 30000 }, async () => {
      const invoiceNo = `TEST-INV-${randomUUID().slice(0, 8)}`;
      const paymentNo = `TEST-PAY-${randomUUID().slice(0, 8)}`;
      testInvoiceNos.push(invoiceNo);
      testPaymentNos.push(paymentNo);

      // Create and post invoice
      const invoiceRes = await apiRequest(baseUrl, "/api/sales/invoices", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          outlet_id: outletId,
          invoice_no: invoiceNo,
          invoice_date: "2024-01-15",
          tax_amount: 0,
          lines: [{ description: "Service", qty: 1, unit_price: 1000 }]
        })
      });
      const invoiceId = invoiceRes.body.data.id;

      await apiRequest(baseUrl, `/api/sales/invoices/${invoiceId}/post`, {
        method: "POST",
        headers: authHeaders
      });

      // Create draft payment
      const paymentRes = await apiRequest(baseUrl, "/api/sales/payments", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          outlet_id: outletId,
          invoice_id: invoiceId,
          payment_no: paymentNo,
          payment_at: openFiscalDateTime,
          account_id: mappingFixture.accountIdsByKey.CASH,
          method: "CASH",
          amount: 1000
        })
      });
      const paymentId = paymentRes.body.data.id;

      // Two near-simultaneous post requests (race)
      const [postA, postB] = await Promise.all([
        apiRequest(baseUrl, `/api/sales/payments/${paymentId}/post`, {
          method: "POST",
          headers: authHeaders
        }),
        apiRequest(baseUrl, `/api/sales/payments/${paymentId}/post`, {
          method: "POST",
          headers: authHeaders
        })
      ]);

      assert.strictEqual(postA.status, 200);
      assert.strictEqual(postB.status, 200);
      assert.strictEqual(postA.body.data.status, "POSTED");
      assert.strictEqual(postB.body.data.status, "POSTED");

      // Must remain exactly one journal batch
      const [batches] = await db.execute(
        `SELECT COUNT(*) as count FROM journal_batches
         WHERE company_id = ? AND doc_type = ? AND doc_id = ?`,
        [companyId, SALES_PAYMENT_IN_DOC_TYPE, paymentId]
      );
      assert.strictEqual(Number(batches[0].count), 1);
    });

    await t.test("Duplicate post calls are idempotent", { timeout: 30000 }, async () => {
      const invoiceNo = `TEST-INV-${randomUUID().slice(0, 8)}`;
      testInvoiceNos.push(invoiceNo);

      // Create draft invoice
      const createRes = await apiRequest(baseUrl, "/api/sales/invoices", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          outlet_id: outletId,
          invoice_no: invoiceNo,
          invoice_date: "2024-01-15",
          tax_amount: 0,
          lines: [{ description: "Service", qty: 1, unit_price: 1000 }]
        })
      });

      const invoiceId = createRes.body.data.id;

      // First post
      const post1Res = await apiRequest(baseUrl, `/api/sales/invoices/${invoiceId}/post`, {
        method: "POST",
        headers: authHeaders
      });

      assert.strictEqual(post1Res.status, 200);
      assert.strictEqual(post1Res.body.data.status, "POSTED");

      // Count journal batches after first post
      const [batches1] = await db.execute(
        `SELECT id FROM journal_batches 
         WHERE company_id = ? AND doc_type = ? AND doc_id = ?`,
        [companyId, SALES_INVOICE_DOC_TYPE, invoiceId]
      );

      assert.strictEqual(batches1.length, 1);
      const batchId1 = batches1[0].id;

      // Second post (duplicate)
      const post2Res = await apiRequest(baseUrl, `/api/sales/invoices/${invoiceId}/post`, {
        method: "POST",
        headers: authHeaders
      });

      assert.strictEqual(post2Res.status, 200);
      assert.strictEqual(post2Res.body.data.status, "POSTED");

      // Verify still only one journal batch exists
      const [batches2] = await db.execute(
        `SELECT id FROM journal_batches 
         WHERE company_id = ? AND doc_type = ? AND doc_id = ?`,
        [companyId, SALES_INVOICE_DOC_TYPE, invoiceId]
      );

      assert.strictEqual(batches2.length, 1);
      assert.strictEqual(batches2[0].id, batchId1); // Same batch ID

      // Third post (another duplicate)
      const post3Res = await apiRequest(baseUrl, `/api/sales/invoices/${invoiceId}/post`, {
        method: "POST",
        headers: authHeaders
      });

      assert.strictEqual(post3Res.status, 200);

      // Verify STILL only one journal batch
      const [batches3] = await db.execute(
        `SELECT COUNT(*) as count FROM journal_batches 
         WHERE company_id = ? AND doc_type = ? AND doc_id = ?`,
        [companyId, SALES_INVOICE_DOC_TYPE, invoiceId]
      );

      assert.strictEqual(batches3[0].count, 1);
    });

    await t.test("Invoice create is idempotent with client_ref", { timeout: 30000 }, async () => {
      const invoiceNo = `TEST-INV-${randomUUID().slice(0, 8)}`;
      const clientRef = randomUUID();
      testInvoiceNos.push(invoiceNo);

      const payload = {
        outlet_id: outletId,
        invoice_no: invoiceNo,
        invoice_date: "2024-01-15",
        tax_amount: 0,
        client_ref: clientRef,
        lines: [{ description: "Service", qty: 1, unit_price: 1000 }]
      };

      const firstRes = await apiRequest(baseUrl, "/api/sales/invoices", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify(payload)
      });

      assert.strictEqual(firstRes.status, 201, JSON.stringify(firstRes.body));
      assert.strictEqual(firstRes.body.success, true);
      const firstId = firstRes.body.data.id;

      const retryRes = await apiRequest(baseUrl, "/api/sales/invoices", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify(payload)
      });

      assert.strictEqual(retryRes.status, 201);
      assert.strictEqual(retryRes.body.success, true);
      assert.strictEqual(retryRes.body.data.id, firstId);
      // Verify client_ref is returned in response
      assert.strictEqual(retryRes.body.data.client_ref, clientRef, "second call should return same client_ref");

      const [rows] = await db.execute(
        `SELECT COUNT(*) as count FROM sales_invoices
         WHERE company_id = ? AND client_ref = ?`,
        [companyId, clientRef]
      );

      assert.strictEqual(Number(rows[0].count), 1);
    });

    await t.test("Payment create is idempotent with client_ref", { timeout: 30000 }, async () => {
      const invoiceNo = `TEST-INV-${randomUUID().slice(0, 8)}`;
      const paymentNo = `TEST-PAY-${randomUUID().slice(0, 8)}`;
      const clientRef = randomUUID();
      testInvoiceNos.push(invoiceNo);
      testPaymentNos.push(paymentNo);

      const invoiceRes = await apiRequest(baseUrl, "/api/sales/invoices", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          outlet_id: outletId,
          invoice_no: invoiceNo,
          invoice_date: "2024-01-15",
          tax_amount: 0,
          lines: [{ description: "Service", qty: 1, unit_price: 1000 }]
        })
      });

      const invoiceId = invoiceRes.body.data.id;

      const payload = {
        outlet_id: outletId,
        invoice_id: invoiceId,
        payment_no: paymentNo,
        payment_at: openFiscalDateTime,
        account_id: mappingFixture.accountIdsByKey.CASH,
        method: "CASH",
        amount: 1000,
        client_ref: clientRef
      };

      const firstRes = await apiRequest(baseUrl, "/api/sales/payments", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify(payload)
      });

      assert.strictEqual(firstRes.status, 201);
      assert.strictEqual(firstRes.body.success, true);
      const firstId = firstRes.body.data.id;

      const retryRes = await apiRequest(baseUrl, "/api/sales/payments", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify(payload)
      });

      assert.strictEqual(retryRes.status, 201);
      assert.strictEqual(retryRes.body.success, true);
      assert.strictEqual(retryRes.body.data.id, firstId);
      // Verify client_ref is returned in response
      assert.strictEqual(retryRes.body.data.client_ref, clientRef, "second call should return same client_ref");

      const [rows] = await db.execute(
        `SELECT COUNT(*) as count FROM sales_payments
         WHERE company_id = ? AND client_ref = ?`,
        [companyId, clientRef]
      );

      assert.strictEqual(Number(rows[0].count), 1);
    });

    await t.test("Manual journal create is idempotent with client_ref", { timeout: 30000 }, async () => {
      const clientRef = randomUUID();
      const entryDate = await resolveOpenFiscalDate(db, companyId);

      const payload = {
        company_id: companyId,
        outlet_id: outletId,
        client_ref: clientRef,
        entry_date: entryDate,
        description: "Integration test manual entry",
        lines: [
          {
            account_id: mappingFixture.accountIdsByKey.CASH,
            debit: 250,
            credit: 0,
            description: "Cash debit"
          },
          {
            account_id: mappingFixture.accountIdsByKey.SALES_REVENUE,
            debit: 0,
            credit: 250,
            description: "Revenue credit"
          }
        ]
      };

      const firstRes = await apiRequest(baseUrl, "/api/journals", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify(payload)
      });

      assert.strictEqual(firstRes.status, 201);
      assert.strictEqual(firstRes.body.success, true);
      const firstId = firstRes.body.data.id;
      testJournalBatchIds.push(firstId);

      const [storedRows] = await db.execute(
        `SELECT client_ref FROM journal_batches WHERE id = ?`,
        [firstId]
      );
      const storedClientRef = storedRows[0]?.client_ref ?? null;
      assert.strictEqual(String(storedClientRef), clientRef);

      const retryRes = await apiRequest(baseUrl, "/api/journals", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify(payload)
      });

      assert.strictEqual(retryRes.status, 201);
      assert.strictEqual(retryRes.body.success, true);
      assert.strictEqual(retryRes.body.data.id, firstId);

      const [rows] = await db.execute(
        `SELECT COUNT(*) as count FROM journal_batches
         WHERE company_id = ? AND doc_type = ? AND client_ref = ?`,
        [companyId, "MANUAL", clientRef]
      );

      assert.strictEqual(Number(rows[0].count), 1);
    });

    const SALES_CREDIT_NOTE_DOC_TYPE = "SALES_CREDIT_NOTE";
    const SALES_CREDIT_NOTE_VOID_DOC_TYPE = "SALES_CREDIT_NOTE_VOID";

    await t.test("Credit note create + post creates balanced journal batch", { timeout: 30000 }, async () => {
      const invoiceNo = `TEST-INV-CN-${randomUUID().slice(0, 8)}`;
      testInvoiceNos.push(invoiceNo);

      // Create and post invoice for 1000
      const invoiceRes = await apiRequest(baseUrl, "/api/sales/invoices", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          outlet_id: outletId,
          invoice_no: invoiceNo,
          invoice_date: "2024-01-15",
          tax_amount: 0,
          lines: [{ description: "Service", qty: 1, unit_price: 1000 }]
        })
      });

      const invoiceId = invoiceRes.body.data.id;

      await apiRequest(baseUrl, `/api/sales/invoices/${invoiceId}/post`, {
        method: "POST",
        headers: authHeaders
      });

      // Create draft credit note for 300
      const cnRes = await apiRequest(baseUrl, "/api/sales/credit-notes", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          outlet_id: outletId,
          invoice_id: invoiceId,
          credit_note_date: openFiscalDate,
          amount: 300,
          lines: [{ description: "Refund", qty: 1, unit_price: 300 }]
        })
      });

      assert.strictEqual(cnRes.status, 201);
      assert.strictEqual(cnRes.body.success, true);
      assert.strictEqual(cnRes.body.data.status, "DRAFT");
      assert.strictEqual(cnRes.body.data.amount, 300);
      testCreditNoteNos.push(cnRes.body.data.credit_note_no);

      const creditNoteId = cnRes.body.data.id;

      // Verify no journal batch yet
      const [prePostBatches] = await db.execute(
        `SELECT COUNT(*) as count FROM journal_batches
         WHERE company_id = ? AND doc_type = ? AND doc_id = ?`,
        [companyId, SALES_CREDIT_NOTE_DOC_TYPE, creditNoteId]
      );
      assert.strictEqual(prePostBatches[0].count, 0);

      // Post credit note
      const postRes = await apiRequest(baseUrl, `/api/sales/credit-notes/${creditNoteId}/post`, {
        method: "POST",
        headers: authHeaders
      });

      assert.strictEqual(postRes.status, 200, JSON.stringify(postRes.body));
      assert.strictEqual(postRes.body.data.status, "POSTED");

      // Verify exactly one journal batch created
      const [batches] = await db.execute(
        `SELECT id FROM journal_batches
         WHERE company_id = ? AND doc_type = ? AND doc_id = ?`,
        [companyId, SALES_CREDIT_NOTE_DOC_TYPE, creditNoteId]
      );
      assert.strictEqual(batches.length, 1);

      const batchId = batches[0].id;

      // Verify journal lines are balanced
      const [lines] = await db.execute(
        `SELECT account_id, debit, credit, description FROM journal_lines
         WHERE journal_batch_id = ? ORDER BY id`,
        [batchId]
      );

      assert.strictEqual(lines.length, 2); // Sales Returns Dr, AR Cr

      const totalDebit = lines.reduce((sum, line) => sum + Number(line.debit), 0);
      const totalCredit = lines.reduce((sum, line) => sum + Number(line.credit), 0);

      assert.strictEqual(totalDebit, totalCredit);
      assert.strictEqual(totalDebit, 300);

      // Verify invoice paid_total reduced
      const [invRows] = await db.execute(
        `SELECT paid_total, payment_status FROM sales_invoices WHERE id = ?`,
        [invoiceId]
      );
      assert.strictEqual(Number(invRows[0].paid_total), 0);
      assert.strictEqual(invRows[0].payment_status, "UNPAID");
    });

    await t.test("Posted credit note void creates reversal journal", { timeout: 30000 }, async () => {
      const invoiceNo = `TEST-INV-CN2-${randomUUID().slice(0, 8)}`;
      testInvoiceNos.push(invoiceNo);

      // Create and post invoice for 1000, fully pay it
      const invoiceRes = await apiRequest(baseUrl, "/api/sales/invoices", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          outlet_id: outletId,
          invoice_no: invoiceNo,
          invoice_date: "2024-01-15",
          tax_amount: 0,
          lines: [{ description: "Service", qty: 1, unit_price: 1000 }]
        })
      });

      const invoiceId = invoiceRes.body.data.id;

      await apiRequest(baseUrl, `/api/sales/invoices/${invoiceId}/post`, {
        method: "POST",
        headers: authHeaders
      });

      // Pay invoice in full
      const paymentNo = `TEST-PAY-CN2-${randomUUID().slice(0, 8)}`;
      testPaymentNos.push(paymentNo);
      const paymentRes = await apiRequest(baseUrl, "/api/sales/payments", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          outlet_id: outletId,
          invoice_id: invoiceId,
          payment_no: paymentNo,
          payment_at: openFiscalDateTime,
          account_id: mappingFixture.accountIdsByKey.CASH,
          method: "CASH",
          amount: 1000
        })
      });
      assert.strictEqual(paymentRes.status, 201, JSON.stringify(paymentRes.body));
      const paymentId = paymentRes.body.data.id;
      const paymentPostRes = await apiRequest(baseUrl, `/api/sales/payments/${paymentId}/post`, {
        method: "POST",
        headers: authHeaders
      });
      assert.strictEqual(paymentPostRes.status, 200, JSON.stringify(paymentPostRes.body));

      // Create and post credit note for 200
      const cnRes = await apiRequest(baseUrl, "/api/sales/credit-notes", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          outlet_id: outletId,
          invoice_id: invoiceId,
          credit_note_date: openFiscalDate,
          amount: 200,
          lines: [{ description: "Refund", qty: 1, unit_price: 200 }]
        })
      });

      const creditNoteId = cnRes.body.data.id;
      testCreditNoteNos.push(cnRes.body.data.credit_note_no);

      await apiRequest(baseUrl, `/api/sales/credit-notes/${creditNoteId}/post`, {
        method: "POST",
        headers: authHeaders
      });

      // Count batches before void
      const [beforeBatches] = await db.execute(
        `SELECT COUNT(*) as count FROM journal_batches
         WHERE company_id = ? AND doc_id = ? AND doc_type LIKE 'SALES_CREDIT_NOTE%'`,
        [companyId, creditNoteId]
      );
      assert.strictEqual(beforeBatches[0].count, 1);

      // Void the credit note
      const voidRes = await apiRequest(baseUrl, `/api/sales/credit-notes/${creditNoteId}/void`, {
        method: "POST",
        headers: authHeaders
      });

      assert.strictEqual(voidRes.status, 200);
      assert.strictEqual(voidRes.body.data.status, "VOID");

      // Verify reversal batch created
      const [batches] = await db.execute(
        `SELECT id, doc_type FROM journal_batches
         WHERE company_id = ? AND doc_id = ? AND doc_type LIKE 'SALES_CREDIT_NOTE%'
         ORDER BY id`,
        [companyId, creditNoteId]
      );
      assert.strictEqual(batches.length, 2);
      assert.strictEqual(batches[1].doc_type, SALES_CREDIT_NOTE_VOID_DOC_TYPE);

      // Verify reversal lines are balanced and reversed
      const [voidLines] = await db.execute(
        `SELECT debit, credit FROM journal_lines WHERE journal_batch_id = ? ORDER BY id`,
        [batches[1].id]
      );

      const totalDebit = voidLines.reduce((sum, line) => sum + Number(line.debit), 0);
      const totalCredit = voidLines.reduce((sum, line) => sum + Number(line.credit), 0);

      assert.strictEqual(totalDebit, totalCredit);
      assert.strictEqual(totalDebit, 200);

      // Verify invoice paid_total restored
      const [invRows] = await db.execute(
        `SELECT paid_total, payment_status FROM sales_invoices WHERE id = ?`,
        [invoiceId]
      );
      assert.strictEqual(Number(invRows[0].paid_total), 1000);
      assert.strictEqual(invRows[0].payment_status, "PAID");
    });

    await t.test("Over-credit rejected with no journal side effects", { timeout: 30000 }, async () => {
      const invoiceNo = `TEST-INV-CN3-${randomUUID().slice(0, 8)}`;
      testInvoiceNos.push(invoiceNo);

      // Create and post invoice for 500
      const invoiceRes = await apiRequest(baseUrl, "/api/sales/invoices", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          outlet_id: outletId,
          invoice_no: invoiceNo,
          invoice_date: "2024-01-15",
          tax_amount: 0,
          lines: [{ description: "Service", qty: 1, unit_price: 500 }]
        })
      });

      const invoiceId = invoiceRes.body.data.id;

      await apiRequest(baseUrl, `/api/sales/invoices/${invoiceId}/post`, {
        method: "POST",
        headers: authHeaders
      });

      // Create first credit note for 300 (should succeed)
      const cn1Res = await apiRequest(baseUrl, "/api/sales/credit-notes", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          outlet_id: outletId,
          invoice_id: invoiceId,
          credit_note_date: openFiscalDate,
          amount: 300,
          lines: [{ description: "Partial refund", qty: 1, unit_price: 300 }]
        })
      });
      const cn1Id = cn1Res.body.data.id;
      testCreditNoteNos.push(cn1Res.body.data.credit_note_no);
      await apiRequest(baseUrl, `/api/sales/credit-notes/${cn1Id}/post`, {
        method: "POST",
        headers: authHeaders
      });

      // Try to create second credit note for 300 (total 600 > 500)
      const cn2Res = await apiRequest(baseUrl, "/api/sales/credit-notes", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          outlet_id: outletId,
          invoice_id: invoiceId,
          credit_note_date: openFiscalDate,
          amount: 300,
          lines: [{ description: "Over refund", qty: 1, unit_price: 300 }]
        })
      });

      assert.strictEqual(cn2Res.status, 409);
      assert.strictEqual(cn2Res.body.success, false);
      assert.strictEqual(cn2Res.body.error.code, "CONFLICT");

      // Verify no credit note was created
      const [cnRows] = await db.execute(
        `SELECT COUNT(*) as count FROM sales_credit_notes
         WHERE company_id = ? AND invoice_id = ?`,
        [companyId, invoiceId]
      );
      assert.strictEqual(cnRows[0].count, 1); // Only the first one
    });

    await t.test("Credit note create is idempotent with client_ref", { timeout: 30000 }, async () => {
      const invoiceNo = `TEST-INV-CN4-${randomUUID().slice(0, 8)}`;
      const clientRef = randomUUID();
      testInvoiceNos.push(invoiceNo);

      // Create and post invoice
      const invoiceRes = await apiRequest(baseUrl, "/api/sales/invoices", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          outlet_id: outletId,
          invoice_no: invoiceNo,
          invoice_date: "2024-01-15",
          tax_amount: 0,
          lines: [{ description: "Service", qty: 1, unit_price: 1000 }]
        })
      });

      const invoiceId = invoiceRes.body.data.id;

      await apiRequest(baseUrl, `/api/sales/invoices/${invoiceId}/post`, {
        method: "POST",
        headers: authHeaders
      });

      const payload = {
        outlet_id: outletId,
        invoice_id: invoiceId,
        credit_note_date: openFiscalDate,
        amount: 200,
        client_ref: clientRef,
        lines: [{ description: "Refund", qty: 1, unit_price: 200 }]
      };

      const firstRes = await apiRequest(baseUrl, "/api/sales/credit-notes", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify(payload)
      });

      assert.strictEqual(firstRes.status, 201);
      assert.strictEqual(firstRes.body.success, true);
      const firstId = firstRes.body.data.id;
      testCreditNoteNos.push(firstRes.body.data.credit_note_no);

      const retryRes = await apiRequest(baseUrl, "/api/sales/credit-notes", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify(payload)
      });

      assert.strictEqual(retryRes.status, 201);
      assert.strictEqual(retryRes.body.success, true);
      assert.strictEqual(retryRes.body.data.id, firstId);
      assert.strictEqual(retryRes.body.data.client_ref, clientRef);

      const [rows] = await db.execute(
        `SELECT COUNT(*) as count FROM sales_credit_notes
         WHERE company_id = ? AND client_ref = ?`,
        [companyId, clientRef]
      );

      assert.strictEqual(Number(rows[0].count), 1);
    });

    await t.test("Credit note create without client_ref is non-idempotent", { timeout: 30000 }, async () => {
      const invoiceNo = `TEST-INV-CN5-${randomUUID().slice(0, 8)}`;
      testInvoiceNos.push(invoiceNo);

      // Create and post invoice
      const invoiceRes = await apiRequest(baseUrl, "/api/sales/invoices", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          outlet_id: outletId,
          invoice_no: invoiceNo,
          invoice_date: "2024-01-15",
          tax_amount: 0,
          lines: [{ description: "Service", qty: 1, unit_price: 1000 }]
        })
      });

      const invoiceId = invoiceRes.body.data.id;

      await apiRequest(baseUrl, `/api/sales/invoices/${invoiceId}/post`, {
        method: "POST",
        headers: authHeaders
      });

      const payload = {
        outlet_id: outletId,
        invoice_id: invoiceId,
        credit_note_date: openFiscalDate,
        amount: 100,
        lines: [{ description: "Refund", qty: 1, unit_price: 100 }]
      };

      const firstRes = await apiRequest(baseUrl, "/api/sales/credit-notes", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify(payload)
      });

      assert.strictEqual(firstRes.status, 201);
      assert.strictEqual(firstRes.body.success, true);
      const firstId = firstRes.body.data.id;

      const secondRes = await apiRequest(baseUrl, "/api/sales/credit-notes", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify(payload)
      });

      assert.strictEqual(secondRes.status, 201);
      assert.strictEqual(secondRes.body.success, true);
      const secondId = secondRes.body.data.id;

      // Without client_ref, two separate credit notes should be created
      assert.notStrictEqual(firstId, secondId);

      const [rows] = await db.execute(
        `SELECT COUNT(*) as count FROM sales_credit_notes
         WHERE company_id = ? AND invoice_id = ?`,
        [companyId, invoiceId]
      );

      assert.strictEqual(Number(rows[0].count), 2);

      // Track both for cleanup
      testCreditNoteNos.push(firstRes.body.data.credit_note_no);
      testCreditNoteNos.push(secondRes.body.data.credit_note_no);
    });
  } finally {
    // Cleanup
    console.log('Cleaning up test data...');
    try {
      if (mappingFixture) {
        if (mappingFixture.createdMappingKeys.length > 0) {
          const placeholders = mappingFixture.createdMappingKeys.map(() => "?").join(", ");
          await db.execute(
            `DELETE FROM outlet_account_mappings
             WHERE company_id = ?
               AND outlet_id = ?
               AND mapping_key IN (${placeholders})`,
            [companyId, outletId, ...mappingFixture.createdMappingKeys]
          );
        }

        if (mappingFixture.createdAccountIds.length > 0) {
          const placeholders = mappingFixture.createdAccountIds.map(() => "?").join(", ");
          await db.execute(
            `DELETE FROM journal_lines
             WHERE company_id = ?
               AND account_id IN (${placeholders})`,
            [companyId, ...mappingFixture.createdAccountIds]
          );
          await db.execute(
            `DELETE FROM sales_payments
             WHERE company_id = ?
               AND account_id IN (${placeholders})`,
            [companyId, ...mappingFixture.createdAccountIds]
          );
          await db.execute(
            `DELETE FROM accounts
             WHERE company_id = ?
               AND id IN (${placeholders})`,
            [companyId, ...mappingFixture.createdAccountIds]
          );
        }
      }

      await cleanupTestPayments(db, testPaymentNos);
      await cleanupTestCreditNotes(db, companyId, testCreditNoteNos);
      await cleanupTestJournals(db, companyId, testInvoiceNos);
      await cleanupTestInvoices(db, testInvoiceNos);
      if (testJournalBatchIds.length > 0) {
        const placeholders = testJournalBatchIds.map(() => "?").join(", ");
        await db.execute(
          `DELETE FROM journal_lines
           WHERE journal_batch_id IN (${placeholders})`,
          testJournalBatchIds
        );
        await db.execute(
          `DELETE FROM journal_batches
           WHERE id IN (${placeholders})`,
          testJournalBatchIds
        );
      }
      console.log('Database cleanup complete');
    } catch (cleanupErr) {
      console.error('Cleanup error:', cleanupErr);
    }

    
  }
});
