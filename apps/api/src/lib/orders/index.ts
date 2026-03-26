// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Orders Module
 * 
 * Public exports for the orders module.
 * Re-exports from sales.ts for backward compatibility.
 */

// Re-export types
export type {
  SalesOrder,
  SalesOrderLine,
  SalesOrderDetail,
  SalesOrderStatus,
  OrderLineInput,
  OrderListFilters,
  MutationActor
} from "./order-service";

export type { SalesOrderRow, SalesOrderLineRow, QueryExecutor, ItemLookup } from "./types";

// Re-export error classes
export {
  DatabaseConflictError,
  DatabaseReferenceError,
  DatabaseForbiddenError
} from "./order-service";

// Re-export CRUD functions
export {
  createOrder,
  getOrder,
  updateOrder,
  listOrders
} from "./order-service";

// Re-export lifecycle functions
export {
  confirmOrder,
  completeOrder,
  voidOrder,
  convertOrderToInvoice
} from "./order-service";
