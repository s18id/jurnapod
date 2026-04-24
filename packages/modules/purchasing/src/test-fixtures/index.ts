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
