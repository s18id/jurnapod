# Story 42.4: Login Reuse Across Test Suites

**Status:** done

## Story

As a **CI reliability engineer**,
I want **each test file to call login at most once per user**,
So that **repeated authentication overhead is eliminated across the full test suite**.

## Context

Multiple test files were calling `loginForTest()` or `getTestAccessToken()` inside individual `it()` blocks. Additionally, some files created login-capable test users without setting a deterministic password, causing `401 INVALID_CREDENTIALS` when those users tried to log in.

---

## Acceptance Criteria

**AC1: No per-test login in settings page suites**
**Given** one of the 6 settings page test files
**When** any `it()` block executes
**Then** no `loginForTest()` or `getTestAccessToken()` call is made inside the `it()`

**AC2: No per-test getSeedSyncContext in companies/outlets suites**
**Given** one of the 11 companies/outlets test files
**When** any `it()` block executes
**Then** no `getSeedSyncContext()` call is made inside the `it()`

**AC3: Shared user creation with deterministic password**
**Given** a test file that creates a login-capable user
**When** the user is created
**Then** `password` is set to `process.env.JP_OWNER_PASSWORD` so `loginForTest()` succeeds

**AC4: Precondition guard in import/apply flaky test**
**Given** `import/apply.test.ts` runs in parallel with other tests
**When** the "updates existing items" test executes
**Then** it verifies the precondition (item exists) before attempting the update operation

**AC5: resetFixtureRegistry in afterAll**
**Given** any migrated test file
**When** `afterAll()` runs
**Then** `resetFixtureRegistry()` is called to clean up fixtures

---

## Bulk Migration AC Rule

Every target file must be explicitly verified.

### Bulk Migration Targets

**Settings pages (6 files):**

| # | File | Status |
|---|------|--------|
| 1 | `settings/pages-publish.test.ts` | Migrated |
| 2 | `settings/pages-unpublish.test.ts` | Migrated |
| 3 | `settings/pages-update.test.ts` | Migrated |
| 4 | `settings/pages-list.test.ts` | Migrated |
| 5 | `settings/public-pages.test.ts` | Migrated |
| 6 | `settings/pages-create.test.ts` | Migrated |

**Companies/Outlets (11 files):**

| # | File | Status |
|---|------|--------|
| 7 | `companies/create.test.ts` | Migrated |
| 8 | `companies/list.test.ts` | Migrated |
| 9 | `companies/get-by-id.test.ts` | Migrated |
| 10 | `companies/update.test.ts` | Migrated |
| 11 | `outlets/create.test.ts` | Migrated |
| 12 | `outlets/list.test.ts` | Migrated |
| 13 | `outlets/get-by-id.test.ts` | Migrated |
| 14 | `outlets/delete.test.ts` | Migrated |
| 15 | `outlets/update.test.ts` | Migrated |
| 16 | `outlets/access.test.ts` | Migrated |
| 17 | `outlets/tenant-scope.test.ts` | Migrated |

**AC verification:** All 17 rows show "Migrated" — partial completion is not acceptance.

---

## Test Coverage Criteria

- [x] Happy paths:
  - [x] All 17 migrated files pass
  - [x] Token reused across all tests in each file
- [x] Error paths:
  - [x] `import/apply.test.ts` passes consistently in full suite (no more parallel collision)

---

## Test Fixtures

- [x] `resetFixtureRegistry()` — used in all migrated files' `afterAll()`
- [x] `loginForTest()` — used for shared user login in settings page suites
- [x] `getSeedSyncContext()` — called once in `beforeAll()` of migrated files

---

## Tasks / Subtasks

- [x] Migrate 6 settings page test files to shared `beforeAll` user/role/token setup
- [x] Migrate 11 companies/outlets test files to suite-level token
- [x] Add deterministic password to shared test users in settings page suites
- [x] Add precondition guard in `import/apply.test.ts` "updates existing items" test
- [x] Verify all 17 files pass
- [x] Update coordination file with completed work

---

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| 17 files listed above | Modify | Suite-level token setup, remove per-test login |

---

## Estimated Effort

2 hours

## Risk Level

Low

## Dev Notes

**Why use `JP_OWNER_PASSWORD` for test user passwords?**
`JP_OWNER_PASSWORD` is the seeded owner password in the test database. Setting it on all login-capable test users ensures `loginForTest()` can authenticate using the deterministic credentials.

**`resetFixtureRegistry()` vs `cleanupTestFixtures()`:**
`resetFixtureRegistry()` resets the fixture registry without deleting records — appropriate for `afterAll()` cleanup where tests succeeded. `cleanupTestFixtures()` is used when you want to delete created records.

**Coordination file:**
Tracked in `_bmad-output/implementation-artifacts/coordination/parallel-dev-login-optimization.md`

---

## Validation Evidence

- `npm test -w @jurnapod/api` — all 17 files pass
- Grep audit confirms no per-test login calls in migrated files
- `import/apply.test.ts` passes consistently in isolation and full suite

---

## Dependencies

Story 42.1 (loginForTest caching infrastructure)

---

## Shared Contract Changes

N/A

---

## Technical Debt Review

- [x] No shortcuts taken that require follow-up
- [x] No `TODO`/`FIXME` comments left in production code
- [x] No `as any` casts added
- [x] No deprecated functions used
- [x] All 17 files explicitly verified
