// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Test Fixtures - Re-exports from lib/test-fixtures.ts
 * 
 * =============================================================================
 * HYBRID CLEANUP POLICY (Default: Option 1 - Unique-per-test data)
 * =============================================================================
 * 
 * Option 1 (DEFAULT): Unique-per-test data, no destructive cleanup
 * Tests use timestamp-based unique codes. afterAll should call
 * resetFixtureRegistry() to clear the registry without deleting records.
 * 
 * ```typescript
 * import { 
 *   createTestCompany, 
 *   createTestOutlet, 
 *   createTestUser,
 *   resetFixtureRegistry 
 * } from './fixtures';
 * 
 * test('creates item', async () => {
 *   const company = await createTestCompany();
 *   const outlet = await createTestOutlet(company.id);
 *   // ... test code
 * });
 * 
 * afterAll(async () => {
 *   resetFixtureRegistry();  // Default: reset registry without deleting
 *   await closeTestDb();
 * });
 * ```
 * 
 * Option 2 (OPT-IN): Strict scoped cleanup with destructive deletes
 * Use cleanupTestFixtures() instead when immediate cleanup is required.
 * 
 * ```typescript
 * import { 
 *   createTestCompany, 
 *   cleanupTestFixtures 
 * } from './fixtures';
 * 
 * afterAll(async () => {
 *   await cleanupTestFixtures();  // Opt-in: explicitly delete records
 *   await closeTestDb();
 * });
 * ```
 * 
 * =============================================================================
 * DEFAULT POLICY RATIONALE:
 * - Unique-per-test data is the safest default (no data collisions)
 * - resetFixtureRegistry() is faster (no DELETE queries)
 * - Cascade deletes handle FK constraints naturally
 * - cleanupTestFixtures() remains available for tests that need it
 */

import { getTestDb } from '../helpers/db';
import {
  createTestCompanyMinimal as pkgCreateTestCompanyMinimal,
  createTestCompanyWithoutTimezone as pkgCreateTestCompanyWithoutTimezone,
  createTestOutletMinimal as pkgCreateTestOutletMinimal,
  createTestOutletWithoutTimezone as pkgCreateTestOutletWithoutTimezone,
  type CompanyFixture as PlatformCompanyFixture,
  type OutletFixture as PlatformOutletFixture,
} from '@jurnapod/modules-platform/test-fixtures';
import {
  createTestFiscalYear as pkgCreateTestFiscalYear,
  createTestFiscalPeriod as pkgCreateTestFiscalPeriod,
  createTestFiscalCloseBalanceFixture as pkgCreateTestFiscalCloseBalanceFixture,
  createTestAPReconciliationSettings as pkgCreateTestAPReconciliationSettings,
  clearTestAPReconciliationSettings as pkgClearTestAPReconciliationSettings,
  setTestCompanyStringSetting as pkgSetTestCompanyStringSetting,
  type FiscalYearFixture as AccountingFiscalYearFixture,
  type FiscalPeriodFixture as AccountingFiscalPeriodFixture,
  type APReconciliationSettingsFixture as AccountingAPReconciliationSettingsFixture,
} from '@jurnapod/modules-accounting/test-fixtures';

// Re-export all fixtures from lib/test-fixtures
export {
  createTestCompany,
  createTestOutlet,
  createTestUser,
  createTestItem,
  createTestVariant,
  createTestPrice,
  createTestStock,
  createTestInventoryStock,
  createTestInventoryTransaction,
  setTestItemLowStockThreshold,
  createTestFixtureSet,
  createFullTestFixtureSet,
  registerFixtureCleanup,
  cleanupTestFixtures,
  resetFixtureRegistry,
  getRoleIdByCode,
  assignUserGlobalRole,
  assignUserOutletRole,
  setModulePermission,
  setupUserPermission,
  getSeedSyncContext,
  getTestAccessToken,
  getOrCreateTestCashierForPermission,
  loginForTest,
  createTestRole,
  createTestCustomer,
  createTestCustomerForCompany,
  createTestSupplier,
  createTestPurchasingAccounts,
  createTestPurchasingSettings,
  createTestBankAccount,
  setTestSupplierActive,
  setTestBankAccountActive,
  setTestPurchasingDefaultApAccount,
  createTestSupplierStatement,
  createTestAPException,
  ensureTestSalesAccountMappings,
  ensureTestPaymentVarianceMappings,
  expectImmutableTable,
  type UserFixture,
  type ItemFixture,
  type VariantFixture,
  type PriceFixture,
  type SeedSyncContext,
} from '../../src/lib/test-fixtures';

