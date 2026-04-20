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

// Re-export all fixtures from lib/test-fixtures
export {
  createTestCompanyMinimal,
  createTestCompany,
  createTestOutletMinimal,
  createTestOutlet,
  createTestUser,
  createTestItem,
  createTestVariant,
  createTestPrice,
  createTestStock,
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
  createTestFiscalYear,
  createTestFiscalPeriod,
  createTestAPReconciliationSettings,
  createTestSupplierStatement,
  createTestAPException,
  setTestCompanyStringSetting,
  type CompanyFixture,
  type OutletFixture,
  type UserFixture,
  type ItemFixture,
  type VariantFixture,
  type PriceFixture,
  type SeedSyncContext,
} from '../../src/lib/test-fixtures';
