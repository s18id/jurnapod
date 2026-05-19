// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@/lib/api-client";

export const PURCHASING_API_BASE = "/purchasing";
export const PURCHASING_ORDERS_DEFAULT_LIMIT = 20;
export const PURCHASING_RECEIPTS_DEFAULT_LIMIT = 20;

export const PURCHASE_ORDER_STATUSES = ["DRAFT", "SENT", "PARTIAL_RECEIVED", "RECEIVED", "CLOSED"] as const;
export type PurchaseOrderStatus = (typeof PURCHASE_ORDER_STATUSES)[number];

export interface PurchaseOrderLine {
  id: number;
  line_no: number;
  item_id: number | null;
  description: string | null;
  qty: string;
  unit_price: string;
  tax_rate: string;
  received_qty: string;
  invoiced_qty?: string;
  line_total: string;
}

export interface PurchaseOrderSummary {
  id: number;
  company_id: number;
  supplier_id: number;
  supplier_name: string | null;
  order_no: string;
  order_date: string;
  status: PurchaseOrderStatus;
  currency_code: string;
  total_amount: string;
  expected_date: string | null;
  notes: string | null;
  created_by_user_id: number | null;
  updated_by_user_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface PurchaseOrder extends Omit<PurchaseOrderSummary, "supplier_name"> {
  supplier_name?: string | null;
  lines: PurchaseOrderLine[];
}

export interface PurchaseOrderListResult {
  orders: PurchaseOrderSummary[];
  total: number;
  limit: number;
  offset: number;
}

export interface PurchaseOrderListParams {
  supplier_id?: string;
  status?: PurchaseOrderStatus | "";
  date_from?: string;
  date_to?: string;
  limit: number;
  offset: number;
}

export interface PurchaseOrderLineInput {
  item_id?: number | null;
  description?: string | null;
  qty: string;
  unit_price: string;
  tax_rate?: string;
}

export interface PurchaseOrderCreateInput {
  supplier_id: number;
  idempotency_key?: string;
  order_date: string;
  currency_code?: string;
  expected_date?: string | null;
  notes?: string | null;
  lines: PurchaseOrderLineInput[];
}

export interface PurchaseOrderUpdateInput {
  expected_date?: string | null;
  notes?: string | null;
  lines?: PurchaseOrderLineInput[];
}

export interface GoodsReceiptLine {
  id: number;
  line_no: number;
  po_line_id: number | null;
  item_id: number | null;
  description: string | null;
  qty: string;
  unit: string | null;
  over_receipt_allowed: boolean | number;
}

export interface GoodsReceiptSummary {
  id: number;
  company_id: number;
  supplier_id: number;
  supplier_name: string | null;
  reference_number: string;
  receipt_date: string;
  status: string;
  notes: string | null;
  created_by_user_id: number | null;
  updated_by_user_id: number | null;
  created_at: string;
  updated_at: string;
  po_reference: string | null;
}

export interface GoodsReceipt extends GoodsReceiptSummary {
  lines: GoodsReceiptLine[];
}

export interface GoodsReceiptListResult {
  receipts: GoodsReceiptSummary[];
  total: number;
  limit: number;
  offset: number;
}

export interface GoodsReceiptListParams {
  supplier_id?: string;
  limit: number;
  offset: number;
}

export interface GoodsReceiptLineInput {
  po_line_id?: number | null;
  item_id?: number | null;
  description?: string | null;
  qty: string;
  unit?: string | null;
}

export interface GoodsReceiptCreateInput {
  supplier_id: number;
  idempotency_key?: string;
  reference_number: string;
  receipt_date: string;
  notes?: string | null;
  lines: GoodsReceiptLineInput[];
}

export interface GoodsReceiptCreateResult {
  receipt: GoodsReceipt;
  warnings: string[];
}

type PurchaseOrderListEnvelope = { success: true; data: PurchaseOrderListResult };
type PurchaseOrderEnvelope = { success: true; data: PurchaseOrder };
type GoodsReceiptListEnvelope = { success: true; data: GoodsReceiptListResult };
type GoodsReceiptEnvelope = { success: true; data: GoodsReceipt; warnings?: string[] };
type GoodsReceiptDataWarningsEnvelope = { success: true; data: GoodsReceipt & { warnings?: string[] }; warnings?: string[] };

function normalizeOptionalQueryValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function pageToPurchasingOffset(page: number, pageSize: number): number {
  return Math.max(0, page - 1) * pageSize;
}

export function buildPurchaseOrderSearchParams(params: PurchaseOrderListParams): URLSearchParams {
  const searchParams = new URLSearchParams();
  searchParams.set("limit", String(params.limit));
  searchParams.set("offset", String(params.offset));

  const supplierId = normalizeOptionalQueryValue(params.supplier_id);
  if (supplierId) searchParams.set("supplier_id", supplierId);
  if (params.status) searchParams.set("status", params.status);

  const dateFrom = normalizeOptionalQueryValue(params.date_from);
  const dateTo = normalizeOptionalQueryValue(params.date_to);
  if (dateFrom) searchParams.set("date_from", dateFrom);
  if (dateTo) searchParams.set("date_to", dateTo);

  return searchParams;
}

export function buildGoodsReceiptSearchParams(params: GoodsReceiptListParams): URLSearchParams {
  const searchParams = new URLSearchParams();
  searchParams.set("limit", String(params.limit));
  searchParams.set("offset", String(params.offset));

  const supplierId = normalizeOptionalQueryValue(params.supplier_id);
  if (supplierId) searchParams.set("supplier_id", supplierId);

  return searchParams;
}

export const purchasingOrderQueryKeys = {
  all: ["purchasing", "orders"] as const,
  list: (params: PurchaseOrderListParams) => ["purchasing", "orders", "list", params] as const,
  detail: (orderId: number) => ["purchasing", "orders", "detail", orderId] as const,
};

export const purchasingReceiptQueryKeys = {
  all: ["purchasing", "receipts"] as const,
  list: (params: GoodsReceiptListParams) => ["purchasing", "receipts", "list", params] as const,
  detail: (receiptId: number) => ["purchasing", "receipts", "detail", receiptId] as const,
};

export async function fetchPurchaseOrders(params: PurchaseOrderListParams): Promise<PurchaseOrderListResult> {
  const query = buildPurchaseOrderSearchParams(params).toString();
  const response = await apiRequest<PurchaseOrderListEnvelope>(`${PURCHASING_API_BASE}/orders?${query}`);
  return response.data;
}

export async function fetchPurchaseOrder(orderId: number): Promise<PurchaseOrder> {
  const response = await apiRequest<PurchaseOrderEnvelope>(`${PURCHASING_API_BASE}/orders/${orderId}`);
  return response.data;
}

export async function createPurchaseOrder(input: PurchaseOrderCreateInput): Promise<PurchaseOrder> {
  const response = await apiRequest<PurchaseOrderEnvelope>(`${PURCHASING_API_BASE}/orders`, {
    method: "POST",
    body: JSON.stringify(input),
  });
  return response.data;
}

export async function updatePurchaseOrder(input: { orderId: number; patch: PurchaseOrderUpdateInput }): Promise<PurchaseOrder> {
  const response = await apiRequest<PurchaseOrderEnvelope>(`${PURCHASING_API_BASE}/orders/${input.orderId}`, {
    method: "PATCH",
    body: JSON.stringify(input.patch),
  });
  return response.data;
}

export async function transitionPurchaseOrderStatus(input: { orderId: number; status: PurchaseOrderStatus }): Promise<PurchaseOrder> {
  const response = await apiRequest<PurchaseOrderEnvelope>(`${PURCHASING_API_BASE}/orders/${input.orderId}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status: input.status }),
  });
  return response.data;
}

export async function fetchGoodsReceipts(params: GoodsReceiptListParams): Promise<GoodsReceiptListResult> {
  const query = buildGoodsReceiptSearchParams(params).toString();
  const response = await apiRequest<GoodsReceiptListEnvelope>(`${PURCHASING_API_BASE}/receipts?${query}`);
  return response.data;
}

export async function fetchGoodsReceipt(receiptId: number): Promise<GoodsReceipt> {
  const response = await apiRequest<GoodsReceiptEnvelope>(`${PURCHASING_API_BASE}/receipts/${receiptId}`);
  return response.data;
}

export async function createGoodsReceipt(input: GoodsReceiptCreateInput): Promise<GoodsReceiptCreateResult> {
  const response = await apiRequest<GoodsReceiptDataWarningsEnvelope>(`${PURCHASING_API_BASE}/receipts`, {
    method: "POST",
    body: JSON.stringify(input),
  });
  const { warnings: dataWarnings, ...receipt } = response.data;
  return { receipt, warnings: response.warnings ?? dataWarnings ?? [] };
}

export function usePurchaseOrdersQuery(params: PurchaseOrderListParams, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: purchasingOrderQueryKeys.list(params),
    queryFn: () => fetchPurchaseOrders(params),
    enabled: options.enabled ?? true,
    placeholderData: (previousData) => previousData,
  });
}

export function usePurchaseOrderQuery(orderId: number | null) {
  return useQuery({
    queryKey: orderId == null ? purchasingOrderQueryKeys.detail(0) : purchasingOrderQueryKeys.detail(orderId),
    queryFn: () => fetchPurchaseOrder(Number(orderId)),
    enabled: orderId != null,
  });
}

export function useGoodsReceiptsQuery(params: GoodsReceiptListParams, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: purchasingReceiptQueryKeys.list(params),
    queryFn: () => fetchGoodsReceipts(params),
    enabled: options.enabled ?? true,
    placeholderData: (previousData) => previousData,
  });
}

export function useGoodsReceiptQuery(receiptId: number | null) {
  return useQuery({
    queryKey: receiptId == null ? purchasingReceiptQueryKeys.detail(0) : purchasingReceiptQueryKeys.detail(receiptId),
    queryFn: () => fetchGoodsReceipt(Number(receiptId)),
    enabled: receiptId != null,
  });
}

export function useCreatePurchaseOrderMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createPurchaseOrder,
    onSuccess: async (order) => {
      await queryClient.invalidateQueries({ queryKey: purchasingOrderQueryKeys.all });
      await queryClient.invalidateQueries({ queryKey: purchasingOrderQueryKeys.detail(order.id) });
    },
  });
}

export function useUpdatePurchaseOrderMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updatePurchaseOrder,
    onSuccess: async (order) => {
      await queryClient.invalidateQueries({ queryKey: purchasingOrderQueryKeys.all });
      await queryClient.invalidateQueries({ queryKey: purchasingOrderQueryKeys.detail(order.id) });
    },
  });
}

export function useTransitionPurchaseOrderStatusMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: transitionPurchaseOrderStatus,
    onSuccess: async (order) => {
      await queryClient.invalidateQueries({ queryKey: purchasingOrderQueryKeys.all });
      await queryClient.invalidateQueries({ queryKey: purchasingOrderQueryKeys.detail(order.id) });
    },
  });
}

export function useCreateGoodsReceiptMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createGoodsReceipt,
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: purchasingReceiptQueryKeys.all });
      await queryClient.invalidateQueries({ queryKey: purchasingReceiptQueryKeys.detail(result.receipt.id) });
      await queryClient.invalidateQueries({ queryKey: purchasingOrderQueryKeys.all });
    },
  });
}
