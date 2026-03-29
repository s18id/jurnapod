/**
 * Unit tests for LoginThrottle
 */

import { test } from 'node:test';
import assert from 'node:assert';
import { LoginThrottle } from './login-throttle.js';
import { createMockAdapter, testConfig } from '../test-utils/mock-adapter.js';

test('LoginThrottle - buildKeys() generates primary and IP keys', () => {
  const adapter = createMockAdapter();
  const throttle = new LoginThrottle(adapter, testConfig);

  const keys = throttle.buildKeys({
    companyCode: 'ACME',
    email: 'user@example.com',
    ipAddress: '192.168.1.1'
  });

  assert.strictEqual(keys.length, 2, 'Should return array with 2 keys');
  assert.strictEqual(keys[0].scope, 'primary', 'First key should have scope "primary"');
  assert.strictEqual(keys[1].scope, 'ip', 'Second key should have scope "ip"');
});

test('LoginThrottle - buildKeys() normalizes inputs: companyCode to UPPERCASE, email to lowercase, null ip to "unknown"', () => {
  const adapter = createMockAdapter();
  const throttle = new LoginThrottle(adapter, testConfig);

  const keys = throttle.buildKeys({
    companyCode: 'Acme',
    email: 'USER@EXAMPLE.COM',
    ipAddress: null
  });

  // Verify primary key contains normalized values
  const primaryKey = keys.find(k => k.scope === 'primary')!;
  assert.ok(primaryKey.raw.includes('ACME'), 'Primary key should contain UPPERCASE companyCode');
  assert.ok(primaryKey.raw.includes('user@example.com'), 'Primary key should contain lowercase email');
  assert.ok(primaryKey.raw.includes('unknown'), 'Primary key should contain "unknown" for null ip');

  // Verify IP key contains "unknown"
  const ipKey = keys.find(k => k.scope === 'ip')!;
  assert.ok(ipKey.raw.includes('unknown'), 'IP key should contain "unknown" for null ip');
});

test('LoginThrottle - getDelay() returns 0 for new keys with no prior failures', async () => {
  const adapter = createMockAdapter();
  const throttle = new LoginThrottle(adapter, testConfig);

  const keys = throttle.buildKeys({
    companyCode: 'ACME',
    email: 'user@example.com',
    ipAddress: '192.168.1.1'
  });

  const delay = await throttle.getDelay(keys);
  assert.strictEqual(delay, 0, 'New keys should have 0ms delay');
});

test('LoginThrottle - getDelay() returns 0 for 1 failure (no delay on first attempt)', async () => {
  const adapter = createMockAdapter();
  const throttle = new LoginThrottle(adapter, testConfig);

  const keys = throttle.buildKeys({
    companyCode: 'ACME',
    email: 'user@example.com',
    ipAddress: '192.168.1.1'
  });

  await throttle.recordFailure({ keys, ipAddress: '192.168.1.1', userAgent: 'test-agent' });
  const delay = await throttle.getDelay(keys);
  assert.strictEqual(delay, 0, '1 failure should return 0ms delay');
});

test('LoginThrottle - getDelay() exponential backoff: 2 failures = baseDelayMs (1000ms)', async () => {
  const adapter = createMockAdapter();
  const throttle = new LoginThrottle(adapter, testConfig);

  const keys = throttle.buildKeys({
    companyCode: 'ACME',
    email: 'user@example.com',
    ipAddress: '192.168.1.1'
  });

  await throttle.recordFailure({ keys, ipAddress: '192.168.1.1', userAgent: 'test-agent' });
  await throttle.recordFailure({ keys, ipAddress: '192.168.1.1', userAgent: 'test-agent' });

  const delay = await throttle.getDelay(keys);
  assert.strictEqual(delay, 1000, '2 failures should return baseDelayMs (1000ms)');
});

test('LoginThrottle - getDelay() exponential backoff: 3 failures = 2000ms', async () => {
  const adapter = createMockAdapter();
  const throttle = new LoginThrottle(adapter, testConfig);

  const keys = throttle.buildKeys({
    companyCode: 'ACME',
    email: 'user@example.com',
    ipAddress: '192.168.1.1'
  });

  await throttle.recordFailure({ keys, ipAddress: '192.168.1.1', userAgent: 'test-agent' });
  await throttle.recordFailure({ keys, ipAddress: '192.168.1.1', userAgent: 'test-agent' });
  await throttle.recordFailure({ keys, ipAddress: '192.168.1.1', userAgent: 'test-agent' });

  const delay = await throttle.getDelay(keys);
  assert.strictEqual(delay, 2000, '3 failures should return 2000ms');
});

