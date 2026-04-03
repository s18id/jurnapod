// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * @jurnapod/modules-sales
 * 
 * Sales domain package covering orders, invoices, payments, and credit notes.
 * 
 * ## Architecture
 * 
 * This package defines service interfaces and business logic orchestration.
 * It does NOT import from apps/api or @/lib/auth directly.
 * 
 * ACL checks are performed via injected AccessScopeChecker interface.
 * Database access is performed via injected SalesDb interface.
 * 
 * ## Package Structure
 * 
 * ```
 * src/
 *   index.ts           # public exports
 *   interfaces/        # injected seams (AccessScopeChecker, Repository interfaces)
 *   services/          # business logic (order-service, invoice-service, etc.)
 *   types/             # domain types (sales.ts, invoices.ts)
 * ```
 * 
 * ## Usage
 * 
 * ```typescript
 * import { createOrderService, createInvoiceService, type OrderService, type InvoiceService } from "@jurnapod/modules-sales";
 * import { ApiAccessScopeChecker } from "./adapters/api-access-scope-checker";
 * import { ApiSalesDb } from "./adapters/api-sales-db";
 * 
 * const accessChecker = new ApiAccessScopeChecker(/* deps *\/);
 * const salesDb = new ApiSalesDb(/* deps *\/);
 * 
 * const orderService = createOrderService({
 *   db: salesDb,
 *   accessScopeChecker: accessChecker
 * });
 * 
 * const invoiceService = createInvoiceService({
 *   db: salesDb,
 *   accessScopeChecker: accessChecker
 * });
 * ```
 */

// =============================================================================
// Interfaces (Injection Boundaries)
// =============================================================================

export {
  type AccessScopeChecker,
  SalesPermissions,
  type SalesPermission,
  SalesAuthorizationError
} from "./interfaces/access-scope-checker.js";

export {
  type PaymentPostingHook
} from "./interfaces/payment-posting-hook.js";

// Re-export repository interfaces for API adapter implementation
export type {
  // Invoice types re-exported for posting integration
  SalesInvoice,
  SalesInvoiceLine,
  SalesInvoiceTax,
  SalesInvoiceDetail,
  InvoiceListFilters,
  InvoiceLineInput,
  InvoiceTaxInput,
  InvoiceDueTerm
} from "./types/invoices.js";

export {
  InvoiceStatusError,
  INVOICE_DUE_TERM_DAYS
} from "./types/invoices.js";

// Repository interfaces
export type {
  SalesInvoicePostingData,
  StockItem,
  CogsPostingResult,
  StockDeductResult,
  DeductStockForSaleResult
} from "./interfaces/repository.js";

// =============================================================================
// Types
// =============================================================================

export type {
  SalesOrder,
  SalesOrderLine,
  SalesOrderDetail,
  SalesOrderStatus,
  OrderLineInput,
  OrderListFilters,
  MutationActor,
  ItemLookup
} from "./types/sales.js";

export {
  SalesConflictError,
  SalesReferenceError
} from "./types/sales.js";

// Credit Note types
export type {
  SalesCreditNoteDetail,
  SalesCreditNoteLine,
  SalesCreditNoteStatus,
  CreditNoteLineInput,
  CreateCreditNoteInput,
  UpdateCreditNoteInput,
  CreditNoteListFilters,
  CreditCapacity
} from "./types/credit-notes.js";

// Payment types
export type {
  SalesPayment,
  SalesPaymentSplit,
  SalesPaymentStatus,
  SalesPaymentMethod,
  PaymentSplitInput,
  CreatePaymentInput,
  UpdatePaymentInput,
  PostPaymentInput,
  PaymentListFilters,
  CanonicalPaymentInput,
  JournalPostingResult
} from "./types/payments.js";

export {
  PaymentStatusError,
  PaymentAllocationError
} from "./types/payments.js";

// =============================================================================
// Services
// =============================================================================

export {
  createOrderService,
  type OrderService,
  type OrderServiceDeps,
  type SalesDb,
  type SalesDbExecutor,
  resolveDueDate,
  type ResolveDueDateInput,
  DatabaseConflictError,
  DatabaseReferenceError,
  DatabaseForbiddenError
} from "./services/index.js";

export {
  createInvoiceService,
  type InvoiceService,
  type InvoiceServiceDeps
} from "./services/invoice-service.js";

export {
  createCreditNoteService,
  type CreditNoteService,
  type CreditNoteServiceDeps
} from "./services/index.js";

export {
  createPaymentService,
  type PaymentService,
  type PaymentServiceDeps
} from "./services/index.js";

// Module stub for type-level marker
export type SalesModuleStub = "sales";
