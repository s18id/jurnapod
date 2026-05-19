import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api-client", () => ({ apiRequest: vi.fn() }));

import { apiRequest } from "@/lib/api-client";
import {
  InvoiceCreateReviewForm,
  InvoiceDetailDrawer,
  InvoicePostReviewForm,
  InvoiceVoidReviewForm,
  PurchasingInvoicesPage,
  defaultInvoiceFormData,
  formatInvoiceApiError,
  invoiceFormToCreateInput,
  runWithInvoiceSubmitLock,
  validateInvoiceForm,
} from "@/features/purchasing/invoices";
import {
  PURCHASING_INVOICES_DEFAULT_LIMIT,
  buildPurchaseInvoiceSearchParams,
  createPurchaseInvoice,
  fetchPurchaseInvoices,
  pageToPurchaseInvoiceOffset,
  postPurchaseInvoiceAndRefetch,
  purchaseInvoiceQueryKeys,
  voidPurchaseInvoiceAndRefetch,
  type PurchaseInvoice,
  type PurchaseInvoiceListResult,
  type PurchaseInvoiceSummary,
} from "@/features/purchasing/invoices/api";
import type { SessionUser } from "@/lib/session";

const mockedApiRequest = vi.mocked(apiRequest);

function makeUser(permissions: SessionUser["permissions"]): SessionUser {
  return {
    id: 7,
    company_id: 42,
    email: "ap@example.com",
    roles: ["OWNER"],
    global_roles: [],
    outlet_role_assignments: [],
    outlets: [],
    permissions,
  };
}

const invoiceSummary: PurchaseInvoiceSummary = {
  id: 9001,
  company_id: 42,
  supplier_id: 101,
  supplier_name: "Acme Supplies",
  invoice_no: "PI-9001",
  invoice_date: "2026-05-19T00:00:00.000Z",
  due_date: null,
  reference_number: null,
  status: "DRAFT",
  currency_code: "IDR",
  subtotal: "100.0000",
  tax_amount: "0.0000",
  grand_total: "100.0000",
  notes: null,
  journal_batch_id: null,
  posted_at: null,
  voided_at: null,
  created_by_user_id: 7,
  updated_by_user_id: null,
  created_at: "2026-05-19T00:00:00.000Z",
  updated_at: "2026-05-19T00:00:00.000Z",
};

const invoiceDetail: PurchaseInvoice = {
  ...invoiceSummary,
  exchange_rate: "1.00000000",
  posted_by_user_id: null,
  voided_by_user_id: null,
  lines: [{ id: 1, line_no: 1, line_type: "SERVICE", item_id: null, description: "Service", qty: "1.0000", unit_price: "100.0000", line_total: "100.0000", tax_rate_id: null, tax_amount: "0.0000", po_line_id: null, created_at: "2026-05-19T00:00:00.000Z", updated_at: "2026-05-19T00:00:00.000Z" }],
};

function renderWithProviders(element: ReactElement, queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })): string {
  return renderToStaticMarkup(createElement(MantineProvider, {}, createElement(QueryClientProvider, { client: queryClient }, element)));
}

