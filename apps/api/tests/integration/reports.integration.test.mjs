import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
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
const DAILY_SALES_VIEW_SQL = `CREATE OR REPLACE VIEW v_pos_daily_totals AS
SELECT pt.company_id,
       pt.outlet_id,
       DATE(pt.trx_at) AS trx_date,
       pt.status,
       COUNT(*) AS tx_count,
       COALESCE(SUM(i.gross_total), 0) AS gross_total,
       COALESCE(SUM(p.paid_total), 0) AS paid_total
FROM pos_transactions pt
LEFT JOIN (
  SELECT pos_transaction_id,
         SUM(qty * price_snapshot) AS gross_total
  FROM pos_transaction_items
  GROUP BY pos_transaction_id
) i ON i.pos_transaction_id = pt.id
LEFT JOIN (
  SELECT pos_transaction_id,
         SUM(amount) AS paid_total
  FROM pos_transaction_payments
  GROUP BY pos_transaction_id
) p ON p.pos_transaction_id = pt.id
GROUP BY pt.company_id, pt.outlet_id, DATE(pt.trx_at), pt.status`;

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

async function ensureDailySalesView(db) {
  await db.execute(DAILY_SALES_VIEW_SQL);
}

async function loginOwner(baseUrl, companyCode, ownerEmail, ownerPassword) {
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
  assert.equal(loginBody.ok, true);
  return loginBody.access_token;
}

