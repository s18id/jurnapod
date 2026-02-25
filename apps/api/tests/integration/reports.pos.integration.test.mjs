import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import mysql from "mysql2/promise";
import {
  dbConfigFromEnv,
  getFreePort,
  loadEnvIfPresent,
  loginOwner,
  readEnv,
  startApiServer,
  stopApiServer,
  TEST_TIMEOUT_MS,
  waitForHealthcheck
} from "./reports.helpers.mjs";

test(
  "reports integration: POS payments summary groups by method",
  { timeout: TEST_TIMEOUT_MS, concurrency: false },
  async () => {
    loadEnvIfPresent();

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
        `INSERT INTO pos_transaction_payments (
           pos_transaction_id,
           company_id,
           outlet_id,
           payment_no,
           method,
           amount
         ) VALUES
           (?, ?, ?, 1, 'CASH', 10000),
           (?, ?, ?, 2, 'QRIS', 20000),
           (?, ?, ?, 3, 'CARD', 30000)`,
        [txId, companyId, outletId, txId, companyId, outletId, txId, companyId, outletId]
      );

      const dateFromIso = trxAt.toISOString().slice(0, 10);
      const dateToIso = dateFromIso;

      const port = await getFreePort();
      const baseUrl = `http://127.0.0.1:${port}`;
      const server = startApiServer(port);
      childProcess = server.childProcess;
      await waitForHealthcheck(baseUrl, childProcess, server.serverLogs);

      const accessToken = await loginOwner(baseUrl, companyCode, ownerEmail, ownerPassword);

      const response = await fetch(
        `${baseUrl}/api/reports/pos-payments?outlet_id=${outletId}&date_from=${dateFromIso}&date_to=${dateToIso}`,
        {
          headers: {
            authorization: `Bearer ${accessToken}`
          }
        }
      );
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.ok, true);

      const cashRow = body.rows.find((row) => row.method === "CASH");
      const qrisRow = body.rows.find((row) => row.method === "QRIS");
      const cardRow = body.rows.find((row) => row.method === "CARD");

      assert.equal(Boolean(cashRow), true);
      assert.equal(Boolean(qrisRow), true);
      assert.equal(Boolean(cardRow), true);
      assert.equal(Number(cashRow.total_amount) >= 10000, true);
      assert.equal(Number(qrisRow.total_amount) >= 20000, true);
      assert.equal(Number(cardRow.total_amount) >= 30000, true);
    } finally {
      await stopApiServer(childProcess);

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
    loadEnvIfPresent();

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
  "reports integration: POS as_of keeps pagination snapshot stable across concurrent inserts",
  { timeout: TEST_TIMEOUT_MS, concurrency: false },
  async () => {
    loadEnvIfPresent();

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
