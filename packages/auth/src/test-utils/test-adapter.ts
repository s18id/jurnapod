/**
 * Test adapter factory
 * 
 * Returns mock adapter by default, or real database adapter when
 * AUTH_TEST_USE_DB=1 is set in environment.
 * 
 * Usage:
 *   import { createTestAdapter, useRealDb } from './test-adapter.js';
 *   const adapter = createTestAdapter();
 * 
 *   // For integration tests only:
 *   test('name', { skip: !useRealDb }, async () => { ... });
 */

import { createMockAdapter } from './mock-adapter.js';
import { createRealDbAdapter } from './real-adapter.js';
import { useRealDb } from './db-config.js';
import type { AuthDbAdapter } from '../types.js';

export { useRealDb };

/**
 * Create a test adapter (mock or real DB based on env)
 */
export function createTestAdapter(): AuthDbAdapter {
  if (useRealDb) {
    return createRealDbAdapter();
  }
  return createMockAdapter();
}

/**
 * Create a real database adapter (for integration tests that require it)
 * Throws if AUTH_TEST_USE_DB is not set
 */
export function requireRealAdapter(): AuthDbAdapter {
  if (!useRealDb) {
    throw new Error(
      'Real database adapter requested but AUTH_TEST_USE_DB is not set. ' +
      'Run tests with AUTH_TEST_USE_DB=1 or use createTestAdapter() for automatic selection.'
    );
  }
  return createRealDbAdapter();
}
