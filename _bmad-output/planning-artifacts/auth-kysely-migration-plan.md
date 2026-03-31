# Migration Plan: @jurnapod/auth — Raw SQL to Kysely

**Document Version:** 1.0  
**Created:** 2026-03-30  
**Target Package:** `@jurnapod/auth`  
**Migration Goal:** Replace raw SQL strings with Kysely query builder (NO `sql` tag usage)

---

## 1. Executive Summary

### Objective
Migrate `packages/auth` from raw SQL string queries to Kysely query builder while maintaining the existing `AuthDbAdapter` interface for consumers.

### Key Constraint
**NO `sql` tag usage** — pure query builder API only. The `sql` template tag provides an escape hatch for complex cases, but the goal is type-safe, maintainable query builder code.

### Scope
- **Files Affected:** 6 core modules with SQL queries
- **Total Tasks:** 27 narrowly-scoped tasks
- **Estimated Effort:** ~30 hours (6-7 tasks per day × 2 hours each = 5 days)

### Migration Approach
1. **Adapter pattern preserved** — `AuthDbAdapter` interface unchanged; only internal query implementation migrates
2. **Test isolation** — Mock adapter updated to support Kysely-style queries
3. **Incremental migration** — One module at a time, starting with foundation

### Key Design Decisions (Pre-approved)

| Decision | Approach | Rationale |
|----------|----------|-----------|
| **Permission masks** | Fetch `module_roles` rows to JS, check bits in code | Simpler than porting bitwise checks to query builder |
| **checkAccess()** | Split into 5-6 simple queries | One complex query with dynamic EXISTS subqueries is harder to port; simpler queries are more maintainable |
| **GROUP_CONCAT** | Aggregate in JavaScript | MySQL-specific function; porting to Kysely requires raw SQL anyway |
| **Login throttle upsert** | Transaction with `SELECT ... FOR UPDATE` → `INSERT/UPDATE` | MySQL `INSERT ... ON DUPLICATE KEY UPDATE` not easily expressed in query builder; explicit locking is clearer |
| **No caching (initial)** | Direct queries each call | Can add `Map`-based caching layer in follow-up iteration |

---

## 2. Current State Analysis

### Adapter Interface (types.ts)

```typescript
export interface AuthDbAdapter {
  queryAll<T>(sql: string, params: unknown[]): Promise<T[]>;
  execute(sql: string, params: unknown[]): Promise<{ insertId?: number | bigint; affectedRows?: number }>;
  transaction<T>(fn: (adapter: AuthDbAdapter) => Promise<T>): Promise<T>;
}
```

### Modules Requiring Migration

| Module | File | SQL Queries | Complexity |
|--------|------|-------------|------------|
| **RBAC** | `src/rbac/access-check.ts` | 8 queries | HIGH — complex EXISTS, JOINs, GROUP_CONCAT |
| **Throttle** | `src/throttle/login-throttle.ts` | 3 queries | MEDIUM — upsert pattern |
| **Email Tokens** | `src/email/tokens.ts` | 5 queries | LOW — simple CRUD |
| **Refresh Tokens** | `src/tokens/refresh-tokens.ts` | 4 queries | MEDIUM — transaction + FOR UPDATE |
| **OAuth** | `src/oauth/google.ts` | 2 queries | LOW — simple SELECT |
| **Audit** | `src/lib/client.ts` | 1 query | LOW — simple INSERT |

### Schema Dependencies (from @jurnapod/db)

```typescript
// Key tables used by auth package:
Users, Companies, Roles, UserRoleAssignments, ModuleRoles,
Outlets, AuthRefreshTokens, AuthLoginThrottles, EmailTokens,
AuthOauthAccounts, AuditLogs
```

---

## 3. Task Breakdown

### Category A: Foundation (Tasks 1-5)

---

### AUTH-KYS-001: Add Kysely Dependencies
**Duration:** 15 minutes  
**Dependencies:** None  
**Priority:** P0 (Blocker)

**Scope:** Add Kysely and type dependencies to `packages/auth`

**Current State:**
- `package.json` has no Kysely dependency
- Only `@jurnapod/db` as workspace devDependency

**Target State:**
- `kysely` added to dependencies
- Type imports available from Kysely

**Acceptance Criteria:**
- [ ] `kysely` version `^0.28.2` added to `dependencies` in `packages/auth/package.json`
- [ ] `npm install` completes without errors
- [ ] `Kysely` and `MysqlDialect` can be imported from `kysely`
- [ ] Build succeeds: `npm run build -w @jurnapod/auth`

**Files to Modify:**
- `packages/auth/package.json`

**Implementation Notes:**
- Use exact version `^0.28.2` to match `@jurnapod/db`
- Do NOT add `mysql2` — adapter provides the connection

---

### AUTH-KYS-002: Create Kysely Adapter Wrapper
**Duration:** 1 hour  
**Dependencies:** AUTH-KYS-001  
**Priority:** P0 (Blocker)

**Scope:** Create internal Kysely wrapper compatible with existing adapter interface

**Current State:**
- `AuthDbAdapter` uses raw SQL strings
- Mock adapter parses SQL strings for testing

**Target State:**
- Internal `KyselyAdapter` class wraps Kysely for production use
- Mock adapter updated to handle query builder style

**Acceptance Criteria:**
- [ ] New file `src/lib/kysely-adapter.ts` created
- [ ] Exports `KyselyAdapter` class implementing `AuthDbAdapter`
- [ ] All query methods use Kysely query builder (no `sql` tag)
- [ ] `execute()` uses Kysely's `execute()` for inserts/updates/deletes
- [ ] TypeScript compiles without errors
- [ ] Unit tests pass with mock adapter

**Files to Create:**
- `packages/auth/src/lib/kysely-adapter.ts`

**Files to Modify:**
- `packages/auth/src/lib/client.ts` (update audit logging to use Kysely)

**Implementation Notes:**
```typescript
// Pattern for queryAll (SELECT)
async queryAll<T>(sql: string, params: unknown[]): Promise<T[]> {
  const [query, bindings] = parseRawSql(sql, params);
  return await this.db
    .selectFrom(query.tables)
    .where(...buildWhereClause(query.where, bindings))
    .select(query.columns.length ? query.columns : [sql.fragmentAll()])
    .execute();
}

// Pattern for execute (INSERT/UPDATE/DELETE)
async execute(sql: string, params: unknown[]): Promise<{ insertId?: number; affectedRows?: number }> {
  // Use Kysely's insertInto/updateTable/deleteFrom
}
```

---

### AUTH-KYS-003: Add Database Schema Types
**Duration:** 30 minutes  
**Dependencies:** AUTH-KYS-001  
**Priority:** P1

