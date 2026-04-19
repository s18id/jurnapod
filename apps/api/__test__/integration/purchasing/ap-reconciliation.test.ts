// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { sql } from "kysely";
import { getTestBaseUrl } from "../../helpers/env";
import { closeTestDb, getTestDb } from "../../helpers/db";
import {
  resetFixtureRegistry,
  createTestCompanyMinimal,
  createTestUser,
  getRoleIdByCode,
  assignUserGlobalRole,
  setModulePermission,
  loginForTest,
  createTestSupplier,
  createTestPurchasingAccounts,
  createTestBankAccount,
  getOrCreateTestCashierForPermission,
} from "../../fixtures";

let baseUrl: string;
let testCompanyId: number;
let testCompany2Id: number;
let ownerToken: string;
let cashierToken: string;
let supplierId: number;
let bankAccountId: number;
let apAccountId: number;

describe("purchasing.ap-reconciliation", { timeout: 40000 }, () => {
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

  const createAndPostInvoice = async (
    invoiceNo: string,
    invoiceDate: string,
    amount: string,
    currencyCode: string = "IDR",
    exchangeRate: string = "1.00000000"
  ): Promise<number> => {
    const createRes = await fetch(`${baseUrl}/api/purchasing/invoices`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        supplier_id: supplierId,
        invoice_no: invoiceNo,
        invoice_date: invoiceDate,
        currency_code: currencyCode,
        exchange_rate: exchangeRate,
        notes: `PI ${invoiceNo}`,
        lines: [{ description: `Line ${invoiceNo}`, qty: "1", unit_price: amount, line_type: "SERVICE" }],
      }),
    });

    expect(createRes.status).toBe(201);
    const createBody = await createRes.json();
    const invoiceId = Number(createBody.data.id);

    const postRes = await fetch(`${baseUrl}/api/purchasing/invoices/${invoiceId}/post`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        "Content-Type": "application/json",
      },
    });
    expect(postRes.status).toBe(200);

    return invoiceId;
  };

  const getSummaryBalance = async (asOfDate: string): Promise<bigint> => {
    const res = await getJson(`/api/purchasing/reports/ap-reconciliation/summary?as_of_date=${asOfDate}`, ownerToken);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    const [intPart, fracPart = "0000"] = String(body.data.ap_subledger_balance).split(".");
    const scaled = `${intPart}${(fracPart + "0000").slice(0, 4)}`;
    return BigInt(scaled);
  };

  beforeAll(async () => {
    baseUrl = getTestBaseUrl();

    // Company 1 setup
    const company = await createTestCompanyMinimal();
    testCompanyId = company.id;

    const ownerEmail = `ap-rec-owner-${Date.now()}@example.com`;
    const ownerUser = await createTestUser(testCompanyId, {
      email: ownerEmail,
      name: "AP Recon Owner",
      password: "TestPassword123!",
    });

    const ownerRoleId = await getRoleIdByCode("OWNER");
    await assignUserGlobalRole(ownerUser.id, ownerRoleId);

    // Set up accounting.permissions for owner
    await setModulePermission(testCompanyId, ownerRoleId, "accounting", "accounts", 63, { allowSystemRoleMutation: true });
    await setModulePermission(testCompanyId, ownerRoleId, "accounting", "journals", 63, { allowSystemRoleMutation: true });
    await setModulePermission(testCompanyId, ownerRoleId, "purchasing", "invoices", 63, { allowSystemRoleMutation: true });
    await setModulePermission(testCompanyId, ownerRoleId, "purchasing", "payments", 63, { allowSystemRoleMutation: true });
    await setModulePermission(testCompanyId, ownerRoleId, "purchasing", "exchange_rates", 63, { allowSystemRoleMutation: true });

    // Create purchasing accounts and get the AP account ID
    const { ap_account_id } = await createTestPurchasingAccounts(testCompanyId);
    apAccountId = ap_account_id;
    bankAccountId = await createTestBankAccount(testCompanyId, { typeName: "BANK", isActive: true });

    const supplier = await createTestSupplier(testCompanyId, {
      code: `APR-SUP-${Date.now()}`.slice(0, 20),
      name: "AP Recon Supplier",
      currency: "IDR",
      paymentTermsDays: 30,
    });
    supplierId = supplier.id;

    ownerToken = await loginForTest(baseUrl, company.code, ownerEmail, "TestPassword123!");

    const cashier = await getOrCreateTestCashierForPermission(testCompanyId, company.code, baseUrl);
    cashierToken = cashier.accessToken;

    // Company 2 setup (for cross-tenant tests)
    const company2 = await createTestCompanyMinimal({
      code: `TEST-C2-${Date.now()}`.slice(0, 15),
    });
    testCompany2Id = company2.id;
  });

  afterAll(async () => {
    try {
      const db = getTestDb();

      // Clean up AP payment applications first
      await sql`
        DELETE pca
        FROM purchase_credit_applications pca
        INNER JOIN purchase_credits pc ON pc.id = pca.purchase_credit_id
        WHERE pc.company_id = ${testCompanyId}
      `.execute(db);

      // Clean up purchase credit lines and headers
      await sql`
        DELETE pcl
        FROM purchase_credit_lines pcl
        INNER JOIN purchase_credits pc ON pc.id = pcl.purchase_credit_id
        WHERE pc.company_id = ${testCompanyId}
      `.execute(db);
      await sql`DELETE FROM purchase_credits WHERE company_id = ${testCompanyId}`.execute(db);

      // Clean up AP payment lines and headers
      await sql`
        DELETE apl
        FROM ap_payment_lines apl
        INNER JOIN ap_payments ap ON ap.id = apl.ap_payment_id
        WHERE ap.company_id = ${testCompanyId}
      `.execute(db);
      await sql`DELETE FROM ap_payments WHERE company_id = ${testCompanyId}`.execute(db);

      // Clean up journal entries
      await sql`DELETE FROM journal_lines WHERE company_id = ${testCompanyId}`.execute(db);
      await sql`DELETE FROM journal_batches WHERE company_id = ${testCompanyId}`.execute(db);

      // Clean up purchase invoices
      await sql`DELETE FROM purchase_invoice_lines WHERE company_id = ${testCompanyId}`.execute(db);
      await sql`DELETE FROM purchase_invoices WHERE company_id = ${testCompanyId}`.execute(db);

      // Clean up settings
      await sql`DELETE FROM settings_strings WHERE company_id = ${testCompanyId}`.execute(db);

      // Clean up company 2 accounts
      await sql`DELETE FROM accounts WHERE company_id = ${testCompany2Id}`.execute(db);
      await sql`DELETE FROM companies WHERE id = ${testCompany2Id}`.execute(db);
    } catch {
      // ignore cleanup errors
    }

    resetFixtureRegistry();
    await closeTestDb();
  });

  // =============================================================================
  // PUT /purchasing/reports/ap-reconciliation/settings Tests
  // =============================================================================

  describe("PUT /settings", () => {
    it("returns 401 when no token provided", async () => {
      const res = await putJson("/api/purchasing/reports/ap-reconciliation/settings", "", {
        account_ids: [apAccountId],
      });
      expect(res.status).toBe(401);
    });

    it("returns 403 when CASHIER attempts to update settings", async () => {
      const res = await putJson("/api/purchasing/reports/ap-reconciliation/settings", cashierToken, {
        account_ids: [apAccountId],
      });
      expect(res.status).toBe(403);
    });

    it("rejects cross-tenant account on PUT", async () => {
      // Create AP account in company 2 using canonical fixture
      const company2Accounts = await createTestPurchasingAccounts(testCompany2Id);
      const res = await putJson("/api/purchasing/reports/ap-reconciliation/settings", ownerToken, {
        account_ids: [company2Accounts.ap_account_id],
      });
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error.code).toBe("AP_RECONCILIATION_CROSS_TENANT_ACCOUNT");
    });

    it("accepts valid AP control account IDs", async () => {
      const res = await putJson("/api/purchasing/reports/ap-reconciliation/settings", ownerToken, {
        account_ids: [apAccountId],
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.account_ids).toContain(apAccountId);
      expect(body.data.source).toBe("settings");
    });

    it("rejects duplicate account IDs", async () => {
      const res = await putJson("/api/purchasing/reports/ap-reconciliation/settings", ownerToken, {
        account_ids: [apAccountId, apAccountId],
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe("INVALID_REQUEST");
    });

    it("rejects more than 50 account IDs", async () => {
      const tooManyIds = Array.from({ length: 51 }, (_, i) => i + 10000);
      const res = await putJson("/api/purchasing/reports/ap-reconciliation/settings", ownerToken, {
        account_ids: tooManyIds,
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe("INVALID_REQUEST");
    });

    it("rejects empty account_ids array", async () => {
      const res = await putJson("/api/purchasing/reports/ap-reconciliation/settings", ownerToken, {
        account_ids: [],
      });
      expect(res.status).toBe(400);
    });
  });

  // =============================================================================
  // GET /purchasing/reports/ap-reconciliation/settings Tests
  // =============================================================================

  describe("GET /settings", () => {
    it("returns 401 when no token provided", async () => {
      const res = await getJson("/api/purchasing/reports/ap-reconciliation/settings");
      expect(res.status).toBe(401);
    });

    it("returns 403 when CASHIER attempts to read settings", async () => {
      const res = await getJson("/api/purchasing/reports/ap-reconciliation/settings", cashierToken);
      expect(res.status).toBe(403);
    });

    it("returns fallback source when no settings configured but company_modules has default", async () => {
      const db = getTestDb();
      await sql`
        DELETE FROM settings_strings
        WHERE company_id = ${testCompanyId}
          AND setting_key = 'ap_reconciliation_account_ids'
          AND outlet_id IS NULL
      `.execute(db);

      // Settings not configured, should fall back to company_modules.purchasing_default_ap_account_id
      const res = await getJson("/api/purchasing/reports/ap-reconciliation/settings", ownerToken);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      // Source should be fallback_company_default since we set up purchasing accounts
      expect(body.data.source).toBe("fallback_company_default");
      expect(body.data.account_ids).toContain(apAccountId);
    });
  });

  // =============================================================================
  // GET /purchasing/reports/ap-reconciliation/summary Tests
  // =============================================================================

  describe("GET /summary", () => {
    it("returns 401 when no token provided", async () => {
      const res = await getJson("/api/purchasing/reports/ap-reconciliation/summary?as_of_date=2026-04-19");
      expect(res.status).toBe(401);
    });

    it("returns 403 when CASHIER attempts to read summary", async () => {
      const res = await getJson(
        "/api/purchasing/reports/ap-reconciliation/summary?as_of_date=2026-04-19",
        cashierToken
      );
      expect(res.status).toBe(403);
    });

    it("returns 409 when settings unresolved (no settings and no company_modules fallback)", async () => {
      // Create a company with no purchasing defaults configured
      const noApCompany = await createTestCompanyMinimal({
        code: `NOAP-${Date.now()}`.slice(0, 15),
      });
      const noApCompanyId = noApCompany.id;

      try {
        const noApEmail = `noap-${Date.now()}@example.com`;
        const noApUser = await createTestUser(noApCompanyId, {
          email: noApEmail,
          name: "No AP User",
          password: "TestPassword123!",
        });
        const ownerRoleId = await getRoleIdByCode("OWNER");
        await assignUserGlobalRole(noApUser.id, ownerRoleId);
        await setModulePermission(noApCompanyId, ownerRoleId, "accounting", "journals", 63, { allowSystemRoleMutation: true });
        await setModulePermission(noApCompanyId, ownerRoleId, "accounting", "accounts", 63, { allowSystemRoleMutation: true });

        const noApToken = await loginForTest(baseUrl, noApCompany.code, noApEmail, "TestPassword123!");

        const res = await getJson(
          "/api/purchasing/reports/ap-reconciliation/summary?as_of_date=2026-04-19",
          noApToken
        );
        expect(res.status).toBe(409);
        const body = await res.json();
        expect(body.error.code).toBe("AP_RECONCILIATION_SETTINGS_REQUIRED");
      } finally {
        const db = getTestDb();
        await sql`DELETE FROM settings_strings WHERE company_id = ${noApCompanyId}`.execute(db);
        await sql`DELETE FROM users WHERE company_id = ${noApCompanyId}`.execute(db);
        await sql`DELETE FROM companies WHERE id = ${noApCompanyId}`.execute(db);
      }
    });

    it("fails closed when both outlet and company timezone are missing/invalid (no UTC fallback)", async () => {
      const tzCompany = await createTestCompanyMinimal({
        code: `NOTZ-${Date.now()}`.slice(0, 15),
      });

      try {
        const tzEmail = `notz-${Date.now()}@example.com`;
        const tzUser = await createTestUser(tzCompany.id, {
          email: tzEmail,
          name: "No TZ User",
          password: "TestPassword123!",
        });
        const ownerRoleId = await getRoleIdByCode("OWNER");
        await assignUserGlobalRole(tzUser.id, ownerRoleId);
        await setModulePermission(tzCompany.id, ownerRoleId, "accounting", "journals", 63, {
          allowSystemRoleMutation: true,
        });
        await setModulePermission(tzCompany.id, ownerRoleId, "accounting", "accounts", 63, {
          allowSystemRoleMutation: true,
        });

        // Ensure fallback AP account exists so summary reaches timezone resolution path.
        await createTestPurchasingAccounts(tzCompany.id);

        const db = getTestDb();
        await sql`UPDATE companies SET timezone = NULL WHERE id = ${tzCompany.id}`.execute(db);
        await sql`UPDATE outlets SET timezone = NULL WHERE company_id = ${tzCompany.id}`.execute(db);

        const tzToken = await loginForTest(baseUrl, tzCompany.code, tzEmail, "TestPassword123!");
        const res = await getJson(
          "/api/purchasing/reports/ap-reconciliation/summary?as_of_date=2026-04-19",
          tzToken
        );
        expect(res.status).toBe(500);
        const body = await res.json();
        expect(body.error.code).toBe("AP_RECONCILIATION_TIMEZONE_REQUIRED");
        expect(String(body.error.message)).toContain("No UTC fallback is permitted");
      } finally {
        const db = getTestDb();
        await sql`DELETE FROM accounts WHERE company_id = ${tzCompany.id}`.execute(db);
        await sql`DELETE FROM company_modules WHERE company_id = ${tzCompany.id}`.execute(db);
        await sql`DELETE FROM outlets WHERE company_id = ${tzCompany.id}`.execute(db);
        await sql`DELETE FROM settings_strings WHERE company_id = ${tzCompany.id}`.execute(db);
        await sql`DELETE FROM users WHERE company_id = ${tzCompany.id}`.execute(db);
        await sql`DELETE FROM companies WHERE id = ${tzCompany.id}`.execute(db);
      }
    });

    it("returns correct summary when settings are configured", async () => {
      // First configure the settings
      await putJson("/api/purchasing/reports/ap-reconciliation/settings", ownerToken, {
        account_ids: [apAccountId],
      });

      // Create and post an invoice
      const invoiceId = await createAndPostInvoice(
        `APR-INV-${Date.now() % 100000}`,
        "2026-04-15",
        "100.0000"
      );

      const res = await getJson(
        "/api/purchasing/reports/ap-reconciliation/summary?as_of_date=2026-04-19",
        ownerToken
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.as_of_date).toBe("2026-04-19");
      expect(body.data.configured_account_ids).toContain(apAccountId);
      expect(body.data.account_source).toBe("settings");
      expect(body.data.currency).toBe("BASE");

      // AP subledger should have the invoice amount (base = original * rate = 100 * 1 = 100)
      expect(body.data.ap_subledger_balance).toBe("100.0000");

      // GL control balance should match (journal should be posted)
      expect(body.data.gl_control_balance).toBe("100.0000");

      // Variance should be zero
      expect(body.data.variance).toBe("0.0000");
    });

    it("computes base = original * rate for USD invoice", async () => {
      // Configure settings
      await putJson("/api/purchasing/reports/ap-reconciliation/settings", ownerToken, {
        account_ids: [apAccountId],
      });

      const before = await getSummaryBalance("2026-04-19");

      const rateRes = await fetch(`${baseUrl}/api/purchasing/exchange-rates`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ownerToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          company_id: testCompanyId,
          currency_code: "USD",
          rate: "15000.00000000",
          effective_date: "2026-04-10",
        }),
      });
      expect(rateRes.status).toBe(201);

      // Create a USD invoice with exchange rate
      // original = 100 USD, rate = 15000 (IDR per USD)
      // base = 100 * 15000 = 1500000 (in IDR cents/smallest unit)
      // But the amounts are stored as decimal strings, so:
      // base amount = 100.0000 * 15000.00000000 = 1500000.00000000
      // In 4 decimal scale: 1500000.0000
      const invoiceId = await createAndPostInvoice(
        `APR-USD-${Date.now() % 100000}`,
        "2026-04-10",
        "100.0000",
        "USD",
        "15000.00000000"
      );

      const res = await getJson(
        "/api/purchasing/reports/ap-reconciliation/summary?as_of_date=2026-04-19",
        ownerToken
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);

      // Delta AP subledger balance must follow base = original * exchange_rate
      // 100.0000 * 15000.00000000 = 1,500,000.0000
      const after = await getSummaryBalance("2026-04-19");
      expect(after - before).toBe(15000000000n);
    });

    it("reduces AP by posted payments and applied credits", async () => {
      // Configure settings
      await putJson("/api/purchasing/reports/ap-reconciliation/settings", ownerToken, {
        account_ids: [apAccountId],
      });

      const before = await getSummaryBalance("2026-04-19");

      // Create and post an invoice for 100
      const invoiceId = await createAndPostInvoice(
        `APR-PAY-${Date.now() % 100000}`,
        "2026-04-01",
        "100.0000"
      );

      // Create and post a payment for 40
      const paymentCreateRes = await fetch(`${baseUrl}/api/purchasing/payments`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ownerToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          payment_date: "2026-04-15",
          bank_account_id: bankAccountId,
          supplier_id: supplierId,
          lines: [{ purchase_invoice_id: invoiceId, allocation_amount: "40.0000" }],
        }),
      });
      expect(paymentCreateRes.status).toBe(201);
      const paymentBody = await paymentCreateRes.json();
      const paymentId = Number(paymentBody.data.id);

      const paymentPostRes = await fetch(`${baseUrl}/api/purchasing/payments/${paymentId}/post`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ownerToken}`,
          "Content-Type": "application/json",
        },
      });
      expect(paymentPostRes.status).toBe(200);

      const after = await getSummaryBalance("2026-04-19");
      // Net delta = +100 invoice - 40 payment = +60
      expect(after - before).toBe(600000n);
    });

    it("respects as_of_date cutoff", async () => {
      // Configure settings
      await putJson("/api/purchasing/reports/ap-reconciliation/settings", ownerToken, {
        account_ids: [apAccountId],
      });

      const before = await getSummaryBalance("2026-04-19");

      // Create an invoice dated after as_of_date (2026-04-20)
      await createAndPostInvoice(
        `APR-FUTURE-${Date.now() % 100000}`,
        "2026-04-25",
        "100.0000"
      );

      // Query with as_of_date before the invoice
      const after = await getSummaryBalance("2026-04-19");
      // Invoice dated after as_of_date must not affect cutoff summary
      expect(after).toBe(before);
    });

    it("respects timezone-correct cutoff boundaries (Asia/Jakarta UTC+7)", async () => {
      // Configure settings
      await putJson("/api/purchasing/reports/ap-reconciliation/settings", ownerToken, {
        account_ids: [apAccountId],
      });

      const before = await getSummaryBalance("2026-04-19");

      // Asia/Jakarta is UTC+7. The business day "2026-04-19" in Jakarta runs from
      // 2026-04-19T00:00:00+07:00 to 2026-04-19T23:59:59.999+07:00,
      // which is 2026-04-18T17:00:00.000Z to 2026-04-19T16:59:59.999Z in UTC.
      //
      // An invoice posted at exactly 2026-04-19T00:00:00 UTC (= 2026-04-19T07:00:00 Jakarta)
      // is INSIDE the "2026-04-19" business day and must be included.
      // An invoice posted at 2026-04-18T23:00:00 UTC (= 2026-04-19T06:00:00 Jakarta)
      // is JUST BEFORE the business day starts and must be EXCLUDED.
      //
      // Create an invoice dated 2026-04-19 local time (invoice_date = "2026-04-19")
      const invoiceLocalDate = "2026-04-19";
      await createAndPostInvoice(
        `APR-TZ-${Date.now() % 100000}`,
        invoiceLocalDate,
        "50.0000"
      );

      // Create a second invoice dated 2026-04-18 local time (the day before)
      // which should be included for 2026-04-18 and later cutoffs.
      await createAndPostInvoice(
        `APR-TZ2-${Date.now() % 100000}`,
        "2026-04-18",
        "20.0000"
      );

      // As-of 2026-04-18 must include only the 20.0000 invoice.
      const asOf18 = await getSummaryBalance("2026-04-18");
      // As-of 2026-04-19 must include both invoices: +50.0000 incremental over 2026-04-18.
      const asOf19 = await getSummaryBalance("2026-04-19");

      expect(asOf19 - asOf18).toBe(500000n);
      // Relative to the pre-test baseline, 2026-04-19 picks up +70.0000 total.
      expect(asOf19 - before).toBe(700000n);
    });

    it("respects timezone-correct cutoff boundaries (UTC-5 America/New_York)", async () => {
      // Create a company with America/New_York timezone (UTC-5)
      // to verify that UTC boundary computation differs from a positive-offset timezone.
      // The default test company uses Asia/Jakarta (UTC+7); this uses UTC-5.
      const nyCompany = await createTestCompanyMinimal({
        code: `NY-CO-${Date.now()}`.slice(0, 15),
        timezone: "America/New_York",
      });

      const nyEmail = `ny-aprec-${Date.now()}@example.com`;
      const nyUser = await createTestUser(nyCompany.id, {
        email: nyEmail,
        name: "NY AP Recon User",
        password: "TestPassword123!",
      });
      const ownerRoleId = await getRoleIdByCode("OWNER");
      await assignUserGlobalRole(nyUser.id, ownerRoleId);
      await setModulePermission(nyCompany.id, ownerRoleId, "accounting", "accounts", 63, { allowSystemRoleMutation: true });
      await setModulePermission(nyCompany.id, ownerRoleId, "accounting", "journals", 63, { allowSystemRoleMutation: true });
      await setModulePermission(nyCompany.id, ownerRoleId, "purchasing", "invoices", 63, { allowSystemRoleMutation: true });

      // Create purchasing accounts for NY company
      const { ap_account_id: nyApAccountId } = await createTestPurchasingAccounts(nyCompany.id);

      const nySupplier = await createTestSupplier(nyCompany.id, {
        code: `NY-SUP-${Date.now()}`.slice(0, 20),
        name: "NY AP Recon Supplier",
        currency: "IDR",
        paymentTermsDays: 30,
      });

      const nyToken = await loginForTest(baseUrl, nyCompany.code, nyEmail, "TestPassword123!");

      // Configure AP reconciliation settings for NY company
      await putJson("/api/purchasing/reports/ap-reconciliation/settings", nyToken, {
        account_ids: [nyApAccountId],
      });

      // Create an invoice on 2026-04-19 local time (NY, UTC-5)
      // Business day 2026-04-19 in NY runs from 2026-04-19T00:00:00-05:00 to 2026-04-19T23:59:59.999-05:00
      // which is 2026-04-19T05:00:00.000Z to 2026-04-20T04:59:59.999Z in UTC.
      const invoiceId = await fetch(`${baseUrl}/api/purchasing/invoices`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${nyToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          supplier_id: nySupplier.id,
          invoice_no: `NY-INV-${Date.now() % 100000}`,
          invoice_date: "2026-04-19",
          currency_code: "IDR",
          exchange_rate: "1.00000000",
          notes: `NY PI`,
          lines: [{ description: "Line", qty: "1", unit_price: "75.0000", line_type: "SERVICE" }],
        }),
      });
      expect(invoiceId.status).toBe(201);
      const invoiceBody = await invoiceId.json();
      const postedInvoiceRes = await fetch(`${baseUrl}/api/purchasing/invoices/${invoiceBody.data.id}/post`, {
        method: "POST",
        headers: { Authorization: `Bearer ${nyToken}`, "Content-Type": "application/json" },
      });
      expect(postedInvoiceRes.status).toBe(200);

      // Query AP summary with as_of_date=2026-04-19 in NY timezone
      const res = await getJson(
        "/api/purchasing/reports/ap-reconciliation/summary?as_of_date=2026-04-19",
        nyToken
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      // The 75 USD invoice (invoice_date = 2026-04-19 local) must be included
      expect(body.data.ap_subledger_balance).toBe("75.0000");

      // Clean up NY company
      try {
        const db = getTestDb();
        await sql`DELETE FROM purchase_invoice_lines WHERE company_id = ${nyCompany.id}`.execute(db);
        await sql`DELETE FROM purchase_invoices WHERE company_id = ${nyCompany.id}`.execute(db);
        await sql`DELETE FROM journal_lines WHERE company_id = ${nyCompany.id}`.execute(db);
        await sql`DELETE FROM journal_batches WHERE company_id = ${nyCompany.id}`.execute(db);
        await sql`DELETE FROM settings_strings WHERE company_id = ${nyCompany.id}`.execute(db);
        await sql`DELETE FROM users WHERE company_id = ${nyCompany.id}`.execute(db);
        await sql`DELETE FROM companies WHERE id = ${nyCompany.id}`.execute(db);
      } catch { /* ignore */ }
    });
  });

  // =============================================================================
  // Company Isolation Tests
  // =============================================================================

  describe("company isolation", () => {
    it("does not leak company 1 settings to company 2", async () => {
      // Configure settings for company 1
      await putJson("/api/purchasing/reports/ap-reconciliation/settings", ownerToken, {
        account_ids: [apAccountId],
      });

      // Create company 2 user with same permissions
      const db = getTestDb();
      const runId = Date.now().toString(36) + Math.random().toString(36).substring(2, 6);

      const company2UserEmail = `c2-aprec-${Date.now()}@example.com`;
      const company2User = await createTestUser(testCompany2Id, {
        email: company2UserEmail,
        name: "Company 2 User",
        password: "TestPassword123!",
      });
      const ownerRoleId = await getRoleIdByCode("OWNER");
      await assignUserGlobalRole(company2User.id, ownerRoleId);
      await setModulePermission(testCompany2Id, ownerRoleId, "accounting", "accounts", 63, { allowSystemRoleMutation: true });
      await setModulePermission(testCompany2Id, ownerRoleId, "accounting", "journals", 63, { allowSystemRoleMutation: true });
      await setModulePermission(testCompany2Id, ownerRoleId, "purchasing", "invoices", 63, { allowSystemRoleMutation: true });

      const company2 = await sql`SELECT code FROM companies WHERE id = ${testCompany2Id}`.execute(db);
      const company2Code = (company2.rows[0] as { code: string }).code;
      const company2Token = await loginForTest(baseUrl, company2Code, company2UserEmail, "TestPassword123!");

      // Company 2 should not see company 1's settings
      const res = await getJson("/api/purchasing/reports/ap-reconciliation/settings", company2Token);
      expect(res.status).toBe(200);
      const body = await res.json();

      // Company 2 should resolve only its own fallback/settings, not company 1 values
      expect(["none", "fallback_company_default", "settings"]).toContain(body.data.source);
      expect(body.data.account_ids).not.toContain(apAccountId);
    });
  });
});
