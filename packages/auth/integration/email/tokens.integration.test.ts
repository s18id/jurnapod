/**
 * Integration tests for EmailTokenManager
 * 
 * These tests use a real database and are skipped unless AUTH_TEST_USE_DB=1 is set.
 */

import { test } from 'node:test';
import assert from 'node:assert';
import { createHash, randomBytes } from "node:crypto";
import { EmailTokenManager } from '../../src/email/tokens.js';
import { EmailTokenExpiredError, EmailTokenInvalidError, EmailTokenUsedError } from '../../src/errors.js';
import { createRealDbAdapter, getTestDb, closeTestPool } from '../../src/test-utils/real-adapter.js';
import { useRealDb, testConfig } from '../../src/test-utils/test-adapter.js';
import { createCompany, cleanupCompanies } from '../../src/test-utils/fixtures/companies.js';
import { createUser, cleanupUsers } from '../../src/test-utils/fixtures/users.js';
import type { AuthDbAdapter } from '../../src/types.js';

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// ---------------------------------------------------------------------------
// create() tests
// ---------------------------------------------------------------------------

test("EmailTokenManager.create() - generates token with hash stored separately", { skip: !useRealDb }, async () => {
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

    const manager = new EmailTokenManager(adapter, testConfig);

    const result = await manager.create({
      companyId: company.id,
      userId: user.id,
      email: "test@example.com",
      type: "PASSWORD_RESET",
      createdBy: user.id
    });

    // Token should be a non-empty base64url string
    assert.ok(result.token, "Token should be generated");
    assert.ok(result.token.length > 20, "Token should be longer than 20 chars");

    // Token should be different from its hash
    const tokenHash = hashToken(result.token);
    assert.notStrictEqual(result.token, tokenHash, "Token should differ from its hash");

    // Verify the token was stored with its hash
    const storedTokens = await db
      .selectFrom("email_tokens")
      .where("token_hash", "=", tokenHash)
      .select(["email", "token_hash"])
      .execute();
    assert.strictEqual(storedTokens.length, 1, "Should have one stored token");
    assert.strictEqual(storedTokens[0].token_hash, tokenHash, "Hash should match");
    assert.strictEqual(storedTokens[0].email, "test@example.com", "Email should match");
  } finally {
    await cleanupUsers(adapter, userIds);
    await cleanupCompanies(adapter, companyIds);
  }
});

test("EmailTokenManager.create() - calculates correct expiry for PASSWORD_RESET", { skip: !useRealDb }, async () => {
  const adapter = createRealDbAdapter();
  const companyIds: number[] = [];
  const userIds: number[] = [];

  try {
    const company = await createCompany(adapter);
    companyIds.push(company.id);

    const user = await createUser(adapter, company.id, {}, testConfig);
    userIds.push(user.id);

    const manager = new EmailTokenManager(adapter, testConfig);

    const beforeCreate = Date.now();
    const result = await manager.create({
      companyId: company.id,
      userId: user.id,
      email: "test@example.com",
      type: "PASSWORD_RESET",
      createdBy: user.id
    });
    const afterCreate = Date.now();

    // passwordResetTtlMinutes from testConfig (10 minutes from .env.test)
    const ttlMs = testConfig.emailTokens!.passwordResetTtlMinutes * 60 * 1000;
    const expectedMinExpiry = beforeCreate + ttlMs;
    const expectedMaxExpiry = afterCreate + ttlMs;

    assert.ok(
      result.expiresAt.getTime() >= expectedMinExpiry &&
      result.expiresAt.getTime() <= expectedMaxExpiry,
      "Expiry should be within expected range for PASSWORD_RESET"
    );
  } finally {
    await cleanupUsers(adapter, userIds);
    await cleanupCompanies(adapter, companyIds);
  }
});

