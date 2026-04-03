// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Payments Module
 * 
 * Public exports for the payments module.
 * Extracted from sales.ts as part of Story 6.1b.
 */

// Types - re-export from modules-sales for backward compatibility
export type { SalesPayment, SalesPaymentSplit } from "@jurnapod/modules-sales";
export type { PaymentListFilters, SalesPaymentSplitRow, SalesPaymentRow, QueryExecutor, MutationActor, CanonicalPaymentInput } from "./types";
export { PaymentStatusError, PaymentAllocationError } from "@jurnapod/modules-sales";

// Functions - export from extracted payment-service
export {
  listPayments,
  getPayment,
  createPayment,
  updatePayment,
  postPayment
} from "./payment-service";

// Re-export allocation helpers for cases where direct access is needed
export {
  normalizePayment,
  fetchPaymentSplits,
  fetchPaymentSplitsForMultiple,
  attachSplitsToPayment,
  buildCanonicalInput,
  buildCanonicalFromExisting,
  canonicalPaymentsEqual,
  hasMoreThanTwoDecimals
} from "./payment-allocation";
