import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import mysql from "mysql2/promise";
import {
  dbConfigFromEnv,
  ensureDailySalesView,
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
  "reports integration: daily-sales falls back to base tables when view is unavailable",
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
  "reports integration: daily-sales falls back to base tables when view is invalid",
  { timeout: TEST_TIMEOUT_MS, concurrency: false },
  async () => {
    loadEnvIfPresent();

    const db = await mysql.createConnection(dbConfigFromEnv());
    let childProcess;
    let txClientId = "";
    let invalidSourceTable = "";

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
      const reportDate = "2099-03-11";
      const trxAtSql = "2099-03-11 10:15:00";

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
         ) VALUES (?, ?, ?, 1, 1, 2, 17500, 'Fallback Invalid View Item')`,
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
         ) VALUES (?, ?, ?, 1, 'CASH', 35000)`,
        [txId, companyId, outletId]
      );

      invalidSourceTable = `it_daily_invalid_${runId}`;
      await db.execute(
        `CREATE TABLE \`${invalidSourceTable}\` (
           id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
           company_id BIGINT UNSIGNED NOT NULL,
           outlet_id BIGINT UNSIGNED NULL,
           trx_date DATE NOT NULL,
           status ENUM('COMPLETED', 'VOID', 'REFUND') NOT NULL,
           tx_count BIGINT UNSIGNED NOT NULL,
           gross_total DECIMAL(18,2) NOT NULL,
           paid_total DECIMAL(18,2) NOT NULL,
           PRIMARY KEY (id)
         ) ENGINE=InnoDB`
      );

      await db.execute(
        `CREATE OR REPLACE VIEW v_pos_daily_totals AS
         SELECT src.company_id,
                src.outlet_id,
                src.trx_date,
                src.status,
                src.tx_count,
                src.gross_total,
                src.paid_total
         FROM \`${invalidSourceTable}\` src`
      );

      await db.execute(`DROP TABLE \`${invalidSourceTable}\``);

      const port = await getFreePort();
      const baseUrl = `http://127.0.0.1:${port}`;
      const server = startApiServer(port);
      childProcess = server.childProcess;
      await waitForHealthcheck(baseUrl, childProcess, server.serverLogs);

      const accessToken = await loginOwner(baseUrl, companyCode, ownerEmail, ownerPassword);

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
      assert.equal(Number(row.gross_total) >= 35000, true);
      assert.equal(Number(row.paid_total) >= 35000, true);
    } finally {
      await stopApiServer(childProcess);
      await ensureDailySalesView(db);

      if (invalidSourceTable) {
        await db.execute(`DROP TABLE IF EXISTS \`${invalidSourceTable}\``);
      }

      if (txClientId) {
        await db.execute("DELETE FROM pos_transactions WHERE client_tx_id = ?", [txClientId]);
      }

      await db.end();
    }
  }
);
