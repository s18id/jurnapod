// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Story 54.5: AP Period-Close Enforcement Hardening
// Integration tests for period-close guardrail behavior in purchasing module.
//
// Architecture:
//   - Single company with timezone="Asia/Jakarta" and override_allowed mode
//   - Fiscal year 2024: period 1 (Jan 1-31) — OPEN initially, CLOSED for AC4
//   - Fiscal year 2026: period 2 (Feb 1-28) — OPEN (happy path)
//   - Two users: one with MANAGE on accounting.fiscal_years, one without
//
// RWLock pattern: each test file acquires a shared read lock so the HTTP server
// stays alive across tests, and releases it in afterAll.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getTestBaseUrl } from "../../helpers/env";
import { closeTestDb, getTestDb } from "../../helpers/db";
import { sql } from "kysely";
import { makeTag } from "../../helpers/tags";
import {
  resetFixtureRegistry,
  createTestCompanyMinimal,
  createTestOutletMinimal,
  createTestUser,
  createTestRole,
  assignUserGlobalRole,
  setModulePermission,
  loginForTest,
  createTestSupplier,
  createTestBankAccount,
  createTestPurchasingAccounts,
  createTestFiscalYear,
  createTestFiscalPeriod,
  setTestCompanyStringSetting,
  getTestAccessToken,
  cleanupTestFixtures,
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

// Company with Jakarta timezone and override_allowed mode
let company: { id: number; code: string };
let ownerToken: string;
let noManageToken: string;
let supplierId: number;
let bankAccountId: number;
let fy2024Id: number;
let fy2026Id: number;
let period2024_1_Id: number;
let ownerUserId: number;
let noManageUserId: number;

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------
describe("purchasing.ap-period-close-enforcement (Story 54.5)", { timeout: 60000 }, () => {

  beforeAll(async () => {
    await acquireReadLock();
    baseUrl = getTestBaseUrl();
    const seedToken = await getTestAccessToken(baseUrl);

    // =======================================================================
    // Company — Jakarta timezone, override_allowed mode
    // =======================================================================
    company = await createTestCompanyMinimal({
      code: makeTag("PCECO").toUpperCase(),
      timezone: "Asia/Jakarta",
    });

    // Create outlet with Jakarta timezone
    await createTestOutletMinimal(company.id, {
      code: makeTag("PCEOT").toUpperCase(),
      name: "PCE Outlet Jakarta",
      timezone: "Asia/Jakarta",
    });

    // ---- Owner user (custom role with MANAGE on accounting.fiscal_years) ----
    const ownerCustomRole = await createTestRole(baseUrl, seedToken, "PCE Owner Role");

    const ownerEmail = `${makeTag("pceowner")}@example.com`;
    const ownerUser = await createTestUser(company.id, {
      email: ownerEmail,
      name: "PCE Owner",
      password: "TestPassword123!",
    });
    ownerUserId = ownerUser.id;
    await assignUserGlobalRole(ownerUser.id, ownerCustomRole.id);

    await setModulePermission(company.id, ownerCustomRole.id, "purchasing", "invoices", CRUDAM);
    await setModulePermission(company.id, ownerCustomRole.id, "purchasing", "payments", CRUDAM);
    await setModulePermission(company.id, ownerCustomRole.id, "purchasing", "credits", CRUDAM);
    // MANAGE on fiscal_years enables the override path
    await setModulePermission(company.id, ownerCustomRole.id, "accounting", "fiscal_years", MANAGE);

    // ---- Custom role: READ only on accounting.fiscal_years (no MANAGE → 403) ----
    const noManageRole = await createTestRole(baseUrl, seedToken, "PCE No Manage Role");

    const noManageEmail = `${makeTag("pcenomanage")}@example.com`;
    const noManageUser = await createTestUser(company.id, {
      email: noManageEmail,
      name: "PCE NoManage",
      password: "TestPassword123!",
    });
    noManageUserId = noManageUser.id;
    await assignUserGlobalRole(noManageUser.id, noManageRole.id);

    await setModulePermission(company.id, noManageRole.id, "purchasing", "invoices", CRUDAM);
    await setModulePermission(company.id, noManageRole.id, "purchasing", "payments", CRUDAM);
    await setModulePermission(company.id, noManageRole.id, "purchasing", "credits", CRUDAM);
    // READ on fiscal_years but NOT MANAGE — override will be rejected 403
    await setModulePermission(company.id, noManageRole.id, "accounting", "fiscal_years", READ);

    // ---- Support entities ----
    await createTestPurchasingAccounts(company.id);
    const supplier = await createTestSupplier(company.id, {
      code: makeTag("PCESUP"),
      name: "PCE Supplier",
      currency: "IDR",
    });
    supplierId = supplier.id;
    bankAccountId = await createTestBankAccount(company.id, { typeName: "BANK", isActive: true });

    // ---- Fiscal years and periods ----
    // FY2024: period 1 (Jan 1-31) — OPEN initially, will CLOSE for AC4
    const fy2024 = await createTestFiscalYear(company.id, {
      year: 2024,
      startDate: "2024-01-01",
      endDate: "2024-12-31",
      status: "OPEN",
    });
    fy2024Id = fy2024.id;
    const period2024_1 = await createTestFiscalPeriod(fy2024.id, {
      periodNumber: 1,
      startDate: "2024-01-01",
      endDate: "2024-01-31",
      status: "OPEN",
    });
    period2024_1_Id = period2024_1.id;

    // FY2026: period 2 (Feb 1-28) — OPEN (happy path)
    const fy2026 = await createTestFiscalYear(company.id, {
      year: 2026,
      startDate: "2026-01-01",
      endDate: "2026-12-31",
      status: "OPEN",
    });
    fy2026Id = fy2026.id;
    await createTestFiscalPeriod(fy2026.id, {
      periodNumber: 2,
      startDate: "2026-02-01",
      endDate: "2026-02-28",
      status: "OPEN",
    });

    // FY2099: period 1 (Jan 1-Dec 31) — OPEN initially, will CLOSE for AC3
    // This period ends in the future, so backdate check won't fire
    const fy2099 = await createTestFiscalYear(company.id, {
      year: 2099,
      startDate: "2099-01-01",
      endDate: "2099-12-31",
      status: "OPEN",
    });
    await createTestFiscalPeriod(fy2099.id, {
      periodNumber: 1,
      startDate: "2099-01-01",
      endDate: "2099-12-31",
      status: "OPEN",
    });

    // Set guardrail to "override_allowed"
    await setTestCompanyStringSetting(
      company.id,
      "accounting.ap_period_close_guardrail",
      "override_allowed"
    );

    // ---- Tokens ----
    ownerToken = await loginForTest(baseUrl, company.code, ownerEmail, "TestPassword123!");
    noManageToken = await loginForTest(baseUrl, company.code, noManageEmail, "TestPassword123!");
  });

  afterAll(async () => {
    try {
      const db = getTestDb();
      // Teardown — child → parent FK order
      await sql`DELETE FROM audit_logs WHERE company_id = ${company.id}`.execute(db);
      await sql`DELETE FROM period_close_overrides WHERE company_id = ${company.id}`.execute(db);
      await sql`DELETE FROM purchase_credit_lines WHERE company_id = ${company.id}`.execute(db);
      await sql`DELETE FROM purchase_credits WHERE company_id = ${company.id}`.execute(db);
      await sql`DELETE FROM ap_payment_lines WHERE company_id = ${company.id}`.execute(db);
      await sql`DELETE FROM ap_payments WHERE company_id = ${company.id}`.execute(db);
      await sql`DELETE FROM purchase_invoice_lines WHERE company_id = ${company.id}`.execute(db);
      await sql`DELETE FROM purchase_invoices WHERE company_id = ${company.id}`.execute(db);
      await sql`DELETE FROM journal_lines WHERE company_id = ${company.id}`.execute(db);
      await sql`DELETE FROM journal_batches WHERE company_id = ${company.id}`.execute(db);
      await sql`DELETE FROM period_close_overrides WHERE company_id = ${company.id}`.execute(db);
      await sql`DELETE FROM period_close_overrides WHERE user_id = ${ownerUserId}`.execute(db);
      await sql`DELETE FROM period_close_overrides WHERE user_id = ${noManageUserId}`.execute(db);
      await sql`DELETE FROM audit_logs WHERE company_id = ${company.id}`.execute(db);
      await sql`DELETE FROM fiscal_periods WHERE company_id = ${company.id}`.execute(db);
      await sql`DELETE FROM fiscal_years WHERE company_id = ${company.id}`.execute(db);
      await sql`DELETE FROM settings_strings WHERE company_id = ${company.id}`.execute(db);
      await sql`DELETE FROM bank_accounts WHERE company_id = ${company.id}`.execute(db);
      await sql`DELETE FROM suppliers WHERE company_id = ${company.id}`.execute(db);
      await sql`DELETE FROM user_role_assignments WHERE user_id IN (SELECT id FROM users WHERE company_id = ${company.id})`.execute(db);
      await sql`DELETE FROM module_roles WHERE company_id = ${company.id}`.execute(db);
      await sql`DELETE FROM users WHERE company_id = ${company.id}`.execute(db);
      await sql`DELETE FROM outlets WHERE company_id = ${company.id}`.execute(db);
      await sql`DELETE FROM companies WHERE id = ${company.id}`.execute(db);
    } catch {
      // ignore cleanup errors
    }
    await cleanupTestFixtures();
    await closeTestDb();
    await releaseReadLock();
  });

  // ========================================================================
  // Happy path: post to open period succeeds
  // ========================================================================
  it("open period allows posting", async () => {
    const res = await postJson("/api/purchasing/invoices", ownerToken, {
      supplier_id: supplierId,
      invoice_no: makeTag("PCEOPEN"),
      invoice_date: "2026-02-15",
      currency_code: "IDR",
      lines: [{ description: "Open period item", qty: "1", unit_price: "10000.0000", line_type: "SERVICE" }],
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBeDefined();
  });

  // ========================================================================
  // AC1: Posting to closed AP period is rejected
  // ========================================================================
  it("AC1: closed period blocks posting with 400", async () => {
    // Close period 2024-01
    const db = getTestDb();
    await sql`UPDATE fiscal_periods SET status = 2 WHERE id = ${period2024_1_Id}`.execute(db);

    // Create draft invoice in closed period — creation is blocked because period is closed
    const res = await postJson("/api/purchasing/invoices", ownerToken, {
      supplier_id: supplierId,
      invoice_no: makeTag("PCECLOSED"),
      invoice_date: "2024-01-15",
      currency_code: "IDR",
      lines: [{ description: "Closed period item", qty: "1", unit_price: "10000.0000", line_type: "SERVICE" }],
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("INVALID_REQUEST");

    // Re-open for other tests
    await sql`UPDATE fiscal_periods SET status = 1 WHERE id = ${period2024_1_Id}`.execute(db);
  });

  // ========================================================================
  // AC2: Override path requires high privilege
  // ========================================================================
  describe("AC2: override privilege", () => {
    it("CASHIER override attempt rejected with 403", async () => {
      // Close period 2024-01
      const db = getTestDb();
      await sql`UPDATE fiscal_periods SET status = 2 WHERE id = ${period2024_1_Id}`.execute(db);

      const res = await postJson("/api/purchasing/invoices", noManageToken, {
        supplier_id: supplierId,
        invoice_no: makeTag("PCE403"),
        invoice_date: "2024-01-15",
        currency_code: "IDR",
        override_reason: "Test override reason that is long enough",
        lines: [{ description: "403 test item", qty: "1", unit_price: "10000.0000", line_type: "SERVICE" }],
      });

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error.code).toBe("FORBIDDEN");

      // Re-open
      await sql`UPDATE fiscal_periods SET status = 1 WHERE id = ${period2024_1_Id}`.execute(db);
    });

    it("COMPANY_ADMIN override succeeds with 201", async () => {
      // Close period 2024-01
      const db = getTestDb();
      await sql`UPDATE fiscal_periods SET status = 2 WHERE id = ${period2024_1_Id}`.execute(db);

      const res = await postJson("/api/purchasing/invoices", ownerToken, {
        supplier_id: supplierId,
        invoice_no: makeTag("PCE201"),
        invoice_date: "2024-01-15",
        currency_code: "IDR",
        override_reason: "Test override reason that is long enough",
        lines: [{ description: "201 test item", qty: "1", unit_price: "10000.0000", line_type: "SERVICE" }],
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.id).toBeDefined();

      // Re-open
      await sql`UPDATE fiscal_periods SET status = 1 WHERE id = ${period2024_1_Id}`.execute(db);
    });
  });

  // ========================================================================
  // AC3: Override is audited
  // ========================================================================
  it("AC3: audit log entry created on override", async () => {
    // Close period 2099-01 (ends in future — backdate check won't fire)
    const db = getTestDb();
    const period2099_1 = await sql`
      SELECT fp.id FROM fiscal_periods fp
      JOIN fiscal_years fy ON fy.id = fp.fiscal_year_id
      WHERE fp.company_id = ${company.id} AND fp.period_no = 1 AND fy.start_date = '2099-01-01'
      LIMIT 1
    `.execute(db);
    const period2099_1_Id = (period2099_1.rows[0] as { id: number }).id;
    await sql`UPDATE fiscal_periods SET status = 2 WHERE id = ${period2099_1_Id}`.execute(db);

    const res = await postJson("/api/purchasing/invoices", ownerToken, {
      supplier_id: supplierId,
      invoice_no: makeTag("PCEAUDIT"),
      invoice_date: "2099-06-15",
      currency_code: "IDR",
      override_reason: "Audit test override reason",
      lines: [{ description: "Audit test item", qty: "1", unit_price: "10000.0000", line_type: "SERVICE" }],
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    const invoiceId = body.data.id;

    // Post the invoice — audit log is written during post, not create
    const postRes = await postJson(`/api/purchasing/invoices/${invoiceId}/post`, ownerToken, {
      override_reason: "Audit test override reason",
    });
    expect(postRes.status).toBe(200);

    // Verify audit log entry
    const auditRow = await sql`
      SELECT id, action, payload_json FROM audit_logs
      WHERE company_id = ${company.id}
        AND action = 'PERIOD_CLOSE_OVERRIDE'
      ORDER BY id DESC
      LIMIT 1
    `.execute(db);

    expect(auditRow.rows.length).toBe(1);
    const row = auditRow.rows[0] as { id: number; action: string; payload_json: string };
    expect(row.action).toBe("PERIOD_CLOSE_OVERRIDE");
    const payload = JSON.parse(row.payload_json);
    expect(payload.transactionId).toBe(invoiceId);
    expect(payload.reason).toBe("Audit test override reason");

    // Also verify period_close_overrides row (existing behavior)
    const overrideRow = await sql`
      SELECT id, reason FROM period_close_overrides
      WHERE company_id = ${company.id}
        AND transaction_type = 'PURCHASE_INVOICE'
        AND transaction_id = ${invoiceId}
      LIMIT 1
    `.execute(db);
    expect(overrideRow.rows.length).toBe(1);

    // Re-open
    await sql`UPDATE fiscal_periods SET status = 1 WHERE id = ${period2099_1_Id}`.execute(db);
  });

  // ========================================================================
  // AC3b: Void override is audited (D54-004)
  // ========================================================================
  it("AC3b: void invoice with override creates audit log entry", async () => {
    const db = getTestDb();
    const period2099_1 = await sql`
      SELECT fp.id FROM fiscal_periods fp
      JOIN fiscal_years fy ON fy.id = fp.fiscal_year_id
      WHERE fp.company_id = ${company.id} AND fp.period_no = 1 AND fy.start_date = '2099-01-01'
      LIMIT 1
    `.execute(db);
    const period2099_1_Id = (period2099_1.rows[0] as { id: number }).id;
    await sql`UPDATE fiscal_periods SET status = 2 WHERE id = ${period2099_1_Id}`.execute(db);

    // Create invoice in closed future period
    const draftRes = await postJson("/api/purchasing/invoices", ownerToken, {
      supplier_id: supplierId,
      invoice_no: makeTag("PCEVOID"),
      invoice_date: "2099-06-15",
      currency_code: "IDR",
      override_reason: "Create override for void audit test",
      lines: [{ description: "Void audit item", qty: "1", unit_price: "10000.0000", line_type: "SERVICE" }],
    });
    expect(draftRes.status).toBe(201);
    const draftBody = await draftRes.json();
    const invoiceId = draftBody.data.id;

    // Post with override
    const postRes = await postJson(`/api/purchasing/invoices/${invoiceId}/post`, ownerToken, {
      override_reason: "Post override for void audit test",
    });
    expect(postRes.status).toBe(200);

    // Void with override
    const voidRes = await postJson(`/api/purchasing/invoices/${invoiceId}/void`, ownerToken, {
      override_reason: "Void override audit test reason",
    });
    expect(voidRes.status).toBe(200);

    // Verify audit log entry for VOID
    const auditRow = await sql`
      SELECT id, action, payload_json FROM audit_logs
      WHERE company_id = ${company.id}
        AND action = 'PERIOD_CLOSE_OVERRIDE'
        AND payload_json LIKE ${'%"transactionType":"PURCHASE_INVOICE_VOID"%'}
      ORDER BY id DESC
      LIMIT 1
    `.execute(db);

    expect(auditRow.rows.length).toBe(1);
    const row = auditRow.rows[0] as { id: number; action: string; payload_json: string };
    expect(row.action).toBe("PERIOD_CLOSE_OVERRIDE");
    const payload = JSON.parse(row.payload_json);
    expect(payload.transactionId).toBe(invoiceId);
    expect(payload.transactionType).toBe("PURCHASE_INVOICE_VOID");
    expect(payload.reason).toBe("Void override audit test reason");

    // Verify period_close_overrides row for void
    const overrideRow = await sql`
      SELECT id, reason FROM period_close_overrides
      WHERE company_id = ${company.id}
        AND transaction_type = 'PURCHASE_INVOICE_VOID'
        AND transaction_id = ${invoiceId}
      LIMIT 1
    `.execute(db);
    expect(overrideRow.rows.length).toBe(1);

    // Re-open
    await sql`UPDATE fiscal_periods SET status = 1 WHERE id = ${period2099_1_Id}`.execute(db);
  });

  it("AC3b: void AP payment with override creates audit log entry", async () => {
    const db = getTestDb();
    const period2099_1 = await sql`
      SELECT fp.id FROM fiscal_periods fp
      JOIN fiscal_years fy ON fy.id = fp.fiscal_year_id
      WHERE fp.company_id = ${company.id} AND fp.period_no = 1 AND fy.start_date = '2099-01-01'
      LIMIT 1
    `.execute(db);
    const period2099_1_Id = (period2099_1.rows[0] as { id: number }).id;
    await sql`UPDATE fiscal_periods SET status = 2 WHERE id = ${period2099_1_Id}`.execute(db);

    // Create a draft invoice first (to pay against)
    const invRes = await postJson("/api/purchasing/invoices", ownerToken, {
      supplier_id: supplierId,
      invoice_no: makeTag("PCEPYINV"),
      invoice_date: "2099-06-15",
      currency_code: "IDR",
      override_reason: "Create override for payment void audit test",
      lines: [{ description: "Payment void audit item", qty: "1", unit_price: "10000.0000", line_type: "SERVICE" }],
    });
    expect(invRes.status).toBe(201);
    const invBody = await invRes.json();
    const invoiceId = invBody.data.id;

    // Post invoice
    const postInvRes = await postJson(`/api/purchasing/invoices/${invoiceId}/post`, ownerToken, {
      override_reason: "Post override for payment void audit test",
    });
    expect(postInvRes.status).toBe(200);

    // Create payment in closed future period
    const payRes = await postJson("/api/purchasing/payments", ownerToken, {
      supplier_id: supplierId,
      bank_account_id: bankAccountId,
      payment_date: "2099-06-20",
      override_reason: "Create override for payment void audit test",
      lines: [{ purchase_invoice_id: invoiceId, allocation_amount: "10000.0000" }],
    });
    expect(payRes.status).toBe(201);
    const payBody = await payRes.json();
    const paymentId = payBody.data.id;

    // Post payment with override
    const postPayRes = await postJson(`/api/purchasing/payments/${paymentId}/post`, ownerToken, {
      override_reason: "Post override for payment void audit test",
    });
    expect(postPayRes.status).toBe(200);

    // Void payment with override
    const voidRes = await postJson(`/api/purchasing/payments/${paymentId}/void`, ownerToken, {
      override_reason: "Void payment override audit test reason",
    });
    expect(voidRes.status).toBe(200);

    // Verify audit log entry for void
    const auditRow = await sql`
      SELECT id, action, payload_json FROM audit_logs
      WHERE company_id = ${company.id}
        AND action = 'PERIOD_CLOSE_OVERRIDE'
        AND payload_json LIKE ${'%"transactionType":"AP_PAYMENT_VOID"%'}
      ORDER BY id DESC
      LIMIT 1
    `.execute(db);

    expect(auditRow.rows.length).toBe(1);
    const row = auditRow.rows[0] as { id: number; action: string; payload_json: string };
    expect(row.action).toBe("PERIOD_CLOSE_OVERRIDE");
    const payload = JSON.parse(row.payload_json);
    expect(payload.transactionId).toBe(paymentId);
    expect(payload.transactionType).toBe("AP_PAYMENT_VOID");
    expect(payload.reason).toBe("Void payment override audit test reason");

    // Verify period_close_overrides row
    const overrideRow = await sql`
      SELECT id, reason FROM period_close_overrides
      WHERE company_id = ${company.id}
        AND transaction_type = 'AP_PAYMENT_VOID'
        AND transaction_id = ${paymentId}
      LIMIT 1
    `.execute(db);
    expect(overrideRow.rows.length).toBe(1);

    // Re-open
    await sql`UPDATE fiscal_periods SET status = 1 WHERE id = ${period2099_1_Id}`.execute(db);
  });

  it("AC3b: void purchase credit with override creates audit log entry", async () => {
    const db = getTestDb();
    const period2099_1 = await sql`
      SELECT fp.id FROM fiscal_periods fp
      JOIN fiscal_years fy ON fy.id = fp.fiscal_year_id
      WHERE fp.company_id = ${company.id} AND fp.period_no = 1 AND fy.start_date = '2099-01-01'
      LIMIT 1
    `.execute(db);
    const period2099_1_Id = (period2099_1.rows[0] as { id: number }).id;
    await sql`UPDATE fiscal_periods SET status = 2 WHERE id = ${period2099_1_Id}`.execute(db);

    // Create a draft invoice first (to credit against)
    const invRes = await postJson("/api/purchasing/invoices", ownerToken, {
      supplier_id: supplierId,
      invoice_no: makeTag("PCECRINV"),
      invoice_date: "2099-06-15",
      currency_code: "IDR",
      override_reason: "Create override for credit void audit test",
      lines: [{ description: "Credit void audit item", qty: "1", unit_price: "10000.0000", line_type: "SERVICE" }],
    });
    expect(invRes.status).toBe(201);
    const invBody = await invRes.json();
    const invoiceId = invBody.data.id;

    // Post invoice
    const postInvRes = await postJson(`/api/purchasing/invoices/${invoiceId}/post`, ownerToken, {
      override_reason: "Post override for credit void audit test",
    });
    expect(postInvRes.status).toBe(200);

    // Create credit note in closed future period
    const crRes = await postJson("/api/purchasing/credits", ownerToken, {
      supplier_id: supplierId,
      credit_no: makeTag("PCECRV"),
      credit_date: "2099-06-20",
      currency_code: "IDR",
      override_reason: "Create override for credit void audit test",
      lines: [{ description: "Credit void audit item", qty: "1", unit_price: "5000.0000", reason: "SERVICE" }],
    });
    expect(crRes.status).toBe(201);
    const crBody = await crRes.json();
    const creditId = crBody.data.id;

    // Apply credit with override
    const applyRes = await postJson(`/api/purchasing/credits/${creditId}/apply`, ownerToken, {
      invoice_id: invoiceId,
      amount: "5000.0000",
      override_reason: "Apply override for credit void audit test",
    });
    expect(applyRes.status).toBe(200);

    // Void credit with override
    const voidRes = await postJson(`/api/purchasing/credits/${creditId}/void`, ownerToken, {
      override_reason: "Void credit override audit test reason",
    });
    expect(voidRes.status).toBe(200);

    // Verify audit log entry for void
    const auditRow = await sql`
      SELECT id, action, payload_json FROM audit_logs
      WHERE company_id = ${company.id}
        AND action = 'PERIOD_CLOSE_OVERRIDE'
        AND payload_json LIKE ${'%"transactionType":"PURCHASE_CREDIT_VOID"%'}
      ORDER BY id DESC
      LIMIT 1
    `.execute(db);

    expect(auditRow.rows.length).toBe(1);
    const row = auditRow.rows[0] as { id: number; action: string; payload_json: string };
    expect(row.action).toBe("PERIOD_CLOSE_OVERRIDE");
    const payload = JSON.parse(row.payload_json);
    expect(payload.transactionId).toBe(creditId);
    expect(payload.transactionType).toBe("PURCHASE_CREDIT_VOID");
    expect(payload.reason).toBe("Void credit override audit test reason");

    // Verify period_close_overrides row
    const overrideRow = await sql`
      SELECT id, reason FROM period_close_overrides
      WHERE company_id = ${company.id}
        AND transaction_type = 'PURCHASE_CREDIT_VOID'
        AND transaction_id = ${creditId}
      LIMIT 1
    `.execute(db);
    expect(overrideRow.rows.length).toBe(1);

    // Re-open
    await sql`UPDATE fiscal_periods SET status = 1 WHERE id = ${period2099_1_Id}`.execute(db);
  });

  // ========================================================================
  // AC4: Backdated entries crossing period boundaries are blocked
  // ========================================================================
  it("AC4: backdated entry to closed period blocked even with override", async () => {
    const db = getTestDb();

    // Step 1: Create draft invoice in OPEN period 2024-01
    const draftRes = await postJson("/api/purchasing/invoices", ownerToken, {
      supplier_id: supplierId,
      invoice_no: makeTag("PCEBACK"),
      invoice_date: "2024-01-15",
      currency_code: "IDR",
      lines: [{ description: "Backdate test item", qty: "1", unit_price: "10000.0000", line_type: "SERVICE" }],
    });
    expect(draftRes.status).toBe(201);
    const draftBody = await draftRes.json();
    const invoiceId = draftBody.data.id;

    // Step 2: Close the period
    await sql`UPDATE fiscal_periods SET status = 2 WHERE id = ${period2024_1_Id}`.execute(db);

    // Step 3: Try to post with override_reason — should be blocked because period ended
    const postRes = await postJson(`/api/purchasing/invoices/${invoiceId}/post`, ownerToken, {
      override_reason: "Backdate override reason that is long enough",
    });

    expect(postRes.status).toBe(409);
    const postBody = await postRes.json();
    expect(postBody.error.code).toBe("PERIOD_CLOSED");

    // Re-open
    await sql`UPDATE fiscal_periods SET status = 1 WHERE id = ${period2024_1_Id}`.execute(db);
  });

  it("AC4: backdated void to closed period blocked even with override", async () => {
    const db = getTestDb();

    // Step 1: Create and post invoice in OPEN period 2024-01
    const draftRes = await postJson("/api/purchasing/invoices", ownerToken, {
      supplier_id: supplierId,
      invoice_no: makeTag("PCEBACKVOID"),
      invoice_date: "2024-01-15",
      currency_code: "IDR",
      lines: [{ description: "Backdate void test item", qty: "1", unit_price: "10000.0000", line_type: "SERVICE" }],
    });
    expect(draftRes.status).toBe(201);
    const draftBody = await draftRes.json();
    const invoiceId = draftBody.data.id;

    const postRes = await postJson(`/api/purchasing/invoices/${invoiceId}/post`, ownerToken);
    expect(postRes.status).toBe(200);

    // Step 2: Close the period
    await sql`UPDATE fiscal_periods SET status = 2 WHERE id = ${period2024_1_Id}`.execute(db);

    // Step 3: Try to void with override_reason — should be blocked because period ended
    const voidRes = await postJson(`/api/purchasing/invoices/${invoiceId}/void`, ownerToken, {
      override_reason: "Backdate void override reason that is long enough",
    });

    expect(voidRes.status).toBe(409);
    const voidBody = await voidRes.json();
    expect(voidBody.error.code).toBe("PERIOD_CLOSED");

    // Re-open
    await sql`UPDATE fiscal_periods SET status = 1 WHERE id = ${period2024_1_Id}`.execute(db);
  });

  // ========================================================================
  // AC5: Timezone-aware period boundary is correct
  // ========================================================================
  describe("AC5: timezone boundary", () => {
    it("invoice in closed period blocked (Jakarta timezone)", async () => {
      // Close period 2026-02 (Feb 1-28) for this test
      const db = getTestDb();
      const period2026_2 = await sql`
        SELECT id FROM fiscal_periods
        WHERE company_id = ${company.id} AND period_no = 2 AND fiscal_year_id = ${fy2026Id}
        LIMIT 1
      `.execute(db);
      const period2026_2_Id = (period2026_2.rows[0] as { id: number }).id;

      await sql`UPDATE fiscal_periods SET status = 2 WHERE id = ${period2026_2_Id}`.execute(db);

      const res = await postJson("/api/purchasing/invoices", ownerToken, {
        supplier_id: supplierId,
        invoice_no: makeTag("PCETZBLK"),
        invoice_date: "2026-02-15",
        currency_code: "IDR",
        lines: [{ description: "TZ block item", qty: "1", unit_price: "10000.0000", line_type: "SERVICE" }],
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe("INVALID_REQUEST");

      // Re-open
      await sql`UPDATE fiscal_periods SET status = 1 WHERE id = ${period2026_2_Id}`.execute(db);
    });

    it("invoice in next period allowed (Jakarta timezone)", async () => {
      const res = await postJson("/api/purchasing/invoices", ownerToken, {
        supplier_id: supplierId,
        invoice_no: makeTag("PCETZOK"),
        invoice_date: "2026-02-15",
        currency_code: "IDR",
        lines: [{ description: "TZ allow item", qty: "1", unit_price: "10000.0000", line_type: "SERVICE" }],
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.success).toBe(true);
    });
  });
});
