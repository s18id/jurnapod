import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api-client", () => {
  class ApiError extends Error {
    readonly status: number;
    readonly code: string;
    constructor(status: number, code: string, message: string) {
      super(message);
      this.name = "ApiError";
      this.status = status;
      this.code = code;
    }
  }
  return { apiRequest: vi.fn(), ApiError };
});

import { ApiError, apiRequest } from "@/lib/api-client";
import {
  GoodsReceiptReviewForm,
  GoodsReceiptWarningsAlert,
  PurchaseOrderReviewForm,
  PurchasingOrdersPage,
  applyReceiptSuccessEffects,
  goodsReceiptFormToCreateInput,
  isDraftEditable,
  isRefetchAfterMutationError,
  purchaseOrderToReceiptFormData,
  recoverRejectedDraftEdit,
  runWithSubmitLock,
  validateGoodsReceiptForm,
  validatePurchaseOrderForm,
  type PurchaseOrderFormData,
} from "@/features/purchasing/orders-receipts";
import {
  PURCHASING_ORDERS_DEFAULT_LIMIT,
  buildGoodsReceiptSearchParams,
  buildPurchaseOrderSearchParams,
  createGoodsReceipt,
  createPurchaseOrder,
  fetchPurchaseOrder,
  fetchPurchaseOrders,
  pageToPurchasingOffset,
  purchasingOrderQueryKeys,
  transitionPurchaseOrderStatus,
  type PurchaseOrder,
  type PurchaseOrderListResult,
  type PurchaseOrderSummary,
} from "@/features/purchasing/orders-receipts/api";
import type { SessionUser } from "@/lib/session";

const mockedApiRequest = vi.mocked(apiRequest);

function makeUser(permissions: SessionUser["permissions"]): SessionUser {
  return {
    id: 7,
    company_id: 42,
    email: "buyer@example.com",
    roles: ["OWNER"],
    global_roles: [],
    outlet_role_assignments: [],
    outlets: [],
    permissions,
  };
}

const orderSummary: PurchaseOrderSummary = {
  id: 501,
  company_id: 42,
  supplier_id: 101,
  supplier_name: "Acme Supplies",
  order_no: "PO-501",
  order_date: "2026-05-19T00:00:00.000Z",
  status: "DRAFT",
  currency_code: "IDR",
  total_amount: "1500.0000",
  expected_date: null,
  notes: null,
  created_by_user_id: 7,
  updated_by_user_id: null,
  created_at: "2026-05-19T00:00:00.000Z",
  updated_at: "2026-05-19T00:00:00.000Z",
};

const sentOrder: PurchaseOrder = {
  ...orderSummary,
  status: "SENT",
  lines: [
    {
      id: 7001,
      line_no: 1,
      item_id: 3001,
      description: "Flour",
      qty: "10.0000",
      unit_price: "150.0000",
      tax_rate: "0.0000",
      received_qty: "2.0000",
      invoiced_qty: "0.0000",
      line_total: "1500.0000",
    },
  ],
};

function renderWithProviders(element: ReactElement, queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })): string {
  return renderToStaticMarkup(
    createElement(
      MantineProvider,
      {},
      createElement(QueryClientProvider, { client: queryClient }, element),
    ),
  );
}

