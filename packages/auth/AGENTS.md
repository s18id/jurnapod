# AGENTS.md — @jurnapod/auth

## Package Purpose

Authentication and authorization library for Jurnapod ERP.

**Core Capabilities:**
- JWT access tokens (sign/verify with jose, HS256)
- Refresh token lifecycle (issue, rotate, revoke, cookie support)
- Password hashing (bcrypt, Argon2id) with automatic rehashing
- RBAC (roles, permissions, outlet access with bitmask)
- Login throttling (exponential backoff, primary + IP-based)
- Email tokens (reset, invite, verify) with atomic consumption
- OAuth (Google provider) with account linking
- Audit logging (login attempts to audit_logs table)

**Boundaries:**
- ✅ In: Token operations, password hashing, permission checks, token lifecycle, cookie creation, audit logging
- ❌ Out: HTTP handling, cookie setting on response, env var reading, database connection pooling

---

## Quick Commands

| Command | Purpose |
|---------|---------|
| `npm run typecheck` | TypeScript check |
| `npm run build` | Compile TypeScript to dist/ |
| `npm run lint` | Lint code (echo placeholder) |
| `npm run test` | Run unit tests with mock adapters |
| `npm run test:unit` | Run unit tests excluding integration tests |
| `npm run test:db` | Run integration tests with real DB |
| `npm run test:single <file>` | Run single test file |
| `npm run test:oauth` | Run tests including OAuth tests |

---

## Architecture Patterns

### Database Adapter Pattern

The package accepts an `AuthDbAdapter` — it never imports `@jurnapod/db` directly. Consumers provide the adapter implementation:

```typescript
// Consumer provides adapter (e.g., wrapping @jurnapod/db)
const adapter = new MyDbAdapter(dbPool);
const auth = createAuthClient(adapter, config);
```

**Adapter interface** (`src/types.ts`):
```typescript
export interface AuthDbAdapter {
  db: Kysely<DB>;
  transaction<T>(fn: (trx: AuthDbAdapter) => Promise<T>): Promise<T>;
}
```

### Configuration Injection

All config passed via `AuthConfig` object. No `process.env` access:

```typescript
const config: AuthConfig = {
  tokens: {
    accessTokenSecret: "your-secret",
    accessTokenTtlSeconds: 900, // 15 min
    refreshTokenSecret: "your-secret",
    refreshTokenTtlSeconds: 604800, // 7 days
    refreshCookieCrossSite: true,
  },
  password: {
    defaultAlgorithm: "argon2id",
    bcryptRounds: 12,
    argon2MemoryKb: 65536,
    argon2TimeCost: 3,
    argon2Parallelism: 4,
    rehashOnLogin: true
  },
  throttle: {
    baseDelayMs: 1000,
    maxDelayMs: 60000
  },
  oauth: {
    google: {
      clientId: "...",
      clientSecret: "...",
      redirectUris: ["https://app.example.com/auth/callback"]
    }
  },
  emailTokens: {
    passwordResetTtlMinutes: 60,
    inviteTtlMinutes: 10080,
    verifyEmailTtlMinutes: 43200
  }
};
```

---

## Module Organization

| Module | Class/Export | Purpose |
|--------|--------------|---------|
| `src/tokens/` | `AccessTokenManager`, `RefreshTokenManager` | JWT sign/verify (jose), refresh token lifecycle with rotation |
| `src/passwords/` | `PasswordHasher`, `validatePasswordPolicy` | bcryptjs/@node-rs/argon2 hashing, password policy |
| `src/rbac/` | `RBACManager`, `checkRole`, `buildPermissionMask` | Role and permission checks with resource-level ACL (Epic 39) |
| `src/throttle/` | `LoginThrottle` | Rate limiting with exponential backoff (primary + IP) |
| `src/email/` | `EmailTokenManager` | Password reset, invite, verify tokens with atomic consumption |
| `src/oauth/` | `GoogleOAuthProvider` | Google OAuth 2.0 integration |
| `src/lib/` | `createAuthClient` | Auth client factory assembling all managers |
| `src/errors.ts` | `AuthError` subclasses | Typed error hierarchy |

### RBAC Permission Model (Epic 39)

**Resource-Level ACL**: Permissions use `module.resource` format (e.g., `platform.users`, `accounting.journals`)

**Permission Bits:**
- READ=1, CREATE=2, UPDATE=4, DELETE=8, ANALYZE=16, MANAGE=32

