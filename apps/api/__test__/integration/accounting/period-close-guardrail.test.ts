// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// FIX(47.5-WP-D): Real-DB strict integration tests for AP period-close guardrails.
// No mock DB per AGENTS.md database testing policy.
//
// Architecture:
//   - Company A (override_allowed): scenarios c, d, e (override/ACL/correction flow)
//   - Company B (strict, default): scenarios a, f (block path 409 + tenant isolation)
//
// RWLock pattern: each test file acquires a shared read lock so the HTTP server
// stays alive across tests, and releases it in afterAll.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getTestBaseUrl } from "../../helpers/env";
import { closeTestDb, getTestDb } from "../../helpers/db";
import { sql } from "kysely";
import {
  resetFixtureRegistry,
  createTestCompanyMinimal,
  createTestUser,
  createTestRole,
  getRoleIdByCode,
  assignUserGlobalRole,
  setModulePermission,
  loginForTest,
  createTestSupplier,
  createTestPurchasingAccounts,
  createTestBankAccount,
  createTestFiscalYear,
  createTestFiscalPeriod,
  setTestCompanyStringSetting,
  getTestAccessToken,
} from "../../fixtures";
import { acquireReadLock, releaseReadLock } from "../../helpers/setup";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const MANAGE = 32;
const CRUDAM = 63;
const READ = 1;