test("EmailTokenManager.create() - uses inviteTtlMinutes for INVITE type", { skip: !useRealDb }, async () => {
  const adapter = createRealDbAdapter();
  const companyIds: number[] = [];
  const userIds: number[] = [];

  try {
    const company = await createCompany(adapter);
    companyIds.push(company.id);

    const user = await createUser(adapter, company.id, {}, testConfig);
    userIds.push(user.id);

    const manager = new EmailTokenManager(adapter, testConfig);

    const beforeCreate = Date.now();
    const result = await manager.create({
      companyId: company.id,
      userId: user.id,
      email: "test@example.com",
      type: "INVITE",
      createdBy: user.id
    });
    const afterCreate = Date.now();

    // inviteTtlMinutes from testConfig (30 minutes from .env.test)
    const ttlMs = testConfig.emailTokens!.inviteTtlMinutes * 60 * 1000;
    const expectedMinExpiry = beforeCreate + ttlMs;
    const expectedMaxExpiry = afterCreate + ttlMs;

    assert.ok(
      result.expiresAt.getTime() >= expectedMinExpiry &&
      result.expiresAt.getTime() <= expectedMaxExpiry,
      "Expiry should be within expected range for INVITE"
    );
  } finally {
    await cleanupUsers(adapter, userIds);
    await cleanupCompanies(adapter, companyIds);
  }
});

test("EmailTokenManager.create() - uses verifyEmailTtlMinutes for VERIFY_EMAIL type", { skip: !useRealDb }, async () => {
  const adapter = createRealDbAdapter();
  const companyIds: number[] = [];
  const userIds: number[] = [];

  try {
    const company = await createCompany(adapter);
    companyIds.push(company.id);

    const user = await createUser(adapter, company.id, {}, testConfig);
    userIds.push(user.id);

    const manager = new EmailTokenManager(adapter, testConfig);

    const beforeCreate = Date.now();
    const result = await manager.create({
      companyId: company.id,
      userId: user.id,
      email: "test@example.com",
      type: "VERIFY_EMAIL",
      createdBy: user.id
    });
    const afterCreate = Date.now();

    // verifyEmailTtlMinutes from testConfig (10 minutes from .env.test)
    const ttlMs = testConfig.emailTokens!.verifyEmailTtlMinutes * 60 * 1000;
    const expectedMinExpiry = beforeCreate + ttlMs;
    const expectedMaxExpiry = afterCreate + ttlMs;

    assert.ok(
      result.expiresAt.getTime() >= expectedMinExpiry &&
      result.expiresAt.getTime() <= expectedMaxExpiry,
      "Expiry should be within expected range for VERIFY_EMAIL"
    );
  } finally {
    await cleanupUsers(adapter, userIds);
    await cleanupCompanies(adapter, companyIds);
  }
});

// ---------------------------------------------------------------------------
// validate() tests
// ---------------------------------------------------------------------------

test("EmailTokenManager.validate() - returns user data for valid token", { skip: !useRealDb }, async () => {
  const adapter = createRealDbAdapter();
  const companyIds: number[] = [];
  const userIds: number[] = [];

  try {
    const company = await createCompany(adapter);
    companyIds.push(company.id);

    const user = await createUser(adapter, company.id, {}, testConfig);
    userIds.push(user.id);

    const manager = new EmailTokenManager(adapter, testConfig);

    const { token } = await manager.create({
      companyId: company.id,
      userId: user.id,
      email: "test@example.com",
      type: "PASSWORD_RESET",
      createdBy: user.id
    });

    const result = await manager.validate(token, "PASSWORD_RESET");

    assert.deepStrictEqual(result, {
      userId: user.id,
      companyId: company.id,
      email: "test@example.com"
    });
  } finally {
    await cleanupUsers(adapter, userIds);
    await cleanupCompanies(adapter, companyIds);
  }
});