test(
  "reports integration: owner can view daily sales and journals",
  { timeout: TEST_TIMEOUT_MS, concurrency: false },
  async () => {
    if (typeof loadEnvFile === "function" && existsSync(ENV_PATH)) {
      loadEnvFile(ENV_PATH);
    }

    const db = await mysql.createConnection(dbConfigFromEnv());
    let childProcess;
    let txClientId = "";
    let accountId = 0;
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
        throw new Error(
          "owner fixture not found; run `npm run db:migrate && npm run db:seed` before integration tests"
        );
      }

      const companyId = Number(owner.company_id);
      const outletId = Number(owner.outlet_id);

      txClientId = randomUUID();
      const trxAt = new Date();
      const trxAtSql = trxAt.toISOString().slice(0, 19).replace("T", " ");

      const [txInsert] = await db.execute(
        `INSERT INTO pos_transactions (
           company_id,
           outlet_id,
           client_tx_id,
           status,
           trx_at,
           payload_sha256,
           payload_hash_version
         ) VALUES (?, ?, ?, 'COMPLETED', ?, '', 1)`,
        [companyId, outletId, txClientId, trxAtSql]
      );
      const txId = Number(txInsert.insertId);

      await db.execute(
        `INSERT INTO pos_transaction_items (
           pos_transaction_id,
           company_id,
           outlet_id,
           line_no,
           item_id,
           qty,
           price_snapshot,
           name_snapshot
         ) VALUES (?, ?, ?, 1, 1, 1, 50000, 'Integration Item')`,
        [txId, companyId, outletId]
      );

      await db.execute(
        `INSERT INTO pos_transaction_payments (
           pos_transaction_id,
           company_id,
           outlet_id,
           payment_no,
           method,
           amount
         ) VALUES (?, ?, ?, 1, 'CASH', 50000)`,
        [txId, companyId, outletId]
      );

      const accountCode = `ITRPT${runId}`.slice(0, 32).toUpperCase();
      const [accountInsert] = await db.execute(
        `INSERT INTO accounts (company_id, code, name)
         VALUES (?, ?, ?)`,
        [companyId, accountCode, `IT Reports Account ${runId}`]
      );
      accountId = Number(accountInsert.insertId);

      const [batchInsert] = await db.execute(
        `INSERT INTO journal_batches (company_id, outlet_id, doc_type, doc_id, posted_at)
         VALUES (?, ?, 'IT_REPORT', ?, ?)`,
        [companyId, outletId, Number(Date.now()), trxAtSql]
      );
      journalBatchId = Number(batchInsert.insertId);

      const lineDate = trxAt.toISOString().slice(0, 10);
      await db.execute(
        `INSERT INTO journal_lines (
           journal_batch_id,
           company_id,
           outlet_id,
           account_id,
           line_date,
           debit,
           credit,
           description
         ) VALUES
           (?, ?, ?, ?, ?, 100, 0, 'IT debit'),
           (?, ?, ?, ?, ?, 0, 100, 'IT credit')`,
        [journalBatchId, companyId, outletId, accountId, lineDate, journalBatchId, companyId, outletId, accountId, lineDate]
      );

      const dateFrom = new Date();
      dateFrom.setDate(dateFrom.getDate() - 1);
      const dateFromIso = dateFrom.toISOString().slice(0, 10);
      const dateToIso = new Date().toISOString().slice(0, 10);

      const port = await getFreePort();
      const baseUrl = `http://127.0.0.1:${port}`;
      const server = startApiServer(port);
      childProcess = server.childProcess;
      await waitForHealthcheck(baseUrl, childProcess, server.serverLogs);

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
      assert.equal(loginBody.ok, true);
      const accessToken = loginBody.access_token;

      const posResponse = await fetch(
        `${baseUrl}/api/reports/pos-transactions?outlet_id=${outletId}&date_from=${dateFromIso}&date_to=${dateToIso}`,
        {
          headers: {
            authorization: `Bearer ${accessToken}`
          }
        }
      );
      assert.equal(posResponse.status, 200);
      const posBody = await posResponse.json();
      assert.equal(posBody.ok, true);
      assert.equal(Array.isArray(posBody.transactions), true);
      assert.equal(typeof posBody.total, "number");

      const dailySalesResponse = await fetch(
        `${baseUrl}/api/reports/daily-sales?outlet_id=${outletId}&date_from=${dateFromIso}&date_to=${dateToIso}`,
        {
          headers: {
            authorization: `Bearer ${accessToken}`
          }
        }
      );
      assert.equal(dailySalesResponse.status, 200);
      const dailySalesBody = await dailySalesResponse.json();
      assert.equal(dailySalesBody.ok, true);
      assert.equal(dailySalesBody.rows.length > 0, true);

      const journalsResponse = await fetch(
        `${baseUrl}/api/reports/journals?outlet_id=${outletId}&date_from=${dateFromIso}&date_to=${dateToIso}`,
        {
          headers: {
            authorization: `Bearer ${accessToken}`
          }
        }
      );
      assert.equal(journalsResponse.status, 200);
      const journalsBody = await journalsResponse.json();
      assert.equal(journalsBody.ok, true);
      assert.equal(
        journalsBody.journals.some((row) => row.id === journalBatchId && row.doc_type === "IT_REPORT"),
        true
      );

      const trialBalanceResponse = await fetch(
        `${baseUrl}/api/reports/trial-balance?outlet_id=${outletId}&date_from=${dateFromIso}&date_to=${dateToIso}`,
        {
          headers: {
            authorization: `Bearer ${accessToken}`
          }
        }
      );
      assert.equal(trialBalanceResponse.status, 200);
      const trialBalanceBody = await trialBalanceResponse.json();
      assert.equal(trialBalanceBody.ok, true);
      assert.equal(
        trialBalanceBody.rows.some((row) => Number(row.account_id) === accountId),
        true
      );
      assert.equal(
        Number(trialBalanceBody.totals.total_debit) >= Number(trialBalanceBody.totals.total_credit),
        true
      );
    } finally {
      await stopApiServer(childProcess);

      if (journalBatchId > 0) {
        await db.execute("DELETE FROM journal_lines WHERE journal_batch_id = ?", [journalBatchId]);
        await db.execute("DELETE FROM journal_batches WHERE id = ?", [journalBatchId]);
      }

      if (accountId > 0) {
        await db.execute("DELETE FROM accounts WHERE id = ?", [accountId]);
      }

      if (txClientId) {
        await db.execute("DELETE FROM pos_transactions WHERE client_tx_id = ?", [txClientId]);
      }

      await db.end();
    }
  }
);

