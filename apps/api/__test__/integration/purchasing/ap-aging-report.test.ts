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
  getOrCreateTestCashierForPermission,
} from "../../fixtures";

// Deterministic code generator for constrained fields
function makeTag(prefix: string, counter: number): string {
  const worker = process.env.VITEST_POOL_ID ?? '0';
  return `${prefix}${worker}${String(counter).padStart(4, '0')}`.slice(0, 20);
}

let baseUrl: string;
let testCompanyId: number;
let ownerToken: string;
let cashierToken: string;
let supplierId: number;
let bankAccountId: number;
let apaTagCounter = 0;

describe("purchasing.ap-aging-report", { timeout: 40000 }, () => {
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

  const createAndPostInvoice = async (
    invoiceNo: string,
    invoiceDate: string,
    amount: string,
    dueDate?: string,
  ): Promise<number> => {
    const createRes = await postJson("/api/purchasing/invoices", ownerToken, {
      supplier_id: supplierId,
      invoice_no: invoiceNo,
      invoice_date: invoiceDate,
      due_date: dueDate,
      currency_code: "IDR",
      notes: `PI ${invoiceNo}`,
      lines: [{ description: `Line ${invoiceNo}`, qty: "1", unit_price: amount, line_type: "SERVICE" }],
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

    const ownerEmail = `ap-aging-owner-${++apaTagCounter}@example.com`;
    const ownerUser = await createTestUser(testCompanyId, {
      email: ownerEmail,
      name: "AP Aging Owner",
      password: "TestPassword123!",
    });

    const ownerRoleId = await getRoleIdByCode("OWNER");
    await assignUserGlobalRole(ownerUser.id, ownerRoleId);

    await setModulePermission(testCompanyId, ownerRoleId, "purchasing", "invoices", 63, { allowSystemRoleMutation: true });
    await setModulePermission(testCompanyId, ownerRoleId, "purchasing", "payments", 63, { allowSystemRoleMutation: true });
    await setModulePermission(testCompanyId, ownerRoleId, "purchasing", "credits", 63, { allowSystemRoleMutation: true });
    await setModulePermission(testCompanyId, ownerRoleId, "purchasing", "reports", 63, { allowSystemRoleMutation: true });

    await createTestPurchasingAccounts(testCompanyId);
    bankAccountId = await createTestBankAccount(testCompanyId, { typeName: "BANK", isActive: true });

    const supplier = await createTestSupplier(testCompanyId, {
      code: makeTag('APASUP', ++apaTagCounter),
      name: "AP Aging Supplier",
      currency: "IDR",
      paymentTermsDays: 30,
    });
    supplierId = supplier.id;

    ownerToken = await loginForTest(baseUrl, company.code, ownerEmail, "TestPassword123!");

    const cashier = await getOrCreateTestCashierForPermission(testCompanyId, company.code, baseUrl);
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
    await releaseReadLock();
  });

  it("returns 401 when no token provided", async () => {
    const res = await getJson("/api/purchasing/reports/ap-aging");
    expect(res.status).toBe(401);
  });

  it("returns 403 when CASHIER requests summary", async () => {
    const res = await getJson("/api/purchasing/reports/ap-aging", cashierToken);
    expect(res.status).toBe(403);
  });

  it("returns 403 when CASHIER requests supplier detail", async () => {
    const res = await getJson(`/api/purchasing/reports/ap-aging/${supplierId}/detail`, cashierToken);
    expect(res.status).toBe(403);
  });

  it("computes AP aging buckets with payment and credit reductions", async () => {
    const invCurrentId = await createAndPostInvoice(makeTag('APACUR', ++apaTagCounter), "2026-03-25", "100.0000");
    const inv1to30Id = await createAndPostInvoice(makeTag('APA130', ++apaTagCounter), "2026-03-11", "100.0000");
    const inv31to60Id = await createAndPostInvoice(makeTag('APA3160', ++apaTagCounter), "2026-02-13", "100.0000");
    const inv61to90Id = await createAndPostInvoice(makeTag('APA6190', ++apaTagCounter), "2026-01-11", "100.0000");
    const invOver90Id = await createAndPostInvoice(makeTag('APA90P', ++apaTagCounter), "2025-12-11", "100.0000");

    const paymentCreate = await postJson("/api/purchasing/payments", ownerToken, {
      payment_date: "2026-04-18",
      bank_account_id: bankAccountId,
      supplier_id: supplierId,
      lines: [{ purchase_invoice_id: inv1to30Id, allocation_amount: "40.0000" }],
    });
    expect(paymentCreate.status).toBe(201);
    const paymentBody = await paymentCreate.json();
    const paymentId = Number(paymentBody.data.id);

    const paymentPost = await postJson(`/api/purchasing/payments/${paymentId}/post`, ownerToken);
    expect(paymentPost.status).toBe(200);

    const creditCreate = await postJson("/api/purchasing/credits", ownerToken, {
      supplier_id: supplierId,
      credit_no: makeTag('APACR', ++apaTagCounter),
      credit_date: "2026-04-18",
      lines: [
        {
          purchase_invoice_id: inv31to60Id,
          description: "AP Aging credit",
          qty: "1",
          unit_price: "10.0000",
          reason: "discount",
        },
      ],
    });
    expect(creditCreate.status).toBe(201);
    const creditBody = await creditCreate.json();
    const creditId = Number(creditBody.data.id);

    const creditApply = await postJson(`/api/purchasing/credits/${creditId}/apply`, ownerToken);
    expect(creditApply.status).toBe(200);

    const asOfDate = "2026-04-19";
    const summaryRes = await getJson(`/api/purchasing/reports/ap-aging?as_of_date=${asOfDate}`, ownerToken);
    expect(summaryRes.status).toBe(200);

    const summaryBody = await summaryRes.json();
    expect(summaryBody.success).toBe(true);
    expect(summaryBody.data.as_of_date).toBe(asOfDate);

    const supplierRow = summaryBody.data.suppliers.find((s: { supplier_id: number }) => s.supplier_id === supplierId);
    expect(supplierRow).toBeTruthy();

    expect(supplierRow.currency).toBe("IDR");
    expect(supplierRow.total_open_amount).toBe("450.0000");
    expect(supplierRow.base_open_amount).toBe("450.0000");
    expect(supplierRow.buckets.current).toBe("100.0000");
    expect(supplierRow.buckets.due_1_30).toBe("60.0000");
    expect(supplierRow.buckets.due_31_60).toBe("90.0000");
    expect(supplierRow.buckets.due_61_90).toBe("100.0000");
    expect(supplierRow.buckets.due_over_90).toBe("100.0000");

    expect(summaryBody.data.grand_totals.base_open_amount).toBe("450.0000");

    const detailRes = await getJson(`/api/purchasing/reports/ap-aging/${supplierId}/detail?as_of_date=${asOfDate}`, ownerToken);
    expect(detailRes.status).toBe(200);

    const detailBody = await detailRes.json();
    expect(detailBody.success).toBe(true);
    expect(detailBody.data.supplier_id).toBe(supplierId);
    expect(detailBody.data.invoices.length).toBeGreaterThanOrEqual(5);

    const byPiId = new Map<number, { balance: string; bucket: string }>(
      detailBody.data.invoices.map((inv: { purchase_invoice_id: number; balance: string; bucket: string }) => [inv.purchase_invoice_id, inv])
    );

    expect(byPiId.get(invCurrentId)?.balance).toBe("100.0000");
    expect(byPiId.get(invCurrentId)?.bucket).toBe("current");

    expect(byPiId.get(inv1to30Id)?.balance).toBe("60.0000");
    expect(byPiId.get(inv1to30Id)?.bucket).toBe("due_1_30");

    expect(byPiId.get(inv31to60Id)?.balance).toBe("90.0000");
    expect(byPiId.get(inv31to60Id)?.bucket).toBe("due_31_60");

    expect(byPiId.get(inv61to90Id)?.balance).toBe("100.0000");
    expect(byPiId.get(inv61to90Id)?.bucket).toBe("due_61_90");

    expect(byPiId.get(invOver90Id)?.balance).toBe("100.0000");
    expect(byPiId.get(invOver90Id)?.bucket).toBe("due_over_90");
  });

  it("uses stored due_date when present for bucket assignment", async () => {
    const invoiceId = await createAndPostInvoice(
      makeTag('APADUE', ++apaTagCounter),
      "2026-03-20",
      "50.0000",
      "2026-04-25",
    );

    const asOfDate = "2026-04-19";
    const detailRes = await getJson(`/api/purchasing/reports/ap-aging/${supplierId}/detail?as_of_date=${asOfDate}`, ownerToken);
    expect(detailRes.status).toBe(200);

    const detailBody = await detailRes.json();
    const invoice = detailBody.data.invoices.find((inv: { purchase_invoice_id: number }) => inv.purchase_invoice_id === invoiceId);

    expect(invoice).toBeTruthy();
    expect(invoice.due_date).toBe("2026-04-25");
    expect(invoice.bucket).toBe("current");
  });
});
