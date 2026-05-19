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
  getOrCreateTestCashierForPermission,
  createTestRole,
} from "../../fixtures";

import { makeTag } from "../../helpers/tags";

let baseUrl: string;
let testCompanyId: number;
let ownerToken: string;
let cashierToken: string;
let updateOnlyCreditToken: string;
let deleteOnlyCreditToken: string;
let supplierId: number;
let pcTagCounter = 0;

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
    await acquireReadLock();
    baseUrl = getTestBaseUrl();

    const company = await createTestCompanyMinimal();
    testCompanyId = company.id;

    const ownerEmail = `pc-owner-${++pcTagCounter}@example.com`;
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
    await setModulePermission(testCompanyId, ownerRoleId, "platform", "roles", 63, {
      allowSystemRoleMutation: true,
    });

    await createTestPurchasingAccounts(testCompanyId);

    const supplier = await createTestSupplier(testCompanyId, {
      code: makeTag('PCSUP', 32),
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

    const updateRole = await createTestRole(baseUrl, ownerToken, "Purchase Credit Update Only");
    await setModulePermission(testCompanyId, updateRole.id, "purchasing", "credits", 4);
    const updateEmail = `pc-update-${++pcTagCounter}@example.com`;
    const updateUser = await createTestUser(testCompanyId, { email: updateEmail, name: "Purchase Credit Update Only", password: "TestPassword123!" });
    await assignUserGlobalRole(updateUser.id, updateRole.id);
    updateOnlyCreditToken = await loginForTest(baseUrl, company.code, updateEmail, "TestPassword123!");

    const deleteRole = await createTestRole(baseUrl, ownerToken, "Purchase Credit Delete Only");
    await setModulePermission(testCompanyId, deleteRole.id, "purchasing", "credits", 8);
    const deleteEmail = `pc-delete-${++pcTagCounter}@example.com`;
    const deleteUser = await createTestUser(testCompanyId, { email: deleteEmail, name: "Purchase Credit Delete Only", password: "TestPassword123!" });
    await assignUserGlobalRole(deleteUser.id, deleteRole.id);
    deleteOnlyCreditToken = await loginForTest(baseUrl, company.code, deleteEmail, "TestPassword123!");
  });

  afterAll(async () => {
    try {
      const db = getTestDb();
      // @fixture-teardown-allowed rationale="cleanup only"
      await sql`
        DELETE pca
        FROM purchase_credit_applications pca
        INNER JOIN purchase_credits pc ON pc.id = pca.purchase_credit_id
        WHERE pc.company_id = ${testCompanyId}
      `.execute(db);
      // @fixture-teardown-allowed rationale="cleanup only"
      await sql`
        DELETE pcl
        FROM purchase_credit_lines pcl
        INNER JOIN purchase_credits pc ON pc.id = pcl.purchase_credit_id
        WHERE pc.company_id = ${testCompanyId}
      `.execute(db);
      // @fixture-teardown-allowed rationale="cleanup only"
      await sql`DELETE FROM purchase_credits WHERE company_id = ${testCompanyId}`.execute(db);

      // @fixture-teardown-allowed rationale="cleanup only"
      await sql`
        DELETE apl
        FROM ap_payment_lines apl
        INNER JOIN ap_payments ap ON ap.id = apl.ap_payment_id
        WHERE ap.company_id = ${testCompanyId}
      `.execute(db);
      // @fixture-teardown-allowed rationale="cleanup only"
      await sql`DELETE FROM ap_payments WHERE company_id = ${testCompanyId}`.execute(db);

      // @fixture-teardown-allowed rationale="cleanup only"
      await sql`DELETE FROM journal_lines WHERE company_id = ${testCompanyId}`.execute(db);
      // @fixture-teardown-allowed rationale="cleanup only"
      await sql`DELETE FROM journal_batches WHERE company_id = ${testCompanyId}`.execute(db);
      // @fixture-teardown-allowed rationale="cleanup only"
      await sql`DELETE FROM purchase_invoice_lines WHERE company_id = ${testCompanyId}`.execute(db);
      // @fixture-teardown-allowed rationale="cleanup only"
      await sql`DELETE FROM purchase_invoices WHERE company_id = ${testCompanyId}`.execute(db);
      // @fixture-teardown-allowed rationale="cleanup only"
      await sql`DELETE FROM accounts WHERE company_id = ${testCompanyId}`.execute(db);
    } catch {
      // ignore cleanup errors
    }

    resetFixtureRegistry();
    await closeTestDb();
    await releaseReadLock();
  });

  it("returns 401 when listing credits without token", async () => {
    const res = await fetch(`${baseUrl}/api/purchasing/credits`, { method: "GET" });
    expect(res.status).toBe(401);
  });

  it("returns 403 when CASHIER lists credits", async () => {
    const res = await getJson("/api/purchasing/credits", cashierToken);
    expect(res.status).toBe(403);
  });

  it.each([
    ['status', 'ARCHIVED'],
    ['date_from', '2026-04-99'],
    ['date_to', 'not-a-date'],
    ['supplier_id', 'abc'],
    ['limit', '0'],
    ['limit', '101'],
    ['offset', '-1'],
  ])('returns 400 INVALID_REQUEST for invalid %s credit filter', async (key, value) => {
    const res = await getJson(`/api/purchasing/credits?${key}=${encodeURIComponent(value)}`, ownerToken);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('INVALID_REQUEST');
  });

  it('accepts credit status labels and date-only filters', async () => {
    for (const status of ['DRAFT', 'PARTIAL', 'APPLIED', 'VOID']) {
      const res = await getJson(`/api/purchasing/credits?status=${status}&date_from=2026-04-01&date_to=2026-04-30`, ownerToken);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body.data.credits)).toBe(true);
    }
  });

  it("returns 403 when CASHIER creates, applies, or voids credits", async () => {
    const createDenied = await postJson("/api/purchasing/credits", cashierToken, {
      supplier_id: supplierId,
      credit_no: makeTag('PCCASH', 32),
      credit_date: "2026-04-19",
      lines: [{ description: "Denied", qty: "1", unit_price: "1.0000", reason: "denied" }],
    });
    expect(createDenied.status).toBe(403);

    const creditRes = await postJson("/api/purchasing/credits", ownerToken, {
      supplier_id: supplierId,
      credit_no: makeTag('PCAUTH', 32),
      credit_date: "2026-04-20",
      lines: [{ description: "Auth", qty: "1", unit_price: "5.0000", reason: "auth" }],
    });
    expect(creditRes.status).toBe(201);
    const creditBody = await creditRes.json();
    const creditId = Number(creditBody.data.id);

    const applyDenied = await postJson(`/api/purchasing/credits/${creditId}/apply`, cashierToken);
    expect(applyDenied.status).toBe(403);

    const voidDenied = await postJson(`/api/purchasing/credits/${creditId}/void`, cashierToken);
    expect(voidDenied.status).toBe(403);
  });

  it("separates UPDATE apply permission from DELETE void permission for credits", async () => {
    const invoiceId = await createAndPostInvoice({ invoiceNo: makeTag('PCACLP1', 32), invoiceDate: "2026-04-20", amount: "10.0000" });
    const creditRes = await postJson("/api/purchasing/credits", ownerToken, {
      supplier_id: supplierId,
      credit_no: makeTag('PCACL1', 32),
      credit_date: "2026-04-20",
      lines: [{ purchase_invoice_id: invoiceId, description: "ACL", qty: "1", unit_price: "5.0000", reason: "acl" }],
    });
    expect(creditRes.status).toBe(201);
    const creditId = Number((await creditRes.json()).data.id);

    const updateApply = await postJson(`/api/purchasing/credits/${creditId}/apply`, updateOnlyCreditToken);
    expect(updateApply.status).toBe(200);
    const updateVoidDenied = await postJson(`/api/purchasing/credits/${creditId}/void`, updateOnlyCreditToken);
    expect(updateVoidDenied.status).toBe(403);

    const deleteInvoiceId = await createAndPostInvoice({ invoiceNo: makeTag('PCACLP2', 32), invoiceDate: "2026-04-20", amount: "10.0000" });
    const deleteCreditRes = await postJson("/api/purchasing/credits", ownerToken, {
      supplier_id: supplierId,
      credit_no: makeTag('PCACL2', 32),
      credit_date: "2026-04-20",
      lines: [{ purchase_invoice_id: deleteInvoiceId, description: "ACL delete", qty: "1", unit_price: "5.0000", reason: "acl" }],
    });
    expect(deleteCreditRes.status).toBe(201);
    const deleteCreditId = Number((await deleteCreditRes.json()).data.id);
    const deleteApplyDenied = await postJson(`/api/purchasing/credits/${deleteCreditId}/apply`, deleteOnlyCreditToken);
    expect(deleteApplyDenied.status).toBe(403);
    const ownerApply = await postJson(`/api/purchasing/credits/${deleteCreditId}/apply`, ownerToken);
    expect(ownerApply.status).toBe(200);
    const deleteVoid = await postJson(`/api/purchasing/credits/${deleteCreditId}/void`, deleteOnlyCreditToken);
    expect(deleteVoid.status).toBe(200);
  });

  it("creates a draft purchase credit and computes total_credit_amount", async () => {
    const res = await postJson("/api/purchasing/credits", ownerToken, {
      supplier_id: supplierId,
      credit_no: makeTag('PCDR', 32),
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

  it("replays concurrent duplicate credit create by idempotency_key without creating duplicates", async () => {
    const invoiceId = await createAndPostInvoice({
      invoiceNo: makeTag('PCPICONC', 32),
      invoiceDate: '2026-04-21',
      amount: '95.0000',
    });

    const idempotencyKey = makeTag('PCCONCIDEM', 32);
    const creditNo = makeTag('PCCONCNO', 32);

    const payload = {
      supplier_id: supplierId,
      idempotency_key: idempotencyKey,
      credit_no: creditNo,
      credit_date: '2026-04-22',
      description: 'Concurrent credit idempotency test',
      lines: [
        {
          purchase_invoice_id: invoiceId,
          description: 'Concurrent credit line',
          qty: '1',
          unit_price: '95.0000',
          reason: 'return',
        },
      ],
    };

    const [res1, res2] = await Promise.all([
      postJson('/api/purchasing/credits', ownerToken, payload),
      postJson('/api/purchasing/credits', ownerToken, payload),
    ]);

    expect(res1.status).toBe(201);
    expect(res2.status).toBe(201);

    const body1 = await res1.json();
    const body2 = await res2.json();

    expect(body1.success).toBe(true);
    expect(body2.success).toBe(true);
    expect(body1.data.id).toBe(body2.data.id);
    expect(body1.data.credit_no).toBe(body2.data.credit_no);

    const idemCount = await sql<{ c: string }>`
      SELECT COUNT(*) as c
      FROM purchase_credits
      WHERE company_id = ${testCompanyId}
        AND idempotency_key = ${idempotencyKey}
    `.execute(getTestDb());
    expect(Number(idemCount.rows[0]?.c ?? 0)).toBe(1);
  });

  it("applies a referenced credit partially when PI open amount is smaller", async () => {
    const invoiceId = await createAndPostInvoice({
      invoiceNo: makeTag('PCPIPART', 32),
      invoiceDate: "2026-04-01",
      amount: "200.0000",
    });

    const createRes = await postJson("/api/purchasing/credits", ownerToken, {
      supplier_id: supplierId,
      credit_no: makeTag('PCPART', 32),
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
      invoiceNo: makeTag('PCPIFIFOA', 32),
      invoiceDate: "2026-04-02",
      amount: "100.0000",
    });

    const secondInvoiceId = await createAndPostInvoice({
      invoiceNo: makeTag('PCPIFIFOB', 32),
      invoiceDate: "2026-04-03",
      amount: "150.0000",
    });

    const createRes = await postJson("/api/purchasing/credits", ownerToken, {
      supplier_id: supplierId,
      credit_no: makeTag('PCFIFO', 32),
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
      invoiceNo: makeTag('PCPIVOID', 32),
      invoiceDate: "2026-04-04",
      amount: "70.0000",
    });

    const createRes = await postJson("/api/purchasing/credits", ownerToken, {
      supplier_id: supplierId,
      credit_no: makeTag('PCVOID', 32),
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

  it("returns OK when voiding an already voided purchase credit (idempotent replay)", async () => {
    const invoiceId = await createAndPostInvoice({
      invoiceNo: makeTag('PCPIIDEM', 32),
      invoiceDate: '2026-04-05',
      amount: '55.0000',
    });

    const createRes = await postJson('/api/purchasing/credits', ownerToken, {
      supplier_id: supplierId,
      idempotency_key: makeTag('PCIDEM', 32),
      credit_no: makeTag('PCVOID2', 32),
      credit_date: '2026-04-20',
      lines: [
        {
          purchase_invoice_id: invoiceId,
          description: 'Idempotent void test',
          qty: '1',
          unit_price: '55.0000',
          reason: 'return',
        },
      ],
    });
    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    const creditId = Number(created.data.id);

    const applyRes = await postJson(`/api/purchasing/credits/${creditId}/apply`, ownerToken);
    expect(applyRes.status).toBe(200);

    const firstVoidRes = await postJson(`/api/purchasing/credits/${creditId}/void`, ownerToken);
    expect(firstVoidRes.status).toBe(200);
    const firstVoidBody = await firstVoidRes.json();
    const firstReversalBatchId = Number(firstVoidBody.data.reversal_batch_id);
    expect(firstReversalBatchId).toBeGreaterThan(0);

    const secondVoidRes = await postJson(`/api/purchasing/credits/${creditId}/void`, ownerToken);
    expect(secondVoidRes.status).toBe(200);
    const secondVoidBody = await secondVoidRes.json();
    expect(Number(secondVoidBody.data.id)).toBe(creditId);
    expect(Number(secondVoidBody.data.reversal_batch_id)).toBe(firstReversalBatchId);

    const batchCount = await sql<{ count: string }>`
      SELECT COUNT(*) as count
      FROM journal_batches
      WHERE company_id = ${testCompanyId}
        AND doc_id = ${creditId}
        AND doc_type = 'PURCHASE_CREDIT_VOID'
    `.execute(getTestDb());

    expect(Number(batchCount.rows[0]?.count ?? 0)).toBe(1);
  });
});