**Scope:** Import or re-export DB schema types for auth tables

**Current State:**
- Types defined inline in each module

**Target State:**
- Centralized type imports from `@jurnapod/db/kysely`

**Acceptance Criteria:**
- [ ] New file `src/lib/db-types.ts` created
- [ ] Re-exports `DB` type from `@jurnapod/db/kysely`
- [ ] All auth tables typed: `Users`, `Companies`, `Roles`, `UserRoleAssignments`, `ModuleRoles`, `Outlets`, `AuthRefreshTokens`, `AuthLoginThrottles`, `EmailTokens`, `AuthOauthAccounts`, `AuditLogs`
- [ ] TypeScript compiles without errors

**Files to Create:**
- `packages/auth/src/lib/db-types.ts`

**Files to Modify:**
- `packages/auth/tsconfig.json` (if needed for path resolution)

**Implementation Notes:**
- Re-export from `@jurnapod/db/kysely` which already has all schema types
- Auth package uses same database schema

---

### AUTH-KYS-004: Update Mock Adapter for Query Builder
**Duration:** 1 hour  
**Dependencies:** AUTH-KYS-002  
**Priority:** P1

**Scope:** Ensure mock adapter works with migrated code

**Current State:**
- Mock adapter parses raw SQL strings
- Limited WHERE clause parsing

**Target State:**
- Mock adapter handles Kysely-style queries
- All existing tests continue to pass

**Acceptance Criteria:**
- [ ] `MockAdapter` interface unchanged (still implements `AuthDbAdapter`)
- [ ] Mock `queryAll()` returns correct mock data
- [ ] Mock `execute()` tracks mock data mutations
- [ ] Mock `transaction()` wraps operations correctly
- [ ] All existing unit tests pass

**Files to Modify:**
- `packages/auth/src/test-utils/mock-adapter.ts`

**Implementation Notes:**
- The mock adapter should store mock data and return it directly
- Kysely adapter is for production; mock adapter is for tests
- No changes needed to mock data structure

---

### AUTH-KYS-005: Create SQL Parsing Utility
**Duration:** 45 minutes  
**Dependencies:** AUTH-KYS-002  
**Priority:** P2

**Scope:** Helper to parse raw SQL for backward compatibility layer

**Current State:**
- No SQL parsing utility

**Target State:**
- `src/lib/sql-parser.ts` utility for extracting table/column info
- Used only during transition period

**Acceptance Criteria:**
- [ ] `parseTableName(sql: string): string` extracts table name
- [ ] `parseWhereClause(sql: string, params: unknown[]): WhereCondition[]` extracts conditions
- [ ] `parseColumns(sql: string): string[]` extracts column list
- [ ] Unit tests cover parsing logic

**Files to Create:**
- `packages/auth/src/lib/sql-parser.ts`

**Files to Modify:**
- `packages/auth/src/lib/kysely-adapter.ts` (use parser internally)

**Implementation Notes:**
- This is a transitional utility only
- Will be deprecated once all queries use Kysely directly
- Keep logic simple — supports only what auth package needs

---

## Category B: Simple Modules (Tasks 6-10)

---

### AUTH-KYS-006: Migrate OAuth findUser() to Kysely
**Duration:** 30 minutes  
**Dependencies:** AUTH-KYS-001, AUTH-KYS-003  
**Priority:** P2

**Scope:** `src/oauth/google.ts` — `findUser()` method

**Current State:**
```typescript
const rows = await this.adapter.queryAll<{...}>(
  `SELECT u.id, u.company_id, u.email, u.is_active
   FROM users u
   INNER JOIN companies c ON c.id = u.company_id
   WHERE c.code = ? AND u.email = ?
   LIMIT 1`,
  [companyCode, normalizedEmail]
);
```

**Target State:**
```typescript
const row = await this.db
  .selectFrom('users as u')
  .innerJoin('companies as c', 'c.id', 'u.company_id')
  .where('c.code', '=', companyCode)
  .where('u.email', '=', normalizedEmail)
  .where('u.is_active', '=', 1)
  .select(['u.id', 'u.company_id', 'u.email'])
  .executeTakeFirst();
```

**Acceptance Criteria:**
- [ ] Query uses Kysely query builder (no `sql` tag)
- [ ] Returns same type: `{ userId: number; companyId: number; email: string } | null`
- [ ] Unit test passes
- [ ] TypeScript compiles without errors

**Files to Modify:**
- `packages/auth/src/oauth/google.ts`

**Key Implementation Notes:**
- `executeTakeFirst()` returns `undefined` when no rows (convert to `null`)
- Use aliased table names: `'users as u'` for compatibility

---

### AUTH-KYS-007: Migrate OAuth linkAccount() to Kysely
**Duration:** 30 minutes  
**Dependencies:** AUTH-KYS-006  
**Priority:** P2

**Scope:** `src/oauth/google.ts` — `linkAccount()` method

**Current State:**
```typescript
// Check for existing link
const existingRows = await this.adapter.queryAll<{...}>(
  `SELECT id, user_id FROM auth_oauth_accounts
   WHERE company_id = ? AND provider = ? AND provider_user_id = ?
   LIMIT 1`,
  [params.companyId, GOOGLE_PROVIDER, params.providerUserId]
);

// Create new link
await this.adapter.execute(
  `INSERT INTO auth_oauth_accounts (...) VALUES (...)`,
  [...]
);
```

**Target State:**
```typescript
// Check for existing link
const existing = await this.db
  .selectFrom('auth_oauth_accounts')
  .where('company_id', '=', params.companyId)
  .where('provider', '=', GOOGLE_PROVIDER)
  .where('provider_user_id', '=', params.providerUserId)
  .select(['id', 'user_id'])
  .executeTakeFirst();

// Create new link
await this.db
  .insertInto('auth_oauth_accounts')
  .values({
    company_id: params.companyId,
    user_id: params.userId,
    provider: GOOGLE_PROVIDER,
    provider_user_id: params.providerUserId,
    email_snapshot: normalizedEmail
  })
  .execute();
```

**Acceptance Criteria:**
- [ ] SELECT query uses Kysely query builder
- [ ] INSERT uses `insertInto().values()`
- [ ] Returns correct union type
- [ ] Unit test passes

**Files to Modify:**
- `packages/auth/src/oauth/google.ts`

---

### AUTH-KYS-008: Migrate Audit Logging to Kysely
**Duration:** 30 minutes  
**Dependencies:** AUTH-KYS-002, AUTH-KYS-003  
**Priority:** P1

**Scope:** `src/lib/client.ts` — `audit.recordLogin()`

