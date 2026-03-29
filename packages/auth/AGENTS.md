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
  query<T>(sql: string, params: unknown[]): Promise<T[]>;
  execute(sql: string, params: unknown[]): Promise<{ insertId?: number | bigint; affectedRows?: number }>;
  transaction<T>(fn: (adapter: AuthDbAdapter) => Promise<T>): Promise<T>;
}
```

**Extended adapter with connection** (for atomic email token consumption):
```typescript
export interface AuthDbAdapterWithConnection extends AuthDbAdapter {
  getConnection(): Promise<AuthDbConnection>;
}

export interface AuthDbConnection {
  query<T>(sql: string, params: unknown[]): Promise<T[]>;
  execute(sql: string, params: unknown[]): Promise<{ insertId?: number | bigint; affectedRows?: number }>;
  beginTransaction(): Promise<void>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
  release(): Promise<void>;
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
| `src/rbac/` | `RBACManager`, `checkRole`, `buildPermissionMask` | Role and permission checks with outlet scoping |
| `src/throttle/` | `LoginThrottle` | Rate limiting with exponential backoff (primary + IP) |
| `src/email/` | `EmailTokenManager` | Password reset, invite, verify tokens with atomic consumption |
| `src/oauth/` | `GoogleOAuthProvider` | Google OAuth 2.0 integration |
| `src/lib/` | `createAuthClient` | Auth client factory assembling all managers |
| `src/errors.ts` | `AuthError` subclasses | Typed error hierarchy |

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

2. **Always use parameterized queries** — never string concatenation:
   ```typescript
   // CORRECT
   await adapter.query('SELECT * FROM users WHERE id = ?', [userId]);
   
   // WRONG
   await adapter.query(`SELECT * FROM users WHERE id = ${userId}`);
   ```

3. **Always use transactions** for multi-step operations:
   ```typescript
   await adapter.transaction(async (tx) => {
     // Step 1: revoke old token
     await tx.execute('UPDATE auth_refresh_tokens SET revoked_at = NOW() WHERE id = ?', [oldId]);
     // Step 2: issue new token
     const result = await tx.execute('INSERT INTO auth_refresh_tokens ...', [...]);
     return result;
   });
   ```

4. **Use `FOR UPDATE` locks** when rotating tokens to prevent race conditions

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

### Mock Adapter Pattern

Always test with a mock adapter — never hit a real database:

```typescript
import { createAuthClient, InvalidCredentialsError } from '@jurnapod/auth';
import { createMockAdapter } from './test-utils.js';

describe('RBACManager', () => {
  it('should return null for non-existent user', async () => {
    const adapter = createMockAdapter({ users: [] });
    const auth = createAuthClient(adapter, config);
    
    const result = await auth.rbac.checkAccess({
      userId: 999,
      companyId: 1
    });
    
    expect(result).toBeNull();
  });
});
```

### Test File Naming

- Unit tests: `src/**/*.test.ts` (co-located with source)
- Integration tests: `src/**/*.integration.test.ts`

### Testing Boundaries

- **Unit test file location**: Co-locate with source (`src/rbac/access-check.test.ts`)
- **Mock data**: Keep minimal — only data needed for the test
- **Coverage target**: Auth-critical paths (token rotation, password verification, RBAC checks)

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
- [ ] All SQL uses parameterized queries
- [ ] Token rotation uses transactions with proper locking
- [ ] Password verification uses library functions (bcrypt/Argon2)
- [ ] No secrets or tokens in log statements
- [ ] OAuth redirect URIs validated against allowlist
- [ ] Unit tests use mock adapters (not real DB)
- [ ] Tests cover happy path AND error/revoked/expired cases
- [ ] New features exported from `index.ts` submodule entry points

---

## Related Packages

- `@jurnapod/db` — Provides database connection; consumer of this package
- `@jurnapod/api` — Uses this package for auth operations
- `@jurnapod/shared` — Shared contracts and Zod schemas

For project-wide conventions, see root `AGENTS.md`.
