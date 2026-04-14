# Epic 42: Test Infrastructure Hardening & Performance

**Status:** done
**Theme:** Test Infrastructure / CI Reliability
**Started:** 2026-04-14
**Completed:** 2026-04-14

## Context

The integration test suite had accumulated several reliability and performance issues:

1. **Repeated login calls** — each test file made multiple `/api/auth/login` calls per suite, adding ~500ms-2000ms per call
2. **Repeated sync context resolution** — `getSeedSyncContext()` was called inside individual `it()` blocks, creating async overhead even though it was internally cached
3. **Overly permissive status assertions** — `500` appeared as an acceptable status in assertions, masking real API errors
4. **No stale token recovery** — when deterministic test user passwords diverged from seeded state, tests failed with 401 with no recovery path
5. **Transaction retry gaps** — `withTransactionRetry()` did not handle `ER_CHECKREAD` (errno 1020), causing CI-only failures
6. **500 on missing static pages** — `StaticPageNotFoundError` not handled in settings pages publish/unpublish routes, returning 500 instead of 404
7. **POS offline bugs** — `discount_total: NaN` and `PrematureCommitError` in POS sync/recovery code

## Goals

1. Eliminate repeated per-test login and sync-context calls across 132 integration test files
2. Tighten test assertions to catch real API errors instead of masking them with `500` allowances
3. Add stale token and password recovery in test fixtures
4. Extend DB transaction retry coverage for CI reliability
5. Fix POS offline assertion and transaction bugs
6. Handle missing resource errors correctly (404 instead of 500)

## Stories

| Story | Title | Status | Est | Actual |
|-------|-------|--------|-----|--------|
| [42.1](./story-42.1.md) | Token & Seed Context Caching Infrastructure | done | 2h | 1h |
| [42.2](./story-42.2.md) | DB Transaction Safety & Error Handling | done | 1h | 1h |
| [42.3](./story-42.3.md) | Test Assertion Quality | done | 1h | 1h |
| [42.4](./story-42.4.md) | Login Reuse Across Test Suites | done | 2h | 2h |
| [42.5](./story-42.5.md) | BeforeAll seedCtx Caching Rollout | done | 2h | 2h |
| [42.6](./story-42.6.md) | Validation & Final Verification | done | 30m | 30m |

## Success Criteria

- [x] 132 integration test files pass (930 tests, 3 skipped)
- [x] `npm run lint -w @jurnapod/api` — 0 errors
- [x] `npm run typecheck -w @jurnapod/api` — clean
- [x] No integration test file allows `500` as an acceptable success status
- [x] Token cache prevents re-login for same user within a test run
- [x] `getSeedSyncContext()` called at most once per test file (in `beforeAll`)
- [x] `withTransactionRetry()` handles `ER_CHECKREAD` (errno 1020)
- [x] `StaticPageNotFoundError` → 404 in settings pages publish/unpublish
- [x] POS `reconcileSaleTotals` returns numeric discount_total (not NaN)
- [x] POS `getTransactionState` handles null sort dates without crashing

## Dependencies

None — all work was self-contained within the API package and POS package.

## Risks

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Token cache eviction gaps | Medium | Low | `isTokenStillValid()` probe evicts stale tokens on 401 |
| seedSyncContextCache not cleared between files | Low | Low | `getSeedSyncContext()` internally re-queries if DB state changes |
| PrematureCommitError regression | Medium | Low | Pattern of moving queries outside Dexie transactions is documented |

## Notes

### Commits

```
39fab99 test(api): cache seedSyncContext in beforeAll to eliminate async overhead
eb8802a docs: update AI agent planning artifacts and AGENTS.md
83939f5 test(api): remove repeated logins and tighten status expectations
```

### Test Suite Results (after all stories)

```
Test Files  132 passed (132)
Tests       930 passed | 3 skipped (933)
Duration    ~65s
Lint        0 errors | 151 warnings (pre-existing any types)
```

### Files Modified (total)

- `apps/api/src/lib/test-fixtures.ts` — token cache, seed context cache, stale password recovery
- `packages/db/src/kysely/transaction.ts` — ER_CHECKREAD retry
- `packages/db/__test__/unit/transaction.test.ts` — new unit tests
- `apps/api/src/routes/settings-pages.ts` — StaticPageNotFoundError → 404
- `apps/pos/src/offline/sales.ts` — NaN guard on discount_total
- `apps/pos/src/services/recovery-service.ts` — null-safe sort
- 30 integration test files — tightened assertions, login reuse, seedCtx caching

## Retrospective

See: [Epic 42 Retrospective](./epic-42.retrospective.md)
