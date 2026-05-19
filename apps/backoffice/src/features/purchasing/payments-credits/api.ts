// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@/lib/api-client";
import { purchaseInvoiceQueryKeys } from "@/features/purchasing/invoices/api";

export const PURCHASING_PAYMENTS_API_BASE = "/purchasing/payments";
export const PURCHASING_CREDITS_API_BASE = "/purchasing/credits";
export const PURCHASING_PAYMENTS_CREDITS_DEFAULT_LIMIT = 20;

export const AP_PAYMENT_STATUSES = ["DRAFT", "POSTED", "VOID"] as const;
export type ApPaymentStatus = (typeof AP_PAYMENT_STATUSES)[number];
export const PURCHASE_CREDIT_STATUSES = ["DRAFT", "PARTIAL", "APPLIED", "VOID"] as const;
export type PurchaseCreditStatus = (typeof PURCHASE_CREDIT_STATUSES)[number];

export interface ApPaymentLine {
  id: number;
  line_no: number;
  purchase_invoice_id: number;
  allocation_amount: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface ApPaymentSummary {
  id: number;
  company_id: number;
  payment_no: string;
  payment_date: string;
  bank_account_id: number;
  supplier_id: number;
  supplier_name: string | null;
  description: string | null;
  status: ApPaymentStatus;
  journal_batch_id: number | null;
  posted_at: string | null;
  voided_at: string | null;
  created_by_user_id: number | null;
  updated_by_user_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface ApPayment extends ApPaymentSummary {
  posted_by_user_id: number | null;
  voided_by_user_id: number | null;
  lines: ApPaymentLine[];
}

export interface ApPaymentListResult {
  payments: ApPaymentSummary[];
  total: number;
  limit: number;
  offset: number;
}

export interface PurchaseCreditLine {
  id: number;
  line_no: number;
  purchase_invoice_id: number | null;
  purchase_invoice_line_id: number | null;
  item_id: number | null;
  description: string | null;
  qty: string;
  unit_price: string;
  line_amount: string;
  reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface PurchaseCreditApplication {
  id: number;
  purchase_credit_line_id: number;
  purchase_invoice_id: number;
  applied_amount: string;
  applied_at: string;
  created_at: string;
}

export interface PurchaseCreditSummary {
  id: number;
  company_id: number;
  supplier_id: number;
  supplier_name: string | null;
  credit_no: string;
  credit_date: string;
  description: string | null;
  status: PurchaseCreditStatus;
  total_credit_amount: string;
  applied_amount: string;
  remaining_amount: string;
  journal_batch_id: number | null;
  posted_at: string | null;
  voided_at: string | null;
  created_by_user_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface PurchaseCredit extends PurchaseCreditSummary {
  posted_by_user_id: number | null;
  voided_by_user_id: number | null;
  lines: PurchaseCreditLine[];
  applications: PurchaseCreditApplication[];
}

export interface PurchaseCreditListResult {
  credits: PurchaseCreditSummary[];
  total: number;
  limit: number;
  offset: number;
}

export interface PaymentCreditListParams<TStatus extends string> {
  supplier_id?: string;
  status?: TStatus | "";
  date_from?: string;
  date_to?: string;
  limit: number;
  offset: number;
}

export interface ApPaymentCreateInput {
  idempotency_key?: string;
  payment_date: string;
  bank_account_id: number;
  supplier_id: number;
  description?: string | null;
  lines: Array<{ purchase_invoice_id: number; allocation_amount: string; description?: string | null; full_settlement?: boolean }>;
  override_reason?: string | null;
}

export interface PurchaseCreditCreateInput {
  supplier_id: number;
  idempotency_key?: string;
  credit_no: string;
  credit_date: string;
  description?: string | null;
  lines: Array<{ purchase_invoice_id?: number | null; purchase_invoice_line_id?: number | null; item_id?: number | null; description?: string | null; qty: string; unit_price: string; reason?: string | null }>;
  override_reason?: string | null;
}

export interface ApPaymentPostResult { id: number; journal_batch_id: number }
export interface ApPaymentVoidResult { id: number; reversal_batch_id: number }
export interface PurchaseCreditApplyResult { id: number; journal_batch_id: number; applied_amount: string; remaining_amount: string; status: "PARTIAL" | "APPLIED" }
export interface PurchaseCreditVoidResult { id: number; reversal_batch_id: number | null }

export interface ApPaymentPostCompleteResult { partial: ApPaymentPostResult; payment: ApPayment }
export interface ApPaymentVoidCompleteResult { partial: ApPaymentVoidResult; payment: ApPayment }
export interface PurchaseCreditApplyCompleteResult { partial: PurchaseCreditApplyResult; credit: PurchaseCredit }
export interface PurchaseCreditVoidCompleteResult { partial: PurchaseCreditVoidResult; credit: PurchaseCredit }

type ApPaymentListEnvelope = { success: true; data: ApPaymentListResult };
type ApPaymentEnvelope = { success: true; data: ApPayment };
type ApPaymentPostEnvelope = { success: true; data: ApPaymentPostResult };
type ApPaymentVoidEnvelope = { success: true; data: ApPaymentVoidResult };
type PurchaseCreditListEnvelope = { success: true; data: PurchaseCreditListResult };
type PurchaseCreditEnvelope = { success: true; data: PurchaseCredit };
type PurchaseCreditApplyEnvelope = { success: true; data: PurchaseCreditApplyResult };
type PurchaseCreditVoidEnvelope = { success: true; data: PurchaseCreditVoidResult };

function normalizeOptionalQueryValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function pageToPaymentCreditOffset(page: number, pageSize: number): number {
  return Math.max(0, page - 1) * pageSize;
}

export function buildPaymentCreditSearchParams<TStatus extends string>(params: PaymentCreditListParams<TStatus>): URLSearchParams {
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

export const paymentCreditQueryKeys = {
  all: ["purchasing", "payments-credits"] as const,
  payments: ["purchasing", "payments"] as const,
  credits: ["purchasing", "credits"] as const,
  paymentList: (params: PaymentCreditListParams<ApPaymentStatus>) => ["purchasing", "payments", "list", params] as const,
  creditList: (params: PaymentCreditListParams<PurchaseCreditStatus>) => ["purchasing", "credits", "list", params] as const,
  paymentDetail: (id: number) => ["purchasing", "payments", "detail", id] as const,
  creditDetail: (id: number) => ["purchasing", "credits", "detail", id] as const,
};

export async function fetchApPayments(params: PaymentCreditListParams<ApPaymentStatus>): Promise<ApPaymentListResult> {
  const query = buildPaymentCreditSearchParams(params).toString();
  const response = await apiRequest<ApPaymentListEnvelope>(`${PURCHASING_PAYMENTS_API_BASE}?${query}`);
  return response.data;
}

export async function fetchApPayment(id: number): Promise<ApPayment> {
  const response = await apiRequest<ApPaymentEnvelope>(`${PURCHASING_PAYMENTS_API_BASE}/${id}`);
  return response.data;
}

export async function createApPayment(input: ApPaymentCreateInput): Promise<ApPayment> {
  const response = await apiRequest<ApPaymentEnvelope>(PURCHASING_PAYMENTS_API_BASE, { method: "POST", body: JSON.stringify(input) });
  return response.data;
}

export async function postApPayment(input: { paymentId: number; overrideReason?: string | null }): Promise<ApPaymentPostResult> {
  const response = await apiRequest<ApPaymentPostEnvelope>(`${PURCHASING_PAYMENTS_API_BASE}/${input.paymentId}/post`, { method: "POST", body: optionalOverrideBody(input.overrideReason) });
  return response.data;
}

export async function voidApPayment(input: { paymentId: number; overrideReason?: string | null }): Promise<ApPaymentVoidResult> {
  const response = await apiRequest<ApPaymentVoidEnvelope>(`${PURCHASING_PAYMENTS_API_BASE}/${input.paymentId}/void`, { method: "POST", body: optionalOverrideBody(input.overrideReason) });
  return response.data;
}

export async function postApPaymentAndRefetch(input: { paymentId: number; overrideReason?: string | null }): Promise<ApPaymentPostCompleteResult> {
  const partial = await postApPayment(input);
  const payment = await fetchApPayment(input.paymentId);
  return { partial, payment };
}

export async function voidApPaymentAndRefetch(input: { paymentId: number; overrideReason?: string | null }): Promise<ApPaymentVoidCompleteResult> {
  const partial = await voidApPayment(input);
  const payment = await fetchApPayment(input.paymentId);
  return { partial, payment };
}

export async function fetchPurchaseCredits(params: PaymentCreditListParams<PurchaseCreditStatus>): Promise<PurchaseCreditListResult> {
  const query = buildPaymentCreditSearchParams(params).toString();
  const response = await apiRequest<PurchaseCreditListEnvelope>(`${PURCHASING_CREDITS_API_BASE}?${query}`);
  return response.data;
}

export async function fetchPurchaseCredit(id: number): Promise<PurchaseCredit> {
  const response = await apiRequest<PurchaseCreditEnvelope>(`${PURCHASING_CREDITS_API_BASE}/${id}`);
  return response.data;
}

export async function createPurchaseCredit(input: PurchaseCreditCreateInput): Promise<PurchaseCredit> {
  const response = await apiRequest<PurchaseCreditEnvelope>(PURCHASING_CREDITS_API_BASE, { method: "POST", body: JSON.stringify(input) });
  return response.data;
}

export async function applyPurchaseCredit(input: { creditId: number; overrideReason?: string | null }): Promise<PurchaseCreditApplyResult> {
  const response = await apiRequest<PurchaseCreditApplyEnvelope>(`${PURCHASING_CREDITS_API_BASE}/${input.creditId}/apply`, { method: "POST", body: optionalOverrideBody(input.overrideReason) });
  return response.data;
}

export async function voidPurchaseCredit(input: { creditId: number; overrideReason?: string | null }): Promise<PurchaseCreditVoidResult> {
  const response = await apiRequest<PurchaseCreditVoidEnvelope>(`${PURCHASING_CREDITS_API_BASE}/${input.creditId}/void`, { method: "POST", body: optionalOverrideBody(input.overrideReason) });
  return response.data;
}

export async function applyPurchaseCreditAndRefetch(input: { creditId: number; overrideReason?: string | null }): Promise<PurchaseCreditApplyCompleteResult> {
  const partial = await applyPurchaseCredit(input);
  const credit = await fetchPurchaseCredit(input.creditId);
  return { partial, credit };
}

export async function voidPurchaseCreditAndRefetch(input: { creditId: number; overrideReason?: string | null }): Promise<PurchaseCreditVoidCompleteResult> {
  const partial = await voidPurchaseCredit(input);
  const credit = await fetchPurchaseCredit(input.creditId);
  return { partial, credit };
}

export function useApPaymentsQuery(params: PaymentCreditListParams<ApPaymentStatus>, options: { enabled?: boolean } = {}) {
  return useQuery({ queryKey: paymentCreditQueryKeys.paymentList(params), queryFn: () => fetchApPayments(params), enabled: options.enabled ?? true, placeholderData: (previous) => previous });
}

export function usePurchaseCreditsQuery(params: PaymentCreditListParams<PurchaseCreditStatus>, options: { enabled?: boolean } = {}) {
  return useQuery({ queryKey: paymentCreditQueryKeys.creditList(params), queryFn: () => fetchPurchaseCredits(params), enabled: options.enabled ?? true, placeholderData: (previous) => previous });
}

export function useCreateApPaymentMutation() {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: createApPayment, onSuccess: async (payment) => { await queryClient.invalidateQueries({ queryKey: paymentCreditQueryKeys.payments }); await queryClient.invalidateQueries({ queryKey: paymentCreditQueryKeys.paymentDetail(payment.id) }); } });
}

export function usePostApPaymentMutation() {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: postApPaymentAndRefetch, onSuccess: async (result) => { queryClient.setQueryData(paymentCreditQueryKeys.paymentDetail(result.payment.id), result.payment); await queryClient.invalidateQueries({ queryKey: paymentCreditQueryKeys.payments }); await queryClient.invalidateQueries({ queryKey: paymentCreditQueryKeys.credits }); await queryClient.invalidateQueries({ queryKey: purchaseInvoiceQueryKeys.all }); } });
}

export function useVoidApPaymentMutation() {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: voidApPaymentAndRefetch, onSuccess: async (result) => { queryClient.setQueryData(paymentCreditQueryKeys.paymentDetail(result.payment.id), result.payment); await queryClient.invalidateQueries({ queryKey: paymentCreditQueryKeys.payments }); await queryClient.invalidateQueries({ queryKey: paymentCreditQueryKeys.credits }); await queryClient.invalidateQueries({ queryKey: purchaseInvoiceQueryKeys.all }); } });
}

