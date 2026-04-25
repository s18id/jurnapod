// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * @jurnapod/modules-accounting test fixtures
 *
 * This package provides deterministic, owner-package fixture functions for
 * accounting domain. All functions accept injected `db: KyselySchema`.
 */

// Types
export type {
  FiscalYearFixture,
  FiscalPeriodFixture,
  APReconciliationSettingsFixture,
} from "./types.js";

// Fiscal year fixtures
export {
  createTestFiscalYear,
} from "./fiscal-year-fixtures.js";

// Fiscal period fixtures
export {
  createTestFiscalPeriod,
} from "./fiscal-period-fixtures.js";

// Fiscal close balance fixture
export {
  createTestFiscalCloseBalanceFixture,
} from "./fiscal-close-fixture.js";

// AP reconciliation settings fixtures
export {
  createTestAPReconciliationSettings,
  clearTestAPReconciliationSettings,
  setTestCompanyStringSetting,
} from "./ap-reconciliation-settings-fixtures.js";
