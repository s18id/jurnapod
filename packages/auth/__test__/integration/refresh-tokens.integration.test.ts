/**
 * Integration tests for RefreshTokenManager
 * 
 * These tests use a real database and are skipped unless AUTH_TEST_USE_DB=1 is set.
 */

import { test, describe, beforeEach, afterAll } from 'vitest';
import assert from 'node:assert';
import { RefreshTokenManager } from '../../src/tokens/refresh-tokens.js';
import { createRealDbAdapter, getTestDb, closeTestPool } from '../../src/test-utils/real-adapter.js';
import { useRealDb, testConfig } from '../../src/test-utils/test-adapter.js';
import { createCompany, cleanupCompanies } from '../../src/test-utils/fixtures/companies.js';
import { createUser, cleanupUsers } from '../../src/test-utils/fixtures/users.js';
import type { AuthDbAdapter } from '../../src/types.js';

// ---------------------------------------------------------------------------
// Helper Types
// ---------------------------------------------------------------------------

interface RefreshTokenRow {
  id: number;
  company_id: number;
  user_id: number;
  token_hash: string;
  expires_at: number | Date | string;
  revoked_at: Date | null;
  rotated_from_id: number | null;
  ip_address: string | null;
  user_agent: string | null;
}

// ---------------------------------------------------------------------------
// Deterministic time control
// ---------------------------------------------------------------------------

const FROZEN_TIME_MS = 1704067200000; // 2024-01-01 00:00:00 UTC

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FROZEN_TIME_MS);
});

