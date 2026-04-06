# Epic 34: Test Reorganization & Assessment

## Overview

**Epic:** Epic 34: Test Reorganization & Assessment  
**Duration:** 1 sprint (~40h)  
**Goal:** Reorganize tests into `__test__/unit|integration` structure, assess and deduplicate overlapping tests, ensuring API has minimal true unit tests.

---

## Context

### Current State

The project has accumulated tests across multiple patterns with no standard structure:

| Location | Test Files | Pattern |
|----------|-----------|---------|
| `apps/api/src/routes/` | 26 | Co-located `.test.ts` |
| `apps/api/src/lib/` | ~50 | Co-located `.test.ts` |
| `apps/api/tests/integration/` | 42 | `.integration.test.mjs` |
| `packages/auth` | 7 | Mixed `src/` + `integration/` |
| `packages/modules/*` | ~8 | Mixed `src/`, `tests/`, `__tests__/` |
| `packages/notifications` | 3 | `tests/` |
| `packages/pos-sync` | 3 | `*.integration.test.ts` + `*.unit.test.ts` |
| `packages/shared` | 1 | `src/__tests__/` |
| `packages/sync-core` | 3 | Co-located with source |
| `packages/telemetry` | 6 | `src/__tests__/` |
| `apps/backoffice/src/` | ~12 | Co-located |

**Total:** ~150 test files across the monorepo

### Problems Identified

1. **Inconsistent structure** - Tests scattered: co-located with source, `tests/`, `__tests__/`
2. **Overlapping coverage** - ~15-20 tests duplicate coverage between co-located and integration
3. **No clear separation** - Unit vs integration tests mixed without clear convention
4. **Mixed test runners** - Node.js test runner (API) vs Vitest (some packages)

### Target State

- All packages use `__test__/unit/` and `__test__/integration/` structure
- API: ~5-10 true unit tests (pure logic only), rest in integration
- Redundant tests removed via selective deduplication
- e2e tests remain in `apps/{app}/e2e/` (separate category)

---

## Stories

### Story 34.1: Audit All Test Files
Catalog all test files, classify as unit vs integration, create inventory matrix.

### Story 34.2: Define Canonical Structure
Establish `__test__/unit/` and `__test__/integration/` as standard, update configs.

### Story 34.3: API Test Classification & Reorganization
Classify 75 API co-located tests, move to proper locations.

### Story 34.4: API Selective Deduplication
Per-case deduplication analysis, remove ~15-20 redundant tests.

### Story 34.5: Package Test Reorganization
Apply `__test__/unit|integration` structure to all packages.

### Story 34.6: Validate & Update Scripts
Update all package.json test scripts for new structure.

### Story 34.7: Full Validation Gate
Run typecheck and tests across all packages, fix failures.

---

## Target Directory Structure

```
apps/api/
├── __test__/
│   ├── unit/          # ~5-10 tests (pure logic only)
│   │   ├── date-helpers.test.ts
│   │   ├── retry.test.ts
│   │   └── ...
│   └── integration/  # ~100+ tests
│       ├── auth.integration.test.mjs
│       ├── sales.integration.test.mjs
│       └── ...

packages/{pkg}/
├── __test__/
│   ├── unit/
│   └── integration/
```

---

## Classification Criteria

### Unit Test (goes to `__test__/unit/`)
- No real database access
- All dependencies mocked or stubbed
- Tests pure function logic
- Examples: date helpers, retry logic, validation utilities

### Integration Test (goes to `__test__/integration/`)
- Real database access (Kysely, mysql2)
- HTTP server calls
- File system operations
- External service calls
- Examples: route handlers, service with DB, repository tests

---

## Deduplication Strategy

For overlapping tests (same feature tested in both co-located and integration):

| Scenario | Action |
|----------|--------|
| Co-located is true unit, integration covers same | Delete co-located, keep integration |
| Co-located is DB-backed, integration exists | Delete co-located, keep integration |
| Logic deserves dual coverage (e.g., COGS) | Keep both unit and integration |
| Integration is comprehensive, co-located is superficial | Delete co-located |

---

## e2e Tests

e2e tests remain in their current location:
- `apps/backoffice/e2e/*.spec.ts`
- `apps/pos/e2e/*.spec.ts`

These are Playwright/Cypress tests and are a separate category from unit/integration.

---

## Out of Scope

- Creating new tests (only reorganizing existing)
- Fixing test failures (record only, fix in follow-up)
- Modifying e2e test structure
- Changing test framework (Node.js test runner for API, Vitest for packages)

---

## Success Criteria

- [x] All packages use `__test__/unit/` and `__test__/integration/` structure
- [x] API has only ~5 true unit tests (no DB) + 75 integration tests
- [x] Redundant tests removed (78 deleted: 26 route + 52 lib tests)
- [x] All npm test scripts updated
- [x] All packages standardized on vitest with `globals: true`
- [x] `npm run test -ws --if-present` passes (438 tests total)

## Final Statistics

| Metric | Value |
|--------|-------|
| Total Tests | 438 |
| Unit Tests | 237 |
| Integration Tests | 201 |
| Packages with Tests | 8 |
| Duplicate Tests Removed | 78 |
| Import Paths Fixed | 15+ |

---

## Related Documents

- Sprint plan: `_bmad-output/planning-artifacts/epic-34-sprint-plan.md`
- Coordination: `_bmad-output/implementation-artifacts/stories/epic-34/_parallel-coordination.md`
- Test inventory: `_bmad-output/implementation-artifacts/stories/epic-34/test-inventory.md`

---

## Retrospective (2026-04-06)

### What Went Well
1. **Clear structure defined early** - Canonical `__test__/unit|integration` structure established upfront
2. **Comprehensive audit** - 181 test files catalogued with classifications
3. **Selective deduplication** - Removed 78 duplicate tests, not blindly deleting all
4. **Vitest standardization** - All packages now use consistent vitest API

### Challenges Encountered
1. **Mixed test runners** - API originally used `node --test`, packages used vitest
2. **Import path hell** - Tests moved to `__test__/` had broken relative imports
3. **Singleton DB pools** - Auth integration tests shared pool, `afterEach` destroyed it mid-test-suite
4. **@jurnapod/modules-* resolution** - Vitest couldn't resolve workspace package aliases without explicit config

### Lessons Learned
1. **Don't mix test runners** - Standardize on one framework (vitest) before reorganizing
2. **Update imports when moving files** - Relocate imports along with files
3. **DB cleanup hooks** - Use `afterAll` for shared pool cleanup, not `afterEach`
4. **Alias workspace packages in vitest** - Add explicit aliases for workspace dependencies

### Action Items
- [ ] Consider migrating API tests from `node --test` to vitest for full consistency
- [ ] Document vitest workspace alias pattern for future reference
- [ ] Add `__test__/` path to tsconfig `include` in all packages
