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
import { LoginThrottle } from '../../src/throttle/login-throttle.js';
import { createRealDbAdapter, closeTestPool } from '../../src/test-utils/real-adapter.js';
import { useRealDb } from '../../src/test-utils/test-adapter.js';
import type { AuthConfig } from '../../src/types.js';

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

test.after(async () => {
  await closeTestPool();
});

// ---------------------------------------------------------------------------
// Test config
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Test 1: recordFailure() creates throttle record
// ---------------------------------------------------------------------------

test('LoginThrottle Integration - recordFailure() creates throttle record', { skip: !useRealDb }, async () => {
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
  const rows = await adapter.db
    .selectFrom('auth_login_throttles')
    .where('key_hash', 'in', keys.map(k => k.hash))
    .select(['key_hash', 'failure_count', 'last_ip', 'last_user_agent'])
    .execute();

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

// ---------------------------------------------------------------------------
// Test 2: recordFailure() increments failure count
// ---------------------------------------------------------------------------

test('LoginThrottle Integration - recordFailure() increments failure count', { skip: !useRealDb }, async () => {
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
  const rows = await adapter.db
    .selectFrom('auth_login_throttles')
    .where('key_hash', 'in', keys.map(k => k.hash))
    .select(['key_hash', 'failure_count'])
    .execute();

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

// ---------------------------------------------------------------------------
// Test 3: getDelay() calculates exponential backoff
// ---------------------------------------------------------------------------

test('LoginThrottle Integration - getDelay() calculates exponential backoff', { skip: !useRealDb }, async () => {
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

// ---------------------------------------------------------------------------
// Test 4: getDelay() caps at max delay
// ---------------------------------------------------------------------------

test('LoginThrottle Integration - getDelay() caps at max delay', { skip: !useRealDb }, async () => {
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

// ---------------------------------------------------------------------------
// Test 5: recordSuccess() clears throttle entries
// ---------------------------------------------------------------------------

test('LoginThrottle Integration - recordSuccess() clears throttle entries', { skip: !useRealDb }, async () => {
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
  let rows = await adapter.db
    .selectFrom('auth_login_throttles')
    .where('key_hash', 'in', keys.map(k => k.hash))
    .select(['key_hash'])
    .execute();
  assert.strictEqual(rows.length, 2, 'Should have 2 throttle records before clear');

  // Call recordSuccess to clear
  await throttle.recordSuccess(keys);

  // Verify entries deleted from database
  rows = await adapter.db
    .selectFrom('auth_login_throttles')
    .where('key_hash', 'in', keys.map(k => k.hash))
    .select(['key_hash'])
    .execute();
  assert.strictEqual(rows.length, 0, 'All throttle entries should be deleted');

  // Verify getDelay returns 0
  const delay = await throttle.getDelay(keys);
  assert.strictEqual(delay, 0, 'getDelay should return 0 after recordSuccess');
});
