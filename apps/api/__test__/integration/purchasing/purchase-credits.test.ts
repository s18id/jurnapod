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
  getOrCreateTestCashierForPermission,
} from "../../fixtures";

let baseUrl: string;
let testCompanyId: number;
let ownerToken: string;
let cashierToken: string;
let supplierId: number;

describe("purchasing.purchase-credits", { timeout: 30000 }, () => {
  const postJson = async (path: string, token: string, body?: unknown) => {
    const res = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return res;
  };

  const getJson = async (path: string, token: string) => {
    const res = await fetch(`${baseUrl}${path}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });
    return res;
  };

  const createAndPostInvoice = async (args: {
    invoiceNo: string;
    invoiceDate: string;
    amount: string;
  }): Promise<number> => {
    const createRes = await postJson("/api/purchasing/invoices", ownerToken, {
      supplier_id: supplierId,
      invoice_no: args.invoiceNo,
      invoice_date: args.invoiceDate,
      currency_code: "IDR",
      notes: "PI for purchase-credit test",
      lines: [
        {
          description: `Service ${args.invoiceNo}`,
          qty: "1",
          unit_price: args.amount,
          line_type: "SERVICE",
        },
      ],
    });

    expect(createRes.status).toBe(201);
    const createBody = await createRes.json();
    const invoiceId = Number(createBody.data.id);

    const postRes = await postJson(`/api/purchasing/invoices/${invoiceId}/post`, ownerToken);
    expect(postRes.status).toBe(200);

    return invoiceId;
  };

  beforeAll(async () => {
    baseUrl = getTestBaseUrl();

    const company = await createTestCompanyMinimal();
    testCompanyId = company.id;

    const ownerEmail = `pc-owner-${Date.now()}@example.com`;
    const ownerUser = await createTestUser(testCompanyId, {
      email: ownerEmail,
      name: "Purchase Credit Test Owner",
      password: "TestPassword123!",
    });

    const ownerRoleId = await getRoleIdByCode("OWNER");
    await assignUserGlobalRole(ownerUser.id, ownerRoleId);

    await setModulePermission(testCompanyId, ownerRoleId, "purchasing", "invoices", 63, {
      allowSystemRoleMutation: true,
    });
    await setModulePermission(testCompanyId, ownerRoleId, "purchasing", "credits", 63, {
      allowSystemRoleMutation: true,
    });

    await createTestPurchasingAccounts(testCompanyId);

    const supplier = await createTestSupplier(testCompanyId, {
      code: `PC-SUP-${Date.now()}`.slice(0, 20),
      name: "Purchase Credit Test Supplier",
      currency: "IDR",
    });
    supplierId = supplier.id;

    ownerToken = await loginForTest(baseUrl, company.code, ownerEmail, "TestPassword123!");

    const cashier = await getOrCreateTestCashierForPermission(
      testCompanyId,
      company.code,
      baseUrl
    );
    cashierToken = cashier.accessToken;
  });

  afterAll(async () => {
    try {
      const db = getTestDb();
      await sql`
        DELETE pca
        FROM purchase_credit_applications pca
        INNER JOIN purchase_credits pc ON pc.id = pca.purchase_credit_id
        WHERE pc.company_id = ${testCompanyId}
      `.execute(db);
      await sql`
        DELETE pcl
        FROM purchase_credit_lines pcl
        INNER JOIN purchase_credits pc ON pc.id = pcl.purchase_credit_id
        WHERE pc.company_id = ${testCompanyId}
      `.execute(db);
      await sql`DELETE FROM purchase_credits WHERE company_id = ${testCompanyId}`.execute(db);

      await sql`
        DELETE apl
        FROM ap_payment_lines apl
        INNER JOIN ap_payments ap ON ap.id = apl.ap_payment_id
        WHERE ap.company_id = ${testCompanyId}
      `.execute(db);
      await sql`DELETE FROM ap_payments WHERE company_id = ${testCompanyId}`.execute(db);

      await sql`DELETE FROM journal_lines WHERE company_id = ${testCompanyId}`.execute(db);
      await sql`DELETE FROM journal_batches WHERE company_id = ${testCompanyId}`.execute(db);
      await sql`DELETE FROM purchase_invoice_lines WHERE company_id = ${testCompanyId}`.execute(db);
      await sql`DELETE FROM purchase_invoices WHERE company_id = ${testCompanyId}`.execute(db);
      await sql`DELETE FROM accounts WHERE company_id = ${testCompanyId}`.execute(db);
    } catch {
      // ignore cleanup errors
    }

    resetFixtureRegistry();
    await closeTestDb();
  });

  it("returns 401 when listing credits without token", async () => {
    const res = await fetch(`${baseUrl}/api/purchasing/credits`, { method: "GET" });
    expect(res.status).toBe(401);
  });

  it("returns 403 when CASHIER lists credits", async () => {
    const res = await getJson("/api/purchasing/credits", cashierToken);
    expect(res.status).toBe(403);
  });

  it("creates a draft purchase credit and computes total_credit_amount", async () => {
    const res = await postJson("/api/purchasing/credits", ownerToken, {
      supplier_id: supplierId,
      credit_no: `PC-DRAFT-${Date.now()}`,
      credit_date: "2026-04-19",
      description: "Draft credit note",
      lines: [
        { description: "Return A", qty: "2", unit_price: "10.0000", reason: "return" },
        { description: "Discount B", qty: "3", unit_price: "5.0000", reason: "discount" },
      ],
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.status).toBe("DRAFT");
    expect(body.data.total_credit_amount).toBe("35.0000");
    expect(body.data.applied_amount).toBe("0.0000");
    expect(body.data.remaining_amount).toBe("35.0000");
    expect(Array.isArray(body.data.lines)).toBe(true);
    expect(body.data.lines.length).toBe(2);
  });

  it("applies a referenced credit partially when PI open amount is smaller", async () => {
    const invoiceId = await createAndPostInvoice({
      invoiceNo: `PC-PI-PART-${Date.now() % 100000}`,
      invoiceDate: "2026-04-01",
      amount: "200.0000",
    });

    const createRes = await postJson("/api/purchasing/credits", ownerToken, {
      supplier_id: supplierId,
      credit_no: `PC-PART-${Date.now()}`,
      credit_date: "2026-04-19",
      lines: [
        {
          purchase_invoice_id: invoiceId,
          description: "Partial apply test",
          qty: "1",
          unit_price: "500.0000",
          reason: "return",
        },
      ],
    });
    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    const creditId = Number(created.data.id);

    const applyRes = await postJson(`/api/purchasing/credits/${creditId}/apply`, ownerToken);
    expect(applyRes.status).toBe(200);
    const applyBody = await applyRes.json();
    expect(applyBody.data.applied_amount).toBe("200.0000");
    expect(applyBody.data.remaining_amount).toBe("300.0000");
    expect(applyBody.data.status).toBe("PARTIAL");

    const getRes = await getJson(`/api/purchasing/credits/${creditId}`, ownerToken);
    expect(getRes.status).toBe(200);
    const getBody = await getRes.json();
    expect(getBody.data.status).toBe("PARTIAL");
    expect(getBody.data.applied_amount).toBe("200.0000");
    expect(getBody.data.remaining_amount).toBe("300.0000");
    expect(getBody.data.applications.length).toBe(1);
    expect(getBody.data.applications[0].purchase_invoice_id).toBe(invoiceId);
    expect(getBody.data.applications[0].applied_amount).toBe("200.0000");

    const journalRows = await sql<{ debit: string; credit: string }>`
      SELECT jl.debit, jl.credit
      FROM purchase_credits pc
      INNER JOIN journal_lines jl ON jl.journal_batch_id = pc.journal_batch_id
      WHERE pc.id = ${creditId}
        AND pc.company_id = ${testCompanyId}
      ORDER BY jl.id ASC
    `.execute(getTestDb());

    expect(journalRows.rows.length).toBe(2);
    const totalDebit = journalRows.rows.reduce((sum, r) => sum + Number(r.debit), 0);
    const totalCredit = journalRows.rows.reduce((sum, r) => sum + Number(r.credit), 0);
    expect(totalDebit).toBe(200);
    expect(totalCredit).toBe(200);
  });

  it("applies unreferenced credit using FIFO oldest open invoices", async () => {
    const firstInvoiceId = await createAndPostInvoice({
      invoiceNo: `PC-PI-FIFO-A-${Date.now() % 100000}`,
      invoiceDate: "2026-04-02",
      amount: "100.0000",
    });

    const secondInvoiceId = await createAndPostInvoice({
      invoiceNo: `PC-PI-FIFO-B-${Date.now() % 100000}`,
      invoiceDate: "2026-04-03",
      amount: "150.0000",
    });

    const createRes = await postJson("/api/purchasing/credits", ownerToken, {
      supplier_id: supplierId,
      credit_no: `PC-FIFO-${Date.now()}`,
      credit_date: "2026-04-19",
      lines: [
        {
          description: "FIFO allocation",
          qty: "1",
          unit_price: "180.0000",
          reason: "discount",
        },
      ],
    });
    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    const creditId = Number(created.data.id);

    const applyRes = await postJson(`/api/purchasing/credits/${creditId}/apply`, ownerToken);
    expect(applyRes.status).toBe(200);
    const applyBody = await applyRes.json();
    expect(applyBody.data.applied_amount).toBe("180.0000");
    expect(applyBody.data.remaining_amount).toBe("0.0000");
    expect(applyBody.data.status).toBe("APPLIED");

    const getRes = await getJson(`/api/purchasing/credits/${creditId}`, ownerToken);
    expect(getRes.status).toBe(200);
    const getBody = await getRes.json();

    expect(getBody.data.applications.length).toBe(2);
    expect(getBody.data.applications[0].purchase_invoice_id).toBe(firstInvoiceId);
    expect(getBody.data.applications[0].applied_amount).toBe("100.0000");
    expect(getBody.data.applications[1].purchase_invoice_id).toBe(secondInvoiceId);
    expect(getBody.data.applications[1].applied_amount).toBe("80.0000");
  });

  it("voids an applied purchase credit and creates reversal journal", async () => {
    const invoiceId = await createAndPostInvoice({
      invoiceNo: `PC-PI-VOID-${Date.now() % 100000}`,
      invoiceDate: "2026-04-04",
      amount: "70.0000",
    });

    const createRes = await postJson("/api/purchasing/credits", ownerToken, {
      supplier_id: supplierId,
      credit_no: `PC-VOID-${Date.now()}`,
      credit_date: "2026-04-19",
      lines: [
        {
          purchase_invoice_id: invoiceId,
          description: "Void test",
          qty: "1",
          unit_price: "70.0000",
          reason: "return",
        },
      ],
    });
    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    const creditId = Number(created.data.id);

    const applyRes = await postJson(`/api/purchasing/credits/${creditId}/apply`, ownerToken);
    expect(applyRes.status).toBe(200);

    const voidRes = await postJson(`/api/purchasing/credits/${creditId}/void`, ownerToken);
    expect(voidRes.status).toBe(200);
    const voidBody = await voidRes.json();
    expect(voidBody.data.id).toBe(creditId);
    expect(Number(voidBody.data.reversal_batch_id)).toBeGreaterThan(0);

    const getRes = await getJson(`/api/purchasing/credits/${creditId}`, ownerToken);
    expect(getRes.status).toBe(200);
    const getBody = await getRes.json();
    expect(getBody.data.status).toBe("VOID");

    const batchCount = await sql<{ count: string }>`
      SELECT COUNT(*) as count
      FROM journal_batches
      WHERE company_id = ${testCompanyId}
        AND doc_id = ${creditId}
        AND doc_type IN ('PURCHASE_CREDIT', 'PURCHASE_CREDIT_VOID')
    `.execute(getTestDb());

    expect(Number(batchCount.rows[0]?.count ?? 0)).toBe(2);
  });
});
