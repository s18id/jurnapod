/**
 * Unit tests for AccessTokenManager
 */

import { test } from 'node:test';
import assert from 'node:assert';
import { AccessTokenManager } from './access-tokens.js';
import { testConfig } from '../test-utils/test-adapter.js';
import type { AccessTokenUser } from '../types.js';

test('AccessTokenManager - sign and verify token', async () => {
  const manager = new AccessTokenManager(testConfig);
  
  const user: AccessTokenUser = {
    id: 1,
    company_id: 42,
    email: 'test@example.com'
  };
  
  const token = await manager.sign(user);
  assert.ok(token, 'Token should be signed');
  assert.ok(token.split('.').length === 3, 'Token should be a valid JWT with 3 parts');
  
  const verified = await manager.verify(token);
  assert.strictEqual(verified.id, user.id);
  assert.strictEqual(verified.company_id, user.company_id);
  assert.strictEqual(verified.email, user.email);
});

test('AccessTokenManager - reject expired tokens', async () => {
  const shortLivedConfig = {
    ...testConfig,
    tokens: {
      ...testConfig.tokens,
      accessTokenTtlSeconds: -1 // Already expired
    }
  };
  
  const manager = new AccessTokenManager(shortLivedConfig);
  
  const user: AccessTokenUser = {
    id: 1,
    company_id: 42,
    email: 'test@example.com'
  };
  
  const token = await manager.sign(user);
  
  // Verify should fail because token is expired
  await assert.rejects(
    async () => manager.verify(token),
    /expired|Expired/i,
    'Should reject expired token'
  );
});

test('AccessTokenManager - reject tampered tokens', async () => {
  const manager = new AccessTokenManager(testConfig);
  
  const user: AccessTokenUser = {
    id: 1,
    company_id: 42,
    email: 'test@example.com'
  };
  
  const token = await manager.sign(user);
  
  // Tamper with the token by modifying a character
  const parts = token.split('.');
  const tamperedPayload = Buffer.from(JSON.stringify({ modified: 'payload' })).toString('base64url');
  const tamperedToken = `${parts[0]}.${tamperedPayload}.${parts[2]}`;
  
  await assert.rejects(
    async () => manager.verify(tamperedToken),
    /invalid|signature/i,
    'Should reject tampered token'
  );
});

test('AccessTokenManager - verify claims (sub, company_id, email)', async () => {
  const manager = new AccessTokenManager(testConfig);
  
  const user: AccessTokenUser = {
    id: 123,
    company_id: 456,
    email: 'claims@test.com'
  };
  
  const token = await manager.sign(user);
  const verified = await manager.verify(token);
  
  // Verify 'sub' claim (user id)
  assert.strictEqual(verified.id, 123, 'sub claim should be user id');
  
  // Verify company_id claim
  assert.strictEqual(verified.company_id, 456, 'company_id claim should match');
  
  // Verify email claim
  assert.strictEqual(verified.email, 'claims@test.com', 'email claim should match');
});

test('AccessTokenManager - reject invalid sub claim', async () => {
  // Create a manager and manually construct a JWT with invalid sub
  const manager = new AccessTokenManager(testConfig);
  
  // Use jose directly to create a token with invalid sub
  const { SignJWT } = await import('jose');
  const secret = new TextEncoder().encode(testConfig.tokens.accessTokenSecret);
  
  const invalidToken = await new SignJWT({
    email: 'test@example.com',
    company_id: 1,
    iss: testConfig.tokens.issuer,
    aud: testConfig.tokens.audience
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject('not-a-number') // Invalid sub
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + 900)
    .sign(secret);

  await assert.rejects(
    async () => manager.verify(invalidToken),
    /invalid|Invalid/i,
    'Should reject token with non-numeric sub'
  );
});

test('AccessTokenManager - reject zero or negative user id', async () => {
  const manager = new AccessTokenManager(testConfig);
  
  // Create token with sub = 0
  const { SignJWT } = await import('jose');
  const secret = new TextEncoder().encode(testConfig.tokens.accessTokenSecret);
  
  const invalidToken = await new SignJWT({
    email: 'test@example.com',
    company_id: 1,
    iss: testConfig.tokens.issuer,
    aud: testConfig.tokens.audience
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject('0') // Invalid - zero
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + 900)
    .sign(secret);

  await assert.rejects(
    async () => manager.verify(invalidToken),
    /invalid|Invalid/i,
    'Should reject token with sub = 0'
  );
});

test('AccessTokenManager - optional email claim', async () => {
  const manager = new AccessTokenManager(testConfig);
  
  const userWithEmail: AccessTokenUser = {
    id: 1,
    company_id: 42,
    email: 'has-email@test.com'
  };
  
  const userWithoutEmail: AccessTokenUser = {
    id: 2,
    company_id: 42,
    email: '' // Empty email
  };
  
  const tokenWithEmail = await manager.sign(userWithEmail);
  const tokenWithoutEmail = await manager.sign(userWithoutEmail);
  
  const verifiedWithEmail = await manager.verify(tokenWithEmail);
  const verifiedWithoutEmail = await manager.verify(tokenWithoutEmail);
  
  assert.strictEqual(verifiedWithEmail.email, 'has-email@test.com');
  assert.strictEqual(verifiedWithoutEmail.email, '');
});

test('AccessTokenManager - with issuer claim', async () => {
  const configWithIssuer = {
    ...testConfig,
    tokens: {
      ...testConfig.tokens,
      issuer: 'test-issuer'
    }
  };
  
  const manager = new AccessTokenManager(configWithIssuer);
  
  const user: AccessTokenUser = {
    id: 1,
    company_id: 42,
    email: 'test@example.com'
  };
  
  const token = await manager.sign(user);
  const verified = await manager.verify(token);
  
  assert.strictEqual(verified.company_id, 42);
});

test('AccessTokenManager - with audience claim', async () => {
  const configWithAudience = {
    ...testConfig,
    tokens: {
      ...testConfig.tokens,
      audience: 'test-audience'
    }
  };
  
  const manager = new AccessTokenManager(configWithAudience);
  
  const user: AccessTokenUser = {
    id: 1,
    company_id: 42,
    email: 'test@example.com'
  };
  
  const token = await manager.sign(user);
  const verified = await manager.verify(token);
  
  assert.strictEqual(verified.company_id, 42);
});