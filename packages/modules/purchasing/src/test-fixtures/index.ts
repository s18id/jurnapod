// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * @jurnapod/modules-purchasing test fixtures
 *
 * This package provides deterministic, owner-package fixture functions for
 * purchasing domain. All functions accept injected `db: KyselySchema`.
 */

// Types
export type {
  SupplierFixture,
  PurchasingAccountsFixture,
  PurchasingSettingsFixture,
  PurchaseInvoiceFixture,
  ApPaymentFixture,
} from "./types.js";

// Supplier fixtures
export { createSupplierFixture, setSupplierActiveFixture } from "./supplier.js";

// Purchasing accounts fixtures
export { createPurchasingAccountsFixture } from "./purchasing-accounts.js";

// Purchasing settings fixtures
export {
  createPurchasingSettingsFixture,
  setPurchasingDefaultApAccountFixture,
} from "./purchasing-settings.js";

// Purchase invoice fixtures
export { createTestPurchaseInvoice } from "./purchase-invoice-fixtures.js";

// AP payment fixtures
export { createTestApPayment } from "./ap-payment-fixtures.js";

// Seeded purchase invoice fixture (wraps full production posting flow)
export {
  createSeededPurchaseInvoice,
  type SeededPurchaseInvoiceResult,
} from "./seeded-purchase-invoice-fixtures.js";

// Reconciliation snapshot fixtures
export {
  createTestReconciliationSnapshot,
  type ReconciliationSnapshotFixture,
  type CreateTestReconciliationSnapshotOpts,
} from "./reconciliation-fixtures.js";
