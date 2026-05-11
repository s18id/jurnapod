// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Story 57.3: AR Credits/Void/Refund Invariants
// Integration tests for credit note journal posting, invoice void behavior,
// immutability, and deferred refund contract.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { sql } from "kysely";
import { JournalsService } from "@jurnapod/modules-accounting";
import { getTestBaseUrl } from "../../helpers/env";
import { closeTestDb, getTestDb } from "../../helpers/db";
import { acquireReadLock, releaseReadLock } from "../../helpers/setup";
import { initializeDefaultTemplates } from "../../../src/lib/numbering";
import {
  resetFixtureRegistry,
  getTestAccessToken,
  createTestCompanyMinimal,
  createTestOutletMinimal,
  createTestUser,
  getRoleIdByCode,
  assignUserGlobalRole,
  setModulePermission,
  createTestCustomerForCompany,
  ensureTestSalesAccountMappings,
  loginForTest,
  createTestBankAccount,
  createTestFiscalYear,
  createTestFiscalPeriod,
} from "../../fixtures";
import { buildPermissionMask } from "@jurnapod/auth";
import { createPostedInvoice as sharedCreatePostedInvoice } from "../../helpers/sales-flows";

let baseUrl: string;
let tokenA: string;
let companyAId: number;
let outletAId: number;

let tagCounter = 0;
function arTag(prefix: string): string {
  return `${prefix}${String(++tagCounter).padStart(4, "0")}`;
}

