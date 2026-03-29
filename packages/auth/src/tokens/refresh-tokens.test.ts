/**
 * Comprehensive tests for RefreshTokenManager
 */

import { test, beforeEach } from 'node:test';
import assert from 'node:assert';
import { createHmac, randomBytes } from 'node:crypto';
import { RefreshTokenManager, REFRESH_TOKEN_COOKIE_NAME } from './refresh-tokens.js';
import { createMockAdapter, testConfig } from '../test-utils/mock-adapter.js';
import type { MockAdapter } from '../test-utils/mock-adapter.js';

test('RefreshTokenManager - issue() creates token with correct hash', async () => {
  const adapter = createMockAdapter({
    users: [{ id: 1, company_id: 1, email: 'test@example.com', is_active: 1 }]
  });
  const manager = new RefreshTokenManager(adapter, testConfig);
  const testSecret = testConfig.tokens.refreshTokenSecret;

  function hashToken(token: string): string {
    return createHmac('sha256', testSecret).update(token).digest('hex');
  }

  const result = await manager.issue({
    userId: 1,
    companyId: 1,
    ipAddress: '127.0.0.1',
    userAgent: 'TestBrowser/1.0'
  });

  // Token should be generated
  assert.ok(result.token, 'Token should be generated');
  assert.ok(result.token.length > 0, 'Token should not be empty');

  // Find the stored token in mock data
  const storedTokens = adapter.data.auth_refresh_tokens || [];
  assert.strictEqual(storedTokens.length, 1, 'Should have 1 stored token');

  const storedToken = storedTokens[0];

  // Hash should be stored, not raw token
  assert.notStrictEqual(storedToken.token_hash, result.token, 'Hash should not be raw token');
  assert.strictEqual(storedToken.token_hash, hashToken(result.token), 'Hash should match');

  // expires_at should be set correctly (7 days from now)
  assert.ok(storedToken.expires_at instanceof Date, 'expires_at should be a Date');
  const expectedExpiry = new Date(Date.now() + testConfig.tokens.refreshTokenTtlSeconds * 1000);
  const toleranceMs = 5000; // 5 second tolerance
  assert.ok(
    Math.abs(storedToken.expires_at.getTime() - expectedExpiry.getTime()) < toleranceMs,
    'expires_at should be approximately 7 days from now'
  );

  // tokenId should be returned
  assert.ok(result.tokenId, 'tokenId should be returned');
  assert.strictEqual(typeof result.tokenId, 'number', 'tokenId should be a number');
  assert.ok(result.tokenId > 0, 'tokenId should be positive');
});

test('RefreshTokenManager - issue() stores metadata (IP, user agent)', async () => {
  const adapter = createMockAdapter({
    users: [{ id: 1, company_id: 1, email: 'test@example.com', is_active: 1 }]
  });
  const manager = new RefreshTokenManager(adapter, testConfig);

  await manager.issue({
    userId: 1,
    companyId: 1,
    ipAddress: '192.168.1.100',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
  });

  const storedTokens = adapter.data.auth_refresh_tokens || [];
  assert.strictEqual(storedTokens.length, 1, 'Should have 1 stored token');

  assert.strictEqual(storedTokens[0].ip_address, '192.168.1.100', 'ip_address should be stored');
  assert.strictEqual(storedTokens[0].user_agent, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 'user_agent should be stored');
});

test('RefreshTokenManager - issue() stores null when metadata not provided', async () => {
  const adapter = createMockAdapter({
    users: [{ id: 1, company_id: 1, email: 'test@example.com', is_active: 1 }]
  });
  const manager = new RefreshTokenManager(adapter, testConfig);

  await manager.issue({
    userId: 1,
    companyId: 1,
    ipAddress: null,
    userAgent: null
  });

  const storedTokens = adapter.data.auth_refresh_tokens || [];
  assert.strictEqual(storedTokens[0].ip_address, null, 'ip_address should be null');
  assert.strictEqual(storedTokens[0].user_agent, null, 'user_agent should be null');
});

