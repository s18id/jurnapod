// @ts-nocheck
// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import {test, describe, beforeAll, afterAll} from 'vitest';
import {
  createIntegrationTestContext,
  ensureDailySalesView,
  loginUser,
  readEnv,
  TEST_TIMEOUT_MS
} from "../../tests/integration/integration-harness.js";

const testContext = createIntegrationTestContext();
let baseUrl = "";
let db;

beforeAll(async () => {
  await testContext.start();
  baseUrl = testContext.baseUrl;
  db = testContext.db;
});

afterAll(async () => {
  await testContext.stop();
});

test(
  "@slow reports integration: outlet filter denies inaccessible outlet",
  { timeout: TEST_TIMEOUT_MS, concurrent: false },
  async () => {
    let deniedOutletId = 0;
    let adminUserId = 0;

    const companyCode = readEnv("JP_COMPANY_CODE", "JP");
    const ownerEmail = readEnv("JP_OWNER_EMAIL").toLowerCase();
    const ownerPassword = readEnv("JP_OWNER_PASSWORD");
    const runId = Date.now().toString(36);
    const adminEmail = `reports-deny-admin-${runId}@example.com`;
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

      const [outletRows] = await db.execute(
        `SELECT id
         FROM outlets
         WHERE company_id = ?
         LIMIT 1`,
        [Number(owner.company_id)]
      );
      const allowedOutletId = Number(outletRows[0]?.id ?? 0);
      if (!allowedOutletId) {
        throw new Error("outlet fixture not found; run database seed first");
      }

      const [adminRoleRows] = await db.execute(
        `SELECT id
         FROM roles
         WHERE code = 'ADMIN'
         LIMIT 1`
      );
      const adminRoleId = adminRoleRows[0]?.id;
      if (!adminRoleId) {
        throw new Error("ADMIN role fixture not found; run `npm run db:migrate && npm run db:seed`");
      }

      const [adminInsert] = await db.execute(
        `INSERT INTO users (company_id, email, password_hash, is_active)
         VALUES (?, ?, (SELECT password_hash FROM users WHERE email = ? LIMIT 1), 1)`,
        [Number(owner.company_id), adminEmail, ownerEmail]
      );
      adminUserId = Number(adminInsert.insertId);

      await db.execute(
        `INSERT INTO user_role_assignments (user_id, role_id)
         VALUES (?, ?)`,
        [adminUserId, Number(adminRoleId)]
      );

      await db.execute(
        `INSERT INTO user_role_assignments (user_id, outlet_id, role_id)
         VALUES (?, ?, ?)`,
        [adminUserId, allowedOutletId, Number(adminRoleId)]
      );


      const companyId = Number(owner.company_id);
      const [outletInsert] = await db.execute(
        `INSERT INTO outlets (company_id, code, name)
         VALUES (?, ?, ?)`,
        [companyId, deniedOutletCode, `Denied Reports Outlet ${runId}`]
      );
      deniedOutletId = Number(outletInsert.insertId);

      const accessToken = await loginUser(baseUrl, companyCode, adminEmail, ownerPassword);

      for (const reportPath of [
        "/api/reports/pos-transactions",
        "/api/reports/daily-sales",
        "/api/reports/journals",
        "/api/reports/trial-balance",
        "/api/reports/receivables-ageing"
      ]) {
        const response = await fetch(
          reportPath === "/api/reports/receivables-ageing"
            ? `${baseUrl}${reportPath}?outlet_id=${deniedOutletId}&as_of_date=2026-12-31`
            : `${baseUrl}${reportPath}?outlet_id=${deniedOutletId}&date_from=2025-01-01&date_to=2026-12-31`,
          {
            headers: {
              authorization: `Bearer ${accessToken}`
            }
          }
        );
        assert.equal(response.status, 403);
        const body = await response.json();
        assert.equal(body.success, false);
        assert.equal(body.error.code, "FORBIDDEN");
      }
    } finally {
      if (deniedOutletId > 0) {
        await db.execute("DELETE FROM outlets WHERE id = ?", [deniedOutletId]);
      }

      if (adminUserId > 0) {
        await db.execute("DELETE FROM user_role_assignments WHERE user_id = ?", [adminUserId]);
        await db.execute("DELETE FROM user_role_assignments WHERE user_id = ?", [adminUserId]);
        await db.execute("DELETE FROM users WHERE id = ?", [adminUserId]);
      }

    }
  }
);

