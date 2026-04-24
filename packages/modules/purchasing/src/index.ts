// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * @jurnapod/modules-purchasing
 *
 * Purchasing module for Jurnapod ERP — supplier management, purchase orders,
 * goods receipts, AP invoices, and AP payment/credit workflows.
 */

// Re-export test fixtures
export type {
  SupplierFixture,
  PurchasingAccountsFixture,
  PurchasingSettingsFixture,
} from "./test-fixtures/index.js";

// Re-export error classes
export {
  PurchasingConflictError,
  PurchasingReferenceError,
  PurchasingForbiddenError,
  SupplierHasOpenDocumentsError,
  SupplierNotFoundError,
} from "./errors.js";

// Re-export types
export * from "./types/index.js";

// Re-export services
export { SupplierService } from "./services/supplier-service.js";
export { SupplierContactService } from "./services/supplier-contact-service.js";
export { ExchangeRateService } from "./services/exchange-rate-service.js";
export { PurchaseOrderService } from "./services/purchase-order-service.js";
export { GoodsReceiptService } from "./services/goods-receipt-service.js";
export { PurchaseInvoiceService } from "./services/purchase-invoice-service.js";
export { PurchaseCreditService } from "./services/purchase-credit-service.js";
export { APPaymentService } from "./services/ap-payment-service.js";
export { ApAgingReportService } from "./services/ap-aging-report-service.js";
export { ApReconciliationService, fromScaled4, toScaled, computeBaseAmount } from "./services/ap-reconciliation-service.js";
export { ApReconciliationDrilldownService, buildDrilldownAttribution, generateDrilldownCSV } from "./services/ap-reconciliation-drilldown-service.js";
export { ApReconciliationSnapshotService } from "./services/ap-reconciliation-snapshot-service.js";
export { SupplierStatementService } from "./services/supplier-statement-service.js";