test('RefreshTokenManager - rotate() success case revokes old and issues new', async () => {
  const adapter = createMockAdapter({
    users: [{ id: 1, company_id: 1, email: 'test@example.com', is_active: 1 }]
  });
  const manager = new RefreshTokenManager(adapter, testConfig);

  // Issue initial token
  const issueResult = await manager.issue({
    userId: 1,
    companyId: 1,
    ipAddress: '10.0.0.1',
    userAgent: 'OldBrowser/1.0'
  });

  // Rotate the token
  const rotateResult = await manager.rotate(issueResult.token, {
    ipAddress: '10.0.0.2',
    userAgent: 'NewBrowser/1.0'
  });

  assert.strictEqual(rotateResult.success, true, 'Rotation should succeed');
  if (!rotateResult.success) throw new Error('Rotation should succeed');

  // Verify new token is returned
  assert.ok(rotateResult.token, 'New token should be returned');
  assert.notStrictEqual(rotateResult.token, issueResult.token, 'New token should be different');

  // Verify rotated_from_id is set
  assert.strictEqual(rotateResult.rotatedFromId, issueResult.tokenId, 'rotatedFromId should be set');

  // Verify user and company are carried over
  assert.strictEqual(rotateResult.userId, 1, 'userId should be carried over');
  assert.strictEqual(rotateResult.companyId, 1, 'companyId should be carried over');

  // Verify old token is revoked
  const storedTokens = adapter.data.auth_refresh_tokens || [];
  const oldToken = storedTokens.find(t => t.id === issueResult.tokenId);
  assert.ok(oldToken?.revoked_at, 'Old token should be revoked');
  assert.notStrictEqual(oldToken?.revoked_at, null, 'Old token revoked_at should not be null');

  // Verify new token has rotated_from_id set
  const newToken = storedTokens.find(t => t.id === rotateResult.tokenId);
  assert.strictEqual(newToken?.rotated_from_id, issueResult.tokenId, 'New token rotated_from_id should reference old token');
  assert.strictEqual(newToken?.ip_address, '10.0.0.2', 'New token ip_address should be updated');
  assert.strictEqual(newToken?.user_agent, 'NewBrowser/1.0', 'New token user_agent should be updated');
});

test('RefreshTokenManager - rotate() returns not_found for invalid token', async () => {
  const adapter = createMockAdapter({
    users: [{ id: 1, company_id: 1, email: 'test@example.com', is_active: 1 }]
  });
  const manager = new RefreshTokenManager(adapter, testConfig);

  const result = await manager.rotate('garbage-token-that-does-not-exist', {
    ipAddress: null,
    userAgent: null
  });

  assert.strictEqual(result.success, false, 'Should not succeed');
  if (result.success) throw new Error('Should not succeed');
  assert.strictEqual(result.reason, 'not_found', 'Reason should be not_found');
});

test('RefreshTokenManager - rotate() returns revoked for already revoked token', async () => {
  const adapter = createMockAdapter({
    users: [{ id: 1, company_id: 1, email: 'test@example.com', is_active: 1 }]
  });
  const manager = new RefreshTokenManager(adapter, testConfig);

  // Issue a token
  const issueResult = await manager.issue({
    userId: 1,
    companyId: 1,
    ipAddress: null,
    userAgent: null
  });

  // Revoke it
  const revoked = await manager.revoke(issueResult.token);
  assert.strictEqual(revoked, true, 'First revoke should succeed');

  // Try to rotate
  const result = await manager.rotate(issueResult.token, {
    ipAddress: null,
    userAgent: null
  });

  assert.strictEqual(result.success, false, 'Should not succeed after revoke');
  if (result.success) throw new Error('Should not succeed after revoke');
  assert.strictEqual(result.reason, 'revoked', 'Reason should be revoked');
});

test('RefreshTokenManager - rotate() returns expired for expired token', async () => {
  const adapter = createMockAdapter({
    users: [{ id: 1, company_id: 1, email: 'test@example.com', is_active: 1 }]
  });
  const manager = new RefreshTokenManager(adapter, testConfig);
  const testSecret = testConfig.tokens.refreshTokenSecret;

  function hashToken(token: string): string {
    return createHmac('sha256', testSecret).update(token).digest('hex');
  }

  // Manually add an expired token directly to the mock adapter
  const expiredDate = new Date(Date.now() - 1000); // 1 second in the past
  const rawToken = randomBytes(48).toString('base64url');
  const tokenHash = hashToken(rawToken);

  adapter.addMockRefreshToken({
    id: 9999,
    user_id: 1,
    company_id: 1,
    token_hash: tokenHash,
    expires_at: expiredDate,
    revoked_at: null,
    rotated_from_id: null,
    ip_address: null,
    user_agent: null
  });

  // Try to rotate the expired token
  const result = await manager.rotate(rawToken, {
    ipAddress: null,
    userAgent: null
  });

  assert.strictEqual(result.success, false, 'Should not succeed with expired token');
  if (result.success) throw new Error('Should not succeed with expired token');
  assert.strictEqual(result.reason, 'expired', 'Reason should be expired');
});