test(
  "@slow reports integration: report endpoints enforce OWNER/ADMIN/ACCOUNTANT allow and CASHIER deny",
  { timeout: TEST_TIMEOUT_MS, concurrent: false },
  async () => {
    const createdUserIds = [];
    const createdPosTransactionIds = [];

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
      const ownerUserId = Number(owner.id);

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

      let cashierUserId = 0;
      for (const roleCode of ["ADMIN", "ACCOUNTANT", "CASHIER"]) {
        const [userInsert] = await db.execute(
          `INSERT INTO users (company_id, email, password_hash, is_active)
           VALUES (?, ?, ?, 1)`,
          [companyId, roleEmails[roleCode], owner.password_hash]
        );
        const userId = Number(userInsert.insertId);
        createdUserIds.push(userId);
        if (roleCode === "CASHIER") {
          cashierUserId = userId;
        }

        await db.execute(
          `INSERT INTO user_role_assignments (user_id, role_id)
           VALUES (?, ?)`,
          [userId, roleIdByCode.get(roleCode)]
        );

        await db.execute(
          `INSERT INTO user_role_assignments (user_id, outlet_id, role_id)
           VALUES (?, ?, ?)`,
          [userId, outletId, roleIdByCode.get(roleCode)]
        );

        // Add module_roles entry for pos module with report permission (bit 16)
        // Use ON DUPLICATE KEY UPDATE to make idempotent for repeated runs
        await db.execute(
          `INSERT INTO module_roles (role_id, module, company_id, permission_mask)
           VALUES (?, 'pos', ?, 18)  -- read(2) + report(16) = 18
           ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask)`,
          [roleIdByCode.get(roleCode), companyId]
        );

        // Add module_roles entry for accounting module with report permission (bit 16)
        // Only for ADMIN and ACCOUNTANT, not for CASHIER
        if (roleCode !== "CASHIER") {
          await db.execute(
            `INSERT INTO module_roles (role_id, module, company_id, permission_mask)
             VALUES (?, 'accounting', ?, 18)  -- read(2) + report(16) = 18
             ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask)`,
            [roleIdByCode.get(roleCode), companyId]
          );
        }
      }

      assert.ok(cashierUserId > 0, "Cashier fixture not found");

      await ensureDailySalesView(db);

      const txRows = [
        {
          cashier_user_id: cashierUserId,
          amount: 100
        },
        {
          cashier_user_id: ownerUserId,
          amount: 200
        }
      ];

      for (const tx of txRows) {
        const [insertTx] = await db.execute(
          `INSERT INTO pos_transactions (
             company_id,
             outlet_id,
             cashier_user_id,
             client_tx_id,
             status,
             trx_at,
             payload_sha256,
             payload_hash_version
           ) VALUES (?, ?, ?, ?, 'COMPLETED', NOW(), ?, 1)`,
          [companyId, outletId, tx.cashier_user_id, randomUUID(), randomBytes(32).toString("hex")]
        );
        const posTransactionId = Number(insertTx.insertId);
        createdPosTransactionIds.push(posTransactionId);

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
           ) VALUES (?, ?, ?, 1, 1, 1, ?, 'Test Item')`,
          [posTransactionId, companyId, outletId, tx.amount]
        );

        await db.execute(
          `INSERT INTO pos_transaction_payments (
             pos_transaction_id,
             company_id,
             outlet_id,
             payment_no,
             method,
             amount
           ) VALUES (?, ?, ?, 1, 'CASH', ?)`,
          [posTransactionId, companyId, outletId, tx.amount]
        );
      }

      const ownerToken = await loginUser(baseUrl, companyCode, ownerEmail, ownerPassword);
      const adminToken = await loginUser(baseUrl, companyCode, roleEmails.ADMIN, ownerPassword);
      const accountantToken = await loginUser(baseUrl, companyCode, roleEmails.ACCOUNTANT, ownerPassword);
      const cashierToken = await loginUser(baseUrl, companyCode, roleEmails.CASHIER, ownerPassword);

      const reportUrls = [
        `/api/reports/pos-transactions?outlet_id=${outletId}&date_from=2020-01-01&date_to=2030-01-01`,
        `/api/reports/pos-payments?outlet_id=${outletId}&date_from=2020-01-01&date_to=2030-01-01`,
        `/api/reports/daily-sales?outlet_id=${outletId}&date_from=2020-01-01&date_to=2030-01-01`,
        `/api/reports/journals?outlet_id=${outletId}&date_from=2020-01-01&date_to=2030-01-01`,
        `/api/reports/trial-balance?outlet_id=${outletId}&date_from=2020-01-01&date_to=2030-01-01`,
        `/api/reports/general-ledger?outlet_id=${outletId}&date_from=2020-01-01&date_to=2030-01-01`,
        `/api/reports/worksheet?outlet_id=${outletId}&date_from=2020-01-01&date_to=2030-01-01`,
        `/api/reports/profit-loss?outlet_id=${outletId}&date_from=2020-01-01&date_to=2030-01-01`,
        `/api/reports/receivables-ageing?outlet_id=${outletId}&as_of_date=2030-01-01`
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
          assert.equal(body.success, true);
        }
      }

      const cashierAllowed = reportUrls.slice(0, 3);
      const cashierDenied = reportUrls.slice(3);

      for (const reportUrl of cashierAllowed) {
        const response = await fetch(`${baseUrl}${reportUrl}`, {
          headers: {
            authorization: `Bearer ${cashierToken}`
          }
        });
        assert.equal(response.status, 200);
        const body = await response.json();
        assert.equal(body.success, true);

        if (reportUrl.includes("/pos-transactions")) {
          assert.equal(body.data.pagination.total, 1);
          assert.equal(body.data.transactions.length, 1);
          assert.equal(body.data.transactions[0].gross_total, 100);
        }

        if (reportUrl.includes("/pos-payments")) {
          const totalAmount = body.data.rows.reduce((acc, row) => acc + row.total_amount, 0);
          const totalCount = body.data.rows.reduce((acc, row) => acc + row.payment_count, 0);
          assert.equal(totalAmount, 100);
          assert.equal(totalCount, 1);
        }

        if (reportUrl.includes("/daily-sales")) {
          const grossTotal = body.data.rows.reduce((acc, row) => acc + row.gross_total, 0);
          const paidTotal = body.data.rows.reduce((acc, row) => acc + row.paid_total, 0);
          assert.equal(grossTotal, 100);
          assert.equal(paidTotal, 100);
        }
      }

      for (const reportUrl of cashierDenied) {
        const response = await fetch(`${baseUrl}${reportUrl}`, {
          headers: {
            authorization: `Bearer ${cashierToken}`
          }
        });
        assert.equal(response.status, 403);
        const body = await response.json();
        assert.equal(body.success, false);
        assert.equal(body.error.code, "FORBIDDEN");
      }
    } finally {
      if (createdPosTransactionIds.length > 0) {
        for (const txId of createdPosTransactionIds) {
          await db.execute("DELETE FROM pos_transactions WHERE id = ?", [txId]);
        }
      }

      for (const userId of createdUserIds) {
        await db.execute("DELETE FROM user_role_assignments WHERE user_id = ?", [userId]);
        await db.execute("DELETE FROM users WHERE id = ?", [userId]);
      }

    }
  }
);
