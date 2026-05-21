// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { closeTestDb } from "../../helpers/db";
import { getTestBaseUrl } from "../../helpers/env";
import { acquireReadLock, releaseReadLock } from "../../helpers/setup";
import {
  assignUserGlobalRole,
  assignUserOutletRole,
  createTestAccount,
  createTestCompanyMinimal,
  createTestFiscalYear,
  createTestOutletMinimal,
  createTestPurchasingAccounts,
  createTestUser,
  getOrCreateTestCashierForPermission,
  getRoleIdByCode,
  loginForTest,
  resetFixtureRegistry,
  setModulePermission,
} from "../../fixtures";
import { makeTag } from "../../helpers/tags";
import { getDb } from "@/lib/db";
import { createTestCustomer, createTestSalesInvoice } from "@jurnapod/modules-sales/test-fixtures";
import { createSupplierFixture, createTestPurchaseInvoice } from "@jurnapod/modules-purchasing/test-fixtures";
import { PurchaseInvoiceService } from "@jurnapod/modules-purchasing";

type CsvEndpointCase = {
  name: string;
  path: string;
  filenamePrefix: string;
  expectedHeader: string;
};

const CSV_ENDPOINTS: CsvEndpointCase[] = [
  {
    name: "trial balance",
    path: "/api/reports/trial-balance/export?date_from=2098-01-01&date_to=2098-05-21&format=csv",
    filenamePrefix: "trial-balance-2098-05-21",
    expectedHeader: "account_id,account_code,account_name,total_debit,total_credit,balance",
  },
  {
    name: "general ledger",
    path: "/api/reports/general-ledger/export?date_from=2098-01-01&date_to=2098-05-21&format=csv",
    filenamePrefix: "general-ledger-2098-05-21",
    expectedHeader: "account_id,account_code,account_name,report_group,normal_balance",
  },
  {
    name: "receivables ageing",
    path: "/api/reports/receivables-ageing/export?as_of_date=2098-05-21&format=csv",
    filenamePrefix: "receivables-ageing-2098-05-21",
    expectedHeader: "invoice_id,invoice_no,customer_id,customer_code,customer_display_name",
  },
  {
    name: "AP aging",
    path: "/api/purchasing/reports/ap-aging/export?as_of_date=2098-05-21&format=csv",
    filenamePrefix: "ap-aging-2098-05-21",
    expectedHeader: "supplier_id,supplier_name,currency,total_open_amount,base_open_amount",
  },
];

