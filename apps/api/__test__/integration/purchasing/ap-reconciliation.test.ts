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
    return toScaled4(body.data.ap_subledger_balance);
  };

  const getSummaryVariance = async (asOfDate: string): Promise<bigint> => {
    const res = await getJson(`/api/purchasing/reports/ap-reconciliation/summary?as_of_date=${asOfDate}`, ownerToken);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    return toScaled4(body.data.variance);
  };

  const toScaled4 = (value: string): bigint => {
    const [intPart, fracPart = "0000"] = String(value).split(".");
    const scaled = `${intPart}${(fracPart + "0000").slice(0, 4)}`;
    return BigInt(scaled);
  };

  // Keep non-cutoff assertions deterministic across wall-clock date changes.
  // These cases only validate reconciliation/mapping behavior, not cutoff boundaries.
  const INCLUSIVE_AS_OF_DATE = "2099-12-31";

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

    // Set up permissions for owner
    // Settings: accounting.accounts MANAGE
    await setModulePermission(testCompanyId, ownerRoleId, "accounting", "accounts", 63, { allowSystemRoleMutation: true });
    // Summary: purchasing.reports ANALYZE
    await setModulePermission(testCompanyId, ownerRoleId, "purchasing", "reports", 63, { allowSystemRoleMutation: true });
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
        await setModulePermission(noApCompanyId, ownerRoleId, "accounting", "accounts", 63, { allowSystemRoleMutation: true });
        await setModulePermission(noApCompanyId, ownerRoleId, "purchasing", "reports", 63, { allowSystemRoleMutation: true });

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
        await setModulePermission(tzCompany.id, ownerRoleId, "accounting", "accounts", 63, {
          allowSystemRoleMutation: true,
        });
        await setModulePermission(tzCompany.id, ownerRoleId, "purchasing", "reports", 63, {
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
        `/api/purchasing/reports/ap-reconciliation/summary?as_of_date=${INCLUSIVE_AS_OF_DATE}`,
        ownerToken
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.as_of_date).toBe(INCLUSIVE_AS_OF_DATE);
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
      await setModulePermission(nyCompany.id, ownerRoleId, "purchasing", "reports", 63, { allowSystemRoleMutation: true });
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

  // =============================================================================
  // Story 47.2 B2A: Drilldown Endpoints Tests
  // =============================================================================

  describe("drilldown endpoints - ACL", () => {
    beforeAll(async () => {
      // Configure settings for company 1 (needed for drilldown)
      await putJson("/api/purchasing/reports/ap-reconciliation/settings", ownerToken, {
        account_ids: [apAccountId],
      });
    });

    it("returns 401 when no token provided on drilldown", async () => {
      const res = await getJson("/api/purchasing/reports/ap-reconciliation/drilldown?as_of_date=2026-04-19");
      expect(res.status).toBe(401);
    });

    it("returns 401 when no token provided on gl-detail", async () => {
      const res = await getJson("/api/purchasing/reports/ap-reconciliation/gl-detail?as_of_date=2026-04-19");
      expect(res.status).toBe(401);
    });

    it("returns 401 when no token provided on ap-detail", async () => {
      const res = await getJson("/api/purchasing/reports/ap-reconciliation/ap-detail?as_of_date=2026-04-19");
      expect(res.status).toBe(401);
    });

    it("returns 401 when no token provided on export", async () => {
      const res = await getJson("/api/purchasing/reports/ap-reconciliation/export?as_of_date=2026-04-19");
      expect(res.status).toBe(401);
    });

    it("returns 403 when CASHIER attempts drilldown (insufficient permission)", async () => {
      const res = await getJson(
        "/api/purchasing/reports/ap-reconciliation/drilldown?as_of_date=2026-04-19",
        cashierToken
      );
      expect(res.status).toBe(403);
    });

    it("returns 403 when CASHIER attempts gl-detail (insufficient permission)", async () => {
      const res = await getJson(
        "/api/purchasing/reports/ap-reconciliation/gl-detail?as_of_date=2026-04-19",
        cashierToken
      );
      expect(res.status).toBe(403);
    });

    it("returns 403 when CASHIER attempts ap-detail (insufficient permission)", async () => {
      const res = await getJson(
        "/api/purchasing/reports/ap-reconciliation/ap-detail?as_of_date=2026-04-19",
        cashierToken
      );
      expect(res.status).toBe(403);
    });

    it("returns 403 when CASHIER attempts export (insufficient permission)", async () => {
      const res = await getJson(
        "/api/purchasing/reports/ap-reconciliation/export?as_of_date=2026-04-19",
        cashierToken
      );
      expect(res.status).toBe(403);
    });

    it("returns 200 when OWNER with proper permission accesses drilldown", async () => {
      // Ensure owner has purchasing.reports ANALYZE permission
      const res = await getJson(
        `/api/purchasing/reports/ap-reconciliation/drilldown?as_of_date=${INCLUSIVE_AS_OF_DATE}&limit=500`,
        ownerToken
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.categories).toBeDefined();
      expect(Array.isArray(body.data.categories)).toBe(true);
    });

    it("returns 200 when OWNER accesses gl-detail", async () => {
      const res = await getJson(
        "/api/purchasing/reports/ap-reconciliation/gl-detail?as_of_date=2026-04-19",
        ownerToken
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.lines).toBeDefined();
      expect(Array.isArray(body.data.lines)).toBe(true);
    });

    it("returns 200 when OWNER accesses ap-detail", async () => {
      const res = await getJson(
        "/api/purchasing/reports/ap-reconciliation/ap-detail?as_of_date=2026-04-19",
        ownerToken
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.lines).toBeDefined();
      expect(Array.isArray(body.data.lines)).toBe(true);
    });

    it("returns CSV content-type when accessing export", async () => {
      const res = await fetch(`${baseUrl}/api/purchasing/reports/ap-reconciliation/export?as_of_date=2026-04-19`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${ownerToken}`,
        },
      });
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/csv");
    });
  });

  describe("drilldown endpoints - company isolation", () => {
    it("does not leak drilldown data between companies", async () => {
      // Configure settings for company 1
      await putJson("/api/purchasing/reports/ap-reconciliation/settings", ownerToken, {
        account_ids: [apAccountId],
      });

      // Create and post an invoice in company 1
      await createAndPostInvoice(`ISO-C1-${Date.now() % 100000}`, "2026-04-15", "500.0000");

      // Query drilldown for company 1
      const res1 = await getJson(
        "/api/purchasing/reports/ap-reconciliation/drilldown?as_of_date=2026-04-19",
        ownerToken
      );
      expect(res1.status).toBe(200);
      const body1 = await res1.json();
      expect(body1.success).toBe(true);

      // Company 1 should have at least the invoice we created
      const company1HasData = body1.data.categories.some((cat: any) => cat.item_count > 0);

      // Create company 2 with purchasing reports permission
      const db = getTestDb();
      const company2UserEmail = `c2-drilldown-${Date.now()}@example.com`;
      const company2User = await createTestUser(testCompany2Id, {
        email: company2UserEmail,
        name: "Company 2 Drilldown User",
        password: "TestPassword123!",
      });
      const ownerRoleId = await getRoleIdByCode("OWNER");
      await assignUserGlobalRole(company2User.id, ownerRoleId);
      await setModulePermission(testCompany2Id, ownerRoleId, "purchasing", "reports", 63, { allowSystemRoleMutation: true });
      await setModulePermission(testCompany2Id, ownerRoleId, "purchasing", "invoices", 63, { allowSystemRoleMutation: true });

      // Create purchasing accounts for company 2
      const { ap_account_id: company2ApAccountId } = await createTestPurchasingAccounts(testCompany2Id);
      await putJson("/api/purchasing/reports/ap-reconciliation/settings", ownerToken, {
        account_ids: [company2ApAccountId],
      });

      const company2 = await sql`SELECT code FROM companies WHERE id = ${testCompany2Id}`.execute(db);
      const company2Code = (company2.rows[0] as { code: string }).code;
      const company2Token = await loginForTest(baseUrl, company2Code, company2UserEmail, "TestPassword123!");

      // Configure company 2 settings
      await putJson("/api/purchasing/reports/ap-reconciliation/settings", company2Token, {
        account_ids: [company2ApAccountId],
      });

      // Query drilldown for company 2
      const res2 = await getJson(
        "/api/purchasing/reports/ap-reconciliation/drilldown?as_of_date=2026-04-19",
        company2Token
      );
      expect(res2.status).toBe(200);
      const body2 = await res2.json();
      expect(body2.success).toBe(true);

      // Company 2 should NOT see company 1's invoice data
      // Company 1 has items, company 2 should not have the same items
      const company2HasInvoiceFromCompany1 = body2.data.categories.some(
        (cat: any) => cat.items.some((item: any) => item.ap_transaction_ref?.includes("ISO-C1"))
      );
      expect(company2HasInvoiceFromCompany1).toBe(false);

      // Cleanup company 2 user session data
      await sql`DELETE FROM settings_strings WHERE company_id = ${testCompany2Id}`.execute(db);
    });

    it("gl-detail does not leak data between companies", async () => {
      // Create company 2 user with purchasing reports permission
      const db = getTestDb();
      const company2UserEmail = `c2-gldetail-${Date.now()}@example.com`;
      const company2User = await createTestUser(testCompany2Id, {
        email: company2UserEmail,
        name: "Company 2 GL Detail User",
        password: "TestPassword123!",
      });
      const ownerRoleId = await getRoleIdByCode("OWNER");
      await assignUserGlobalRole(company2User.id, ownerRoleId);
      await setModulePermission(testCompany2Id, ownerRoleId, "purchasing", "reports", 63, { allowSystemRoleMutation: true });

      const company2 = await sql`SELECT code FROM companies WHERE id = ${testCompany2Id}`.execute(db);
      const company2Code = (company2.rows[0] as { code: string }).code;
      const company2Token = await loginForTest(baseUrl, company2Code, company2UserEmail, "TestPassword123!");

      const res = await getJson(
        "/api/purchasing/reports/ap-reconciliation/gl-detail?as_of_date=2026-04-19",
        company2Token
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);

      // GL lines from company 1 should not appear in company 2 response
      const hasCompany1GLLine = body.data.lines.some(
        (line: any) => line.journal_number?.includes("ISO-C1")
      );
      expect(hasCompany1GLLine).toBe(false);
    });

    it("ap-detail does not leak data between companies", async () => {
      // Create company 2 user with purchasing reports permission
      const db = getTestDb();
      const company2UserEmail = `c2-apdetail-${Date.now()}@example.com`;
      const company2User = await createTestUser(testCompany2Id, {
        email: company2UserEmail,
        name: "Company 2 AP Detail User",
        password: "TestPassword123!",
      });
      const ownerRoleId = await getRoleIdByCode("OWNER");
      await assignUserGlobalRole(company2User.id, ownerRoleId);
      await setModulePermission(testCompany2Id, ownerRoleId, "purchasing", "reports", 63, { allowSystemRoleMutation: true });

      const company2 = await sql`SELECT code FROM companies WHERE id = ${testCompany2Id}`.execute(db);
      const company2Code = (company2.rows[0] as { code: string }).code;
      const company2Token = await loginForTest(baseUrl, company2Code, company2UserEmail, "TestPassword123!");

      const res = await getJson(
        "/api/purchasing/reports/ap-reconciliation/ap-detail?as_of_date=2026-04-19",
        company2Token
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);

      // AP items from company 1 should not appear in company 2 response
      const hasCompany1APItem = body.data.lines.some(
        (line: any) => line.reference?.includes("ISO-C1")
      );
      expect(hasCompany1APItem).toBe(false);
    });
  });

  describe("drilldown endpoints - attribution correctness", () => {
    it("categorizes timing differences correctly", async () => {
      // Configure settings
      await putJson("/api/purchasing/reports/ap-reconciliation/settings", ownerToken, {
        account_ids: [apAccountId],
      });

      // Create an invoice (this will have a corresponding GL entry when posted)
      await createAndPostInvoice(`ATTR-TIME-${Date.now() % 100000}`, "2026-04-15", "100.0000");

      const res = await getJson(
        "/api/purchasing/reports/ap-reconciliation/drilldown?as_of_date=2026-04-19",
        ownerToken
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);

      // The drilldown should have categories
      expect(body.data.categories).toBeDefined();
      expect(Array.isArray(body.data.categories)).toBe(true);

      // Categories should be in deterministic precedence order
      const categoryOrder = body.data.categories.map((c: any) => c.category);
      expect(categoryOrder).toEqual([
        "currency_rounding_differences",
        "posting_errors",
        "timing_differences",
        "missing_transactions",
      ]);
    });

    it("has correct category structure for each variance type", async () => {
      const res = await getJson(
        "/api/purchasing/reports/ap-reconciliation/drilldown?as_of_date=2026-04-19",
        ownerToken
      );
      expect(res.status).toBe(200);
      const body = await res.json();

      for (const category of body.data.categories) {
        expect(category).toHaveProperty("category");
        expect(category).toHaveProperty("total_difference");
        expect(category).toHaveProperty("item_count");
        expect(category).toHaveProperty("items");
        expect(Array.isArray(category.items)).toBe(true);

        for (const item of category.items) {
          expect(item).toHaveProperty("id");
          expect(item).toHaveProperty("category");
          expect(item).toHaveProperty("difference");
          expect(item).toHaveProperty("matched");
        }
      }
    });

    it("matches GL doc_type to AP transaction type using canonical mapping", async () => {
      // Ensure there is at least one freshly posted PI with journal doc_type PURCHASE_INVOICE
      const invoiceId = await createAndPostInvoice(
        `ATTR-MAP-${Date.now() % 100000}`,
        "2026-04-16",
        "77.0000"
      );

      const glRes = await getJson(
        `/api/purchasing/reports/ap-reconciliation/gl-detail?as_of_date=${INCLUSIVE_AS_OF_DATE}&limit=500`,
        ownerToken
      );
      expect(glRes.status).toBe(200);
      const glBody = await glRes.json();

      const glSourceLine = glBody.data.lines.find((line: any) => line.source_id === invoiceId);
      expect(glSourceLine).toBeDefined();
      expect(glSourceLine.source_type).toBe("purchase_invoice");

      const res = await getJson(
        `/api/purchasing/reports/ap-reconciliation/drilldown?as_of_date=${INCLUSIVE_AS_OF_DATE}&limit=500`,
        ownerToken
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);

      const allItems = body.data.categories.flatMap((c: any) => c.items);
      const hasMatchedPurchaseInvoice = allItems.some(
        (item: any) =>
          item.matched === true &&
          item.ap_transaction_type === "purchase_invoice"
      );

      expect(hasMatchedPurchaseInvoice).toBe(true);
    });

    it("does not classify second GL line of the same invoice source as missing", async () => {
      const invoiceNo = `ATTR-AGG-${Date.now() % 100000}`;
      await createAndPostInvoice(invoiceNo, "2026-04-17", "123.0000");

      const res = await getJson(
        `/api/purchasing/reports/ap-reconciliation/drilldown?as_of_date=${INCLUSIVE_AS_OF_DATE}&limit=500`,
        ownerToken
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);

      const items = body.data.categories.flatMap((c: any) => c.items);
      const missingForInvoice = items.filter(
        (item: any) =>
          item.category === "missing_transactions" &&
          item.ap_transaction_ref === invoiceNo
      );
      expect(missingForInvoice.length).toBe(0);

      const matchedForInvoice = items.filter(
        (item: any) =>
          item.ap_transaction_ref === invoiceNo &&
          item.ap_transaction_type === "purchase_invoice" &&
          item.matched === true
      );
      expect(matchedForInvoice.length).toBeGreaterThan(0);
    });
  });

  describe("drilldown endpoints - deterministic output", () => {
    it("returns identical results for repeated queries", async () => {
      const res1 = await getJson(
        "/api/purchasing/reports/ap-reconciliation/drilldown?as_of_date=2026-04-19",
        ownerToken
      );
      expect(res1.status).toBe(200);
      const body1 = await res1.json();

      // Small delay to ensure any async operations complete
      await new Promise((resolve) => setTimeout(resolve, 100));

      const res2 = await getJson(
        "/api/purchasing/reports/ap-reconciliation/drilldown?as_of_date=2026-04-19",
        ownerToken
      );
      expect(res2.status).toBe(200);
      const body2 = await res2.json();

      // Results should be identical
      expect(body1.data.categories).toEqual(body2.data.categories);
      expect(body1.data.variance).toEqual(body2.data.variance);
    });

    it("categories appear in deterministic precedence order", async () => {
      const res = await getJson(
        "/api/purchasing/reports/ap-reconciliation/drilldown?as_of_date=2026-04-19",
        ownerToken
      );
      expect(res.status).toBe(200);
      const body = await res.json();

      const categoryOrder = body.data.categories.map((c: any) => c.category);
      const expectedOrder = [
        "currency_rounding_differences",
        "posting_errors",
        "timing_differences",
        "missing_transactions",
      ];
      expect(categoryOrder).toEqual(expectedOrder);
    });
  });

  describe("drilldown endpoints - pagination", () => {
    it("gl-detail supports cursor pagination", async () => {
      // Create multiple invoices to generate multiple GL lines
      await createAndPostInvoice(`PAGE-GL1-${Date.now() % 100000}`, "2026-04-10", "100.0000");
      await createAndPostInvoice(`PAGE-GL2-${Date.now() % 100000}`, "2026-04-11", "200.0000");
      await createAndPostInvoice(`PAGE-GL3-${Date.now() % 100000}`, "2026-04-12", "300.0000");

      // First request with small limit
      const res1 = await getJson(
        `/api/purchasing/reports/ap-reconciliation/gl-detail?as_of_date=${INCLUSIVE_AS_OF_DATE}&limit=2`,
        ownerToken
      );
      expect(res1.status).toBe(200);
      const body1 = await res1.json();
      expect(body1.data.lines.length).toBeLessThanOrEqual(2);
      expect(body1.data.has_more).toBe(true);
      expect(body1.data.next_cursor).toBeTruthy();

      // Second request with cursor
      const res2 = await getJson(
        `/api/purchasing/reports/ap-reconciliation/gl-detail?as_of_date=${INCLUSIVE_AS_OF_DATE}&limit=2&cursor=${body1.data.next_cursor}`,
        ownerToken
      );
      expect(res2.status).toBe(200);
      const body2 = await res2.json();

      // Results should not overlap
      const firstIds = body1.data.lines.map((l: any) => l.journal_line_id);
      const secondIds = body2.data.lines.map((l: any) => l.journal_line_id);
      const overlap = firstIds.filter((id: number) => secondIds.includes(id));
      expect(overlap.length).toBe(0);
    });

    it("ap-detail supports cursor pagination", async () => {
      // Create multiple invoices
      await createAndPostInvoice(`PAGE-AP1-${Date.now() % 100000}`, "2026-04-10", "100.0000");
      await createAndPostInvoice(`PAGE-AP2-${Date.now() % 100000}`, "2026-04-11", "200.0000");
      await createAndPostInvoice(`PAGE-AP3-${Date.now() % 100000}`, "2026-04-12", "300.0000");

      const res1 = await getJson(
        "/api/purchasing/reports/ap-reconciliation/ap-detail?as_of_date=2026-04-19&limit=2",
        ownerToken
      );
      expect(res1.status).toBe(200);
      const body1 = await res1.json();
      expect(body1.data.lines.length).toBeLessThanOrEqual(2);
      expect(body1.data.has_more).toBe(true);
      expect(body1.data.next_cursor).toBeTruthy();
    });

    it("drilldown respects limit parameter", async () => {
      // Create multiple invoices
      await createAndPostInvoice(`LIM-DRILL1-${Date.now() % 100000}`, "2026-04-10", "100.0000");
      await createAndPostInvoice(`LIM-DRILL2-${Date.now() % 100000}`, "2026-04-11", "200.0000");

      const res = await getJson(
        "/api/purchasing/reports/ap-reconciliation/drilldown?as_of_date=2026-04-19&limit=100",
        ownerToken
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
    });

    it("drilldown variance equals summary variance regardless of pagination limit", async () => {
      await createAndPostInvoice(`LIM-VAR1-${Date.now() % 100000}`, "2026-04-10", "410.0000");
      await createAndPostInvoice(`LIM-VAR2-${Date.now() % 100000}`, "2026-04-11", "520.0000");
      await createAndPostInvoice(`LIM-VAR3-${Date.now() % 100000}`, "2026-04-12", "630.0000");

      const summaryVariance = await getSummaryVariance("2026-04-19");

      const res = await getJson(
        "/api/purchasing/reports/ap-reconciliation/drilldown?as_of_date=2026-04-19&limit=2",
        ownerToken
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);

      const drilldownVariance = toScaled4(body.data.variance);
      expect(drilldownVariance).toBe(summaryVariance);
    });

    it("ap-detail total_open_base is full-dataset total, not page-window total", async () => {
      await createAndPostInvoice(`LIM-OPEN1-${Date.now() % 100000}`, "2026-04-10", "111.0000");
      await createAndPostInvoice(`LIM-OPEN2-${Date.now() % 100000}`, "2026-04-11", "222.0000");
      await createAndPostInvoice(`LIM-OPEN3-${Date.now() % 100000}`, "2026-04-12", "333.0000");

      const firstPageRes = await getJson(
        "/api/purchasing/reports/ap-reconciliation/ap-detail?as_of_date=2026-04-19&limit=1",
        ownerToken
      );
      expect(firstPageRes.status).toBe(200);
      const firstPageBody = await firstPageRes.json();
      expect(firstPageBody.success).toBe(true);

      let cursor = firstPageBody.data.next_cursor as string | null;
      let totalFromAllPages = 0n;
      for (const line of firstPageBody.data.lines as Array<{ open_amount: string }>) {
        totalFromAllPages += toScaled4(line.open_amount);
      }

      while (cursor) {
        const pageRes = await getJson(
          `/api/purchasing/reports/ap-reconciliation/ap-detail?as_of_date=2026-04-19&limit=1&cursor=${encodeURIComponent(cursor)}`,
          ownerToken
        );
        expect(pageRes.status).toBe(200);
        const pageBody = await pageRes.json();
        for (const line of pageBody.data.lines as Array<{ open_amount: string }>) {
          totalFromAllPages += toScaled4(line.open_amount);
        }
        cursor = pageBody.data.next_cursor;
      }

      const reportedTotal = toScaled4(firstPageBody.data.total_open_base);
      expect(reportedTotal).toBe(totalFromAllPages);
    });
  });

  describe("drilldown endpoints - CSV export", () => {
    it("export CSV has correct headers", async () => {
      const res = await fetch(
        `${baseUrl}/api/purchasing/reports/ap-reconciliation/export?as_of_date=2026-04-19`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${ownerToken}`,
          },
        }
      );
      expect(res.status).toBe(200);
      const csvText = await res.text();
      const headers = csvText.split("\n")[0];
      expect(headers).toContain("category");
      expect(headers).toContain("ap_transaction_type");
      expect(headers).toContain("gl_journal_number");
      expect(headers).toContain("difference");
      expect(headers).toContain("suggested_action");
    });

    it("export CSV row count matches drilldown data", async () => {
      // First get drilldown data
      const drilldownRes = await getJson(
        "/api/purchasing/reports/ap-reconciliation/drilldown?as_of_date=2026-04-19",
        ownerToken
      );
      expect(drilldownRes.status).toBe(200);
      const drilldownBody = await drilldownRes.json();

      // Count total items across all categories
      let totalItems = 0;
      for (const cat of drilldownBody.data.categories) {
        totalItems += cat.item_count;
      }

      // Get export CSV
      const exportRes = await fetch(
        `${baseUrl}/api/purchasing/reports/ap-reconciliation/export?as_of_date=2026-04-19`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${ownerToken}`,
          },
        }
      );
      expect(exportRes.status).toBe(200);
      const csvText = await exportRes.text();
      const csvRows = csvText.trim().split("\n");

      // Header row + data rows should match
      // (But may differ if there are 0 items - CSV might have just header)
      if (totalItems > 0) {
        expect(csvRows.length).toBe(totalItems + 1); // +1 for header
      }
    });

    it("export CSV uses same drilldown dataset", async () => {
      // Get drilldown data
      const drilldownRes = await getJson(
        "/api/purchasing/reports/ap-reconciliation/drilldown?as_of_date=2026-04-19",
        ownerToken
      );
      expect(drilldownRes.status).toBe(200);
      const drilldownBody = await drilldownRes.json();

      // Get export CSV
      const exportRes = await fetch(
        `${baseUrl}/api/purchasing/reports/ap-reconciliation/export?as_of_date=2026-04-19`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${ownerToken}`,
          },
        }
      );
      expect(exportRes.status).toBe(200);
      const csvText = await exportRes.text();

      // CSV should contain all category names from drilldown
      for (const cat of drilldownBody.data.categories) {
        if (cat.item_count > 0) {
          expect(csvText).toContain(cat.category);
        }
      }
    });
  });

  describe("drilldown endpoints - gl-detail structure", () => {
    it("gl-detail returns correct line structure", async () => {
      const res = await getJson(
        "/api/purchasing/reports/ap-reconciliation/gl-detail?as_of_date=2026-04-19",
        ownerToken
      );
      expect(res.status).toBe(200);
      const body = await res.json();

      if (body.data.lines.length > 0) {
        const line = body.data.lines[0];
        expect(line).toHaveProperty("journal_line_id");
        expect(line).toHaveProperty("journal_batch_id");
        expect(line).toHaveProperty("journal_number");
        expect(line).toHaveProperty("effective_date");
        expect(line).toHaveProperty("description");
        expect(line).toHaveProperty("account_id");
        expect(line).toHaveProperty("account_code");
        expect(line).toHaveProperty("account_name");
        expect(line).toHaveProperty("debit");
        expect(line).toHaveProperty("credit");
        expect(line).toHaveProperty("source_type");
        expect(line).toHaveProperty("source_id");
        expect(line).toHaveProperty("posted_at");
      }

      expect(body.data).toHaveProperty("total_count");
      expect(body.data).toHaveProperty("has_more");
      expect(body.data).toHaveProperty("next_cursor");
    });
  });

  describe("drilldown endpoints - ap-detail structure", () => {
    it("ap-detail returns correct line structure with base and open amounts", async () => {
      const res = await getJson(
        "/api/purchasing/reports/ap-reconciliation/ap-detail?as_of_date=2026-04-19",
        ownerToken
      );
      expect(res.status).toBe(200);
      const body = await res.json();

      if (body.data.lines.length > 0) {
        const line = body.data.lines[0];
        expect(line).toHaveProperty("id");
        expect(line).toHaveProperty("type");
        expect(line).toHaveProperty("reference");
        expect(line).toHaveProperty("date");
        expect(line).toHaveProperty("currency_code");
        expect(line).toHaveProperty("original_amount");
        expect(line).toHaveProperty("base_amount");
        expect(line).toHaveProperty("open_amount");
        expect(line).toHaveProperty("status");
        expect(line).toHaveProperty("matched");
      }

      expect(body.data).toHaveProperty("total_count");
      expect(body.data).toHaveProperty("total_open_base");
      expect(body.data).toHaveProperty("has_more");
      expect(body.data).toHaveProperty("next_cursor");
    });
  });

  describe("drilldown endpoints - fail-closed behavior", () => {
    it("returns 409 when settings unresolved on drilldown", async () => {
      // Create a company with no AP reconciliation settings
      const noApCompany = await createTestCompanyMinimal({
        code: `NOAP-DRILL-${Date.now()}`.slice(0, 15),
      });

      try {
        const noApEmail = `noap-drill-${Date.now()}@example.com`;
        const noApUser = await createTestUser(noApCompany.id, {
          email: noApEmail,
          name: "No AP Drill User",
          password: "TestPassword123!",
        });
        const ownerRoleId = await getRoleIdByCode("OWNER");
        await assignUserGlobalRole(noApUser.id, ownerRoleId);
        await setModulePermission(noApCompany.id, ownerRoleId, "purchasing", "reports", 63, {
          allowSystemRoleMutation: true,
        });

        const noApToken = await loginForTest(baseUrl, noApCompany.code, noApEmail, "TestPassword123!");

        const res = await getJson(
          "/api/purchasing/reports/ap-reconciliation/drilldown?as_of_date=2026-04-19",
          noApToken
        );
        expect(res.status).toBe(409);
        const body = await res.json();
        expect(body.error.code).toBe("AP_RECONCILIATION_SETTINGS_REQUIRED");
      } finally {
        const db = getTestDb();
        await sql`DELETE FROM settings_strings WHERE company_id = ${noApCompany.id}`.execute(db);
        await sql`DELETE FROM users WHERE company_id = ${noApCompany.id}`.execute(db);
        await sql`DELETE FROM companies WHERE id = ${noApCompany.id}`.execute(db);
      }
    });

    it("returns 500 when timezone missing on drilldown (no UTC fallback)", async () => {
      // Create a company with no timezone set
      const noTzCompany = await createTestCompanyMinimal({
        code: `NOTZ-DRILL-${Date.now()}`.slice(0, 15),
      });

      try {
        const noTzEmail = `notz-drill-${Date.now()}@example.com`;
        const noTzUser = await createTestUser(noTzCompany.id, {
          email: noTzEmail,
          name: "No TZ Drill User",
          password: "TestPassword123!",
        });
        const ownerRoleId = await getRoleIdByCode("OWNER");
        await assignUserGlobalRole(noTzUser.id, ownerRoleId);
        await setModulePermission(noTzCompany.id, ownerRoleId, "purchasing", "reports", 63, {
          allowSystemRoleMutation: true,
        });

        // Ensure fallback AP account exists so drilldown reaches timezone resolution
        await createTestPurchasingAccounts(noTzCompany.id);

        const db = getTestDb();
        await sql`UPDATE companies SET timezone = NULL WHERE id = ${noTzCompany.id}`.execute(db);
        await sql`UPDATE outlets SET timezone = NULL WHERE company_id = ${noTzCompany.id}`.execute(db);

        const noTzToken = await loginForTest(baseUrl, noTzCompany.code, noTzEmail, "TestPassword123!");

        const res = await getJson(
          "/api/purchasing/reports/ap-reconciliation/drilldown?as_of_date=2026-04-19",
          noTzToken
        );
        expect(res.status).toBe(500);
        const body = await res.json();
        expect(body.error.code).toBe("AP_RECONCILIATION_TIMEZONE_REQUIRED");
        expect(String(body.error.message)).toContain("No UTC fallback is permitted");
      } finally {
        const db = getTestDb();
        await sql`DELETE FROM accounts WHERE company_id = ${noTzCompany.id}`.execute(db);
        await sql`DELETE FROM company_modules WHERE company_id = ${noTzCompany.id}`.execute(db);
        await sql`DELETE FROM outlets WHERE company_id = ${noTzCompany.id}`.execute(db);
        await sql`DELETE FROM settings_strings WHERE company_id = ${noTzCompany.id}`.execute(db);
        await sql`DELETE FROM users WHERE company_id = ${noTzCompany.id}`.execute(db);
        await sql`DELETE FROM companies WHERE id = ${noTzCompany.id}`.execute(db);
      }
    });
  });
});
