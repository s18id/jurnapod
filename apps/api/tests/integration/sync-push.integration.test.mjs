import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
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
const SYNC_PUSH_ACCEPTED_AUDIT_ACTION = "SYNC_PUSH_ACCEPTED";
const SYNC_PUSH_DUPLICATE_AUDIT_ACTION = "SYNC_PUSH_DUPLICATE";
const SYNC_PUSH_POSTING_HOOK_FAIL_AUDIT_ACTION = "SYNC_PUSH_POSTING_HOOK_FAIL";
const IDEMPOTENCY_CONFLICT_MESSAGE = "IDEMPOTENCY_CONFLICT";
const RETRYABLE_DB_LOCK_TIMEOUT_MESSAGE = "RETRYABLE_DB_LOCK_TIMEOUT";
const RETRYABLE_DB_DEADLOCK_MESSAGE = "RETRYABLE_DB_DEADLOCK";
const TEST_FORCE_DB_ERRNO_HEADER = "x-jp-sync-push-force-db-errno";
const TEST_FAIL_AFTER_HEADER_INSERT_HEADER = "x-jp-sync-push-fail-after-header";
const SYNC_PUSH_TEST_HOOKS_ENV = "JP_SYNC_PUSH_TEST_HOOKS";
const SYNC_PUSH_POSTING_MODE_ENV = "SYNC_PUSH_POSTING_MODE";
const SYNC_PUSH_POSTING_FORCE_UNBALANCED_ENV = "JP_SYNC_PUSH_POSTING_FORCE_UNBALANCED";
const POS_SALE_DOC_TYPE = "POS_SALE";
const OUTLET_ACCOUNT_MAPPING_KEYS = ["CASH", "QRIS", "CARD", "SALES_REVENUE", "SALES_TAX", "AR"];

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

function toMysqlDateTime(value) {
  return new Date(value).toISOString().slice(0, 19).replace("T", " ");
}

