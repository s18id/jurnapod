# Story 15.2: test-fixtures Unique Naming

**Epic:** Epic 15
**Story Number:** 15.2
**Status:** backlog
**Estimated Time:** 2 hours
**Priority:** P1

---

## Summary

Improve test-fixtures with unique naming to prevent unique constraint violations in parallel test runs.

## Context

Epic 14 tests revealed ordering dependencies where unique constraint violations occurred when multiple test files ran together. The fixtures use deterministic identifiers that can collide.

## Problem

Current fixtures generate codes like `TEST-COMPANY-1`, `TEST-COMPANY-2`, etc. When tests run in parallel or out of order, these can collide.

## Solution

Add timestamp + random suffix to all fixture identifiers:

```typescript
// BEFORE
const code = `TEST-COMPANY-${counter++}`;  // Collides in parallel runs

// AFTER
const runId = Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
const code = `TEST-COMPANY-${runId}`;  // Unique per run
```

## Fixtures to Update

| Fixture | Field | Change |
|---------|-------|--------|
| `createTestCompanyMinimal` | code | Add unique suffix |
| `createTestUser` | email | Add unique suffix |
| `createTestOutletMinimal` | code | Add unique suffix |
| `createTestItem` | sku | Add unique suffix |

## Acceptance Criteria

- [ ] All company codes unique per test run
- [ ] All user emails unique per test run
- [ ] All outlet codes unique per test run
- [ ] All item skus unique per test run
- [ ] Existing tests still pass
- [ ] No constraint violations in parallel test runs

## Files to Modify

- `apps/api/src/lib/test-fixtures.ts`

---

*Story file created: 2026-03-28*
