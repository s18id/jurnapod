# Story 42.1: Token & Seed Context Caching Infrastructure

**Status:** done

## Story

As a **CI/test engineer**,
I want **test fixtures to cache tokens and sync contexts**,
So that **repeated authentication calls are eliminated and tests run faster**.

## Context

Every integration test file called `getTestAccessToken()` and `getSeedSyncContext()` repeatedly — once per `it()` block. Each `/api/auth/login` adds ~500ms-2000ms of latency. With 132 test files, this accumulated into significant CI slowness. Additionally, stale tokens had no recovery path — tests would fail with 401 if a user's password diverged from the seeded state.

## API Contract Verification

N/A — this story modifies test infrastructure only, not API endpoints.

---

## Acceptance Criteria

**AC1: Token caching prevents re-login**
**Given** `loginForTest()` has been called once for a `(baseUrl, companyCode, email)` tuple
**When** `loginForTest()` is called again with the same tuple
**Then** the cached token is returned without making an HTTP request

**AC2: In-flight login deduplication**
**Given** multiple concurrent calls to `loginForTest()` with the same tuple
**When** the calls are made before the first login resolves
**Then** only one HTTP request is made; all callers receive the same token

**AC3: Stale token eviction on 401**
**Given** a cached token that is no longer valid on the server
**When** `loginForTest()` checks the cache
**Then** the token is evicted after a `GET /api/users/me` probe returns 401

**AC4: Network error does not evict valid token**
**Given** a cached token that is valid
**When** `GET /api/users/me` probe fails due to network error
**Then** the token is kept in cache (graceful fallback)

**AC5: Seed context caching**
**Given** `getSeedSyncContext()` has been called once
**When** it is called again within the same file
**Then** the cached context is returned without a DB query

**AC6: Stale password recovery**
**Given** a test user exists but has a stale password hash
**When** `getOrCreateTestCashierForPermission()` receives a 401 from login
**Then** `resetUserPasswordForTests()` is called and login is retried once

---

## Test Coverage Criteria

- [x] Happy paths:
  - [x] `loginForTest()` called twice — second call returns cached token
  - [x] `getSeedSyncContext()` called multiple times — only first call hits DB
  - [x] Concurrent `loginForTest()` calls — only one HTTP request made
- [x] Error paths:
  - [x] 401 response from `/api/users/me` — token evicted, fresh token issued
  - [x] Network error from probe — token kept, no eviction loop

---

## Test Fixtures

N/A — this story IS the fixture infrastructure story. All 132 integration test files are consumers.

---

## Tasks / Subtasks

- [x] Add `tokenCache` Map to `test-fixtures.ts`
- [x] Add `tokenInFlight` Map for in-flight deduplication
- [x] Implement `isTokenStillValid()` probe via `GET /api/users/me`
- [x] Update `loginForTest()` to use cache + probe + in-flight dedupe
- [x] Add `seedSyncContextCache` + `seedSyncContextInFlight` Maps
- [x] Update `getSeedSyncContext()` to use cache
- [x] Implement `resetUserPasswordForTests()`
- [x] Update `getOrCreateTestCashierForPermission()` to reset password on 401

---

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `apps/api/src/lib/test-fixtures.ts` | Modify | Add token cache, seed context cache, stale password recovery |

---

## Estimated Effort

1 hour

## Risk Level

Low

## Dev Notes

**Why network error → keep token (not evict)?**
Returning `true` on network error means a stale token is kept until the real API call surfaces the 401. This avoids eviction loops on transient network issues. The real API call will fail the test assertion anyway if the token is truly invalid.

**seedSyncContextCache keyed by `companyCode:outletCode`**
The sync context is stable reference data tied to the seeded test company. Cache eviction is not needed since the seeded data doesn't change between test files.

---

## Validation Evidence

- Existing tests pass with new caching layer — no behavioral change
- Manual: call `loginForTest()` twice for same user — second call returns cached token
- Manual: call `loginForTest()` with invalid token — returns fresh token after probe detects 401

---

## Dependencies

None

---

## Shared Contract Changes

N/A

---

## Technical Debt Review

- [x] No shortcuts taken that require follow-up
- [x] No `TODO`/`FIXME` comments left in production code
- [x] No `as any` casts added
- [x] No deprecated functions used
- [x] No in-memory state that won't survive restarts (cache is intentional, in-process only)
- [x] Integration tests included in this story
