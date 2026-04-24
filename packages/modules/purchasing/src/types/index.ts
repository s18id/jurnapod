// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Type exports for purchasing module.
 *
 * Note: toScaled4 is exported only from purchase-order.ts to avoid collision.
 * If you need it from goods-receipt.ts context, import directly from that file.
 */

// Re-export guardrail decision type
export type { GuardrailDecision } from "./guardrail.js";

// Supplier and supplier contact types (no collisions)
export * from "./supplier.js";
export * from "./supplier-contact.js";

// Exchange rate types (no collisions)
export * from "./exchange-rate.js";

// Purchase order types
// Note: toScaled4 NOT re-exported here via export* to avoid collision with goods-receipt
// Import toScaled4 directly from purchase-order.ts or goods-receipt.ts if needed
export {
  VALID_TRANSITIONS,
  PURCHASE_ORDER_STATUS,
  computeLineTotal,
  computeTotalAmount,
  toIso,
  formatDecimal,
  formatOrderRow,
} from "./purchase-order.js";
export type {
  POLineRow,
  POLine,
  PORow,
  POResponse,
  OrderListFilters,
  ListPurchaseOrdersParams,
  ListPurchaseOrdersResult,
  CreatePOLineInput,
  CreatePurchaseOrderInput,
  CreatePurchaseOrderResult,
  UpdatePOLineInput,
  UpdatePurchaseOrderInput,
  UpdatePurchaseOrderResult,
  TransitionPurchaseOrderStatusInput,
  TransitionPurchaseOrderStatusResult,
} from "./purchase-order.js";

// Goods receipt types
// Note: toScaled4 NOT re-exported here via export* to avoid collision with purchase-order
// Import toScaled4 directly from goods-receipt.ts if needed
export type {
  GoodsReceiptLineResult,
  GoodsReceiptResult,
  ListGoodsReceiptsParams,
  ListGoodsReceiptsResult,
  CreateGoodsReceiptInput,
  CreateGoodsReceiptResult,
} from "./goods-receipt.js";

// Purchase invoice types (no collisions)
export * from "./purchase-invoice.js";

// Purchase credit types (no collisions)
export * from "./purchase-credit.js";

// AP payment types (no collisions)
export * from "./ap-payment.js";

// AP Aging Report types
export * from "./ap-aging-report.js";

// AP Reconciliation types
export * from "./ap-reconciliation.js";

// AP Reconciliation Drilldown types
export * from "./ap-reconciliation-drilldown.js";

// AP Reconciliation Snapshot types
export * from "./ap-reconciliation-snapshots.js";

// Supplier Statement types
export * from "./supplier-statements.js";
