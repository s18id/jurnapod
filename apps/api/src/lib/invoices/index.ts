// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Invoices Module
 * 
 * Public exports for the invoices module.
 * Re-exports from sales.ts for backward compatibility.
 */

// Re-export types
export type {
  SalesInvoice,
  SalesInvoiceLine,
  SalesInvoiceTax,
  SalesInvoiceDetail,
  InvoiceListFilters,
  InvoiceLineInput,
  InvoiceTaxInput,
  MutationActor
} from "./invoice-service";

export type { InvoiceDueTerm } from "./types";

// Re-export error classes
export {
  InvoiceStatusError,
  DatabaseConflictError,
  DatabaseReferenceError,
  DatabaseForbiddenError
} from "./invoice-service";

// Re-export CRUD functions
export {
  listInvoices,
  getInvoice,
  createInvoice,
  updateInvoice,
  postInvoice,
  approveInvoice,
  voidInvoice
} from "./invoice-service";

// Re-export constants
export { INVOICE_DUE_TERM_DAYS } from "./types";

// Re-export posting functions
export {
  postSalesInvoiceToJournal
} from "./invoice-posting";

// Re-export invoice detail finder (used by orders for convertOrderToInvoice)
export {
  findInvoiceDetailWithExecutor
} from "./invoice-service";
