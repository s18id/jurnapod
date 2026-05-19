// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@/lib/api-client";

export const PURCHASING_INVOICES_API_BASE = "/purchasing/invoices";
export const PURCHASING_INVOICES_DEFAULT_LIMIT = 20;

export const PURCHASE_INVOICE_STATUSES = ["DRAFT", "POSTED", "VOID"] as const;
export type PurchaseInvoiceStatus = (typeof PURCHASE_INVOICE_STATUSES)[number];

export interface PurchaseInvoiceLine {
  id: number;
  line_no: number;
  line_type: string;
  item_id: number | null;
  description: string;
  qty: string;
  unit_price: string;
  line_total: string;
  tax_rate_id: number | null;
  tax_amount: string;
  po_line_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface PurchaseInvoiceSummary {
  id: number;
  company_id: number;
  supplier_id: number;
  supplier_name: string | null;
  invoice_no: string;
  invoice_date: string;
  due_date: string | null;
  reference_number: string | null;
  status: PurchaseInvoiceStatus;
  currency_code: string;
  subtotal: string;
  tax_amount: string;
  grand_total: string;
  notes: string | null;
  journal_batch_id: number | null;
  posted_at: string | null;
  voided_at: string | null;
  created_by_user_id: number | null;
  updated_by_user_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface PurchaseInvoice extends PurchaseInvoiceSummary {
  exchange_rate: string;
  posted_by_user_id: number | null;
  voided_by_user_id: number | null;
  lines: PurchaseInvoiceLine[];
}

export interface PurchaseInvoiceListResult {
  invoices: PurchaseInvoiceSummary[];
  total: number;
  limit: number;
  offset: number;
}

export interface PurchaseInvoiceListParams {
  supplier_id?: string;
  status?: PurchaseInvoiceStatus | "";
  date_from?: string;
  date_to?: string;
  limit: number;
  offset: number;
}

export interface PurchaseInvoiceLineInput {
  item_id?: number | null;
  po_line_id?: number | null;
  description: string;
  qty: string;
  unit_price: string;
  tax_rate_id?: number | null;
  line_type?: "ITEM" | "SERVICE" | "FREIGHT" | "TAX" | "DISCOUNT";
}

export interface PurchaseInvoiceCreateInput {
  supplier_id: number;
  idempotency_key?: string;
  invoice_no: string;
  invoice_date: string;
  due_date?: string | null;
  reference_number?: string | null;
  currency_code?: string;
  exchange_rate?: string;
  notes?: string | null;
  lines: PurchaseInvoiceLineInput[];
  override_reason?: string | null;
}

export interface PurchaseInvoicePostResult {
  id: number;
  journal_batch_id: number;
  warnings: string[];
}

export interface PurchaseInvoiceVoidResult {
  id: number;
  reversal_batch_id: number;
}

export interface PurchaseInvoicePostCompleteResult {
  partial: PurchaseInvoicePostResult;
  invoice: PurchaseInvoice;
}

export interface PurchaseInvoiceVoidCompleteResult {
  partial: PurchaseInvoiceVoidResult;
  invoice: PurchaseInvoice;
}

type PurchaseInvoiceListEnvelope = { success: true; data: PurchaseInvoiceListResult };
type PurchaseInvoiceEnvelope = { success: true; data: PurchaseInvoice };
type PurchaseInvoicePostEnvelope = { success: true; data: PurchaseInvoicePostResult };
type PurchaseInvoiceVoidEnvelope = { success: true; data: PurchaseInvoiceVoidResult };

function normalizeOptionalQueryValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function pageToPurchaseInvoiceOffset(page: number, pageSize: number): number {
  return Math.max(0, page - 1) * pageSize;
}

export function buildPurchaseInvoiceSearchParams(params: PurchaseInvoiceListParams): URLSearchParams {
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

function optionalOverrideBody(overrideReason?: string | null): BodyInit | undefined {
  const trimmed = overrideReason?.trim();
  return trimmed ? JSON.stringify({ override_reason: trimmed }) : undefined;
}

export const purchaseInvoiceQueryKeys = {
  all: ["purchasing", "invoices"] as const,
  list: (params: PurchaseInvoiceListParams) => ["purchasing", "invoices", "list", params] as const,
  detail: (invoiceId: number) => ["purchasing", "invoices", "detail", invoiceId] as const,
};

export async function fetchPurchaseInvoices(params: PurchaseInvoiceListParams): Promise<PurchaseInvoiceListResult> {
  const query = buildPurchaseInvoiceSearchParams(params).toString();
  const response = await apiRequest<PurchaseInvoiceListEnvelope>(`${PURCHASING_INVOICES_API_BASE}?${query}`);
  return response.data;
}

export async function fetchPurchaseInvoice(invoiceId: number): Promise<PurchaseInvoice> {
  const response = await apiRequest<PurchaseInvoiceEnvelope>(`${PURCHASING_INVOICES_API_BASE}/${invoiceId}`);
  return response.data;
}

export async function createPurchaseInvoice(input: PurchaseInvoiceCreateInput): Promise<PurchaseInvoice> {
  const response = await apiRequest<PurchaseInvoiceEnvelope>(PURCHASING_INVOICES_API_BASE, {
    method: "POST",
    body: JSON.stringify(input),
  });
  return response.data;
}

export async function postPurchaseInvoice(input: { invoiceId: number; overrideReason?: string | null }): Promise<PurchaseInvoicePostResult> {
  const response = await apiRequest<PurchaseInvoicePostEnvelope>(`${PURCHASING_INVOICES_API_BASE}/${input.invoiceId}/post`, {
    method: "POST",
    body: optionalOverrideBody(input.overrideReason),
  });
  return response.data;
}

export async function voidPurchaseInvoice(input: { invoiceId: number; overrideReason?: string | null }): Promise<PurchaseInvoiceVoidResult> {
  const response = await apiRequest<PurchaseInvoiceVoidEnvelope>(`${PURCHASING_INVOICES_API_BASE}/${input.invoiceId}/void`, {
    method: "POST",
    body: optionalOverrideBody(input.overrideReason),
  });
  return response.data;
}

export async function postPurchaseInvoiceAndRefetch(input: { invoiceId: number; overrideReason?: string | null }): Promise<PurchaseInvoicePostCompleteResult> {
  const partial = await postPurchaseInvoice(input);
  const invoice = await fetchPurchaseInvoice(input.invoiceId);
  return { partial, invoice };
}

export async function voidPurchaseInvoiceAndRefetch(input: { invoiceId: number; overrideReason?: string | null }): Promise<PurchaseInvoiceVoidCompleteResult> {
  const partial = await voidPurchaseInvoice(input);
  const invoice = await fetchPurchaseInvoice(input.invoiceId);
  return { partial, invoice };
}

export function usePurchaseInvoicesQuery(params: PurchaseInvoiceListParams, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: purchaseInvoiceQueryKeys.list(params),
    queryFn: () => fetchPurchaseInvoices(params),
    enabled: options.enabled ?? true,
    placeholderData: (previousData) => previousData,
  });
}

export function usePurchaseInvoiceQuery(invoiceId: number | null) {
  return useQuery({
    queryKey: invoiceId == null ? purchaseInvoiceQueryKeys.detail(0) : purchaseInvoiceQueryKeys.detail(invoiceId),
    queryFn: () => fetchPurchaseInvoice(Number(invoiceId)),
    enabled: invoiceId != null,
  });
}

export function useCreatePurchaseInvoiceMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createPurchaseInvoice,
    onSuccess: async (invoice) => {
      await queryClient.invalidateQueries({ queryKey: purchaseInvoiceQueryKeys.all });
      await queryClient.invalidateQueries({ queryKey: purchaseInvoiceQueryKeys.detail(invoice.id) });
    },
  });
}

export function usePostPurchaseInvoiceMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: postPurchaseInvoiceAndRefetch,
    onSuccess: async (result) => {
      queryClient.setQueryData(purchaseInvoiceQueryKeys.detail(result.invoice.id), result.invoice);
      await queryClient.invalidateQueries({ queryKey: purchaseInvoiceQueryKeys.all });
    },
  });
}

export function useVoidPurchaseInvoiceMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: voidPurchaseInvoiceAndRefetch,
    onSuccess: async (result) => {
      queryClient.setQueryData(purchaseInvoiceQueryKeys.detail(result.invoice.id), result.invoice);
      await queryClient.invalidateQueries({ queryKey: purchaseInvoiceQueryKeys.all });
    },
  });
}
