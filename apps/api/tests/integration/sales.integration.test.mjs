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

const SALES_INVOICE_DOC_TYPE = "SALES_INVOICE";
const SALES_PAYMENT_IN_DOC_TYPE = "SALES_PAYMENT_IN";

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

  if (status !== 200 || !body.ok) {
    throw new Error(`Login failed: ${JSON.stringify(body)}`);
  }

  return body.access_token;
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
  if (typeof clause === "string" && clause.includes("'CARD'")) {
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
     CHECK (mapping_key IN ('CASH', 'QRIS', 'CARD', 'SALES_REVENUE', 'SALES_TAX', 'AR'))`
  );
}

function buildTestAccountCode(mappingKey) {
  const suffix = randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();
  const base = `IT${mappingKey.replaceAll("_", "")}${suffix}`;
  return base.slice(0, 32);
}

async function ensureOutletAccountMappings(db, companyId, outletId) {
  const mappingKeys = ["CASH", "QRIS", "CARD", "SALES_REVENUE", "SALES_TAX", "AR"];
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
    const [accountInsertResult] = await db.execute(
      `INSERT INTO accounts (company_id, code, name)
       VALUES (?, ?, ?)`,
      [companyId, accountCode, `Integration Test ${mappingKey}`]
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

  return {
    createdMappingKeys,
    createdAccountIds
  };
}

async function setupTestData(db) {
  const companyId = 1;
  const outletId = 1;
  const userId = 1;

  // Ensure outlet account mappings exist
  await ensureOutletAccountMappingConstraint(db);
  const mappingFixture = await ensureOutletAccountMappings(db, companyId, outletId);

  return { companyId, outletId, userId, mappingFixture };
}

async function cleanupTestInvoices(db, invoiceNos) {
  if (invoiceNos.length === 0) return;

  const placeholders = invoiceNos.map(() => "?").join(", ");
  await db.execute(
    `DELETE FROM sales_invoices WHERE invoice_no IN (${placeholders})`,
    invoiceNos
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

test("Sales Integration Tests", { timeout: TEST_TIMEOUT_MS }, async (t) => {
  if (typeof loadEnvFile === "function") {
    try {
      loadEnvFile(ENV_PATH);
    } catch {
      // Ignore if .env doesn't exist
    }
  }

  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const { childProcess, serverLogs } = startApiServer(port);

  const db = await mysql.createConnection(dbConfigFromEnv());
  const testInvoiceNos = [];
  const testPaymentNos = [];
  let companyId = 0;
  let outletId = 0;
  let mappingFixture = null;

  try {
    console.log(`Starting test server on port ${port}...`);
    await waitForServerReady(baseUrl, serverLogs);
    console.log('Server ready, setting up test data...');
    const setupResult = await setupTestData(db);
    companyId = setupResult.companyId;
    outletId = setupResult.outletId;
    mappingFixture = setupResult.mappingFixture;
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

    await t.test("Invoice draft create/update + post creates journal batch", { timeout: 30000 }, async () => {
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
      assert.strictEqual(createRes.body.ok, true);
      assert.strictEqual(createRes.body.invoice.status, "DRAFT");
      assert.strictEqual(createRes.body.invoice.payment_status, "UNPAID");
      assert.strictEqual(createRes.body.invoice.subtotal, 1000);
      assert.strictEqual(createRes.body.invoice.grand_total, 1100);

      const invoiceId = createRes.body.invoice.id;

      // Update draft invoice
      const updateRes = await apiRequest(baseUrl, `/api/sales/invoices/${invoiceId}`, {
        method: "PATCH",
        headers: authHeaders,
        body: JSON.stringify({
          tax_amount: 110
        })
      });

      assert.strictEqual(updateRes.status, 200);
      assert.strictEqual(updateRes.body.invoice.grand_total, 1110);

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

      assert.strictEqual(postRes.status, 200);
      assert.strictEqual(postRes.body.invoice.status, "POSTED");

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

      const invoiceId = invoiceRes.body.invoice.id;

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
          payment_at: new Date().toISOString(),
          method: "CASH",
          amount: 1000
        })
      });

      assert.strictEqual(createRes.status, 201);
      assert.strictEqual(createRes.body.payment.status, "DRAFT");

      const paymentId = createRes.body.payment.id;

      // Post payment
      const postRes = await apiRequest(baseUrl, `/api/sales/payments/${paymentId}/post`, {
        method: "POST",
        headers: authHeaders
      });

      assert.strictEqual(postRes.status, 200);
      assert.strictEqual(postRes.body.payment.status, "POSTED");

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

      const invoiceId = invoiceRes.body.invoice.id;

      await apiRequest(baseUrl, `/api/sales/invoices/${invoiceId}/post`, {
        method: "POST",
        headers: authHeaders
      });

      // Check initial state
      let getRes = await apiRequest(baseUrl, `/api/sales/invoices/${invoiceId}`, {
        headers: authHeaders
      });

      assert.strictEqual(getRes.body.invoice.grand_total, 1000);
      assert.strictEqual(getRes.body.invoice.paid_total, 0);
      assert.strictEqual(getRes.body.invoice.payment_status, "UNPAID");

      // Create and post payment for 1000
      const paymentRes = await apiRequest(baseUrl, "/api/sales/payments", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          outlet_id: outletId,
          invoice_id: invoiceId,
          payment_no: paymentNo,
          payment_at: new Date().toISOString(),
          method: "CASH",
          amount: 1000
        })
      });

      const paymentId = paymentRes.body.payment.id;

      await apiRequest(baseUrl, `/api/sales/payments/${paymentId}/post`, {
        method: "POST",
        headers: authHeaders
      });

      // Check invoice updated correctly
      getRes = await apiRequest(baseUrl, `/api/sales/invoices/${invoiceId}`, {
        headers: authHeaders
      });

      assert.strictEqual(getRes.body.invoice.paid_total, 1000);
      assert.strictEqual(getRes.body.invoice.payment_status, "PAID");
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

      const invoiceId = invoiceRes.body.invoice.id;

      await apiRequest(baseUrl, `/api/sales/invoices/${invoiceId}/post`, {
        method: "POST",
        headers: authHeaders
      });

      // Initial state: UNPAID
      let getRes = await apiRequest(baseUrl, `/api/sales/invoices/${invoiceId}`, {
        headers: authHeaders
      });
      assert.strictEqual(getRes.body.invoice.payment_status, "UNPAID");

      // First payment: 400
      const payment1Res = await apiRequest(baseUrl, "/api/sales/payments", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          outlet_id: outletId,
          invoice_id: invoiceId,
          payment_no: payment1No,
          payment_at: new Date().toISOString(),
          method: "CASH",
          amount: 400
        })
      });

      await apiRequest(baseUrl, `/api/sales/payments/${payment1Res.body.payment.id}/post`, {
        method: "POST",
        headers: authHeaders
      });

      // After first payment: PARTIAL
      getRes = await apiRequest(baseUrl, `/api/sales/invoices/${invoiceId}`, {
        headers: authHeaders
      });
      assert.strictEqual(getRes.body.invoice.paid_total, 400);
      assert.strictEqual(getRes.body.invoice.payment_status, "PARTIAL");

      // Second payment: 600
      const payment2Res = await apiRequest(baseUrl, "/api/sales/payments", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          outlet_id: outletId,
          invoice_id: invoiceId,
          payment_no: payment2No,
          payment_at: new Date().toISOString(),
          method: "QRIS",
          amount: 600
        })
      });

      await apiRequest(baseUrl, `/api/sales/payments/${payment2Res.body.payment.id}/post`, {
        method: "POST",
        headers: authHeaders
      });

      // After second payment: PAID
      getRes = await apiRequest(baseUrl, `/api/sales/invoices/${invoiceId}`, {
        headers: authHeaders
      });
      assert.strictEqual(getRes.body.invoice.paid_total, 1000);
      assert.strictEqual(getRes.body.invoice.payment_status, "PAID");
    });

    await t.test("Overpayment rejected with no journal side effects", { timeout: 30000 }, async () => {
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

      const invoiceId = invoiceRes.body.invoice.id;

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
          payment_at: new Date().toISOString(),
          method: "CASH",
          amount: 1500
        })
      });

      const paymentId = paymentRes.body.payment.id;

      // Count journal batches before post attempt
      const [beforeBatches] = await db.execute(
        `SELECT COUNT(*) as count FROM journal_batches 
         WHERE company_id = ? AND doc_type = ? AND doc_id = ?`,
        [companyId, SALES_PAYMENT_IN_DOC_TYPE, paymentId]
      );

      // Try to post overpayment (should fail)
      const postRes = await apiRequest(baseUrl, `/api/sales/payments/${paymentId}/post`, {
        method: "POST",
        headers: authHeaders
      });

      assert.strictEqual(postRes.status, 409);
      assert.strictEqual(postRes.body.ok, false);
      assert.strictEqual(postRes.body.error.code, "ALLOCATION_ERROR");

      // Verify no journal batch was created
      const [afterBatches] = await db.execute(
        `SELECT COUNT(*) as count FROM journal_batches 
         WHERE company_id = ? AND doc_type = ? AND doc_id = ?`,
        [companyId, SALES_PAYMENT_IN_DOC_TYPE, paymentId]
      );

      assert.strictEqual(beforeBatches[0].count, afterBatches[0].count);

      // Verify invoice unchanged
      const getRes = await apiRequest(baseUrl, `/api/sales/invoices/${invoiceId}`, {
        headers: authHeaders
      });

      assert.strictEqual(getRes.body.invoice.paid_total, 0);
      assert.strictEqual(getRes.body.invoice.payment_status, "UNPAID");
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

      const invoiceId = createRes.body.invoice.id;

      // First post
      const post1Res = await apiRequest(baseUrl, `/api/sales/invoices/${invoiceId}/post`, {
        method: "POST",
        headers: authHeaders
      });

      assert.strictEqual(post1Res.status, 200);
      assert.strictEqual(post1Res.body.invoice.status, "POSTED");

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
      assert.strictEqual(post2Res.body.invoice.status, "POSTED");

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
            `DELETE FROM accounts
             WHERE company_id = ?
               AND id IN (${placeholders})`,
            [companyId, ...mappingFixture.createdAccountIds]
          );
        }
      }

      await cleanupTestPayments(db, testPaymentNos);
      await cleanupTestInvoices(db, testInvoiceNos);
      await db.end();
      console.log('Database cleanup complete');
    } catch (cleanupErr) {
      console.error('Cleanup error:', cleanupErr);
    }

    console.log('Stopping test server...');
    childProcess.kill("SIGTERM");

    await new Promise((resolve) => {
      let resolved = false;
      
      childProcess.once("exit", () => {
        if (!resolved) {
          resolved = true;
          console.log('Server stopped gracefully');
          resolve();
        }
      });
      
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          console.log('Forcing server stop with SIGKILL');
          childProcess.kill("SIGKILL");
          resolve();
        }
      }, 3000);
    });

    if (childProcess.exitCode !== 0 && childProcess.exitCode != null) {
      console.error("Server exited with code:", childProcess.exitCode);
      console.error("Server logs:\n" + serverLogs.slice(-20).join(""));
    }
  }
});
