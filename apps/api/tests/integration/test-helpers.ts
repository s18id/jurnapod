// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Test Helper Utilities
 * 
 * Standard patterns for API integration tests.
 * All test files using getDbPool() should follow these patterns.
 */

import { test } from "node:test";
import { closeDbPool } from "../../src/lib/db";

/**
 * Standard cleanup hook that MUST be used in ALL test files using getDbPool()
 * 
 * Place this at the end of every test file:
 * ```typescript
 * test.after(async () => {
 *   await closeDbPool();
 * });
 * ```
 * 
 * WHY: Tests that use getDbPool() create database connections. Without proper cleanup,
 * these connections remain open, causing:
 * - Test hangs (indefinite waiting)
 * - Connection pool exhaustion
 * - Subsequent test failures
 * - CI/CD timeouts
 * 
 * DO NOT use finally blocks for cleanup - they don't run if assertions fail.
 * DO NOT call closeDbPool() inside test functions - use test.after() hook.
 */
export function registerDbCleanup(): void {
  test.after(async () => {
    await closeDbPool();
  });
}

/**
 * Recommended: Add this comment template at the top of test files
 */
export const TEST_FILE_HEADER_COMMENT = `
/**
 * Test Cleanup Pattern
 * 
 * This file uses getDbPool() and MUST include cleanup at the end:
 * 
 * test.after(async () => {
 *   await closeDbPool();
 * });
 * 
 * See: apps/api/tests/integration/test-helpers.ts for details
 */
`;

/**
 * Testing Best Practices Checklist
 */
export const TEST_CHECKLIST = {
  // Database Tests
  hasDbPoolCleanup: "Add test.after(() => closeDbPool()) hook at end of file",
  usesFixtures: "Use createTestFixture() for test data instead of relying on existing data",
  cleansUpData: "Clean up test data in finally blocks within each test",
  
  // Test Structure
  hasProperTimeout: "Set appropriate timeout for DB tests (30s-120s)",
  handlesErrors: "Use try/catch or assert.rejects for error cases",
  
  // Assertions
  hasClearAssertions: "Each test should have clear, specific assertions",
  testsOneThing: "Each test should verify one specific behavior",
};

/**
 * Example: Proper test file structure
 */
export const EXAMPLE_TEST_FILE = `
import { test } from "node:test";
import assert from "node:assert/strict";
import { getDbPool, closeDbPool } from "../lib/db";
import { createTestFixture, type TestFixtureContext } from "../tests/integration/fixtures";

test("Example test with proper patterns", async () => {
  const dbPool = getDbPool();
  let fixture: TestFixtureContext | null = null;
  
  try {
    // Create test fixture
    fixture = await createTestFixture(dbPool, "example");
    
    // Run your test logic
    const result = await someFunction(fixture.company.id);
    
    // Assert results
    assert.strictEqual(result.success, true);
    
  } finally {
    // Cleanup test data
    if (fixture) {
      await fixture.cleanup();
    }
  }
});

// REQUIRED: Cleanup hook at end of file
test.after(async () => {
  await closeDbPool();
});
`;

/**
 * Lint Rule Recommendation
 * 
 * Consider adding this to your linter configuration to enforce cleanup:
 * 
 * ```json
 * {
 *   "rules": {
 *     "test-cleanup": ["error", {
 *       "files": "*.test.ts",
 *       "require": "test.after(async () => { await closeDbPool(); })"
 *     }]
 *   }
 * }
 * ```
 */

/**
 * Migration Guide: Fixing Existing Tests
 * 
 * If you find a test with non-standard cleanup:
 * 
 * 1. Find the closeDbPool() call (usually in finally block)
 * 2. Remove it from the finally block
 * 3. Add test.after() hook at end of file
 * 
 * Before:
 * ```typescript
 * try {
 *   // test code
 * } finally {
 *   await closeDbPool();  // ❌ Remove this
 * }
 * ```
 * 
 * After:
 * ```typescript
 * try {
 *   // test code
 * } finally {
 *   // cleanup test data only
 * }
 * 
 * test.after(async () => {
 *   await closeDbPool();  // ✅ Add this at end of file
 * });
 * ```
 */