**Role Permission Matrix:**
| Role | platform | accounting | inventory | treasury | sales | pos | reservations |
|------|----------|------------|-----------|----------|-------|-----|--------------|
| SUPER_ADMIN | CRUDAM (63) | CRUDAM (63) | CRUDAM (63) | CRUDAM (63) | CRUDAM (63) | CRUDAM (63) | CRUDAM (63) |
| OWNER | CRUDAM (63) | CRUDAM (63) | CRUDAM (63) | CRUDAM (63) | CRUDAM (63) | CRUDAM (63) | CRUDAM (63) |
| COMPANY_ADMIN | CRUDA (31) | CRUDAM (63) | CRUDAM (63) | CRUDAM (63) | CRUDAM (63) | CRUDAM (63) | CRUDAM (63) |
| ADMIN | READ (1) | CRUDA (31) | CRUDA (31) | CRUDA (31) | CRUDA (31) | CRUDA (31) | CRUDA (31) |
| ACCOUNTANT | READ (1) | CRUDA (31) | READ (1) | READ (1) | READ (1) | READ (1) | 0 |
| CASHIER | 0 | 0 | 0 | 0 | 0 | CRUDA (31) | CRUDA (31) |

See root `AGENTS.md` for full Epic 39 ACL documentation.

### File Structure

```
packages/auth/
├── src/
│   ├── index.ts              # Main exports (createAuthClient, AuthClient, core types)
│   ├── types.ts              # AuthDbAdapter, AuthConfig, domain types, AuthClient interface
│   ├── errors.ts             # AuthError subclasses
│   │
│   ├── tokens/
│   │   ├── index.ts
│   │   ├── access-tokens.ts  # JWT sign/verify (jose)
│   │   └── refresh-tokens.ts # Token lifecycle with rotation, cookie support
│   │
│   ├── passwords/
│   │   ├── index.ts
│   │   ├── hash.ts           # bcryptjs/@node-rs/argon2
│   │   └── policy.ts         # Password policy validation
│   │
│   ├── rbac/
│   │   ├── index.ts
│   │   ├── roles.ts          # ROLE_CODES, role checking
│   │   ├── permissions.ts    # MODULE_PERMISSION_BITS (bitmask)
│   │   └── access-check.ts   # User access validation with outlet scoping
│   │
│   ├── oauth/
│   │   ├── index.ts
│   │   ├── types.ts          # OAuth interfaces
│   │   └── google.ts         # Google OAuth implementation
│   │
│   ├── throttle/
│   │   ├── index.ts
│   │   └── login-throttle.ts # Rate limiting with exponential backoff
│   │
│   ├── email/
│   │   ├── index.ts
│   │   └── tokens.ts         # Email token lifecycle with atomic consumption
│   │
│   ├── lib/
│   │   └── client.ts         # createAuthClient factory
│   │
│   └── test-utils/           # Test utilities
│
├── package.json
├── tsconfig.json
├── README.md
└── AGENTS.md (this file)
```

---

## Coding Standards

### TypeScript Conventions

1. **Use `.js` extensions in imports** (ESM compliance):
   ```typescript
   import { AccessTokenManager } from "./tokens/index.js";
   import type { AuthConfig } from "../types.js";
   ```

2. **Never use `@/` path aliases** — use relative imports

3. **Export types from `index.ts`** for public API surface

4. **Use `zod` for input validation** on external data (JWT claims, OAuth tokens)

### SQL Patterns

1. **Use snake_case for SQL column names** (MySQL/MariaDB compatibility)

2. **Use Kysely query builder exclusively** — no raw SQL except for MySQL-specific syntax:
   ```typescript
   // CORRECT - Kysely query builder
   const user = await adapter.db.selectFrom('users').where('id', '=', userId).executeTakeFirst();
   
   // WRONG - raw SQL
   await adapter.query('SELECT * FROM users WHERE id = ?', [userId]);
   ```

3. **Always use transactions** for multi-step operations:
   ```typescript
   await adapter.db.transaction().execute(async (trx) => {
     // Step 1: revoke old token
     await trx.updateTable('auth_refresh_tokens').set({revoked_at: new Date()}).where('id', '=', oldId).execute();
     // Step 2: issue new token
     await trx.insertInto('auth_refresh_tokens').values({...}).execute();
   });
   ```

4. **Use `.forUpdate()` for row locking** when rotating tokens to prevent race conditions:
   ```typescript
   const token = await trx.selectFrom('auth_refresh_tokens')
     .where('token_hash', '=', tokenHash)
     .forUpdate()
     .executeTakeFirst();
   ```

5. **Use `sql` template tag only for MySQL-specific syntax** (e.g., `ON DUPLICATE KEY UPDATE`):
   ```typescript
   import { sql } from 'kysely';
   
   await adapter.db.insertInto('table').values({...})
     .onDuplicateKeyUpdate({
       counter: sql`counter + 1`
     });
   ```

### Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| SQL columns | snake_case | `company_id`, `token_hash` |
| TypeScript types | PascalCase | `AccessTokenUser`, `RoleCode` |
| Constants | SCREAMING_SNAKE_CASE | `ROLE_CODES`, `MODULE_PERMISSION_BITS` |
| Methods | camelCase | `rotateRefreshToken`, `hashPassword` |
| Error classes | PascalCase with `Error` suffix | `InvalidCredentialsError` |

---

## Testing Approach

### ACL Cleanup Policy (P0 Blocker)

**Canonical system roles are immutable reference data in persistent test DBs.**
Never delete or broadly mutate `module_roles` for system roles (`SUPER_ADMIN`, `OWNER`, `COMPANY_ADMIN`, `ADMIN`, `ACCOUNTANT`, `CASHIER`) using shared `role_id` scope.

**P0 Rules:**
- ❌ **BLOCKER**: Cleanup/deletion on `module_roles` by `role_id` alone
- ✅ **Required**: Scope ACL cleanup by `company_id` **and** `role_id`
- ✅ **Required**: Prefer cleanup by exact inserted row IDs when possible
- ✅ **Required**: Integration tests should mutate custom test roles or company-scoped rows only

**Bad cleanup pattern (forbidden):**
```typescript
await db.deleteFrom('module_roles').where('role_id', 'in', roleIds).execute();
```

**Safe cleanup pattern:**
```typescript
await db
  .deleteFrom('module_roles')
  .where('company_id', '=', testCompanyId)
  .where('role_id', 'in', roleIds)
  .execute();
```

### Rule: NO Mock Adapter for DB-Related Tests

**Mock adapter is forbidden for database-related tests.** DB operations must be tested with real database using integration tests.

**Why?** Mock adapters don't catch:
- SQL syntax errors
- Schema mismatches
- Transaction isolation bugs
- Foreign key constraint issues
- Index performance problems

### What Gets Integration Tests vs Unit Tests

| Category | Testing Method | Location |
|----------|---------------|----------|
| **DB operations** (tokens, throttle, RBAC, email tokens) | Integration tests with real DB | `integration/**/*.integration.test.ts` |
| **Business logic** (password hashing, JWT signing, permission bitmasks) | Unit tests with no mocks needed | `src/**/*.test.ts` |
| **Configuration validation** | Unit tests | `src/**/*.test.ts` |

### Integration Tests (Real Database)

DB-related tests MUST use integration tests with real database:

```typescript
// integration/tokens/refresh-tokens.integration.test.ts
import { createAuthClient } from '@jurnapod/auth';
import { createRealDbAdapter, closeTestPool } from '../../test-utils/real-adapter.js';

describe('RefreshTokenManager', () => {
  let adapter: AuthDbAdapter;
  
  beforeEach(() => {
    adapter = createRealDbAdapter();
  });
  
  afterEach(async () => {
    await closeTestPool();
  });
  
  it('should issue and verify refresh token', async () => {
    const auth = createAuthClient(adapter, config);
    const result = await auth.tokens.issueRefreshToken({...});
    expect(result.token).toBeDefined();
  });
});
```

Run integration tests:
```bash
npm run test:db    # Run integration tests with real DB
```

### Unit Tests (Non-DB Logic)

Only non-DB logic runs without database:

```typescript
// src/passwords/hash.test.ts - Unit test (no DB)
import { PasswordHasher } from './hash.js';

describe('PasswordHasher', () => {
  it('should hash and verify password', async () => {
    const hasher = new PasswordHasher(config);
    const hash = await hasher.hash('password123');
    const valid = await hasher.verify('password123', hash);
    expect(valid).toBe(true);
  });
});
```

### Test File Naming

- Unit tests: `src/**/*.test.ts` (co-located with source, for non-DB logic only)
- Integration tests: `integration/**/*.integration.test.ts` (for DB-related operations)

### Test Categories

| Module | Type | Why |
|--------|------|-----|
| `passwords/hash.ts` | Unit (mock) | Pure computation, no DB |
| `tokens/access-tokens.ts` | Unit (mock) | JWT signing, no DB |
| `tokens/refresh-tokens.ts` | **Integration** | DB operations |
| `rbac/access-check.ts` | **Integration** | DB operations |
| `throttle/login-throttle.ts` | **Integration** | DB operations |
| `email/tokens.ts` | **Integration** | DB operations |
| `oauth/google.ts` | **Integration** | DB operations |
| `lib/client.ts` | **Integration** | DB operations |

### Running Tests

```bash
npm run test       # Unit tests only (no mock DB)
npm run test:db   # Integration tests with real database
npm run test:unit  # Alias for npm run test
```

