# @jurnapod/auth

Standalone, framework-agnostic authentication library for Jurnapod ERP.

## Overview

This package extracts authentication logic from `apps/api/src/lib/` into a reusable library using the **Adapter Pattern** to decouple from database implementations while maintaining full compatibility with existing SQL queries and business rules.

## Features

- **JWT Access Tokens** — Sign/verify using `jose` (HS256)
- **Refresh Token Lifecycle** — Generation, rotation, revocation with cookie support
- **Password Hashing** — `bcrypt` and Argon2id support with automatic rehashing
- **RBAC** — Role-based access control with bitmask permissions and outlet-level scoping
- **Login Throttling** — Exponential backoff for failed attempts (primary + IP-based)
- **Email Tokens** — Password reset, invite, email verification with atomic consumption
- **OAuth** — Google OAuth 2.0 integration with account linking
- **Audit Logging** — Login attempt recording to `audit_logs` table

## Usage

```typescript
import { createAuthClient } from '@jurnapod/auth';
import type { AuthDbAdapter, AuthConfig } from '@jurnapod/auth';

// Implement your database adapter (Kysely-based)
const adapter: AuthDbAdapter = {
  db: kyselyInstance,  // Kysely instance for query building
  transaction: async (fn) => { /* ... */ },
};

// Provide configuration (all secrets passed explicitly)
const config: AuthConfig = {
  tokens: {
    accessTokenSecret: "your-secret",
    accessTokenTtlSeconds: 900,
    refreshTokenSecret: "your-secret",
    refreshTokenTtlSeconds: 604800,
    refreshCookieCrossSite: true,
  },
  password: {
    defaultAlgorithm: "argon2id",
    bcryptRounds: 12,
    argon2MemoryKb: 65536,
    argon2TimeCost: 3,
    argon2Parallelism: 4,
    rehashOnLogin: true,
  },
  throttle: {
    baseDelayMs: 1000,
    maxDelayMs: 60000,
  },
  oauth: {
    google: {
      clientId: "...",
      clientSecret: "...",
      redirectUris: ["https://app.example.com/auth/callback"],
    },
  },
  emailTokens: {
    passwordResetTtlMinutes: 60,
    inviteTtlMinutes: 10080,
    verifyEmailTtlMinutes: 43200,
  },
};

const auth = createAuthClient(adapter, config);
```

## Submodule Exports

| Import Path | Exports | Purpose |
|-------------|---------|---------|
| `@jurnapod/auth` | `createAuthClient`, `AuthClient`, core types, errors | Main entry point |
| `@jurnapod/auth/tokens` | `AccessTokenManager`, `RefreshTokenManager`, `REFRESH_TOKEN_COOKIE_NAME` | JWT sign/verify, refresh token lifecycle |
| `@jurnapod/auth/passwords` | `PasswordHasher`, `validatePasswordPolicy`, `isPasswordStrongEnough`, `DEFAULT_PASSWORD_POLICY` | bcrypt/Argon2 hashing, password policy |
| `@jurnapod/auth/rbac` | `RBACManager`, `checkRole`, `ROLE_CODES`, `buildPermissionMask`, `hasPermissionBit`, `MODULE_PERMISSION_BITS` | Role and permission management |
| `@jurnapod/auth/oauth` | `GoogleOAuthProvider`, `OAuthConfig`, `OAuthTokenResult`, `OAuthUserLookup` | Google OAuth 2.0 integration |
| `@jurnapod/auth/throttle` | `LoginThrottle`, `LoginThrottleKey`, `LoginAuditRecord` | Login rate limiting |
| `@jurnapod/auth/email` | `EmailTokenManager`, `EmailTokenType` | Email token lifecycle |

## AuthClient Interface

The `AuthClient` returned by `createAuthClient()` provides:

| Namespace | Methods |
|-----------|---------|
| `auth.tokens` | `signAccessToken`, `verifyAccessToken`, `issueRefreshToken`, `rotateRefreshToken`, `revokeRefreshToken`, `createRefreshTokenCookie`, `createRefreshTokenClearCookie` |
| `auth.passwords` | `hash`, `verify`, `needsRehash` |
| `auth.rbac` | `getUserWithRoles`, `getUserForTokenVerification`, `hasOutletAccess`, `checkAccess`, `listUserOutletIds`, `canManageCompanyDefaults`, `buildPermissionMask` |
| `auth.throttle` | `buildKeys`, `getDelay`, `recordFailure`, `recordSuccess` |
| `auth.emailTokens` | `create`, `validate`, `validateAndConsume`, `invalidate`, `getInfo` |
| `auth.oauth?.google` | `assertRedirectUriAllowed`, `exchangeCode`, `verifyIdToken`, `findUser`, `linkAccount` (if configured) |
| `auth.audit` | `recordLogin` |

