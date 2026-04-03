// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * SalesDb Interface
 * 
 * Database abstraction for the sales module.
 * Abstracts all database access so the module doesn't depend on @jurnapod/db directly.
 * 
 * The API provides a concrete implementation at composition time.
 */

import type {
  SalesOrderDetail,
  SalesOrderStatus,
  OrderListFilters,
  ItemLookup
} from "../types/sales.js";
import type { SalesPayment, SalesPaymentSplit, PaymentListFilters } from "../types/payments.js";
import type { SalesCreditNoteDetail, CreditNoteListFilters, CreditCapacity } from "../types/credit-notes.js";

// =============================================================================
// Row Types (internal to the repository implementation)
// =============================================================================

interface SalesOrderRow {
  id: number;
  company_id: number;
  outlet_id: number;
  order_no: string;
  client_ref?: string | null;
  order_date: string;
  expected_date: string | null;
  status: SalesOrderStatus;
  notes: string | null;
  subtotal: string | number;
  tax_amount: string | number;
  grand_total: string | number;
  confirmed_by_user_id: number | null;
  confirmed_at: string | null;
  completed_by_user_id: number | null;
  completed_at: string | null;
  created_by_user_id: number | null;
  updated_by_user_id: number | null;
  created_at: string;
  updated_at: string;
}

interface SalesOrderLineRow {
  id: number;
  order_id: number;
  line_no: number;
  line_type: "SERVICE" | "PRODUCT";
  item_id: number | null;
  description: string;
  qty: string | number;
  unit_price: string | number;
  line_total: string | number;
}

interface SalesPaymentRow {
  id: number;
  company_id: number;
  outlet_id: number;
  invoice_id: number;
  payment_no: string;
  client_ref?: string | null;
  payment_at: string;
  account_id: number;
  account_name?: string | null;
  method?: string | null;
  status: string;
  amount: string | number;
  actual_amount_idr?: string | number | null;
  invoice_amount_idr?: string | number | null;
  payment_amount_idr?: string | number | null;
  payment_delta_idr?: string | number | null;
  shortfall_settled_as_loss?: number | null;
  shortfall_reason?: string | null;
  shortfall_settled_by_user_id?: number | null;
  shortfall_settled_at?: string | null;
  created_by_user_id?: number | null;
  updated_by_user_id?: number | null;
  created_at: string;
  updated_at: string;
}

interface SalesPaymentSplitRow {
  id: number;
  payment_id: number;
  company_id: number;
  outlet_id: number;
  split_index: number;
  account_id: number;
  account_name?: string | null;
  amount: string | number;
}

interface CreditNoteRow {
  id: number;
  company_id: number;
  outlet_id: number;
  invoice_id: number;
  credit_note_no: string;
  credit_note_date: string;
  client_ref: string | null;
  status: string;
  reason: string | null;
  notes: string | null;
  amount: string | number;
  created_by_user_id: number | null;
  updated_by_user_id: number | null;
  created_at: string;
  updated_at: string;
}

interface CreditNoteLineRow {
  id: number;
  credit_note_id: number;
  line_no: number;
  description: string;
  qty: string | number;
  unit_price: string | number;
  line_total: string | number;
}

// =============================================================================
// Executor Interface
// =============================================================================

export interface SalesDbExecutor {
  // Order operations
  findOrderById(companyId: number, orderId: number, forUpdate?: boolean): Promise<SalesOrderRow | null>;
  findOrderByClientRef(companyId: number, clientRef: string): Promise<SalesOrderRow | null>;
  findOrderLines(orderId: number): Promise<SalesOrderLineRow[]>;
  
  insertOrder(input: {
    companyId: number;
    outletId: number;
    orderNo: string;
    orderDate: string;
    expectedDate?: string;
    clientRef?: string;
    status: string;
    notes?: string;
    subtotal: number;
    taxAmount: number;
    grandTotal: number;
    createdByUserId?: number;
  }): Promise<number>;

  insertOrderLine(input: {
    orderId: number;
    companyId: number;
    outletId: number;
    lineNo: number;
    lineType: "SERVICE" | "PRODUCT";
    itemId: number | null;
    description: string;
    qty: number;
    unitPrice: number;
    lineTotal: number;
  }): Promise<void>;

  updateOrder(input: {
    companyId: number;
    orderId: number;
    outletId: number;
    orderNo: string;
    orderDate: string;
    expectedDate: string | null;
    notes: string | null;
    subtotal: number;
    taxAmount: number;
    grandTotal: number;
    updatedByUserId?: number;
  }): Promise<void>;

  deleteOrderLines(companyId: number, orderId: number): Promise<void>;

  updateOrderStatus(companyId: number, orderId: number, status: string, updatedByUserId?: number): Promise<void>;

  // Invoice operations
  findInvoiceById(companyId: number, invoiceId: number, forUpdate?: boolean): Promise<unknown | null>;
  findInvoiceByClientRef(companyId: number, clientRef: string): Promise<unknown | null>;
  findInvoiceLines(companyId: number, invoiceId: number): Promise<unknown[]>;
  findInvoiceTaxes(companyId: number, invoiceId: number): Promise<unknown[]>;

  insertInvoice(input: {
    companyId: number;
    outletId: number;
    invoiceNo: string;
    invoiceDate: string;
    dueDate: string;
    clientRef?: string;
    status: string;
    paymentStatus: string;
    subtotal: number;
    taxAmount: number;
    grandTotal: number;
    paidTotal: number;
    createdByUserId?: number;
  }): Promise<number>;

  insertInvoiceLine(input: {
    invoiceId: number;
    companyId: number;
    outletId: number;
    lineNo: number;
    lineType: "SERVICE" | "PRODUCT";
    itemId: number | null;
    description: string;
    qty: number;
    unitPrice: number;
    lineTotal: number;
  }): Promise<void>;