test(
  "reports integration: POS date boundary uses inclusive-exclusive DATETIME window",
  { timeout: TEST_TIMEOUT_MS, concurrency: false },
  async () => {
    if (typeof loadEnvFile === "function" && existsSync(ENV_PATH)) {
      loadEnvFile(ENV_PATH);
    }

    const db = await mysql.createConnection(dbConfigFromEnv());
    let childProcess;
    const txInsideClientId = randomUUID();
    const txOutsideClientId = randomUUID();

    const companyCode = readEnv("JP_COMPANY_CODE", "JP");
    const outletCode = readEnv("JP_OUTLET_CODE", "MAIN");
    const ownerEmail = readEnv("JP_OWNER_EMAIL").toLowerCase();
    const ownerPassword = readEnv("JP_OWNER_PASSWORD");

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
        throw new Error(
          "owner fixture not found; run `npm run db:migrate && npm run db:seed` before integration tests"
        );
      }

      const companyId = Number(owner.company_id);
      const outletId = Number(owner.outlet_id);
      const boundaryDay = "2020-01-15";
      const insideDateTime = "2020-01-15 23:59:59";
      const outsideDateTime = "2020-01-16 00:00:00";

      await db.execute(
        `INSERT INTO pos_transactions (
           company_id,
           outlet_id,
           client_tx_id,
           status,
           trx_at,
           payload_sha256,
           payload_hash_version
         ) VALUES (?, ?, ?, 'VOID', ?, '', 1)`,
        [companyId, outletId, txInsideClientId, insideDateTime]
      );

      await db.execute(
        `INSERT INTO pos_transactions (
           company_id,
           outlet_id,
           client_tx_id,
           status,
           trx_at,
           payload_sha256,
           payload_hash_version
         ) VALUES (?, ?, ?, 'VOID', ?, '', 1)`,
        [companyId, outletId, txOutsideClientId, outsideDateTime]
      );

      const port = await getFreePort();
      const baseUrl = `http://127.0.0.1:${port}`;
      const server = startApiServer(port);
      childProcess = server.childProcess;
      await waitForHealthcheck(baseUrl, childProcess, server.serverLogs);

      const accessToken = await loginOwner(baseUrl, companyCode, ownerEmail, ownerPassword);

      const response = await fetch(
        `${baseUrl}/api/reports/pos-transactions?outlet_id=${outletId}&date_from=${boundaryDay}&date_to=${boundaryDay}&status=VOID&limit=200`,
        {
          headers: {
            authorization: `Bearer ${accessToken}`
          }
        }
      );
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.ok, true);

      const returnedClientTxIds = body.transactions.map((row) => row.client_tx_id);
      assert.equal(returnedClientTxIds.includes(txInsideClientId), true);
      assert.equal(returnedClientTxIds.includes(txOutsideClientId), false);
    } finally {
      await stopApiServer(childProcess);
      await db.execute("DELETE FROM pos_transactions WHERE client_tx_id IN (?, ?)", [txInsideClientId, txOutsideClientId]);
      await db.end();
    }
  }
);

