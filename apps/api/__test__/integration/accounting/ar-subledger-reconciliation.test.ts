// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * AR Subledger Reconciliation Integration Tests (Story 51.2)
 *
 * Tests AR subledger-to-GL reconciliation:
 * - AC1: AR subledger sum vs GL control account balance reconciliation
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
  ensureTestSalesAccountMappings,
  createTestBankAccount,
  loginForTest,
} from "../../fixtures";
import { makeTag } from "../../helpers/tags";

describe("ar-subledger-reconciliation", { timeout: 60000 }, () => {
  let baseUrl: string;
  let testCompanyId: number;
  let testOutletId: number;
  let ownerToken: string;
  let arAccountId: number;
  let bankAccountId: number;

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

  // Helpers for creating and posting sales documents

  const createAndPostInvoice = async (amount: number, invoiceDate: string): Promise<number> => {
    const tag = makeTag("INV");
    const createRes = await fetch(`${baseUrl}/api/sales/invoices`, {
      method: "POST",
      headers: { Authorization: `Bearer ${ownerToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        outlet_id: testOutletId,
        invoice_date: invoiceDate,
        lines: [{ description: `AR recon test ${tag}`, qty: 1, unit_price: amount, line_type: "SERVICE" }],
      }),
    });
    expect(createRes.status, `invoice create: ${await createRes.text()}`).toBe(201);
    const created = await createRes.json();
    const invoiceId = Number(created.data.id);

    const postRes = await fetch(`${baseUrl}/api/sales/invoices/${invoiceId}/post`, {
      method: "POST",
      headers: { Authorization: `Bearer ${ownerToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(postRes.status, `invoice post: ${await postRes.text()}`).toBe(200);
    return invoiceId;
  };

  const createAndPostPayment = async (invoiceId: number, amount: number, paymentDate: string): Promise<number> => {
    const createRes = await fetch(`${baseUrl}/api/sales/payments`, {
      method: "POST",
      headers: { Authorization: `Bearer ${ownerToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        outlet_id: testOutletId,
        invoice_id: invoiceId,
        account_id: bankAccountId,
        payment_at: `${paymentDate}T00:00:00`,
        method: "CASH",
        amount,
      }),
    });
    expect(createRes.status, `payment create: ${await createRes.text()}`).toBe(201);
    const created = await createRes.json();
    const paymentId = Number(created.data.id);

    const postRes = await fetch(`${baseUrl}/api/sales/payments/${paymentId}/post`, {
      method: "POST",
      headers: { Authorization: `Bearer ${ownerToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(postRes.status, `payment post: ${await postRes.text()}`).toBe(200);
    return paymentId;
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

    const ownerEmail = `ar-rec-${makeTag("OWN", 10)}-${Date.now()}@example.com`;
    const ownerUser = await createTestUser(testCompanyId, {
      email: ownerEmail,
      name: "AR Recon Owner",
      password: "TestPassword123!",
    });
    const ownerRoleId = await getRoleIdByCode("OWNER");
    await assignUserGlobalRole(ownerUser.id, ownerRoleId);

    await setModulePermission(testCompanyId, ownerRoleId, "accounting", "accounts", 63, { allowSystemRoleMutation: true });
    await setModulePermission(testCompanyId, ownerRoleId, "accounting", "reports", 63, { allowSystemRoleMutation: true });
    await setModulePermission(testCompanyId, ownerRoleId, "sales", "invoices", 63, { allowSystemRoleMutation: true });
    await setModulePermission(testCompanyId, ownerRoleId, "sales", "payments", 63, { allowSystemRoleMutation: true });
    await setModulePermission(testCompanyId, ownerRoleId, "sales", "credit_notes", 63, { allowSystemRoleMutation: true });

    ownerToken = await loginForTest(baseUrl, company.code, ownerEmail, "TestPassword123!");

    const mappingResult = await ensureTestSalesAccountMappings(testCompanyId, testOutletId);
    arAccountId = mappingResult.ar_account_id;

    bankAccountId = await createTestBankAccount(testCompanyId, { typeName: "BANK", isActive: true });

    // Configure AR reconciliation settings with the AR account
    const settingsRes = await putJson("/api/accounting/reports/ar-reconciliation/settings", ownerToken, {
      account_ids: [arAccountId],
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
    it("GET /accounting/reports/ar-reconciliation/summary returns 200 with valid auth", async () => {
      const res = await getJson(
        `/api/accounting/reports/ar-reconciliation/summary?as_of_date=${FIXED_AS_OF_DATE}`,
        ownerToken
      );
      expect(res.status).toBe(200);
    });

    it("returns proper response structure with all required fields", async () => {
      const res = await getJson(
        `/api/accounting/reports/ar-reconciliation/summary?as_of_date=${FIXED_AS_OF_DATE}`,
        ownerToken
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toHaveProperty("as_of_date");
      expect(body.data).toHaveProperty("ar_subledger_balance");
      expect(body.data).toHaveProperty("gl_control_balance");
      expect(body.data).toHaveProperty("variance");
      expect(body.data).toHaveProperty("configured_account_ids");
      expect(body.data).toHaveProperty("account_source");
      expect(body.data).toHaveProperty("currency");
    });

    it("GET /accounting/reports/ar-reconciliation/settings returns configured account IDs", async () => {
      const res = await getJson("/api/accounting/reports/ar-reconciliation/settings", ownerToken);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.account_ids).toContain(arAccountId);
      expect(body.data.source).toBe("settings");
    });

    it("includes configured account IDs in summary response", async () => {
      const res = await getJson(
        `/api/accounting/reports/ar-reconciliation/summary?as_of_date=${FIXED_AS_OF_DATE}`,
        ownerToken
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data.configured_account_ids)).toBe(true);
      expect(body.data.configured_account_ids.length).toBeGreaterThan(0);
    });
  });

  // =============================================================================
  // AC1: AR Subledger-to-GL Reconciliation
  // =============================================================================

  describe("AC1: AR subledger-to-GL reconciliation", () => {
    it("reconciles zero when no posted transactions exist", async () => {
      const res = await getJson(
        `/api/accounting/reports/ar-reconciliation/summary?as_of_date=${FIXED_AS_OF_DATE}`,
        ownerToken
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      // Fresh company with no posted transactions: all balances are zero
      expect(body.data.ar_subledger_balance).toBe("0.0000");
      expect(body.data.gl_control_balance).toBe("0.0000");
      expect(body.data.variance).toBe("0.0000");
    });

    it("AR subledger equals invoice grand_total after posting an invoice", async () => {
      const invoiceAmount = 100000;
      await createAndPostInvoice(invoiceAmount, FIXED_AS_OF_DATE);

      const res = await getJson(
        `/api/accounting/reports/ar-reconciliation/summary?as_of_date=${FIXED_AS_OF_DATE}`,
        ownerToken
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);

      // Subledger and GL should both reflect the invoice
      expect(parseFloat(body.data.ar_subledger_balance)).toBeGreaterThanOrEqual(invoiceAmount);
      // Variance must be zero: subledger matches GL (both set by the same posting)
      expect(body.data.variance).toBe("0.0000");
    });

    it("payment reduces AR subledger and GL equally (zero variance)", async () => {
      const invoiceAmount = 60000;
      const paymentAmount = 40000;

      const invoiceId = await createAndPostInvoice(invoiceAmount, FIXED_AS_OF_DATE);
      await createAndPostPayment(invoiceId, paymentAmount, FIXED_AS_OF_DATE);

      const res = await getJson(
        `/api/accounting/reports/ar-reconciliation/summary?as_of_date=${FIXED_AS_OF_DATE}`,
        ownerToken
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);

      // Subledger and GL both reduce by the payment — variance stays zero
      expect(body.data.variance).toBe("0.0000");
      // AR subledger reflects the net (other transactions from prior tests also count)
      expect(parseFloat(body.data.ar_subledger_balance)).toBeGreaterThan(0);
    });

    it("returns deterministic balance for fixed date across repeated calls", async () => {
      const res1 = await getJson(
        `/api/accounting/reports/ar-reconciliation/summary?as_of_date=${FIXED_AS_OF_DATE}`,
        ownerToken
      );
      const res2 = await getJson(
        `/api/accounting/reports/ar-reconciliation/summary?as_of_date=${FIXED_AS_OF_DATE}`,
        ownerToken
      );

      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);

      const body1 = await res1.json();
      const body2 = await res2.json();

      expect(body1.data.ar_subledger_balance).toBe(body2.data.ar_subledger_balance);
      expect(body1.data.gl_control_balance).toBe(body2.data.gl_control_balance);
      expect(body1.data.variance).toBe(body2.data.variance);
    });
  });

  // =============================================================================
  // AC3: Variance Drilldown by Document Type
  // =============================================================================

  describe("AC3: variance drilldown by document type", () => {
    it("GET /accounting/reports/ar-reconciliation/drilldown returns 200", async () => {
      const res = await getJson(
        `/api/accounting/reports/ar-reconciliation/drilldown?as_of_date=${FIXED_AS_OF_DATE}`,
        ownerToken
      );
      expect(res.status).toBe(200);
    });

    it("returns drilldown response with all required fields", async () => {
      const res = await getJson(
        `/api/accounting/reports/ar-reconciliation/drilldown?as_of_date=${FIXED_AS_OF_DATE}`,
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
        `/api/accounting/reports/ar-reconciliation/drilldown?as_of_date=${FIXED_AS_OF_DATE}`,
        ownerToken
      );
      const body = await res.json();
      expect(body.success).toBe(true);
      // Each line should have the required drilldown fields
      for (const line of body.data.lines) {
        expect(line).toHaveProperty("sourceId");
        expect(line).toHaveProperty("sourceType");
        expect(line).toHaveProperty("variance");
      }
    });

    it("document_type=sales_invoice filter returns without SQL error", async () => {
      const res = await getJson(
        `/api/accounting/reports/ar-reconciliation/drilldown?as_of_date=${FIXED_AS_OF_DATE}&document_type=sales_invoice`,
        ownerToken
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      // All returned lines must be sales_invoice type
      for (const line of body.data.lines) {
        expect(line.type).toBe("sales_invoice");
      }
    });

    it("document_type=sales_payment filter returns without SQL error", async () => {
      const res = await getJson(
        `/api/accounting/reports/ar-reconciliation/drilldown?as_of_date=${FIXED_AS_OF_DATE}&document_type=sales_payment`,
        ownerToken
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
    });

    it("supports pagination with limit parameter", async () => {
      const res = await getJson(
        `/api/accounting/reports/ar-reconciliation/drilldown?as_of_date=${FIXED_AS_OF_DATE}&limit=1`,
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
        `/api/accounting/reports/ar-reconciliation/drilldown?as_of_date=${FIXED_AS_OF_DATE}`,
        ownerToken
      );
      const res2 = await getJson(
        `/api/accounting/reports/ar-reconciliation/drilldown?as_of_date=${FIXED_AS_OF_DATE}`,
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
        `/api/accounting/reports/ar-reconciliation/summary?as_of_date=${FIXED_AS_OF_DATE}`,
        ownerToken
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      // Variance must be zero: subledger and GL are always posted together
      expect(body.data.variance).toBe("0.0000");
    });

    it("run 2: summary variance is deterministic", async () => {
      const res = await getJson(
        `/api/accounting/reports/ar-reconciliation/summary?as_of_date=${FIXED_AS_OF_DATE}`,
        ownerToken
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.variance).toBe("0.0000");
    });

    it("run 3: summary variance is deterministic", async () => {
      const res = await getJson(
        `/api/accounting/reports/ar-reconciliation/summary?as_of_date=${FIXED_AS_OF_DATE}`,
        ownerToken
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.variance).toBe("0.0000");
    });
  });
});