---

## Security Rules

### Critical Security Constraints

1. **Never log secrets or tokens**
   ```typescript
   // WRONG - token exposure in logs
   console.log('Token:', token);
   
   // CORRECT - log only non-sensitive info
   logger.debug('Token issued', { userId, tokenId });
   ```

2. **Constant-time password comparison** — use bcrypt/Argon2 verification (already built-in):
   ```typescript
   // Use PasswordHasher.verify() - not manual comparison
   const isValid = await hasher.verify(plain, storedHash);
   ```

3. **Short-lived access tokens** — default 15 minutes:
   ```typescript
   accessTokenTtlSeconds: 900 // 15 min
   ```

4. **Refresh token rotation required** — old tokens MUST be revoked on rotation:
   ```typescript
   // Each rotation: old token → revoked, new token → issued
   // Store SHA-256 hash of refresh token, never raw token
   ```

5. **Rate limiting on all login attempts**:
   ```typescript
   // Exponential backoff: 1s, 2s, 4s, 8s, ... max 60s
   // Both email+company AND IP-based throttling
   ```

6. **Always validate OAuth redirect URIs** against allowlist:
   ```typescript
   assertRedirectUriAllowed(redirectUri); // throws if not in config.redirectUris
   ```

7. **Token hashes in database, not raw tokens**:
   ```typescript
   // Store SHA-256 hash of refresh token, never raw token
   const tokenHash = createHmac('sha256', secret).update(token).digest('hex');
   ```

8. **Atomic token consumption** for email tokens — prevent race conditions:
   ```typescript
   // Use transaction with FOR UPDATE or connection-level atomic update
   await connection.execute(
     'UPDATE email_tokens SET used_at = NOW() WHERE token_hash = ? AND used_at IS NULL',
     [tokenHash]
   );
   ```

---

## Review Checklist

When modifying this package:

- [ ] No `process.env` access — all config via `AuthConfig`
- [ ] No `@jurnapod/db` imports — use `AuthDbAdapter`
- [ ] All database operations use Kysely query builder (no raw SQL unless MySQL-specific syntax required)
- [ ] Token rotation uses transactions with `.forUpdate()` locking
- [ ] Password verification uses library functions (bcrypt/Argon2)
- [ ] No secrets or tokens in log statements
- [ ] OAuth redirect URIs validated against allowlist
- [ ] DB operations tested with real database in integration tests
- [ ] Tests cover happy path AND error/revoked/expired cases
- [ ] New features exported from `index.ts` submodule entry points

---

## Related Packages

- `@jurnapod/db` — Provides database connection; consumer of this package
- `@jurnapod/api` — Uses this package for auth operations
- `@jurnapod/shared` — Shared contracts and Zod schemas

## Database Testing Policy (MANDATORY)

**NO MOCK DB for DB-backed business logic tests.** Use real DB via `.env`.

Mocking database interactions for code that reads/writes SQL tables creates a **false sense of security** and introduces **severe production risk**:

- Mocks don't catch SQL syntax errors, schema mismatches, or constraint violations
- Mocks hide transaction isolation issues that only manifest under real concurrency
- Mocks mask performance problems that only appear with real data volumes
- Integration tests with real DB catch these issues early, before production

**What may still be mocked:**
- External HTTP services
- Message queues
- File system operations
- Time (use `vi.useFakeTimers()`)

**Non-DB logic** (pure computation) may use unit tests without database.

Any DB mock found in DB-backed tests is a P0 risk and must be treated as a blocker.

### ACL Cleanup Policy (P0 Blocker)

**Canonical system roles are immutable reference data in persistent test DBs.** Deleting or modifying `module_roles` rows for system roles (`SUPER_ADMIN`, `OWNER`, `COMPANY_ADMIN`, `ADMIN`, `ACCOUNTANT`, `CASHIER`) with `company_id=NULL` corrupts the seeded ACL baseline and breaks all subsequent tests.

**P0 Rules:**
- ❌ **BLOCKER**: Any cleanup/deletion by `role_id` alone on `module_roles` — this wipes canonical rows shared across all companies
- ✅ **Required**: ACL cleanup must scope by `company_id` AND `role_id` (e.g., `WHERE company_id = ? AND role_id IN (?)`)
- ✅ **Required**: Integration tests should mutate **custom test roles**, not seeded system roles
- ✅ **Required**: Use exact inserted row IDs when cleanup scope is ambiguous

**Recovery commands for corrupted ACL:**
```bash
npm run db:migrate -w @jurnapod/db
npm run db:seed -w @jurnapod/db
npm run db:seed:test-accounts -w @jurnapod/db
```

For project-wide conventions, see root `AGENTS.md`.
