# Story 34.4: API Selective Deduplication

## Overview

**Story:** Story 34.4: API Selective Deduplication  
**Epic:** Epic 34: Test Reorganization & Assessment  
**Estimate:** 8h  
**Priority:** P2

## Goal

Analyze overlapping test coverage between co-located/unit tests and integration tests, then selectively remove redundant tests while preserving coverage for critical business logic.

## Acceptance Criteria

1. All overlapping test pairs identified from Story 34.1 inventory
2. Per-case decision made for each overlapping pair
3. ~15-20 redundant tests deleted
4. Critical logic (e.g., COGS posting) retains both unit and integration coverage
5. Deleted tests documented with rationale

## Deduplication Matrix

### Delete Unit, Keep Integration

These tests are fully covered by integration tests:

| Unit Test | Integration Test(s) | Rationale |
|-----------|---------------------|-----------|
| `src/routes/auth.test.ts` | `auth.integration.test.mjs` | Integration covers HTTP layer + DB |
| `src/routes/sales/orders.test.ts` | `sales.integration.test.mjs` | Integration covers same endpoints |
| `src/routes/sales/invoices.test.ts` | `sales.integration.test.mjs` | Integration covers same endpoints |
| `src/routes/sales/payments.test.ts` | `sales-payments.acl.integration.test.mjs` | Integration covers same |
| `src/routes/accounts.test.ts` | `accounts.classification.integration.test.mjs` | Integration covers same |
| `src/routes/reports.test.ts` | 8 report integration tests | 8 specs provide comprehensive coverage |
| `src/routes/settings-config.test.ts` | `settings-config.integration.test.mjs` | Integration covers same |
| `src/routes/settings-modules.test.ts` | `settings.integration.test.mjs` | Integration covers same |
| `src/routes/stock.test.ts` | Covered by inventory integration | Integration covers same |
| `src/lib/sales.test.ts` | `sales.integration.test.mjs` | Integration covers same |
| `src/lib/cash-bank.test.ts` | `cash-bank.integration.test.mjs` | Integration covers same |
| `src/lib/recipe-composition.test.ts` | `recipe-composition.integration.test.mjs` | Integration covers same |
| `src/lib/import/import.test.ts` | `import.integration.test.mjs` | Integration covers same |
| `src/lib/cogs-posting.test.ts` | `cogs-posting.integration.test.mjs` | **KEEP BOTH** - COGS deserves dual coverage |

### Keep Both (Dual Coverage)

These tests verify critical business logic that deserves both unit and integration testing:

| Unit Test | Integration Test | Rationale |
|----------|-----------------|-----------|
| `src/lib/cogs-posting.test.ts` | `cogs-posting.integration.test.mjs` | COGS calculation is critical |
| `src/lib/cost-tracking.unit.test.ts` | `cost-tracking.db.test.ts` | Cost tracking is critical |

### Keep Unit (No Integration Equivalent)

| Unit Test | Rationale |
|-----------|-----------|
| `src/lib/date-helpers.test.ts` | No integration test for pure date utils |
| `src/lib/retry.test.ts` | No integration test for retry logic |
| `src/lib/auth/permissions.test.ts` | Tests permission logic, not full flow |

## Expected Deletions

Approximately 15-20 tests will be deleted:

- ~12 route tests (covered by integration)
- ~8 lib tests (covered by integration)

## Deliverables

1. Deleted redundant unit tests (~15-20 files)
2. Deletion log with rationale for each
3. Verification that coverage remains (integration tests still pass)

## Dependencies

- Story 34.3 (tests reorganized, can see final state)

## Notes

- After deletion, run full API test suite to verify no coverage gaps
- If any integration test fails after deletion, investigate - may need to add coverage
- Document any edge cases that were only tested by deleted unit tests
