# Kysely Mock Audit: `item-image-adapter.test.ts`

**Audited file:** `apps/api/__test__/unit/uploader/item-image-adapter.test.ts`
**Date:** 2026-04-09
**Policy reference:** AGENTS.md — "NO MOCK DB for DB-backed business logic tests" (P0 risk)
**Status:** ✅ MIGRATED — File moved to `__test__/integration/uploader/`

---

## Summary

All tests in this file mock Kysely query internals. The adapter under test (`item-image-adapter.ts`) is a **pure DB-backed orchestration layer** — it has no pure logic to unit-test; every function calls `getDb()` and chains Kysely queries or transactions.

**Verdict:** This entire file is misclassified as a unit test and must be migrated to `__test__/integration/`.

---

## Findings

### Mock 1: `createMockDb()` (lines 64–99)

**Purpose:** Full-featured mock covering all Kysely internals used by the adapters.

**Mocked internals:**
- `selectFrom`, `select`, `where` — line 85–89
- `insertInto`, `values`, `returning` — line 75–78
- `updateTable`, `set`, `execute` — line 71–74
- `deleteFrom` — line 92
- `executeTakeFirst`, `executeTakeFirstOrThrow` — line 78–79
- `transaction().execute()` — line 66–84 (with inner `selectFrom`, `updateTable`, etc.)
- `fn.max` — line 80

**Used in:**
| Test | What it tests | Lines |
|------|--------------|-------|
| `stores files with item_image entity type` | Storage key generation, file store | 145–163 |
| `uses provided sortOrder when given` | sortOrder override | 165–183 |
| `returns result with id, urls, metadata` | Result structure | 185–208 |
| `on DB failure cleans up stored files` | Error cleanup path | 210–230 |
| `executes without throwing when image exists` (delete) | Happy-path delete | 238–246 |
| `returns early if image not found` (delete) | Not-found guard | 248–264 |
| `executes without throwing when image exists` (update) | Happy-path update | 272–279 |
| `returns early if image not found` (update) | Not-found guard | 281–296 |
| `executes without throwing when image exists` (setPrimary) | Happy-path setPrimary | 303–311 |
| `returns early if image not found` (setPrimary) | Not-found guard | 313–328 |

**Assessment:** ALL of these exercise real DB queries. Cannot be unit-tested.

---

### Mock 2: Inline `dbNotFound` overrides (lines 249–254, 282–287, 314–319)

**Pattern:** Override `selectFrom` + `select` + `where` + `executeTakeFirst` to return `null` (simulating "not found").

**Assessment:** These test the not-found guard path, but the guard itself is the DB lookup. Mocking the DB lookup means the test doesn't verify that the query correctly scopes by `company_id` or that `executeTakeFirst()` returns `null` when no row exists. This is DB-backed logic — requires real DB.

---

## Test-by-Test Classification

| Test | What it actually tests | Correct location |
|------|----------------------|-----------------|
| `stores files with item_image entity type` | File storage key format + `uploadFile()` call path | Cannot unit-test; requires real storage + DB |
| `uses provided sortOrder when given` | sortOrder passed through to DB insert | `__test__/integration/` |
| `returns result with id, urls, metadata` | Return shape of adapter | `__test__/integration/` |
| `on DB failure cleans up stored files` | Cleanup-on-failure path | `__test__/integration/` |
| `executes without throwing when image exists` (delete) | DB delete + file delete orchestration | `__test__/integration/` |
| `returns early if image not found` (delete) | Not-found early-return logic | `__test__/integration/` |
| `executes without throwing when image exists` (update) | DB update + isPrimary transaction | `__test__/integration/` |
| `returns early if image not found` (update) | Not-found early-return logic | `__test__/integration/` |
| `executes without throwing when image exists` (setPrimary) | Two-query update pattern | `__test__/integration/` |
| `returns early if image not found` (setPrimary) | Not-found early-return logic | `__test__/integration/` |

---

## What Could Be Unit-Tested (if extracted)

The only genuinely pure helper in `item-image-adapter.ts` is:

```typescript
function extractFileKeysFromUrls(urls: string[]): string[]
```

This function strips a base URL prefix to derive storage keys. It has no DB calls, no side effects.

**Current status:** It is NOT tested separately. The test file only exercises it indirectly through the mocked adapter.

**Recommendation:** Extract `extractFileKeysFromUrls` to a utils file and write a true unit test for it.

---

## Migration Completed

**Action:** Migrated `apps/api/__test__/unit/uploader/item-image-adapter.test.ts` → `apps/api/__test__/integration/uploader/item-image-adapter.test.ts`

**Changes made:**
1. Created `__test__/integration/uploader/` directory
2. Created new integration test file with real DB via fixtures
3. Removed all Kysely mocks (`createMockDb()`, `dbNotFound` overrides)
4. Replaced mocks with real DB using `createTestCompany`, `createTestItem`, `createTestUser` fixtures
5. Kept `MockStorageProvider` — this is a valid test double for the injected `StorageProvider` interface (not a DB internal)
6. Removed `vi.doMock('../../../src/lib/db.js', ...)` calls
7. Added proper `beforeAll`/`afterAll` with `resetFixtureRegistry()` and `closeTestDb()`
8. Deleted the original unit test file
9. Added real DB assertions (e.g., verifying `sort_order` was actually written to DB)

**Storage mocking is acceptable** — `StorageProvider` is an injected abstraction, not a DB internal. The `MockStorageProvider` class is a valid test double that was kept.

### Tests migrated (10 tests):

| Test | What it now verifies |
|------|---------------------|
| `stores files with item_image entity type` | Storage key format via real storage mock |
| `uses provided sortOrder when given` | sortOrder written to DB (real assertion) |
| `returns result with id, urls, metadata` | Return shape via real DB insert |
| `on DB failure cleans up stored files` | Cleanup path with invalid company_id |
| `deletes image and removes files from storage` | DB delete + file cleanup (real DB) |
| `returns early if image not found` (delete) | Early-return guard (real DB lookup) |
| `rejects delete from different company` | company_id scoping enforcement |
| `updates sort_order` | Real DB update verification |
| `sets is_primary flag and unsets existing primary` | Real DB transaction behavior |
| `returns early if image not found` (update) | Early-return guard (real DB lookup) |
| `sets image as primary for item` | Real DB two-query update |
| `returns early if image not found` (setPrimary) | Early-return guard |
| `rejects image from different item` | item_id scoping enforcement |

### Remaining work (not migrated — pure helpers could be unit tested):
- `extractFileKeysFromUrls` (pure function, no DB calls) — could be unit tested if extracted to a utils module

---

## Risk Assessment

| Severity | Issue |
|----------|-------|
| **P0** | All 10 tests mock Kysely internals — violates AGENTS.md DB testing policy |
| **P1** | No test verifies actual DB write correctness (insert values, update scoping, delete behavior) |
| **P1** | Not-found guards not tested against real DB queries — query correctness assumed |
| **P2** | `uploadFile()` internal logic (storage key generation) is indirectly tested via storage mock — acceptable but fragile |

---

## Recommendation

1. **Immediately:** Migrate the full test file to `__test__/integration/`
2. **Separately:** Extract and unit-test `extractFileKeysFromUrls` as a pure function
3. **Do not** revert this classification — the adapters are fundamentally DB-backed