**Current State:**
```typescript
await adapter.execute(
  `INSERT INTO audit_logs (
    company_id, user_id, action, result, ip_address, user_agent, metadata
  ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  [record.companyId, record.userId, 'LOGIN', record.result, ...]
);
```

**Target State:**
```typescript
await this.db
  .insertInto('audit_logs')
  .values({
    company_id: record.companyId,
    user_id: record.userId,
    action: 'LOGIN',
    result: record.result,
    ip_address: record.ipAddress,
    user_agent: record.userAgent,
    metadata_json: JSON.stringify({
      company_code: record.companyCode,
      email: record.email,
      reason: record.reason,
    })
  })
  .execute();
```

**Acceptance Criteria:**
- [ ] Uses `insertInto().values().execute()`
- [ ] All columns mapped correctly
- [ ] TypeScript compiles without errors
- [ ] Integration test passes

**Files to Modify:**
- `packages/auth/src/lib/client.ts`

**Key Implementation Notes:**
- Note: schema uses `metadata_json` column (verify from schema.ts)

---

### AUTH-KYS-009: Migrate Email Token validate() to Kysely
**Duration:** 30 minutes  
**Dependencies:** AUTH-KYS-003  
**Priority:** P2

**Scope:** `src/email/tokens.ts` — `validate()` method

**Current State:**
```typescript
const rows = await this.adapter.queryAll<EmailTokenRow>(
  `SELECT user_id, company_id, email, used_at, expires_at
   FROM email_tokens
   WHERE token_hash = ? AND type = ?
   LIMIT 1`,
  [tokenHash, type]
);
```

**Target State:**
```typescript
const row = await this.db
  .selectFrom('email_tokens')
  .where('token_hash', '=', tokenHash)
  .where('type', '=', type)
  .select(['user_id', 'company_id', 'email', 'used_at', 'expires_at'])
  .executeTakeFirst();
```

**Acceptance Criteria:**
- [ ] Uses `selectFrom().where().select().executeTakeFirst()`
- [ ] Error handling matches current behavior
- [ ] Unit test passes

**Files to Modify:**
- `packages/auth/src/email/tokens.ts`

---

### AUTH-KYS-010: Migrate Email Token getInfo() to Kysely
**Duration:** 30 minutes  
**Dependencies:** AUTH-KYS-009  
**Priority:** P2

**Scope:** `src/email/tokens.ts` — `getInfo()` method

**Current State:**
```typescript
const rows = await this.adapter.queryAll<EmailTokenRowWithoutUsed>(
  `SELECT user_id, company_id, email, expires_at
   FROM email_tokens
   WHERE token_hash = ? AND type = ?
   LIMIT 1`,
  [tokenHash, type]
);
```

**Target State:**
```typescript
const row = await this.db
  .selectFrom('email_tokens')
  .where('token_hash', '=', tokenHash)
  .where('type', '=', type)
  .select(['user_id', 'company_id', 'email', 'expires_at'])
  .executeTakeFirst();
```

**Acceptance Criteria:**
- [ ] Uses Kysely query builder
- [ ] Returns same type: `{ userId, companyId, email, expiresAt } | null`
- [ ] Unit test passes

**Files to Modify:**
- `packages/auth/src/email/tokens.ts`

---

## Category C: Token Management (Tasks 11-15)

---

### AUTH-KYS-011: Migrate Refresh Token issue() to Kysely
**Duration:** 30 minutes  
**Dependencies:** AUTH-KYS-003  
**Priority:** P1

**Scope:** `src/tokens/refresh-tokens.ts` — `issue()` method

**Current State:**
```typescript
const result = await this.adapter.execute(
  `INSERT INTO auth_refresh_tokens (
    company_id, user_id, token_hash, expires_at, ip_address, user_agent
  ) VALUES (?, ?, ?, ?, ?, ?)`,
  [context.companyId, context.userId, tokenHash, expiresAt, ipAddress, userAgent]
);
```

**Target State:**
```typescript
const result = await this.db
  .insertInto('auth_refresh_tokens')
  .values({
    company_id: context.companyId,
    user_id: context.userId,
    token_hash: tokenHash,
    expires_at: expiresAt,
    ip_address: ipAddress,
    user_agent: userAgent
  })
  .executeTakeFirst();
```

**Acceptance Criteria:**
- [ ] Uses `insertInto().values().executeTakeFirst()`
- [ ] Returns same shape: `{ token, expiresAt, tokenId }`
- [ ] Unit test passes

**Files to Modify:**
- `packages/auth/src/tokens/refresh-tokens.ts`

---

### AUTH-KYS-012: Migrate Refresh Token revoke() to Kysely
**Duration:** 30 minutes  
**Dependencies:** AUTH-KYS-011  
**Priority:** P1

**Scope:** `src/tokens/refresh-tokens.ts` — `revoke()` method

**Current State:**
```typescript
const result = await this.adapter.execute(
  `UPDATE auth_refresh_tokens
   SET revoked_at = CURRENT_TIMESTAMP
   WHERE token_hash = ? AND revoked_at IS NULL`,
  [tokenHash]
);
return (result.affectedRows ?? 0) > 0;
```

**Target State:**
```typescript
const result = await this.db
  .updateTable('auth_refresh_tokens')
  .set({ revoked_at: new Date() })
  .where('token_hash', '=', tokenHash)
  .where('revoked_at', 'is', null)
  .execute();

return (result.numAffectedRows ?? 0) > 0;
```

**Acceptance Criteria:**
- [ ] Uses `updateTable().set().where().execute()`
- [ ] Returns `boolean` as before
- [ ] Unit test passes

**Files to Modify:**
- `packages/auth/src/tokens/refresh-tokens.ts`

---

### AUTH-KYS-013: Migrate Refresh Token rotate() — SELECT to Kysely
**Duration:** 45 minutes  
**Dependencies:** AUTH-KYS-012  
**Priority:** P1

**Scope:** `src/tokens/refresh-tokens.ts` — `rotate()` method — SELECT FOR UPDATE

**Current State:**
```typescript
const rows = await tx.queryAll<{
  id: number; user_id: number; company_id: number; expires_at: string | Date; revoked_at: string | Date | null;
}>(
  `SELECT id, user_id, company_id, expires_at, revoked_at
   FROM auth_refresh_tokens
   WHERE token_hash = ?
   LIMIT 1
   FOR UPDATE`,
  [tokenHash]
);
```

**Target State:**
```typescript
// Note: Kysely doesn't support FOR UPDATE directly in query builder
// Use sql tag only for FOR UPDATE clause
const row = await this.db
  .selectFrom('auth_refresh_tokens')
  .where('token_hash', '=', tokenHash)
  .select(['id', 'user_id', 'company_id', 'expires_at', 'revoked_at'])
  .$static().forUpdate()  // Extension point if available
  .executeTakeFirst();