test("EmailTokenManager.validate() - throws EmailTokenInvalidError for unknown token", { skip: !useRealDb }, async () => {
  const adapter = createRealDbAdapter();

  try {
    const manager = new EmailTokenManager(adapter, testConfig);

    // Create a real token but don't store it - effectively garbage
    const garbageToken = randomBytes(32).toString("base64url");

    await assert.rejects(
      async () => manager.validate(garbageToken, "PASSWORD_RESET"),
      EmailTokenInvalidError,
      "Should throw EmailTokenInvalidError for unknown token"
    );
  } finally {
    // No fixtures to clean up
  }
});

test("EmailTokenManager.validate() - throws EmailTokenUsedError for used token", { skip: !useRealDb }, async () => {
  const adapter = createRealDbAdapter();
  const companyIds: number[] = [];
  const userIds: number[] = [];

  try {
    const company = await createCompany(adapter);
    companyIds.push(company.id);

    const user = await createUser(adapter, company.id, {}, testConfig);
    userIds.push(user.id);

    const manager = new EmailTokenManager(adapter, testConfig);

    const { token } = await manager.create({
      companyId: company.id,
      userId: user.id,
      email: "test@example.com",
      type: "PASSWORD_RESET",
      createdBy: user.id
    });

    // Invalidate the token first
    await manager.invalidate(token, "PASSWORD_RESET");

    // Now validate should throw used error
    await assert.rejects(
      async () => manager.validate(token, "PASSWORD_RESET"),
      EmailTokenUsedError,
      "Should throw EmailTokenUsedError for used token"
    );
  } finally {
    await cleanupUsers(adapter, userIds);
    await cleanupCompanies(adapter, companyIds);
  }
});

test("EmailTokenManager.validate() - throws EmailTokenExpiredError for expired token", { skip: !useRealDb }, async () => {
  const adapter = createRealDbAdapter();
  const companyIds: number[] = [];
  const userIds: number[] = [];

  try {
    const company = await createCompany(adapter);
    companyIds.push(company.id);

    const user = await createUser(adapter, company.id, {}, testConfig);
    userIds.push(user.id);

    const manager = new EmailTokenManager(adapter, testConfig);

    const { token } = await manager.create({
      companyId: company.id,
      userId: user.id,
      email: "test@example.com",
      type: "PASSWORD_RESET",
      createdBy: user.id
    });

    // Expire the token using helper method
    await manager.expireToken(token, "PASSWORD_RESET");

    await assert.rejects(
      async () => manager.validate(token, "PASSWORD_RESET"),
      EmailTokenExpiredError,
      "Should throw EmailTokenExpiredError for expired token"
    );
  } finally {
    await cleanupUsers(adapter, userIds);
    await cleanupCompanies(adapter, companyIds);
  }
});

// ---------------------------------------------------------------------------
// validateAndConsume() tests
// ---------------------------------------------------------------------------

test("EmailTokenManager.validateAndConsume() - atomically consumes token and returns user data", { skip: !useRealDb }, async () => {
  const adapter = createRealDbAdapter();
  const db = getTestDb();
  const companyIds: number[] = [];
  const userIds: number[] = [];

  try {
    const company = await createCompany(adapter);
    companyIds.push(company.id);

    const user = await createUser(adapter, company.id, {}, testConfig);
    userIds.push(user.id);

    const manager = new EmailTokenManager(adapter, testConfig);

    const { token } = await manager.create({
      companyId: company.id,
      userId: user.id,
      email: "test@example.com",
      type: "PASSWORD_RESET",
      createdBy: user.id
    });

    const result = await manager.validateAndConsume(token, "PASSWORD_RESET");

    assert.deepStrictEqual(result, {
      userId: user.id,
      companyId: company.id,
      email: "test@example.com"
    });

    // Verify used_at is now set
    const tokenHash = hashToken(token);
    const tokens = await db
      .selectFrom('email_tokens')
      .where('token_hash', '=', tokenHash)
      .select(['used_at'])
      .execute();
    assert.ok(tokens.length === 1, "Token should exist");
    assert.ok(tokens[0].used_at !== null, "used_at should be set");

    // Token should now be used
    await assert.rejects(
      async () => manager.validate(token, "PASSWORD_RESET"),
      EmailTokenUsedError,
      "Token should be marked as used after consume"
    );
  } finally {
    await cleanupUsers(adapter, userIds);
    await cleanupCompanies(adapter, companyIds);
  }
});

