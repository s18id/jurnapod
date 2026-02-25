import assert from "node:assert/strict";
import { test } from "node:test";
import mysql from "mysql2/promise";
import {
  dbConfigFromEnv,
  ensureDailySalesView,
  getFreePort,
  loadEnvIfPresent,
  loginUser,
  readEnv,
  startApiServer,
  stopApiServer,
  TEST_TIMEOUT_MS,
  waitForHealthcheck
} from "./reports.helpers.mjs";

test(
  "reports integration: outlet filter denies inaccessible outlet",
  { timeout: TEST_TIMEOUT_MS, concurrency: false },
  async () => {
    loadEnvIfPresent();

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

      const accessToken = await loginUser(baseUrl, companyCode, ownerEmail, ownerPassword);

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

test(
  "reports integration: report endpoints enforce OWNER/ADMIN/ACCOUNTANT allow and CASHIER deny",
  { timeout: TEST_TIMEOUT_MS, concurrency: false },
  async () => {
    loadEnvIfPresent();

    const db = await mysql.createConnection(dbConfigFromEnv());
    let childProcess;
    const createdUserIds = [];

    const companyCode = readEnv("JP_COMPANY_CODE", "JP");
    const outletCode = readEnv("JP_OUTLET_CODE", "MAIN");
    const ownerEmail = readEnv("JP_OWNER_EMAIL").toLowerCase();
    const ownerPassword = readEnv("JP_OWNER_PASSWORD");
    const runId = Date.now().toString(36);
    const roleEmails = {
      ADMIN: `reports-admin-${runId}@example.com`,
      ACCOUNTANT: `reports-accountant-${runId}@example.com`,
      CASHIER: `reports-cashier-${runId}@example.com`
    };

    try {
      const [ownerRows] = await db.execute(
        `SELECT u.id, u.company_id, u.password_hash, o.id AS outlet_id
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

      const [roleRows] = await db.execute(
        `SELECT id, code
         FROM roles
         WHERE code IN ('ADMIN', 'ACCOUNTANT', 'CASHIER')`
      );
      const roleIdByCode = new Map(roleRows.map((row) => [row.code, Number(row.id)]));
      for (const code of ["ADMIN", "ACCOUNTANT", "CASHIER"]) {
        if (!roleIdByCode.has(code)) {
          throw new Error(`${code} role fixture not found; run database seed first`);
        }
      }

      for (const roleCode of ["ADMIN", "ACCOUNTANT", "CASHIER"]) {
        const [userInsert] = await db.execute(
          `INSERT INTO users (company_id, email, password_hash, is_active)
           VALUES (?, ?, ?, 1)`,
          [companyId, roleEmails[roleCode], owner.password_hash]
        );
        const userId = Number(userInsert.insertId);
        createdUserIds.push(userId);

        await db.execute(
          `INSERT INTO user_roles (user_id, role_id)
           VALUES (?, ?)`,
          [userId, roleIdByCode.get(roleCode)]
        );

        await db.execute(
          `INSERT INTO user_outlets (user_id, outlet_id)
           VALUES (?, ?)`,
          [userId, outletId]
        );
      }

      await ensureDailySalesView(db);

      const port = await getFreePort();
      const baseUrl = `http://127.0.0.1:${port}`;
      const server = startApiServer(port);
      childProcess = server.childProcess;
      await waitForHealthcheck(baseUrl, childProcess, server.serverLogs);

      const ownerToken = await loginUser(baseUrl, companyCode, ownerEmail, ownerPassword);
      const adminToken = await loginUser(baseUrl, companyCode, roleEmails.ADMIN, ownerPassword);
      const accountantToken = await loginUser(baseUrl, companyCode, roleEmails.ACCOUNTANT, ownerPassword);
      const cashierToken = await loginUser(baseUrl, companyCode, roleEmails.CASHIER, ownerPassword);

      const reportUrls = [
        `/api/reports/pos-transactions?outlet_id=${outletId}&date_from=2020-01-01&date_to=2030-01-01`,
        `/api/reports/daily-sales?outlet_id=${outletId}&date_from=2020-01-01&date_to=2030-01-01`,
        `/api/reports/journals?outlet_id=${outletId}&date_from=2020-01-01&date_to=2030-01-01`,
        `/api/reports/trial-balance?outlet_id=${outletId}&date_from=2020-01-01&date_to=2030-01-01`
      ];

      for (const accessToken of [ownerToken, adminToken, accountantToken]) {
        for (const reportUrl of reportUrls) {
          const response = await fetch(`${baseUrl}${reportUrl}`, {
            headers: {
              authorization: `Bearer ${accessToken}`
            }
          });
          assert.equal(response.status, 200);
          const body = await response.json();
          assert.equal(body.ok, true);
        }
      }

      for (const reportUrl of reportUrls) {
        const response = await fetch(`${baseUrl}${reportUrl}`, {
          headers: {
            authorization: `Bearer ${cashierToken}`
          }
        });
        assert.equal(response.status, 403);
        const body = await response.json();
        assert.equal(body.ok, false);
        assert.equal(body.error.code, "FORBIDDEN");
      }
    } finally {
      await stopApiServer(childProcess);

      for (const userId of createdUserIds) {
        await db.execute("DELETE FROM user_outlets WHERE user_id = ?", [userId]);
        await db.execute("DELETE FROM user_roles WHERE user_id = ?", [userId]);
        await db.execute("DELETE FROM users WHERE id = ?", [userId]);
      }

      await db.end();
    }
  }
);