test(
  "reports integration: journals/trial-balance outlet filter excludes null-outlet rows",
  { timeout: TEST_TIMEOUT_MS, concurrency: false },
  async () => {
    if (typeof loadEnvFile === "function" && existsSync(ENV_PATH)) {
      loadEnvFile(ENV_PATH);
    }

    const db = await mysql.createConnection(dbConfigFromEnv());
    let childProcess;
    let outletBatchId = 0;
    let nullBatchId = 0;
    let outletAccountId = 0;
    let nullAccountId = 0;

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
        throw new Error(
          "owner fixture not found; run `npm run db:migrate && npm run db:seed` before integration tests"
        );
      }

      const companyId = Number(owner.company_id);
      const outletId = Number(owner.outlet_id);
      const reportDate = "2020-02-20";
      const postedAtSql = "2020-02-20 12:00:00";

      const outletAccountCode = `ITRPTOS${runId}`.slice(0, 32).toUpperCase();
      const nullAccountCode = `ITRPTNS${runId}`.slice(0, 32).toUpperCase();

      const [outletAccountInsert] = await db.execute(
        `INSERT INTO accounts (company_id, code, name)
         VALUES (?, ?, ?)`,
        [companyId, outletAccountCode, `Outlet scoped account ${runId}`]
      );
      outletAccountId = Number(outletAccountInsert.insertId);

      const [nullAccountInsert] = await db.execute(
        `INSERT INTO accounts (company_id, code, name)
         VALUES (?, ?, ?)`,
        [companyId, nullAccountCode, `Null outlet account ${runId}`]
      );
      nullAccountId = Number(nullAccountInsert.insertId);

      const [outletBatchInsert] = await db.execute(
        `INSERT INTO journal_batches (company_id, outlet_id, doc_type, doc_id, posted_at)
         VALUES (?, ?, 'IT_SCOPE_OUTLET', ?, ?)`,
        [companyId, outletId, Number(Date.now()), postedAtSql]
      );
      outletBatchId = Number(outletBatchInsert.insertId);

      const [nullBatchInsert] = await db.execute(
        `INSERT INTO journal_batches (company_id, outlet_id, doc_type, doc_id, posted_at)
         VALUES (?, NULL, 'IT_SCOPE_NULL', ?, ?)`,
        [companyId, Number(Date.now()) + 1, postedAtSql]
      );
      nullBatchId = Number(nullBatchInsert.insertId);

      await db.execute(
        `INSERT INTO journal_lines (
           journal_batch_id,
           company_id,
           outlet_id,
           account_id,
           line_date,
           debit,
           credit,
           description
         ) VALUES (?, ?, ?, ?, ?, 100, 0, 'Outlet scoped trial row')`,
        [outletBatchId, companyId, outletId, outletAccountId, reportDate]
      );

      await db.execute(
        `INSERT INTO journal_lines (
           journal_batch_id,
           company_id,
           outlet_id,
           account_id,
           line_date,
           debit,
           credit,
           description
         ) VALUES (?, ?, NULL, ?, ?, 75, 0, 'Null outlet trial row')`,
        [nullBatchId, companyId, nullAccountId, reportDate]
      );

      const port = await getFreePort();
      const baseUrl = `http://127.0.0.1:${port}`;
      const server = startApiServer(port);
      childProcess = server.childProcess;
      await waitForHealthcheck(baseUrl, childProcess, server.serverLogs);

      const accessToken = await loginOwner(baseUrl, companyCode, ownerEmail, ownerPassword);

      const journalsResponse = await fetch(
        `${baseUrl}/api/reports/journals?outlet_id=${outletId}&date_from=${reportDate}&date_to=${reportDate}&limit=200`,
        {
          headers: {
            authorization: `Bearer ${accessToken}`
          }
        }
      );
      assert.equal(journalsResponse.status, 200);
      const journalsBody = await journalsResponse.json();
      assert.equal(journalsBody.ok, true);
      assert.equal(journalsBody.journals.some((row) => row.id === outletBatchId), true);
      assert.equal(journalsBody.journals.some((row) => row.id === nullBatchId), false);

      const trialBalanceResponse = await fetch(
        `${baseUrl}/api/reports/trial-balance?outlet_id=${outletId}&date_from=${reportDate}&date_to=${reportDate}`,
        {
          headers: {
            authorization: `Bearer ${accessToken}`
          }
        }
      );
      assert.equal(trialBalanceResponse.status, 200);
      const trialBalanceBody = await trialBalanceResponse.json();
      assert.equal(trialBalanceBody.ok, true);

      const accountIds = trialBalanceBody.rows.map((row) => Number(row.account_id));
      assert.equal(accountIds.includes(outletAccountId), true);
      assert.equal(accountIds.includes(nullAccountId), false);
    } finally {
      await stopApiServer(childProcess);

      if (outletBatchId > 0) {
        await db.execute("DELETE FROM journal_lines WHERE journal_batch_id = ?", [outletBatchId]);
        await db.execute("DELETE FROM journal_batches WHERE id = ?", [outletBatchId]);
      }

      if (nullBatchId > 0) {
        await db.execute("DELETE FROM journal_lines WHERE journal_batch_id = ?", [nullBatchId]);
        await db.execute("DELETE FROM journal_batches WHERE id = ?", [nullBatchId]);
      }

      if (outletAccountId > 0) {
        await db.execute("DELETE FROM accounts WHERE id = ?", [outletAccountId]);
      }

      if (nullAccountId > 0) {
        await db.execute("DELETE FROM accounts WHERE id = ?", [nullAccountId]);
      }

      await db.end();
    }
  }
);

