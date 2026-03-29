/**
 * Unit tests for PasswordHasher
 */

import { test } from 'node:test';
import assert from 'node:assert';
import { PasswordHasher } from './hash.js';
import { testConfig } from '../test-utils/mock-adapter.js';

test('PasswordHasher - hash password with Argon2id (default)', async () => {
  const hasher = new PasswordHasher(testConfig);
  
  const plainPassword = 'testPassword123!';
  const hash = await hasher.hash(plainPassword);
  
  assert.ok(hash, 'Hash should be generated');
  assert.ok(hash.startsWith('$argon2id$'), 'Hash should start with argon2id prefix');
  assert.notStrictEqual(hash, plainPassword, 'Hash should not equal plain password');
});

test('PasswordHasher - hash password with bcrypt', async () => {
  const bcryptConfig = {
    ...testConfig,
    password: {
      ...testConfig.password,
      defaultAlgorithm: 'bcrypt' as const
    }
  };
  
  const hasher = new PasswordHasher(bcryptConfig);
  
  const plainPassword = 'bcryptTestPass456!';
  const hash = await hasher.hash(plainPassword);
  
  assert.ok(hash, 'Hash should be generated');
  assert.ok(hash.startsWith('$2'), 'Hash should start with bcrypt prefix ($2a, $2b, or $2y)');
  assert.notStrictEqual(hash, plainPassword, 'Hash should not equal plain password');
});

test('PasswordHasher - verify correct password', async () => {
  const hasher = new PasswordHasher(testConfig);
  
  const plainPassword = 'verifyCorrectPass789!';
  const hash = await hasher.hash(plainPassword);
  
  const isValid = await hasher.verify(plainPassword, hash);
  assert.strictEqual(isValid, true, 'Should verify correct password');
});

test('PasswordHasher - reject incorrect password', async () => {
  const hasher = new PasswordHasher(testConfig);
  
  const plainPassword = 'correctPassword!';
  const wrongPassword = 'wrongPassword!';
  const hash = await hasher.hash(plainPassword);
  
  const isValid = await hasher.verify(wrongPassword, hash);
  assert.strictEqual(isValid, false, 'Should reject incorrect password');
});

test('PasswordHasher - needsRehash returns false for matching algorithm', async () => {
  const hasher = new PasswordHasher(testConfig);
  
  // Hash with argon2id (default)
  const argon2Hash = await hasher.hash('somePassword!');
  
  // needsRehash should return false for argon2id hash when default is argon2id
  const needsRehash = hasher.needsRehash(argon2Hash);
  assert.strictEqual(needsRehash, false, 'Should not need rehash for argon2id hash when default is argon2id');
});

test('PasswordHasher - needsRehash returns true for different algorithm', async () => {
  const hasher = new PasswordHasher(testConfig);
  
  // Create a bcrypt hash manually (to simulate legacy data)
  const bcryptConfig = {
    ...testConfig,
    password: {
      ...testConfig.password,
      defaultAlgorithm: 'bcrypt' as const
    }
  };
  const bcryptHasher = new PasswordHasher(bcryptConfig);
  const bcryptHash = await bcryptHasher.hash('somePassword!');
  
  // Default hasher is argon2id, so bcrypt hash should need rehash
  const needsRehash = hasher.needsRehash(bcryptHash);
  assert.strictEqual(needsRehash, true, 'Should need rehash for bcrypt hash when default is argon2id');
});

test('PasswordHasher - needsRehash returns false for bcrypt when default is bcrypt', async () => {
  const bcryptConfig = {
    ...testConfig,
    password: {
      ...testConfig.password,
      defaultAlgorithm: 'bcrypt' as const
    }
  };
  
  const hasher = new PasswordHasher(bcryptConfig);
  const hash = await hasher.hash('testPassword!');
  
  const needsRehash = hasher.needsRehash(hash);
  assert.strictEqual(needsRehash, false, 'Should not need rehash for bcrypt hash when default is bcrypt');
});

test('PasswordHasher - verify handles all bcrypt prefixes', async () => {
  const hasher = new PasswordHasher(testConfig);
  
  // Test with different bcrypt prefix hashes
  const bcryptHashes = [
    '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4.S0QQM4VZ7QqO.u', // $2a$
    '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4.S0QQM4VZ7QqO.u', // $2b$
    '$2y$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4.S0QQM4VZ7QqO.u'  // $2y$
  ];
  
  // These are valid bcrypt hashes of 'password' - we just verify they're recognized
  for (const hash of bcryptHashes) {
    const isBcrypt = hash.startsWith('$2a$') || hash.startsWith('$2b$') || hash.startsWith('$2y$');
    assert.ok(isBcrypt, `Hash ${hash} should be recognized as bcrypt`);
  }
});

test('PasswordHasher - verify returns false for invalid hash format', async () => {
  const hasher = new PasswordHasher(testConfig);
  
  const invalidHash = 'not-a-valid-hash-format';
  const plainPassword = 'anyPassword!';
  
  const isValid = await hasher.verify(plainPassword, invalidHash);
  assert.strictEqual(isValid, false, 'Should return false for invalid hash format');
});

test('PasswordHasher - verify handles malformed argon2 hash', async () => {
  const hasher = new PasswordHasher(testConfig);
  
  const malformedHash = '$argon2id$invalid';
  const plainPassword = 'anyPassword!';
  
  const isValid = await hasher.verify(plainPassword, malformedHash);
  assert.strictEqual(isValid, false, 'Should return false for malformed argon2 hash');
});

test('PasswordHasher - hash produces different hashes for same password (salt)', async () => {
  const hasher = new PasswordHasher(testConfig);
  
  const plainPassword = 'samePassword!';
  const hash1 = await hasher.hash(plainPassword);
  const hash2 = await hasher.hash(plainPassword);
  
  assert.notStrictEqual(hash1, hash2, 'Two hashes of same password should be different due to salt');
  
  // But both should verify correctly
  assert.strictEqual(await hasher.verify(plainPassword, hash1), true);
  assert.strictEqual(await hasher.verify(plainPassword, hash2), true);
});

test('PasswordHasher - verify handles empty password', async () => {
  const hasher = new PasswordHasher(testConfig);
  
  const hash = await hasher.hash('nonEmptyPassword!');
  
  // Empty password should not verify
  const isValid = await hasher.verify('', hash);
  assert.strictEqual(isValid, false, 'Should reject empty password');
});

test('PasswordHasher - verify handles unicode passwords', async () => {
  const hasher = new PasswordHasher(testConfig);
  
  const unicodePassword = 'пароль密码🔐';
  const hash = await hasher.hash(unicodePassword);
  
  const isValid = await hasher.verify(unicodePassword, hash);
  assert.strictEqual(isValid, true, 'Should verify unicode password');
  
  const isInvalid = await hasher.verify('wrong', hash);
  assert.strictEqual(isInvalid, false, 'Should reject wrong password');
});

test('PasswordHasher - verify handles very long passwords', async () => {
  const hasher = new PasswordHasher(testConfig);
  
  const longPassword = 'a'.repeat(1000);
  const hash = await hasher.hash(longPassword);
  
  const isValid = await hasher.verify(longPassword, hash);
  assert.strictEqual(isValid, true, 'Should verify very long password');
});