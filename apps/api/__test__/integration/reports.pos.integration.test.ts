// @ts-nocheck
// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test, describe, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import {
  loginOwner,
  readEnv,
  setupIntegrationTests,
  TEST_TIMEOUT_MS
} from "../../tests/integration/integration-harness.js";

const testContext = setupIntegrationTests();

test(
  "@slow reports integration: POS payments summary groups by method",
  { timeout: TEST_TIMEOUT_MS, concurrent: false },
  async () => {
    const db = testContext.db;
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
         INNER JOIN outlets o ON o.company_id = u.company_id
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

      const baseUrl = testContext.baseUrl;

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
      assert.equal(body.success, true);

      const cashRow = body.data.rows.find((row) => row.method === "CASH");
      const qrisRow = body.data.rows.find((row) => row.method === "QRIS");
      const cardRow = body.data.rows.find((row) => row.method === "CARD");

      assert.equal(Boolean(cashRow), true);
      assert.equal(Boolean(qrisRow), true);
      assert.equal(Boolean(cardRow), true);
      assert.equal(Number(cashRow.total_amount) >= 10000, true);
      assert.equal(Number(qrisRow.total_amount) >= 20000, true);
      assert.equal(Number(cardRow.total_amount) >= 30000, true);
    } finally {
      if (txClientId) {
        await db.execute("DELETE FROM pos_transactions WHERE client_tx_id = ?", [txClientId]);
      }
    }
  }
);

test(
  "@slow reports integration: POS date boundary uses inclusive-exclusive DATETIME window",
  { timeout: TEST_TIMEOUT_MS, concurrent: false },
  async () => {
    const db = testContext.db;
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
         INNER JOIN outlets o ON o.company_id = u.company_id
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
      // Use UTC timestamps directly to avoid timezone conversion issues
      // Query for 2026-03-17 in Jakarta (+7) = 2026-03-16 17:00:00 UTC to 2026-03-17 17:00:00 UTC
      const boundaryDay = "2026-03-17";
      // Inside: 2026-03-17 10:00:00 UTC (within the query range)
      const insideDateTime = "2026-03-17 10:00:00";
      // Outside: 2026-03-17 18:00:00 UTC (after 17:00:00, outside the range)
      const outsideDateTime = "2026-03-17 18:00:00";

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

      const baseUrl = testContext.baseUrl;

      const accessToken = await loginOwner(baseUrl, companyCode, ownerEmail, ownerPassword);

      const response = await fetch(
        `${baseUrl}/api/reports/pos-transactions?outlet_id=${outletId}&date_from=${boundaryDay}&date_to=${boundaryDay}&status=VOID&limit=100`,
        {
          headers: {
            authorization: `Bearer ${accessToken}`
          }
        }
      );
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.success, true);

      const returnedClientTxIds = body.data.transactions.map((row) => row.client_tx_id);
      assert.equal(returnedClientTxIds.includes(txInsideClientId), true);
      assert.equal(returnedClientTxIds.includes(txOutsideClientId), false);
    } finally {
      await db.execute("DELETE FROM pos_transactions WHERE client_tx_id IN (?, ?)", [txInsideClientId, txOutsideClientId]);
    }
  }
);

test(
  "@slow reports integration: POS as_of keeps pagination snapshot stable across concurrent inserts",
  { timeout: TEST_TIMEOUT_MS, concurrent: false },
  async () => {
    const db = testContext.db;
    const txIds = [randomUUID(), randomUUID(), randomUUID()];

    const companyCode = readEnv("JP_COMPANY_CODE", "JP");
    const outletCode = readEnv("JP_OUTLET_CODE", "MAIN");
    const ownerEmail = readEnv("JP_OWNER_EMAIL").toLowerCase();
    const ownerPassword = readEnv("JP_OWNER_PASSWORD");
    const reportDate = "2026-03-18";
    const runId = Date.now().toString(36);

    try {
      const [ownerRows] = await db.execute(
        `SELECT u.company_id, o.id AS outlet_id
         FROM users u
         INNER JOIN companies c ON c.id = u.company_id
         INNER JOIN outlets o ON o.company_id = u.company_id
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

      // Use unique client_tx_id with runId prefix to filter out leftover test data
      const txId1 = `ITPOSASOF_${runId}_1`;
      const txId2 = `ITPOSASOF_${runId}_2`;
      txIds[0] = txId1;
      txIds[1] = txId2;

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
        [companyId, outletId, txId1, companyId, outletId, txId2]
      );

      const baseUrl = testContext.baseUrl;

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
      assert.equal(page1Body.success, true);
      assert.equal(typeof page1Body.data.filters.as_of, "string");
      assert.equal(typeof page1Body.data.filters.as_of_id, "number");
      // Filter by our unique prefix to avoid counting leftover test data
      const page1FilteredTxs = page1Body.data.transactions.filter(t => t.client_tx_id.startsWith(`ITPOSASOF_${runId}`));
      assert.equal(page1FilteredTxs.length, 1);
      const firstPageClientTxId = page1Body.data.transactions[0]?.client_tx_id;

      // Create concurrent transaction with unique ID
      const txId3 = `ITPOSASOF_${runId}_3`;
      txIds[2] = txId3;
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
        [companyId, outletId, txId3]
      );

      const page2Response = await fetch(
        `${baseUrl}/api/reports/pos-transactions?outlet_id=${outletId}&date_from=${reportDate}&date_to=${reportDate}&status=VOID&limit=1&offset=1&as_of=${encodeURIComponent(page1Body.data.filters.as_of)}&as_of_id=${page1Body.data.filters.as_of_id}`,
        {
          headers: {
            authorization: `Bearer ${accessToken}`
          }
        }
      );
      assert.equal(page2Response.status, 200);
      const page2Body = await page2Response.json();
      assert.equal(page2Body.success, true);
      // Filter by our unique prefix to avoid counting leftover test data
      const page2FilteredTxs = page2Body.data.transactions.filter(t => t.client_tx_id.startsWith(`ITPOSASOF_${runId}`));
      assert.equal(page2FilteredTxs.length, 1);

      const returnedPage2Ids = page2Body.data.transactions.map((row) => row.client_tx_id);
      // The concurrent transaction should NOT appear in page2 (as_of snapshot excludes it)
      assert.equal(returnedPage2Ids.includes(txIds[2]), false);
      // firstPageClientTxId should NOT appear in page2 (different page)
      assert.equal(returnedPage2Ids.includes(firstPageClientTxId), false);
    } finally {
      await db.execute("DELETE FROM pos_transactions WHERE client_tx_id IN (?, ?, ?)", txIds);
    }
  }
);