test(
  "reports integration: daily-sales falls back to base tables when view is unavailable",
  { timeout: TEST_TIMEOUT_MS, concurrency: false },
  async () => {
    if (typeof loadEnvFile === "function" && existsSync(ENV_PATH)) {
      loadEnvFile(ENV_PATH);
    }

    const db = await mysql.createConnection(dbConfigFromEnv());
    let childProcess;
    let txClientId = "";

    const companyCode = readEnv("JP_COMPANY_CODE", "JP");
    const outletCode = readEnv("JP_OUTLET_CODE", "MAIN");
    const ownerEmail = readEnv("JP_OWNER_EMAIL").toLowerCase();
    const ownerPassword = readEnv("JP_OWNER_PASSWORD");

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
        throw new Error(
          "owner fixture not found; run `npm run db:migrate && npm run db:seed` before integration tests"
        );
      }

      const companyId = Number(owner.company_id);
      const outletId = Number(owner.outlet_id);
      const reportDate = "2099-03-10";
      const trxAtSql = "2099-03-10 10:15:00";

      await ensureDailySalesView(db);

      txClientId = randomUUID();
      const [txInsert] = await db.execute(
        `INSERT INTO pos_transactions (
           company_id,
           outlet_id,
           client_tx_id,
           status,
           trx_at,
           payload_sha256,
           payload_hash_version
         ) VALUES (?, ?, ?, 'COMPLETED', ?, '', 1)`,
        [companyId, outletId, txClientId, trxAtSql]
      );
      const txId = Number(txInsert.insertId);

      await db.execute(
        `INSERT INTO pos_transaction_items (
           pos_transaction_id,
           company_id,
           outlet_id,
           line_no,
           item_id,
           qty,
           price_snapshot,
           name_snapshot
         ) VALUES (?, ?, ?, 1, 1, 2, 15000, 'Fallback Item')`,
        [txId, companyId, outletId]
      );

      await db.execute(
        `INSERT INTO pos_transaction_payments (
           pos_transaction_id,
           company_id,
           outlet_id,
           payment_no,
           method,
           amount
         ) VALUES (?, ?, ?, 1, 'CASH', 30000)`,
        [txId, companyId, outletId]
      );

      const port = await getFreePort();
      const baseUrl = `http://127.0.0.1:${port}`;
      const server = startApiServer(port);
      childProcess = server.childProcess;
      await waitForHealthcheck(baseUrl, childProcess, server.serverLogs);

      const accessToken = await loginOwner(baseUrl, companyCode, ownerEmail, ownerPassword);

      await db.execute("DROP VIEW IF EXISTS v_pos_daily_totals");

      const response = await fetch(
        `${baseUrl}/api/reports/daily-sales?outlet_id=${outletId}&date_from=${reportDate}&date_to=${reportDate}&status=COMPLETED`,
        {
          headers: {
            authorization: `Bearer ${accessToken}`
          }
        }
      );
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.ok, true);

      const row = body.rows.find((entry) => Number(entry.outlet_id) === outletId);
      assert.equal(Boolean(row), true);
      assert.equal(Number(row.tx_count) >= 1, true);
      assert.equal(Number(row.gross_total) >= 30000, true);
      assert.equal(Number(row.paid_total) >= 30000, true);
    } finally {
      await stopApiServer(childProcess);
      await ensureDailySalesView(db);

      if (txClientId) {
        await db.execute("DELETE FROM pos_transactions WHERE client_tx_id = ?", [txClientId]);
      }

      await db.end();
    }
  }
);