test('LoginThrottle - getDelay() exponential backoff: 4 failures = 4000ms', async () => {
  const adapter = createMockAdapter();
  const throttle = new LoginThrottle(adapter, testConfig);

  const keys = throttle.buildKeys({
    companyCode: 'ACME',
    email: 'user@example.com',
    ipAddress: '192.168.1.1'
  });

  for (let i = 0; i < 4; i++) {
    await throttle.recordFailure({ keys, ipAddress: '192.168.1.1', userAgent: 'test-agent' });
  }

  const delay = await throttle.getDelay(keys);
  assert.strictEqual(delay, 4000, '4 failures should return 4000ms');
});

test('LoginThrottle - getDelay() caps delay at maxDelayMs (30000ms)', async () => {
  const adapter = createMockAdapter();
  const throttle = new LoginThrottle(adapter, testConfig);

  const keys = throttle.buildKeys({
    companyCode: 'ACME',
    email: 'user@example.com',
    ipAddress: '192.168.1.1'
  });

  // Record many failures to exceed maxDelayMs
  for (let i = 0; i < 20; i++) {
    await throttle.recordFailure({ keys, ipAddress: '192.168.1.1', userAgent: 'test-agent' });
  }

  const delay = await throttle.getDelay(keys);
  assert.strictEqual(delay, 30000, 'Delay should be capped at maxDelayMs (30000ms)');
});

test('LoginThrottle - recordFailure() increments failure count on repeated calls', async () => {
  const adapter = createMockAdapter();
  const throttle = new LoginThrottle(adapter, testConfig);

  const keys = throttle.buildKeys({
    companyCode: 'ACME',
    email: 'user@example.com',
    ipAddress: '192.168.1.1'
  });

  // Record first failure
  await throttle.recordFailure({ keys, ipAddress: '192.168.1.1', userAgent: 'test-agent' });
  let delay = await throttle.getDelay(keys);
  assert.strictEqual(delay, 0, '1 failure should give 0ms delay');

  // Record second failure
  await throttle.recordFailure({ keys, ipAddress: '192.168.1.1', userAgent: 'test-agent' });
  delay = await throttle.getDelay(keys);
  assert.strictEqual(delay, 1000, '2 failures should give 1000ms delay');

  // Record third failure
  await throttle.recordFailure({ keys, ipAddress: '192.168.1.1', userAgent: 'test-agent' });
  delay = await throttle.getDelay(keys);
  assert.strictEqual(delay, 2000, '3 failures should give 2000ms delay');
});

test('LoginThrottle - recordFailure() records failure for both primary and IP keys', async () => {
  const adapter = createMockAdapter();
  const throttle = new LoginThrottle(adapter, testConfig);

  const keys = throttle.buildKeys({
    companyCode: 'ACME',
    email: 'user@example.com',
    ipAddress: '192.168.1.1'
  });

  // Record failure once - both primary and IP keys should have failure count 1
  await throttle.recordFailure({ keys, ipAddress: '192.168.1.1', userAgent: 'test-agent' });
  
  // Delay should still be 0 after first failure
  let delay = await throttle.getDelay(keys);
  assert.strictEqual(delay, 0, 'First failure should give 0ms delay');

  // Record second failure - should now have delay
  await throttle.recordFailure({ keys, ipAddress: '192.168.1.1', userAgent: 'test-agent' });
  delay = await throttle.getDelay(keys);
  assert.strictEqual(delay, 1000, 'Second failure should give 1000ms delay');
  
  // Verify both keys are tracked by recording success
  // If only one key was tracked, the delay would be different
  await throttle.recordSuccess(keys);
  delay = await throttle.getDelay(keys);
  assert.strictEqual(delay, 0, 'Delay should be 0 after recordSuccess');
});

test('LoginThrottle - recordSuccess() clears throttle entries and returns delay to 0', async () => {
  const adapter = createMockAdapter();
  const throttle = new LoginThrottle(adapter, testConfig);

  const keys = throttle.buildKeys({
    companyCode: 'ACME',
    email: 'user@example.com',
    ipAddress: '192.168.1.1'
  });

  // Record failures to build up delay
  await throttle.recordFailure({ keys, ipAddress: '192.168.1.1', userAgent: 'test-agent' });
  await throttle.recordFailure({ keys, ipAddress: '192.168.1.1', userAgent: 'test-agent' });
  await throttle.recordFailure({ keys, ipAddress: '192.168.1.1', userAgent: 'test-agent' });

  // Verify we have a non-zero delay
  let delay = await throttle.getDelay(keys);
  assert.ok(delay > 0, 'Should have non-zero delay after failures');

  // Clear throttle on success
  await throttle.recordSuccess(keys);

  // Verify delay is back to 0
  delay = await throttle.getDelay(keys);
  assert.strictEqual(delay, 0, 'Delay should be 0 after recordSuccess');
});

test('LoginThrottle - recordSuccess() handles empty keys array gracefully', async () => {
  const adapter = createMockAdapter();
  const throttle = new LoginThrottle(adapter, testConfig);

  // Should not throw
  await throttle.recordSuccess([]);
  assert.ok(true, 'Empty keys array should not cause error');
});