## Error Classes

| Class | Thrown When |
|-------|-------------|
| `InvalidCredentialsError` | Wrong email/password |
| `UserInactiveError` | User account is inactive |
| `TokenExpiredError` | JWT or refresh token expired |
| `TokenInvalidError` | JWT or refresh token malformed |
| `TokenRevokedError` | Refresh token has been revoked |
| `ThrottledError` | Login attempts exceeded (includes `delayMs`) |
| `EmailTokenNotFoundError` | Email token not found |
| `EmailTokenExpiredError` | Email token expired |
| `EmailTokenUsedError` | Email token already consumed |
| `EmailTokenInvalidError` | Email token validation failed |
| `OAuthConfigError` | OAuth configuration error |
| `OAuthExchangeError` | OAuth code exchange failed |
| `OAuthVerificationError` | OAuth ID token verification failed |
| `OAuthAccountLinkedError` | Google account already linked to another user |

## Architecture

See [`docs/tech-specs/auth-package.md`](../../docs/tech-specs/auth-package.md) for full technical specification.

## Role Codes

```typescript
const ROLE_CODES = [
  "SUPER_ADMIN",
  "OWNER",
  "COMPANY_ADMIN",
  "ADMIN",
  "CASHIER",
  "ACCOUNTANT",
] as const;
```

## Permission Bitmask

| Permission | Bit Value |
|------------|-----------|
| `create` | 1 |
| `read` | 2 |
| `update` | 4 |
| `delete` | 8 |
| `report` | 16 |

## RBAC — `checkAccess()` and SUPER_ADMIN Bypass

`RBACManager.checkAccess()` is the central authorization routine. It evaluates:

- User existence (`users` + `companies` join)
- SUPER_ADMIN global detection
- Role membership (global + outlet-scoped)
- Module permission bitmask
- Outlet access

### SUPER_ADMIN Platform-Wide Bypass

SUPER_ADMIN is handled specially inside `checkAccess()`:

```typescript
// 1. Checked FIRST — global lookup (no company_id filter)
// SUPER_ADMIN role is platform-wide, not scoped to any company
const isSuperAdmin = await this.isSuperAdminUser(userId);

// 2. User existence — SUPER_ADMIN bypasses company deleted_at check
// (can access even if their home company is soft-deleted)
if (!isSuperAdmin) {
  userQuery = userQuery.where('c.deleted_at', 'is', null);
}

// 3. Module permission — SUPER_ADMIN skips entire bitmask lookup
if (isSuperAdmin) {
  hasPermission = true;  // bypasses module_roles query
}
```

**SUPER_ADMIN always returns `hasPermission = true`** for any module/permission check, regardless of `module_roles` entries.

For the `hasOutletAccess()` and `canManageCompanyDefaults()` helpers, the same global `isSuperAdminUser()` lookup is used — SUPER_ADMIN gets outlet access and company management capabilities without company_id scoping.

## Database Adapter

Consumers must implement `AuthDbAdapter` using Kysely:

```typescript
interface AuthDbAdapter {
  db: Kysely<DB>;  // Kysely instance for type-safe query building
  transaction<T>(fn: (trx: AuthDbAdapter) => Promise<T>): Promise<T>;
}
```

Example implementation:

```typescript
import { createKysely } from '@jurnapod/db';
import type { AuthDbAdapter } from '@jurnapod/auth';

const adapter: AuthDbAdapter = {
  db: createKysely({ host, port, user, password, database }),
  async transaction(fn) {
    return await this.db.transaction().execute(fn);
  }
};
```

**All modules use Kysely query builder exclusively:**
```typescript
// SELECT
const user = await adapter.db.selectFrom('users').where('id', '=', userId).executeTakeFirst();

// INSERT
await adapter.db.insertInto('auth_refresh_tokens').values({...}).execute();

// UPDATE
await adapter.db.updateTable('users').set({name: 'new'}).where('id', '=', id).execute();

// DELETE
await adapter.db.deleteFrom('users').where('id', '=', id).execute();

// FOR UPDATE lock (in transaction)
const token = await trx.db.selectFrom('auth_refresh_tokens')
  .where('token_hash', '=', hash)
  .forUpdate()
  .executeTakeFirst();
```

## Security Notes

- Access token TTL: 15 minutes (default)
- Refresh tokens are hashed (SHA-256) before storage
- Refresh token rotation revokes old token atomically
- Password rehashing occurs on login if algorithm changed
- OAuth redirect URIs validated against allowlist
- Login throttling uses both email+company and IP-based keys