test('RefreshTokenManager - revoke() marks token as revoked', async () => {
  const adapter = createMockAdapter({
    users: [{ id: 1, company_id: 1, email: 'test@example.com', is_active: 1 }]
  });
  const manager = new RefreshTokenManager(adapter, testConfig);

  const issueResult = await manager.issue({
    userId: 1,
    companyId: 1,
    ipAddress: null,
    userAgent: null
  });

  const revoked = await manager.revoke(issueResult.token);
  assert.strictEqual(revoked, true, 'Revoke should return true');

  const storedTokens = adapter.data.auth_refresh_tokens || [];
  const token = storedTokens.find(t => t.id === issueResult.tokenId);
  assert.ok(token?.revoked_at, 'revoked_at should be set');
  assert.notStrictEqual(token?.revoked_at, null, 'revoked_at should not be null');
});

test('RefreshTokenManager - revoke() returns false for already revoked token', async () => {
  const adapter = createMockAdapter({
    users: [{ id: 1, company_id: 1, email: 'test@example.com', is_active: 1 }]
  });
  const manager = new RefreshTokenManager(adapter, testConfig);

  const issueResult = await manager.issue({
    userId: 1,
    companyId: 1,
    ipAddress: null,
    userAgent: null
  });

  // Revoke first time
  const firstRevoke = await manager.revoke(issueResult.token);
  assert.strictEqual(firstRevoke, true, 'First revoke should return true');

  // Revoke second time
  const secondRevoke = await manager.revoke(issueResult.token);
  assert.strictEqual(secondRevoke, false, 'Second revoke should return false');
});

test('RefreshTokenManager - createCookie() has correct attributes', async () => {
  const adapter = createMockAdapter({
    users: [{ id: 1, company_id: 1, email: 'test@example.com', is_active: 1 }]
  });
  const manager = new RefreshTokenManager(adapter, testConfig);

  const cookie = manager.createCookie('test-token', 3600);

  assert.ok(cookie.includes(`${REFRESH_TOKEN_COOKIE_NAME}=test-token`), 'Cookie should contain name=value');
  assert.ok(cookie.includes('Path=/'), 'Cookie should contain Path=/');
  assert.ok(cookie.includes('HttpOnly'), 'Cookie should contain HttpOnly');
  assert.ok(cookie.includes('SameSite=Lax'), 'Cookie should contain SameSite=Lax');
  assert.ok(cookie.includes('Max-Age=3600'), 'Cookie should contain Max-Age=3600');
  assert.ok(cookie.includes('Expires='), 'Cookie should contain Expires');
});

test('RefreshTokenManager - createCookie() encodes special characters', async () => {
  const adapter = createMockAdapter({
    users: [{ id: 1, company_id: 1, email: 'test@example.com', is_active: 1 }]
  });
  const manager = new RefreshTokenManager(adapter, testConfig);

  const cookie = manager.createCookie('token+with/special=chars', 3600);
  assert.ok(cookie.includes(encodeURIComponent('token+with/special=chars')), 'Cookie should encode special chars');
});

test('RefreshTokenManager - createCookie() includes Secure flag in production', async () => {
  const adapter = createMockAdapter({
    users: [{ id: 1, company_id: 1, email: 'test@example.com', is_active: 1 }]
  });
  const originalEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';

  const prodManager = new RefreshTokenManager(adapter, testConfig);
  const cookie = prodManager.createCookie('test-token', 3600);

  assert.ok(cookie.includes('Secure'), 'Production cookie should have Secure flag');

  process.env.NODE_ENV = originalEnv;
});

test('RefreshTokenManager - createCookie() omits Secure flag in development', async () => {
  const adapter = createMockAdapter({
    users: [{ id: 1, company_id: 1, email: 'test@example.com', is_active: 1 }]
  });
  const originalEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'development';

  const devManager = new RefreshTokenManager(adapter, testConfig);
  const cookie = devManager.createCookie('test-token', 3600);

  assert.ok(!cookie.includes('Secure'), 'Development cookie should not have Secure flag');

  process.env.NODE_ENV = originalEnv;
});

test('RefreshTokenManager - createClearCookie() sets Max-Age=0 and Expires in past', async () => {
  const adapter = createMockAdapter({
    users: [{ id: 1, company_id: 1, email: 'test@example.com', is_active: 1 }]
  });
  const manager = new RefreshTokenManager(adapter, testConfig);

  const cookie = manager.createClearCookie();

  assert.ok(cookie.includes('Max-Age=0'), 'Clear cookie should have Max-Age=0');
  assert.ok(cookie.includes('Expires=Thu, 01 Jan 1970 00:00:00 GMT'), 'Clear cookie should have expired date');
});

