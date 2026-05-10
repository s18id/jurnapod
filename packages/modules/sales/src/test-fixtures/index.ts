// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * @jurnapod/modules-sales test fixtures
 *
 * This package provides deterministic, owner-package fixture functions for
 * the sales domain. All functions accept injected `db: KyselySchema`.
 */

// Types
export type { CustomerFixture, SalesInvoiceFixture } from "./types.js";

// Customer fixtures
export { createTestCustomer } from "./customer-fixtures.js";

// Sales invoice fixtures
export { createTestSalesInvoice } from "./invoice-fixtures.js";
export type { SalesInvoiceLineInput } from "./invoice-fixtures.js";
