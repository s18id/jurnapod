/**
 * Integration tests for EmailTokenManager using real database
 */

import { test } from 'node:test';
import assert from 'node:assert';
import { createHash, randomBytes } from 'node:crypto';
import { EmailTokenManager } from '../../src/email/tokens.js';
import { createRealDbAdapter, getTestDb, createAuthDbConnection, closeTestPool } from '../../src/test-utils/real-adapter.js';
import { useRealDb } from '../../src/test-utils/test-adapter.js';
import { testConfig } from '../../src/test-utils/mock-adapter.js';
import { createCompany, cleanupCompanies } from '../../src/test-utils/fixtures/companies.js';
import { createUser, cleanupUsers } from '../../src/test-utils/fixtures/users.js';
import {
  EmailTokenExpiredError,
} from '../../src/errors.js';
import type { EmailTokenType } from '../../src/types.js';

// ---------------------------------------------------------------------------
// Skip if not using real DB
// ---------------------------------------------------------------------------

const testOrSkip = useRealDb ? test : test.skip;

// ---------------------------------------------------------------------------
// Token hash helper (must match tokens.ts implementation)
// ---------------------------------------------------------------------------

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

test.after(async () => {
  await closeTestPool();
});

// ---------------------------------------------------------------------------
// Test 1: create() stores hashed token
// ---------------------------------------------------------------------------

testOrSkip('EmailTokenManager.create() stores hashed token in database', async () => {
  const adapter = createRealDbAdapter();
  const manager = new EmailTokenManager(adapter, testConfig);

  // Create company and user
  const company = await createCompany(adapter);
  const user = await createUser(adapter, company.id, {}, testConfig);

  try {
    const { token, expiresAt } = await manager.create({
      companyId: company.id,
      userId: user.id,
      email: user.email,
      type: 'PASSWORD_RESET',
      createdBy: user.id,
    });

    // Verify token is not raw (should be base64url)
    assert.ok(token.length > 20, 'Token should be a long base64url string');

    // Verify token differs from its hash
    const tokenHash = hashToken(token);
    assert.notStrictEqual(token, tokenHash, 'Token should differ from its hash');

    // Verify database has the hash, not the raw token
    const rows = await adapter.queryAll<{
      token_hash: string;
      email: string;
      expires_at: number | Date | string;
    }>(
      `SELECT token_hash, email, expires_at FROM email_tokens WHERE token_hash = ? LIMIT 1`,
      [tokenHash]
    );

    assert.strictEqual(rows.length, 1, 'Should find exactly one token row');
    assert.strictEqual(rows[0].token_hash, tokenHash, 'Stored hash should match');
    assert.strictEqual(rows[0].email, user.email, 'Email should match');
    // expires_at is datetime (with dateStrings: true it comes as string) or BIGINT unix ms (as number)
    assert.ok(
      typeof rows[0].expires_at === 'string' || 
      typeof rows[0].expires_at === 'number' || 
      rows[0].expires_at instanceof Date,
      `expires_at should be string (datetime), number (BIGINT unix ms), or Date but got ${typeof rows[0].expires_at}`
    );

    // Verify expires_at is in the future and approximately correct
    const now = Date.now();
    const ttlMs = testConfig.emailTokens!.passwordResetTtlMinutes * 60 * 1000;
    const expectedMinExpiry = now + ttlMs;
    const expectedMaxExpiry = now + ttlMs + 1000; // 1s tolerance

    // Handle string (datetime), number (BIGINT unix ms), or Date types
    let expiresAtMs: number;
    if (typeof rows[0].expires_at === 'string') {
      expiresAtMs = new Date(rows[0].expires_at).getTime();
    } else if (rows[0].expires_at instanceof Date) {
      expiresAtMs = rows[0].expires_at.getTime();
    } else {
      expiresAtMs = rows[0].expires_at as number;
    }

    assert.ok(
      expiresAtMs >= expectedMinExpiry - 1000 && // 1s tolerance for timing
      expiresAtMs <= expectedMaxExpiry,
      'expires_at should be approximately now + TTL'
    );
  } finally {
    // Cleanup
    await cleanupUsers(adapter, [user.id]);
    await cleanupCompanies(adapter, [company.id]);
  }
});

// ---------------------------------------------------------------------------
// Test 2: validate() returns user data for valid token
// ---------------------------------------------------------------------------

testOrSkip('EmailTokenManager.validate() returns user data for valid token', async () => {
  const adapter = createRealDbAdapter();
  const manager = new EmailTokenManager(adapter, testConfig);

  const company = await createCompany(adapter);
  const user = await createUser(adapter, company.id, {}, testConfig);

  try {
    const { token } = await manager.create({
      companyId: company.id,
      userId: user.id,
      email: user.email,
      type: 'PASSWORD_RESET',
      createdBy: user.id,
    });

    const result = await manager.validate(token, 'PASSWORD_RESET');

    assert.deepStrictEqual(result, {
      userId: user.id,
      companyId: company.id,
      email: user.email,
    });
  } finally {
    await cleanupUsers(adapter, [user.id]);
    await cleanupCompanies(adapter, [company.id]);
  }
});

