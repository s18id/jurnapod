import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api-client", () => ({ apiRequest: vi.fn() }));

import { apiRequest } from "@/lib/api-client";
import {
  CreditCreateReviewForm,
  CreditVoidReviewForm,
  PaymentCreateReviewForm,
  PaymentVoidReviewForm,
  PurchasingPaymentsCreditsPage,
  creditFormToCreateInput,
  defaultCreditFormData,
  defaultPaymentFormData,
  formatPaymentCreditApiError,
  paymentFormToCreateInput,
  runWithPaymentCreditSubmitLock,
  validateCreditForm,
  validatePaymentForm,
} from "@/features/purchasing/payments-credits";
import {
  PURCHASING_PAYMENTS_CREDITS_DEFAULT_LIMIT,
  applyPurchaseCreditAndRefetch,
  buildPaymentCreditSearchParams,
  createApPayment,
  pageToPaymentCreditOffset,
  paymentCreditQueryKeys,
  postApPaymentAndRefetch,
  voidApPaymentAndRefetch,
  voidPurchaseCreditAndRefetch,
  type ApPayment,
  type ApPaymentListResult,
  type PurchaseCredit,
} from "@/features/purchasing/payments-credits/api";
import type { SessionUser } from "@/lib/session";

const mockedApiRequest = vi.mocked(apiRequest);

function makeUser(permissions: SessionUser["permissions"]): SessionUser {
  return { id: 7, company_id: 42, email: "ap@example.com", roles: ["OWNER"], global_roles: [], outlet_role_assignments: [], outlets: [], permissions };
}

const payment: ApPayment = {
  id: 1,
  company_id: 42,
  payment_no: "PAY-1",
  payment_date: "2026-05-19T00:00:00.000Z",
  bank_account_id: 10,
  supplier_id: 101,
  supplier_name: "Acme",
  description: null,
  status: "DRAFT",
  journal_batch_id: null,
  posted_at: null,
  posted_by_user_id: null,
  voided_at: null,
  voided_by_user_id: null,
  created_by_user_id: 7,
  updated_by_user_id: null,
  created_at: "2026-05-19T00:00:00.000Z",
  updated_at: "2026-05-19T00:00:00.000Z",
  lines: [{ id: 1, line_no: 1, purchase_invoice_id: 9001, allocation_amount: "100.0000", description: null, created_at: "2026-05-19T00:00:00.000Z", updated_at: "2026-05-19T00:00:00.000Z" }],
};

const credit: PurchaseCredit = {
  id: 2,
  company_id: 42,
  supplier_id: 101,
  supplier_name: "Acme",
  credit_no: "CR-1",
  credit_date: "2026-05-19T00:00:00.000Z",
  description: null,
  status: "DRAFT",
  total_credit_amount: "50.0000",
  applied_amount: "0.0000",
  remaining_amount: "50.0000",
  journal_batch_id: null,
  posted_at: null,
  posted_by_user_id: null,
  voided_at: null,
  voided_by_user_id: null,
  created_by_user_id: 7,
  created_at: "2026-05-19T00:00:00.000Z",
  updated_at: "2026-05-19T00:00:00.000Z",
  lines: [{ id: 1, line_no: 1, purchase_invoice_id: 9001, purchase_invoice_line_id: null, item_id: null, description: "Credit", qty: "1.0000", unit_price: "50.0000", line_amount: "50.0000", reason: "return", created_at: "2026-05-19T00:00:00.000Z", updated_at: "2026-05-19T00:00:00.000Z" }],
  applications: [],
};

function renderWithProviders(element: ReactElement, queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })): string {
  return renderToStaticMarkup(createElement(MantineProvider, {}, createElement(QueryClientProvider, { client: queryClient }, element)));
}

