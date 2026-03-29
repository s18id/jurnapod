/**
 * Integration tests for LoginThrottle
 * 
 * These tests use a real database adapter and require:
 *   AUTH_TEST_USE_DB=1 npm test
 * 
 * Or run with: AUTH_TEST_USE_DB=1 npx node --test src/throttle/login-throttle.integration.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert';
import { LoginThrottle } from './login-throttle.js';
import { createRealDbAdapter, closeTestPool } from '../test-utils/real-adapter.js';
import { useRealDb } from '../test-utils/test-adapter.js';
import type { AuthConfig } from '../types.js';

// Custom config for integration tests with smaller delays for faster testing
const integrationConfig: AuthConfig = {
  tokens: {
    accessTokenSecret: 'test-secret-32-chars-long-for-testing!!',
    accessTokenTtlSeconds: 900,
    refreshTokenSecret: 'refresh-secret-32-chars-long!!!',
    refreshTokenTtlSeconds: 604800,
  },
  password: {
    defaultAlgorithm: 'argon2id',
    bcryptRounds: 12,
    argon2MemoryKb: 65536,
    argon2TimeCost: 3,
    argon2Parallelism: 4,
    rehashOnLogin: true,
  },
  throttle: {
    baseDelayMs: 100,  // 100ms for faster test feedback
    maxDelayMs: 5000,   // 5s cap
  },
};

// Skip integration tests if real DB is not enabled
const testSuite = useRealDb ? test : test.skip;

testSuite('LoginThrottle Integration - recordFailure() creates throttle record', async () => {
  const adapter = createRealDbAdapter();
  const throttle = new LoginThrottle(adapter, integrationConfig);

  const keys = throttle.buildKeys({
    companyCode: 'ACME',
    email: 'user@example.com',
    ipAddress: '192.168.1.1'
  });

  await throttle.recordFailure({
    keys,
    ipAddress: '192.168.1.1',
    userAgent: 'test-agent'
  });

  // Verify record exists in auth_login_throttles table
  const rows = await adapter.query<{
    key_hash: string;
    failure_count: number;
    last_ip: string | null;
    last_user_agent: string | null;
  }>(
    `SELECT key_hash, failure_count, last_ip, last_user_agent
     FROM auth_login_throttles
     WHERE key_hash IN (?, ?)`,
    keys.map(k => k.hash)
  );

  assert.strictEqual(rows.length, 2, 'Should have 2 throttle records (primary + IP key)');
  
  // Verify both keys have failure_count of 1
  for (const row of rows) {
    assert.strictEqual(Number(row.failure_count), 1, `Key ${row.key_hash} should have failure_count = 1`);
    assert.strictEqual(row.last_ip, '192.168.1.1');
    assert.strictEqual(row.last_user_agent, 'test-agent');
  }

  // Cleanup
  await throttle.recordSuccess(keys);
});

testSuite('LoginThrottle Integration - recordFailure() increments failure count', async () => {
  const adapter = createRealDbAdapter();
  const throttle = new LoginThrottle(adapter, integrationConfig);

  const keys = throttle.buildKeys({
    companyCode: 'ACME',
    email: 'user@example.com',
    ipAddress: '192.168.1.1'
  });

  // Record failure 3 times
  for (let i = 0; i < 3; i++) {
    await throttle.recordFailure({
      keys,
      ipAddress: '192.168.1.1',
      userAgent: 'test-agent'
    });
  }

  // Verify failure_count = 3 in database
  const rows = await adapter.query<{ key_hash: string; failure_count: number }>(
    `SELECT key_hash, failure_count
     FROM auth_login_throttles
     WHERE key_hash IN (?, ?)`,
    keys.map(k => k.hash)
  );

  assert.strictEqual(rows.length, 2, 'Should have 2 throttle records');
  
  for (const row of rows) {
    assert.strictEqual(
      Number(row.failure_count),
      3,
      `Key ${row.key_hash} should have failure_count = 3`
    );
  }

  // Cleanup
  await throttle.recordSuccess(keys);
});

testSuite('LoginThrottle Integration - getDelay() calculates exponential backoff', async () => {
  const adapter = createRealDbAdapter();
  const throttle = new LoginThrottle(adapter, integrationConfig);

  const keys = throttle.buildKeys({
    companyCode: 'ACME',
    email: 'user@example.com',
    ipAddress: '192.168.1.1'
  });

  // 1 failure: delay = 0
  await throttle.recordFailure({ keys, ipAddress: '192.168.1.1', userAgent: 'test-agent' });
  let delay = await throttle.getDelay(keys);
  assert.strictEqual(delay, 0, '1 failure: delay should be 0ms');

  // 2 failures: delay = baseDelayMs (100ms)
  await throttle.recordFailure({ keys, ipAddress: '192.168.1.1', userAgent: 'test-agent' });
  delay = await throttle.getDelay(keys);
  assert.strictEqual(delay, 100, '2 failures: delay should be baseDelayMs (100ms)');

  // 3 failures: delay = 200ms
  await throttle.recordFailure({ keys, ipAddress: '192.168.1.1', userAgent: 'test-agent' });
  delay = await throttle.getDelay(keys);
  assert.strictEqual(delay, 200, '3 failures: delay should be 200ms');

  // 4 failures: delay = 400ms (doubling pattern)
  await throttle.recordFailure({ keys, ipAddress: '192.168.1.1', userAgent: 'test-agent' });
  delay = await throttle.getDelay(keys);
  assert.strictEqual(delay, 400, '4 failures: delay should be 400ms');

  // Cleanup
  await throttle.recordSuccess(keys);
});

testSuite('LoginThrottle Integration - getDelay() caps at max delay', async () => {
  const adapter = createRealDbAdapter();
  const throttle = new LoginThrottle(adapter, integrationConfig);

  const keys = throttle.buildKeys({
    companyCode: 'ACME',
    email: 'user@example.com',
    ipAddress: '192.168.1.1'
  });

  // Record many failures to exceed maxDelayMs (5000ms)
  // With baseDelayMs=100, failure count needed for 5000ms:
  // delay = 100 * 2^(n-2), so for n=7: 100 * 2^5 = 3200ms, n=8: 6400ms (capped)
  for (let i = 0; i < 10; i++) {
    await throttle.recordFailure({ keys, ipAddress: '192.168.1.1', userAgent: 'test-agent' });
  }

  const delay = await throttle.getDelay(keys);
  assert.ok(
    delay <= 5000,
    `Delay should be capped at maxDelayMs (5000ms), got: ${delay}ms`
  );
  assert.ok(
    delay > 4000,
    `Delay should be near maxDelayMs (was 6400ms before cap), got: ${delay}ms`
  );

  // Cleanup
  await throttle.recordSuccess(keys);
});

testSuite('LoginThrottle Integration - recordSuccess() clears throttle entries', async () => {
  const adapter = createRealDbAdapter();
  const throttle = new LoginThrottle(adapter, integrationConfig);

  const keys = throttle.buildKeys({
    companyCode: 'ACME',
    email: 'user@example.com',
    ipAddress: '192.168.1.1'
  });

  // Record failures
  for (let i = 0; i < 3; i++) {
    await throttle.recordFailure({ keys, ipAddress: '192.168.1.1', userAgent: 'test-agent' });
  }

  // Verify we have records
  let rows = await adapter.query<{ key_hash: string }>(
    `SELECT key_hash FROM auth_login_throttles WHERE key_hash IN (?, ?)`,
    keys.map(k => k.hash)
  );
  assert.strictEqual(rows.length, 2, 'Should have 2 throttle records before clear');

  // Call recordSuccess to clear
  await throttle.recordSuccess(keys);

  // Verify entries deleted from database
  rows = await adapter.query<{ key_hash: string }>(
    `SELECT key_hash FROM auth_login_throttles WHERE key_hash IN (?, ?)`,
    keys.map(k => k.hash)
  );
  assert.strictEqual(rows.length, 0, 'All throttle entries should be deleted');

  // Verify getDelay returns 0
  const delay = await throttle.getDelay(keys);
  assert.strictEqual(delay, 0, 'getDelay should return 0 after recordSuccess');
});

testSuite('LoginThrottle Integration - Cleanup', async () => {
  // This test ensures database pool is properly closed
  // It runs last due to test.after
  const adapter = createRealDbAdapter();
  const throttle = new LoginThrottle(adapter, integrationConfig);

  const keys = throttle.buildKeys({
    companyCode: 'CLEANUP',
    email: 'cleanup@example.com',
    ipAddress: '10.0.0.1'
  });

  // Ensure no leftover throttle entries from previous tests
  await throttle.recordSuccess(keys);

  // Close the database pool
  await closeTestPool();
  
  assert.ok(true, 'Database pool should be closed without errors');
});
