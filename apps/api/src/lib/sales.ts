// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Sales Module
 * 
 * This file serves as the main entry point for sales-related functionality.
 * - Type definitions that are shared across sub-modules are kept here
 * - Functions are re-exported from their extracted sub-modules
 * 
 * Extracted sub-modules:
 * - lib/invoices/    - Invoice CRUD and lifecycle
 * - lib/payments/    - Payment CRUD and allocation
 * - lib/orders/     - Order CRUD and lifecycle
 * - lib/credit-notes/ - Credit note CRUD and lifecycle
 * - lib/shared/sales-utils/ - Common utilities
 */

import type { ResultSetHeader, RowDataPacket } from "mysql2";
import type { PoolConnection } from "mysql2/promise";
import { toRfc3339, toRfc3339Required } from "@jurnapod/shared";

// =============================================================================
// Type definitions (kept here for backward compatibility)
// =============================================================================

export type SalesInvoiceRow = RowDataPacket & {
  id: number;
  company_id: number;
  outlet_id: number;
  invoice_no: string;
  client_ref?: string | null;
  invoice_date: string;
  due_date?: Date | string | null;
  status: "DRAFT" | "APPROVED" | "POSTED" | "VOID";
  payment_status: "UNPAID" | "PARTIAL" | "PAID";
  subtotal: string | number;
  tax_amount: string | number;
  grand_total: string | number;
  paid_total: string | number;
  approved_by_user_id?: number | null;
  approved_at?: Date | string | null;
  created_by_user_id?: number | null;
  updated_by_user_id?: number | null;
  created_at: string;
  updated_at: string;
};

export type SalesInvoiceLineRow = RowDataPacket & {
  id: number;
  invoice_id: number;
  line_no: number;
  line_type: "SERVICE" | "PRODUCT";
  item_id: number | null;
  description: string;
  qty: string | number;
  unit_price: string | number;
  line_total: string | number;
};

export type SalesInvoiceTaxRow = RowDataPacket & {
  id: number;
  invoice_id: number;
  tax_rate_id: number;
  amount: string | number;
};

export type AccessCheckRow = RowDataPacket & {
  id: number;
};

export type ModuleConfigRow = RowDataPacket & {
  enabled: number;
  config_json: string;
};

export type IdRow = RowDataPacket & {
  id: number;
};

export type QueryExecutor = {
  execute: PoolConnection["execute"];
};

export type MutationActor = {
  userId: number;
};

export type InvoiceLineInput = {
  line_type?: "SERVICE" | "PRODUCT";
  item_id?: number;
  description: string;
  qty: number;
  unit_price: number;
};

export type InvoiceTaxInput = {
  tax_rate_id: number;
  amount: number;
};

export type PreparedInvoiceLine = {
  line_no: number;
  line_type: "SERVICE" | "PRODUCT";
  item_id: number | null;
  description: string;
  qty: number;
  unit_price: number;
  line_total: number;
};

export type InvoiceListFilters = {
  outletIds?: readonly number[];
  status?: "DRAFT" | "APPROVED" | "POSTED" | "VOID";
  paymentStatus?: "UNPAID" | "PARTIAL" | "PAID";
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  offset?: number;
  timezone?: string;
};

export type PaymentListFilters = {
  outletIds?: readonly number[];
  status?: "DRAFT" | "POSTED" | "VOID";
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  offset?: number;
  timezone?: string;
};

export type SalesInvoice = {
  id: number;
  company_id: number;
  outlet_id: number;
  invoice_no: string;
  client_ref?: string | null;
  invoice_date: string;
  due_date?: string | null;
  status: "DRAFT" | "APPROVED" | "POSTED" | "VOID";
  payment_status: "UNPAID" | "PARTIAL" | "PAID";
  subtotal: number;
  tax_amount: number;
  grand_total: number;
  paid_total: number;
  approved_by_user_id?: number | null;
  approved_at?: string | null;
  created_by_user_id?: number | null;
  updated_by_user_id?: number | null;
  created_at: string;
  updated_at: string;
};

export type SalesInvoiceLine = {
  id: number;
  invoice_id: number;
  line_no: number;
  line_type: "SERVICE" | "PRODUCT";
  item_id: number | null;
  description: string;
  qty: number;
  unit_price: number;
  line_total: number;
};

export type SalesInvoiceTax = {
  id: number;
  invoice_id: number;
  tax_rate_id: number;
  amount: number;
};

export type SalesInvoiceDetail = SalesInvoice & {
  lines: SalesInvoiceLine[];
  taxes: SalesInvoiceTax[];
};