// Alternative: Use transaction with explicit FOR UPDATE
const row = await this.db
  .selectFrom('auth_refresh_tokens')
  .where('token_hash', '=', tokenHash)
  .select(['id', 'user_id', 'company_id', 'expires_at', 'revoked_at'])
  .executeTakeFirst();
```

**Acceptance Criteria:**
- [ ] SELECT uses Kysely query builder
- [ ] FOR UPDATE lock behavior preserved
- [ ] Unit test passes with mock

**Files to Modify:**
- `packages/auth/src/tokens/refresh-tokens.ts`

**Key Implementation Notes:**
- Kysely's MySQL dialect does NOT support `FOR UPDATE` in query builder API
- Use `db.$queryRaw` or `sql` tag ONLY for the `FOR UPDATE` clause
- Alternative: Execute as raw within transaction, but minimize raw SQL

---

### AUTH-KYS-014: Migrate Refresh Token rotate() — UPDATE to Kysely
**Duration:** 30 minutes  
**Dependencies:** AUTH-KYS-013  
**Priority:** P1

**Scope:** `src/tokens/refresh-tokens.ts` — `rotate()` method — UPDATE old token

**Current State:**
```typescript
const revokeResult = await tx.execute(
  `UPDATE auth_refresh_tokens
   SET revoked_at = CURRENT_TIMESTAMP
   WHERE id = ? AND revoked_at IS NULL`,
  [current.id]
);
```

**Target State:**
```typescript
const revokeResult = await this.db
  .updateTable('auth_refresh_tokens')
  .set({ revoked_at: new Date() })
  .where('id', '=', current.id)
  .where('revoked_at', 'is', null)
  .execute();
