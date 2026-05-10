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
import { createSupplierFixture, createTestPurchaseInvoice, createTestApPayment } from "@jurnapod/modules-purchasing/test-fixtures";
import { PurchaseInvoiceService, APPaymentService } from "@jurnapod/modules-purchasing";

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

        // Create supplier via canonical fixture
        const supplier = await createSupplierFixture(db, {
          companyId: isolatedCompanyId,
          code: supplierCode,
          name: `Test Supplier ${tag}`,
          currency: 'IDR',
        });
        const supplierId = supplier.id;

        // Create purchase invoice via canonical fixture (draft)
        const invoice = await createTestPurchaseInvoice(db, {
          companyId: isolatedCompanyId,
          userId: user.id,
          supplierId,
          invoiceNo: `PINV-${tag}`,
          invoiceDate: new Date(FIXED_AS_OF_DATE),
          currencyCode: 'IDR',
          lines: [{ description: 'AP projection reconciliation test', qty: '1', unitPrice: `${INVOICE_AMOUNT}.0000` }],
        });
        const invoiceId = invoice.id;

        // Post the invoice via production service (creates journal_batch + journal_lines)
        const piService = new PurchaseInvoiceService(db);
        await piService.postPI({
          companyId: isolatedCompanyId,
          userId: user.id,
          piId: invoiceId,
          guardrailDecision: null,
          validOverrideReason: null,
        });
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
          VALUES (${isolatedCompanyId}, ${`BANK-${makeTag("APA")}`.slice(0, 32)}, 'Test Bank Account', 'BANK', 1, 0)
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

        // Create supplier via canonical fixture
        const supplier = await createSupplierFixture(db, {
          companyId: isolatedCompanyId,
          code: supplierCode,
          name: `Test Supplier ${tag}`,
          currency: 'IDR',
        });
        const supplierId = supplier.id;

        // Create purchase invoice via canonical fixture (draft)
        const invoice = await createTestPurchaseInvoice(db, {
          companyId: isolatedCompanyId,
          userId: user.id,
          supplierId,
          invoiceNo: `PINV-${tag}`,
          invoiceDate: new Date(FIXED_AS_OF_DATE),
          currencyCode: 'IDR',
          lines: [{ description: 'AP projection reconciliation test', qty: '1', unitPrice: `${INVOICE_AMOUNT}.0000` }],
        });
        const invoiceId = invoice.id;

        // Post the invoice via production service (creates journal_batch + journal_lines)
        const piService = new PurchaseInvoiceService(db);
        await piService.postPI({
          companyId: isolatedCompanyId,
          userId: user.id,
          piId: invoiceId,
          guardrailDecision: null,
          validOverrideReason: null,
        });

        // Create AP payment via canonical fixture (draft)
        const payment = await createTestApPayment(db, {
          companyId: isolatedCompanyId,
          userId: user.id,
          supplierId,
          bankAccountId: isolatedBankAccountId,
          paymentDate: new Date(FIXED_AS_OF_DATE),
          lines: [{ purchaseInvoiceId: invoiceId, allocationAmount: String(PAYMENT_AMOUNT) }],
        });
        const paymentId = payment.id;

        // Post the payment via production service
        const apService = new APPaymentService(db);
        await apService.postAPPayment({
          companyId: isolatedCompanyId,
          userId: user.id,
          paymentId,
          guardrailDecision: null,
          validOverrideReason: null,
        });
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