// ---------------------------------------------------------------------------
// Test 3: validate() throws EmailTokenExpiredError for expired token
// ---------------------------------------------------------------------------

testOrSkip('EmailTokenManager.validate() throws EmailTokenExpiredError for expired token', async () => {
  const adapter = createRealDbAdapter();
  const manager = new EmailTokenManager(adapter, testConfig);

  const company = await createCompany(adapter);
  const user = await createUser(adapter, company.id, {}, testConfig);

  try {
    // Create a token directly in DB with past expiry
    const rawToken = randomBytes(32).toString('base64url');
    const tokenHash = hashToken(rawToken);
    const pastExpiry = new Date(Date.now() - 3600000); // 1 hour ago

    await adapter.execute(
      `INSERT INTO email_tokens (company_id, user_id, email, token_hash, type, expires_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [company.id, user.id, user.email, tokenHash, 'PASSWORD_RESET' as EmailTokenType, pastExpiry, user.id]
    );

    // Validate should throw EmailTokenExpiredError
    await assert.rejects(
      async () => manager.validate(rawToken, 'PASSWORD_RESET'),
      EmailTokenExpiredError,
      'Should throw EmailTokenExpiredError for expired token'
    );
  } finally {
    await cleanupUsers(adapter, [user.id]);
    await cleanupCompanies(adapter, [company.id]);
  }
});

// ---------------------------------------------------------------------------
// Test 4: validateAndConsume() atomically consumes token
// ---------------------------------------------------------------------------

testOrSkip('EmailTokenManager.validateAndConsume() atomically consumes token', async () => {
  const adapter = createRealDbAdapter();
  const manager = new EmailTokenManager(adapter, testConfig);

  const company = await createCompany(adapter);
  const user = await createUser(adapter, company.id, {}, testConfig);

  try {
    const { token } = await manager.create({
      companyId: company.id,
      userId: user.id,
      email: user.email,
      type: 'PASSWORD_RESET',
      createdBy: user.id,
    });

    const tokenHash = hashToken(token);

    // Get a real DB connection for transaction
    const db = getTestDb();
    await db.beginTransaction();

    // Create proper AuthDbConnection wrapper that maps beginTransaction → begin
    const conn = createAuthDbConnection(db);

    let result: { userId: number; companyId: number; email: string } | null = null;
    try {
      result = await manager.validateAndConsume(conn, token, 'PASSWORD_RESET');
      await db.commit();
    } catch (err) {
      await db.rollback();
      throw err;
    }

    // Verify result
    assert.ok(result, 'Should return result');
    assert.deepStrictEqual(result, {
      userId: user.id,
      companyId: company.id,
      email: user.email,
    });

    // Verify used_at is set in database
    const rows = await adapter.queryAll<{ used_at: Date | null }>(
      `SELECT used_at FROM email_tokens WHERE token_hash = ? LIMIT 1`,
      [tokenHash]
    );

    assert.strictEqual(rows.length, 1, 'Should find token row');
    assert.ok(rows[0].used_at !== null, 'used_at should be set after consume');
  } finally {
    await cleanupUsers(adapter, [user.id]);
    await cleanupCompanies(adapter, [company.id]);
  }
});

// ---------------------------------------------------------------------------
// Test 5: invalidate() marks token as used
// ---------------------------------------------------------------------------

testOrSkip('EmailTokenManager.invalidate() marks token as used', async () => {
  const adapter = createRealDbAdapter();
  const manager = new EmailTokenManager(adapter, testConfig);

  const company = await createCompany(adapter);
  const user = await createUser(adapter, company.id, {}, testConfig);

  try {
    const { token } = await manager.create({
      companyId: company.id,
      userId: user.id,
      email: user.email,
      type: 'PASSWORD_RESET',
      createdBy: user.id,
    });

    const tokenHash = hashToken(token);

    // Initially used_at should be null
    let rows = await adapter.queryAll<{ used_at: Date | null }>(
      `SELECT used_at FROM email_tokens WHERE token_hash = ? LIMIT 1`,
      [tokenHash]
    );
    assert.strictEqual(rows[0].used_at, null, 'used_at should be null initially');

    // Call invalidate
    await manager.invalidate(token, 'PASSWORD_RESET');

    // Verify used_at is now set
    rows = await adapter.queryAll<{ used_at: Date | null }>(
      `SELECT used_at FROM email_tokens WHERE token_hash = ? LIMIT 1`,
      [tokenHash]
    );
    assert.ok(rows[0].used_at !== null, 'used_at should be set after invalidate');
  } finally {
    await cleanupUsers(adapter, [user.id]);
    await cleanupCompanies(adapter, [company.id]);
  }
});