```

**Acceptance Criteria:**
- [ ] Uses `updateTable().set().where()`
- [ ] `affectedRows` check preserved
- [ ] Unit test passes

**Files to Modify:**
- `packages/auth/src/tokens/refresh-tokens.ts`

---

### AUTH-KYS-015: Migrate Refresh Token rotate() — INSERT to Kysely
**Duration:** 30 minutes  
**Dependencies:** AUTH-KYS-014  
**Priority:** P1

**Scope:** `src/tokens/refresh-tokens.ts` — `rotate()` method — INSERT new token

**Current State:**
```typescript
const insertResult = await tx.execute(
  `INSERT INTO auth_refresh_tokens (
    company_id, user_id, token_hash, expires_at, rotated_from_id,
    ip_address, user_agent
  ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  [current.company_id, current.user_id, nextTokenHash, nextExpiresAt, current.id, ipAddress, userAgent]
);
```

**Target State:**
```typescript
const insertResult = await this.db
  .insertInto('auth_refresh_tokens')
  .values({
    company_id: current.company_id,
    user_id: current.user_id,
    token_hash: nextTokenHash,
    expires_at: nextExpiresAt,
    rotated_from_id: current.id,
    ip_address: ipAddress,
    user_agent: userAgent
  })
  .executeTakeFirst();
```

**Acceptance Criteria:**
- [ ] Uses `insertInto().values()`
- [ ] Return value shape matches
- [ ] Unit test passes

**Files to Modify:**
- `packages/auth/src/tokens/refresh-tokens.ts`

---

## Category D: Throttle (Tasks 16-18)

---

### AUTH-KYS-016: Migrate LoginThrottle getDelay() to Kysely
**Duration:** 30 minutes  
**Dependencies:** AUTH-KYS-003  
**Priority:** P2

**Scope:** `src/throttle/login-throttle.ts` — `getDelay()` method

**Current State:**
```typescript
const rows = await this.adapter.queryAll<{ key_hash: string; failure_count: number }>(
  `SELECT key_hash, failure_count
   FROM auth_login_throttles
   WHERE key_hash IN (${placeholders})`,
  keys.map((k) => k.hash)
);
```

**Target State:**
```typescript
const rows = await this.db
  .selectFrom('auth_login_throttles')
  .where('key_hash', 'in', keys.map((k) => k.hash))
  .select(['key_hash', 'failure_count'])
  .execute();
```

**Acceptance Criteria:**
- [ ] Uses `where('column', 'in', array)` for IN clause
- [ ] Same return type: `Map<string, number>`
- [ ] Unit test passes

**Files to Modify:**
- `packages/auth/src/throttle/login-throttle.ts`

---

### AUTH-KYS-017: Migrate LoginThrottle recordFailure() — Upsert Pattern
**Duration:** 1 hour  
**Dependencies:** AUTH-KYS-016  
**Priority:** P1

**Scope:** `src/throttle/login-throttle.ts` — `recordFailure()` method

**Current State:**
```typescript
await this.adapter.execute(
  `INSERT INTO auth_login_throttles (
    key_hash, failure_count, last_failed_at, last_ip, last_user_agent
  ) VALUES ${placeholders}
  ON DUPLICATE KEY UPDATE
    failure_count = failure_count + 1,
    last_failed_at = NOW(),
    last_ip = VALUES(last_ip),
    last_user_agent = VALUES(last_user_agent)`,
  values
);
```

**Target State:**
```typescript
// Use transaction with SELECT FOR UPDATE → INSERT/UPDATE
await this.adapter.transaction(async (tx) => {
  for (const key of keys) {
    // Check if exists
    const existing = await tx
      .selectFrom('auth_login_throttles')
      .where('key_hash', '=', key.hash)
      .select(['id', 'failure_count'])
      .executeTakeFirst();
    
    if (existing) {
      // UPDATE
      await tx
        .updateTable('auth_login_throttles')
        .set({
          failure_count: existing.failure_count + 1,
          last_failed_at: new Date(),
          last_ip: ipAddress,
          last_user_agent: userAgent
        })
        .where('id', '=', existing.id)
        .execute();
    } else {
      // INSERT
      await tx
        .insertInto('auth_login_throttles')
        .values({
          key_hash: key.hash,
          failure_count: 1,
          last_failed_at: new Date(),
          last_ip: ipAddress,
          last_user_agent: userAgent
        })
        .execute();
    }
  }
});
```

**Acceptance Criteria:**
- [ ] Uses transaction pattern (SELECT FOR UPDATE → UPDATE/INSERT)
- [ ] No `ON DUPLICATE KEY UPDATE` (MySQL-specific)
- [ ] All keys processed correctly
- [ ] Unit test passes

**Files to Modify:**
- `packages/auth/src/throttle/login-throttle.ts`

**Key Implementation Notes:**
- MySQL's `INSERT ... ON DUPLICATE KEY UPDATE` is not portable
- Transaction with separate SELECT → UPDATE/INSERT is clearer and more maintainable
- Process keys sequentially within transaction

---

### AUTH-KYS-018: Migrate LoginThrottle recordSuccess() to Kysely
**Duration:** 30 minutes  
**Dependencies:** AUTH-KYS-017  
**Priority:** P2

**Scope:** `src/throttle/login-throttle.ts` — `recordSuccess()` method

**Current State:**
```typescript
await this.adapter.execute(
  `DELETE FROM auth_login_throttles WHERE key_hash IN (${placeholders})`,
  keys.map((k) => k.hash)
);
```

**Target State:**
```typescript
await this.db
  .deleteFrom('auth_login_throttles')
  .where('key_hash', 'in', keys.map((k) => k.hash))
  .execute();
```

**Acceptance Criteria:**
- [ ] Uses `deleteFrom().where().execute()`
- [ ] `in` operator for multiple keys
- [ ] Unit test passes

**Files to Modify:**
- `packages/auth/src/throttle/login-throttle.ts`

---

## Category E: RBAC (Tasks 19-25)

---

### AUTH-KYS-019: Create RBAC Query Helper Functions
**Duration:** 1 hour  
**Dependencies:** AUTH-KYS-003  
**Priority:** P1

**Scope:** Create helper functions for common RBAC queries

**Current State:**
- Complex inline SQL with EXISTS subqueries

**Target State:**
- Helper functions for each query pattern
- `src/rbac/query-helpers.ts` file

**Acceptance Criteria:**
- [ ] `queryUserBasicInfo(db, userId, companyId)` — SELECT users + companies join
- [ ] `queryGlobalRoles(db, userId)` — SELECT user_role_assignments + roles join
- [ ] `queryOutletRoles(db, userId, companyId)` — SELECT with GROUP_CONCAT (JS aggregation)
- [ ] `queryModulePermissions(db, userId, companyId)` — SELECT module_roles
- [ ] `querySuperAdminStatus(db, userId)` — SELECT for SUPER_ADMIN check
- [ ] Unit tests for each helper

**Files to Create:**
- `packages/auth/src/rbac/query-helpers.ts`

**Files to Modify:**
- `packages/auth/src/rbac/access-check.ts`

**Key Implementation Notes:**
```typescript
// Example helper structure
export async function queryUserBasicInfo(
  db: Kysely<DB>,
  userId: number,
  companyId: number
): Promise<{ id: number; company_id: number; email: string; company_timezone: string | null } | null> {
  return db
    .selectFrom('users as u')
    .innerJoin('companies as c', 'c.id', 'u.company_id')
    .where('u.id', '=', userId)
    .where('u.company_id', '=', companyId)
    .where('u.is_active', '=', 1)
    .where('c.deleted_at', 'is', null)
    .select(['u.id', 'u.company_id', 'u.email', 'c.timezone as company_timezone'])
    .executeTakeFirst() ?? null;
}
```

---

### AUTH-KYS-020: Migrate RBAC getUserForTokenVerification() to Kysely
**Duration:** 30 minutes  
**Dependencies:** AUTH-KYS-019  
**Priority:** P2

**Scope:** `src/rbac/access-check.ts` — `getUserForTokenVerification()`

**Current State:**
```typescript
const rows = await this.adapter.queryAll<{
  id: number; company_id: number; email: string;
}>(
  `SELECT u.id, u.company_id, u.email
   FROM users u
   INNER JOIN companies c ON c.id = u.company_id
   WHERE u.id = ? AND u.company_id = ? AND u.is_active = 1 AND c.deleted_at IS NULL
   LIMIT 1`,
  [userId, companyId]
);
```

**Target State:**
```typescript
const row = await queryUserBasicInfo(this.db, userId, companyId);
if (!row) return null;
return { id: row.id, company_id: row.company_id, email: row.email };
```

**Acceptance Criteria:**
- [ ] Uses helper function from AUTH-KYS-019
- [ ] Returns same type: `AccessTokenUser | null`
- [ ] Unit test passes

**Files to Modify:**
- `packages/auth/src/rbac/access-check.ts`

---

### AUTH-KYS-021: Migrate RBAC getUserWithRoles() — User + Global Roles
**Duration:** 45 minutes  
**Dependencies:** AUTH-KYS-019, AUTH-KYS-020  
**Priority:** P1

**Scope:** `src/rbac/access-check.ts` — `getUserWithRoles()` — Part 1: user + global roles

**Current State:**
```typescript
// User basic info query
const userRows = await this.adapter.queryAll<{...}>(
  `SELECT u.id, u.company_id, u.email, c.timezone AS company_timezone
   FROM users u INNER JOIN companies c ON c.id = u.company_id
   WHERE u.id = ? AND u.company_id = ? AND u.is_active = 1 AND c.deleted_at IS NULL
   LIMIT 1`,
  [userId, companyId]
);

// Global roles
const globalRoleRows = await this.adapter.queryAll<{ code: string }>(
  `SELECT r.code FROM user_role_assignments ura
   INNER JOIN roles r ON r.id = ura.role_id
   WHERE ura.user_id = ? AND ura.outlet_id IS NULL AND r.is_global = 1`,
  [userId]
);
```

**Target State:**
```typescript
const user = await queryUserBasicInfo(this.db, userId, companyId);
if (!user) return null;

const globalRoleRows = await this.db
  .selectFrom('user_role_assignments as ura')
  .innerJoin('roles as r', 'r.id', 'ura.role_id')
  .where('ura.user_id', '=', userId)
  .where('ura.outlet_id', 'is', null)
  .where('r.is_global', '=', 1)
  .select(['r.code'])
  .execute();
```

**Acceptance Criteria:**
- [ ] User query uses helper
- [ ] Global roles query uses Kysely
- [ ] Returns same type: `AuthenticatedUser | null`
- [ ] Unit test passes

**Files to Modify:**
- `packages/auth/src/rbac/access-check.ts`

---

### AUTH-KYS-022: Migrate RBAC getUserWithRoles() — Outlet Roles + GROUP_CONCAT
**Duration:** 45 minutes  
**Dependencies:** AUTH-KYS-021  
**Priority:** P1

**Scope:** `src/rbac/access-check.ts` — `getUserWithRoles()` — Part 2: outlet roles (GROUP_CONCAT in JS)

**Current State:**
```typescript
const outletRoleRows = await this.adapter.queryAll<{
  outlet_id: number; outlet_code: string; outlet_name: string; role_codes: string;
}>(
  `SELECT o.id AS outlet_id, o.code AS outlet_code, o.name AS outlet_name,
          GROUP_CONCAT(DISTINCT r.code ORDER BY r.code SEPARATOR ',') AS role_codes
   FROM user_role_assignments ura
   INNER JOIN outlets o ON o.id = ura.outlet_id
   INNER JOIN roles r ON r.id = ura.role_id
   WHERE ura.user_id = ? AND o.company_id = ? AND ura.outlet_id IS NOT NULL
   GROUP BY o.id, o.code, o.name`,
  [userId, companyId]
);
```

**Target State:**
```typescript
// Step 1: Get outlet assignments (without GROUP_CONCAT)
const outletRoleRows = await this.db
  .selectFrom('user_role_assignments as ura')
  .innerJoin('outlets as o', 'o.id', 'ura.outlet_id')
  .innerJoin('roles as r', 'r.id', 'ura.role_id')
  .where('ura.user_id', '=', userId)
  .where('o.company_id', '=', companyId)
  .where('ura.outlet_id', 'is not', null)
  .select(['o.id as outlet_id', 'o.code as outlet_code', 'o.name as outlet_name', 'r.code as role_code'])
  .execute();

// Step 2: Aggregate in JavaScript (replaces GROUP_CONCAT)
const outletMap = new Map<number, { outlet_id: number; outlet_code: string; outlet_name: string; role_codes: Set<string> }>();
for (const row of outletRoleRows) {
  if (!outletMap.has(row.outlet_id)) {
    outletMap.set(row.outlet_id, {
      outlet_id: row.outlet_id,
      outlet_code: row.outlet_code,
      outlet_name: row.outlet_name,
      role_codes: new Set()
    });
  }
  outletMap.get(row.outlet_id)!.role_codes.add(row.role_code);
}

const outlet_role_assignments = Array.from(outletMap.values()).map(o => ({
  outlet_id: o.outlet_id,
  outlet_code: o.outlet_code,
  outlet_name: o.outlet_name,
  role_codes: Array.from(o.role_codes) as RoleCode[]
}));
```

**Acceptance Criteria:**
- [ ] No GROUP_CONCAT in SQL
- [ ] Aggregation happens in JavaScript
- [ ] Same output structure
- [ ] Unit test passes

**Files to Modify:**
- `packages/auth/src/rbac/access-check.ts`

**Key Implementation Notes:**
- GROUP_CONCAT is MySQL-specific; Kysely doesn't support it
- Fetch all rows and aggregate in JS using Map + Set
- Order by handled by Set (or sort post-aggregation if order matters)

---

### AUTH-KYS-023: Migrate RBAC hasOutletAccess() to Kysely
**Duration:** 30 minutes  
**Dependencies:** AUTH-KYS-019  
**Priority:** P2

**Scope:** `src/rbac/access-check.ts` — `hasOutletAccess()`

**Current State:**
```typescript
const rows = await this.adapter.queryAll<{ count: number }>(
  `SELECT COUNT(*) AS count
   FROM users u
   INNER JOIN companies c ON c.id = u.company_id
   LEFT JOIN user_role_assignments ura ON ura.user_id = u.id
   LEFT JOIN roles r ON r.id = ura.role_id
   LEFT JOIN outlets o ON o.id = ura.outlet_id
   WHERE u.id = ? AND u.company_id = ? AND u.is_active = 1 AND c.deleted_at IS NULL
     AND (
       r.code = "SUPER_ADMIN"
       OR (r.is_global = 1 AND ura.outlet_id IS NULL)
       OR (ura.outlet_id = ? AND o.company_id = ?)
     )`,
  [userId, companyId, outletId, companyId]
);
```

**Target State:**
```typescript
// Check SUPER_ADMIN first (fast path)
const superAdmin = await this.db
  .selectFrom('user_role_assignments as ura')
  .innerJoin('roles as r', 'r.id', 'ura.role_id')
  .where('ura.user_id', '=', userId)
  .where('r.code', '=', 'SUPER_ADMIN')
  .where('ura.outlet_id', 'is', null)
  .executeTakeFirst();

if (superAdmin) return true;

// Check global role
const hasGlobal = await this.db
  .selectFrom('user_role_assignments as ura')
  .innerJoin('roles as r', 'r.id', 'ura.role_id')
  .where('ura.user_id', '=', userId)
  .where('r.is_global', '=', 1)
  .where('ura.outlet_id', 'is', null)
  .executeTakeFirst();

if (hasGlobal) return true;

// Check outlet-specific role
const hasOutlet = await this.db
  .selectFrom('user_role_assignments as ura')
  .innerJoin('outlets as o', 'o.id', 'ura.outlet_id')
  .where('ura.user_id', '=', userId)
  .where('ura.outlet_id', '=', outletId)
  .where('o.company_id', '=', companyId)
  .executeTakeFirst();

return Boolean(hasOutlet);
```

**Acceptance Criteria:**
- [ ] Three separate queries instead of complex OR
- [ ] Returns `boolean`
- [ ] Fast path for SUPER_ADMIN
- [ ] Unit test passes

**Files to Modify:**
- `packages/auth/src/rbac/access-check.ts`

**Key Implementation Notes:**
- Complex OR conditions are hard to express in query builder
- Split into three sequential checks with early returns
- Order by likelihood for performance (SUPER_ADMIN most common for admins)

---

### AUTH-KYS-024: Migrate RBAC listUserOutletIds() to Kysely
**Duration:** 30 minutes  
**Dependencies:** AUTH-KYS-019  
**Priority:** P2

**Scope:** `src/rbac/access-check.ts` — `listUserOutletIds()`

**Current State:**
```typescript
const rows = await this.adapter.queryAll<{ outlet_id: number }>(
  `SELECT DISTINCT ura.outlet_id
   FROM user_role_assignments ura
   INNER JOIN outlets o ON o.id = ura.outlet_id
   WHERE ura.user_id = ? AND o.company_id = ? AND ura.outlet_id IS NOT NULL`,
  [userId, companyId]
);
return rows.map((r) => r.outlet_id);
```

**Target State:**
```typescript
const rows = await this.db
  .selectFrom('user_role_assignments as ura')
  .innerJoin('outlets as o', 'o.id', 'ura.outlet_id')
  .where('ura.user_id', '=', userId)
  .where('o.company_id', '=', companyId)
  .where('ura.outlet_id', 'is not', null)
  .distinct()
  .select(['ura.outlet_id'])
  .execute();

return rows.map((r) => r.outlet_id);
```

**Acceptance Criteria:**
- [ ] Uses Kysely `distinct()` and `selectFrom().innerJoin().where()`
- [ ] Returns `number[]`
- [ ] Unit test passes

**Files to Modify:**
- `packages/auth/src/rbac/access-check.ts`

---

### AUTH-KYS-025: Migrate RBAC canManageCompanyDefaults() to Kysely
**Duration:** 45 minutes  
**Dependencies:** AUTH-KYS-019  
**Priority:** P1

**Scope:** `src/rbac/access-check.ts` — `canManageCompanyDefaults()`

**Current State:**
```typescript
// SUPER_ADMIN bypass
const superAdminRows = await this.adapter.queryAll<{ count: number }>(
  `SELECT COUNT(*) AS count FROM user_role_assignments ura
   INNER JOIN roles r ON r.id = ura.role_id
   WHERE ura.user_id = ? AND r.code = "SUPER_ADMIN" AND ura.outlet_id IS NULL`,
  [userId]
);
if (superAdminRows.length > 0 && superAdminRows[0].count > 0) return true;

// No permission required
if (!permission) {
  const rows = await this.adapter.queryAll<{ count: number }>(
    `SELECT COUNT(*) AS count FROM user_role_assignments ura
     INNER JOIN roles r ON r.id = ura.role_id
     INNER JOIN module_roles mr ON mr.role_id = r.id
     WHERE ura.user_id = ? AND mr.company_id = ?
       AND r.is_global = 1 AND ura.outlet_id IS NULL AND mr.module = ?`,
    [userId, companyId, module]
  );
  return rows.length > 0 && rows[0].count > 0;
}

// Permission bit check
const permissionBit = MODULE_PERMISSION_BITS[permission];
const rows = await this.adapter.queryAll<{ count: number }>(
  `SELECT COUNT(*) AS count FROM user_role_assignments ura
   INNER JOIN roles r ON r.id = ura.role_id
   INNER JOIN module_roles mr ON mr.role_id = r.id
   WHERE ura.user_id = ? AND mr.company_id = ?
     AND r.is_global = 1 AND ura.outlet_id IS NULL
     AND mr.module = ? AND (mr.permission_mask & ?) <> 0`,
  [userId, companyId, module, permissionBit]
);
return rows.length > 0 && rows[0].count > 0;
```

**Target State:**
```typescript
// Check SUPER_ADMIN bypass
const superAdmin = await this.db
  .selectFrom('user_role_assignments as ura')
  .innerJoin('roles as r', 'r.id', 'ura.role_id')
  .where('ura.user_id', '=', userId)
  .where('r.code', '=', 'SUPER_ADMIN')
  .where('ura.outlet_id', 'is', null)
  .executeTakeFirst();

if (superAdmin) return true;

// Fetch module_roles rows to JS for permission mask checking
const moduleRoles = await this.db
  .selectFrom('user_role_assignments as ura')
  .innerJoin('roles as r', 'r.id', 'ura.role_id')
  .innerJoin('module_roles as mr', 'mr.role_id', 'r.id')
  .where('ura.user_id', '=', userId)
  .where('mr.company_id', '=', companyId)
  .where('r.is_global', '=', 1)
  .where('ura.outlet_id', 'is', null)
  .where('mr.module', '=', module)
  .select(['mr.permission_mask'])
  .execute();

// Check in JS
if (moduleRoles.length === 0) return false;

if (!permission) return true; // Any role with module access

const requiredBit = MODULE_PERMISSION_BITS[permission];
return moduleRoles.some(mr => (mr.permission_mask & requiredBit) !== 0);
```

**Acceptance Criteria:**
- [ ] SUPER_ADMIN bypass query uses Kysely
- [ ] module_roles fetched to JS (permission mask check in code)
- [ ] Returns `boolean`
- [ ] Unit test passes

**Files to Modify:**
- `packages/auth/src/rbac/access-check.ts`

**Key Implementation Notes:**
- Fetch all `module_roles` rows for the user/module
- Check permission bits in JavaScript (not SQL)
- Simpler and more maintainable than SQL bitwise operations

---

## Category F: Tests (Tasks 26-27)

---

### AUTH-KYS-026: Run Full Test Suite After Migration
**Duration:** 1 hour  
**Dependencies:** AUTH-KYS-001 through AUTH-KYS-025  
**Priority:** P0

**Scope:** Validate all auth package tests pass

**Current State:**
- 765 unit tests in api package
- Auth package has its own unit tests

**Target State:**
- All auth package tests pass
- No regressions

**Acceptance Criteria:**
- [ ] `npm run test -w @jurnapod/auth` passes
- [ ] `npm run typecheck -w @jurnapod/auth` passes
- [ ] `npm run build -w @jurnapod/auth` passes
- [ ] Integration tests pass: `npm run test:db -w @jurnapod/auth`

**Files to Modify:**
- None (validation only)

**Key Implementation Notes:**
- Run tests in order: unit first, then integration
- Integration tests require database connection
- Check for any type errors from Kysely usage

---

### AUTH-KYS-027: Final Review and Cleanup
**Duration:** 1 hour  
**Dependencies:** AUTH-KYS-026  
**Priority:** P1

**Scope:** Final review of migrated code

**Current State:**
- Code migrated to Kysely

**Target State:**
- Clean, documented code
- No raw SQL remaining (except where necessary)

**Acceptance Criteria:**
- [ ] No `adapter.queryAll()` or `adapter.execute()` calls in migrated files
- [ ] All migrated methods have JSDoc comments
- [ ] `sql-parser.ts` deprecated or removed
- [ ] TypeScript strict mode passes
- [ ] Code review approved

**Files to Review:**
- `packages/auth/src/lib/kysely-adapter.ts`
- `packages/auth/src/rbac/access-check.ts`
- `packages/auth/src/rbac/query-helpers.ts`
- `packages/auth/src/throttle/login-throttle.ts`
- `packages/auth/src/email/tokens.ts`
- `packages/auth/src/tokens/refresh-tokens.ts`
- `packages/auth/src/oauth/google.ts`
- `packages/auth/src/lib/client.ts`

---

## 4. Implementation Order

### Phase 1: Foundation (Week 1, Days 1-2)

| Day | Tasks | Parallel |
|-----|-------|----------|
| 1 AM | AUTH-KYS-001: Dependencies | AUTH-KYS-003: DB Types |
| 1 PM | AUTH-KYS-002: Kysely Adapter | AUTH-KYS-005: SQL Parser |
| 2 AM | AUTH-KYS-004: Mock Adapter | - |
| 2 PM | AUTH-KYS-006: OAuth findUser | AUTH-KYS-007: OAuth linkAccount |

### Phase 2: Simple Modules (Week 1, Days 3-4)

| Day | Tasks | Parallel |
|-----|-------|----------|
| 3 AM | AUTH-KYS-008: Audit Logging | AUTH-KYS-009: Email validate |
| 3 PM | AUTH-KYS-010: Email getInfo | - |
| 4 AM | AUTH-KYS-011: Refresh issue | AUTH-KYS-012: Refresh revoke |
| 4 PM | AUTH-KYS-013: Refresh rotate SELECT | AUTH-KYS-014: Refresh rotate UPDATE |

### Phase 3: Complex Modules (Week 2, Days 1-3)

| Day | Tasks | Parallel |
|-----|-------|----------|
| 1 AM | AUTH-KYS-015: Refresh rotate INSERT | AUTH-KYS-019: RBAC Helpers |
| 1 PM | AUTH-KYS-016: Throttle getDelay | - |
| 2 AM | AUTH-KYS-017: Throttle recordFailure | AUTH-KYS-018: Throttle recordSuccess |
| 2 PM | AUTH-KYS-020: RBAC token verification | AUTH-KYS-021: RBAC getUserWithRoles user |
| 3 AM | AUTH-KYS-022: RBAC getUserWithRoles outlets | AUTH-KYS-023: RBAC hasOutletAccess |
| 3 PM | AUTH-KYS-024: RBAC listUserOutletIds | AUTH-KYS-025: RBAC canManageCompanyDefaults |

### Phase 4: Validation (Week 2, Day 4)

| Day | Tasks |
|-----|-------|
| 4 AM | AUTH-KYS-026: Run full test suite |
| 4 PM | AUTH-KYS-027: Final review and cleanup |

### Parallel Execution Groups

```
Group A (Can run in parallel):
  - AUTH-KYS-001, AUTH-KYS-003, AUTH-KYS-005

Group B (Depends on Group A):
  - AUTH-KYS-002, AUTH-KYS-004

Group C (Depends on Group B):
  - AUTH-KYS-006, AUTH-KYS-007, AUTH-KYS-008, AUTH-KYS-009, AUTH-KYS-010

Group D (Depends on Group C):
  - AUTH-KYS-011, AUTH-KYS-012, AUTH-KYS-013, AUTH-KYS-014, AUTH-KYS-015

Group E (Depends on Group D):
  - AUTH-KYS-016, AUTH-KYS-017, AUTH-KYS-018

Group F (Depends on Group C):
  - AUTH-KYS-019, AUTH-KYS-020, AUTH-KYS-021, AUTH-KYS-022, AUTH-KYS-023, AUTH-KYS-024, AUTH-KYS-025

Group G (Final):
  - AUTH-KYS-026, AUTH-KYS-027
```

---

## 5. Validation Checklist

### Build Verification

```bash
# Type check
npm run typecheck -w @jurnapod/auth

# Expected output: No TypeScript errors

# Build
npm run build -w @jurnapod/auth

# Expected output: dist/ directory with compiled JS and d.ts files

# Lint
npm run lint -w @jurnapod/auth

# Expected output: No lint errors (or only pre-existing warnings)
```

### Unit Test Verification

```bash
# Run all unit tests
npm run test:unit -w @jurnapod/auth

# Expected output:
# Test Files:  X tests passed
# Tests:       XXX passed
# Duration:    Xs
```

### Integration Test Verification

```bash
# Requires database connection
npm run test:db -w @jurnapod/auth

# Expected output:
# Test Files:  X tests passed
# Tests:       XX passed
# Duration:    Xs
```

### Specific Module Verification

```bash
# OAuth module
npm run test:single -w @jurnapod/auth src/oauth/google.test.ts

# Email module
npm run test:single -w @jurnapod/auth src/email/tokens.test.ts

# Refresh tokens
npm run test:single -w @jurnapod/auth src/tokens/refresh-tokens.test.ts

# Throttle
npm run test:single -w @jurnapod/auth src/throttle/login-throttle.test.ts

# RBAC
npm run test:single -w @jurnapod/auth src/rbac/access-check.test.ts
```

---

## 6. Risk Mitigation

### Risk 1: Complex RBAC Queries
**Issue:** The `checkAccess()` method has complex EXISTS subqueries with dynamic conditions that don't map cleanly to query builder.  
**Mitigation:** Split into multiple simple queries (AUTH-KYS-025). Fetch permission data to JS and check bits in code. Accept slight performance reduction for maintainability.  
**Fallback:** If performance is critical, use `sql` tag only for the complex EXISTS subqueries.

### Risk 2: FOR UPDATE Locking
**Issue:** Kysely doesn't support `FOR UPDATE` in query builder API.  
**Mitigation:** Use `sql` tag for `FOR UPDATE` clause only, or implement explicit transaction with separate SELECT.  
**Decision:** Use minimal raw SQL (only FOR UPDATE) rather than over-engineering.

### Risk 3: GROUP_CONCAT Portability
**Issue:** MySQL's GROUP_CONCAT has no direct Kysely equivalent.  
**Mitigation:** Fetch rows to JavaScript and aggregate using Map + Set.  
**Performance Note:** Acceptable for typical role counts (5-20 outlets per user).

### Risk 4: Mock Adapter Limitations
**Issue:** Mock adapter may not perfectly simulate Kysely query behavior.  
**Mitigation:** Focus on testing logic in JavaScript, not SQL generation. Mock adapter returns test data directly.  
**Validation:** Integration tests with real database provide final verification.

### Risk 5: ON DUPLICATE KEY UPDATE
**Issue:** MySQL-specific upsert pattern not supported in query builder.  
**Mitigation:** Use transaction with SELECT → UPDATE/INSERT pattern.  
**Trade-off:** More round trips but clearer semantics and portable.

### Risk 6: Bitwise Permission Checks
**Issue:** SQL bitwise operations (`&`) for permission checks are MySQL-specific.  
**Mitigation:** Fetch `module_roles` rows to JavaScript, perform bitwise checks in code.  
**Benefit:** Simpler, testable, portable.

---

## 7. Post-Migration Considerations

### Future Optimizations (Not in Scope)
1. **Caching layer**: Add `Map`-based caching for frequently-accessed role/permission data
2. **Batch queries**: Combine multiple RBAC checks into single database round-trip
3. **Prepared statements**: Pre-compile common queries for better performance

### Maintenance Notes
1. When schema changes, regenerate types from `@jurnapod/db`
2. If new tables added to auth package, update `db-types.ts` re-exports
3. Test adapter interface compatibility before upgrading Kysely version

### Document Revision History
| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-03-30 | Initial migration plan |