test('RefreshTokenManager - createClearCookie() has empty value', async () => {
  const adapter = createMockAdapter({
    users: [{ id: 1, company_id: 1, email: 'test@example.com', is_active: 1 }]
  });
  const manager = new RefreshTokenManager(adapter, testConfig);

  const cookie = manager.createClearCookie();
  assert.ok(cookie.includes(`${REFRESH_TOKEN_COOKIE_NAME}=`), 'Clear cookie should have empty value');
});

test('RefreshTokenManager - createClearCookie() has necessary attributes', async () => {
  const adapter = createMockAdapter({
    users: [{ id: 1, company_id: 1, email: 'test@example.com', is_active: 1 }]
  });
  const manager = new RefreshTokenManager(adapter, testConfig);

  const cookie = manager.createClearCookie();

  assert.ok(cookie.includes('Path=/'), 'Clear cookie should have Path=/');
  assert.ok(cookie.includes('HttpOnly'), 'Clear cookie should have HttpOnly');
  assert.ok(cookie.includes('SameSite=Lax'), 'Clear cookie should have SameSite=Lax');
});

test('RefreshTokenManager - user agent truncation for long user agent', async () => {
  const adapter = createMockAdapter({
    users: [{ id: 1, company_id: 1, email: 'test@example.com', is_active: 1 }]
  });
  const manager = new RefreshTokenManager(adapter, testConfig);

  const longUserAgent = 'A'.repeat(300);

  await manager.issue({
    userId: 1,
    companyId: 1,
    ipAddress: null,
    userAgent: longUserAgent
  });

  const storedTokens = adapter.data.auth_refresh_tokens || [];
  assert.strictEqual(storedTokens[0].user_agent?.length, 255, 'User agent should be truncated to 255 chars');
  assert.strictEqual(storedTokens[0].user_agent, longUserAgent.slice(0, 255), 'Truncated user agent should match');
});

test('RefreshTokenManager - user agent normalization for empty string', async () => {
  const adapter = createMockAdapter({
    users: [{ id: 1, company_id: 1, email: 'test@example.com', is_active: 1 }]
  });
  const manager = new RefreshTokenManager(adapter, testConfig);

  await manager.issue({
    userId: 1,
    companyId: 1,
    ipAddress: null,
    userAgent: ''
  });

  const storedTokens = adapter.data.auth_refresh_tokens || [];
  assert.strictEqual(storedTokens[0].user_agent, null, 'Empty string user agent should be null');
});

test('RefreshTokenManager - user agent normalization for whitespace-only string', async () => {
  const adapter = createMockAdapter({
    users: [{ id: 1, company_id: 1, email: 'test@example.com', is_active: 1 }]
  });
  const manager = new RefreshTokenManager(adapter, testConfig);

  await manager.issue({
    userId: 1,
    companyId: 1,
    ipAddress: null,
    userAgent: '   '
  });

  const storedTokens = adapter.data.auth_refresh_tokens || [];
  assert.strictEqual(storedTokens[0].user_agent, null, 'Whitespace-only user agent should be null');
});

test('RefreshTokenManager - user agent normalization for null', async () => {
  const adapter = createMockAdapter({
    users: [{ id: 1, company_id: 1, email: 'test@example.com', is_active: 1 }]
  });
  const manager = new RefreshTokenManager(adapter, testConfig);

  await manager.issue({
    userId: 1,
    companyId: 1,
    ipAddress: null,
    userAgent: null
  });

  const storedTokens = adapter.data.auth_refresh_tokens || [];
  assert.strictEqual(storedTokens[0].user_agent, null, 'Null user agent should remain null');
});

test('RefreshTokenManager - user agent normalization trims whitespace', async () => {
  const adapter = createMockAdapter({
    users: [{ id: 1, company_id: 1, email: 'test@example.com', is_active: 1 }]
  });
  const manager = new RefreshTokenManager(adapter, testConfig);

  await manager.issue({
    userId: 1,
    companyId: 1,
    ipAddress: null,
    userAgent: '  TrimmedBrowser/1.0  '
  });

  const storedTokens = adapter.data.auth_refresh_tokens || [];
  assert.strictEqual(storedTokens[0].user_agent, 'TrimmedBrowser/1.0', 'User agent should be trimmed');
});
