// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import {
  ensureDailySalesView,
  loginAndGetUserContext,
  normalizeDate,
  readEnv,
  setupIntegrationTests,
  TEST_TIMEOUT_MS
} from "./integration-harness.mjs";

const testContext = setupIntegrationTests(test);

/**
 * Get company timezone via API.
 * @param {string} baseUrl - API base URL
 * @param {string} accessToken - Auth token
 * @param {number} companyId - Company ID
 * @returns {Promise<string>} Company timezone
 */
async function getCompanyTimezone(baseUrl, accessToken, companyId) {
  const response = await fetch(`${baseUrl}/api/companies/${companyId}`, {
    headers: {
      authorization: `Bearer ${accessToken}`
    }
  });
  
  if (response.status !== 200) {
    throw new Error(`Failed to get company. status=${response.status}`);
  }
  
  const body = await response.json();
  if (!body?.success || !body?.data) {
    throw new Error(`Invalid company response. body=${JSON.stringify(body)}`);
  }
  
  return body.data.timezone || "UTC";
}

/**
 * Push a POS transaction via sync/push API.
 * @param {string} baseUrl - API base URL
 * @param {string} accessToken - Auth token
 * @param {number} outletId - Outlet ID
 * @param {number} companyId - Company ID
 * @param {number} cashierUserId - Cashier user ID
 * @param {string} clientTxId - Unique client transaction ID
 * @param {string} trxAt - Transaction timestamp (ISO string)
 * @param {Array} items - Transaction items
 * @param {Array} payments - Transaction payments
 * @returns {Promise<void>}
 */
async function pushPosTransaction(baseUrl, accessToken, outletId, companyId, cashierUserId, clientTxId, trxAt, items, payments) {
  const response = await fetch(`${baseUrl}/api/sync/push`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      outlet_id: outletId,
      transactions: [
        {
          client_tx_id: clientTxId,
          company_id: companyId,
          outlet_id: outletId,
          cashier_user_id: cashierUserId,
          status: "COMPLETED",
          trx_at: trxAt,
          items: items,
          payments: payments
        }
      ]
    })
  });

  if (response.status !== 200) {
    const body = await response.text();
    throw new Error(`Sync push failed. status=${response.status} body=${body}`);
  }

  const body = await response.json();
  if (!body?.success) {
    throw new Error(`Sync push failed. body=${JSON.stringify(body)}`);
  }

  // Check that the transaction was accepted
  const result = body.data?.results?.[0];
  if (!result || result.result !== "OK") {
    throw new Error(`Transaction not accepted. result=${JSON.stringify(result)}`);
  }
}

test(
  "reports integration: daily-sales falls back to base tables when view is unavailable",
  { timeout: TEST_TIMEOUT_MS, concurrency: false },
  async () => {
    const db = testContext.db;
    let txClientId = "";

    const companyCode = readEnv("JP_COMPANY_CODE", "JP");
    const outletCode = readEnv("JP_OUTLET_CODE", "MAIN");
    const ownerEmail = readEnv("JP_OWNER_EMAIL").toLowerCase();
    const ownerPassword = readEnv("JP_OWNER_PASSWORD");

    try {
      const baseUrl = testContext.baseUrl;

      // Login and get user context via API (no direct DB)
      const userContext = await loginAndGetUserContext(
        baseUrl,
        companyCode,
        ownerEmail,
        ownerPassword,
        outletCode
      );

      const companyId = userContext.companyId;
      const outletId = userContext.outletId;
      const ownerUserId = userContext.userId;
      const accessToken = userContext.accessToken;

      // Get company timezone for proper date handling
      const timezone = await getCompanyTimezone(baseUrl, accessToken, companyId);

      // Use a date within fiscal year range (FY 2026: 2026-01-01 to 2026-12-31)
      const reportDate = "2026-03-10";
      
      // Convert local date to UTC for transaction timestamp
      // The transaction should fall within the report date range in the company's timezone
      const trxAtUTC = normalizeDate(reportDate, timezone, 'start');
      // Use a time within the day (add 10 hours in milliseconds to get 10:00 AM local time)
      const trxAtDate = new Date(new Date(trxAtUTC).getTime() + 10 * 60 * 60 * 1000);
      const trxAt = trxAtDate.toISOString();

      await ensureDailySalesView(db);

      txClientId = randomUUID();

      // Create transaction via sync/push API (no direct DB)
      await pushPosTransaction(
        baseUrl,
        accessToken,
        outletId,
        companyId,
        ownerUserId,
        txClientId,
        trxAt,
        [
          {
            item_id: 1,
            qty: 2,
            price_snapshot: 15000,
            name_snapshot: "Fallback Item"
          }
        ],
        [
          {
            method: "CASH",
            amount: 30000
          }
        ]
      );

      // Drop view to test fallback (direct DB - testing DB-level behavior)
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
      assert.equal(body.success, true);

      const row = body.data.rows.find((entry) => Number(entry.outlet_id) === outletId);
      assert.equal(Boolean(row), true, JSON.stringify(body));
      assert.equal(Number(row.tx_count) >= 1, true);
      assert.equal(Number(row.gross_total) >= 30000, true);
      assert.equal(Number(row.paid_total) >= 30000, true);
    } finally {
      // Cleanup: restore view and delete test transaction (direct DB - allowed for cleanup)
      await ensureDailySalesView(db);

      if (txClientId) {
        await db.execute("DELETE FROM pos_transactions WHERE client_tx_id = ?", [txClientId]);
      }
    }
  }
);

