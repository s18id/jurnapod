# Story 34.3: API Test Classification & Reorganization

## Overview

**Story:** Story 34.3: API Test Classification & Reorganization  
**Epic:** Epic 34: Test Reorganization & Assessment  
**Estimate:** 8h  
**Priority:** P1

## Goal

Classify 75 API co-located tests and 42 integration tests, then move them to the proper `__test__/unit/` or `__test__/integration/` locations.

## Acceptance Criteria

1. All 42 integration tests moved from `tests/integration/*.integration.test.mjs` → `__test__/integration/`
2. Route tests from `src/routes/*.test.ts` analyzed:
   - True unit tests (mocked, no DB) → `__test__/unit/`
   - DB-backed tests → `__test__/integration/`
3. Lib tests from `src/lib/*.test.ts` analyzed similarly
4. Import paths updated in all moved files
5. Old file locations cleaned up (files deleted after successful move)

## Classification for API Tests

### Move to `__test__/unit/` (Pure Unit Tests)

These tests have no real DB, mocked dependencies:

| File | Reason |
|------|--------|
| `src/lib/date-helpers.test.ts` | Pure date logic, no DB |
| `src/lib/retry.test.ts` | Retry logic, no DB |
| `src/lib/cost-tracking.unit.test.ts` | Marked as unit, mocked |
| `src/lib/auth/permissions.test.ts` | Permission logic, mocked |
| `src/lib/metrics/metrics.test.ts` | Metrics collection, mocked |
| `src/lib/pricing/variant-price-resolver.test.ts` | Price calculation, mocked |

### Move to `__test__/integration/` (DB-backed Tests)

All tests that use real database:

| Category | Count | Reason |
|----------|-------|--------|
| Route tests (`src/routes/*.test.ts`) | 26 | All hit real DB |
| Lib tests (`src/lib/*.test.ts`) | ~45 | Most use real DB |
| Integration tests (`tests/integration/`) | 42 | Already integration |

## File Movement Map

### Integration Tests
```
tests/integration/*.integration.test.mjs → __test__/integration/
```

### Route Tests
```
src/routes/*.test.ts → __test__/integration/
```

### Lib Tests - Unit
```
src/lib/date-helpers.test.ts → __test__/unit/
src/lib/retry.test.ts → __test__/unit/
src/lib/cost-tracking.unit.test.ts → __test__/unit/
src/lib/auth/permissions.test.ts → __test__/unit/
src/lib/metrics/metrics.test.ts → __test__/unit/
src/lib/pricing/variant-price-resolver.test.ts → __test__/unit/
```

### Lib Tests - Integration
```
src/lib/*.test.ts → __test__/integration/ (most files)
```

## Deliverables

1. Moved 42 integration tests to `__test__/integration/`
2. Moved ~5-10 true unit tests to `__test__/unit/`
3. Moved ~65 DB-backed tests to `__test__/integration/`
4. Updated import paths in all moved files
5. Deleted old file locations

## Dependencies

- Story 34.2 (structure defined)

## Notes

- Run `npm run test:unit -w @jurnapod/api` and `npm run test:integration -w @jurnapod/api` after moves to verify
- Some tests may need import path adjustments
- Keep the test inventory from Story 34.1 as reference