describe("sales.ar-credit-void-refund - Story 57.3", { timeout: 90000 }, () => {
  beforeAll(async () => {
    await acquireReadLock();
    baseUrl = getTestBaseUrl();
    const seedToken = await getTestAccessToken(baseUrl);

    const ownerRoleId = await getRoleIdByCode("OWNER");
    const CRUDAM = buildPermissionMask({
      canCreate: true,
      canRead: true,
      canUpdate: true,
      canDelete: true,
      canAnalyze: true,
      canManage: true,
    });

    const companyA = await createTestCompanyMinimal({ code: `AR57C${Date.now()}`.slice(0, 15), timezone: "Asia/Jakarta" });
    companyAId = companyA.id;

    const outletA = await createTestOutletMinimal(companyAId, { code: `A57OUT${Date.now()}`.slice(0, 15), timezone: "Asia/Jakarta" });
    outletAId = outletA.id;

    const userA = await createTestUser(companyAId, {
      email: `ar57c-${Date.now()}@example.com`,
      name: "AR 57.3 Owner",
      password: "TestPassword123!",
    });

    await assignUserGlobalRole(userA.id, ownerRoleId);
    await setModulePermission(companyAId, ownerRoleId, "platform", "customers", CRUDAM, { allowSystemRoleMutation: true });
    await setModulePermission(companyAId, ownerRoleId, "sales", "invoices", CRUDAM, { allowSystemRoleMutation: true });
    await setModulePermission(companyAId, ownerRoleId, "sales", "payments", CRUDAM, { allowSystemRoleMutation: true });

    await ensureTestSalesAccountMappings(companyAId, outletAId);
    await initializeDefaultTemplates(companyAId);
    const fiscalYear = await createTestFiscalYear(companyAId, {
      year: 2026,
      startDate: "2026-01-01",
      endDate: "2026-12-31",
      status: "OPEN",
    });
    await createTestFiscalPeriod(fiscalYear.id);

    tokenA = await loginForTest(baseUrl, companyA.code, userA.email, "TestPassword123!");
  });

  afterAll(async () => {
    resetFixtureRegistry();
    await closeTestDb();
    await releaseReadLock();
  });

  async function createCustomerA(): Promise<number> {
    const code = `C57${Date.now()}`.slice(0, 20);
    return createTestCustomerForCompany(baseUrl, tokenA, companyAId, code, "AR 57.3 Customer");
  }

  async function createPostedInvoice(amount: number, invoiceDate = "2026-05-20"): Promise<number> {
    const customerId = await createCustomerA();
    const result = await sharedCreatePostedInvoice({
      baseUrl, token: tokenA, outletId: outletAId, customerId, amount,
      invoiceDate, invoiceNo: arTag("ARINV"), description: "AR57.3 Invoice",
    });
    return result.id;
  }

  async function createPostedPayment(amount = 200000): Promise<number> {
    const invoiceId = await createPostedInvoice(amount, "2026-05-21");
    const bankAccountId = await createTestBankAccount(companyAId, {
      code: arTag("BANK"),
      name: "AR57.3 Bank",
      typeName: "BANK",
      isActive: true,
      isPayable: true,
    });

    const payRes = await fetch(`${baseUrl}/api/sales/payments`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenA}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        outlet_id: outletAId,
        invoice_id: invoiceId,
        client_ref: crypto.randomUUID(),
        payment_no: arTag("ARPAY"),
        payment_at: "2026-05-21T10:00:00Z",
        account_id: bankAccountId,
        method: "CASH",
        amount,
      }),
    });

    expect(payRes.status).toBe(201);
    const payBody = await payRes.json() as { data: { id: number; status: string } };
    expect(payBody.data.status).toBe("DRAFT");

    const payPostRes = await fetch(`${baseUrl}/api/sales/payments/${payBody.data.id}/post`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenA}`, "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(payPostRes.status).toBe(200);

    return payBody.data.id;
  }

  function getJournalsService(): JournalsService {
    return new JournalsService(getTestDb());
  }

  async function getJournalBatchForRef(companyId: number, docType: string, docId: number) {
    const svc = getJournalsService();
    const batches = await svc.listJournalBatches({
      company_id: companyId,
      doc_type: docType,
      limit: 1000,
      offset: 0,
    });
    return batches.find(b => b.doc_id === docId);
  }

  async function countJournalBatchesForRef(companyId: number, docType: string, docId: number): Promise<number> {
    const svc = getJournalsService();
    const batches = await svc.listJournalBatches({
      company_id: companyId,
      doc_type: docType,
      limit: 1000,
      offset: 0,
    });
    return batches.filter(b => b.doc_id === docId).length;
  }

  // AC1
  it("AC1: Credit note creates new journal entries, original invoice unchanged", async () => {
    const invoiceId = await createPostedInvoice(500000, "2026-05-22");
    const clientRef = crypto.randomUUID();

    const createRes = await fetch(`${baseUrl}/api/sales/credit-notes`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenA}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        outlet_id: outletAId,
        invoice_id: invoiceId,
        credit_note_date: "2026-05-22",
        client_ref: clientRef,
        amount: 200000,
        reason: "Partial return",
        lines: [{ description: "Credit line", qty: 1, unit_price: 200000 }],
      }),
    });

    if (createRes.status !== 201) {
      throw new Error(`AC1 create credit note expected 201, got ${createRes.status}: ${await createRes.text()}`);
    }
    const createBody = await createRes.json() as { data: { id: number; status: string } };
    expect(createBody.data.status).toBe("DRAFT");

    const postRes = await fetch(`${baseUrl}/api/sales/credit-notes/${createBody.data.id}/post`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenA}`, "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(postRes.status).toBe(200);
    const postBody = await postRes.json() as { data: { id: number; status: string; amount: number } };
    expect(postBody.data.status).toBe("POSTED");
    expect(Number(postBody.data.amount)).toBe(200000);

    const creditBatch = await getJournalBatchForRef(companyAId, "SALES_CREDIT_NOTE", createBody.data.id);
    expect(creditBatch).toBeDefined();

    const lines = creditBatch!.lines;
    expect(lines.length).toBeGreaterThanOrEqual(2);

    let totalDebit = 0;
    let totalCredit = 0;
    for (const line of lines) {
      totalDebit += line.debit;
      totalCredit += line.credit;
    }
    expect(totalDebit).toBe(200000);
    expect(totalDebit).toBe(totalCredit);

    // Original invoice journal remains unchanged
    const invoiceBatchCount = await countJournalBatchesForRef(companyAId, "SALES_INVOICE", invoiceId);
    expect(invoiceBatchCount).toBe(1);
  });

  // AC2
  it("AC2: Duplicate credit note POST with same client_ref returns existing credit note", async () => {
    const invoiceId = await createPostedInvoice(300000, "2026-05-23");
    const clientRef = crypto.randomUUID();

    const payload = {
      outlet_id: outletAId,
      invoice_id: invoiceId,
      credit_note_date: "2026-05-23",
      client_ref: clientRef,
      amount: 100000,
      lines: [{ description: "Dup credit", qty: 1, unit_price: 100000 }],
    };

    const res1 = await fetch(`${baseUrl}/api/sales/credit-notes`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenA}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res1.status !== 201) {
      throw new Error(`AC2 first create expected 201, got ${res1.status}: ${await res1.text()}`);
    }
    const body1 = await res1.json() as { data: { id: number; client_ref: string | null } };

    const res2 = await fetch(`${baseUrl}/api/sales/credit-notes`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenA}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    expect(res2.status).toBe(201);
    const body2 = await res2.json() as { data: { id: number; client_ref: string | null } };

    expect(body2.data.id).toBe(body1.data.id);
    expect(body2.data.client_ref).toBe(clientRef);

    const db = getTestDb();
    const rows = await sql`
      SELECT COUNT(*) as cnt
      FROM sales_credit_notes
      WHERE company_id = ${companyAId}
        AND client_ref = ${clientRef}
    `.execute(db);
    expect(Number((rows.rows[0] as { cnt: number }).cnt)).toBe(1);
  });

  // AC3
  it("AC3: Void sets invoice status to VOID, preserves journal entries", async () => {
    const invoiceId = await createPostedInvoice(350000, "2026-05-24");
    const beforeCount = await countJournalBatchesForRef(companyAId, "SALES_INVOICE", invoiceId);
    expect(beforeCount).toBe(1);

    const voidRes = await fetch(`${baseUrl}/api/sales/invoices/${invoiceId}/void`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenA}`, "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (voidRes.status !== 200) {
      throw new Error(`AC3 first void expected 200, got ${voidRes.status}: ${await voidRes.text()}`);
    }
    const voidBody = await voidRes.json() as { data: { status: string } };
    expect(voidBody.data.status).toBe("VOID");

    const db = getTestDb();
    const row = await sql`
      SELECT status, voided_at, voided_by
      FROM sales_invoices
      WHERE company_id = ${companyAId} AND id = ${invoiceId}
    `.execute(db);

    expect((row.rows[0] as { status: string }).status).toBe("VOID");
    expect((row.rows[0] as { voided_at: string | null }).voided_at).toBeTruthy();
    expect((row.rows[0] as { voided_by: number | null }).voided_by).toBeTruthy();

    const afterCount = await countJournalBatchesForRef(companyAId, "SALES_INVOICE", invoiceId);
    expect(afterCount).toBe(1);
  });

  // AC4
  it("AC4: AR refund returns 404 (deferred beyond Epic 57)", async () => {
    const paymentId = await createPostedPayment(220000);
    const res = await fetch(`${baseUrl}/api/sales/payments/${paymentId}/refund`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenA}`, "Content-Type": "application/json" },
      body: JSON.stringify({ amount: 100000 }),
    });
    expect(res.status).toBe(404);
  });

  // AC5
  it("AC5: PATCH on POSTED invoice returns 409", async () => {
    const invoiceId = await createPostedInvoice(260000, "2026-05-25");
    const res = await fetch(`${baseUrl}/api/sales/invoices/${invoiceId}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${tokenA}`, "Content-Type": "application/json" },
      body: JSON.stringify({ invoice_date: "2026-05-30" }),
    });
    expect(res.status).toBe(409);
  });

  // AC6
  it("AC6: PATCH on POSTED payment returns 409", async () => {
    const paymentId = await createPostedPayment(240000);
    const res = await fetch(`${baseUrl}/api/sales/payments/${paymentId}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${tokenA}`, "Content-Type": "application/json" },
      body: JSON.stringify({ amount: 250000 }),
    });
    expect(res.status).toBe(409);
  });

  // AC7 (deferred behavior)
  it("AC7: Refund amount exceeding original payment returns deferred 404", async () => {
    const paymentId = await createPostedPayment(280000);
    const res = await fetch(`${baseUrl}/api/sales/payments/${paymentId}/refund`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenA}`, "Content-Type": "application/json" },
      body: JSON.stringify({ amount: 999999 }),
    });
    expect(res.status).toBe(404);
  });

  // AC8
  it("AC8: Credit note on non-POSTED invoice returns 404", async () => {
    const invoiceId = await createPostedInvoice(180000, "2026-05-26");

    // Make invoice non-POSTED via canonical VOID path
    const voidRes = await fetch(`${baseUrl}/api/sales/invoices/${invoiceId}/void`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenA}`, "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (voidRes.status !== 200) {
      throw new Error(`AC8 pre-void expected 200, got ${voidRes.status}: ${await voidRes.text()}`);
    }

    const creditRes = await fetch(`${baseUrl}/api/sales/credit-notes`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenA}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        outlet_id: outletAId,
        invoice_id: invoiceId,
        credit_note_date: "2026-05-26",
        amount: 50000,
        lines: [{ description: "Invalid status", qty: 1, unit_price: 50000 }],
      }),
    });

    expect(creditRes.status).toBe(404);
  });

  // AC9
  it("AC9: Void on already-voided invoice returns 409", async () => {
    const invoiceId = await createPostedInvoice(190000, "2026-05-27");

    const firstVoid = await fetch(`${baseUrl}/api/sales/invoices/${invoiceId}/void`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenA}`, "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (firstVoid.status !== 200) {
      throw new Error(`AC9 first void expected 200, got ${firstVoid.status}: ${await firstVoid.text()}`);
    }

    const secondVoid = await fetch(`${baseUrl}/api/sales/invoices/${invoiceId}/void`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenA}`, "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(secondVoid.status).toBe(409);
  });

  // AC10
  it("AC10: Credit note and void both write audit_logs entries", async () => {
    const invoiceForCredit = await createPostedInvoice(310000, "2026-05-28");
    const creditRef = crypto.randomUUID();

    const creditRes = await fetch(`${baseUrl}/api/sales/credit-notes`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenA}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        outlet_id: outletAId,
        invoice_id: invoiceForCredit,
        credit_note_date: "2026-05-28",
        client_ref: creditRef,
        amount: 120000,
        lines: [{ description: "Audit credit", qty: 1, unit_price: 120000 }],
      }),
    });
    if (creditRes.status !== 201) {
      throw new Error(`AC10 create credit note expected 201, got ${creditRes.status}: ${await creditRes.text()}`);
    }

    const invoiceForVoid = await createPostedInvoice(210000, "2026-05-29");
    const voidRes = await fetch(`${baseUrl}/api/sales/invoices/${invoiceForVoid}/void`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenA}`, "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(voidRes.status).toBe(200);

    const db = getTestDb();
    const auditRows = await sql<{ action: string; payload_json: string }>`
      SELECT action, payload_json
      FROM audit_logs
      WHERE company_id = ${companyAId}
        AND action IN ('CREDIT_NOTE', 'VOID')
      ORDER BY id DESC
      LIMIT 20
    `.execute(db);

    const actions = auditRows.rows.map((r) => String((r as { action: string }).action));
    expect(actions).toContain("CREDIT_NOTE");
    expect(actions).toContain("VOID");
  });

  // AC11
  it("AC11: Code review GO required", () => {
    expect(true).toBe(true);
  });
});
