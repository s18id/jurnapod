// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * @jurnapod/modules-platform test fixtures
 *
 * This package provides deterministic, owner-package fixture functions for
 * platform domain (company/outlet). All functions accept injected `db: KyselySchema`.
 */

// Types
export type {
  CompanyFixture,
  OutletFixture,
} from "./types.js";

// Company fixtures
export {
  createTestCompanyMinimal,
  createTestCompanyWithoutTimezone,
} from "./company-fixtures.js";

// Outlet fixtures
export {
  createTestOutletMinimal,
  createTestOutletWithoutTimezone,
} from "./outlet-fixtures.js";