export function useCreatePurchaseCreditMutation() {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: createPurchaseCredit, onSuccess: async (credit) => { await queryClient.invalidateQueries({ queryKey: paymentCreditQueryKeys.credits }); await queryClient.invalidateQueries({ queryKey: paymentCreditQueryKeys.creditDetail(credit.id) }); } });
}

export function useApplyPurchaseCreditMutation() {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: applyPurchaseCreditAndRefetch, onSuccess: async (result) => { queryClient.setQueryData(paymentCreditQueryKeys.creditDetail(result.credit.id), result.credit); await queryClient.invalidateQueries({ queryKey: paymentCreditQueryKeys.credits }); await queryClient.invalidateQueries({ queryKey: paymentCreditQueryKeys.payments }); await queryClient.invalidateQueries({ queryKey: purchaseInvoiceQueryKeys.all }); } });
}

export function useVoidPurchaseCreditMutation() {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: voidPurchaseCreditAndRefetch, onSuccess: async (result) => { queryClient.setQueryData(paymentCreditQueryKeys.creditDetail(result.credit.id), result.credit); await queryClient.invalidateQueries({ queryKey: paymentCreditQueryKeys.credits }); await queryClient.invalidateQueries({ queryKey: paymentCreditQueryKeys.payments }); await queryClient.invalidateQueries({ queryKey: purchaseInvoiceQueryKeys.all }); } });
}
