// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Known journal document types used by purchasing flows.
 */
export const PURCHASING_DOC_TYPES = {
  PURCHASE_INVOICE: "PURCHASE_INVOICE",
  PURCHASE_CREDIT: "PURCHASE_CREDIT",
  AP_PAYMENT: "AP_PAYMENT",
} as const;

/**
 * Canonical AP reconciliation transaction types used by drilldown responses.
 */
export const PURCHASING_AP_TRANSACTION_TYPES = [
  "purchase_invoice",
  "purchase_credit",
  "ap_payment",
] as const;

export type PurchasingApTransactionType = (typeof PURCHASING_AP_TRANSACTION_TYPES)[number];

/**
 * Canonical mapping from journal_batches.doc_type (uppercase) to purchasing AP transaction types.
 */
export const DOC_TYPE_TO_PURCHASING_AP_TRANSACTION_TYPE: Readonly<Record<string, PurchasingApTransactionType>> = {
  [PURCHASING_DOC_TYPES.PURCHASE_INVOICE]: "purchase_invoice",
  [PURCHASING_DOC_TYPES.PURCHASE_CREDIT]: "purchase_credit",
  [PURCHASING_DOC_TYPES.AP_PAYMENT]: "ap_payment",
};

/**
 * Generic doc_type normalization for storage/query form.
 * Journal doc_type is stored uppercase.
 */
export function normalizeDocType(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toUpperCase();
  return normalized.length > 0 ? normalized : undefined;
}

/**
 * Backward-compatible alias for journal doc_type normalization.
 */
export function normalizeJournalDocType(value: string | null | undefined): string | undefined {
  return normalizeDocType(value);
}

/**
 * Normalize journal/AP source type values to canonical purchasing transaction type labels.
 * - Accepts uppercase journal `doc_type` values (e.g., PURCHASE_INVOICE)
 * - Accepts already-normalized lowercase values (e.g., purchase_invoice)
 * - Falls back to lowercase passthrough for forward compatibility
 */
export function normalizePurchasingDocType(value: string | null): string | null {
  if (!value) return null;
  const normalized = normalizeDocType(value);
  if (!normalized) return null;
  return DOC_TYPE_TO_PURCHASING_AP_TRANSACTION_TYPE[normalized] ?? value.trim().toLowerCase();
}