// ---------------------------------------------------------------------------
// Route helpers
// ---------------------------------------------------------------------------
const postJson = async (path: string, token: string, body?: unknown) => {
  const res = await fetch(`${getTestBaseUrl()}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res;
};

// ---------------------------------------------------------------------------
// Suite-level state
// ---------------------------------------------------------------------------
let baseUrl: string;

// Company A — override_allowed: override + ACL + correction flow tests
let companyA: { id: number; code: string };
let ownerTokenA: string;
let noManageTokenA: string;
let supplierIdA: number;
let bankAccountIdA: number;

// Company B — strict (default): block path + tenant isolation tests
let companyB: { id: number; code: string };
let ownerTokenB: string;
let supplierIdB: number;
let bankAccountIdB: number;

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------
describe("accounting.period-close-guardrail (Story 47.5)", { timeout: 60000 }, () => {

  beforeAll(async () => {
    await acquireReadLock();
    baseUrl = getTestBaseUrl();
    const seedToken = await getTestAccessToken(baseUrl);

    // ========================================================================
    // Company A — override_allowed mode (override path tests c, d, e)
    // ========================================================================
    companyA = await createTestCompanyMinimal({ code: `PCG-A-${Date.now()}`.slice(0, 18) });

    // ---- Owner user (custom role with MANAGE on accounting.fiscal_years) ----
    // Use a custom role rather than mutating the seeded OWNER role.
    const ownerCustomRole = await createTestRole(baseUrl, seedToken, "Owner Override Role");

    const ownerEmailA = `pcg-owner-a-${Date.now()}@example.com`;
    const ownerUserA = await createTestUser(companyA.id, {
      email: ownerEmailA,
      name: "PCG Owner A",
      password: "TestPassword123!",
    });
    await assignUserGlobalRole(ownerUserA.id, ownerCustomRole.id);

    await setModulePermission(companyA.id, ownerCustomRole.id, "purchasing", "invoices", CRUDAM);
    await setModulePermission(companyA.id, ownerCustomRole.id, "purchasing", "payments", CRUDAM);
    await setModulePermission(companyA.id, ownerCustomRole.id, "purchasing", "credits", CRUDAM);
    // MANAGE on fiscal_years enables the override path in override_allowed mode
    await setModulePermission(companyA.id, ownerCustomRole.id, "accounting", "fiscal_years", MANAGE);

    // ---- Custom role: READ only on accounting.fiscal_years (no MANAGE → 403) ----
    const noManageRole = await createTestRole(baseUrl, seedToken, "No Fiscal Years Manage");

    const noManageEmailA = `pcg-nomanage-a-${Date.now()}@example.com`;
    const noManageUserA = await createTestUser(companyA.id, {
      email: noManageEmailA,
      name: "PCG NoManage A",
      password: "TestPassword123!",
    });
    await assignUserGlobalRole(noManageUserA.id, noManageRole.id);

    await setModulePermission(companyA.id, noManageRole.id, "purchasing", "invoices", CRUDAM);
    await setModulePermission(companyA.id, noManageRole.id, "purchasing", "payments", CRUDAM);
    await setModulePermission(companyA.id, noManageRole.id, "purchasing", "credits", CRUDAM);
    // READ on fiscal_years but NOT MANAGE — override will be rejected 403
    await setModulePermission(companyA.id, noManageRole.id, "accounting", "fiscal_years", READ);

    // ---- Support entities for company A ----
    await createTestPurchasingAccounts(companyA.id);
    const supplierA = await createTestSupplier(companyA.id, {
      code: `PCG-SUP-A-${Date.now()}`.slice(0, 20),
      name: "PCG Supplier A",
      currency: "IDR",
    });
    supplierIdA = supplierA.id;
    bankAccountIdA = await createTestBankAccount(companyA.id, { typeName: "BANK", isActive: true });

    // ---- Fiscal years and periods for company A (canonical helpers) ----
    // CLOSED period: FY2025, Period 4 (Apr 1-30 2025) — date "2025-04-15" is blocked
    const fyClosedA = await createTestFiscalYear(companyA.id, {
      year: 2025,
      startDate: "2025-01-01",
      endDate: "2025-12-31",
      status: "CLOSED",
    });
    await createTestFiscalPeriod(fyClosedA.id, {
      periodNumber: 4,
      startDate: "2025-04-01",
      endDate: "2025-04-30",
      status: "CLOSED",
    });

    // OPEN period: FY2026, Period 4 (Apr 1-30 2026) — date "2026-04-15" is allowed
    const fyOpenA = await createTestFiscalYear(companyA.id, {
      year: 2026,
      startDate: "2026-01-01",
      endDate: "2026-12-31",
      status: "OPEN",
    });
    await createTestFiscalPeriod(fyOpenA.id, {
      periodNumber: 4,
      startDate: "2026-04-01",
      endDate: "2026-04-30",
      status: "OPEN",
    });

    // Set guardrail to "override_allowed" — enables MANAGE + valid reason override path
    // Without this, the guardrail defaults to "strict" and always blocks with 409.
    await setTestCompanyStringSetting(
      companyA.id,
      "accounting.ap_period_close_guardrail",
      "override_allowed"
    );

    // ---- Tokens ----
    ownerTokenA = await loginForTest(baseUrl, companyA.code, ownerEmailA, "TestPassword123!");
    noManageTokenA = await loginForTest(baseUrl, companyA.code, noManageEmailA, "TestPassword123!");

    // ========================================================================
    // Company B — strict mode (default): block path (a) + tenant isolation (f)
    // ========================================================================
    companyB = await createTestCompanyMinimal({ code: `PCG-B-${Date.now()}`.slice(0, 18) });

    // Custom role for company B (no MANAGE on fiscal_years — not needed in strict mode)
    const ownerCustomRoleB = await createTestRole(baseUrl, seedToken, "Owner Strict Role");

    const ownerEmailB = `pcg-owner-b-${Date.now()}@example.com`;
    const ownerUserB = await createTestUser(companyB.id, {
      email: ownerEmailB,
      name: "PCG Owner B",
      password: "TestPassword123!",
    });
    await assignUserGlobalRole(ownerUserB.id, ownerCustomRoleB.id);

    await setModulePermission(companyB.id, ownerCustomRoleB.id, "purchasing", "invoices", CRUDAM);
    await setModulePermission(companyB.id, ownerCustomRoleB.id, "purchasing", "payments", CRUDAM);
    await setModulePermission(companyB.id, ownerCustomRoleB.id, "purchasing", "credits", CRUDAM);

    await createTestPurchasingAccounts(companyB.id);
    const supplierB = await createTestSupplier(companyB.id, {
      code: `PCG-SUP-B-${Date.now()}`.slice(0, 20),
      name: "PCG Supplier B",
      currency: "IDR",
    });
    supplierIdB = supplierB.id;
    bankAccountIdB = await createTestBankAccount(companyB.id, { typeName: "BANK", isActive: true });

    // ---- Fiscal years and periods for company B ----
    // OPEN period: FY2025, Period 4 (Apr 1-30 2025) — date "2025-04-15" is allowed
    const fyOpenB = await createTestFiscalYear(companyB.id, {
      year: 2025,
      startDate: "2025-01-01",
      endDate: "2025-12-31",
      status: "OPEN",
    });
    await createTestFiscalPeriod(fyOpenB.id, {
      periodNumber: 4,
      startDate: "2025-04-01",
      endDate: "2025-04-30",
      status: "OPEN",
    });

    // CLOSED period: FY2025, Period 6 (Jun 1-30 2025) — date "2025-06-15" is blocked
    await createTestFiscalPeriod(fyOpenB.id, {
      periodNumber: 6,
      startDate: "2025-06-01",
      endDate: "2025-06-30",
      status: "CLOSED",
    });

    ownerTokenB = await loginForTest(baseUrl, companyB.code, ownerEmailB, "TestPassword123!");
  });

  afterAll(async () => {
    try {
      const db = getTestDb();
      // Teardown company A records (dependency order: child → parent FK)
      await sql`DELETE FROM period_close_overrides WHERE company_id = ${companyA.id}`.execute(db);
      await sql`DELETE FROM purchase_credit_lines WHERE company_id = ${companyA.id}`.execute(db);
      await sql`DELETE FROM purchase_credits WHERE company_id = ${companyA.id}`.execute(db);
      await sql`DELETE FROM ap_payment_lines WHERE company_id = ${companyA.id}`.execute(db);
      await sql`DELETE FROM ap_payments WHERE company_id = ${companyA.id}`.execute(db);
      await sql`DELETE FROM purchase_invoice_lines WHERE company_id = ${companyA.id}`.execute(db);
      await sql`DELETE FROM purchase_invoices WHERE company_id = ${companyA.id}`.execute(db);
      await sql`DELETE FROM journal_lines WHERE company_id = ${companyA.id}`.execute(db);
      await sql`DELETE FROM journal_batches WHERE company_id = ${companyA.id}`.execute(db);
      await sql`DELETE FROM fiscal_periods WHERE company_id = ${companyA.id}`.execute(db);
      await sql`DELETE FROM fiscal_years WHERE company_id = ${companyA.id}`.execute(db);
      // Teardown company B records
      await sql`DELETE FROM purchase_credit_lines WHERE company_id = ${companyB.id}`.execute(db);
      await sql`DELETE FROM purchase_credits WHERE company_id = ${companyB.id}`.execute(db);
      await sql`DELETE FROM ap_payment_lines WHERE company_id = ${companyB.id}`.execute(db);
      await sql`DELETE FROM ap_payments WHERE company_id = ${companyB.id}`.execute(db);
      await sql`DELETE FROM purchase_invoice_lines WHERE company_id = ${companyB.id}`.execute(db);
      await sql`DELETE FROM purchase_invoices WHERE company_id = ${companyB.id}`.execute(db);
      await sql`DELETE FROM journal_lines WHERE company_id = ${companyB.id}`.execute(db);
      await sql`DELETE FROM journal_batches WHERE company_id = ${companyB.id}`.execute(db);
      await sql`DELETE FROM fiscal_periods WHERE company_id = ${companyB.id}`.execute(db);
      await sql`DELETE FROM fiscal_years WHERE company_id = ${companyB.id}`.execute(db);
    } catch (e) {
      // ignore teardown errors
    }
    resetFixtureRegistry();
    await closeTestDb();
    await releaseReadLock();
  });

  // =========================================================================
  // a) Closed period block path — Company B strict mode → 409
  // =========================================================================
  describe("a) Closed period block path (strict mode)", () => {
    it("blocks AP invoice create with 409 when date falls in CLOSED period (Jun 2025)", async () => {
      // Company B: FY2025/P6 is CLOSED (Jun 1-30 2025)
      const res = await postJson("/api/purchasing/invoices", ownerTokenB, {
        supplier_id: supplierIdB,
        invoice_no: `PCG-INV-BLK-${Date.now()}`,
        invoice_date: "2025-06-15",
        currency_code: "IDR",
        lines: [{ description: "Test item", qty: "1", unit_price: "50000.0000", line_type: "SERVICE" }],
      });

      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.error.code).toBe("PERIOD_CLOSED");
    });

    it("blocks AP payment create with 409 when date falls in CLOSED period (Jun 2025)", async () => {
      // Create + post invoice in open period first (Apr 2025 — open for B)
      const invRes = await postJson("/api/purchasing/invoices", ownerTokenB, {
        supplier_id: supplierIdB,
        invoice_no: `PCG-PAY-BLK-INV-${Date.now()}`,
        invoice_date: "2025-04-15",
        currency_code: "IDR",
        lines: [{ description: "Test item", qty: "1", unit_price: "25000.0000", line_type: "SERVICE" }],
      });
      expect(invRes.status).toBe(201);
      const invBody = await invRes.json();
      const invoiceId = invBody.data.id;

      const postRes = await postJson(`/api/purchasing/invoices/${invoiceId}/post`, ownerTokenB);
      expect(postRes.status).toBe(200);

      // Payment with date in CLOSED period (Jun 20, 2025)
      const payRes = await postJson("/api/purchasing/payments", ownerTokenB, {
        payment_date: "2025-06-20",
        bank_account_id: bankAccountIdB,
        supplier_id: supplierIdB,
        lines: [{ purchase_invoice_id: invoiceId, allocation_amount: "25000.0000" }],
      });

      expect(payRes.status).toBe(409);
      const body = await payRes.json();
      expect(body.error.code).toBe("PERIOD_CLOSED");
    });

    it("blocks AP credit create with 409 when date falls in CLOSED period (Jun 2025)", async () => {
      const res = await postJson("/api/purchasing/credits", ownerTokenB, {
        supplier_id: supplierIdB,
        credit_no: `PCG-CR-BLK-${Date.now()}`.slice(0, 20),
        credit_date: "2025-06-18",
        lines: [{ description: "Credit item", qty: "1", unit_price: "10000.0000", line_type: "SERVICE" }],
      });

      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.error.code).toBe("PERIOD_CLOSED");
    });
  });

  // =========================================================================
  // b) Open period — all operations succeed (201)
  // =========================================================================
  describe("b) Open period — operations succeed", () => {
    it("creates AP invoice successfully in OPEN period", async () => {
      const res = await postJson("/api/purchasing/invoices", ownerTokenA, {
        supplier_id: supplierIdA,
        invoice_no: `PCG-INV-OPEN-${Date.now()}`,
        invoice_date: "2026-04-15",
        currency_code: "IDR",
        lines: [{ description: "Test item", qty: "1", unit_price: "50000.0000", line_type: "SERVICE" }],
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.success).toBe(true);
    });

    it("creates AP payment successfully in OPEN period", async () => {
      const invRes = await postJson("/api/purchasing/invoices", ownerTokenA, {
        supplier_id: supplierIdA,
        invoice_no: `PCG-PAY-OPEN-INV-${Date.now()}`,
        invoice_date: "2026-04-12",
        currency_code: "IDR",
        lines: [{ description: "Test item", qty: "1", unit_price: "35000.0000", line_type: "SERVICE" }],
      });
      expect(invRes.status).toBe(201);
      const invBody = await invRes.json();
      const invoiceId = invBody.data.id;

      const postRes = await postJson(`/api/purchasing/invoices/${invoiceId}/post`, ownerTokenA);
      expect(postRes.status).toBe(200);

      const payRes = await postJson("/api/purchasing/payments", ownerTokenA, {
        payment_date: "2026-04-20",
        bank_account_id: bankAccountIdA,
        supplier_id: supplierIdA,
        lines: [{ purchase_invoice_id: invoiceId, allocation_amount: "35000.0000" }],
      });

      expect(payRes.status).toBe(201);
    });

    it("creates AP credit successfully in OPEN period", async () => {
      const res = await postJson("/api/purchasing/credits", ownerTokenA, {
        supplier_id: supplierIdA,
        credit_no: `PCG-CR-OPEN-${Date.now()}`.slice(0, 20),
        credit_date: "2026-04-18",
        lines: [{ description: "Credit item", qty: "1", unit_price: "10000.0000", line_type: "SERVICE" }],
      });

      expect(res.status).toBe(201);
    });
  });

  // =========================================================================
  // c) Override with MANAGE + valid reason → 201 + audit row persisted
  // =========================================================================
  describe("c) Override success + audit row persisted", () => {
    it("succeeds with 201 when MANAGE + valid override_reason for closed period invoice", async () => {
      const res = await postJson("/api/purchasing/invoices", ownerTokenA, {
        supplier_id: supplierIdA,
        invoice_no: `PCG-INV-OVR-${Date.now()}`,
        invoice_date: "2025-04-15",
        currency_code: "IDR",
        override_reason: "Testing override for year-end adjustment correction",
        lines: [{ description: "Override test item", qty: "1", unit_price: "75000.0000", line_type: "SERVICE" }],
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.id).toBeDefined();

      // Verify audit row in period_close_overrides
      const db = getTestDb();
      const overrideRow = await sql`
        SELECT id, reason FROM period_close_overrides
        WHERE company_id = ${companyA.id}
          AND transaction_type = 'PURCHASE_INVOICE'
          AND transaction_id = ${body.data.id}
        LIMIT 1
      `.execute(db);

      expect(overrideRow.rows.length).toBe(1);
      const row = overrideRow.rows[0] as { id: number; reason: string };
      expect(row.reason).toBe("Testing override for year-end adjustment correction");
    });

    it("rejects override_reason shorter than 10 characters with 400", async () => {
      const res = await postJson("/api/purchasing/invoices", ownerTokenA, {
        supplier_id: supplierIdA,
        invoice_no: `PCG-INV-SHORT-OVR-${Date.now()}`,
        invoice_date: "2025-04-15",
        currency_code: "IDR",
        override_reason: "short",
        lines: [{ description: "Test item", qty: "1", unit_price: "10000.0000", line_type: "SERVICE" }],
      });

      expect(res.status).toBe(400);
    });
  });

  // =========================================================================
  // d) Insufficient MANAGE permission → 403
  // =========================================================================
  describe("d) Insufficient MANAGE permission → 403", () => {
    it("returns 403 when user lacks MANAGE on accounting.fiscal_years and provides override_reason (invoice)", async () => {
      const res = await postJson("/api/purchasing/invoices", noManageTokenA, {
        supplier_id: supplierIdA,
        invoice_no: `PCG-INV-NO-MANAGE-${Date.now()}`,
        invoice_date: "2025-04-15",
        currency_code: "IDR",
        override_reason: "Test override reason that is long enough",
        lines: [{ description: "Test item", qty: "1", unit_price: "10000.0000", line_type: "SERVICE" }],
      });

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error.code).toBe("FORBIDDEN");
    });

    it("returns 403 when user lacks MANAGE on accounting.fiscal_years and provides override_reason (payment)", async () => {
      // Create + post invoice in open period first
      const invRes = await postJson("/api/purchasing/invoices", ownerTokenA, {
        supplier_id: supplierIdA,
        invoice_no: `PCG-PAY-NOMNG-INV-${Date.now()}`,
        invoice_date: "2026-04-10",
        currency_code: "IDR",
        lines: [{ description: "Test item", qty: "1", unit_price: "20000.0000", line_type: "SERVICE" }],
      });
      expect(invRes.status).toBe(201);
      const invBody = await invRes.json();
      const invoiceId = invBody.data.id;

      const postRes = await postJson(`/api/purchasing/invoices/${invoiceId}/post`, ownerTokenA);
      expect(postRes.status).toBe(200);

      // Attempt payment in closed period with override_reason but no MANAGE permission
      const payRes = await postJson("/api/purchasing/payments", noManageTokenA, {
        payment_date: "2025-04-20",
        bank_account_id: bankAccountIdA,
        supplier_id: supplierIdA,
        override_reason: "Payment override reason that is long enough",
        lines: [{ purchase_invoice_id: invoiceId, allocation_amount: "20000.0000" }],
      });

      expect(payRes.status).toBe(403);
      const body = await payRes.json();
      expect(body.error.code).toBe("FORBIDDEN");
    });

    it("returns 403 when user lacks MANAGE on accounting.fiscal_years and provides override_reason (credit)", async () => {
      const res = await postJson("/api/purchasing/credits", noManageTokenA, {
        supplier_id: supplierIdA,
        credit_no: `PCG-CR-NOMNG-${Date.now()}`.slice(0, 20),
        credit_date: "2025-04-18",
        override_reason: "Test override for credit",
        lines: [{ description: "Test credit", qty: "1", unit_price: "5000.0000", line_type: "SERVICE" }],
      });

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error.code).toBe("FORBIDDEN");
    });
  });

  // =========================================================================
  // e) Correction flow — void in closed period with and without override
  // =========================================================================
  describe("e) Correction flow — void in closed period", () => {
    it("void in closed period with MANAGE + override_reason succeeds (200)", async () => {
      // Create + post invoice in closed period via override
      const invRes = await postJson("/api/purchasing/invoices", ownerTokenA, {
        supplier_id: supplierIdA,
        invoice_no: `PCG-VOID-OVR-${Date.now()}`,
        invoice_date: "2025-04-10",
        currency_code: "IDR",
        override_reason: "Creating invoice for void override test",
        lines: [{ description: "Invoice for void override", qty: "1", unit_price: "55000.0000", line_type: "SERVICE" }],
      });
      expect(invRes.status).toBe(201);
      const invBody = await invRes.json();
      const invoiceId = invBody.data.id;

      const postRes = await postJson(`/api/purchasing/invoices/${invoiceId}/post`, ownerTokenA, {
        override_reason: "Posting for void override test",
      });
      expect(postRes.status).toBe(200);

      // Void with override_reason
      const voidRes = await postJson(`/api/purchasing/invoices/${invoiceId}/void`, ownerTokenA, {
        override_reason: "Voiding closed period invoice via override",
      });

      expect(voidRes.status).toBe(200);
      const voidBody = await voidRes.json();
      expect(voidBody.success).toBe(true);

      // Verify audit row was written
      const db = getTestDb();
      const overrideRow = await sql`
        SELECT id FROM period_close_overrides
        WHERE company_id = ${companyA.id}
          AND transaction_type = 'PURCHASE_INVOICE'
          AND transaction_id = ${invoiceId}
        LIMIT 1
      `.execute(db);
      expect(overrideRow.rows.length).toBe(1);
    });

    it("void in open period succeeds without override_reason (200)", async () => {
      // Create + post invoice in open period
      const invRes = await postJson("/api/purchasing/invoices", ownerTokenA, {
        supplier_id: supplierIdA,
        invoice_no: `PCG-VOID-BLK-${Date.now()}`,
        invoice_date: "2026-04-11",
        currency_code: "IDR",
        lines: [{ description: "Invoice for void block test", qty: "1", unit_price: "60000.0000", line_type: "SERVICE" }],
      });
      expect(invRes.status).toBe(201);
      const invBody = await invRes.json();
      const invoiceId = invBody.data.id;

      const postRes = await postJson(`/api/purchasing/invoices/${invoiceId}/post`, ownerTokenA);
      expect(postRes.status).toBe(200);

      // Void without override_reason on an OPEN period invoice — should succeed
      const voidRes = await postJson(`/api/purchasing/invoices/${invoiceId}/void`, ownerTokenA, {});

      expect(voidRes.status).toBe(200);
      const voidBody = await voidRes.json();
      expect(voidBody.success).toBe(true);
    });
  });

  // =========================================================================
  // f) Tenant isolation
  // =========================================================================
  describe("f) Tenant isolation", () => {
    it("returns 404 when other company tries to void another company's invoice", async () => {
      // Company A: create + post invoice
      const invRes = await postJson("/api/purchasing/invoices", ownerTokenA, {
        supplier_id: supplierIdA,
        invoice_no: `PCG-TN-INV-${Date.now()}`,
        invoice_date: "2026-04-10",
        currency_code: "IDR",
        lines: [{ description: "Company A invoice", qty: "1", unit_price: "80000.0000", line_type: "SERVICE" }],
      });
      expect(invRes.status).toBe(201);
      const invBody = await invRes.json();
      const invoiceIdA = invBody.data.id;

      const postRes = await postJson(`/api/purchasing/invoices/${invoiceIdA}/post`, ownerTokenA);
      expect(postRes.status).toBe(200);

      // Company B attempts to void company A's invoice — should get 404
      const voidRes = await postJson(`/api/purchasing/invoices/${invoiceIdA}/void`, ownerTokenB, {});
      expect(voidRes.status).toBe(404);
    });

    it("same date is OPEN for company B when B has no closed period in that range", async () => {
      // Company B: FY2025/P4 is OPEN (Apr 1-30 2025)
      // No guardrail setting for B → "strict" default
      // But B has no closed period covering Apr 2025, so transaction succeeds
      const res = await postJson("/api/purchasing/invoices", ownerTokenB, {
        supplier_id: supplierIdB,
        invoice_no: `PCG-B-INV-${Date.now()}`,
        invoice_date: "2025-04-15",
        currency_code: "IDR",
        lines: [{ description: "Company B invoice same date", qty: "1", unit_price: "50000.0000", line_type: "SERVICE" }],
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.success).toBe(true);
    });

    it("other company cannot read company A's invoices (tenant isolation)", async () => {
      // Create an invoice for company A
      const invRes = await postJson("/api/purchasing/invoices", ownerTokenA, {
        supplier_id: supplierIdA,
        invoice_no: `PCG-TN-AUDIT-${Date.now()}`,
        invoice_date: "2026-04-16",
        currency_code: "IDR",
        lines: [{ description: "Audit test item", qty: "1", unit_price: "90000.0000", line_type: "SERVICE" }],
      });
      expect(invRes.status).toBe(201);
      const invBody = await invRes.json();
      const invoiceId = invBody.data.id;

      // Company B tries to read company A's invoice — should get 404
      const getRes = await fetch(`${getTestBaseUrl()}/api/purchasing/invoices/${invoiceId}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${ownerTokenB}` },
      });

      expect(getRes.status).toBe(404);
    });
  });
});
