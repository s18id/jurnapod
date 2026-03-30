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

import { createRealDbAdapter } from './real-adapter.js';
import { useRealDb } from './db-config.js';
import type { AuthConfig, AuthDbAdapter } from '../types.js';
import { testEnv } from './env.js';

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
 * Create a mock adapter
 */
export function createMockAdapter(): AuthDbAdapter {
  return null as unknown as AuthDbAdapter
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


/**
 * Test configuration for @jurnapod/auth
 */
export const testConfig: AuthConfig = {
  tokens: {
    accessTokenSecret: testEnv.tokens.accessTokenSecret,
    accessTokenTtlSeconds: testEnv.tokens.accessTokenTtlSeconds,
    refreshTokenSecret: testEnv.tokens.refreshTokenSecret,
    refreshTokenTtlSeconds: testEnv.tokens.refreshTokenTtlSeconds,
    issuer: testEnv.tokens.issuer || undefined,
    audience: testEnv.tokens.audience || undefined,
  },
  password: {
    defaultAlgorithm: testEnv.password.defaultAlgorithm,
    bcryptRounds: testEnv.password.bcryptRounds,
    argon2MemoryKb: testEnv.password.argon2MemoryKb,
    argon2TimeCost: testEnv.password.argon2TimeCost,
    argon2Parallelism: testEnv.password.argon2Parallelism,
    rehashOnLogin: testEnv.password.rehashOnLogin,
  },
  throttle: {
    baseDelayMs: testEnv.throttle.baseDelayMs,
    maxDelayMs: testEnv.throttle.maxDelayMs,
  },
  emailTokens: {
    passwordResetTtlMinutes: testEnv.emailTokens.passwordResetTtlMinutes,
    inviteTtlMinutes: testEnv.emailTokens.inviteTtlMinutes,
    verifyEmailTtlMinutes: testEnv.emailTokens.verifyEmailTtlMinutes,
  },
};