test(
  "reports integration: daily-sales falls back to base tables when view is invalid",
  { timeout: TEST_TIMEOUT_MS, concurrency: false },
  async () => {
    const db = testContext.db;
    let txClientId = "";
    let invalidSourceTable = "";

    const companyCode = readEnv("JP_COMPANY_CODE", "JP");
    const outletCode = readEnv("JP_OUTLET_CODE", "MAIN");
    const ownerEmail = readEnv("JP_OWNER_EMAIL").toLowerCase();
    const ownerPassword = readEnv("JP_OWNER_PASSWORD");
    const runId = Date.now().toString(36);

    try {
      const baseUrl = testContext.baseUrl;

      // Login and get user context via API (no direct DB)
      const userContext = await loginAndGetUserContext(
        baseUrl,
        companyCode,
        ownerEmail,
        ownerPassword,
        outletCode
      );

      const companyId = userContext.companyId;
      const outletId = userContext.outletId;
      const ownerUserId = userContext.userId;
      const accessToken = userContext.accessToken;

      // Get company timezone for proper date handling
      const timezone = await getCompanyTimezone(baseUrl, accessToken, companyId);

      // Use a date within fiscal year range (FY 2026: 2026-01-01 to 2026-12-31)
      const reportDate = "2026-03-11";
      
      // Convert local date to UTC for transaction timestamp
      // The transaction should fall within the report date range in the company's timezone
      const trxAtUTC = normalizeDate(reportDate, timezone, 'start');
      // Use a time within the day (add 10 hours in milliseconds to get 10:00 AM local time)
      const trxAtDate = new Date(new Date(trxAtUTC).getTime() + 10 * 60 * 60 * 1000);
      const trxAt = trxAtDate.toISOString();

      await ensureDailySalesView(db);

      txClientId = randomUUID();

      // Create transaction via sync/push API (no direct DB)
      await pushPosTransaction(
        baseUrl,
        accessToken,
        outletId,
        companyId,
        ownerUserId,
        txClientId,
        trxAt,
        [
          {
            item_id: 1,
            qty: 2,
            price_snapshot: 17500,
            name_snapshot: "Fallback Invalid View Item"
          }
        ],
        [
          {
            method: "CASH",
            amount: 35000
          }
        ]
      );

      // Create invalid view scenario (direct DB - testing DB-level behavior)
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
      assert.equal(body.success, true);

      const row = body.data.rows.find((entry) => Number(entry.outlet_id) === outletId);
      assert.equal(Boolean(row), true);
      assert.equal(Number(row.tx_count) >= 1, true);
      assert.equal(Number(row.gross_total) >= 35000, true);
      assert.equal(Number(row.paid_total) >= 35000, true);
    } finally {
      // Cleanup: restore view, drop test table, delete test transaction (direct DB - allowed for cleanup)
      await ensureDailySalesView(db);

      if (invalidSourceTable) {
        await db.execute(`DROP TABLE IF EXISTS \`${invalidSourceTable}\``);
      }

      if (txClientId) {
        await db.execute("DELETE FROM pos_transactions WHERE client_tx_id = ?", [txClientId]);
      }
    }
  }
);