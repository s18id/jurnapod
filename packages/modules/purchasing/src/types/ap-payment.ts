// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * AP Payment types for purchasing module.
 */

import type { KyselySchema } from "@jurnapod/db";
import type { ApPaymentLineResponse } from "@jurnapod/shared";
import type { GuardrailDecision } from "./guardrail.js";

// =============================================================================
// Error Types
// =============================================================================

export class APPaymentError extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "APPaymentError";
  }
}

export class APPaymentNotFoundError extends APPaymentError {
  constructor(paymentId: number) {
    super("AP_PAYMENT_NOT_FOUND", `AP payment ${paymentId} not found`);
  }
}

export class APPaymentInvalidStatusTransitionError extends APPaymentError {
  constructor(fromStatus: number, toStatus: number) {
    super(
      "INVALID_STATUS_TRANSITION",
      `Cannot transition AP payment from status ${fromStatus} to ${toStatus}`
    );
  }
}

export class APPaymentOverpaymentError extends APPaymentError {
  constructor(
    public readonly totalPaymentAmount: string,
    public readonly totalPIOpenAmount: string
  ) {
    super(
      "OVERPAYMENT",
      `Payment amount ${totalPaymentAmount} exceeds open PI amount ${totalPIOpenAmount}`
    );
  }
}

export class APPaymentBankAccountNotFoundError extends APPaymentError {
  constructor(bankAccountId: number) {
    super(
      "BANK_ACCOUNT_NOT_FOUND",
      `Bank account ${bankAccountId} not found or not accessible`
    );
  }
}

export class APPaymentSupplierInactiveError extends APPaymentError {
  constructor(supplierId: number) {
    super(
      "SUPPLIER_INACTIVE",
      `Supplier ${supplierId} is inactive`
    );
  }
}

export class APPaymentInvoiceNotFoundError extends APPaymentError {
  constructor(invoiceId: number) {
    super(
      "INVOICE_NOT_FOUND",
      `Purchase invoice ${invoiceId} not found or not accessible`
    );
  }
}

export class APPaymentInvoiceNotPostedError extends APPaymentError {
  constructor(invoiceId: number, status: number) {
    super(
      "INVOICE_NOT_POSTED",
      `Purchase invoice ${invoiceId} must be POSTED but has status ${status}`
    );
  }
}

export class APPaymentInvoiceSupplierMismatchError extends APPaymentError {
  constructor(invoiceId: number, expectedSupplierId: number, actualSupplierId: number) {
    super(
      "INVOICE_SUPPLIER_MISMATCH",
      `Purchase invoice ${invoiceId} belongs to supplier ${actualSupplierId}, expected ${expectedSupplierId}`
    );
  }
}

export class APPaymentJournalNotBalancedError extends APPaymentError {
  constructor(debits: string, credits: string) {
    super(
      "JOURNAL_NOT_BALANCED",
      `Journal not balanced: debits=${debits}, credits=${credits}`
    );
  }
}

export class APPaymentMissingAPAccountError extends APPaymentError {
  constructor() {
    super(
      "AP_ACCOUNT_NOT_CONFIGURED",
      "AP account not configured in purchasing settings"
    );
  }
}

export class APPaymentInvalidAPAccountTypeError extends APPaymentError {
  constructor(accountId: number, typeName: string | null) {
    super(
      "AP_ACCOUNT_INVALID_TYPE",
      `AP account ${accountId} must be LIABILITY/CREDITOR but is ${typeName ?? "UNKNOWN"}`
    );
  }
}

// =============================================================================
// Input/Output Types
// =============================================================================

export interface APPaymentCreateInput {
  companyId: number;
  userId: number;
  paymentDate: Date;
  bankAccountId: number;
  supplierId: number;
  description?: string | null;
  lines: Array<{
    purchaseInvoiceId: number;
    allocationAmount: string;
    description?: string | null;
  }>;
}

export interface APPaymentListParams {
  companyId: number;
  supplierId?: number;
  status?: number;
  dateFrom?: Date;
  dateTo?: Date;
  limit: number;
  offset: number;
}

export interface APPaymentListResult {
  payments: Array<{
    id: number;
    company_id: number;
    payment_no: string;
    payment_date: string;
    bank_account_id: number;
    supplier_id: number;
    supplier_name: string | null;
    description: string | null;
    status: string;
    journal_batch_id: number | null;
    posted_at: string | null;
    voided_at: string | null;
    created_by_user_id: number | null;
    updated_by_user_id: number | null;
    created_at: string;
    updated_at: string;
  }>;
  total: number;
  limit: number;
  offset: number;
}

export interface APPaymentGetResult {
  id: number;
  company_id: number;
  payment_no: string;
  payment_date: string;
  bank_account_id: number;
  supplier_id: number;
  supplier_name: string | null;
  description: string | null;
  status: string;
  journal_batch_id: number | null;
  posted_at: string | null;
  posted_by_user_id: number | null;
  voided_at: string | null;
  voided_by_user_id: number | null;
  created_by_user_id: number | null;
  updated_by_user_id: number | null;
  created_at: string;
  updated_at: string;
  lines: ApPaymentLineResponse[];
}

export interface APPaymentPostResult {
  id: number;
  journal_batch_id: number;
}

export interface APPaymentVoidResult {
  id: number;
  reversal_batch_id: number;
}

export interface APPaymentPostParams {
  companyId: number;
  userId: number;
  paymentId: number;
  guardrailDecision: GuardrailDecision | null;
  validOverrideReason: string | null;
}

export interface APPaymentVoidParams {
  companyId: number;
  userId: number;
  paymentId: number;
  guardrailDecision: GuardrailDecision | null;
  validOverrideReason: string | null;
}