function computeLegacyPayloadSha256(transaction) {
  const canonical = JSON.stringify({
    client_tx_id: transaction.client_tx_id,
    company_id: transaction.company_id,
    outlet_id: transaction.outlet_id,
    cashier_user_id: transaction.cashier_user_id,
    status: transaction.status,
    trx_at: transaction.trx_at,
    items: transaction.items.map((item) => ({
      item_id: item.item_id,
      qty: item.qty,
      price_snapshot: item.price_snapshot,
      name_snapshot: item.name_snapshot
    })),
    payments: transaction.payments.map((payment) => ({
      method: payment.method,
      amount: payment.amount
    }))
  });

  return createHash("sha256").update(canonical).digest("hex");
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

function startApiServer(port, options = {}) {
  const enableSyncPushTestHooks = options.enableSyncPushTestHooks === true;
  const envOverrides = options.envOverrides ?? {};
  const childEnv = {
    ...process.env,
    NODE_ENV: "test",
    [SYNC_PUSH_TEST_HOOKS_ENV]: enableSyncPushTestHooks ? "1" : "0",
    ...envOverrides
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

function buildSyncTransaction({ clientTxId, companyId, outletId, cashierUserId, trxAt }) {
  return {
    client_tx_id: clientTxId,
    company_id: companyId,
    outlet_id: outletId,
    cashier_user_id: cashierUserId,
    status: "COMPLETED",
    trx_at: trxAt,
    items: [
      {
        item_id: 1,
        qty: 1,
        price_snapshot: 12500,
        name_snapshot: "Test Item"
      }
    ],
    payments: [
      {
        method: "CASH",
        amount: 12500
      }
    ]
  };
}

function assertSyncPushResponseShape(body) {
  assert.equal(typeof body, "object");
  assert.notEqual(body, null);
  assert.equal(Array.isArray(body.results), true);

  for (const item of body.results) {
    assert.equal(typeof item.client_tx_id, "string");
    assert.equal(
      item.result === "OK" || item.result === "DUPLICATE" || item.result === "ERROR",
      true
    );

    if ("message" in item && item.message !== undefined) {
      assert.equal(typeof item.message, "string");
    }
  }
}

async function countAcceptedSyncPushEvents(db, clientTxId) {
  const [rows] = await db.execute(
    `SELECT COUNT(*) AS total
     FROM audit_logs
     WHERE action = ?
       AND result = 'SUCCESS'
       AND JSON_UNQUOTE(JSON_EXTRACT(payload_json, '$.client_tx_id')) = ?`,
    [SYNC_PUSH_ACCEPTED_AUDIT_ACTION, clientTxId]
  );

  return Number(rows[0].total);
}

async function countDuplicateSyncPushEvents(db, clientTxId) {
  const [rows] = await db.execute(
    `SELECT COUNT(*) AS total
     FROM audit_logs
     WHERE action = ?
       AND result = 'SUCCESS'
       AND JSON_UNQUOTE(JSON_EXTRACT(payload_json, '$.client_tx_id')) = ?`,
    [SYNC_PUSH_DUPLICATE_AUDIT_ACTION, clientTxId]
  );

  return Number(rows[0].total);
}

async function readAcceptedSyncPushAuditPayload(db, clientTxId) {
  const [rows] = await db.execute(
    `SELECT payload_json
     FROM audit_logs
     WHERE action = ?
       AND result = 'SUCCESS'
       AND JSON_UNQUOTE(JSON_EXTRACT(payload_json, '$.client_tx_id')) = ?
     ORDER BY id DESC
     LIMIT 1`,
    [SYNC_PUSH_ACCEPTED_AUDIT_ACTION, clientTxId]
  );

  if (rows.length === 0) {
    return null;
  }

  const payloadJson = String(rows[0].payload_json ?? "{}");
  return JSON.parse(payloadJson);
}

async function readPostingHookFailureAuditPayload(db, clientTxId) {
  const [rows] = await db.execute(
    `SELECT payload_json
     FROM audit_logs
     WHERE action = ?
       AND result = 'FAIL'
       AND JSON_UNQUOTE(JSON_EXTRACT(payload_json, '$.client_tx_id')) = ?
     ORDER BY id DESC
     LIMIT 1`,
    [SYNC_PUSH_POSTING_HOOK_FAIL_AUDIT_ACTION, clientTxId]
  );

  if (rows.length === 0) {
    return null;
  }

  const payloadJson = String(rows[0].payload_json ?? "{}");
  return JSON.parse(payloadJson);
}

async function readDuplicateSyncPushAuditPayload(db, clientTxId) {
  const [rows] = await db.execute(
    `SELECT payload_json
     FROM audit_logs
     WHERE action = ?
       AND result = 'SUCCESS'
       AND JSON_UNQUOTE(JSON_EXTRACT(payload_json, '$.client_tx_id')) = ?
     ORDER BY id DESC
     LIMIT 1`,
    [SYNC_PUSH_DUPLICATE_AUDIT_ACTION, clientTxId]
  );

  if (rows.length === 0) {
    return null;
  }

  const payloadJson = String(rows[0].payload_json ?? "{}");
  return JSON.parse(payloadJson);
}

async function countSyncPushPersistedRows(db, clientTxId) {
  const [rows] = await db.execute(
    `SELECT
       (SELECT COUNT(*) FROM pos_transactions WHERE client_tx_id = ?) AS tx_total,
       (
         SELECT COUNT(*)
         FROM pos_transaction_items pti
         INNER JOIN pos_transactions pt ON pt.id = pti.pos_transaction_id
         WHERE pt.client_tx_id = ?
       ) AS item_total,
       (
         SELECT COUNT(*)
         FROM pos_transaction_payments ptp
         INNER JOIN pos_transactions pt ON pt.id = ptp.pos_transaction_id
         WHERE pt.client_tx_id = ?
       ) AS payment_total`,
    [clientTxId, clientTxId, clientTxId]
  );

  return {
    tx_total: Number(rows[0].tx_total),
    item_total: Number(rows[0].item_total),
    payment_total: Number(rows[0].payment_total)
  };
}

async function countSyncPushJournalRows(db, clientTxId) {
  const [rows] = await db.execute(
    `SELECT
       (
         SELECT COUNT(*)
         FROM journal_batches jb
         INNER JOIN pos_transactions pt ON pt.id = jb.doc_id
         WHERE jb.doc_type = ?
           AND pt.client_tx_id = ?
       ) AS batch_total,
       (
         SELECT COUNT(*)
         FROM journal_lines jl
         INNER JOIN journal_batches jb ON jb.id = jl.journal_batch_id
         INNER JOIN pos_transactions pt ON pt.id = jb.doc_id
         WHERE jb.doc_type = ?
           AND pt.client_tx_id = ?
       ) AS line_total`,
    [POS_SALE_DOC_TYPE, clientTxId, POS_SALE_DOC_TYPE, clientTxId]
  );

  return {
    batch_total: Number(rows[0].batch_total),
    line_total: Number(rows[0].line_total)
  };
}

async function readSyncPushJournalSummary(db, clientTxId) {
  const [rows] = await db.execute(
    `SELECT
       COALESCE(SUM(jl.debit), 0) AS debit_total,
       COALESCE(SUM(jl.credit), 0) AS credit_total,
       COALESCE(SUM(CASE WHEN jl.description = 'POS sales tax' THEN jl.credit ELSE 0 END), 0) AS tax_credit_total,
       COALESCE(SUM(CASE WHEN jl.description = 'POS sales tax' THEN 1 ELSE 0 END), 0) AS tax_line_total
     FROM journal_lines jl
     INNER JOIN journal_batches jb ON jb.id = jl.journal_batch_id
     INNER JOIN pos_transactions pt ON pt.id = jb.doc_id
     WHERE jb.doc_type = ?
       AND pt.client_tx_id = ?`,
    [POS_SALE_DOC_TYPE, clientTxId]
  );

  return {
    debit_total: Number(rows[0].debit_total),
    credit_total: Number(rows[0].credit_total),
    tax_credit_total: Number(rows[0].tax_credit_total),
    tax_line_total: Number(rows[0].tax_line_total)
  };
}

async function setCompanyDefaultTaxRate(db, companyId, config) {
  const [defaultRows] = await db.execute(
    `SELECT tax_rate_id
     FROM company_tax_defaults
     WHERE company_id = ?`,
    [companyId]
  );
  const previousDefaults = defaultRows.map((row) => Number(row.tax_rate_id)).filter((id) => id > 0);

  const code = `SYNC_TAX_${randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`;
  const [insertResult] = await db.execute(
    `INSERT INTO tax_rates (company_id, code, name, rate_percent, is_inclusive, is_active)
     VALUES (?, ?, ?, ?, ?, 1)`,
    [companyId, code, "Sync Tax", config.rate, config.inclusive ? 1 : 0]
  );
  const taxRateId = Number(insertResult.insertId);

  await db.execute(
    `DELETE FROM company_tax_defaults WHERE company_id = ?`,
    [companyId]
  );
  await db.execute(
    `INSERT INTO company_tax_defaults (company_id, tax_rate_id)
     VALUES (?, ?)`,
    [companyId, taxRateId]
  );

  return { previousDefaults, taxRateId };
}

async function restoreCompanyDefaultTaxRate(db, companyId, previous) {
  await db.execute(
    `DELETE FROM company_tax_defaults WHERE company_id = ?`,
    [companyId]
  );

  if (Array.isArray(previous.previousDefaults) && previous.previousDefaults.length > 0) {
    const placeholders = previous.previousDefaults.map(() => "(?, ?)").join(", ");
    const values = previous.previousDefaults.flatMap((taxRateId) => [companyId, taxRateId]);
    await db.execute(
      `INSERT INTO company_tax_defaults (company_id, tax_rate_id)
       VALUES ${placeholders}`,
      values
    );
  }

  if (Number.isFinite(previous.taxRateId)) {
    await db.execute(
      `DELETE FROM pos_transaction_taxes
       WHERE company_id = ?
         AND tax_rate_id = ?`,
      [companyId, previous.taxRateId]
    );
    await db.execute(
      `DELETE FROM sales_invoice_taxes
       WHERE company_id = ?
         AND tax_rate_id = ?`,
      [companyId, previous.taxRateId]
    );
    await db.execute(
      `DELETE FROM tax_rates WHERE id = ? AND company_id = ?`,
      [previous.taxRateId, companyId]
    );
  }
}

function buildTestAccountCode(mappingKey) {
  const suffix = randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();
  const base = `IT${mappingKey.replaceAll("_", "")}${suffix}`;
  return base.slice(0, 32);
}

async function ensureOutletAccountMappings(db, companyId, outletId) {
  const [constraintRows] = await db.execute(
    `SELECT check_clause
     FROM information_schema.check_constraints
     WHERE constraint_schema = DATABASE()
       AND constraint_name = 'chk_outlet_account_mappings_mapping_key'
     LIMIT 1`
  );

  const clause = constraintRows[0]?.check_clause ?? "";
  if (typeof clause !== "string" || !clause.includes("'CARD'")) {
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

  const placeholders = OUTLET_ACCOUNT_MAPPING_KEYS.map(() => "?").join(", ");
  const [existingRows] = await db.execute(
    `SELECT mapping_key
     FROM outlet_account_mappings
     WHERE company_id = ?
       AND outlet_id = ?
       AND mapping_key IN (${placeholders})`,
    [companyId, outletId, ...OUTLET_ACCOUNT_MAPPING_KEYS]
  );

  const existingKeys = new Set(
    (existingRows).map((row) => String(row.mapping_key ?? "")).filter((value) => value.length > 0)
  );

  const createdMappingKeys = [];
  const createdAccountIds = [];

  for (const mappingKey of OUTLET_ACCOUNT_MAPPING_KEYS) {
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

async function cleanupCreatedOutletAccountMappings(db, companyId, outletId, fixture) {
  if (fixture.createdMappingKeys.length > 0) {
    const mappingPlaceholders = fixture.createdMappingKeys.map(() => "?").join(", ");
    await db.execute(
      `DELETE FROM outlet_account_mappings
       WHERE company_id = ?
         AND outlet_id = ?
         AND mapping_key IN (${mappingPlaceholders})`,
      [companyId, outletId, ...fixture.createdMappingKeys]
    );
  }

  if (fixture.createdAccountIds.length > 0) {
    const accountPlaceholders = fixture.createdAccountIds.map(() => "?").join(", ");
    await db.execute(
      `DELETE FROM accounts
       WHERE company_id = ?
         AND id IN (${accountPlaceholders})`,
      [companyId, ...fixture.createdAccountIds]
    );
  }
}

async function cleanupSyncPushPersistedArtifacts(db, clientTxId) {
  await db.execute(
    `DELETE jl
     FROM journal_lines jl
     INNER JOIN journal_batches jb ON jb.id = jl.journal_batch_id
     INNER JOIN pos_transactions pt ON pt.id = jb.doc_id
     WHERE jb.doc_type = ?
       AND pt.client_tx_id = ?`,
    [POS_SALE_DOC_TYPE, clientTxId]
  );

  await db.execute(
    `DELETE jb
     FROM journal_batches jb
     INNER JOIN pos_transactions pt ON pt.id = jb.doc_id
     WHERE jb.doc_type = ?
       AND pt.client_tx_id = ?`,
    [POS_SALE_DOC_TYPE, clientTxId]
  );

  await db.execute(
    `DELETE FROM audit_logs
     WHERE JSON_UNQUOTE(JSON_EXTRACT(payload_json, '$.client_tx_id')) = ?`,
    [clientTxId]
  );

  await db.execute("DELETE FROM pos_transactions WHERE client_tx_id = ?", [clientTxId]);
}

test(
  "sync push integration: test headers are ignored without explicit test-hook mode",
  { timeout: TEST_TIMEOUT_MS, concurrency: false },
  async () => {
    if (typeof loadEnvFile === "function" && existsSync(ENV_PATH)) {
      loadEnvFile(ENV_PATH);
    }

    const db = await mysql.createConnection(dbConfigFromEnv());
    let childProcess;
    const createdClientTxIds = [];

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

      const ownerUserId = Number(owner.id);
      const companyId = Number(owner.company_id);
      const outletId = Number(owner.outlet_id);

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

      const forcedErrnoIgnoredClientTxId = randomUUID();
      const forcedErrnoIgnoredResponse = await fetch(`${baseUrl}/api/sync/push`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
          [TEST_FORCE_DB_ERRNO_HEADER]: "1205"
        },
        body: JSON.stringify({
          outlet_id: outletId,
          transactions: [
            buildSyncTransaction({
              clientTxId: forcedErrnoIgnoredClientTxId,
              companyId,
              outletId,
              cashierUserId: ownerUserId,
              trxAt: new Date().toISOString()
            })
          ]
        })
      });
      assert.equal(forcedErrnoIgnoredResponse.status, 200);
      const forcedErrnoIgnoredBody = await forcedErrnoIgnoredResponse.json();
      assert.equal(forcedErrnoIgnoredBody.ok, true);
      assert.deepEqual(forcedErrnoIgnoredBody.results, [
        {
          client_tx_id: forcedErrnoIgnoredClientTxId,
          result: "OK"
        }
      ]);
      createdClientTxIds.push(forcedErrnoIgnoredClientTxId);

      const rollbackHeaderIgnoredClientTxId = randomUUID();
      const rollbackHeaderIgnoredResponse = await fetch(`${baseUrl}/api/sync/push`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
          [TEST_FAIL_AFTER_HEADER_INSERT_HEADER]: "1"
        },
        body: JSON.stringify({
          outlet_id: outletId,
          transactions: [
            buildSyncTransaction({
              clientTxId: rollbackHeaderIgnoredClientTxId,
              companyId,
              outletId,
              cashierUserId: ownerUserId,
              trxAt: new Date().toISOString()
            })
          ]
        })
      });
      assert.equal(rollbackHeaderIgnoredResponse.status, 200);
      const rollbackHeaderIgnoredBody = await rollbackHeaderIgnoredResponse.json();
      assert.equal(rollbackHeaderIgnoredBody.ok, true);
      assert.deepEqual(rollbackHeaderIgnoredBody.results, [
        {
          client_tx_id: rollbackHeaderIgnoredClientTxId,
          result: "OK"
        }
      ]);
      createdClientTxIds.push(rollbackHeaderIgnoredClientTxId);
    } finally {
      await stopApiServer(childProcess);

      for (const clientTxId of createdClientTxIds) {
        await db.execute(
          `DELETE FROM audit_logs
           WHERE JSON_UNQUOTE(JSON_EXTRACT(payload_json, '$.client_tx_id')) = ?`,
          [clientTxId]
        );
        await db.execute("DELETE FROM pos_transactions WHERE client_tx_id = ?", [clientTxId]);
      }

      await db.end();
    }
  }
);

test(
  "sync push integration: first insert, replay duplicate, mixed batch statuses",
  { timeout: TEST_TIMEOUT_MS, concurrency: false },
  async () => {
    if (typeof loadEnvFile === "function" && existsSync(ENV_PATH)) {
      loadEnvFile(ENV_PATH);
    }

    const db = await mysql.createConnection(dbConfigFromEnv());
    let childProcess;
    const createdClientTxIds = [];
    let deniedOutletId = 0;

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

      const ownerUserId = Number(owner.id);
      const companyId = Number(owner.company_id);
      const outletId = Number(owner.outlet_id);
      const trxAt = new Date().toISOString();
      const deniedOutletCode = `DENYSP${Date.now().toString(36)}`.slice(0, 16).toUpperCase();

      const [deniedOutletResult] = await db.execute(
        `INSERT INTO outlets (company_id, code, name)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE
           name = VALUES(name),
           id = LAST_INSERT_ID(id),
           updated_at = CURRENT_TIMESTAMP`,
        [companyId, deniedOutletCode, `Denied Sync Push Outlet ${deniedOutletCode}`]
      );
      deniedOutletId = Number(deniedOutletResult.insertId);

      const port = await getFreePort();
      const baseUrl = `http://127.0.0.1:${port}`;
      const server = startApiServer(port, { enableSyncPushTestHooks: true });
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

      const firstClientTxId = randomUUID();
      const firstPayload = {
        outlet_id: outletId,
        transactions: [
          buildSyncTransaction({
            clientTxId: firstClientTxId,
            companyId,
            outletId,
            cashierUserId: ownerUserId,
            trxAt
          })
        ]
      };

      const firstResponse = await fetch(`${baseUrl}/api/sync/push`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify(firstPayload)
      });
      assert.equal(firstResponse.status, 200);
      const firstBody = await firstResponse.json();
      assert.equal(firstBody.ok, true);
      assertSyncPushResponseShape(firstBody);
      assert.deepEqual(firstBody.results, [
        {
          client_tx_id: firstClientTxId,
          result: "OK"
        }
      ]);
      createdClientTxIds.push(firstClientTxId);

      const [firstCountRows] = await db.execute(
        `SELECT COUNT(*) AS total
         FROM pos_transactions
         WHERE client_tx_id = ?`,
        [firstClientTxId]
      );
      assert.equal(Number(firstCountRows[0].total), 1);
      assert.equal(await countAcceptedSyncPushEvents(db, firstClientTxId), 1);
      assert.deepEqual(await countSyncPushPersistedRows(db, firstClientTxId), {
        tx_total: 1,
        item_total: 1,
        payment_total: 1
      });

      const replayResponse = await fetch(`${baseUrl}/api/sync/push`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify(firstPayload)
      });
      assert.equal(replayResponse.status, 200);
      const replayBody = await replayResponse.json();
      assert.equal(replayBody.ok, true);
      assertSyncPushResponseShape(replayBody);
      assert.deepEqual(replayBody.results, [
        {
          client_tx_id: firstClientTxId,
          result: "DUPLICATE"
        }
      ]);

      const [replayCountRows] = await db.execute(
        `SELECT COUNT(*) AS total
         FROM pos_transactions
         WHERE client_tx_id = ?`,
        [firstClientTxId]
      );
      assert.equal(Number(replayCountRows[0].total), 1);
      assert.equal(await countAcceptedSyncPushEvents(db, firstClientTxId), 1);
      assert.deepEqual(await countSyncPushPersistedRows(db, firstClientTxId), {
        tx_total: 1,
        item_total: 1,
        payment_total: 1
      });

      const timestampFormattingClientTxId = randomUUID();
      const timestampBaselineMs = Math.floor(Date.now() / 1_000) * 1_000;
      const timestampWithMillis = new Date(timestampBaselineMs).toISOString();
      const timestampWithoutMillis = timestampWithMillis.replace(".000Z", "Z");
      const timestampFormattingFirstPayload = {
        outlet_id: outletId,
        transactions: [
          buildSyncTransaction({
            clientTxId: timestampFormattingClientTxId,
            companyId,
            outletId,
            cashierUserId: ownerUserId,
            trxAt: timestampWithMillis
          })
        ]
      };

      const timestampFormattingFirstResponse = await fetch(`${baseUrl}/api/sync/push`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify(timestampFormattingFirstPayload)
      });
      assert.equal(timestampFormattingFirstResponse.status, 200);
      const timestampFormattingFirstBody = await timestampFormattingFirstResponse.json();
      assert.equal(timestampFormattingFirstBody.ok, true);
      assert.deepEqual(timestampFormattingFirstBody.results, [
        {
          client_tx_id: timestampFormattingClientTxId,
          result: "OK"
        }
      ]);
      createdClientTxIds.push(timestampFormattingClientTxId);

      const timestampFormattingReplayResponse = await fetch(`${baseUrl}/api/sync/push`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          outlet_id: outletId,
          transactions: [
            buildSyncTransaction({
              clientTxId: timestampFormattingClientTxId,
              companyId,
              outletId,
              cashierUserId: ownerUserId,
              trxAt: timestampWithoutMillis
            })
          ]
        })
      });
      assert.equal(timestampFormattingReplayResponse.status, 200);
      const timestampFormattingReplayBody = await timestampFormattingReplayResponse.json();
      assert.equal(timestampFormattingReplayBody.ok, true);
      assert.deepEqual(timestampFormattingReplayBody.results, [
        {
          client_tx_id: timestampFormattingClientTxId,
          result: "DUPLICATE"
        }
      ]);
      assert.equal(await countAcceptedSyncPushEvents(db, timestampFormattingClientTxId), 1);
      assert.deepEqual(await countSyncPushPersistedRows(db, timestampFormattingClientTxId), {
        tx_total: 1,
        item_total: 1,
        payment_total: 1
      });

      const legacyClientTxId = randomUUID();
      const legacyTransaction = buildSyncTransaction({
        clientTxId: legacyClientTxId,
        companyId,
        outletId,
        cashierUserId: ownerUserId,
        trxAt
      });
      const [legacyInsertResult] = await db.execute(
        `INSERT INTO pos_transactions (
           company_id,
           outlet_id,
           client_tx_id,
           status,
           trx_at,
           payload_sha256,
           payload_hash_version
         ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          companyId,
          outletId,
          legacyClientTxId,
          legacyTransaction.status,
          toMysqlDateTime(legacyTransaction.trx_at),
          "",
          1
        ]
      );
      const legacyPosTransactionId = Number(legacyInsertResult.insertId);
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
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          legacyPosTransactionId,
          companyId,
          outletId,
          1,
          legacyTransaction.items[0].item_id,
          legacyTransaction.items[0].qty,
          legacyTransaction.items[0].price_snapshot,
          legacyTransaction.items[0].name_snapshot
        ]
      );
      await db.execute(
        `INSERT INTO pos_transaction_payments (
           pos_transaction_id,
           company_id,
           outlet_id,
           payment_no,
           method,
           amount
         ) VALUES (?, ?, ?, ?, ?, ?)`,
        [
          legacyPosTransactionId,
          companyId,
          outletId,
          1,
          legacyTransaction.payments[0].method,
          legacyTransaction.payments[0].amount
        ]
      );
      createdClientTxIds.push(legacyClientTxId);

      const legacyReplayResponse = await fetch(`${baseUrl}/api/sync/push`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          outlet_id: outletId,
          transactions: [legacyTransaction]
        })
      });
      assert.equal(legacyReplayResponse.status, 200);
      const legacyReplayBody = await legacyReplayResponse.json();
      assert.equal(legacyReplayBody.ok, true);
      assertSyncPushResponseShape(legacyReplayBody);
      assert.deepEqual(legacyReplayBody.results, [
        {
          client_tx_id: legacyClientTxId,
          result: "DUPLICATE"
        }
      ]);
      assert.equal(await countAcceptedSyncPushEvents(db, legacyClientTxId), 0);
      assert.deepEqual(await countSyncPushPersistedRows(db, legacyClientTxId), {
        tx_total: 1,
        item_total: 1,
        payment_total: 1
      });

      const legacyV1HashClientTxId = randomUUID();
      const legacyV1HashTrxAtWithMillis = new Date(Math.floor(Date.now() / 1_000) * 1_000).toISOString();
      const legacyV1HashTransaction = buildSyncTransaction({
        clientTxId: legacyV1HashClientTxId,
        companyId,
        outletId,
        cashierUserId: ownerUserId,
        trxAt: legacyV1HashTrxAtWithMillis
      });
      const legacyV1PayloadHash = computeLegacyPayloadSha256(legacyV1HashTransaction);

      const [legacyV1InsertResult] = await db.execute(
        `INSERT INTO pos_transactions (
           company_id,
           outlet_id,
           client_tx_id,
           status,
           trx_at,
           payload_sha256,
           payload_hash_version
         ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          companyId,
          outletId,
          legacyV1HashClientTxId,
          legacyV1HashTransaction.status,
          toMysqlDateTime(legacyV1HashTransaction.trx_at),
          legacyV1PayloadHash,
          1
        ]
      );
      const legacyV1PosTransactionId = Number(legacyV1InsertResult.insertId);
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
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          legacyV1PosTransactionId,
          companyId,
          outletId,
          1,
          legacyV1HashTransaction.items[0].item_id,
          legacyV1HashTransaction.items[0].qty,
          legacyV1HashTransaction.items[0].price_snapshot,
          legacyV1HashTransaction.items[0].name_snapshot
        ]
      );
      await db.execute(
        `INSERT INTO pos_transaction_payments (
           pos_transaction_id,
           company_id,
           outlet_id,
           payment_no,
           method,
           amount
         ) VALUES (?, ?, ?, ?, ?, ?)`,
        [
          legacyV1PosTransactionId,
          companyId,
          outletId,
          1,
          legacyV1HashTransaction.payments[0].method,
          legacyV1HashTransaction.payments[0].amount
        ]
      );
      createdClientTxIds.push(legacyV1HashClientTxId);

      const legacyV1ReplayResponse = await fetch(`${baseUrl}/api/sync/push`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          outlet_id: outletId,
          transactions: [
            {
              ...legacyV1HashTransaction,
              trx_at: legacyV1HashTransaction.trx_at.replace(".000Z", "Z")
            }
          ]
        })
      });
      assert.equal(legacyV1ReplayResponse.status, 200);
      const legacyV1ReplayBody = await legacyV1ReplayResponse.json();
      assert.equal(legacyV1ReplayBody.ok, true);
      assertSyncPushResponseShape(legacyV1ReplayBody);
      assert.deepEqual(legacyV1ReplayBody.results, [
        {
          client_tx_id: legacyV1HashClientTxId,
          result: "DUPLICATE"
        }
      ]);
      assert.equal(await countAcceptedSyncPushEvents(db, legacyV1HashClientTxId), 0);
      assert.deepEqual(await countSyncPushPersistedRows(db, legacyV1HashClientTxId), {
        tx_total: 1,
        item_total: 1,
        payment_total: 1
      });

      const legacyV1ExactReplayResponse = await fetch(`${baseUrl}/api/sync/push`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          outlet_id: outletId,
          transactions: [legacyV1HashTransaction]
        })
      });
      assert.equal(legacyV1ExactReplayResponse.status, 200);
      const legacyV1ExactReplayBody = await legacyV1ExactReplayResponse.json();
      assert.equal(legacyV1ExactReplayBody.ok, true);
      assertSyncPushResponseShape(legacyV1ExactReplayBody);
      assert.deepEqual(legacyV1ExactReplayBody.results, [
        {
          client_tx_id: legacyV1HashClientTxId,
          result: "DUPLICATE"
        }
      ]);
      assert.equal(await countAcceptedSyncPushEvents(db, legacyV1HashClientTxId), 0);
      assert.deepEqual(await countSyncPushPersistedRows(db, legacyV1HashClientTxId), {
        tx_total: 1,
        item_total: 1,
        payment_total: 1
      });

      const legacyV1CashierMismatchResponse = await fetch(`${baseUrl}/api/sync/push`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          outlet_id: outletId,
          transactions: [
            {
              ...legacyV1HashTransaction,
              cashier_user_id: ownerUserId + 999
            }
          ]
        })
      });
      assert.equal(legacyV1CashierMismatchResponse.status, 200);
      const legacyV1CashierMismatchBody = await legacyV1CashierMismatchResponse.json();
      assert.equal(legacyV1CashierMismatchBody.ok, true);
      assertSyncPushResponseShape(legacyV1CashierMismatchBody);
      assert.deepEqual(legacyV1CashierMismatchBody.results, [
        {
          client_tx_id: legacyV1HashClientTxId,
          result: "ERROR",
          message: IDEMPOTENCY_CONFLICT_MESSAGE
        }
      ]);
      assert.equal(await countAcceptedSyncPushEvents(db, legacyV1HashClientTxId), 0);
      assert.deepEqual(await countSyncPushPersistedRows(db, legacyV1HashClientTxId), {
        tx_total: 1,
        item_total: 1,
        payment_total: 1
      });

      const legacyV1OffsetClientTxId = randomUUID();
      const legacyV1OffsetTrxAt = "2026-02-22T15:30:00+07:00";
      const legacyV1OffsetReplayTrxAt = "2026-02-22T08:30:00Z";
      const legacyV1OffsetTransaction = buildSyncTransaction({
        clientTxId: legacyV1OffsetClientTxId,
        companyId,
        outletId,
        cashierUserId: ownerUserId,
        trxAt: legacyV1OffsetTrxAt
      });
      const legacyV1OffsetPayloadHash = computeLegacyPayloadSha256(legacyV1OffsetTransaction);

      const [legacyV1OffsetInsertResult] = await db.execute(
        `INSERT INTO pos_transactions (
           company_id,
           outlet_id,
           client_tx_id,
           status,
           trx_at,
           payload_sha256,
           payload_hash_version
         ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          companyId,
          outletId,
          legacyV1OffsetClientTxId,
          legacyV1OffsetTransaction.status,
          toMysqlDateTime(legacyV1OffsetTransaction.trx_at),
          legacyV1OffsetPayloadHash,
          1
        ]
      );
      const legacyV1OffsetPosTransactionId = Number(legacyV1OffsetInsertResult.insertId);
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
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          legacyV1OffsetPosTransactionId,
          companyId,
          outletId,
          1,
          legacyV1OffsetTransaction.items[0].item_id,
          legacyV1OffsetTransaction.items[0].qty,
          legacyV1OffsetTransaction.items[0].price_snapshot,
          legacyV1OffsetTransaction.items[0].name_snapshot
        ]
      );
      await db.execute(
        `INSERT INTO pos_transaction_payments (
           pos_transaction_id,
           company_id,
           outlet_id,
           payment_no,
           method,
           amount
         ) VALUES (?, ?, ?, ?, ?, ?)`,
        [
          legacyV1OffsetPosTransactionId,
          companyId,
          outletId,
          1,
          legacyV1OffsetTransaction.payments[0].method,
          legacyV1OffsetTransaction.payments[0].amount
        ]
      );
      createdClientTxIds.push(legacyV1OffsetClientTxId);

      const legacyV1OffsetReplayResponse = await fetch(`${baseUrl}/api/sync/push`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          outlet_id: outletId,
          transactions: [
            {
              ...legacyV1OffsetTransaction,
              trx_at: legacyV1OffsetReplayTrxAt
            }
          ]
        })
      });
      assert.equal(legacyV1OffsetReplayResponse.status, 200);
      const legacyV1OffsetReplayBody = await legacyV1OffsetReplayResponse.json();
      assert.equal(legacyV1OffsetReplayBody.ok, true);
      assertSyncPushResponseShape(legacyV1OffsetReplayBody);
      assert.deepEqual(legacyV1OffsetReplayBody.results, [
        {
          client_tx_id: legacyV1OffsetClientTxId,
          result: "ERROR",
          message: IDEMPOTENCY_CONFLICT_MESSAGE
        }
      ]);
      assert.equal(await countAcceptedSyncPushEvents(db, legacyV1OffsetClientTxId), 0);
      assert.deepEqual(await countSyncPushPersistedRows(db, legacyV1OffsetClientTxId), {
        tx_total: 1,
        item_total: 1,
        payment_total: 1
      });

      const legacyV1OffsetMirrorClientTxId = randomUUID();
      const legacyV1OffsetMirrorTrxAt = "2026-02-22T08:30:00Z";
      const legacyV1OffsetMirrorReplayTrxAt = "2026-02-22T15:30:00+07:00";
      const legacyV1OffsetMirrorTransaction = buildSyncTransaction({
        clientTxId: legacyV1OffsetMirrorClientTxId,
        companyId,
        outletId,
        cashierUserId: ownerUserId,
        trxAt: legacyV1OffsetMirrorTrxAt
      });
      const legacyV1OffsetMirrorPayloadHash = computeLegacyPayloadSha256(legacyV1OffsetMirrorTransaction);

      const [legacyV1OffsetMirrorInsertResult] = await db.execute(
        `INSERT INTO pos_transactions (
           company_id,
           outlet_id,
           client_tx_id,
           status,
           trx_at,
           payload_sha256,
           payload_hash_version
         ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          companyId,
          outletId,
          legacyV1OffsetMirrorClientTxId,
          legacyV1OffsetMirrorTransaction.status,
          toMysqlDateTime(legacyV1OffsetMirrorTransaction.trx_at),
          legacyV1OffsetMirrorPayloadHash,
          1
        ]
      );
      const legacyV1OffsetMirrorPosTransactionId = Number(legacyV1OffsetMirrorInsertResult.insertId);
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
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          legacyV1OffsetMirrorPosTransactionId,
          companyId,
          outletId,
          1,
          legacyV1OffsetMirrorTransaction.items[0].item_id,
          legacyV1OffsetMirrorTransaction.items[0].qty,
          legacyV1OffsetMirrorTransaction.items[0].price_snapshot,
          legacyV1OffsetMirrorTransaction.items[0].name_snapshot
        ]
      );
      await db.execute(
        `INSERT INTO pos_transaction_payments (
           pos_transaction_id,
           company_id,
           outlet_id,
           payment_no,
           method,
           amount
         ) VALUES (?, ?, ?, ?, ?, ?)`,
        [
          legacyV1OffsetMirrorPosTransactionId,
          companyId,
          outletId,
          1,
          legacyV1OffsetMirrorTransaction.payments[0].method,
          legacyV1OffsetMirrorTransaction.payments[0].amount
        ]
      );
      createdClientTxIds.push(legacyV1OffsetMirrorClientTxId);

      const legacyV1OffsetMirrorReplayResponse = await fetch(`${baseUrl}/api/sync/push`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          outlet_id: outletId,
          transactions: [
            {
              ...legacyV1OffsetMirrorTransaction,
              trx_at: legacyV1OffsetMirrorReplayTrxAt
            }
          ]
        })
      });
      assert.equal(legacyV1OffsetMirrorReplayResponse.status, 200);
      const legacyV1OffsetMirrorReplayBody = await legacyV1OffsetMirrorReplayResponse.json();
      assert.equal(legacyV1OffsetMirrorReplayBody.ok, true);
      assertSyncPushResponseShape(legacyV1OffsetMirrorReplayBody);
      assert.deepEqual(legacyV1OffsetMirrorReplayBody.results, [
        {
          client_tx_id: legacyV1OffsetMirrorClientTxId,
          result: "ERROR",
          message: IDEMPOTENCY_CONFLICT_MESSAGE
        }
      ]);
      assert.equal(await countAcceptedSyncPushEvents(db, legacyV1OffsetMirrorClientTxId), 0);
      assert.deepEqual(await countSyncPushPersistedRows(db, legacyV1OffsetMirrorClientTxId), {
        tx_total: 1,
        item_total: 1,
        payment_total: 1
      });

      for (const retryableCase of [
        { errno: 1205, message: RETRYABLE_DB_LOCK_TIMEOUT_MESSAGE },
        { errno: 1213, message: RETRYABLE_DB_DEADLOCK_MESSAGE }
      ]) {
        const forcedErrnoClientTxId = randomUUID();
        const forcedErrnoPayload = {
          outlet_id: outletId,
          transactions: [
            buildSyncTransaction({
              clientTxId: forcedErrnoClientTxId,
              companyId,
              outletId,
              cashierUserId: ownerUserId,
              trxAt
            })
          ]
        };

        const forcedErrnoResponse = await fetch(`${baseUrl}/api/sync/push`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${accessToken}`,
            "content-type": "application/json",
            [TEST_FORCE_DB_ERRNO_HEADER]: String(retryableCase.errno)
          },
          body: JSON.stringify(forcedErrnoPayload)
        });
        assert.equal(forcedErrnoResponse.status, 200);
        const forcedErrnoBody = await forcedErrnoResponse.json();
        assert.equal(forcedErrnoBody.ok, true);
        assertSyncPushResponseShape(forcedErrnoBody);
        assert.deepEqual(forcedErrnoBody.results, [
          {
            client_tx_id: forcedErrnoClientTxId,
            result: "ERROR",
            message: retryableCase.message
          }
        ]);
        assert.equal(await countAcceptedSyncPushEvents(db, forcedErrnoClientTxId), 0);
        assert.deepEqual(await countSyncPushPersistedRows(db, forcedErrnoClientTxId), {
          tx_total: 0,
          item_total: 0,
          payment_total: 0
        });
      }

      const secondClientTxId = randomUUID();
      const mismatchClientTxId = randomUUID();
      const outletMismatchClientTxId = randomUUID();
      const mixedPayload = {
        outlet_id: outletId,
        transactions: [
          buildSyncTransaction({
            clientTxId: firstClientTxId,
            companyId,
            outletId,
            cashierUserId: ownerUserId,
            trxAt
          }),
          buildSyncTransaction({
            clientTxId: secondClientTxId,
            companyId,
            outletId,
            cashierUserId: ownerUserId,
            trxAt
          }),
          {
            ...buildSyncTransaction({
              clientTxId: mismatchClientTxId,
              companyId,
              outletId,
              cashierUserId: ownerUserId,
              trxAt
            }),
            company_id: companyId + 1
          },
          {
            ...buildSyncTransaction({
              clientTxId: outletMismatchClientTxId,
              companyId,
              outletId,
              cashierUserId: ownerUserId,
              trxAt
            }),
            outlet_id: outletId + 999
          }
        ]
      };

      const mixedResponse = await fetch(`${baseUrl}/api/sync/push`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify(mixedPayload)
      });
      assert.equal(mixedResponse.status, 200);
      const mixedBody = await mixedResponse.json();
      assert.equal(mixedBody.ok, true);
      assertSyncPushResponseShape(mixedBody);
      assert.deepEqual(mixedBody.results, [
        {
          client_tx_id: firstClientTxId,
          result: "DUPLICATE"
        },
        {
          client_tx_id: secondClientTxId,
          result: "OK"
        },
        {
          client_tx_id: mismatchClientTxId,
          result: "ERROR",
          message: "company_id mismatch"
        },
        {
          client_tx_id: outletMismatchClientTxId,
          result: "ERROR",
          message: "outlet_id mismatch"
        }
      ]);
      createdClientTxIds.push(secondClientTxId);

      const [secondCountRows] = await db.execute(
        `SELECT COUNT(*) AS total
         FROM pos_transactions
         WHERE client_tx_id = ?`,
        [secondClientTxId]
      );
      assert.equal(Number(secondCountRows[0].total), 1);
      assert.equal(await countAcceptedSyncPushEvents(db, secondClientTxId), 1);
      assert.equal(await countAcceptedSyncPushEvents(db, firstClientTxId), 1);
      assert.equal(await countAcceptedSyncPushEvents(db, mismatchClientTxId), 0);
      assert.equal(await countAcceptedSyncPushEvents(db, outletMismatchClientTxId), 0);
      assert.deepEqual(await countSyncPushPersistedRows(db, secondClientTxId), {
        tx_total: 1,
        item_total: 1,
        payment_total: 1
      });

      const [mismatchCountRows] = await db.execute(
        `SELECT COUNT(*) AS total
         FROM pos_transactions
         WHERE client_tx_id = ?`,
        [mismatchClientTxId]
      );
      assert.equal(Number(mismatchCountRows[0].total), 0);

      const [outletMismatchCountRows] = await db.execute(
        `SELECT COUNT(*) AS total
         FROM pos_transactions
         WHERE client_tx_id = ?`,
        [outletMismatchClientTxId]
      );
      assert.equal(Number(outletMismatchCountRows[0].total), 0);

      const sameRequestDuplicateClientTxId = randomUUID();
      const sameRequestDuplicatePayload = {
        outlet_id: outletId,
        transactions: [
          buildSyncTransaction({
            clientTxId: sameRequestDuplicateClientTxId,
            companyId,
            outletId,
            cashierUserId: ownerUserId,
            trxAt
          }),
          buildSyncTransaction({
            clientTxId: sameRequestDuplicateClientTxId,
            companyId,
            outletId,
            cashierUserId: ownerUserId,
            trxAt
          })
        ]
      };

      const sameRequestDuplicateResponse = await fetch(`${baseUrl}/api/sync/push`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify(sameRequestDuplicatePayload)
      });
      assert.equal(sameRequestDuplicateResponse.status, 200);
      const sameRequestDuplicateBody = await sameRequestDuplicateResponse.json();
      assert.equal(sameRequestDuplicateBody.ok, true);
      assertSyncPushResponseShape(sameRequestDuplicateBody);
      assert.deepEqual(sameRequestDuplicateBody.results, [
        {
          client_tx_id: sameRequestDuplicateClientTxId,
          result: "OK"
        },
        {
          client_tx_id: sameRequestDuplicateClientTxId,
          result: "DUPLICATE"
        }
      ]);
      createdClientTxIds.push(sameRequestDuplicateClientTxId);

      const [sameRequestDuplicateCountRows] = await db.execute(
        `SELECT COUNT(*) AS total
         FROM pos_transactions
         WHERE client_tx_id = ?`,
        [sameRequestDuplicateClientTxId]
      );
      assert.equal(Number(sameRequestDuplicateCountRows[0].total), 1);
      assert.equal(await countAcceptedSyncPushEvents(db, sameRequestDuplicateClientTxId), 1);
      assert.deepEqual(await countSyncPushPersistedRows(db, sameRequestDuplicateClientTxId), {
        tx_total: 1,
        item_total: 1,
        payment_total: 1
      });

      const concurrentDuplicateClientTxId = randomUUID();
      const concurrentDuplicatePayload = {
        outlet_id: outletId,
        transactions: [
          buildSyncTransaction({
            clientTxId: concurrentDuplicateClientTxId,
            companyId,
            outletId,
            cashierUserId: ownerUserId,
            trxAt
          })
        ]
      };

      const [concurrentFirstResponse, concurrentSecondResponse] = await Promise.all([
        fetch(`${baseUrl}/api/sync/push`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${accessToken}`,
            "content-type": "application/json"
          },
          body: JSON.stringify(concurrentDuplicatePayload)
        }),
        fetch(`${baseUrl}/api/sync/push`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${accessToken}`,
            "content-type": "application/json"
          },
          body: JSON.stringify(concurrentDuplicatePayload)
        })
      ]);
      assert.equal(concurrentFirstResponse.status, 200);
      assert.equal(concurrentSecondResponse.status, 200);

      const [concurrentFirstBody, concurrentSecondBody] = await Promise.all([
        concurrentFirstResponse.json(),
        concurrentSecondResponse.json()
      ]);

      assertSyncPushResponseShape(concurrentFirstBody);
      assertSyncPushResponseShape(concurrentSecondBody);
      const concurrentResults = [
        concurrentFirstBody.results?.[0]?.result,
        concurrentSecondBody.results?.[0]?.result
      ].sort((left, right) => String(left).localeCompare(String(right)));
      assert.deepEqual(concurrentResults, ["DUPLICATE", "OK"]);
      createdClientTxIds.push(concurrentDuplicateClientTxId);

      assert.deepEqual(await countSyncPushPersistedRows(db, concurrentDuplicateClientTxId), {
        tx_total: 1,
        item_total: 1,
        payment_total: 1
      });
      assert.equal(await countAcceptedSyncPushEvents(db, concurrentDuplicateClientTxId), 1);

      const conflictClientTxId = randomUUID();
      const conflictPayloadA = {
        outlet_id: outletId,
        transactions: [
          buildSyncTransaction({
            clientTxId: conflictClientTxId,
            companyId,
            outletId,
            cashierUserId: ownerUserId,
            trxAt
          })
        ]
      };
      const conflictPayloadB = {
        outlet_id: outletId,
        transactions: [
          {
            ...buildSyncTransaction({
              clientTxId: conflictClientTxId,
              companyId,
              outletId,
              cashierUserId: ownerUserId,
              trxAt
            }),
            items: [
              {
                item_id: 1,
                qty: 2,
                price_snapshot: 13000,
                name_snapshot: "Test Item Conflict"
              }
            ]
          }
        ]
      };

      const [conflictFirstResponse, conflictSecondResponse] = await Promise.all([
        fetch(`${baseUrl}/api/sync/push`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${accessToken}`,
            "content-type": "application/json"
          },
          body: JSON.stringify(conflictPayloadA)
        }),
        fetch(`${baseUrl}/api/sync/push`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${accessToken}`,
            "content-type": "application/json"
          },
          body: JSON.stringify(conflictPayloadB)
        })
      ]);
      assert.equal(conflictFirstResponse.status, 200);
      assert.equal(conflictSecondResponse.status, 200);

      const [conflictFirstBody, conflictSecondBody] = await Promise.all([
        conflictFirstResponse.json(),
        conflictSecondResponse.json()
      ]);
      assertSyncPushResponseShape(conflictFirstBody);
      assertSyncPushResponseShape(conflictSecondBody);

      const conflictItems = [
        conflictFirstBody.results?.[0],
        conflictSecondBody.results?.[0]
      ];
      const okItem = conflictItems.find((item) => item?.result === "OK");
      const errorItem = conflictItems.find((item) => item?.result === "ERROR");
      assert.ok(okItem);
      assert.ok(errorItem);
      assert.equal(errorItem.message, IDEMPOTENCY_CONFLICT_MESSAGE);
      createdClientTxIds.push(conflictClientTxId);

      assert.deepEqual(await countSyncPushPersistedRows(db, conflictClientTxId), {
        tx_total: 1,
        item_total: 1,
        payment_total: 1
      });
      assert.equal(await countAcceptedSyncPushEvents(db, conflictClientTxId), 1);

      const rollbackClientTxId = randomUUID();
      const rollbackPayload = {
        outlet_id: outletId,
        transactions: [
          buildSyncTransaction({
            clientTxId: rollbackClientTxId,
            companyId,
            outletId,
            cashierUserId: ownerUserId,
            trxAt
          })
        ]
      };

      const rollbackResponse = await fetch(`${baseUrl}/api/sync/push`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
          "x-jp-sync-push-fail-after-header": "1"
        },
        body: JSON.stringify(rollbackPayload)
      });
      assert.equal(rollbackResponse.status, 200);
      const rollbackBody = await rollbackResponse.json();
      assert.equal(rollbackBody.ok, true);
      assert.deepEqual(rollbackBody.results, [
        {
          client_tx_id: rollbackClientTxId,
          result: "ERROR",
          message: "insert failed"
        }
      ]);

      assert.deepEqual(await countSyncPushPersistedRows(db, rollbackClientTxId), {
        tx_total: 0,
        item_total: 0,
        payment_total: 0
      });
      assert.equal(await countAcceptedSyncPushEvents(db, rollbackClientTxId), 0);

      const deniedOutletTxId = randomUUID();
      const deniedOutletResponse = await fetch(`${baseUrl}/api/sync/push`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          outlet_id: deniedOutletId,
          transactions: [
            buildSyncTransaction({
              clientTxId: deniedOutletTxId,
              companyId,
              outletId: deniedOutletId,
              cashierUserId: ownerUserId,
              trxAt
            })
          ]
        })
      });
      assert.equal(deniedOutletResponse.status, 403);
      const deniedOutletBody = await deniedOutletResponse.json();
      assert.equal(deniedOutletBody.success, false);
      assert.equal(deniedOutletBody.error.code, "FORBIDDEN");

      const [deniedOutletCountRows] = await db.execute(
        `SELECT COUNT(*) AS total
         FROM pos_transactions
         WHERE client_tx_id = ?`,
        [deniedOutletTxId]
      );
      assert.equal(Number(deniedOutletCountRows[0].total), 0);
      assert.equal(await countAcceptedSyncPushEvents(db, deniedOutletTxId), 0);
    } finally {
      await stopApiServer(childProcess);

      for (const clientTxId of createdClientTxIds) {
        await db.execute(
          `DELETE FROM audit_logs
           WHERE JSON_UNQUOTE(JSON_EXTRACT(payload_json, '$.client_tx_id')) = ?`,
          [clientTxId]
        );
        await db.execute("DELETE FROM pos_transactions WHERE client_tx_id = ?", [clientTxId]);
      }

      if (deniedOutletId > 0) {
        await db.execute("DELETE FROM outlets WHERE id = ?", [deniedOutletId]);
      }

      await db.end();
    }
  }
);

test(
  "sync push integration: active posting card policy, sales tax posting, and duplicate replay journal idempotency",
  { timeout: TEST_TIMEOUT_MS, concurrency: false },
  async () => {
    if (typeof loadEnvFile === "function" && existsSync(ENV_PATH)) {
      loadEnvFile(ENV_PATH);
    }

    const db = await mysql.createConnection(dbConfigFromEnv());
    let childProcess;
    let companyId = 0;
    let outletId = 0;
    let ownerUserId = 0;
    const createdClientTxIds = [];
    let postingFixture = {
      createdMappingKeys: [],
      createdAccountIds: []
    };
    let previousPosTaxConfig = null;

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

      ownerUserId = Number(owner.id);
      companyId = Number(owner.company_id);
      outletId = Number(owner.outlet_id);
      postingFixture = await ensureOutletAccountMappings(db, companyId, outletId);

      const port = await getFreePort();
      const baseUrl = `http://127.0.0.1:${port}`;
      const server = startApiServer(port, {
        envOverrides: {
          [SYNC_PUSH_POSTING_MODE_ENV]: "active"
        }
      });
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

      const cardClientTxId = randomUUID();
      const cardPolicyResponse = await fetch(`${baseUrl}/api/sync/push`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          outlet_id: outletId,
          transactions: [
            {
              ...buildSyncTransaction({
                clientTxId: cardClientTxId,
                companyId,
                outletId,
                cashierUserId: ownerUserId,
                trxAt: new Date().toISOString()
              }),
              payments: [
                {
                  method: "CARD",
                  amount: 12500
                }
              ]
            }
          ]
        })
      });
      assert.equal(cardPolicyResponse.status, 200);
      const cardPolicyBody = await cardPolicyResponse.json();
      assert.equal(cardPolicyBody.ok, true);
      assert.deepEqual(cardPolicyBody.results, [
        {
          client_tx_id: cardClientTxId,
          result: "OK"
        }
      ]);
      createdClientTxIds.push(cardClientTxId);
      assert.deepEqual(await countSyncPushPersistedRows(db, cardClientTxId), {
        tx_total: 1,
        item_total: 1,
        payment_total: 1
      });
      assert.deepEqual(await countSyncPushJournalRows(db, cardClientTxId), {
        batch_total: 1,
        line_total: 2
      });
      assert.equal(await countAcceptedSyncPushEvents(db, cardClientTxId), 1);
      const cardAcceptedAuditPayload = await readAcceptedSyncPushAuditPayload(db, cardClientTxId);
      assert.notEqual(cardAcceptedAuditPayload, null);
      assert.equal(cardAcceptedAuditPayload.posting_mode, "active");
      assert.equal(cardAcceptedAuditPayload.balance_ok, true);
      assert.equal(Number.isInteger(Number(cardAcceptedAuditPayload.journal_batch_id)), true);
      assert.equal(Number(cardAcceptedAuditPayload.journal_batch_id) > 0, true);

      previousPosTaxConfig = await setCompanyDefaultTaxRate(db, companyId, {
        rate: 10,
        inclusive: false
      });

      const taxedClientTxId = randomUUID();
      const taxedResponse = await fetch(`${baseUrl}/api/sync/push`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          outlet_id: outletId,
          transactions: [
            {
              ...buildSyncTransaction({
                clientTxId: taxedClientTxId,
                companyId,
                outletId,
                cashierUserId: ownerUserId,
                trxAt: new Date().toISOString()
              }),
              payments: [
                {
                  method: "CASH",
                  amount: 13750
                }
              ]
            }
          ]
        })
      });
      assert.equal(taxedResponse.status, 200);
      const taxedBody = await taxedResponse.json();
      assert.equal(taxedBody.ok, true);
      assert.deepEqual(taxedBody.results, [
        {
          client_tx_id: taxedClientTxId,
          result: "OK"
        }
      ]);
      createdClientTxIds.push(taxedClientTxId);

      assert.deepEqual(await countSyncPushJournalRows(db, taxedClientTxId), {
        batch_total: 1,
        line_total: 3
      });
      assert.equal(await countAcceptedSyncPushEvents(db, taxedClientTxId), 1);
      const taxedAcceptedAuditPayload = await readAcceptedSyncPushAuditPayload(db, taxedClientTxId);
      assert.notEqual(taxedAcceptedAuditPayload, null);
      assert.equal(taxedAcceptedAuditPayload.posting_mode, "active");
      assert.equal(taxedAcceptedAuditPayload.balance_ok, true);
      assert.equal(Number.isInteger(Number(taxedAcceptedAuditPayload.journal_batch_id)), true);
      const taxedSummary = await readSyncPushJournalSummary(db, taxedClientTxId);
      assert.equal(taxedSummary.tax_line_total, 1);
      assert.equal(taxedSummary.tax_credit_total, 1250);
      assert.equal(taxedSummary.debit_total, taxedSummary.credit_total);

      if (previousPosTaxConfig) {
        await restoreCompanyDefaultTaxRate(db, companyId, previousPosTaxConfig);
        previousPosTaxConfig = null;
      }

      const duplicateClientTxId = randomUUID();
      const duplicatePayload = {
        outlet_id: outletId,
        transactions: [
          buildSyncTransaction({
            clientTxId: duplicateClientTxId,
            companyId,
            outletId,
            cashierUserId: ownerUserId,
            trxAt: new Date().toISOString()
          })
        ]
      };

      const firstDuplicateResponse = await fetch(`${baseUrl}/api/sync/push`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify(duplicatePayload)
      });
      assert.equal(firstDuplicateResponse.status, 200);
      const firstDuplicateBody = await firstDuplicateResponse.json();
      assert.equal(firstDuplicateBody.ok, true);
      assert.deepEqual(firstDuplicateBody.results, [
        {
          client_tx_id: duplicateClientTxId,
          result: "OK"
        }
      ]);
      createdClientTxIds.push(duplicateClientTxId);

      assert.deepEqual(await countSyncPushJournalRows(db, duplicateClientTxId), {
        batch_total: 1,
        line_total: 2
      });

      const replayDuplicateResponse = await fetch(`${baseUrl}/api/sync/push`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify(duplicatePayload)
      });
      assert.equal(replayDuplicateResponse.status, 200);
      const replayDuplicateBody = await replayDuplicateResponse.json();
      assert.equal(replayDuplicateBody.ok, true);
      assert.deepEqual(replayDuplicateBody.results, [
        {
          client_tx_id: duplicateClientTxId,
          result: "DUPLICATE"
        }
      ]);

      assert.deepEqual(await countSyncPushPersistedRows(db, duplicateClientTxId), {
        tx_total: 1,
        item_total: 1,
        payment_total: 1
      });
      assert.deepEqual(await countSyncPushJournalRows(db, duplicateClientTxId), {
        batch_total: 1,
        line_total: 2
      });
      assert.equal(await countAcceptedSyncPushEvents(db, duplicateClientTxId), 1);
      assert.equal(await countDuplicateSyncPushEvents(db, duplicateClientTxId), 1);
      const duplicateAuditPayload = await readDuplicateSyncPushAuditPayload(db, duplicateClientTxId);
      assert.notEqual(duplicateAuditPayload, null);
      assert.equal(duplicateAuditPayload.posting_mode, "active");
      assert.equal(duplicateAuditPayload.balance_ok, true);
      assert.equal(duplicateAuditPayload.reason, "DUPLICATE_REPLAY");
      assert.equal(Number.isInteger(Number(duplicateAuditPayload.journal_batch_id)), true);
      assert.equal(Number(duplicateAuditPayload.journal_batch_id) > 0, true);

      const concurrentDuplicateClientTxId = randomUUID();
      const concurrentDuplicatePayload = {
        outlet_id: outletId,
        transactions: [
          buildSyncTransaction({
            clientTxId: concurrentDuplicateClientTxId,
            companyId,
            outletId,
            cashierUserId: ownerUserId,
            trxAt: new Date().toISOString()
          })
        ]
      };

      const [concurrentDuplicateFirstResponse, concurrentDuplicateSecondResponse] = await Promise.all([
        fetch(`${baseUrl}/api/sync/push`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${accessToken}`,
            "content-type": "application/json"
          },
          body: JSON.stringify(concurrentDuplicatePayload)
        }),
        fetch(`${baseUrl}/api/sync/push`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${accessToken}`,
            "content-type": "application/json"
          },
          body: JSON.stringify(concurrentDuplicatePayload)
        })
      ]);
      assert.equal(concurrentDuplicateFirstResponse.status, 200);
      assert.equal(concurrentDuplicateSecondResponse.status, 200);

      const [concurrentDuplicateFirstBody, concurrentDuplicateSecondBody] = await Promise.all([
        concurrentDuplicateFirstResponse.json(),
        concurrentDuplicateSecondResponse.json()
      ]);
      assertSyncPushResponseShape(concurrentDuplicateFirstBody);
      assertSyncPushResponseShape(concurrentDuplicateSecondBody);

      const concurrentDuplicateResults = [
        concurrentDuplicateFirstBody.results?.[0]?.result,
        concurrentDuplicateSecondBody.results?.[0]?.result
      ].sort((left, right) => String(left).localeCompare(String(right)));
      assert.deepEqual(concurrentDuplicateResults, ["DUPLICATE", "OK"]);
      createdClientTxIds.push(concurrentDuplicateClientTxId);

      const concurrentDuplicateJournalCounts = await countSyncPushJournalRows(db, concurrentDuplicateClientTxId);
      assert.equal(concurrentDuplicateJournalCounts.batch_total, 1);
      assert.equal(concurrentDuplicateJournalCounts.line_total > 0, true);

      const concurrentDuplicateReplayResponse = await fetch(`${baseUrl}/api/sync/push`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify(concurrentDuplicatePayload)
      });
      assert.equal(concurrentDuplicateReplayResponse.status, 200);
      const concurrentDuplicateReplayBody = await concurrentDuplicateReplayResponse.json();
      assert.equal(concurrentDuplicateReplayBody.ok, true);
      assert.deepEqual(concurrentDuplicateReplayBody.results, [
        {
          client_tx_id: concurrentDuplicateClientTxId,
          result: "DUPLICATE"
        }
      ]);

      assert.deepEqual(await countSyncPushJournalRows(db, concurrentDuplicateClientTxId), {
        batch_total: 1,
        line_total: concurrentDuplicateJournalCounts.line_total
      });

      const concurrentConflictClientTxId = randomUUID();
      const concurrentConflictPayloadA = {
        outlet_id: outletId,
        transactions: [
          buildSyncTransaction({
            clientTxId: concurrentConflictClientTxId,
            companyId,
            outletId,
            cashierUserId: ownerUserId,
            trxAt: new Date().toISOString()
          })
        ]
      };
      const concurrentConflictPayloadB = {
        outlet_id: outletId,
        transactions: [
          {
            ...buildSyncTransaction({
              clientTxId: concurrentConflictClientTxId,
              companyId,
              outletId,
              cashierUserId: ownerUserId,
              trxAt: concurrentConflictPayloadA.transactions[0].trx_at
            }),
            items: [
              {
                ...buildSyncTransaction({
                  clientTxId: concurrentConflictClientTxId,
                  companyId,
                  outletId,
                  cashierUserId: ownerUserId,
                  trxAt: concurrentConflictPayloadA.transactions[0].trx_at
                }).items[0],
                name_snapshot: "Test Item Conflict"
              }
            ]
          }
        ]
      };

      const [concurrentConflictFirstResponse, concurrentConflictSecondResponse] = await Promise.all([
        fetch(`${baseUrl}/api/sync/push`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${accessToken}`,
            "content-type": "application/json"
          },
          body: JSON.stringify(concurrentConflictPayloadA)
        }),
        fetch(`${baseUrl}/api/sync/push`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${accessToken}`,
            "content-type": "application/json"
          },
          body: JSON.stringify(concurrentConflictPayloadB)
        })
      ]);
      assert.equal(concurrentConflictFirstResponse.status, 200);
      assert.equal(concurrentConflictSecondResponse.status, 200);

      const [concurrentConflictFirstBody, concurrentConflictSecondBody] = await Promise.all([
        concurrentConflictFirstResponse.json(),
        concurrentConflictSecondResponse.json()
      ]);
      assertSyncPushResponseShape(concurrentConflictFirstBody);
      assertSyncPushResponseShape(concurrentConflictSecondBody);

      const concurrentConflictResults = [
        concurrentConflictFirstBody.results?.[0],
        concurrentConflictSecondBody.results?.[0]
      ];
      const concurrentConflictOk = concurrentConflictResults.find((item) => item?.result === "OK");
      const concurrentConflictError = concurrentConflictResults.find((item) => item?.result === "ERROR");
      assert.ok(concurrentConflictOk);
      assert.ok(concurrentConflictError);
      assert.equal(concurrentConflictError.message, IDEMPOTENCY_CONFLICT_MESSAGE);
      createdClientTxIds.push(concurrentConflictClientTxId);

      assert.deepEqual(await countSyncPushJournalRows(db, concurrentConflictClientTxId), {
        batch_total: 1,
        line_total: concurrentDuplicateJournalCounts.line_total
      });
      assert.equal(await countAcceptedSyncPushEvents(db, concurrentConflictClientTxId), 1);
    } finally {
      await stopApiServer(childProcess);

      for (const clientTxId of createdClientTxIds) {
        await cleanupSyncPushPersistedArtifacts(db, clientTxId);
      }

      if (companyId > 0 && previousPosTaxConfig) {
        await restoreCompanyDefaultTaxRate(db, companyId, previousPosTaxConfig);
      }

      if (companyId > 0 && outletId > 0) {
        await cleanupCreatedOutletAccountMappings(db, companyId, outletId, postingFixture);
      }

      await db.end();
    }
  }
);