// Story 50.2 consumer flip: source platform/accounting fixture symbols from owner packages.
// Keep API-level signatures by injecting test DB in this fixture index wrapper.
export async function createTestCompanyMinimal(
  options?: Partial<{ code: string; name: string; timezone: string; currency_code: string }>
): Promise<PlatformCompanyFixture> {
  return pkgCreateTestCompanyMinimal(getTestDb(), options);
}

export async function createTestCompanyWithoutTimezone(
  options?: Partial<{ code: string; name: string; currency_code: string }>
): Promise<PlatformCompanyFixture> {
  return pkgCreateTestCompanyWithoutTimezone(getTestDb(), options);
}

export async function createTestOutletMinimal(
  companyId: number,
  options?: Partial<{ code: string; name: string; timezone: string }>
): Promise<PlatformOutletFixture> {
  return pkgCreateTestOutletMinimal(getTestDb(), companyId, options);
}

export async function createTestOutletWithoutTimezone(
  companyId: number,
  options?: Partial<{ code: string; name: string }>
): Promise<PlatformOutletFixture> {
  return pkgCreateTestOutletWithoutTimezone(getTestDb(), companyId, options);
}

export async function createTestFiscalYear(
  companyId: number,
  options?: Partial<{ year: number; startDate: string; endDate: string; status: 'OPEN' | 'CLOSED' }>
): Promise<AccountingFiscalYearFixture> {
  return pkgCreateTestFiscalYear(getTestDb(), companyId, options);
}

export async function createTestFiscalPeriod(
  fiscalYearId: number,
  options?: Partial<{ periodNumber: number; startDate: string; endDate: string; status: 'OPEN' | 'CLOSED' }>
): Promise<AccountingFiscalPeriodFixture> {
  return pkgCreateTestFiscalPeriod(getTestDb(), fiscalYearId, options);
}

export async function createTestFiscalCloseBalanceFixture(
  companyId: number,
  options?: Partial<{
    retainedEarningsName: string;
    plAccountName: string;
    plBalance: string;
    plNormalBalance: 'D' | 'K';
    asOfDate: string;
  }>
): Promise<{ retained_earnings_account_id: number; pl_account_id: number }> {
  return pkgCreateTestFiscalCloseBalanceFixture(getTestDb(), companyId, options);
}

export async function createTestAPReconciliationSettings(
  companyId: number,
  accountIds: number[],
  options?: Partial<{ description: string }>
): Promise<AccountingAPReconciliationSettingsFixture> {
  return pkgCreateTestAPReconciliationSettings(getTestDb(), companyId, accountIds, options);
}

export async function clearTestAPReconciliationSettings(companyId: number): Promise<void> {
  return pkgClearTestAPReconciliationSettings(getTestDb(), companyId);
}

export async function setTestCompanyStringSetting(
  companyId: number,
  settingKey: string,
  settingValue: string
): Promise<void> {
  return pkgSetTestCompanyStringSetting(getTestDb(), companyId, settingKey, settingValue);
}

export type CompanyFixture = PlatformCompanyFixture;
export type OutletFixture = PlatformOutletFixture;
export type FiscalYearFixture = AccountingFiscalYearFixture;
export type FiscalPeriodFixture = AccountingFiscalPeriodFixture;
export type APReconciliationSettingsFixture = AccountingAPReconciliationSettingsFixture;

// Re-export canonical constants from @jurnapod/db/test-fixtures
// Q49-001 Pass 1: evidence of consumer flip to package fixture export
export {
  AP_EXCEPTION_TYPE,
  AP_EXCEPTION_STATUS,
} from '@jurnapod/db/test-fixtures';
export type {
  APExceptionTypeKey,
  APExceptionTypeValue,
  APExceptionStatusKey,
  APExceptionStatusValue,
} from '@jurnapod/db/test-fixtures';