test("EmailTokenManager.validateAndConsume() - throws EmailTokenInvalidError for unknown token", { skip: !useRealDb }, async () => {
  const adapter = createRealDbAdapter();

  try {
    const manager = new EmailTokenManager(adapter, testConfig);

    const garbageToken = randomBytes(32).toString("base64url");

    await assert.rejects(
      async () => manager.validateAndConsume(garbageToken, "PASSWORD_RESET"),
      EmailTokenInvalidError,
      "Should throw EmailTokenInvalidError for unknown token"
    );
  } finally {
    // No fixtures to clean up
  }
});

test("EmailTokenManager.validateAndConsume() - throws EmailTokenUsedError for already used token", { skip: !useRealDb }, async () => {
  const adapter = createRealDbAdapter();
  const companyIds: number[] = [];
  const userIds: number[] = [];

  try {
    const company = await createCompany(adapter);
    companyIds.push(company.id);

    const user = await createUser(adapter, company.id, {}, testConfig);
    userIds.push(user.id);

    const manager = new EmailTokenManager(adapter, testConfig);

    const { token } = await manager.create({
      companyId: company.id,
      userId: user.id,
      email: "test@example.com",
      type: "PASSWORD_RESET",
      createdBy: user.id
    });

    // First consume
    await manager.validateAndConsume(token, "PASSWORD_RESET");

    // Try to consume again
    await assert.rejects(
      async () => manager.validateAndConsume(token, "PASSWORD_RESET"),
      EmailTokenUsedError,
      "Should throw EmailTokenUsedError when consuming already used token"
    );
  } finally {
    await cleanupUsers(adapter, userIds);
    await cleanupCompanies(adapter, companyIds);
  }
});

test("EmailTokenManager.validateAndConsume() - throws EmailTokenExpiredError for expired token", { skip: !useRealDb }, async () => {
  const adapter = createRealDbAdapter();
  const companyIds: number[] = [];
  const userIds: number[] = [];

  try {
    const company = await createCompany(adapter);
    companyIds.push(company.id);

    const user = await createUser(adapter, company.id, {}, testConfig);
    userIds.push(user.id);

    const manager = new EmailTokenManager(adapter, testConfig);

    const { token } = await manager.create({
      companyId: company.id,
      userId: user.id,
      email: "test@example.com",
      type: "PASSWORD_RESET",
      createdBy: user.id
    });

    // Expire the token using helper method
    await manager.expireToken(token, "PASSWORD_RESET");

    await assert.rejects(
      async () => manager.validateAndConsume(token, "PASSWORD_RESET"),
      EmailTokenExpiredError
    );
  } finally {
    await cleanupUsers(adapter, userIds);
    await cleanupCompanies(adapter, companyIds);
  }
});

// ---------------------------------------------------------------------------
// invalidate() tests
// ---------------------------------------------------------------------------

