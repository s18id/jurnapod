// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Payment Domain Types
 * 
 * Core types for payment management in the sales module.
 */

import type { PostingResult } from "@jurnapod/shared";

// =============================================================================
// Payment Types
// =============================================================================

/**
 * Journal posting result for payment operations.
 * Alias for PostingResult from @jurnapod/shared.
 */
export type JournalPostingResult = PostingResult;

export type SalesPaymentStatus = "DRAFT" | "POSTED" | "VOID";

export type SalesPaymentMethod = "CASH" | "QRIS" | "CARD";

export type SalesPayment = {
  id: number;
  company_id: number;
  outlet_id: number;
  invoice_id: number;
  payment_no: string;
  client_ref?: string | null;
  payment_at: string;
  account_id: number;
  account_name?: string | null;
  method?: SalesPaymentMethod | null;
  status: SalesPaymentStatus;
  amount: number;
  actual_amount_idr?: number | null;
  invoice_amount_idr?: number | null;
  payment_amount_idr?: number | null;
  payment_delta_idr?: number | null;
  shortfall_settled_as_loss?: boolean | null;
  shortfall_reason?: string | null;
  shortfall_settled_by_user_id?: number | null;
  shortfall_settled_at?: string | null;
  created_by_user_id?: number | null;
  updated_by_user_id?: number | null;
  created_at: string;
  updated_at: string;
  splits?: SalesPaymentSplit[];
};

export type SalesPaymentSplit = {
  id: number;
  payment_id: number;
  company_id: number;
  outlet_id: number;
  split_index: number;
  account_id: number;
  account_name?: string | null;
  amount: number;
};

// =============================================================================
// Payment Input Types
// =============================================================================

export type PaymentSplitInput = {
  account_id: number;
  amount: number;
};

export type CreatePaymentInput = {
  outlet_id: number;
  invoice_id: number;
  client_ref?: string;
  payment_no?: string;
  payment_at: string;
  account_id?: number;
  method?: SalesPaymentMethod;
  amount: number;
  actual_amount_idr?: number;
  splits?: PaymentSplitInput[];
};

export type UpdatePaymentInput = {
  outlet_id?: number;
  invoice_id?: number;
  payment_no?: string;
  payment_at?: string;
  account_id?: number;
  method?: SalesPaymentMethod;
  amount?: number;
  actual_amount_idr?: number;
  splits?: PaymentSplitInput[];
};

export type PostPaymentInput = {
  settle_shortfall_as_loss?: boolean;
  shortfall_reason?: string;
  /** Internal fields for journal posting - set by PaymentService before calling postingHook */
  _paymentId?: number;
  _companyId?: number;
  _invoiceId?: number;
};

export type PaymentListFilters = {
  outletIds?: readonly number[];
  status?: SalesPaymentStatus;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  offset?: number;
  timezone?: string;
};

// =============================================================================
// Actor Type
// =============================================================================

export type MutationActor = {
  userId: number;
};

// =============================================================================
// Canonical Input for Idempotency
// =============================================================================

export type CanonicalPaymentInput = {
  outlet_id: number;
  invoice_id: number;
  payment_at: string;
  amount_minor: number;
  account_id: number;
  splits: Array<{ account_id: number; amount_minor: number }>;
};

// =============================================================================
// Error Types
// =============================================================================

export class PaymentStatusError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PaymentStatusError";
  }
}

export class PaymentAllocationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PaymentAllocationError";
  }
}