describe("report CSV export contracts", { timeout: 30000 }, () => {
  let baseUrl: string;
  let ownerToken: string;
  let cashierToken: string;
  let restrictedReportToken: string;
  let outletId: number;
  let outOfScopeOutletId: number;
  let debitAccountCode: string;
  let creditAccountCode: string;
  let customerName: string;
  let supplierName: string;

  const getCsv = async (path: string, token?: string): Promise<Response> => {
    return fetch(`${baseUrl}${path}`, {
      method: "GET",
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
  };

  const getJson = async (path: string, token = ownerToken): Promise<Response> => {
    return fetch(`${baseUrl}${path}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    });
  };

  const postJson = async (path: string, token: string, body?: unknown): Promise<Response> => {
    return fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  };

  beforeAll(async () => {
    await acquireReadLock();
    baseUrl = getTestBaseUrl();

    const tag = makeTag("FRCEXP");
    const company = await createTestCompanyMinimal({ code: tag, name: `Financial CSV ${tag}` });
    const outlet = await createTestOutletMinimal(company.id, { code: makeTag("FRCOUT", 16), name: "Financial CSV Outlet" });
    outletId = outlet.id;
    const otherCompany = await createTestCompanyMinimal({ code: makeTag("FRCOOS", 16), name: "Financial CSV Other" });
    const outOfScopeOutlet = await createTestOutletMinimal(otherCompany.id, { code: makeTag("FRCOOSO", 16), name: "Out of Scope Outlet" });
    outOfScopeOutletId = outOfScopeOutlet.id;

    const ownerEmail = `financial-csv-owner-${tag}@example.com`;
    const ownerUser = await createTestUser(company.id, {
      email: ownerEmail,
      name: "Financial CSV Owner",
      password: "TestPassword123!",
    });
    const ownerRoleId = await getRoleIdByCode("OWNER");
    await assignUserGlobalRole(ownerUser.id, ownerRoleId);
    await assignUserOutletRole(ownerUser.id, ownerRoleId, outlet.id);
    await setModulePermission(company.id, ownerRoleId, "accounting", "reports", 63, { allowSystemRoleMutation: true });
    await setModulePermission(company.id, ownerRoleId, "accounting", "journals", 63, { allowSystemRoleMutation: true });
    await setModulePermission(company.id, ownerRoleId, "purchasing", "reports", 63, { allowSystemRoleMutation: true });

    ownerToken = await loginForTest(baseUrl, company.code, ownerEmail, "TestPassword123!");
    const cashier = await getOrCreateTestCashierForPermission(company.id, company.code, baseUrl);
    cashierToken = cashier.accessToken;

    const restrictedEmail = `financial-csv-restricted-${tag}@example.com`;
    const restrictedUser = await createTestUser(company.id, {
      email: restrictedEmail,
      name: "Financial CSV Restricted Reporter",
      password: "TestPassword123!",
    });
    const accountantRoleId = await getRoleIdByCode("ACCOUNTANT");
    await assignUserOutletRole(restrictedUser.id, accountantRoleId, outlet.id);
    await setModulePermission(company.id, accountantRoleId, "accounting", "reports", 31, { allowSystemRoleMutation: true });
    restrictedReportToken = await loginForTest(baseUrl, company.code, restrictedEmail, "TestPassword123!");

    await createTestFiscalYear(company.id, {
      year: 2098,
      startDate: "2098-01-01",
      endDate: "2098-12-31",
      status: "OPEN",
    });

    const debitAccount = await createTestAccount({
      companyId: company.id,
      code: makeTag("FRCDR", 16),
      name: "CSV Export Debit Account",
      typeName: "ASSET",
    });
    const creditAccount = await createTestAccount({
      companyId: company.id,
      code: makeTag("FRCCR", 16),
      name: "CSV Export Credit Account",
      typeName: "LIABILITY",
    });
    debitAccountCode = debitAccount.code;
    creditAccountCode = creditAccount.code;

    const journalCreate = await postJson("/api/journals", ownerToken, {
      company_id: company.id,
      outlet_id: outlet.id,
      entry_date: "2098-05-21",
      reference: makeTag("FRCJRN", 20),
      description: "Story 69-3-f CSV general ledger line",
      lines: [
        { account_id: debitAccount.id, debit: 321, credit: 0, description: "CSV debit line" },
        { account_id: creditAccount.id, debit: 0, credit: 321, description: "CSV credit line" },
      ],
    });
    expect(journalCreate.status).toBe(201);
    const journalBody = await journalCreate.json();
    const journalPost = await postJson(`/api/journals/${journalBody.data.id}/post`, ownerToken);
    expect(journalPost.status).toBe(200);

    const db = getDb();
    customerName = "CSV Receivable Customer";
    const customer = await createTestCustomer(db, {
      companyId: company.id,
      code: makeTag("FRCCUST", 24),
      name: customerName,
    });
    await createTestSalesInvoice(db, {
      companyId: company.id,
      outletId: outlet.id,
      customerId: customer.id,
      invoiceDate: "2098-03-01",
      dueDate: "2098-04-01",
      totalAmount: 125,
    });

    await createTestPurchasingAccounts(company.id);
    supplierName = "CSV AP Supplier";
    const supplier = await createSupplierFixture(db, {
      companyId: company.id,
      userId: ownerUser.id,
      code: makeTag("FRCAP", 20),
      name: supplierName,
      currency: "IDR",
    });
    const purchaseInvoice = await createTestPurchaseInvoice(db, {
      companyId: company.id,
      userId: ownerUser.id,
      supplierId: supplier.id,
      invoiceNo: makeTag("FRCPI", 20),
      invoiceDate: new Date("2098-04-01T00:00:00.000Z"),
      dueDate: new Date("2098-04-21T00:00:00.000Z"),
      currencyCode: "IDR",
      lines: [{ description: "CSV AP aging line", qty: "1", unitPrice: "250.0000", lineType: "SERVICE" }],
    });
    const purchaseInvoiceService = new PurchaseInvoiceService(db);
    await purchaseInvoiceService.postPI({
      companyId: company.id,
      userId: ownerUser.id,
      piId: purchaseInvoice.id,
      guardrailDecision: null,
      validOverrideReason: null,
    });
  });

  afterAll(async () => {
    resetFixtureRegistry();
    await closeTestDb();
    await releaseReadLock();
  });

  for (const endpoint of CSV_ENDPOINTS) {
    it(`returns 401 for ${endpoint.name} CSV without authentication`, async () => {
      const response = await getCsv(endpoint.path);
      expect(response.status).toBe(401);
    });

    it(`returns 403 for ${endpoint.name} CSV without report permission`, async () => {
      const response = await getCsv(endpoint.path, cashierToken);
      expect(response.status).toBe(403);
    });

    it(`returns CSV attachment for ${endpoint.name}`, async () => {
      const response = await getCsv(endpoint.path, ownerToken);
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("text/csv");
      expect(response.headers.get("content-disposition")).toContain(`filename="${endpoint.filenamePrefix}.csv"`);

      const body = await response.text();
      expect(body).toContain(endpoint.expectedHeader);
    });
  }

  it("exports posted trial balance account rows and totals", async () => {
    const response = await getCsv("/api/reports/trial-balance/export?date_from=2098-01-01&date_to=2098-05-21&format=csv", ownerToken);
    expect(response.status).toBe(200);
    const csv = await response.text();

    expect(csv).toContain(`${debitAccountCode},CSV Export Debit Account,321,0,321`);
    expect(csv).toContain(`${creditAccountCode},CSV Export Credit Account,0,321,-321`);
    expect(csv).toContain(",,TOTAL,");
  });

  it("exports posted general ledger lines", async () => {
    const response = await getCsv("/api/reports/general-ledger/export?date_from=2098-01-01&date_to=2098-05-21&format=csv", ownerToken);
    expect(response.status).toBe(200);
    const csv = await response.text();

    expect(csv).toContain(debitAccountCode);
    expect(csv).toContain("CSV debit line");
  });

  it("exports receivables ageing customer display, bucket, total, and outlet scope", async () => {
    const csvResponse = await getCsv(`/api/reports/receivables-ageing/export?outlet_id=${outletId}&as_of_date=2098-05-21&format=csv`, ownerToken);
    expect(csvResponse.status).toBe(200);
    const csv = await csvResponse.text();
    expect(csv).toContain(customerName);
    expect(csv).toContain("31_60_days");
    expect(csv).toContain(",125,");

    const jsonResponse = await getJson(`/api/reports/receivables-ageing?outlet_id=${outletId}&as_of_date=2098-05-21`);
    expect(jsonResponse.status).toBe(200);
    const jsonBody = await jsonResponse.json();
    expect(jsonBody.data.filters.outlet_ids).toEqual([outletId]);
    expect(jsonBody.data.buckets["31_60_days"]).toBe(125);
    expect(jsonBody.data.total_outstanding).toBe(125);
    expect(jsonBody.data.invoices[0].customer_display_name).toBe(customerName);

    const forbiddenOutlet = await getCsv(`/api/reports/receivables-ageing/export?outlet_id=${outOfScopeOutletId}&as_of_date=2098-05-21&format=csv`, restrictedReportToken);
    expect(forbiddenOutlet.status).toBe(403);
  });

  it("exports AP ageing supplier buckets and grand totals", async () => {
    const response = await getCsv("/api/purchasing/reports/ap-aging/export?as_of_date=2098-05-21&format=csv", ownerToken);
    expect(response.status).toBe(200);
    const csv = await response.text();

    expect(csv).toContain(supplierName);
    expect(csv).toContain("250.0000,250.0000,0.0000,250.0000,0.0000,0.0000,0.0000");
    expect(csv).toContain(",GRAND TOTAL,BASE,,250.0000,0.0000,250.0000,0.0000,0.0000,0.0000");
  });

  it("returns 403 for out-of-scope accounting export outlet", async () => {
    const response = await getCsv(`/api/reports/trial-balance/export?outlet_id=${outOfScopeOutletId}&date_from=2098-01-01&date_to=2098-05-21&format=csv`, restrictedReportToken);
    expect(response.status).toBe(403);
  });

  it("returns 400 for invalid CSV query params", async () => {
    const response = await getCsv("/api/reports/trial-balance/export?date_from=not-a-date&date_to=2098-05-21&format=csv", ownerToken);
    expect(response.status).toBe(400);
  });
});