export type SalesPaymentSplitRow = RowDataPacket & {
  id: number;
  payment_id: number;
  company_id: number;
  outlet_id: number;
  split_index: number;
  account_id: number;
  account_name?: string;
  amount: string | number;
};

export type SalesPaymentRow = RowDataPacket & {
  id: number;
  company_id: number;
  outlet_id: number;
  invoice_id: number;
  payment_no: string;
  client_ref?: string | null;
  payment_at: string;
  account_id: number;
  account_name?: string;
  method?: "CASH" | "QRIS" | "CARD";
  status: "DRAFT" | "POSTED" | "VOID";
  amount: string | number;
  invoice_amount_idr?: string | number | null;
  payment_amount_idr?: string | number | null;
  payment_delta_idr?: string | number;
  shortfall_settled_as_loss?: number;
  shortfall_reason?: string | null;
  shortfall_settled_by_user_id?: number | null;
  shortfall_settled_at?: Date | string | null;
  created_by_user_id?: number | null;
  updated_by_user_id?: number | null;
  created_at: string;
  updated_at: string;
};

export type SalesPaymentSplit = {
  id: number;
  payment_id: number;
  company_id: number;
  outlet_id: number;
  split_index: number;
  account_id: number;
  account_name?: string;
  amount: number;
};

export type SalesPayment = {
  id: number;
  company_id: number;
  outlet_id: number;
  invoice_id: number;
  payment_no: string;
  client_ref?: string | null;
  payment_at: string;
  account_id: number;
  account_name?: string;
  method?: "CASH" | "QRIS" | "CARD";
  status: "DRAFT" | "POSTED" | "VOID";
  amount: number;
  actual_amount_idr?: number | null;
  invoice_amount_idr?: number | null;
  payment_amount_idr?: number | null;
  payment_delta_idr?: number;
  shortfall_settled_as_loss?: boolean;
  shortfall_reason?: string | null;
  shortfall_settled_by_user_id?: number | null;
  shortfall_settled_at?: string | null;
  splits?: SalesPaymentSplit[];
  created_by_user_id?: number | null;
  updated_by_user_id?: number | null;
  created_at: string;
  updated_at: string;
};

// =============================================================================
// Error Classes
// =============================================================================

export { DatabaseConflictError, DatabaseReferenceError, DatabaseForbiddenError } from "@/lib/shared/common-errors";
export class InvoiceStatusError extends Error {}
export class PaymentStatusError extends Error {}
export class PaymentAllocationError extends Error {}

const mysqlDuplicateErrorCode = 1062;

// =============================================================================
// Constants
// =============================================================================

const MONEY_SCALE = 100;

// =============================================================================
// Re-export from sub-modules
// =============================================================================

// Invoice functions
export {
  listInvoices,
  getInvoice,
  createInvoice,
  updateInvoice,
  postInvoice,
  approveInvoice,
  voidInvoice
} from "@/lib/invoices";

// Payment functions
export {
  listPayments,
  getPayment,
  createPayment,
  updatePayment,
  postPayment
} from "@/lib/payments";

// Order functions
export {
  createOrder,
  getOrder,
  updateOrder,
  listOrders,
  confirmOrder,
  completeOrder,
  voidOrder,
  convertOrderToInvoice
} from "@/lib/orders";

// Order types
export type {
  SalesOrder,
  SalesOrderLine,
  SalesOrderDetail,
  SalesOrderStatus,
  OrderLineInput,
  OrderListFilters,
  MutationActor as OrderMutationActor,
  SalesOrderRow,
  SalesOrderLineRow,
  ItemLookup
} from "@/lib/orders";

// Credit Note functions
export {
  createCreditNote,
  getCreditNote,
  listCreditNotes,
  updateCreditNote,
  postCreditNote,
  voidCreditNote
} from "@/lib/credit-notes";

// Posting functions
export {
  postSalesInvoiceToJournal,
  postSalesPaymentToJournal,
  postCreditNoteToJournal,
  voidCreditNoteToJournal
} from "@/lib/sales-posting";

// =============================================================================
// Re-export from shared utilities
// =============================================================================

export {
  normalizeMoney,
  sumMoney,
  withTransaction,
  getNumberWithConflictMapping,
  ensureCompanyOutletExists,
  ensureUserHasOutletAccess,
  formatDateOnly,
  hasMoreThanTwoDecimals,
  isMysqlError,
  MONEY_SCALE,
  parseFeatureGateValue
} from "@/lib/shared/common-utils";

// Export internal testables for backward compatibility
import { parseFeatureGateValue } from "@/lib/shared/common-utils";
export const __salesTestables = {
  parseFeatureGateValue
};
