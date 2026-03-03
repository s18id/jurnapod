// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import assert from "node:assert/strict";
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

const FISCAL_SETTING_KEY = "accounting.allow_multiple_open_fiscal_years";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function toDateOnly(value) {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  return String(value).slice(0, 10);
}

test(
  "fiscal years integration: open-year conflict, overlap rules, and report defaults",
  { timeout: TEST_TIMEOUT_MS, concurrency: false },
  async () => {
    loadEnvIfPresent();

    const db = await mysql.createConnection(dbConfigFromEnv());
    let childProcess;
    let serverLogs = [];
    const createdFiscalYearIds = [];
    let seededFiscalYearId = 0;
    const runId = Date.now().toString(36);

    const companyCode = readEnv("JP_COMPANY_CODE", "JP");
    const outletCode = readEnv("JP_OUTLET_CODE", "MAIN");
    const ownerEmail = readEnv("JP_OWNER_EMAIL").toLowerCase();
    const ownerPassword = readEnv("JP_OWNER_PASSWORD");

    let companyId = 0;
    let outletId = 0;
    let ownerId = 0;
    let previousSetting = null;

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

      companyId = Number(owner.company_id);
      outletId = Number(owner.outlet_id);
      ownerId = Number(owner.id);

      const [settingRows] = await db.execute(
        `SELECT id, value_json
         FROM company_settings
         WHERE company_id = ?
           AND outlet_id = ?
           AND \`key\` = ?
         LIMIT 1`,
        [companyId, outletId, FISCAL_SETTING_KEY]
      );
      previousSetting = settingRows[0] ?? null;

      const [openRows] = await db.execute(
        `SELECT id
         FROM fiscal_years
         WHERE company_id = ?
           AND status = 'OPEN'`,
        [companyId]
      );

      if (openRows.length === 0) {
        const year = new Date().getUTCFullYear();
        const startDate = `${year}-01-01`;
        const endDate = `${year}-12-31`;
        const code = `ITFY${runId}`.slice(0, 32).toUpperCase();
        const name = `Integration FY ${runId}`;

        const [seedResult] = await db.execute(
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
          [companyId, code, name, startDate, endDate, ownerId, ownerId]
        );
        seededFiscalYearId = Number(seedResult.insertId);
      }

      const port = await getFreePort();
      const baseUrl = `http://127.0.0.1:${port}`;
      const server = startApiServer(port);
      childProcess = server.childProcess;
      serverLogs = server.serverLogs;
      await waitForHealthcheck(baseUrl, childProcess, serverLogs);

      const accessToken = await loginOwner(baseUrl, companyCode, ownerEmail, ownerPassword, server.serverLogs);

      await db.execute(
        `INSERT INTO company_settings (
           company_id,
           outlet_id,
           \`key\`,
           value_type,
           value_json,
           created_by_user_id,
           updated_by_user_id
         ) VALUES (?, ?, ?, 'boolean', ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           value_type = VALUES(value_type),
           value_json = VALUES(value_json),
           updated_by_user_id = VALUES(updated_by_user_id),
           updated_at = CURRENT_TIMESTAMP`,
        [companyId, outletId, FISCAL_SETTING_KEY, JSON.stringify(false), ownerId, ownerId]
      );

      const [maxRows] = await db.execute(
        `SELECT MAX(YEAR(end_date)) AS max_year
         FROM fiscal_years
         WHERE company_id = ?
           AND status = 'OPEN'`,
        [companyId]
      );
      const maxYear = maxRows[0]?.max_year;
      const baseYear = Number.isFinite(Number(maxYear))
        ? Number(maxYear)
        : new Date().getUTCFullYear();
      const nextYear = baseYear + 1;
      const nextStart = `${nextYear}-01-01`;
      const nextEnd = `${nextYear}-12-31`;
      const nextCode = `FY${nextYear}${runId}`.slice(0, 32).toUpperCase();

      const conflictResponse = await fetch(`${baseUrl}/api/accounts/fiscal-years`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          company_id: companyId,
          code: nextCode,
          name: `FY ${nextYear} ${runId}`,
          start_date: nextStart,
          end_date: nextEnd,
          status: "OPEN"
        })
      });

      assert.equal(conflictResponse.status, 409);
      const conflictBody = await conflictResponse.json();
      assert.equal(conflictBody.success, false);
      assert.equal(conflictBody.error.code, "OPEN_YEAR_CONFLICT");

      await db.execute(
        `INSERT INTO company_settings (
           company_id,
           outlet_id,
           \`key\`,
           value_type,
           value_json,
           created_by_user_id,
           updated_by_user_id
         ) VALUES (?, ?, ?, 'boolean', ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           value_type = VALUES(value_type),
           value_json = VALUES(value_json),
           updated_by_user_id = VALUES(updated_by_user_id),
           updated_at = CURRENT_TIMESTAMP`,
        [companyId, outletId, FISCAL_SETTING_KEY, JSON.stringify(true), ownerId, ownerId]
      );

      const createResponse = await fetch(`${baseUrl}/api/accounts/fiscal-years`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          company_id: companyId,
          code: nextCode,
          name: `FY ${nextYear} ${runId}`,
          start_date: nextStart,
          end_date: nextEnd,
          status: "OPEN"
        })
      });
      let createBody = null;
      try {
        createBody = await createResponse.json();
      } catch {
        createBody = null;
      }

      if (createResponse.status !== 201) {
        const errorDetails = createBody?.error ? JSON.stringify(createBody.error) : "unknown error";
        const logsSuffix = serverLogs.length > 0
          ? `\nServer logs (tail):\n${serverLogs.slice(-40).join("")}`
          : "";
        assert.fail(`expected 201 but got ${createResponse.status}: ${errorDetails}${logsSuffix}`);
      }

      assert.equal(createBody?.success, true);
      createdFiscalYearIds.push(Number(createBody?.data?.id));

      const overlapResponse = await fetch(`${baseUrl}/api/accounts/fiscal-years`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          company_id: companyId,
          code: `FYOVER${runId}`.slice(0, 32).toUpperCase(),
          name: `FY Overlap ${runId}`,
          start_date: `${nextYear}-06-01`,
          end_date: `${nextYear + 1}-05-31`,
          status: "OPEN"
        })
      });

      assert.equal(overlapResponse.status, 409);
      const overlapBody = await overlapResponse.json();
      assert.equal(overlapBody.success, false);
      assert.equal(overlapBody.error.code, "OPEN_YEAR_OVERLAP");

      const today = todayIso();
      const [todayOpenRows] = await db.execute(
        `SELECT id, start_date, end_date
         FROM fiscal_years
         WHERE company_id = ?
           AND status = 'OPEN'
           AND start_date <= ?
           AND end_date >= ?`,
        [companyId, today, today]
      );

      const reportResponse = await fetch(`${baseUrl}/api/reports/profit-loss?outlet_id=${outletId}`, {
        headers: {
          authorization: `Bearer ${accessToken}`
        }
      });

      if (todayOpenRows.length === 1) {
        assert.equal(reportResponse.status, 200);
        const reportBody = await reportResponse.json();
        assert.equal(reportBody.success, true);
        const expectedStart = toDateOnly(todayOpenRows[0].start_date);
        const expectedEnd = toDateOnly(todayOpenRows[0].end_date);
        assert.equal(reportBody.data.filters.date_from, expectedStart);
        assert.equal(reportBody.data.filters.date_to, expectedEnd);
      } else {
        assert.equal(reportResponse.status, 400);
        const reportBody = await reportResponse.json();
        assert.equal(reportBody.success, false);
        assert.equal(reportBody.error.code, "FISCAL_YEAR_REQUIRED");
      }
    } finally {
      await stopApiServer(childProcess);

      if (createdFiscalYearIds.length > 0) {
        await db.execute(
          `DELETE FROM fiscal_years
           WHERE id IN (${createdFiscalYearIds.map(() => "?").join(", ")})`,
          createdFiscalYearIds
        );
      }

      if (seededFiscalYearId > 0) {
        await db.execute("DELETE FROM fiscal_years WHERE id = ?", [seededFiscalYearId]);
      }

      if (previousSetting) {
        await db.execute(
          `UPDATE company_settings
           SET value_type = 'boolean',
               value_json = ?,
               updated_by_user_id = ?,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [String(previousSetting.value_json), ownerId, Number(previousSetting.id)]
        );
      } else if (companyId && outletId) {
        await db.execute(
          `DELETE FROM company_settings
           WHERE company_id = ?
             AND outlet_id = ?
             AND \`key\` = ?`,
          [companyId, outletId, FISCAL_SETTING_KEY]
        );
      }

      await db.end();
    }
  }
);