test(
  "sync push integration: active posting unbalanced journal is rejected and rolled back",
  { timeout: TEST_TIMEOUT_MS, concurrency: false },
  async () => {
    if (typeof loadEnvFile === "function" && existsSync(ENV_PATH)) {
      loadEnvFile(ENV_PATH);
    }

    const db = await mysql.createConnection(dbConfigFromEnv());
    let childProcess;
    let companyId = 0;
    let outletId = 0;
    let ownerUserId = 0;
    let postingFixture = {
      createdMappingKeys: [],
      createdAccountIds: []
    };

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

      ownerUserId = Number(owner.id);
      companyId = Number(owner.company_id);
      outletId = Number(owner.outlet_id);
      postingFixture = await ensureOutletAccountMappings(db, companyId, outletId);

      const port = await getFreePort();
      const baseUrl = `http://127.0.0.1:${port}`;
      const server = startApiServer(port, {
        envOverrides: {
          [SYNC_PUSH_POSTING_MODE_ENV]: "active",
          [SYNC_PUSH_POSTING_FORCE_UNBALANCED_ENV]: "1"
        }
      });
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

      const unbalancedClientTxId = randomUUID();
      const unbalancedResponse = await fetch(`${baseUrl}/api/sync/push`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          outlet_id: outletId,
          transactions: [
            buildSyncTransaction({
              clientTxId: unbalancedClientTxId,
              companyId,
              outletId,
              cashierUserId: ownerUserId,
              trxAt: new Date().toISOString()
            })
          ]
        })
      });
      assert.equal(unbalancedResponse.status, 200);
      const unbalancedBody = await unbalancedResponse.json();
      assert.equal(unbalancedBody.ok, true);
      assert.deepEqual(unbalancedBody.results, [
        {
          client_tx_id: unbalancedClientTxId,
          result: "ERROR",
          message: "insert failed"
        }
      ]);

      const postingFailureAuditPayload = await readPostingHookFailureAuditPayload(db, unbalancedClientTxId);
      assert.notEqual(postingFailureAuditPayload, null);
      assert.equal(postingFailureAuditPayload.posting_mode, "active");
      assert.equal(postingFailureAuditPayload.balance_ok, false);
      assert.equal(postingFailureAuditPayload.journal_batch_id, null);
      assert.equal(typeof postingFailureAuditPayload.reason, "string");
      assert.equal(postingFailureAuditPayload.reason.length > 0, true);

      assert.deepEqual(await countSyncPushPersistedRows(db, unbalancedClientTxId), {
        tx_total: 0,
        item_total: 0,
        payment_total: 0
      });
      assert.deepEqual(await countSyncPushJournalRows(db, unbalancedClientTxId), {
        batch_total: 0,
        line_total: 0
      });
      assert.equal(await countAcceptedSyncPushEvents(db, unbalancedClientTxId), 0);
    } finally {
      await stopApiServer(childProcess);

      if (companyId > 0 && outletId > 0) {
        await cleanupCreatedOutletAccountMappings(db, companyId, outletId, postingFixture);
      }

      await db.end();
    }
  }
);
