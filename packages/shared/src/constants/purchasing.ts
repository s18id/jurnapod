// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Purchase order statuses (API labels -> DB tinyint codes)
 *
 * DB storage rule: use TINYINT for status/state columns.
 */
export const PURCHASE_ORDER_STATUS = {
  DRAFT: 1,
  SENT: 2,
  PARTIAL_RECEIVED: 3,
  RECEIVED: 4,
  CLOSED: 5,
} as const;

export const PURCHASE_ORDER_STATUS_LABEL: Record<number, keyof typeof PURCHASE_ORDER_STATUS> = {
  1: "DRAFT",
  2: "SENT",
  3: "PARTIAL_RECEIVED",
  4: "RECEIVED",
  5: "CLOSED",
};

export const PURCHASE_ORDER_STATUS_VALUES = [
  "DRAFT",
  "SENT",
  "PARTIAL_RECEIVED",
  "RECEIVED",
  "CLOSED",
] as const;

export function toPurchaseOrderStatusCode(
  status: string,
): number | undefined {
  return PURCHASE_ORDER_STATUS[status as keyof typeof PURCHASE_ORDER_STATUS];
}

export function toPurchaseOrderStatusLabel(code: number): keyof typeof PURCHASE_ORDER_STATUS {
  return PURCHASE_ORDER_STATUS_LABEL[code] ?? "DRAFT";
}

// =============================================================================
// Purchase Invoice Statuses
// =============================================================================

/**
 * Purchase invoice statuses (API labels -> DB tinyint codes)
 *
 * DB storage rule: use TINYINT for status/state columns.
 * DRAFT=1, POSTED=2, VOID=3
 */
export const PURCHASE_INVOICE_STATUS = {
  DRAFT: 1,
  POSTED: 2,
  VOID: 3,
} as const;

export const PURCHASE_INVOICE_STATUS_LABEL: Record<number, keyof typeof PURCHASE_INVOICE_STATUS> = {
  1: "DRAFT",
  2: "POSTED",
  3: "VOID",
};

export const PURCHASE_INVOICE_STATUS_VALUES = [
  "DRAFT",
  "POSTED",
  "VOID",
] as const;

export function toPurchaseInvoiceStatusCode(
  status: string,
): number | undefined {
  return PURCHASE_INVOICE_STATUS[status as keyof typeof PURCHASE_INVOICE_STATUS];
}

export function toPurchaseInvoiceStatusLabel(code: number): keyof typeof PURCHASE_INVOICE_STATUS {
  return PURCHASE_INVOICE_STATUS_LABEL[code] ?? "DRAFT";
}