afterEach(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

test('RefreshTokenManager: issue() creates token in database', { skip: !useRealDb }, async () => {
  const adapter = createRealDbAdapter();
  const db = getTestDb();
  const companyIds: number[] = [];
  const userIds: number[] = [];

  try {
    // Create fixtures
    const company = await createCompany(adapter);
    companyIds.push(company.id);

    const user = await createUser(adapter, company.id, {}, testConfig);
    userIds.push(user.id);

    // Issue refresh token
    const manager = new RefreshTokenManager(adapter, testConfig);
    const result = await manager.issue({
      companyId: company.id,
      userId: user.id,
      ipAddress: '192.168.1.100',
      userAgent: 'Mozilla/5.0 Test Browser'
    });

    // Verify token was created
    assert.ok(result.token, 'Token should be returned');
    assert.ok(result.tokenId, 'TokenId should be set');
    assert.ok(result.expiresAt, 'ExpiresAt should be set');

    // Verify token in database
    const rows = await db.selectFrom("auth_refresh_tokens").selectAll()
      .where('id', '=', result.tokenId)
      .execute();
    assert.strictEqual(rows.length, 1, 'Token should exist in database');

    const row = rows[0] as RefreshTokenRow;
    assert.strictEqual(row.company_id, company.id, 'Company ID should match');
    assert.strictEqual(row.user_id, user.id, 'User ID should match');
    assert.ok(row.token_hash !== result.token, 'Token hash should not equal raw token');
    assert.ok(row.token_hash.length > 0, 'Token hash should be stored');
    assert.strictEqual(row.ip_address, '192.168.1.100', 'IP address should match');
    assert.strictEqual(row.user_agent, 'Mozilla/5.0 Test Browser', 'User agent should match');
    assert.strictEqual(row.revoked_at, null, 'Token should not be revoked');
    assert.strictEqual(row.rotated_from_id, null, 'Token should not have rotated_from_id');

    // expires_at is datetime (with dateStrings: true it comes as string) or BIGINT unix ms (as number)
    assert.ok(
      typeof row.expires_at === 'string' || 
      typeof row.expires_at === 'number' || 
      row.expires_at instanceof Date,
      `expires_at should be string (datetime), number (BIGINT unix ms), or Date but got ${typeof row.expires_at}`
    );

    // Handle string (datetime), number (BIGINT unix ms), or Date types
    let expiresAtMs: number;
    if (typeof row.expires_at === 'string') {
      expiresAtMs = new Date(row.expires_at).getTime();
    } else if (row.expires_at instanceof Date) {
      expiresAtMs = row.expires_at.getTime();
    } else {
      expiresAtMs = row.expires_at as number;
    }
    assert.ok(expiresAtMs > FROZEN_TIME_MS, 'Token should expire in the future');
  } finally {
    // Cleanup
    await cleanupUsers(adapter, userIds);
    await cleanupCompanies(adapter, companyIds);
  }
});

test('RefreshTokenManager: rotate() revokes old and creates new', { skip: !useRealDb }, async () => {
  const adapter = createRealDbAdapter();
  const db = getTestDb();
  const companyIds: number[] = [];
  const userIds: number[] = [];

  try {
    // Create fixtures
    const company = await createCompany(adapter);
    companyIds.push(company.id);

    const user = await createUser(adapter, company.id, {}, testConfig);
    userIds.push(user.id);

    // Issue original token
    const manager = new RefreshTokenManager(adapter, testConfig);
    const original = await manager.issue({
      companyId: company.id,
      userId: user.id,
      ipAddress: '10.0.0.1',
      userAgent: 'Original Browser'
    });

    // Rotate the token
    const rotated = await manager.rotate(original.token, {
      ipAddress: '10.0.0.2',
      userAgent: 'Rotated Browser'
    });

    if(!rotated.success) {
      const rotatedFailed = rotated as { success:boolean, reason: "not_found" | "revoked" | "expired" }
      assert.ok(rotated.success, 'Rotation should succeed, got:'+rotatedFailed.reason);
    }

    const rotatedSuccess = rotated as { success: true; token: string; expiresAt: Date; tokenId: number; userId: number; companyId: number; rotatedFromId: number };
    assert.ok(rotatedSuccess.token, 'New token should be returned');
    assert.ok(rotatedSuccess.tokenId, 'New tokenId should be set');
    assert.strictEqual(rotatedSuccess.rotatedFromId, original.tokenId, 'rotatedFromId should point to original');
    assert.strictEqual(rotatedSuccess.userId, user.id, 'UserId should match');
    assert.strictEqual(rotatedSuccess.companyId, company.id, 'CompanyId should match');

    // Verify old token is revoked
    const oldRows = await db
      .selectFrom('auth_refresh_tokens')
      .selectAll()
      .where('id', '=', original.tokenId)
      .execute();
    assert.strictEqual(oldRows.length, 1, 'Old token should still exist');
    const oldRow = oldRows[0] as RefreshTokenRow
    assert.ok(oldRow.revoked_at !== null, 'Old token should be revoked');

    // Verify new token exists with rotated_from_id
    const newRows = await db
      .selectFrom('auth_refresh_tokens')
      .selectAll()
      .where('id', '=', rotatedSuccess.tokenId)
      .execute() as unknown as RefreshTokenRow[];
    assert.strictEqual(newRows.length, 1, 'New token should exist');
    assert.strictEqual(newRows[0].rotated_from_id, original.tokenId, 'rotated_from_id should reference old token');
    assert.strictEqual(newRows[0].ip_address, '10.0.0.2', 'New IP should be set');
    assert.strictEqual(newRows[0].user_agent, 'Rotated Browser', 'New User-Agent should be set');
    assert.strictEqual(newRows[0].revoked_at, null, 'New token should not be revoked');
  } finally {
    await cleanupUsers(adapter, userIds);
    await cleanupCompanies(adapter, companyIds);
  }
});

test('RefreshTokenManager: rotate() returns not_found for invalid token', { skip: !useRealDb }, async () => {
  const adapter = createRealDbAdapter();
  const manager = new RefreshTokenManager(adapter, testConfig);

  // Try to rotate garbage token
  const result = await manager.rotate('garbage-token-that-does-not-exist', {
    ipAddress: '192.168.1.1',
    userAgent: 'Test'
  });

  assert.strictEqual(result.success, false, 'Rotation should fail');
  const failedResult = result as { success: false; reason: 'not_found' | 'revoked' | 'expired' };
  assert.strictEqual(failedResult.reason, 'not_found', 'Should return not_found reason');
});

test('RefreshTokenManager: rotate() returns revoked for already revoked token', { skip: !useRealDb }, async () => {
  const adapter = createRealDbAdapter();
  const db = getTestDb();
  const companyIds: number[] = [];
  const userIds: number[] = [];

  try {
    // Create fixtures
    const company = await createCompany(adapter);
    companyIds.push(company.id);

    const user = await createUser(adapter, company.id, {}, testConfig);
    userIds.push(user.id);

    // Issue token
    const manager = new RefreshTokenManager(adapter, testConfig);
    const original = await manager.issue({
      companyId: company.id,
      userId: user.id,
      ipAddress: '10.0.0.1',
      userAgent: 'Browser'
    });

    // Rotate once (this revokes the original)
    await manager.rotate(original.token, {
      ipAddress: '10.0.0.2',
      userAgent: 'New Browser'
    });

    // Try to rotate the old (now revoked) token again
    const result = await manager.rotate(original.token, {
      ipAddress: '10.0.0.3',
      userAgent: 'Another Browser'
    });

    assert.strictEqual(result.success, false, 'Rotation should fail');
    const revokedResult = result as { success: false; reason: 'not_found' | 'revoked' | 'expired' };
    assert.strictEqual(revokedResult.reason, 'revoked', 'Should return revoked reason');
  } finally {
    await cleanupUsers(adapter, userIds);
    await cleanupCompanies(adapter, companyIds);
  }
});

test('RefreshTokenManager: rotate() returns expired for expired token', { skip: !useRealDb }, async () => {
  const adapter = createRealDbAdapter();
  const db = getTestDb();
  const companyIds: number[] = [];
  const userIds: number[] = [];

  try {
    // Create fixtures
    const company = await createCompany(adapter);
    companyIds.push(company.id);

    const user = await createUser(adapter, company.id, {}, testConfig);
    userIds.push(user.id);

    // Insert a token with past expiry directly into DB using a known hash
    const pastExpiry = new Date(Date.now() - 1000); // 1 second in the past
    const fakeToken = 'fake-expired-token';
    const { createHmac } = await import('node:crypto');
    const tokenHash = createHmac('sha256', testConfig.tokens.refreshTokenSecret)
      .update(fakeToken)
      .digest('hex');
    
    await db.insertInto('auth_refresh_tokens')
      .values({
        company_id: company.id,
        user_id: user.id,
        token_hash: tokenHash,
        expires_at: pastExpiry,
        ip_address: '127.0.0.1',
        user_agent: 'Test',
      })
      .execute();

    // Create manager and try to rotate the expired token
    const manager = new RefreshTokenManager(adapter, testConfig);
    const result = await manager.rotate(fakeToken, {
      ipAddress: '192.168.1.1',
      userAgent: 'Test'
    });

    assert.strictEqual(result.success, false, 'Rotation should fail');
    const expiredResult = result as { success: false; reason: 'not_found' | 'revoked' | 'expired' };
    assert.strictEqual(expiredResult.reason, 'expired', 'Should return expired reason');
  } finally {
    await cleanupUsers(adapter, userIds);
    await cleanupCompanies(adapter, companyIds);
  }
});

test('RefreshTokenManager: revoke() marks token as revoked', { skip: !useRealDb }, async () => {
  const adapter = createRealDbAdapter();
  const db = getTestDb();
  const companyIds: number[] = [];
  const userIds: number[] = [];

  try {
    // Create fixtures
    const company = await createCompany(adapter);
    companyIds.push(company.id);

    const user = await createUser(adapter, company.id, {}, testConfig);
    userIds.push(user.id);

    // Issue token
    const manager = new RefreshTokenManager(adapter, testConfig);
    const result = await manager.issue({
      companyId: company.id,
      userId: user.id,
      ipAddress: '10.0.0.1',
      userAgent: 'Browser'
    });

    // Revoke the token
    const revoked = await manager.revoke(result.token);
    assert.strictEqual(revoked, true, 'Revoke should return true');

    // Verify token is revoked in database
    const rows = await db
      .selectFrom('auth_refresh_tokens')
      .selectAll()
      .where('id', '=', result.tokenId)
      .execute() as unknown as RefreshTokenRow[];
    assert.strictEqual(rows.length, 1, 'Token should still exist');
    assert.ok(rows[0].revoked_at !== null, 'Token should have revoked_at set');

    // Try to revoke again - should return false
    const revokedAgain = await manager.revoke(result.token);
    assert.strictEqual(revokedAgain, false, 'Revoking already revoked token should return false');
  } finally {
    await cleanupUsers(adapter, userIds);
    await cleanupCompanies(adapter, companyIds);
  }
});

test('RefreshTokenManager: Transaction rollback on failure', { skip: !useRealDb }, async () => {
  const adapter = createRealDbAdapter();
  const db = getTestDb();
  const companyIds: number[] = [];
  const userIds: number[] = [];

  try {
    // Create fixtures
    const company = await createCompany(adapter);
    companyIds.push(company.id);

    const user = await createUser(adapter, company.id, {}, testConfig);
    userIds.push(user.id);

    // Count tokens before
    const beforeCountResult = await db
      .selectFrom('auth_refresh_tokens')
      .select(['id'])
      .execute();
    const beforeCount = beforeCountResult.length;

    // Use transaction directly to test rollback
    try {
      await adapter.db.transaction().execute(async (trx) => {
        // Insert a token
        await trx
          .insertInto('auth_refresh_tokens')
          .values({
            company_id: company.id,
            user_id: user.id,
            token_hash: 'test-hash',
            // Use FROZEN_TIME_MS to avoid Date.now() call while fake timers are active
            expires_at: new Date(FROZEN_TIME_MS + 60000),
            ip_address: '127.0.0.1',
            user_agent: 'Test'
          })
          .execute();
        // Throw error to trigger rollback
        throw new Error('Intentional failure for testing rollback');
      });
      assert.fail('Should have thrown error');
    } catch (err) {
      assert.ok(err instanceof Error);
      assert.strictEqual(err.message, 'Intentional failure for testing rollback');
    }

    // Verify no token was inserted (rollback worked)
    const afterCountResult = await db
      .selectFrom('auth_refresh_tokens')
      .select(['id'])
      .execute();
    const afterCount = afterCountResult.length;
    assert.strictEqual(afterCount, beforeCount, 'Token count should be unchanged after rollback');
  } finally {
    await cleanupUsers(adapter, userIds);
    await cleanupCompanies(adapter, companyIds);
  }
});

afterAll(async () => {
  await closeTestPool();
});
