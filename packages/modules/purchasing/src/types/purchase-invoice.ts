// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Purchase Invoice types for purchasing module.
 */

import type { KyselySchema } from "@jurnapod/db";
import type { PurchaseInvoiceLineResponse } from "@jurnapod/shared";
import { toUtcIso, fromUtcIso } from "@jurnapod/shared";
import type { GuardrailDecision } from "./guardrail.js";

// =============================================================================
// Error Types
// =============================================================================

export class PIError extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "PIError";
  }
}

export class PINotFoundError extends PIError {
  constructor(piId: number) {
    super("PI_NOT_FOUND", `Purchase invoice ${piId} not found`);
  }
}

export class PIInvalidStatusTransitionError extends PIError {
  constructor(fromStatus: number, toStatus: number) {
    super(
      "INVALID_STATUS_TRANSITION",
      `Cannot transition PI from status ${fromStatus} to ${toStatus}`
    );
  }
}

export class PIExchangeRateMissingError extends PIError {
  constructor(currencyCode: string, invoiceDate: Date) {
    super(
      "EXCHANGE_RATE_MISSING",
      `Exchange rate not found for currency ${currencyCode} on date ${fromUtcIso.dateOnly(toUtcIso.dateLike(invoiceDate) as string)}`
    );
  }
}

export class PIAccountMissingError extends PIError {
  constructor(accountType: string) {
    super(
      "ACCOUNT_MISSING",
      `${accountType} account not configured in purchasing settings`
    );
  }
}

export class PICreditLimitExceededError extends PIError {
  constructor(
    public readonly utilizationPercent: number,
    public readonly creditLimit: string
  ) {
    super(
      "CREDIT_LIMIT_EXCEEDED",
      `Credit limit exceeded: ${utilizationPercent.toFixed(1)}% of limit ${creditLimit}`
    );
  }
}

export class PITaxAccountMissingError extends PIError {
  constructor(taxRateId: number) {
    super(
      "TAX_ACCOUNT_MISSING",
      `Tax account not configured for tax_rate_id ${taxRateId}`
    );
  }
}

// =============================================================================
// Input/Output Types
// =============================================================================

export interface PICreateInput {
  companyId: number;
  userId: number;
  idempotencyKey?: string | null;
  supplierId: number;
  invoiceNo: string;
  invoiceDate: Date;
  dueDate?: Date | null;
  referenceNumber?: string | null;
  currencyCode: string;
  exchangeRate?: string;
  notes?: string | null;
  lines: Array<{
    itemId?: number | null;
    description: string;
    qty: string;
    unitPrice: string;
    taxRateId?: number | null;
    lineType?: "ITEM" | "SERVICE" | "FREIGHT" | "TAX" | "DISCOUNT";
  }>;
}

export interface PIListParams {
  companyId: number;
  supplierId?: number;
  status?: number;
  dateFrom?: Date;
  dateTo?: Date;
  limit: number;
  offset: number;
}

export interface PIListResult {
  invoices: Array<{
    id: number;
    company_id: number;
    supplier_id: number;
    supplier_name: string | null;
    invoice_no: string;
    invoice_date: string;
    due_date: string | null;
    reference_number: string | null;
    status: string;
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
  }>;
  total: number;
  limit: number;
  offset: number;
}

export interface PIGetResult {
  id: number;
  company_id: number;
  supplier_id: number;
  supplier_name: string | null;
  invoice_no: string;
  invoice_date: string;
  due_date: string | null;
  reference_number: string | null;
  status: string;
  currency_code: string;
  exchange_rate: string;
  subtotal: string;
  tax_amount: string;
  grand_total: string;
  notes: string | null;
  journal_batch_id: number | null;
  posted_at: string | null;
  posted_by_user_id: number | null;
  voided_at: string | null;
  voided_by_user_id: number | null;
  created_by_user_id: number | null;
  updated_by_user_id: number | null;
  created_at: string;
  updated_at: string;
  lines: PurchaseInvoiceLineResponse[];
}

export interface PIPostResult {
  id: number;
  journal_batch_id: number;
  warnings: string[];
}

export interface PIVoidResult {
  id: number;
  reversal_batch_id: number;
}

export interface PIPostParams {
  companyId: number;
  userId: number;
  piId: number;
  guardrailDecision: GuardrailDecision | null;
  validOverrideReason: string | null;
}

export interface PIVoidParams {
  companyId: number;
  userId: number;
  piId: number;
  guardrailDecision: GuardrailDecision | null;
  validOverrideReason: string | null;
}