test(
  "reports integration: POS as_of keeps pagination snapshot stable across concurrent inserts",
  { timeout: TEST_TIMEOUT_MS, concurrency: false },
  async () => {
    if (typeof loadEnvFile === "function" && existsSync(ENV_PATH)) {
      loadEnvFile(ENV_PATH);
    }

    const db = await mysql.createConnection(dbConfigFromEnv());
    let childProcess;
    const txIds = [randomUUID(), randomUUID(), randomUUID()];

    const companyCode = readEnv("JP_COMPANY_CODE", "JP");
    const outletCode = readEnv("JP_OUTLET_CODE", "MAIN");
    const ownerEmail = readEnv("JP_OWNER_EMAIL").toLowerCase();
    const ownerPassword = readEnv("JP_OWNER_PASSWORD");
    const reportDate = "2020-04-10";

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

      const companyId = Number(owner.company_id);
      const outletId = Number(owner.outlet_id);

      await db.execute(
        `INSERT INTO pos_transactions (
           company_id,
           outlet_id,
           client_tx_id,
           status,
           trx_at,
           payload_sha256,
           payload_hash_version
         ) VALUES
           (?, ?, ?, 'VOID', '${reportDate} 10:00:00', '', 1),
           (?, ?, ?, 'VOID', '${reportDate} 10:05:00', '', 1)`,
        [companyId, outletId, txIds[0], companyId, outletId, txIds[1]]
      );

      const port = await getFreePort();
      const baseUrl = `http://127.0.0.1:${port}`;
      const server = startApiServer(port);
      childProcess = server.childProcess;
      await waitForHealthcheck(baseUrl, childProcess, server.serverLogs);

      const accessToken = await loginOwner(baseUrl, companyCode, ownerEmail, ownerPassword);

      const page1Response = await fetch(
        `${baseUrl}/api/reports/pos-transactions?outlet_id=${outletId}&date_from=${reportDate}&date_to=${reportDate}&status=VOID&limit=1&offset=0`,
        {
          headers: {
            authorization: `Bearer ${accessToken}`
          }
        }
      );
      assert.equal(page1Response.status, 200);
      const page1Body = await page1Response.json();
      assert.equal(page1Body.ok, true);
      assert.equal(typeof page1Body.filters.as_of, "string");
      assert.equal(typeof page1Body.filters.as_of_id, "number");
      assert.equal(page1Body.total, 2);
      const firstPageClientTxId = page1Body.transactions[0]?.client_tx_id;

      await db.execute(
        `INSERT INTO pos_transactions (
           company_id,
           outlet_id,
           client_tx_id,
           status,
           trx_at,
           payload_sha256,
           payload_hash_version
         ) VALUES (?, ?, ?, 'VOID', '${reportDate} 10:10:00', '', 1)`,
        [companyId, outletId, txIds[2]]
      );

      const page2Response = await fetch(
        `${baseUrl}/api/reports/pos-transactions?outlet_id=${outletId}&date_from=${reportDate}&date_to=${reportDate}&status=VOID&limit=1&offset=1&as_of=${encodeURIComponent(page1Body.filters.as_of)}&as_of_id=${page1Body.filters.as_of_id}`,
        {
          headers: {
            authorization: `Bearer ${accessToken}`
          }
        }
      );
      assert.equal(page2Response.status, 200);
      const page2Body = await page2Response.json();
      assert.equal(page2Body.ok, true);
      assert.equal(page2Body.total, 2);

      const returnedPage2Ids = page2Body.transactions.map((row) => row.client_tx_id);
      assert.equal(returnedPage2Ids.includes(txIds[2]), false);
      assert.equal(returnedPage2Ids.includes(firstPageClientTxId), false);
    } finally {
      await stopApiServer(childProcess);
      await db.execute("DELETE FROM pos_transactions WHERE client_tx_id IN (?, ?, ?)", txIds);
      await db.end();
    }
  }
);

test(
  "reports integration: outlet filter denies inaccessible outlet",
  { timeout: TEST_TIMEOUT_MS, concurrency: false },
  async () => {
    if (typeof loadEnvFile === "function" && existsSync(ENV_PATH)) {
      loadEnvFile(ENV_PATH);
    }

    const db = await mysql.createConnection(dbConfigFromEnv());
    let childProcess;
    let deniedOutletId = 0;

    const companyCode = readEnv("JP_COMPANY_CODE", "JP");
    const ownerEmail = readEnv("JP_OWNER_EMAIL").toLowerCase();
    const ownerPassword = readEnv("JP_OWNER_PASSWORD");
    const runId = Date.now().toString(36);
    const deniedOutletCode = `RPTDENY${runId}`.slice(0, 32).toUpperCase();

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
      const [outletInsert] = await db.execute(
        `INSERT INTO outlets (company_id, code, name)
         VALUES (?, ?, ?)`,
        [companyId, deniedOutletCode, `Denied Reports Outlet ${runId}`]
      );
      deniedOutletId = Number(outletInsert.insertId);

      const port = await getFreePort();
      const baseUrl = `http://127.0.0.1:${port}`;
      const server = startApiServer(port);
      childProcess = server.childProcess;
      await waitForHealthcheck(baseUrl, childProcess, server.serverLogs);

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
      const accessToken = loginBody.access_token;

      for (const reportPath of [
        "/api/reports/pos-transactions",
        "/api/reports/daily-sales",
        "/api/reports/journals",
        "/api/reports/trial-balance"
      ]) {
        const response = await fetch(
          `${baseUrl}${reportPath}?outlet_id=${deniedOutletId}&date_from=2025-01-01&date_to=2026-12-31`,
          {
            headers: {
              authorization: `Bearer ${accessToken}`
            }
          }
        );
        assert.equal(response.status, 403);
        const body = await response.json();
        assert.equal(body.ok, false);
        assert.equal(body.error.code, "FORBIDDEN");
      }
    } finally {
      await stopApiServer(childProcess);

      if (deniedOutletId > 0) {
        await db.execute("DELETE FROM outlets WHERE id = ?", [deniedOutletId]);
      }

      await db.end();
    }
  }
);