describe("Purchasing invoices backoffice", () => {
  beforeEach(() => {
    mockedApiRequest.mockReset();
  });

  it("builds supplier/status/date filters and maps the invoices envelope", async () => {
    const params = buildPurchaseInvoiceSearchParams({ supplier_id: " 101 ", status: "POSTED", date_from: "2026-05-01", date_to: "2026-05-31", limit: 20, offset: pageToPurchaseInvoiceOffset(2, 20) });
    expect(params.get("supplier_id")).toBe("101");
    expect(params.get("status")).toBe("POSTED");
    expect(params.get("date_from")).toBe("2026-05-01");
    expect(params.get("date_to")).toBe("2026-05-31");
    expect(params.get("offset")).toBe("20");

    const result: PurchaseInvoiceListResult = { invoices: [invoiceSummary], total: 1, limit: 20, offset: 20 };
    mockedApiRequest.mockResolvedValueOnce({ success: true, data: result });
    await expect(fetchPurchaseInvoices({ supplier_id: "101", status: "POSTED", date_from: "2026-05-01", date_to: "2026-05-31", limit: 20, offset: 20 })).resolves.toEqual(result);
    expect(mockedApiRequest.mock.calls[0]?.[0]).toContain("/purchasing/invoices?");
    expect(mockedApiRequest.mock.calls[0]?.[0]).not.toContain("/api/");
  });

  it("uses ReviewPanel for create validation and maps POST body", async () => {
    const base = { ...defaultInvoiceFormData, supplier_id: "101", invoice_no: "PI-1", invoice_date: "2026-05-19", lines: [{ ...defaultInvoiceFormData.lines[0]!, description: "Service", qty: "1", unit_price: "1.00" }] };
    expect(validateInvoiceForm({ ...base, lines: [{ ...base.lines[0]!, qty: "" }] })["lines.0.qty"]).toContain("greater than zero");
    expect(validateInvoiceForm({ ...base, lines: [{ ...base.lines[0]!, qty: "-1" }] })["lines.0.qty"]).toContain("greater than zero");
    expect(validateInvoiceForm({ ...base, lines: [{ ...base.lines[0]!, qty: "0" }] })["lines.0.qty"]).toContain("greater than zero");
    expect(validateInvoiceForm({ ...base, lines: [{ ...base.lines[0]!, unit_price: "" }] })["lines.0.unit_price"]).toContain("greater than zero");
    expect(validateInvoiceForm({ ...base, lines: [{ ...base.lines[0]!, unit_price: "-1" }] })["lines.0.unit_price"]).toContain("greater than zero");
    expect(validateInvoiceForm({ ...base, lines: [{ ...base.lines[0]!, unit_price: "0" }] })["lines.0.unit_price"]).toContain("greater than zero");
    expect(validateInvoiceForm(base)).toEqual({});

    const input = invoiceFormToCreateInput(base);
    expect(input).toMatchObject({ supplier_id: 101, invoice_no: "PI-1", invoice_date: "2026-05-19", currency_code: "IDR" });
    expect(input.lines[0]).toMatchObject({ description: "Service", qty: "1", unit_price: "1.00", line_type: "SERVICE" });

    mockedApiRequest.mockResolvedValueOnce({ success: true, data: invoiceDetail });
    await createPurchaseInvoice(input);
    expect(mockedApiRequest).toHaveBeenCalledWith("/purchasing/invoices", expect.objectContaining({ method: "POST", body: JSON.stringify(input) }));

    const html = renderToStaticMarkup(createElement(MantineProvider, {}, createElement(InvoiceCreateReviewForm, { data: base, errors: {}, savedInvoice: invoiceDetail, submitting: false, onChange: () => undefined, onDiscard: () => undefined, onSubmit: async () => true })));
    expect(html).toContain("Create AP invoice");
    expect(html).toContain("Final review");
    expect(html).toContain("Backend saved DRAFT invoice total 100.0000");
  });

  it("post ReviewPanel calls partial endpoint, displays trace/warnings, then refetches detail", async () => {
    const posted = { ...invoiceDetail, status: "POSTED" as const, journal_batch_id: 77, posted_at: "2026-05-19T01:00:00.000Z" };
    mockedApiRequest
      .mockResolvedValueOnce({ success: true, data: { id: 9001, journal_batch_id: 77, warnings: ["Rounded tax"] } })
      .mockResolvedValueOnce({ success: true, data: posted });

    const result = await postPurchaseInvoiceAndRefetch({ invoiceId: 9001, overrideReason: "Manager approved" });
    expect(result.invoice.status).toBe("POSTED");
    expect(mockedApiRequest.mock.calls[0]?.[0]).toBe("/purchasing/invoices/9001/post");
    expect(mockedApiRequest.mock.calls[0]?.[1]).toMatchObject({ method: "POST", body: JSON.stringify({ override_reason: "Manager approved" }) });
    expect(mockedApiRequest.mock.calls[1]?.[0]).toBe("/purchasing/invoices/9001");

    const html = renderToStaticMarkup(createElement(MantineProvider, {}, createElement(InvoicePostReviewForm, { invoice: invoiceDetail, overrideReason: "", trace: result, submitting: false, onOverrideReasonChange: () => undefined, onDiscard: () => undefined, onSubmit: async () => true })));
    expect(html).toContain("Journal batch 77 created");
    expect(html).toContain("Rounded tax");
  });

  it("void ReviewPanel calls partial endpoint without void_reason, displays reversal trace, then refetches detail", async () => {
    const posted = { ...invoiceDetail, status: "POSTED" as const, journal_batch_id: 77 };
    const voided = { ...posted, status: "VOID" as const, voided_at: "2026-05-19T02:00:00.000Z" };
    mockedApiRequest
      .mockResolvedValueOnce({ success: true, data: { id: 9001, reversal_batch_id: 88 } })
      .mockResolvedValueOnce({ success: true, data: voided });

    const result = await voidPurchaseInvoiceAndRefetch({ invoiceId: 9001, overrideReason: "" });
    expect(result.invoice.status).toBe("VOID");
    expect(mockedApiRequest.mock.calls[0]?.[0]).toBe("/purchasing/invoices/9001/void");
    expect(String(mockedApiRequest.mock.calls[0]?.[1]?.body ?? "")).not.toContain("void_reason");
    expect(mockedApiRequest.mock.calls[1]?.[0]).toBe("/purchasing/invoices/9001");

    const html = renderToStaticMarkup(createElement(MantineProvider, {}, createElement(InvoiceVoidReviewForm, { invoice: posted, overrideReason: "", trace: result, submitting: false, onOverrideReasonChange: () => undefined, onDiscard: () => undefined, onSubmit: async () => true })));
    expect(html).toContain("Reversal batch 88 created");
    expect(html).toContain("No distinct void reason is submitted");
  });

  it("renders 409 PERIOD_CLOSED as non-retryable by status/code without instanceof", () => {
    const message = formatInvoiceApiError({ status: 409, code: "PERIOD_CLOSED", message: "Period closed" });
    expect(message).toContain("non-retryable");
    expect(message).toContain("PERIOD_CLOSED");
  });

  it("omits fabricated audit links when no audit identifier exists", () => {
    const html = renderWithProviders(createElement(PurchasingInvoicesPage, { user: makeUser([{ module: "purchasing", resource: "invoices", mask: 1 }]) }));
    expect(html).toContain("Audit deep-links are unavailable");
    expect(html).not.toContain("href=\"#/audit");
  });

  it("permission gates hide CREATE/UPDATE/DELETE actions", () => {
    const readOnlyUser = makeUser([{ module: "purchasing", resource: "invoices", mask: 1 }]);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(
      purchaseInvoiceQueryKeys.list({ supplier_id: "", status: "", date_from: "", date_to: "", limit: PURCHASING_INVOICES_DEFAULT_LIMIT, offset: 0 }),
      { invoices: [invoiceSummary, { ...invoiceSummary, id: 9002, invoice_no: "PI-9002", status: "POSTED", journal_batch_id: 77 }], total: 2, limit: 20, offset: 0 },
    );

    const html = renderWithProviders(createElement(PurchasingInvoicesPage, { user: readOnlyUser }), queryClient);
    expect(html).toContain("PI-9001");
    expect(html).not.toContain("New AP invoice");
    expect(html).not.toContain(">Post<");
    expect(html).not.toContain(">Void<");
  });

  it("renders backend PO line allocation references in invoice detail", () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(purchaseInvoiceQueryKeys.detail(9001), {
      ...invoiceDetail,
      lines: [{ ...invoiceDetail.lines[0]!, po_line_id: 555 }],
    });

    const html = renderWithProviders(createElement(InvoiceDetailDrawer, {
      opened: true,
      invoiceId: 9001,
      canPost: true,
      canVoid: true,
      onClose: () => undefined,
      onPost: () => undefined,
      onVoid: () => undefined,
    }), queryClient);

    expect(html).toContain("PO line");
    expect(html).toContain("555");
  });

  it("duplicate submit locks prevent multiple create, post, and void calls", async () => {
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => { release = resolve; });
    mockedApiRequest.mockImplementation(async (path: string) => {
      if (path.endsWith("/post") || path.endsWith("/void") || path === "/purchasing/invoices") await blocked;
      if (path.endsWith("/post")) return { success: true, data: { id: 9001, journal_batch_id: 77, warnings: [] } };
      if (path.endsWith("/void")) return { success: true, data: { id: 9001, reversal_batch_id: 88 } };
      return { success: true, data: invoiceDetail };
    });

    const createLock = { current: false };
    const postLock = { current: false };
    const voidLock = { current: false };
    const input = invoiceFormToCreateInput({ ...defaultInvoiceFormData, supplier_id: "101", invoice_no: "PI-1", invoice_date: "2026-05-19", lines: [{ ...defaultInvoiceFormData.lines[0]!, description: "Service", qty: "1", unit_price: "1" }] });

    const createFirst = runWithInvoiceSubmitLock(createLock, () => createPurchaseInvoice(input));
    const createSecond = runWithInvoiceSubmitLock(createLock, () => createPurchaseInvoice(input));
    const postFirst = runWithInvoiceSubmitLock(postLock, () => postPurchaseInvoiceAndRefetch({ invoiceId: 9001 }));
    const postSecond = runWithInvoiceSubmitLock(postLock, () => postPurchaseInvoiceAndRefetch({ invoiceId: 9001 }));
    const voidFirst = runWithInvoiceSubmitLock(voidLock, () => voidPurchaseInvoiceAndRefetch({ invoiceId: 9001 }));
    const voidSecond = runWithInvoiceSubmitLock(voidLock, () => voidPurchaseInvoiceAndRefetch({ invoiceId: 9001 }));

    expect(mockedApiRequest.mock.calls.filter(([path]) => path === "/purchasing/invoices")).toHaveLength(1);
    expect(mockedApiRequest.mock.calls.filter(([path]) => String(path).endsWith("/post"))).toHaveLength(1);
    expect(mockedApiRequest.mock.calls.filter(([path]) => String(path).endsWith("/void"))).toHaveLength(1);
    release();
    await expect(createFirst).resolves.toMatchObject({ id: 9001 });
    await expect(createSecond).resolves.toBeUndefined();
    await expect(postFirst).resolves.toMatchObject({ partial: { journal_batch_id: 77 } });
    await expect(postSecond).resolves.toBeUndefined();
    await expect(voidFirst).resolves.toMatchObject({ partial: { reversal_batch_id: 88 } });
    await expect(voidSecond).resolves.toBeUndefined();
  });
});