describe("Purchasing payments and credits backoffice", () => {
  beforeEach(() => mockedApiRequest.mockReset());

  it("builds supplier/status/date filters and maps payment list envelope", async () => {
    const params = buildPaymentCreditSearchParams({ supplier_id: " 101 ", status: "POSTED", date_from: "2026-05-01", date_to: "2026-05-31", limit: 20, offset: pageToPaymentCreditOffset(2, 20) });
    expect(params.get("supplier_id")).toBe("101");
    expect(params.get("status")).toBe("POSTED");
    expect(params.get("date_from")).toBe("2026-05-01");
    expect(params.get("date_to")).toBe("2026-05-31");
    expect(params.get("offset")).toBe("20");

    const result: ApPaymentListResult = { payments: [payment], total: 1, limit: 20, offset: 20 };
    mockedApiRequest.mockResolvedValueOnce({ success: true, data: payment });
    await createApPayment({ payment_date: "2026-05-19", bank_account_id: 10, supplier_id: 101, lines: [{ purchase_invoice_id: 9001, allocation_amount: "100.0000" }] });
    expect(mockedApiRequest.mock.calls[0]?.[0]).toBe("/purchasing/payments");

    mockedApiRequest.mockResolvedValueOnce({ success: true, data: result });
    const response = await import("@/features/purchasing/payments-credits/api").then((m) => m.fetchApPayments({ supplier_id: "101", status: "POSTED", date_from: "2026-05-01", date_to: "2026-05-31", limit: 20, offset: 20 }));
    expect(response).toEqual(result);
    expect(mockedApiRequest.mock.calls[1]?.[0]).toContain("/purchasing/payments?");
    expect(mockedApiRequest.mock.calls[1]?.[0]).not.toContain("/api/");
  });

  it("validates payment and credit forms and renders ReviewPanel create flows", () => {
    const paymentForm = { ...defaultPaymentFormData, payment_date: "2026-05-19", bank_account_id: "10", supplier_id: "101", lines: [{ ...defaultPaymentFormData.lines[0]!, purchase_invoice_id: "9001", allocation_amount: "100.0000" }] };
    expect(validatePaymentForm({ ...paymentForm, lines: [{ ...paymentForm.lines[0]!, allocation_amount: "0" }] })["lines.0.allocation_amount"]).toContain("greater than zero");
    expect(validatePaymentForm(paymentForm)).toEqual({});
    expect(paymentFormToCreateInput(paymentForm)).toMatchObject({ payment_date: "2026-05-19", bank_account_id: 10, supplier_id: 101 });

    const creditForm = { ...defaultCreditFormData, supplier_id: "101", credit_no: "CR-1", credit_date: "2026-05-19", lines: [{ ...defaultCreditFormData.lines[0]!, qty: "1", unit_price: "50.0000" }] };
    expect(validateCreditForm({ ...creditForm, lines: [{ ...creditForm.lines[0]!, qty: "0" }] })["credit_lines.0.qty"]).toContain("greater than zero");
    expect(validateCreditForm(creditForm)).toEqual({});
    expect(creditFormToCreateInput(creditForm)).toMatchObject({ supplier_id: 101, credit_no: "CR-1", credit_date: "2026-05-19" });

    const html = renderToStaticMarkup(createElement(MantineProvider, {}, createElement(PaymentCreateReviewForm, { data: paymentForm, errors: {}, savedPayment: payment, submitting: false, onChange: () => undefined, onDiscard: () => undefined, onSubmit: async () => true })));
    expect(html).toContain("Create AP payment");
    const creditHtml = renderToStaticMarkup(createElement(MantineProvider, {}, createElement(CreditCreateReviewForm, { data: creditForm, errors: {}, savedCredit: credit, submitting: false, onChange: () => undefined, onDiscard: () => undefined, onSubmit: async () => true })));
    expect(creditHtml).toContain("Create supplier credit");
  });

  it("post/apply helpers call partial endpoints and refetch detail", async () => {
    mockedApiRequest
      .mockResolvedValueOnce({ success: true, data: { id: 1, journal_batch_id: 77 } })
      .mockResolvedValueOnce({ success: true, data: { ...payment, status: "POSTED", journal_batch_id: 77 } })
      .mockResolvedValueOnce({ success: true, data: { id: 2, journal_batch_id: 88, applied_amount: "50.0000", remaining_amount: "0.0000", status: "APPLIED" } })
      .mockResolvedValueOnce({ success: true, data: { ...credit, status: "APPLIED", journal_batch_id: 88, applied_amount: "50.0000", remaining_amount: "0.0000" } });

    const posted = await postApPaymentAndRefetch({ paymentId: 1, overrideReason: "Manager approved" });
    expect(posted.payment.status).toBe("POSTED");
    expect(mockedApiRequest.mock.calls[0]?.[0]).toBe("/purchasing/payments/1/post");
    expect(mockedApiRequest.mock.calls[1]?.[0]).toBe("/purchasing/payments/1");

    const applied = await applyPurchaseCreditAndRefetch({ creditId: 2 });
    expect(applied.credit.status).toBe("APPLIED");
    expect(mockedApiRequest.mock.calls[2]?.[0]).toBe("/purchasing/credits/2/apply");
    expect(mockedApiRequest.mock.calls[3]?.[0]).toBe("/purchasing/credits/2");
  });

  it("void helpers do not submit void_reason and render reversal traces", async () => {
    mockedApiRequest
      .mockResolvedValueOnce({ success: true, data: { id: 1, reversal_batch_id: 78 } })
      .mockResolvedValueOnce({ success: true, data: { ...payment, status: "VOID", voided_at: "2026-05-19T01:00:00.000Z" } })
      .mockResolvedValueOnce({ success: true, data: { id: 2, reversal_batch_id: null } })
      .mockResolvedValueOnce({ success: true, data: { ...credit, status: "VOID", voided_at: "2026-05-19T01:00:00.000Z" } });

    const voidedPayment = await voidApPaymentAndRefetch({ paymentId: 1, overrideReason: "" });
    expect(voidedPayment.payment.status).toBe("VOID");
    expect(String(mockedApiRequest.mock.calls[0]?.[1]?.body ?? "")).not.toContain("void_reason");
    expect(String(mockedApiRequest.mock.calls[0]?.[1]?.body ?? "")).not.toContain("override_reason");
    expect(mockedApiRequest.mock.calls[1]?.[0]).toBe("/purchasing/payments/1");

    const voidedCredit = await voidPurchaseCreditAndRefetch({ creditId: 2 });
    expect(voidedCredit.credit.status).toBe("VOID");
    expect(String(mockedApiRequest.mock.calls[2]?.[1]?.body ?? "")).not.toContain("void_reason");
    expect(mockedApiRequest.mock.calls[3]?.[0]).toBe("/purchasing/credits/2");

    const paymentHtml = renderToStaticMarkup(createElement(MantineProvider, {}, createElement(PaymentVoidReviewForm, { payment: { ...payment, status: "POSTED", journal_batch_id: 77 }, overrideReason: "", trace: voidedPayment, submitting: false, onOverrideReasonChange: () => undefined, onDiscard: () => undefined, onSubmit: async () => true })));
    expect(paymentHtml).toContain("No distinct void_reason is submitted");
    expect(paymentHtml).toContain("I confirm this action is correct and authorized");
    expect(paymentHtml).not.toContain("href=\"#/audit");
    const creditHtml = renderToStaticMarkup(createElement(MantineProvider, {}, createElement(CreditVoidReviewForm, { credit: { ...credit, status: "APPLIED", journal_batch_id: 88 }, overrideReason: "", trace: voidedCredit, submitting: false, onOverrideReasonChange: () => undefined, onDiscard: () => undefined, onSubmit: async () => true })));
    expect(creditHtml).toContain("Reversal batch");
  });

  it("renders PERIOD_CLOSED by status/code without instanceof", () => {
    const message = formatPaymentCreditApiError({ status: 409, code: "PERIOD_CLOSED", message: "Period closed" });
    expect(message).toContain("non-retryable");
    expect(message).toContain("PERIOD_CLOSED");
  });

  it("permission gates hide CREATE/UPDATE/DELETE actions and omits fabricated audit links", () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(paymentCreditQueryKeys.paymentList({ supplier_id: "", status: "", date_from: "", date_to: "", limit: PURCHASING_PAYMENTS_CREDITS_DEFAULT_LIMIT, offset: 0 }), { payments: [payment, { ...payment, id: 3, payment_no: "PAY-3", status: "POSTED", journal_batch_id: 77 }], total: 2, limit: 20, offset: 0 });
    queryClient.setQueryData(paymentCreditQueryKeys.creditList({ supplier_id: "", status: "", date_from: "", date_to: "", limit: PURCHASING_PAYMENTS_CREDITS_DEFAULT_LIMIT, offset: 0 }), { credits: [credit], total: 1, limit: 20, offset: 0 });

    const html = renderWithProviders(createElement(PurchasingPaymentsCreditsPage, { user: makeUser([{ module: "purchasing", resource: "payments", mask: 1 }, { module: "purchasing", resource: "credits", mask: 1 }]) }), queryClient);
    expect(html).toContain("PAY-1");
    expect(html).toContain("CR-1");
    expect(html).not.toContain("New AP payment");
    expect(html).not.toContain("New supplier credit");
    expect(html).not.toContain(">Post<");
    expect(html).not.toContain(">Void<");
    expect(html).not.toContain("href=\"#/audit");
  });

  it("duplicate submit locks prevent multiple calls", async () => {
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => { release = resolve; });
    mockedApiRequest.mockImplementation(async (path: string) => {
      const requestPath = String(path ?? "");
      if (requestPath.endsWith("/post") || requestPath.endsWith("/void") || requestPath === "/purchasing/payments") await blocked;
      if (requestPath.endsWith("/post")) return { success: true, data: { id: 1, journal_batch_id: 77 } };
      if (requestPath.endsWith("/void")) return { success: true, data: { id: 1, reversal_batch_id: 88 } };
      return { success: true, data: payment };
    });

    const lock = { current: false };
    const input = paymentFormToCreateInput({ ...defaultPaymentFormData, payment_date: "2026-05-19", bank_account_id: "10", supplier_id: "101", lines: [{ ...defaultPaymentFormData.lines[0]!, purchase_invoice_id: "9001", allocation_amount: "1" }] });
    const first = runWithPaymentCreditSubmitLock(lock, () => createApPayment(input));
    const second = runWithPaymentCreditSubmitLock(lock, () => createApPayment(input));
    expect(mockedApiRequest.mock.calls.filter(([path]) => path === "/purchasing/payments")).toHaveLength(1);
    release();
    await expect(first).resolves.toMatchObject({ id: 1 });
    await expect(second).resolves.toBeUndefined();
  });
});
