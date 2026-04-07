// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Test Fixtures - Re-exports from lib/test-fixtures.ts
 * 
 * Use these for creating test data in integration tests.
 * All fixtures automatically register for cleanup.
 * 
 * Usage:
 * ```typescript
 * import { 
 *   createTestCompany, 
 *   createTestOutlet, 
 *   createTestUser,
 *   cleanupTestFixtures 
 * } from './fixtures';
 * 
 * test('creates item', async () => {
 *   const company = await createTestCompany();
 *   const outlet = await createTestOutlet(company.id);
 *   const user = await createTestUser(company.id);
 *   // ... test code
 * });
 * 
 * afterAll(async () => {
 *   await cleanupTestFixtures();
 * });
 * ```
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
  createTestFixtureSet,
  createFullTestFixtureSet,
  cleanupTestFixtures,
  resetFixtureRegistry,
  getRoleIdByCode,
  assignUserGlobalRole,
  assignUserOutletRole,
  setModulePermission,
  setupUserPermission,
  type CompanyFixture,
  type OutletFixture,
  type UserFixture,
  type ItemFixture,
  type VariantFixture,
} from '../../src/lib/test-fixtures';