describe("Purchasing orders and receipts backoffice", () => {
  beforeEach(() => {
    mockedApiRequest.mockReset();
  });

  it("builds PO supplier/status/date params and maps the orders envelope", async () => {
    const params = buildPurchaseOrderSearchParams({
      supplier_id: " 101 ",
      status: "SENT",
      date_from: "2026-05-01",
      date_to: "2026-05-31",
      limit: 20,
      offset: pageToPurchasingOffset(2, 20),
    });
    expect(params.get("supplier_id")).toBe("101");
    expect(params.get("status")).toBe("SENT");
    expect(params.get("date_from")).toBe("2026-05-01");
    expect(params.get("date_to")).toBe("2026-05-31");
    expect(params.get("offset")).toBe("20");

    const result: PurchaseOrderListResult = { orders: [orderSummary], total: 1, limit: 20, offset: 20 };
    mockedApiRequest.mockResolvedValueOnce({ success: true, data: result });
    await expect(fetchPurchaseOrders({ supplier_id: "101", status: "SENT", date_from: "2026-05-01", date_to: "2026-05-31", limit: 20, offset: 20 })).resolves.toEqual(result);
    expect(mockedApiRequest.mock.calls[0]?.[0]).toContain("/purchasing/orders?");
    expect(mockedApiRequest.mock.calls[0]?.[0]).not.toContain("/api/");
  });

  it("does not build receipt date filters", () => {
    const params = buildGoodsReceiptSearchParams({ supplier_id: "101", limit: 20, offset: 0 });
    expect(params.get("supplier_id")).toBe("101");
    expect(params.has("date_from")).toBe(false);
    expect(params.has("date_to")).toBe(false);
  });

  it("uses ReviewPanel for PO create and rejects blank, negative, and zero qty/unit_price", () => {
    const base: PurchaseOrderFormData = {
      supplier_id: "101",
      idempotency_key: "",
      order_date: "2026-05-19",
      currency_code: "IDR",
      expected_date: "",
      notes: "",
      lines: [{ item_id: "", description: "", qty: "1", unit_price: "1.00", tax_rate: "0" }],
    };

    expect(validatePurchaseOrderForm({ ...base, lines: [{ ...base.lines[0]!, qty: "" }] }, "create")["lines.0.qty"]).toContain("greater than zero");
    expect(validatePurchaseOrderForm({ ...base, lines: [{ ...base.lines[0]!, qty: "-1" }] }, "create")["lines.0.qty"]).toContain("greater than zero");
    expect(validatePurchaseOrderForm({ ...base, lines: [{ ...base.lines[0]!, qty: "0" }] }, "create")["lines.0.qty"]).toContain("greater than zero");
    expect(validatePurchaseOrderForm({ ...base, lines: [{ ...base.lines[0]!, unit_price: "" }] }, "create")["lines.0.unit_price"]).toContain("greater than zero");
    expect(validatePurchaseOrderForm({ ...base, lines: [{ ...base.lines[0]!, unit_price: "-1" }] }, "create")["lines.0.unit_price"]).toContain("greater than zero");
    expect(validatePurchaseOrderForm({ ...base, lines: [{ ...base.lines[0]!, unit_price: "0" }] }, "create")["lines.0.unit_price"]).toContain("greater than zero");
    expect(validatePurchaseOrderForm(base, "create")).toEqual({});

    const html = renderToStaticMarkup(createElement(MantineProvider, {}, createElement(PurchaseOrderReviewForm, {
      mode: "create",
      data: base,
      errors: {},
      submitting: false,
      onChange: () => undefined,
      onDiscard: () => undefined,
      onSubmit: async () => true,
    })));
    expect(html).toContain("Create purchase order");
    expect(html).toContain("Final review");
  });

  it("guards rapid duplicate PO create submit so exactly one create request is sent", async () => {
    let releaseCreate!: () => void;
    const createStarted = new Promise<void>((resolve) => { releaseCreate = resolve; });
    mockedApiRequest.mockImplementation(async () => {
      await createStarted;
      return { success: true, data: { ...sentOrder, status: "DRAFT" } };
    });
    const lock = { current: false };
    const payload = {
      supplier_id: 101,
      order_date: "2026-05-19",
      currency_code: "IDR",
      lines: [{ qty: "1", unit_price: "1.00", tax_rate: "0" }],
    };

    const first = runWithSubmitLock(lock, () => createPurchaseOrder(payload));
    const second = runWithSubmitLock(lock, () => createPurchaseOrder(payload));
    expect(mockedApiRequest).toHaveBeenCalledTimes(1);
    expect(mockedApiRequest.mock.calls[0]?.[0]).toBe("/purchasing/orders");
    releaseCreate();
    await expect(first).resolves.toMatchObject({ id: 501 });
    await expect(second).resolves.toBeUndefined();
  });

  it("limits PO edit to DRAFT and identifies stale/current-state refetch errors", () => {
    expect(isDraftEditable(orderSummary)).toBe(true);
    expect(isDraftEditable({ ...orderSummary, status: "SENT" })).toBe(false);
    expect(isRefetchAfterMutationError(new ApiError(400, "INVALID_REQUEST", "Only DRAFT orders can be modified"))).toBe(true);
    expect(isRefetchAfterMutationError(new ApiError(404, "NOT_FOUND", "Purchase order not found"))).toBe(true);
    expect(isRefetchAfterMutationError(new ApiError(403, "FORBIDDEN", "Denied"))).toBe(true);
  });

  it("stale non-DRAFT edit recovery refetches, invalidates, and displays refreshed backend status in modal", async () => {
    const invalidateOrderList = vi.fn().mockResolvedValue(undefined);
    const invalidateOrderDetail = vi.fn().mockResolvedValue(undefined);
    const error = new ApiError(400, "INVALID_REQUEST", "Only DRAFT orders can be modified");
    const recovery = await recoverRejectedDraftEdit({
      error,
      orderId: 501,
      refetchOrder: vi.fn().mockResolvedValue(sentOrder),
      invalidateOrderList,
      invalidateOrderDetail,
    });

    expect(recovery.refreshed?.status).toBe("SENT");
    expect(recovery.saveDisabled).toBe(true);
    expect(recovery.message).toContain("Refreshed backend status: SENT");
    expect(invalidateOrderList).toHaveBeenCalledTimes(1);
    expect(invalidateOrderDetail).toHaveBeenCalledWith(501);

    const html = renderToStaticMarkup(createElement(MantineProvider, {}, createElement(PurchaseOrderReviewForm, {
      mode: "edit",
      data: {
        supplier_id: "101",
        idempotency_key: "",
        order_date: "2026-05-19",
        currency_code: "IDR",
        expected_date: "",
        notes: "",
        lines: [{ item_id: "", description: "", qty: "1", unit_price: "1.00", tax_rate: "0" }],
      },
      errors: {},
      submitError: recovery.message,
      currentStatus: recovery.refreshed?.status,
      saveDisabled: recovery.saveDisabled,
      submitting: false,
      onChange: () => undefined,
      onDiscard: () => undefined,
      onSubmit: async () => true,
    })));
    expect(html).toContain("Current backend PO status: SENT");
    expect(html).toContain("Editing is disabled because only DRAFT purchase orders can be saved");
    expect(html).toContain("Current backend state was refreshed after rejected edit");
  });

  it("renders submit errors inside the modal ReviewPanel context", () => {
    const poHtml = renderToStaticMarkup(createElement(MantineProvider, {}, createElement(PurchaseOrderReviewForm, {
      mode: "create",
      data: {
        supplier_id: "101",
        idempotency_key: "",
        order_date: "2026-05-19",
        currency_code: "IDR",
        expected_date: "",
        notes: "",
        lines: [{ item_id: "", description: "", qty: "1", unit_price: "1.00", tax_rate: "0" }],
      },
      errors: {},
      submitError: "CONFLICT: Duplicate purchase order",
      submitting: false,
      onChange: () => undefined,
      onDiscard: () => undefined,
      onSubmit: async () => true,
    })));
    const receiptHtml = renderToStaticMarkup(createElement(MantineProvider, {}, createElement(GoodsReceiptReviewForm, {
      data: { supplier_id: "101", idempotency_key: "", reference_number: "GR-1", receipt_date: "2026-05-20", notes: "", lines: [{ po_line_id: "7001", item_id: "", description: "", qty: "1", unit: "" }] },
      errors: {},
      submitError: "DUPLICATE_REFERENCE: Receipt reference already exists",
      sourceOrder: sentOrder,
      submitting: false,
      onChange: () => undefined,
      onDiscard: () => undefined,
      onSubmit: async () => true,
    })));

    expect(poHtml).toContain("Create purchase order");
    expect(poHtml).toContain("CONFLICT: Duplicate purchase order");
    expect(receiptHtml).toContain("Create goods receipt");
    expect(receiptHtml).toContain("DUPLICATE_REFERENCE: Receipt reference already exists");
  });

  it("calls PATCH /purchasing/orders/:id/status with backend status body", async () => {
    mockedApiRequest.mockResolvedValueOnce({ success: true, data: { ...sentOrder, status: "SENT" } });
    await transitionPurchaseOrderStatus({ orderId: 501, status: "SENT" });
    expect(mockedApiRequest).toHaveBeenCalledWith("/purchasing/orders/501/status", expect.objectContaining({
      method: "PATCH",
      body: JSON.stringify({ status: "SENT" }),
    }));
  });

  it("prefills receipt from backend PO detail and does not submit condition_notes", async () => {
    mockedApiRequest.mockResolvedValueOnce({ success: true, data: sentOrder });
    const fetched = await fetchPurchaseOrder(501);
    const form = purchaseOrderToReceiptFormData(fetched);
    expect(mockedApiRequest).toHaveBeenCalledWith("/purchasing/orders/501");
    expect(form.supplier_id).toBe("101");
    expect(form.lines[0]?.po_line_id).toBe("7001");

    const input = goodsReceiptFormToCreateInput({ ...form, reference_number: "GR-501", receipt_date: "2026-05-20", lines: [{ ...form.lines[0]!, qty: "3" }] });
    expect(input.lines[0]?.po_line_id).toBe(7001);
    expect(JSON.stringify(input)).not.toContain("condition_notes");

    mockedApiRequest.mockResolvedValueOnce({ success: true, data: { id: 9001, company_id: 42, supplier_id: 101, supplier_name: "Acme Supplies", reference_number: "GR-501", receipt_date: "2026-05-20T00:00:00.000Z", status: "RECEIVED", notes: null, created_by_user_id: 7, updated_by_user_id: null, created_at: "2026-05-20T00:00:00.000Z", updated_at: "2026-05-20T00:00:00.000Z", po_reference: "PO-501", lines: [], warnings: ["Over receipt allowed"] } });
    await createGoodsReceipt(input);
    const [, init] = mockedApiRequest.mock.calls[1] ?? [];
    expect(mockedApiRequest.mock.calls[1]?.[0]).toBe("/purchasing/receipts");
    expect(String(init?.body)).not.toContain("condition_notes");
  });

  it("validates receipt source and rejects blank, negative, and zero quantities", () => {
    const base = { supplier_id: "101", idempotency_key: "", reference_number: "GR-1", receipt_date: "2026-05-20", notes: "", lines: [{ po_line_id: "7001", item_id: "", description: "", qty: "1", unit: "" }] };
    expect(validateGoodsReceiptForm({ ...base, lines: [{ ...base.lines[0]!, po_line_id: "", item_id: "" }] })["lines.0.source"]).toContain("po_line_id or item_id");
    expect(validateGoodsReceiptForm({ ...base, lines: [{ ...base.lines[0]!, qty: "" }] })["lines.0.qty"]).toContain("greater than zero");
    expect(validateGoodsReceiptForm({ ...base, lines: [{ ...base.lines[0]!, qty: "-1" }] })["lines.0.qty"]).toContain("greater than zero");
    expect(validateGoodsReceiptForm({ ...base, lines: [{ ...base.lines[0]!, qty: "0" }] })["lines.0.qty"]).toContain("greater than zero");
    expect(validateGoodsReceiptForm(base)).toEqual({});
  });

  it("surfaces over-receipt warnings", () => {
    const html = renderToStaticMarkup(createElement(MantineProvider, {}, createElement(GoodsReceiptWarningsAlert, { warnings: ["Line 1 exceeds ordered quantity; over receipt allowed."] })));
    expect(html).toContain("Receipt warnings");
    expect(html).toContain("over receipt allowed");
  });

  it("receipt success surfaces warnings and refreshes affected PO list/detail", async () => {
    const warnings: string[] = [];
    const invalidateOrderList = vi.fn().mockResolvedValue(undefined);
    const invalidateOrderDetail = vi.fn().mockResolvedValue(undefined);
    const refetchSelectedOrder = vi.fn().mockResolvedValue(undefined);

    await applyReceiptSuccessEffects({
      warnings: ["Line 1 exceeds ordered quantity; over receipt allowed."],
      sourceOrderId: 501,
      selectedOrderId: 501,
      setWarnings: (nextWarnings) => { warnings.push(...nextWarnings); },
      invalidateOrderList,
      invalidateOrderDetail,
      refetchSelectedOrder,
    });

    expect(warnings).toEqual(["Line 1 exceeds ordered quantity; over receipt allowed."]);
    expect(invalidateOrderList).toHaveBeenCalledTimes(1);
    expect(invalidateOrderDetail).toHaveBeenCalledWith(501);
    expect(refetchSelectedOrder).toHaveBeenCalledTimes(1);
  });

  it("hides create/edit/status/receipt actions when permissions are absent", () => {
    const readOnlyUser = makeUser([{ module: "purchasing", resource: "orders", mask: 1 }]);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(
      purchasingOrderQueryKeys.list({ supplier_id: "", status: "", date_from: "", date_to: "", limit: PURCHASING_ORDERS_DEFAULT_LIMIT, offset: 0 }),
      { orders: [orderSummary], total: 1, limit: 20, offset: 0 },
    );

    const html = renderWithProviders(createElement(PurchasingOrdersPage, { user: readOnlyUser }), queryClient);
    expect(html).toContain("PO-501");
    expect(html).not.toContain("New purchase order");
    expect(html).not.toContain("Edit draft");
    expect(html).not.toContain("Create receipt");
  });
});