test("EmailTokenManager.invalidate() - marks token as used by setting used_at", { skip: !useRealDb }, async () => {
  const adapter = createRealDbAdapter();
  const db = getTestDb();
  const companyIds: number[] = [];
  const userIds: number[] = [];

  try {
    const company = await createCompany(adapter);
    companyIds.push(company.id);

    const user = await createUser(adapter, company.id, {}, testConfig);
    userIds.push(user.id);

    const manager = new EmailTokenManager(adapter, testConfig);

    const { token } = await manager.create({
      companyId: company.id,
      userId: user.id,
      email: "test@example.com",
      type: "PASSWORD_RESET",
      createdBy: user.id
    });

    // Initially used_at should be null
    const tokenHash = hashToken(token);
    let tokens = await db
      .selectFrom('email_tokens')
      .where('token_hash', '=', tokenHash)
      .select(['used_at'])
      .execute();
    assert.strictEqual(tokens[0].used_at, null, "used_at initially null");

    // Invalidate
    await manager.invalidate(token, "PASSWORD_RESET");

    // Now used_at should be set
    tokens = await db
      .selectFrom('email_tokens')
      .where('token_hash', '=', tokenHash)
      .select(['used_at'])
      .execute();
    assert.ok(tokens[0].used_at !== null, "used_at should be set after invalidate");
  } finally {
    await cleanupUsers(adapter, userIds);
    await cleanupCompanies(adapter, companyIds);
  }
});

// ---------------------------------------------------------------------------
// getInfo() tests
// ---------------------------------------------------------------------------

test("EmailTokenManager.getInfo() - returns info without validation for valid token", { skip: !useRealDb }, async () => {
  const adapter = createRealDbAdapter();
  const companyIds: number[] = [];
  const userIds: number[] = [];

  try {
    const company = await createCompany(adapter);
    companyIds.push(company.id);

    const user = await createUser(adapter, company.id, {}, testConfig);
    userIds.push(user.id);

    const manager = new EmailTokenManager(adapter, testConfig);

    const { token } = await manager.create({
      companyId: company.id,
      userId: user.id,
      email: "test@example.com",
      type: "PASSWORD_RESET",
      createdBy: user.id
    });

    const result = await manager.getInfo(token, "PASSWORD_RESET");

    assert.ok(result, "Result should not be null");
    assert.strictEqual(result!.userId, user.id, "userId should match");
    assert.strictEqual(result!.companyId, company.id, "companyId should match");
    assert.strictEqual(result!.email, "test@example.com", "email should match");
    assert.ok(result!.expiresAt instanceof Date, "expiresAt should be a Date");
  } finally {
    await cleanupUsers(adapter, userIds);
    await cleanupCompanies(adapter, companyIds);
  }
});

test("EmailTokenManager.getInfo() - returns info even for expired token without throwing", { skip: !useRealDb }, async () => {
  const adapter = createRealDbAdapter();
  const db = getTestDb();
  const companyIds: number[] = [];
  const userIds: number[] = [];

  try {
    const company = await createCompany(adapter);
    companyIds.push(company.id);

    const user = await createUser(adapter, company.id, {}, testConfig);
    userIds.push(user.id);

    const manager = new EmailTokenManager(adapter, testConfig);

    const { token } = await manager.create({
      companyId: company.id,
      userId: user.id,
      email: "test@example.com",
      type: "PASSWORD_RESET",
      createdBy: user.id
    });

    // Manually set expiry to past in the database
    const tokenHash = hashToken(token);
    await db
      .updateTable('email_tokens')
      .set({ expires_at: new Date(Date.now() - 1000) })
      .where('token_hash', '=', tokenHash)
      .execute();

    // getInfo should NOT throw even for expired token
    const result = await manager.getInfo(token, "PASSWORD_RESET");

    assert.ok(result, "Result should not be null for expired token");
    assert.strictEqual(result!.userId, user.id, "userId should still be accessible");
  } finally {
    await cleanupUsers(adapter, userIds);
    await cleanupCompanies(adapter, companyIds);
  }
});

test("EmailTokenManager.getInfo() - returns null for unknown token", { skip: !useRealDb }, async () => {
  const adapter = createRealDbAdapter();

  try {
    const manager = new EmailTokenManager(adapter, testConfig);

    const garbageToken = randomBytes(32).toString("base64url");

    const result = await manager.getInfo(garbageToken, "PASSWORD_RESET");

    assert.strictEqual(result, null, "Should return null for unknown token");
  } finally {
    // No fixtures to clean up
  }
});

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

test.after(async () => {
  await closeTestPool();
});
