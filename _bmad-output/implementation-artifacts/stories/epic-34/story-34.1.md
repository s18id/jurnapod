# Story 34.1: Audit All Test Files

## Overview

**Story:** Story 34.1: Audit All Test Files  
**Epic:** Epic 34: Test Reorganization & Assessment  
**Estimate:** 4h  
**Priority:** P1

## Goal

Catalog all test files across the monorepo, classify each as unit vs integration, and create a comprehensive test inventory matrix.

## Acceptance Criteria

1. All test files identified across all packages
2. Each test classified as:
   - **Unit**: No real DB, mocked dependencies, pure function testing
   - **Integration**: Real DB, HTTP calls, file system, external services
3. Test inventory created with columns:
   - Package
   - Test File
   - Current Location
   - Target Location (`__test__/unit/` or `__test__/integration/`)
   - Reason for classification
   - Has duplicate coverage? (Y/N)
4. Duplicate tests identified for deduplication in Story 34.4

## Scope

### Packages to Audit

| Package | Expected Tests |
|---------|---------------|
| `apps/api` | ~117 (75 co-located + 42 integration) |
| `apps/backoffice` | ~12 |
| `packages/auth` | 7 |
| `packages/db` | 2 |
| `packages/modules/accounting` | 1 |
| `packages/modules/inventory` | 0 |
| `packages/modules/inventory-costing` | 0 |
| `packages/modules/platform` | 1 |
| `packages/modules/reportiing` | 0 |
| `packages/modules/reservations` | 2 |
| `packages/modules/sales` | 0 |
| `packages/modules/treasury` | 3 |
| `packages/notifications` | 3 |
| `packages/offline-db` | 0 |
| `packages/pos-sync` | 3 |
| `packages/shared` | 1 |
| `packages/sync-core` | 3 |
| `packages/telemetry` | 6 |

### Classification Questions Per Test

1. Does it use real database? (Kysely, mysql2, pool.execute)
2. Does it mock database? (mocked Kysely, stubbed pool)
3. Does it make HTTP calls?
4. Does it access file system?
5. Does it call external services?
6. Is it testing pure functions with no side effects?

### Deliverable

Create a markdown table in `_bmad-output/implementation-artifacts/stories/epic-34/test-inventory.md`:

```markdown
| Package | Test File | Current Location | Type | Has DB? | Mocked? | Target | Duplicate? |
|---------|-----------|-----------------|------|---------|---------|--------|------------|
| api | auth.test.ts | src/routes/ | unit | Yes | partial | __test__/integration/ | Yes (auth.integration.test.mjs) |
```

## Files to Create

- `_bmad-output/implementation-artifacts/stories/epic-34/test-inventory.md`

## Dependencies

- None (first story)

## Notes

- e2e tests (`apps/backoffice/e2e/`, `apps/pos/e2e/`) are out of scope
- Scripts tests (`scripts/tests/`) are out of scope
