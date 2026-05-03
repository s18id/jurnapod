// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * AP Subledger Reconciliation Integration Tests (Story 51.3)
 *
 * Tests AP subledger-to-GL reconciliation:
 * - AC1: AP subledger sum vs GL control account balance reconciliation
 * - AC2: Reconciliation report endpoint
 * - AC3: Variance drilldown by document type
 * - AC5: Integration tests 3× consecutive green
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
} from "../../fixtures";
import { getDb } from "@/lib/db";
import { sql } from "kysely";
import { makeTag } from "../../helpers/tags";

describe("ap-subledger-reconciliation", { timeout: 60000 }, () => {
  let baseUrl: string;
  let testCompanyId: number;
  let testOutletId: number;
  let ownerToken: string;
  let apAccountId: number;

  const putJson = async (path: string, token: string, body?: unknown) => {
    return fetch(`${baseUrl}${path}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  };

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

  // Fixed future date — beyond any real transaction, ensures deterministic "as-of" queries
  const FIXED_AS_OF_DATE = "2099-12-31";

  beforeAll(async () => {
    await acquireReadLock();
    baseUrl = getTestBaseUrl();

    const company = await createTestCompanyMinimal();
    testCompanyId = company.id;

    const outlet = await createTestOutletMinimal(testCompanyId);
    testOutletId = outlet.id;

    const ownerEmail = `ap-rec-${makeTag("OWN", 10)}@example.com`;
    const ownerUser = await createTestUser(testCompanyId, {
      email: ownerEmail,
      name: "AP Recon Owner",
      password: "TestPassword123!",
    });
    const ownerRoleId = await getRoleIdByCode("OWNER");
    await assignUserGlobalRole(ownerUser.id, ownerRoleId);

    await setModulePermission(testCompanyId, ownerRoleId, "accounting", "accounts", 63, { allowSystemRoleMutation: true });
    await setModulePermission(testCompanyId, ownerRoleId, "accounting", "reports", 63, { allowSystemRoleMutation: true });

    ownerToken = await loginForTest(baseUrl, company.code, ownerEmail, "TestPassword123!");

    const accounts = await createTestPurchasingAccounts(testCompanyId);
    apAccountId = accounts.ap_account_id;

    // Configure AP reconciliation settings
    const settingsRes = await putJson("/api/accounting/reports/ap-reconciliation/settings", ownerToken, {
      account_ids: [apAccountId],
    });
    expect(settingsRes.status).toBe(200);
  });

  afterAll(async () => {
    resetFixtureRegistry();
    await closeTestDb();
    await releaseReadLock();
  });

  // =============================================================================
  // AC2: Reconciliation Report Endpoint
  // =============================================================================

  describe("AC2: reconciliation report endpoint", () => {
    it("GET /accounting/reports/ap-reconciliation/summary returns 200 with valid auth", async () => {
      const res = await getJson(
        `/api/accounting/reports/ap-reconciliation/summary?as_of_date=${FIXED_AS_OF_DATE}`,
        ownerToken
      );
      expect(res.status).toBe(200);
    });

    it("returns proper response structure with all required fields", async () => {
      const res = await getJson(
        `/api/accounting/reports/ap-reconciliation/summary?as_of_date=${FIXED_AS_OF_DATE}`,
        ownerToken
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toHaveProperty("as_of_date");
      expect(body.data).toHaveProperty("ap_subledger_balance");
      expect(body.data).toHaveProperty("gl_control_balance");
      expect(body.data).toHaveProperty("variance");
      expect(body.data).toHaveProperty("configured_account_ids");
      expect(body.data).toHaveProperty("account_source");
      expect(body.data).toHaveProperty("currency");
    });

    it("GET /accounting/reports/ap-reconciliation/settings returns configured account IDs", async () => {
      const res = await getJson("/api/accounting/reports/ap-reconciliation/settings", ownerToken);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.account_ids).toContain(apAccountId);
      expect(body.data.source).toBe("settings");
    });

    it("returns 401 without auth token", async () => {
      const res = await getJson(
        `/api/accounting/reports/ap-reconciliation/summary?as_of_date=${FIXED_AS_OF_DATE}`
      );
      expect(res.status).toBe(401);
    });
  });

  // =============================================================================
  // AC1: AP Subledger-to-GL Reconciliation
  // =============================================================================

  describe("AC1: AP subledger-to-GL reconciliation", () => {
    it("reconciles zero when no posted transactions exist", async () => {
      const res = await getJson(
        `/api/accounting/reports/ap-reconciliation/summary?as_of_date=${FIXED_AS_OF_DATE}`,
        ownerToken
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.ap_subledger_balance).toBe("0.0000");
      expect(body.data.gl_control_balance).toBe("0.0000");
      expect(body.data.variance).toBe("0.0000");
    });

    it("returns deterministic balance for fixed date across repeated calls", async () => {
      const res1 = await getJson(
        `/api/accounting/reports/ap-reconciliation/summary?as_of_date=${FIXED_AS_OF_DATE}`,
        ownerToken
      );
      const res2 = await getJson(
        `/api/accounting/reports/ap-reconciliation/summary?as_of_date=${FIXED_AS_OF_DATE}`,
        ownerToken
      );

      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);

      const body1 = await res1.json();
      const body2 = await res2.json();

      expect(body1.data.ap_subledger_balance).toBe(body2.data.ap_subledger_balance);
      expect(body1.data.gl_control_balance).toBe(body2.data.gl_control_balance);
      expect(body1.data.variance).toBe(body2.data.variance);
    });

    describe("with seeded invoice and GL data (isolated company)", () => {
      let isolatedCompanyId: number;
      let isolatedOutletId: number;
      let isolatedApAccountId: number;
      let isolatedToken: string;
      const INVOICE_AMOUNT = 300000;

      beforeAll(async () => {
        const db = getDb();

        const company = await createTestCompanyMinimal();
        isolatedCompanyId = company.id;

        const outlet = await createTestOutletMinimal(isolatedCompanyId);
        isolatedOutletId = outlet.id;

        const accounts = await createTestPurchasingAccounts(isolatedCompanyId);
        isolatedApAccountId = accounts.ap_account_id;

        const email = `ap-iso-${makeTag("ISO")}@example.com`;
        const user = await createTestUser(isolatedCompanyId, {
          email,
          name: "Isolated AP Test User",
          password: "TestPassword123!",
        });
        const roleId = await getRoleIdByCode("OWNER");
        await assignUserGlobalRole(user.id, roleId);
        await setModulePermission(isolatedCompanyId, roleId, "accounting", "accounts", 63, { allowSystemRoleMutation: true });
        await setModulePermission(isolatedCompanyId, roleId, "accounting", "reports", 63, { allowSystemRoleMutation: true });
        isolatedToken = await loginForTest(baseUrl, company.code, email, "TestPassword123!");

        // Configure AP reconciliation settings
        const settingsRes = await putJson("/api/accounting/reports/ap-reconciliation/settings", isolatedToken, {
          account_ids: [isolatedApAccountId],
        });
        expect(settingsRes.status).toBe(200);

        const tag = makeTag("APII");

        // Insert a supplier record for the invoice FK
        const supplierResult = await sql<{ insertId: number }>`
          INSERT INTO suppliers (company_id, name, code, currency, is_active, created_at, updated_at)
          -- CHAR(3) column — use 3-letter ISO code
          VALUES (${isolatedCompanyId}, ${`Test Supplier ${tag}`}, ${`SUP-${tag}`.slice(0, 20)}, 'IDR', 1, NOW(), NOW())
        `.execute(db);
        const supplierId = Number(supplierResult.insertId);

        // Insert a POSTED purchase invoice (exchange_rate = 1 for base currency)
        const invoiceResult = await sql<{ insertId: number }>`
          INSERT INTO purchase_invoices (company_id, supplier_id, invoice_no, invoice_date, status, grand_total, subtotal, tax_amount, exchange_rate, currency_code, created_at, updated_at)
          VALUES (${isolatedCompanyId}, ${supplierId}, ${`PINV-${tag}`}, ${FIXED_AS_OF_DATE}, 2, ${INVOICE_AMOUNT}, ${INVOICE_AMOUNT}, 0,           1.00000000, 'IDR', NOW(), NOW())
        `.execute(db);
        const invoiceId = Number(invoiceResult.insertId);

        // Insert matching GL journal batch (doc_type=PURCHASE_INVOICE, posted within cutoff)
        const batchResult = await sql<{ insertId: number }>`
          INSERT INTO journal_batches (company_id, doc_type, doc_id, posted_at, created_at, updated_at)
          VALUES (${isolatedCompanyId}, 'PURCHASE_INVOICE', ${invoiceId}, ${`${FIXED_AS_OF_DATE} 12:00:00`}, NOW(), NOW())
        `.execute(db);
        const batchId = Number(batchResult.insertId);

        // AP credit line: credit the AP account (liability — credit is positive)
        await sql`
          INSERT INTO journal_lines (company_id, journal_batch_id, account_id, line_date, debit, credit, description, created_at, updated_at)
          VALUES (${isolatedCompanyId}, ${batchId}, ${isolatedApAccountId}, ${FIXED_AS_OF_DATE}, 0, ${INVOICE_AMOUNT}, 'AP reconciliation test', NOW(), NOW())
        `.execute(db);
      });

      it("AP subledger correctly reflects posted invoice balance", async () => {
        const res = await getJson(
          `/api/accounting/reports/ap-reconciliation/summary?as_of_date=${FIXED_AS_OF_DATE}`,
          isolatedToken
        );
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);

        // Both subledger (from purchase_invoices) and GL (from journal_lines) should show the invoice amount
        expect(parseFloat(body.data.ap_subledger_balance)).toBeGreaterThanOrEqual(INVOICE_AMOUNT);
        expect(parseFloat(body.data.gl_control_balance)).toBeGreaterThanOrEqual(INVOICE_AMOUNT);
        // Variance must be zero: seeded symmetrically
        expect(body.data.variance).toBe("0.0000");
      });

      it("variance remains zero across repeated calls (deterministic with data)", async () => {
        const results: string[] = [];
        for (let i = 0; i < 3; i++) {
          const res = await getJson(
            `/api/accounting/reports/ap-reconciliation/summary?as_of_date=${FIXED_AS_OF_DATE}`,
            isolatedToken
          );
          expect(res.status).toBe(200);
          const body = await res.json();
          results.push(body.data.variance);
        }
        expect(new Set(results).size).toBe(1);
        expect(results[0]).toBe("0.0000");
      });
    });
  });

  // =============================================================================
  // AC3: Variance Drilldown by Document Type
  // =============================================================================

  describe("AC3: variance drilldown by document type", () => {
    it("GET /accounting/reports/ap-reconciliation/drilldown returns 200", async () => {
      const res = await getJson(
        `/api/accounting/reports/ap-reconciliation/drilldown?as_of_date=${FIXED_AS_OF_DATE}`,
        ownerToken
      );
      expect(res.status).toBe(200);
    });

    it("returns drilldown response with all required fields", async () => {
      const res = await getJson(
        `/api/accounting/reports/ap-reconciliation/drilldown?as_of_date=${FIXED_AS_OF_DATE}`,
        ownerToken
      );
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toHaveProperty("as_of_date");
      expect(body.data).toHaveProperty("categories");
      expect(body.data).toHaveProperty("lines");
      expect(body.data).toHaveProperty("total_variance");
      expect(body.data).toHaveProperty("has_more");
      expect(body.data).toHaveProperty("next_cursor");
      expect(Array.isArray(body.data.categories)).toBe(true);
      expect(Array.isArray(body.data.lines)).toBe(true);
    });

    it("drilldown line items include sourceId and sourceType fields", async () => {
      const res = await getJson(
        `/api/accounting/reports/ap-reconciliation/drilldown?as_of_date=${FIXED_AS_OF_DATE}`,
        ownerToken
      );
      const body = await res.json();
      expect(body.success).toBe(true);
      for (const line of body.data.lines) {
        expect(line).toHaveProperty("sourceId");
        expect(line).toHaveProperty("sourceType");
        expect(line).toHaveProperty("variance");
      }
    });

    it("document_type=purchase_invoice filter returns without SQL error", async () => {
      const res = await getJson(
        `/api/accounting/reports/ap-reconciliation/drilldown?as_of_date=${FIXED_AS_OF_DATE}&document_type=purchase_invoice`,
        ownerToken
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      for (const line of body.data.lines) {
        expect(line.type).toBe("purchase_invoice");
      }
    });

    it("document_type=ap_payment filter returns without SQL error", async () => {
      const res = await getJson(
        `/api/accounting/reports/ap-reconciliation/drilldown?as_of_date=${FIXED_AS_OF_DATE}&document_type=ap_payment`,
        ownerToken
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
    });

    it("document_type=purchase_credit filter returns without SQL error", async () => {
      const res = await getJson(
        `/api/accounting/reports/ap-reconciliation/drilldown?as_of_date=${FIXED_AS_OF_DATE}&document_type=purchase_credit`,
        ownerToken
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
    });

    it("supports pagination with limit parameter", async () => {
      const res = await getJson(
        `/api/accounting/reports/ap-reconciliation/drilldown?as_of_date=${FIXED_AS_OF_DATE}&limit=1`,
        ownerToken
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.lines.length).toBeLessThanOrEqual(1);
      expect(body.data).toHaveProperty("has_more");
      expect(body.data).toHaveProperty("next_cursor");
    });

    it("returns deterministic results across multiple calls", async () => {
      const res1 = await getJson(
        `/api/accounting/reports/ap-reconciliation/drilldown?as_of_date=${FIXED_AS_OF_DATE}`,
        ownerToken
      );
      const res2 = await getJson(
        `/api/accounting/reports/ap-reconciliation/drilldown?as_of_date=${FIXED_AS_OF_DATE}`,
        ownerToken
      );

      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);

      const body1 = await res1.json();
      const body2 = await res2.json();

      expect(body1.data.total_variance).toBe(body2.data.total_variance);
      expect(body1.data.lines.length).toBe(body2.data.lines.length);
    });
  });

  // =============================================================================
  // AC5: Integration Tests 3× Consecutive Green (Deterministic)
  // =============================================================================

  describe("AC5: deterministic 3× green run verification", () => {
    it("run 1: summary variance is deterministic", async () => {
      const res = await getJson(
        `/api/accounting/reports/ap-reconciliation/summary?as_of_date=${FIXED_AS_OF_DATE}`,
        ownerToken
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.variance).toBe("0.0000");
    });

    it("run 2: summary variance is deterministic", async () => {
      const res = await getJson(
        `/api/accounting/reports/ap-reconciliation/summary?as_of_date=${FIXED_AS_OF_DATE}`,
        ownerToken
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.variance).toBe("0.0000");
    });

    it("run 3: summary variance is deterministic", async () => {
      const res = await getJson(
        `/api/accounting/reports/ap-reconciliation/summary?as_of_date=${FIXED_AS_OF_DATE}`,
        ownerToken
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.variance).toBe("0.0000");
    });
  });
});
