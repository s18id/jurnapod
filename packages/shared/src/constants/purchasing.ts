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

// =============================================================================
// AP Payment Statuses
// =============================================================================

/**
 * AP payment statuses (API labels -> DB tinyint codes)
 *
 * DB storage rule: use TINYINT for status/state columns.
 * DRAFT=10, POSTED=20, VOID=90
 */
export const AP_PAYMENT_STATUS = {
  DRAFT: 10,
  POSTED: 20,
  VOID: 90,
} as const;

export const AP_PAYMENT_STATUS_LABEL: Record<number, keyof typeof AP_PAYMENT_STATUS> = {
  10: "DRAFT",
  20: "POSTED",
  90: "VOID",
};

export const AP_PAYMENT_STATUS_VALUES = [
  "DRAFT",
  "POSTED",
  "VOID",
] as const;

export function toApPaymentStatusCode(
  status: string,
): number | undefined {
  return AP_PAYMENT_STATUS[status as keyof typeof AP_PAYMENT_STATUS];
}

export function toApPaymentStatusLabel(code: number): keyof typeof AP_PAYMENT_STATUS {
  return AP_PAYMENT_STATUS_LABEL[code] ?? "DRAFT";
}

// =============================================================================
// Purchase Credit Statuses
// =============================================================================

/**
 * Purchase credit statuses (API labels -> DB tinyint codes)
 *
 * DB storage rule: use TINYINT for status/state columns.
 * DRAFT=10, PARTIAL=20, APPLIED=30, VOID=90
 */
export const PURCHASE_CREDIT_STATUS = {
  DRAFT: 10,
  PARTIAL: 20,
  APPLIED: 30,
  VOID: 90,
} as const;

export const PURCHASE_CREDIT_STATUS_LABEL: Record<number, keyof typeof PURCHASE_CREDIT_STATUS> = {
  10: "DRAFT",
  20: "PARTIAL",
  30: "APPLIED",
  90: "VOID",
};

export const PURCHASE_CREDIT_STATUS_VALUES = [
  "DRAFT",
  "PARTIAL",
  "APPLIED",
  "VOID",
] as const;

export function toPurchaseCreditStatusCode(
  status: string,
): number | undefined {
  return PURCHASE_CREDIT_STATUS[status as keyof typeof PURCHASE_CREDIT_STATUS];
}

export function toPurchaseCreditStatusLabel(code: number): keyof typeof PURCHASE_CREDIT_STATUS {
  return PURCHASE_CREDIT_STATUS_LABEL[code] ?? "DRAFT";
}

// =============================================================================
// AP Reconciliation Constants (Epic 47)
// =============================================================================

/**
 * Settings key for AP reconciliation account IDs.
 * Stored in settings_strings table with outlet_id = NULL (company-level).
 */
export const AP_RECONCILIATION_ACCOUNT_IDS_KEY = "ap_reconciliation_account_ids" as const;

/**
 * Creditor/Liability account type names that qualify as AP-control compatible.
 * Used for validating account_ids in AP reconciliation settings.
 */
export const AP_CONTROL_ACCOUNT_TYPE_NAMES = [
  "CREDITOR",
  "CREDITORS",
  "ACCOUNTS_PAYABLE",
  "TRADE_CREDITORS",
  "SUPPLIER_CREDITORS",
  "LIABILITY",
  "CURRENT_LIABILITY",
  "TRADE_LIABILITY",
] as const;

/**
 * Error codes for AP Reconciliation
 */
export const AP_RECONCILIATION_ERROR_CODES = {
  SETTINGS_REQUIRED: "AP_RECONCILIATION_SETTINGS_REQUIRED",
  INVALID_ACCOUNT: "AP_RECONCILIATION_INVALID_ACCOUNT",
  CROSS_TENANT_ACCOUNT: "AP_RECONCILIATION_CROSS_TENANT_ACCOUNT",
  TIMEZONE_REQUIRED: "AP_RECONCILIATION_TIMEZONE_REQUIRED",
} as const;
