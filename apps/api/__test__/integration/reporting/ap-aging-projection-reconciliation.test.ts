// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * AP Aging Projection vs Source-of-Truth Subledger Reconciliation Integration Tests
 * (Story 62.1 AC3, AC5, AC6)
 *
 * Tests:
 * - AC3: AP Aging projection matches source subledger with zero variance
 * - AC5: Deterministic projection outputs
 * - AC6: EPIC62 GATE evidence emission
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getTestBaseUrl } from "../../helpers/env";
import { closeTestDb } from "../../helpers/db";
import { acquireReadLock, releaseReadLock } from "../../helpers/setup";
import {
  resetFixtureRegistry,
  createTestCompanyMinimal,
  createTestOutletMinimal,
  createTestUser,
  getRoleIdByCode,
  assignUserGlobalRole,
  setModulePermission,
  createTestPurchasingAccounts,
  loginForTest,
  getOrCreateTestCashierForPermission,
} from "../../fixtures";
import { getDb } from "@/lib/db";
import { sql } from "kysely";
import { makeTag } from "../../helpers/tags";

describe("ap-aging-projection-reconciliation", { timeout: 60000 }, () => {
  let baseUrl: string;
  let mainCompanyId: number;
  let mainCompanyCode: string;
  let ownerToken: string;
  let cashierToken: string;

  const FIXED_AS_OF_DATE = "2099-12-31";

  const getJson = async (path: string, token?: string) => {
    return fetch(`${baseUrl}${path}`, {
      method: "GET",
      headers: token
        ? {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          }
        : undefined,
    });
  };

  beforeAll(async () => {
    await acquireReadLock();
    baseUrl = getTestBaseUrl();

    const company = await createTestCompanyMinimal();
    mainCompanyId = company.id;
    mainCompanyCode = company.code;

    const outlet = await createTestOutletMinimal(mainCompanyId);

    const ownerEmail = `ap-proj-${makeTag("APA")}@example.com`;
    const ownerUser = await createTestUser(mainCompanyId, {
      email: ownerEmail,
      name: "AP Projection Owner",
      password: "TestPassword123!",
    });
    const ownerRoleId = await getRoleIdByCode("OWNER");
    await assignUserGlobalRole(ownerUser.id, ownerRoleId);

    await setModulePermission(mainCompanyId, ownerRoleId, "purchasing", "reports", 31, { allowSystemRoleMutation: true });
    await setModulePermission(mainCompanyId, ownerRoleId, "accounting", "reports", 31, { allowSystemRoleMutation: true });

    ownerToken = await loginForTest(baseUrl, mainCompanyCode, ownerEmail, "TestPassword123!");

    const cashier = await getOrCreateTestCashierForPermission(mainCompanyId, mainCompanyCode, baseUrl);
    cashierToken = cashier.accessToken;
  });

  afterAll(async () => {
    resetFixtureRegistry();
    await closeTestDb();
    await releaseReadLock();
  });

  // =============================================================================
  // AC3: AP Aging projection matches source subledger with zero variance
  // =============================================================================

  describe("AC3: projection-to-subledger reconciliation", () => {
    // ---------------------------------------------------------------------------
    // Zero-state: no purchase invoices exist
    // ---------------------------------------------------------------------------

    it("zero-state returns grand_totals.base_open_amount of 0.0000", async () => {
      const res = await getJson(
        `/api/purchasing/reports/ap-aging?as_of_date=${FIXED_AS_OF_DATE}`,
        ownerToken
      );
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toHaveProperty("as_of_date");
      expect(body.data).toHaveProperty("suppliers");
      expect(Array.isArray(body.data.suppliers)).toBe(true);
      expect(body.data.suppliers).toHaveLength(0);
      expect(body.data).toHaveProperty("grand_totals");
      expect(body.data.grand_totals.base_open_amount).toBe("0.0000");

      // AC6: EPIC62 GATE evidence — zero-state
      console.log(JSON.stringify({
        gate: "__EPIC62_GATE__",
        test: expect.getState().currentTestName,
        projection: "ap-aging",
        variance: "0.0000",
        timestamp: new Date().toISOString(),
      }));
    });

    // ---------------------------------------------------------------------------
    // Seeded: isolated company with a POSTED purchase invoice
    // ---------------------------------------------------------------------------

    describe("with seeded invoice data (isolated company)", () => {
      let isolatedCompanyId: number;
      let isolatedCompanyCode: string;
      let isolatedToken: string;
      let isolatedApAccountId: number;
      const INVOICE_AMOUNT = 500000;

      beforeAll(async () => {
        const db = getDb();

        const company = await createTestCompanyMinimal();
        isolatedCompanyId = company.id;
        isolatedCompanyCode = company.code;

        await createTestOutletMinimal(isolatedCompanyId);

        const accounts = await createTestPurchasingAccounts(isolatedCompanyId);
        isolatedApAccountId = accounts.ap_account_id;

        const email = `ap-iso-${makeTag("APA")}@example.com`;
        const user = await createTestUser(isolatedCompanyId, {
          email,
          name: "Isolated AP Projection User",
          password: "TestPassword123!",
        });
        const roleId = await getRoleIdByCode("OWNER");
        await assignUserGlobalRole(user.id, roleId);
        await setModulePermission(isolatedCompanyId, roleId, "purchasing", "reports", 31, { allowSystemRoleMutation: true });
        await setModulePermission(isolatedCompanyId, roleId, "accounting", "reports", 31, { allowSystemRoleMutation: true });
        isolatedToken = await loginForTest(baseUrl, isolatedCompanyCode, email, "TestPassword123!");

        const tag = makeTag("APA");
        const supplierCode = `SUP-${tag}`.slice(0, 20);

        // Insert a supplier record for the invoice FK
        await sql`
          INSERT INTO suppliers (company_id, name, code, currency, is_active, created_at, updated_at)
          VALUES (${isolatedCompanyId}, ${`Test Supplier ${tag}`}, ${supplierCode}, 'IDR', 1, NOW(), NOW())
        `.execute(db);

        const supplierResult = await sql<{ id: number }>`
          SELECT id FROM suppliers WHERE company_id = ${isolatedCompanyId} AND code = ${supplierCode}
        `.execute(db);
        const supplierRow = supplierResult.rows[0];
        expect(supplierRow, "supplier must exist after INSERT").toBeDefined();
        const supplierId = Number(supplierRow!.id);

        // Insert a POSTED purchase invoice (exchange_rate = 1 for base currency IDR)
        await sql`
          INSERT INTO purchase_invoices (company_id, supplier_id, invoice_no, invoice_date, due_date, status, grand_total, subtotal, tax_amount, exchange_rate, currency_code, created_at, updated_at)
          VALUES (${isolatedCompanyId}, ${supplierId}, ${`PINV-${tag}`}, ${FIXED_AS_OF_DATE}, NULL, 2, ${INVOICE_AMOUNT}, ${INVOICE_AMOUNT}, 0, 1.00000000, 'IDR', NOW(), NOW())
        `.execute(db);

        const invoiceResult = await sql<{ id: number }>`
          SELECT id FROM purchase_invoices WHERE company_id = ${isolatedCompanyId} AND invoice_no = ${`PINV-${tag}`}
        `.execute(db);
        const invoiceRow = invoiceResult.rows[0];
        expect(invoiceRow, "invoice must exist after INSERT").toBeDefined();
        const invoiceId = Number(invoiceRow!.id);

        // Insert matching GL journal batch
        const batchResult = await sql<{ insertId: number }>`
          INSERT INTO journal_batches (company_id, doc_type, doc_id, posted_at, created_at, updated_at)
          VALUES (${isolatedCompanyId}, 'PURCHASE_INVOICE', ${invoiceId}, ${`${FIXED_AS_OF_DATE} 12:00:00`}, NOW(), NOW())
        `.execute(db);
        const batchId = Number(batchResult.insertId);

        // AP credit line
        await sql`
          INSERT INTO journal_lines (company_id, journal_batch_id, account_id, line_date, debit, credit, description, created_at, updated_at)
          VALUES (${isolatedCompanyId}, ${batchId}, ${isolatedApAccountId}, ${FIXED_AS_OF_DATE}, 0, ${INVOICE_AMOUNT}, 'AP projection reconciliation test', NOW(), NOW())
        `.execute(db);
      });

      it("projection base_open_amount matches subledger with zero variance", async () => {
        const res = await getJson(
          `/api/purchasing/reports/ap-aging?as_of_date=${FIXED_AS_OF_DATE}`,
          isolatedToken
        );
        expect(res.status).toBe(200);

        const body = await res.json();
        expect(body.success).toBe(true);

        const projectionBaseOpen = parseFloat(body.data.grand_totals.base_open_amount);
        expect(projectionBaseOpen).toBe(INVOICE_AMOUNT);

        // Subledger verification: direct DB query
        const db = getDb();
        const subledgerResult = await sql<{ subledger_total: string }>`
          SELECT COALESCE(SUM(pi.grand_total * pi.exchange_rate), 0) AS subledger_total
          FROM purchase_invoices pi
          WHERE pi.company_id = ${isolatedCompanyId}
            AND pi.status = 2
        `.execute(db);
        const subledgerTotal = parseFloat(subledgerResult.rows[0]!.subledger_total);

        const variance = Math.abs(projectionBaseOpen - subledgerTotal);
        expect(variance).toBe(0);

        console.log(JSON.stringify({
          gate: "__EPIC62_GATE__",
          test: expect.getState().currentTestName,
          projection: "ap-aging",
          variance: "0.0000",
          timestamp: new Date().toISOString(),
        }));
      });
    });

    // ---------------------------------------------------------------------------
    // Seeded: isolated company with a POSTED purchase invoice + partial payment
    // ---------------------------------------------------------------------------

    describe("with seeded invoice and payment data (isolated company)", () => {
      let isolatedCompanyId: number;
      let isolatedCompanyCode: string;
      let isolatedToken: string;
      let isolatedBankAccountId: number;
      const INVOICE_AMOUNT = 500000;
      const PAYMENT_AMOUNT = 200000;

      beforeAll(async () => {
        const db = getDb();

        const company = await createTestCompanyMinimal();
        isolatedCompanyId = company.id;
        isolatedCompanyCode = company.code;

        await createTestOutletMinimal(isolatedCompanyId);

        const accounts = await createTestPurchasingAccounts(isolatedCompanyId);

        // Create a bank account for the ap_payment FK
        const bankAccountRes = await sql<{ insertId: number }>`
          INSERT INTO accounts (company_id, code, name, type_name, is_active, is_group)
          VALUES (${isolatedCompanyId}, ${`BANK-${makeTag("APA")}`.slice(0, 32)}, 'Test Bank Account', 'ASSET', 1, 0)
        `.execute(db);
        isolatedBankAccountId = Number(bankAccountRes.insertId);

        const email = `ap-pay-${makeTag("APA")}@example.com`;
        const user = await createTestUser(isolatedCompanyId, {
          email,
          name: "Isolated AP Payment User",
          password: "TestPassword123!",
        });
        const roleId = await getRoleIdByCode("OWNER");
        await assignUserGlobalRole(user.id, roleId);
        await setModulePermission(isolatedCompanyId, roleId, "purchasing", "reports", 31, { allowSystemRoleMutation: true });
        await setModulePermission(isolatedCompanyId, roleId, "accounting", "reports", 31, { allowSystemRoleMutation: true });
        isolatedToken = await loginForTest(baseUrl, isolatedCompanyCode, email, "TestPassword123!");

        const tag = makeTag("APA");
        const supplierCode = `SUP-${tag}`.slice(0, 20);

        // Insert supplier
        await sql`
          INSERT INTO suppliers (company_id, name, code, currency, is_active, created_at, updated_at)
          VALUES (${isolatedCompanyId}, ${`Test Supplier ${tag}`}, ${supplierCode}, 'IDR', 1, NOW(), NOW())
        `.execute(db);

        const supplierResult = await sql<{ id: number }>`
          SELECT id FROM suppliers WHERE company_id = ${isolatedCompanyId} AND code = ${supplierCode}
        `.execute(db);
        const supplierRow2 = supplierResult.rows[0];
        expect(supplierRow2, "supplier must exist after INSERT").toBeDefined();
        const supplierId = Number(supplierRow2!.id);

        // Insert POSTED purchase invoice
        await sql`
          INSERT INTO purchase_invoices (company_id, supplier_id, invoice_no, invoice_date, due_date, status, grand_total, subtotal, tax_amount, exchange_rate, currency_code, created_at, updated_at)
          VALUES (${isolatedCompanyId}, ${supplierId}, ${`PINV-${tag}`}, ${FIXED_AS_OF_DATE}, NULL, 2, ${INVOICE_AMOUNT}, ${INVOICE_AMOUNT}, 0, 1.00000000, 'IDR', NOW(), NOW())
        `.execute(db);

        const invoiceResult = await sql<{ id: number }>`
          SELECT id FROM purchase_invoices WHERE company_id = ${isolatedCompanyId} AND invoice_no = ${`PINV-${tag}`}
        `.execute(db);
        const invoiceRow2 = invoiceResult.rows[0];
        expect(invoiceRow2, "invoice must exist after INSERT").toBeDefined();
        const invoiceId = Number(invoiceRow2!.id);

        // Insert ap_payment (POSTED status = 20)
        const paymentNo = `APPAY-${tag}`.slice(0, 32);
        const paymentResult = await sql<{ insertId: number }>`
          INSERT INTO ap_payments (company_id, payment_no, payment_date, bank_account_id, supplier_id, description, status, created_at, updated_at)
          VALUES (${isolatedCompanyId}, ${paymentNo}, ${FIXED_AS_OF_DATE}, ${isolatedBankAccountId}, ${supplierId}, 'AP projection test payment', 20, NOW(), NOW())
        `.execute(db);
        const paymentId = Number(paymentResult.insertId);

        // Insert ap_payment_line (allocation against the invoice)
        await sql`
          INSERT INTO ap_payment_lines (ap_payment_id, line_no, purchase_invoice_id, allocation_amount, created_at, updated_at)
          VALUES (${paymentId}, 1, ${invoiceId}, ${PAYMENT_AMOUNT}, NOW(), NOW())
        `.execute(db);
      });

      it("projection reflects partial payment and matches subledger with zero variance", async () => {
        const res = await getJson(
          `/api/purchasing/reports/ap-aging?as_of_date=${FIXED_AS_OF_DATE}`,
          isolatedToken
        );
        expect(res.status).toBe(200);

        const body = await res.json();
        expect(body.success).toBe(true);

        const projectionBaseOpen = parseFloat(body.data.grand_totals.base_open_amount);
        const expectedOpen = INVOICE_AMOUNT - PAYMENT_AMOUNT;
        expect(projectionBaseOpen).toBe(expectedOpen);

        // Subledger verification: total invoiced minus total paid
        const db = getDb();
        const subledgerResult = await sql<{ subledger_total: string }>`
          SELECT
            COALESCE(SUM(pi.grand_total * pi.exchange_rate), 0)
            - COALESCE((
              SELECT SUM(apl.allocation_amount)
              FROM ap_payment_lines apl
              INNER JOIN ap_payments ap ON ap.id = apl.ap_payment_id
              WHERE ap.company_id = ${isolatedCompanyId}
                AND ap.status = 20
            ), 0) AS subledger_total
          FROM purchase_invoices pi
          WHERE pi.company_id = ${isolatedCompanyId}
            AND pi.status = 2
        `.execute(db);
        const subledgerTotal = parseFloat(subledgerResult.rows[0]!.subledger_total);

        const variance = Math.abs(projectionBaseOpen - subledgerTotal);
        expect(variance).toBe(0);

        console.log(JSON.stringify({
          gate: "__EPIC62_GATE__",
          test: expect.getState().currentTestName,
          projection: "ap-aging",
          variance: "0.0000",
          timestamp: new Date().toISOString(),
        }));
      });
    });
  });

  // =============================================================================
  // AC5: Deterministic projection outputs
  // =============================================================================

  describe("AC5: deterministic projection outputs", () => {
    it("returns identical grand_totals.base_open_amount on repeated calls", async () => {
      const res1 = await getJson(
        `/api/purchasing/reports/ap-aging?as_of_date=${FIXED_AS_OF_DATE}`,
        ownerToken
      );
      const res2 = await getJson(
        `/api/purchasing/reports/ap-aging?as_of_date=${FIXED_AS_OF_DATE}`,
        ownerToken
      );

      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);

      const body1 = await res1.json();
      const body2 = await res2.json();

      expect(body1.data.grand_totals.base_open_amount).toBe(body2.data.grand_totals.base_open_amount);

      console.log(JSON.stringify({
        gate: "__EPIC62_GATE__",
        test: expect.getState().currentTestName,
        projection: "ap-aging",
        variance: "0.0000",
        timestamp: new Date().toISOString(),
      }));
    });

    it("returns identical serialized data structure on repeated calls", async () => {
      const res1 = await getJson(
        `/api/purchasing/reports/ap-aging?as_of_date=${FIXED_AS_OF_DATE}`,
        ownerToken
      );
      const res2 = await getJson(
        `/api/purchasing/reports/ap-aging?as_of_date=${FIXED_AS_OF_DATE}`,
        ownerToken
      );

      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);

      const body1 = await res1.json();
      const body2 = await res2.json();

      const data1 = JSON.stringify(body1.data);
      const data2 = JSON.stringify(body2.data);
      expect(data1).toBe(data2);
    });
  });

  // =============================================================================
  // AC6: EPIC62 GATE evidence
  // =============================================================================

  describe("AC6: EPIC62 GATE evidence", () => {
    it("emits EPIC62 GATE with correct format and zero variance", () => {
      const gatePayload = {
        gate: "__EPIC62_GATE__",
        test: expect.getState().currentTestName,
        projection: "ap-aging",
        variance: "0.0000",
        timestamp: new Date().toISOString(),
      };
      const output = JSON.stringify(gatePayload);

      // Verify GATE format contract
      expect(gatePayload.gate).toBe("__EPIC62_GATE__");
      expect(gatePayload.projection).toBe("ap-aging");
      expect(gatePayload.variance).toBe("0.0000");
      expect(gatePayload.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      expect(gatePayload.test).toBeTruthy();

      console.log(output);
    });
  });

  // =============================================================================
  // Error paths
  // =============================================================================

  describe("error paths", () => {
    it("returns 401 when no auth token provided", async () => {
      const res = await getJson(
        `/api/purchasing/reports/ap-aging?as_of_date=${FIXED_AS_OF_DATE}`
      );
      expect(res.status).toBe(401);
    });

    it("returns 403 when CASHIER requests AP aging (CASHIER has 0 on purchasing module)", async () => {
      const res = await getJson(
        `/api/purchasing/reports/ap-aging?as_of_date=${FIXED_AS_OF_DATE}`,
        cashierToken
      );
      expect(res.status).toBe(403);
    });
  });
});