  insertInvoiceTax(input: {
    invoiceId: number;
    companyId: number;
    outletId: number;
    taxRateId: number;
    amount: number;
  }): Promise<void>;

  updateInvoice(input: {
    companyId: number;
    invoiceId: number;
    outletId: number;
    invoiceNo: string;
    invoiceDate: string;
    dueDate?: string;
    subtotal: number;
    taxAmount: number;
    grandTotal: number;
    updatedByUserId?: number;
  }): Promise<void>;

  updateInvoiceStatus(companyId: number, invoiceId: number, status: string, updatedByUserId?: number): Promise<void>;

  deleteInvoiceLines(companyId: number, invoiceId: number): Promise<void>;
  deleteInvoiceTaxes(companyId: number, invoiceId: number): Promise<void>;

  // Item operations
  findItemById(companyId: number, itemId: number): Promise<ItemLookup | null>;

  // Numbering
  getNextDocumentNumber(companyId: number, outletId: number, docType: string, preferredNo?: string): Promise<string>;

  // Validation
  outletExists(companyId: number, outletId: number): Promise<boolean>;
  validateTaxRates(companyId: number, taxRateIds: number[]): Promise<boolean>;
  getDefaultTaxRates(companyId: number): Promise<Array<{ tax_rate_id: number; rate_percent: number }>>;

  // List operations
  listOrders(companyId: number, filters: OrderListFilters): Promise<{ total: number; orders: SalesOrderDetail[] }>;
  listInvoices(companyId: number, filters: unknown): Promise<{ total: number; invoices: unknown[] }>;

  // Payment operations
  findPaymentById(companyId: number, paymentId: number, forUpdate?: boolean): Promise<SalesPayment | null>;
  findPaymentByClientRef(companyId: number, clientRef: string): Promise<SalesPayment | null>;
  findPaymentSplits(companyId: number, paymentId: number): Promise<SalesPaymentSplit[]>;
  findPaymentSplitsForMultiple(companyId: number, paymentIds: number[]): Promise<Map<number, SalesPaymentSplit[]>>;

  insertPayment(input: {
    companyId: number;
    outletId: number;
    invoiceId: number;
    paymentNo: string;
    clientRef?: string;
    paymentAt: string;
    accountId: number;
    method?: string;
    status: string;
    amount: number;
    paymentAmountIdr: number;
    createdByUserId?: number;
  }): Promise<number>;

  insertPaymentSplit(input: {
    paymentId: number;
    companyId: number;
    outletId: number;
    splitIndex: number;
    accountId: number;
    amount: number;
  }): Promise<void>;

  updatePayment(input: {
    companyId: number;
    paymentId: number;
    outletId: number;
    invoiceId: number;
    paymentNo: string;
    paymentAt: string;
    accountId: number;
    method?: string | null;
    amount: number;
    paymentAmountIdr: number;
    updatedByUserId?: number;
  }): Promise<void>;

  deletePaymentSplits(companyId: number, paymentId: number): Promise<void>;

  updatePaymentStatus(input: {
    companyId: number;
    paymentId: number;
    status: string;
    invoiceAmountIdr?: number;
    paymentDeltaIdr?: number;
    shortfallSettledAsLoss?: boolean;
    shortfallReason?: string;
    shortfallSettledByUserId?: number;
    shortfallSettledAt?: Date | null;
    updatedByUserId?: number;
  }): Promise<void>;

  updateInvoicePaidTotal(input: {
    companyId: number;
    invoiceId: number;
    paidTotal: number;
    paymentStatus: string;
    updatedByUserId?: number;
  }): Promise<void>;

  listPayments(companyId: number, filters: PaymentListFilters): Promise<{ total: number; payments: SalesPayment[] }>;

  // Account operations for payment validation
  accountIsPayable(companyId: number, accountId: number): Promise<boolean>;

  // Credit Note operations
  findCreditNoteById(companyId: number, creditNoteId: number, forUpdate?: boolean): Promise<SalesCreditNoteDetail | null>;
  findCreditNoteByClientRef(companyId: number, clientRef: string): Promise<CreditNoteRow | null>;
  findCreditNoteLines(creditNoteId: number): Promise<CreditNoteLineRow[]>;
  getCreditNoteCapacity(companyId: number, invoiceId: number, excludeCreditNoteId?: number): Promise<CreditCapacity>;

  insertCreditNote(input: {
    companyId: number;
    outletId: number;
    invoiceId: number;
    creditNoteNo: string;
    creditNoteDate: string;
    status: string;
    clientRef?: string;
    reason?: string;
    notes?: string;
    amount: number;
    createdByUserId?: number;
  }): Promise<number>;

  insertCreditNoteLine(input: {
    creditNoteId: number;
    companyId: number;
    outletId: number;
    lineNo: number;
    description: string;
    qty: number;
    unitPrice: number;
    lineTotal: number;
  }): Promise<void>;

  updateCreditNote(input: {
    companyId: number;
    creditNoteId: number;
    creditNoteDate?: string;
    reason?: string;
    notes?: string;
    amount?: number;
    updatedByUserId?: number;
  }): Promise<void>;

  updateCreditNoteStatus(companyId: number, creditNoteId: number, status: string, updatedByUserId?: number): Promise<void>;

  deleteCreditNoteLines(creditNoteId: number): Promise<void>;

  listCreditNotes(companyId: number, filters: CreditNoteListFilters): Promise<{ total: number; creditNotes: SalesCreditNoteDetail[] }>;
}

// =============================================================================
// SalesDb Interface
// =============================================================================

export interface SalesDb {
  executor: SalesDbExecutor;
  withTransaction<T>(operation: (executor: SalesDbExecutor) => Promise<T>): Promise<T>;
}
