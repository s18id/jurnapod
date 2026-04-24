// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { acquireReadLock, releaseReadLock } from "../../helpers/setup";
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
  createTestAPReconciliationSettings,
  createTestSupplierStatement,
  getOrCreateTestCashierForPermission,
  createTestRole,
  getTestAccessToken,
} from "../../fixtures";

// Deterministic code generator for constrained fields
function makeTag(prefix: string, counter: number): string {
  const worker = process.env.VITEST_POOL_ID ?? '0';
  return `${prefix}${worker}${String(counter).padStart(4, '0')}`.slice(0, 20);
}

let baseUrl: string;
let testCompanyId: number;
let testCompany2Id: number;
let ownerToken: string;
let cashierToken: string; // Low-privilege deny role
let analyzeOnlyToken: string; // ANALYZE-only role (should be denied POST)
let supplierId: number;
let supplier2Id: number;
let bankAccountId: number;
let apAccountId: number;
let ownerUserId: number;
let ssTagCounter = 0;

describe("purchasing.supplier-statements", { timeout: 60000 }, () => {
  const postJson = async (path: string, token: string, body?: unknown) => {
    return fetch(`${baseUrl}${path}`, {
      method: "POST",
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

  // Helper: Create and post a purchase invoice
  const createAndPostInvoice = async (
    invoiceNo: string,
    invoiceDate: string,
    amount: string,
    supplierIdToUse: number,
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
        supplier_id: supplierIdToUse,
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

  const createExchangeRate = async (
    currencyCode: string,
    effectiveDate: string,
    rate: string
  ): Promise<void> => {
    const res = await postJson("/api/purchasing/exchange-rates", ownerToken, {
      company_id: testCompanyId,
      currency_code: currencyCode,
      rate,
      effective_date: effectiveDate,
      notes: `Rate ${currencyCode} ${effectiveDate}`,
    });
    expect([201, 409]).toContain(res.status);
  };

  beforeAll(async () => {
    await acquireReadLock();
    baseUrl = getTestBaseUrl();

    // Get seed token for role creation (custom test role created via API)
    const seedToken = await getTestAccessToken(baseUrl);

    // Create custom test role for ACL tests (avoids mutating canonical OWNER role)
    const testRole = await createTestRole(baseUrl, seedToken, "SS Owner");
    const testRoleId = testRole.id;

    // Company 1 setup
    const company = await createTestCompanyMinimal();
    testCompanyId = company.id;

    const ownerEmail = `ss-owner-${++ssTagCounter}@example.com`;
    const ownerUser = await createTestUser(testCompanyId, {
      email: ownerEmail,
      name: "Supplier Statement Owner",
      password: "TestPassword123!",
    });
    ownerUserId = ownerUser.id;

    // Assign user to custom test role
    await assignUserGlobalRole(ownerUser.id, testRoleId);

    // Set up permissions on custom test role: purchasing.suppliers + full CRUDAM
    // Note: role was created in seed company, but we apply perms to testCompanyId
    await setModulePermission(testCompanyId, testRoleId, "purchasing", "suppliers", 63);
    // Also need accounts and other perms for invoice creation
    await setModulePermission(testCompanyId, testRoleId, "accounting", "accounts", 63);
    await setModulePermission(testCompanyId, testRoleId, "purchasing", "invoices", 63);
    await setModulePermission(testCompanyId, testRoleId, "purchasing", "payments", 63);
    await setModulePermission(testCompanyId, testRoleId, "purchasing", "exchange_rates", 63);

    // Create purchasing accounts and get the AP account ID
    const { ap_account_id } = await createTestPurchasingAccounts(testCompanyId);
    apAccountId = ap_account_id;
    bankAccountId = await createTestBankAccount(testCompanyId, { typeName: "BANK", isActive: true });

    const supplier = await createTestSupplier(testCompanyId, {
      code: makeTag('SSSUP', ++ssTagCounter),
      name: "Supplier Statement Supplier",
      currency: "IDR",
      paymentTermsDays: 30,
    });
    supplierId = supplier.id;

    const supplier2 = await createTestSupplier(testCompanyId, {
      code: makeTag('SSSUP2', ++ssTagCounter),
      name: "Supplier 2 for Statements",
      currency: "IDR",
      paymentTermsDays: 30,
    });
    supplier2Id = supplier2.id;

    ownerToken = await loginForTest(baseUrl, company.code, ownerEmail, "TestPassword123!");

    // Create cashier user (low-privilege deny role) for ACL tests
    const cashier = await getOrCreateTestCashierForPermission(testCompanyId, company.code, baseUrl);
    cashierToken = cashier.accessToken;

    // Create ANALYZE-only role user (mask=16 = ANALYZE, no CREATE)
    const analyzeOnlyRole = await createTestRole(baseUrl, seedToken, "SS Analyze Only");
    const analyzeOnlyRoleId = analyzeOnlyRole.id;
    const analyzeOnlyEmail = `ss-analyze-${++ssTagCounter}@example.com`;
    const analyzeOnlyUser = await createTestUser(testCompanyId, {
      email: analyzeOnlyEmail,
      name: "Supplier Statement Analyze Only",
      password: "TestPassword123!",
    });
    await assignUserGlobalRole(analyzeOnlyUser.id, analyzeOnlyRoleId);
    // purchasing.suppliers + ANALYZE only (mask 16 = READ(1) + ANALYZE(16) = 17, but we want just ANALYZE)
    // Actually: READ=1, CREATE=2, UPDATE=4, DELETE=8, ANALYZE=16, MANAGE=32
    // To get only ANALYZE=16 (no READ), we need mask=16
    await setModulePermission(testCompanyId, analyzeOnlyRoleId, "purchasing", "suppliers", 16);
    analyzeOnlyToken = await loginForTest(baseUrl, company.code, analyzeOnlyEmail, "TestPassword123!");

    // Company 2 setup (for cross-tenant tests)
    const company2 = await createTestCompanyMinimal({
      code: makeTag('SSC2', ++ssTagCounter).slice(0, 15),
    });
    testCompany2Id = company2.id;
  });

  afterAll(async () => {
    try {
      const db = getTestDb();

      // @fixture-teardown-allowed rationale="cleanup only"
      // Clean up supplier statements first
      await sql`DELETE FROM supplier_statements WHERE company_id = ${testCompanyId}`.execute(db);

      // @fixture-teardown-allowed rationale="cleanup only"
      // Clean up AP payment applications
      await sql`
        DELETE pca
        FROM purchase_credit_applications pca
        INNER JOIN purchase_credits pc ON pc.id = pca.purchase_credit_id
        WHERE pc.company_id = ${testCompanyId}
      `.execute(db);

      // @fixture-teardown-allowed rationale="cleanup only"
      // Clean up purchase credit lines and headers
      await sql`
        DELETE pcl
        FROM purchase_credit_lines pcl
        INNER JOIN purchase_credits pc ON pc.id = pcl.purchase_credit_id
        WHERE pc.company_id = ${testCompanyId}
      `.execute(db);
      // @fixture-teardown-allowed rationale="cleanup only"
      await sql`DELETE FROM purchase_credits WHERE company_id = ${testCompanyId}`.execute(db);

      // @fixture-teardown-allowed rationale="cleanup only"
      // Clean up AP payment lines and headers
      await sql`
        DELETE apl
        FROM ap_payment_lines apl
        INNER JOIN ap_payments ap ON ap.id = apl.ap_payment_id
        WHERE ap.company_id = ${testCompanyId}
      `.execute(db);
      // @fixture-teardown-allowed rationale="cleanup only"
      await sql`DELETE FROM ap_payments WHERE company_id = ${testCompanyId}`.execute(db);

      // @fixture-teardown-allowed rationale="cleanup only"
      // Clean up journal entries
      await sql`DELETE FROM journal_lines WHERE company_id = ${testCompanyId}`.execute(db);
      // @fixture-teardown-allowed rationale="cleanup only"
      await sql`DELETE FROM journal_batches WHERE company_id = ${testCompanyId}`.execute(db);

      // @fixture-teardown-allowed rationale="cleanup only"
      // Clean up purchase invoices
      await sql`DELETE FROM purchase_invoice_lines WHERE company_id = ${testCompanyId}`.execute(db);
      // @fixture-teardown-allowed rationale="cleanup only"
      await sql`DELETE FROM purchase_invoices WHERE company_id = ${testCompanyId}`.execute(db);

      // @fixture-teardown-allowed rationale="cleanup only"
      // Clean up company 2 accounts
      await sql`DELETE FROM accounts WHERE company_id = ${testCompany2Id}`.execute(db);
      // @fixture-teardown-allowed rationale="cleanup only"
      await sql`DELETE FROM companies WHERE id = ${testCompany2Id}`.execute(db);
    } catch {
      // ignore cleanup errors
    }

    resetFixtureRegistry();
    await closeTestDb();
    await releaseReadLock();
  });

  // =============================================================================
  // POST /api/purchasing/supplier-statements Tests
  // =============================================================================

  describe("POST /api/purchasing/supplier-statements", () => {
    it("returns 401 when no token provided", async () => {
      const res = await postJson("/api/purchasing/supplier-statements", "", {
        supplier_id: supplierId,
        statement_date: "2026-04-15",
        closing_balance: "1000.00",
        currency_code: "IDR",
      });
      expect(res.status).toBe(401);
    });

    it("returns 403 when CASHIER attempts to create statement", async () => {
      const res = await postJson("/api/purchasing/supplier-statements", cashierToken, {
        supplier_id: supplierId,
        statement_date: "2026-04-15",
        closing_balance: "1000.00",
        currency_code: "IDR",
      });
      expect(res.status).toBe(403);
    });

    it("returns 403 when ANALYZE-only role attempts to create statement", async () => {
      // ANALYZE-only (mask=16) should be denied POST create
      const res = await postJson("/api/purchasing/supplier-statements", analyzeOnlyToken, {
        supplier_id: supplierId,
        statement_date: "2026-04-29",
        closing_balance: "500.0000",
        currency_code: "IDR",
      });
      expect(res.status).toBe(403);
    });

    it("accepts negative closing_balance", async () => {
      const res = await postJson("/api/purchasing/supplier-statements", ownerToken, {
        supplier_id: supplierId,
        statement_date: "2026-04-30",
        closing_balance: "-500.0000",
        currency_code: "IDR",
      });
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.closing_balance).toBe("-500.0000");
    });

    it("creates a supplier statement successfully", async () => {
      const res = await postJson("/api/purchasing/supplier-statements", ownerToken, {
        supplier_id: supplierId,
        statement_date: "2026-04-15",
        closing_balance: "1000.0000",
        currency_code: "IDR",
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.supplier_id).toBe(supplierId);
      expect(body.data.statement_date).toBe("2026-04-15");
      expect(body.data.closing_balance).toBe("1000.0000");
      expect(body.data.currency_code).toBe("IDR");
      expect(body.data.status).toBe("PENDING");
    });

    it("rejects duplicate statement for same supplier+date", async () => {
      const res = await postJson("/api/purchasing/supplier-statements", ownerToken, {
        supplier_id: supplierId,
        statement_date: "2026-04-15",
        closing_balance: "2000.00",
        currency_code: "IDR",
      });

      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.error.code).toBe("SUPPLIER_STATEMENT_DUPLICATE");
    });

    it("rejects statement for supplier not owned by company", async () => {
      // Create supplier in company 2
      const company2 = await createTestCompanyMinimal({ code: makeTag('SSC2DUP', ++ssTagCounter).slice(0, 15) });
      const supplier2Company = await createTestSupplier(company2.id, {
        code: makeTag('SSC2SUP', ++ssTagCounter),
        name: "Company 2 Supplier",
        currency: "IDR",
      });

      const res = await postJson("/api/purchasing/supplier-statements", ownerToken, {
        supplier_id: supplier2Company.id,
        statement_date: "2026-04-20",
        closing_balance: "500.00",
        currency_code: "IDR",
      });

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error.code).toBe("SUPPLIER_STATEMENT_SUPPLIER_NOT_OWNED");
    });

    it("creates statement for different supplier same date", async () => {
      const res = await postJson("/api/purchasing/supplier-statements", ownerToken, {
        supplier_id: supplier2Id,
        statement_date: "2026-04-15",
        closing_balance: "500.0000",
        currency_code: "IDR",
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.data.supplier_id).toBe(supplier2Id);
    });

    it("rejects invalid date format", async () => {
      const res = await postJson("/api/purchasing/supplier-statements", ownerToken, {
        supplier_id: supplierId,
        statement_date: "04-15-2026",
        closing_balance: "1000.00",
        currency_code: "IDR",
      });

      expect(res.status).toBe(400);
    });

    it("rejects unsupported statement currency when exchange rate is missing", async () => {
      const res = await postJson("/api/purchasing/supplier-statements", ownerToken, {
        supplier_id: supplierId,
        statement_date: "2026-04-15",
        closing_balance: "1000.00",
        currency_code: "ZZZ",
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe("SUPPLIER_STATEMENT_EXCHANGE_RATE_MISSING");
    });

    it("rejects statement currency that does not match supplier currency", async () => {
      await createExchangeRate("USD", "2026-04-01", "2.00000000");

      const res = await postJson("/api/purchasing/supplier-statements", ownerToken, {
        supplier_id: supplierId, // default fixture supplier is IDR
        statement_date: "2026-04-15",
        closing_balance: "1000.00",
        currency_code: "USD",
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe("SUPPLIER_STATEMENT_CURRENCY_MISMATCH");
    });
  });

  // =============================================================================
  // GET /api/purchasing/supplier-statements Tests
  // =============================================================================

  describe("GET /api/purchasing/supplier-statements", () => {
    it("returns 401 when no token provided", async () => {
      const res = await getJson("/api/purchasing/supplier-statements");
      expect(res.status).toBe(401);
    });

    it("returns 403 when CASHIER attempts to list statements", async () => {
      const res = await getJson("/api/purchasing/supplier-statements", cashierToken);
      expect(res.status).toBe(403);
    });

    it("lists all statements for company", async () => {
      const res = await getJson("/api/purchasing/supplier-statements", ownerToken);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.statements).toBeDefined();
      expect(body.data.total).toBeGreaterThan(0);
    });

    it("filters by supplier_id", async () => {
      const res = await getJson(`/api/purchasing/supplier-statements?supplier_id=${supplierId}`, ownerToken);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      for (const stmt of body.data.statements) {
        expect(stmt.supplier_id).toBe(supplierId);
      }
    });

    it("filters by date range", async () => {
      const res = await getJson("/api/purchasing/supplier-statements?date_from=2026-04-01&date_to=2026-04-30", ownerToken);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
    });

    it("filters by status", async () => {
      const res = await getJson("/api/purchasing/supplier-statements?status=PENDING", ownerToken);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      for (const stmt of body.data.statements) {
        expect(stmt.status).toBe("PENDING");
      }
    });

    it("enforces tenant isolation - cannot see company 2 statements", async () => {
      // Create statement in company 2
      const company2 = await createTestCompanyMinimal({ code: makeTag('SSC2LIST', ++ssTagCounter).slice(0, 15) });
      const c2Supplier = await createTestSupplier(company2.id, {
        code: makeTag('SSC2SUPL', ++ssTagCounter),
        name: "Company 2 Supplier for List",
        currency: "IDR",
      });

      // Create statement directly in DB for company 2
      await createTestSupplierStatement(company2.id, c2Supplier.id, {
        statementDate: "2026-04-10",
        closingBalance: "9999.0000",
        currencyCode: "IDR",
      });

      // List from company 1 - should not see company 2 statement
      const res = await getJson("/api/purchasing/supplier-statements", ownerToken);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      // All returned statements should belong to company 1
      for (const stmt of body.data.statements) {
        expect(stmt.company_id).toBe(testCompanyId);
      }
    });
  });

  // =============================================================================
  // GET /api/purchasing/supplier-statements/:id/reconcile Tests
  // =============================================================================

  describe("GET /api/purchasing/supplier-statements/:id/reconcile", () => {
    it("returns 401 when no token provided", async () => {
      const res = await getJson("/api/purchasing/supplier-statements/999/reconcile");
      expect(res.status).toBe(401);
    });

    it("returns 403 when CASHIER attempts to reconcile", async () => {
      // First create a statement we can try to reconcile
      const createRes = await postJson("/api/purchasing/supplier-statements", ownerToken, {
        supplier_id: supplierId,
        statement_date: "2026-04-18",
        closing_balance: "500.0000",
        currency_code: "IDR",
      });
      expect(createRes.status).toBe(201);
      const createBody = await createRes.json();
      const statementId = createBody.data.id;

      const res = await getJson(`/api/purchasing/supplier-statements/${statementId}/reconcile`, cashierToken);
      expect(res.status).toBe(403);
    });

    it("computes reconciliation with zero variance when balances match", async () => {
      // Create a statement with a specific closing balance matching expected AP
      const statementDate = "2026-04-19";
      const amount = "500.0000";

      // Create and post an invoice
      await createAndPostInvoice(
        makeTag('SSINV', ++ssTagCounter),
        statementDate,
        amount,
        supplierId
      );

      // Create statement matching the invoice amount
      const createRes = await postJson("/api/purchasing/supplier-statements", ownerToken, {
        supplier_id: supplierId,
        statement_date: statementDate,
        closing_balance: amount,
        currency_code: "IDR",
      });
      expect(createRes.status).toBe(201);
      const createBody = await createRes.json();
      const statementId = createBody.data.id;

      // Reconcile - variance should be within tolerance (possibly zero)
      const res = await getJson(`/api/purchasing/supplier-statements/${statementId}/reconcile`, ownerToken);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.statement_id).toBe(statementId);
      expect(body.data.supplier_id).toBe(supplierId);
      expect(body.data.statement_balance).toBe("500.0000");
      expect(body.data.variance).toBeDefined();
      expect(body.data.currency_code).toBe("IDR");
    });

    it("returns 404 for non-existent statement", async () => {
      const res = await getJson("/api/purchasing/supplier-statements/999999/reconcile", ownerToken);
      expect(res.status).toBe(404);
    });

    it("returns 403 when statement belongs to another company", async () => {
      // Create statement in company 2
      const company2 = await createTestCompanyMinimal({ code: makeTag('SSC2REC', ++ssTagCounter).slice(0, 15) });
      const c2Supplier = await createTestSupplier(company2.id, {
        code: makeTag('SSC2SUPR', ++ssTagCounter),
        name: "Company 2 Supplier for Reconcile",
        currency: "IDR",
      });

      const c2Statement = await createTestSupplierStatement(company2.id, c2Supplier.id, {
        statementDate: "2026-04-25",
        closingBalance: "1000.0000",
        currencyCode: "IDR",
      });
      const c2StatementId = c2Statement.id;

      // Try to reconcile from company 1
      const res = await getJson(`/api/purchasing/supplier-statements/${c2StatementId}/reconcile`, ownerToken);
      expect(res.status).toBe(404); // Not found due to company scoping
    });

    it("respects custom tolerance parameter", async () => {
      // Create statement with known balance
      const statementDate = "2026-04-20";

      // Create and post an invoice with specific amount
      await createAndPostInvoice(
        makeTag('SSINVTOL', ++ssTagCounter),
        statementDate,
        "100.0000",
        supplierId
      );

      // Create statement with intentionally different balance
      const createRes = await postJson("/api/purchasing/supplier-statements", ownerToken, {
        supplier_id: supplierId,
        statement_date: statementDate,
        closing_balance: "150.0000", // 50 variance
        currency_code: "IDR",
      });
      expect(createRes.status).toBe(201);
      const createBody = await createRes.json();
      const statementId = createBody.data.id;

      // Reconcile with small tolerance - should show variance not within tolerance
      const res = await getJson(`/api/purchasing/supplier-statements/${statementId}/reconcile?tolerance=10.0000`, ownerToken);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.variance_within_tolerance).toBe(false);
      expect(body.data.tolerance).toBe("10.0000");
    });

    it("reconciles correctly when statement currency differs from base currency", async () => {
      const statementDate = "2026-04-26";

      const fxSupplier = await createTestSupplier(testCompanyId, {
        code: makeTag('SUPFX', ++ssTagCounter),
        name: "FX Supplier",
        currency: "USD",
        paymentTermsDays: 30,
      });

      // USD->IDR rate: 2.00000000 (example test rate)
      await createExchangeRate("USD", "2026-04-01", "2.00000000");

      // Invoice in USD 100, PI posting uses rate 2 => base 200
      await createAndPostInvoice(
        makeTag('SSINVF', ++ssTagCounter),
        statementDate,
        "100.0000",
        fxSupplier.id,
        "USD",
        "2.00000000"
      );

      // Statement in USD should reconcile to 100.0000 after conversion from base
      const createRes = await postJson("/api/purchasing/supplier-statements", ownerToken, {
        supplier_id: fxSupplier.id,
        statement_date: statementDate,
        closing_balance: "100.0000",
        currency_code: "USD",
      });
      expect(createRes.status).toBe(201);
      const createBody = await createRes.json();
      const statementId = createBody.data.id;

      const res = await getJson(`/api/purchasing/supplier-statements/${statementId}/reconcile`, ownerToken);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.currency_code).toBe("USD");
      expect(body.data.statement_balance).toBe("100.0000");
      expect(body.data.subledger_balance).toBe("100.0000");
      expect(body.data.variance).toBe("0.0000");
      expect(body.data.variance_within_tolerance).toBe(true);
    });

    it("rejects non-positive tolerance", async () => {
      const statementDate = "2026-04-27";

      const createRes = await postJson("/api/purchasing/supplier-statements", ownerToken, {
        supplier_id: supplierId,
        statement_date: statementDate,
        closing_balance: "100.0000",
        currency_code: "IDR",
      });
      expect(createRes.status).toBe(201);
      const createBody = await createRes.json();
      const statementId = createBody.data.id;

      const res = await getJson(
        `/api/purchasing/supplier-statements/${statementId}/reconcile?tolerance=0.0000`,
        ownerToken
      );

      expect(res.status).toBe(400);
    });
  });

  // =============================================================================
  // PUT /api/purchasing/supplier-statements/:id/reconcile Tests
  // =============================================================================

  describe("PUT /api/purchasing/supplier-statements/:id/reconcile", () => {
    it("returns 401 when no token provided", async () => {
      const res = await putJson("/api/purchasing/supplier-statements/999/reconcile", "");
      expect(res.status).toBe(401);
    });

    // Guards UPDATE permission boundary: reconcile mutates statement status
    it("returns 403 when CASHIER attempts to reconcile", async () => {
      const createRes = await postJson("/api/purchasing/supplier-statements", ownerToken, {
        supplier_id: supplierId,
        statement_date: "2026-04-29",
        closing_balance: "300.0000",
        currency_code: "IDR",
      });
      expect(createRes.status).toBe(201);
      const createBody = await createRes.json();
      const statementId = createBody.data.id;

      const res = await putJson(`/api/purchasing/supplier-statements/${statementId}/reconcile`, cashierToken);
      expect(res.status).toBe(403);
    });

    it("marks statement as reconciled successfully", async () => {
      // Create a fresh statement
      const createRes = await postJson("/api/purchasing/supplier-statements", ownerToken, {
        supplier_id: supplierId,
        statement_date: "2026-04-21",
        closing_balance: "750.0000",
        currency_code: "IDR",
      });
      expect(createRes.status).toBe(201);
      const createBody = await createRes.json();
      const statementId = createBody.data.id;

      // Mark as reconciled
      const res = await putJson(`/api/purchasing/supplier-statements/${statementId}/reconcile`, ownerToken);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.status).toBe("RECONCILED");
      expect(body.data.reconciled_at).toBeDefined();
      expect(body.data.reconciled_by_user_id).toBe(ownerUserId);
    });

    it("returns 409 when statement already reconciled", async () => {
      // Create and reconcile a statement
      const createRes = await postJson("/api/purchasing/supplier-statements", ownerToken, {
        supplier_id: supplierId,
        statement_date: "2026-04-22",
        closing_balance: "800.0000",
        currency_code: "IDR",
      });
      expect(createRes.status).toBe(201);
      const createBody = await createRes.json();
      const statementId = createBody.data.id;

      // First reconciliation
      const firstRes = await putJson(`/api/purchasing/supplier-statements/${statementId}/reconcile`, ownerToken);
      expect(firstRes.status).toBe(200);

      // Second reconciliation should fail
      const secondRes = await putJson(`/api/purchasing/supplier-statements/${statementId}/reconcile`, ownerToken);
      expect(secondRes.status).toBe(409);
      const body = await secondRes.json();
      expect(body.error.code).toBe("SUPPLIER_STATEMENT_ALREADY_RECONCILED");
    });

    it("returns 404 for non-existent statement", async () => {
      const res = await putJson("/api/purchasing/supplier-statements/999999/reconcile", ownerToken);
      expect(res.status).toBe(404);
    });

    it("returns 403 when statement belongs to another company", async () => {
      // Create statement in company 2
      const company2 = await createTestCompanyMinimal({ code: makeTag('SSC2PUT', ++ssTagCounter).slice(0, 15) });
      const c2Supplier = await createTestSupplier(company2.id, {
        code: makeTag('SSC2SMPP', ++ssTagCounter),
        name: "Company 2 Supplier for Put",
        currency: "IDR",
      });

      const c2Statement = await createTestSupplierStatement(company2.id, c2Supplier.id, {
        statementDate: "2026-04-28",
        closingBalance: "1000.0000",
        currencyCode: "IDR",
      });
      const c2StatementId = c2Statement.id;

      // Try to reconcile from company 1
      const res = await putJson(`/api/purchasing/supplier-statements/${c2StatementId}/reconcile`, ownerToken);
      expect(res.status).toBe(404); // Not found due to company scoping
    });
  });

  // =============================================================================
  // Variance Tolerance Behavior Tests
  // =============================================================================

  describe("Variance tolerance behavior", () => {
    it("flags variance within tolerance as acceptable", async () => {
      const statementDate = "2026-04-23";

      const toleranceSupplier = await createTestSupplier(testCompanyId, {
        code: makeTag('SUPTOL', ++ssTagCounter),
        name: "Tolerance Supplier A",
        currency: "IDR",
        paymentTermsDays: 30,
      });

      // Create an invoice
      await createAndPostInvoice(
        makeTag('SSINvacc', ++ssTagCounter),
        statementDate,
        "1000.0000",
        toleranceSupplier.id
      );

      // Create statement with small variance (within default 1.00 tolerance)
      const createRes = await postJson("/api/purchasing/supplier-statements", ownerToken, {
        supplier_id: toleranceSupplier.id,
        statement_date: statementDate,
        closing_balance: "1000.5000", // 0.50 variance - within tolerance
        currency_code: "IDR",
      });
      expect(createRes.status).toBe(201);
      const createBody = await createRes.json();
      const statementId = createBody.data.id;

      // Reconcile - should show within tolerance
      const res = await getJson(`/api/purchasing/supplier-statements/${statementId}/reconcile`, ownerToken);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.variance_within_tolerance).toBe(true);
    });

    it("flags variance outside tolerance as unacceptable", async () => {
      const statementDate = "2026-04-24";

      const toleranceSupplier = await createTestSupplier(testCompanyId, {
        code: makeTag('SUPTOL', ++ssTagCounter),
        name: "Tolerance Supplier B",
        currency: "IDR",
        paymentTermsDays: 30,
      });

      // Create an invoice
      await createAndPostInvoice(
        makeTag('SSINVUNACC', ++ssTagCounter),
        statementDate,
        "1000.0000",
        toleranceSupplier.id
      );

      // Create statement with large variance (outside 100.00 tolerance)
      const createRes = await postJson("/api/purchasing/supplier-statements", ownerToken, {
        supplier_id: toleranceSupplier.id,
        statement_date: statementDate,
        closing_balance: "1200.0000", // 200.00 variance - outside tolerance
        currency_code: "IDR",
      });
      expect(createRes.status).toBe(201);
      const createBody = await createRes.json();
      const statementId = createBody.data.id;

      // Reconcile with default tolerance - should show NOT within tolerance
      const res = await getJson(`/api/purchasing/supplier-statements/${statementId}/reconcile`, ownerToken);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.variance_within_tolerance).toBe(false);
    });
  });
});
