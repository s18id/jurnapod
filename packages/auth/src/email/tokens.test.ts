/**
 * Tests for EmailTokenManager
 */

import { test } from 'node:test';
import assert from 'node:assert';
import { createHash, randomBytes } from "node:crypto";
import { EmailTokenManager } from "./tokens.js";
import {
  EmailTokenInvalidError,
  EmailTokenExpiredError,
  EmailTokenUsedError
} from "../errors.js";
import { createMockAdapter, testConfig } from "../test-utils/mock-adapter.js";
import type { AuthDbConnection } from "../types.js";

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

function createMockConnection(adapter: ReturnType<typeof createMockAdapter>): AuthDbConnection {
  return adapter as unknown as AuthDbConnection;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// ---------------------------------------------------------------------------
// create() tests
// ---------------------------------------------------------------------------

test("EmailTokenManager.create() - generates token with hash stored separately", async () => {
  const adapter = createMockAdapter();
  adapter.clearMockData();
  const manager = new EmailTokenManager(adapter, testConfig);

  const result = await manager.create({
    companyId: 1,
    userId: 100,
    email: "test@example.com",
    type: "PASSWORD_RESET",
    createdBy: 1
  });

  // Token should be a non-empty base64url string
  assert.ok(result.token, "Token should be generated");
  assert.ok(result.token.length > 20, "Token should be longer than 20 chars");

  // Token should be different from its hash
  const tokenHash = hashToken(result.token);
  assert.notStrictEqual(result.token, tokenHash, "Token should differ from its hash");

  // Verify the token was stored with its hash
  const storedTokens = (adapter.data.email_tokens || []) as Array<{
    token_hash: string;
    email: string;
  }>;
  assert.strictEqual(storedTokens.length, 1, "Should have one stored token");
  assert.strictEqual(storedTokens[0].token_hash, tokenHash, "Hash should match");
  assert.strictEqual(storedTokens[0].email, "test@example.com", "Email should match");
});

test("EmailTokenManager.create() - calculates correct expiry for PASSWORD_RESET", async () => {
  const adapter = createMockAdapter();
  adapter.clearMockData();
  const manager = new EmailTokenManager(adapter, testConfig);

  const beforeCreate = Date.now();
  const result = await manager.create({
    companyId: 1,
    userId: 100,
    email: "test@example.com",
    type: "PASSWORD_RESET",
    createdBy: 1
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
});

test("EmailTokenManager.create() - uses inviteTtlMinutes for INVITE type", async () => {
  const adapter = createMockAdapter();
  adapter.clearMockData();
  const manager = new EmailTokenManager(adapter, testConfig);

  const beforeCreate = Date.now();
  const result = await manager.create({
    companyId: 1,
    userId: 100,
    email: "test@example.com",
    type: "INVITE",
    createdBy: 1
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
});

test("EmailTokenManager.create() - uses verifyEmailTtlMinutes for VERIFY_EMAIL type", async () => {
  const adapter = createMockAdapter();
  adapter.clearMockData();
  const manager = new EmailTokenManager(adapter, testConfig);

  const beforeCreate = Date.now();
  const result = await manager.create({
    companyId: 1,
    userId: 100,
    email: "test@example.com",
    type: "VERIFY_EMAIL",
    createdBy: 1
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
});

// ---------------------------------------------------------------------------
// validate() tests
// ---------------------------------------------------------------------------

test("EmailTokenManager.validate() - returns user data for valid token", async () => {
  const adapter = createMockAdapter();
  adapter.clearMockData();
  const manager = new EmailTokenManager(adapter, testConfig);

  const { token } = await manager.create({
    companyId: 1,
    userId: 100,
    email: "test@example.com",
    type: "PASSWORD_RESET",
    createdBy: 1
  });

  const result = await manager.validate(token, "PASSWORD_RESET");

  assert.deepStrictEqual(result, {
    userId: 100,
    companyId: 1,
    email: "test@example.com"
  });
});

test("EmailTokenManager.validate() - throws EmailTokenInvalidError for unknown token", async () => {
  const adapter = createMockAdapter();
  adapter.clearMockData();
  const manager = new EmailTokenManager(adapter, testConfig);

  // Create a real token but don't store it - effectively garbage
  const garbageToken = randomBytes(32).toString("base64url");

  await assert.rejects(
    async () => manager.validate(garbageToken, "PASSWORD_RESET"),
    EmailTokenInvalidError,
    "Should throw EmailTokenInvalidError for unknown token"
  );
});

test("EmailTokenManager.validate() - throws EmailTokenUsedError for used token", async () => {
  const adapter = createMockAdapter();
  adapter.clearMockData();
  const manager = new EmailTokenManager(adapter, testConfig);

  const { token } = await manager.create({
    companyId: 1,
    userId: 100,
    email: "test@example.com",
    type: "PASSWORD_RESET",
    createdBy: 1
  });

  // Invalidate the token first
  await manager.invalidate(token, "PASSWORD_RESET");

  // Now validate should throw used error
  await assert.rejects(
    async () => manager.validate(token, "PASSWORD_RESET"),
    EmailTokenUsedError,
    "Should throw EmailTokenUsedError for used token"
  );
});

test("EmailTokenManager.validate() - throws EmailTokenExpiredError for expired token", async () => {
  const adapter = createMockAdapter();
  adapter.clearMockData();
  const manager = new EmailTokenManager(adapter, testConfig);

  const { token } = await manager.create({
    companyId: 1,
    userId: 100,
    email: "test@example.com",
    type: "PASSWORD_RESET",
    createdBy: 1
  });

  // Manually set expiry to past
  const tokens = adapter.data.email_tokens || [];
  (tokens[0] as { expires_at: Date }).expires_at = new Date(Date.now() - 1000);

  await assert.rejects(
    async () => manager.validate(token, "PASSWORD_RESET"),
    EmailTokenExpiredError,
    "Should throw EmailTokenExpiredError for expired token"
  );
});

// ---------------------------------------------------------------------------
// validateAndConsume() tests
// ---------------------------------------------------------------------------

test("EmailTokenManager.validateAndConsume() - atomically consumes token and returns user data", async () => {
  const adapter = createMockAdapter();
  adapter.clearMockData();
  const manager = new EmailTokenManager(adapter, testConfig);

  const { token } = await manager.create({
    companyId: 1,
    userId: 100,
    email: "test@example.com",
    type: "PASSWORD_RESET",
    createdBy: 1
  });

  const connection = createMockConnection(adapter);
  const result = await manager.validateAndConsume(connection, token, "PASSWORD_RESET");

  assert.deepStrictEqual(result, {
    userId: 100,
    companyId: 1,
    email: "test@example.com"
  });

  // Verify used_at is now set
  const tokens = adapter.data.email_tokens || [];
  assert.ok((tokens[0] as { used_at: Date | null }).used_at, "used_at should be set");

  // Token should now be used
  await assert.rejects(
    async () => manager.validate(token, "PASSWORD_RESET"),
    EmailTokenUsedError,
    "Token should be marked as used after consume"
  );
});

test("EmailTokenManager.validateAndConsume() - throws EmailTokenInvalidError for unknown token", async () => {
  const adapter = createMockAdapter();
  adapter.clearMockData();
  const manager = new EmailTokenManager(adapter, testConfig);

  const garbageToken = randomBytes(32).toString("base64url");
  const connection = createMockConnection(adapter);

  await assert.rejects(
    async () => manager.validateAndConsume(connection, garbageToken, "PASSWORD_RESET"),
    EmailTokenInvalidError,
    "Should throw EmailTokenInvalidError for unknown token"
  );
});

test("EmailTokenManager.validateAndConsume() - throws EmailTokenUsedError for already used token", async () => {
  const adapter = createMockAdapter();
  adapter.clearMockData();
  const manager = new EmailTokenManager(adapter, testConfig);

  const { token } = await manager.create({
    companyId: 1,
    userId: 100,
    email: "test@example.com",
    type: "PASSWORD_RESET",
    createdBy: 1
  });

  // First consume
  const connection1 = createMockConnection(adapter);
  await manager.validateAndConsume(connection1, token, "PASSWORD_RESET");

  // Try to consume again
  const connection2 = createMockConnection(adapter);
  await assert.rejects(
    async () => manager.validateAndConsume(connection2, token, "PASSWORD_RESET"),
    EmailTokenUsedError,
    "Should throw EmailTokenUsedError when consuming already used token"
  );
});

test("EmailTokenManager.validateAndConsume() - throws EmailTokenExpiredError for expired token", async () => {
  const adapter = createMockAdapter();
  adapter.clearMockData();
  const manager = new EmailTokenManager(adapter, testConfig);

  const { token } = await manager.create({
    companyId: 1,
    userId: 100,
    email: "test@example.com",
    type: "PASSWORD_RESET",
    createdBy: 1
  });

  // Manually set expiry to past
  const tokens = adapter.data.email_tokens || [];
  (tokens[0] as { expires_at: Date }).expires_at = new Date(Date.now() - 1000);

  const connection = createMockConnection(adapter);
  await assert.rejects(
    async () => manager.validateAndConsume(connection, token, "PASSWORD_RESET"),
    EmailTokenExpiredError,
    "Should throw EmailTokenExpiredError for expired token"
  );
});

// ---------------------------------------------------------------------------
// invalidate() tests
// ---------------------------------------------------------------------------

test("EmailTokenManager.invalidate() - marks token as used by setting used_at", async () => {
  const adapter = createMockAdapter();
  adapter.clearMockData();
  const manager = new EmailTokenManager(adapter, testConfig);

  const { token } = await manager.create({
    companyId: 1,
    userId: 100,
    email: "test@example.com",
    type: "PASSWORD_RESET",
    createdBy: 1
  });

  // Initially used_at should be null
  let tokens = adapter.data.email_tokens || [];
  assert.strictEqual((tokens[0] as { used_at: Date | null }).used_at, null, "used_at initially null");

  // Invalidate
  await manager.invalidate(token, "PASSWORD_RESET");

  // Now used_at should be set
  tokens = adapter.data.email_tokens || [];
  assert.ok((tokens[0] as { used_at: Date | null }).used_at, "used_at should be set after invalidate");
});

// ---------------------------------------------------------------------------
// getInfo() tests
// ---------------------------------------------------------------------------

test("EmailTokenManager.getInfo() - returns info without validation for valid token", async () => {
  const adapter = createMockAdapter();
  adapter.clearMockData();
  const manager = new EmailTokenManager(adapter, testConfig);

  const { token } = await manager.create({
    companyId: 1,
    userId: 100,
    email: "test@example.com",
    type: "PASSWORD_RESET",
    createdBy: 1
  });

  const result = await manager.getInfo(token, "PASSWORD_RESET");

  assert.ok(result, "Result should not be null");
  assert.strictEqual(result!.userId, 100, "userId should match");
  assert.strictEqual(result!.companyId, 1, "companyId should match");
  assert.strictEqual(result!.email, "test@example.com", "email should match");
  assert.ok(result!.expiresAt instanceof Date, "expiresAt should be a Date");
});

test("EmailTokenManager.getInfo() - returns info even for expired token without throwing", async () => {
  const adapter = createMockAdapter();
  adapter.clearMockData();
  const manager = new EmailTokenManager(adapter, testConfig);

  const { token } = await manager.create({
    companyId: 1,
    userId: 100,
    email: "test@example.com",
    type: "PASSWORD_RESET",
    createdBy: 1
  });

  // Manually set expiry to past
  const tokens = adapter.data.email_tokens || [];
  (tokens[0] as { expires_at: Date }).expires_at = new Date(Date.now() - 1000);

  // getInfo should NOT throw even for expired token
  const result = await manager.getInfo(token, "PASSWORD_RESET");

  assert.ok(result, "Result should not be null for expired token");
  assert.strictEqual(result!.userId, 100, "userId should still be accessible");
});

test("EmailTokenManager.getInfo() - returns null for unknown token", async () => {
  const adapter = createMockAdapter();
  adapter.clearMockData();
  const manager = new EmailTokenManager(adapter, testConfig);

  const garbageToken = randomBytes(32).toString("base64url");

  const result = await manager.getInfo(garbageToken, "PASSWORD_RESET");

  assert.strictEqual(result, null, "Should return null for unknown token");
});
