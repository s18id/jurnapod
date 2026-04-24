// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Purchase Credit types for purchasing module.
 */

import type { KyselySchema } from "@jurnapod/db";
import type { PurchaseCreditApplicationResponse, PurchaseCreditLineResponse } from "@jurnapod/shared";
import type { GuardrailDecision } from "./guardrail.js";

// =============================================================================
// Error Types
// =============================================================================

export class PurchaseCreditError extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "PurchaseCreditError";
  }
}

export class PurchaseCreditNotFoundError extends PurchaseCreditError {
  constructor(creditId: number) {
    super("PURCHASE_CREDIT_NOT_FOUND", `Purchase credit ${creditId} not found`);
  }
}

export class PurchaseCreditInvalidStatusTransitionError extends PurchaseCreditError {
  constructor(fromStatus: number, toStatus: number) {
    super(
      "INVALID_STATUS_TRANSITION",
      `Cannot transition purchase credit from status ${fromStatus} to ${toStatus}`
    );
  }
}

export class PurchaseCreditSupplierInactiveError extends PurchaseCreditError {
  constructor(supplierId: number) {
    super("SUPPLIER_INACTIVE", `Supplier ${supplierId} is inactive`);
  }
}

export class PurchaseCreditInvoiceNotFoundError extends PurchaseCreditError {
  constructor(invoiceId: number) {
    super("INVOICE_NOT_FOUND", `Purchase invoice ${invoiceId} not found or not accessible`);
  }
}

export class PurchaseCreditInvoiceNotPostedError extends PurchaseCreditError {
  constructor(invoiceId: number, status: number) {
    super(
      "INVOICE_NOT_POSTED",
      `Purchase invoice ${invoiceId} must be POSTED but has status ${status}`
    );
  }
}

export class PurchaseCreditInvoiceSupplierMismatchError extends PurchaseCreditError {
  constructor(invoiceId: number, expectedSupplierId: number, actualSupplierId: number) {
    super(
      "INVOICE_SUPPLIER_MISMATCH",
      `Purchase invoice ${invoiceId} belongs to supplier ${actualSupplierId}, expected ${expectedSupplierId}`
    );
  }
}

export class PurchaseCreditMissingAPAccountError extends PurchaseCreditError {
  constructor() {
    super("AP_ACCOUNT_NOT_CONFIGURED", "AP account not configured in purchasing settings");
  }
}

export class PurchaseCreditMissingExpenseAccountError extends PurchaseCreditError {
  constructor() {
    super(
      "EXPENSE_ACCOUNT_NOT_CONFIGURED",
      "Expense/COGS reversal account not configured in purchasing settings"
    );
  }
}

export class PurchaseCreditInvalidAPAccountTypeError extends PurchaseCreditError {
  constructor(accountId: number, typeName: string | null) {
    super(
      "AP_ACCOUNT_INVALID_TYPE",
      `AP account ${accountId} must be LIABILITY/CREDITOR but is ${typeName ?? "UNKNOWN"}`
    );
  }
}

export class PurchaseCreditInvalidExpenseAccountTypeError extends PurchaseCreditError {
  constructor(accountId: number, typeName: string | null) {
    super(
      "EXPENSE_ACCOUNT_INVALID_TYPE",
      `Expense account ${accountId} must be EXPENSE/COGS/INVENTORY/ASSET but is ${typeName ?? "UNKNOWN"}`
    );
  }
}

export class PurchaseCreditNoApplicableInvoiceError extends PurchaseCreditError {
  constructor() {
    super("NO_APPLICABLE_INVOICE", "No open purchase invoice available for credit application");
  }
}

export class PurchaseCreditJournalNotBalancedError extends PurchaseCreditError {
  constructor(debits: string, credits: string) {
    super("JOURNAL_NOT_BALANCED", `Journal not balanced: debits=${debits}, credits=${credits}`);
  }
}

// =============================================================================
// Input/Output Types
// =============================================================================

export interface PurchaseCreditCreateInput {
  companyId: number;
  userId: number;
  supplierId: number;
  creditNo: string;
  creditDate: Date;
  description?: string | null;
  lines: Array<{
    purchaseInvoiceId?: number | null;
    purchaseInvoiceLineId?: number | null;
    itemId?: number | null;
    description?: string | null;
    qty: string;
    unitPrice: string;
    reason?: string | null;
  }>;
}

export interface PurchaseCreditListParams {
  companyId: number;
  supplierId?: number;
  status?: number;
  dateFrom?: Date;
  dateTo?: Date;
  limit: number;
  offset: number;
}

export interface PurchaseCreditListResult {
  credits: Array<{
    id: number;
    company_id: number;
    supplier_id: number;
    supplier_name: string | null;
    credit_no: string;
    credit_date: string;
    description: string | null;
    status: string;
    total_credit_amount: string;
    applied_amount: string;
    remaining_amount: string;
    journal_batch_id: number | null;
    posted_at: string | null;
    voided_at: string | null;
    created_by_user_id: number | null;
    created_at: string;
    updated_at: string;
  }>;
  total: number;
  limit: number;
  offset: number;
}

export interface PurchaseCreditGetResult {
  id: number;
  company_id: number;
  supplier_id: number;
  supplier_name: string | null;
  credit_no: string;
  credit_date: string;
  description: string | null;
  status: string;
  total_credit_amount: string;
  applied_amount: string;
  remaining_amount: string;
  journal_batch_id: number | null;
  posted_at: string | null;
  posted_by_user_id: number | null;
  voided_at: string | null;
  voided_by_user_id: number | null;
  created_by_user_id: number | null;
  created_at: string;
  updated_at: string;
  lines: PurchaseCreditLineResponse[];
  applications: PurchaseCreditApplicationResponse[];
}

export interface PurchaseCreditApplyResult {
  id: number;
  journal_batch_id: number;
  applied_amount: string;
  remaining_amount: string;
  status: "PARTIAL" | "APPLIED";
}

export interface PurchaseCreditVoidResult {
  id: number;
  reversal_batch_id: number;
}

export interface PurchaseCreditApplyParams {
  companyId: number;
  userId: number;
  creditId: number;
  guardrailDecision: GuardrailDecision | null;
  validOverrideReason: string | null;
}

export interface PurchaseCreditVoidParams {
  companyId: number;
  userId: number;
  creditId: number;
  guardrailDecision: GuardrailDecision | null;
  validOverrideReason: string | null;
}
