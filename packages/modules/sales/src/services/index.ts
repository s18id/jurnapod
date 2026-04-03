// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Services
 * 
 * Public exports for sales domain services.
 */

export {
  createOrderService,
  type OrderService,
  type OrderServiceDeps
} from "./order-service.js";

export {
  type SalesDb,
  type SalesDbExecutor
} from "./sales-db.js";

export {
  resolveDueDate,
  type ResolveDueDateInput
} from "./order-service.js";

export {
  DatabaseConflictError,
  DatabaseReferenceError,
  DatabaseForbiddenError
} from "./order-service.js";

export {
  createCreditNoteService,
  type CreditNoteService,
  type CreditNoteServiceDeps
} from "./credit-note-service.js";

export {
  createPaymentService,
  type PaymentService,
  type PaymentServiceDeps
} from "./payment-service.js";
