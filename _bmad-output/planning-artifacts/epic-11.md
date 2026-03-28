# Epic 11: Refactor Remaining Test Files

## Overview

Refactor all remaining test files that use hardcoded `TEST_*_ID` constants to use dynamic IDs from library functions.

## Problem Statement

After Epic 10, 11 test files still have hardcoded IDs:
- `cost-tracking.db.test.ts` (12+ refs)
- `cost-auditability.test.ts` (18 refs)
- `cogs-posting.test.ts` (60+ refs)
- `users.test.ts`, `auth.test.ts`
- + 7 more files

## Scope

### In Scope
- Refactor `cost-tracking.db.test.ts`
- Refactor `cost-auditability.test.ts`
- Refactor `cogs-posting.test.ts` (largest remaining)
- Refactor `users.test.ts`, `auth.test.ts`
- Refactor 7 remaining test files
- All tests use dynamic IDs from library functions

### Out of Scope
- Changes to production library functions
- `createOutletBasic()` (added in Epic 10)

## Dependencies

- Epic 10 completed: `createOutletBasic()` exists
- Epic 9 completed: `createCompanyBasic()` and `createUserBasic()` exist

## Success Criteria

1. All hardcoded `TEST_COMPANY_ID`, `TEST_OUTLET_ID`, `TEST_USER_ID` removed from remaining test files
2. All tests use `createCompanyBasic()` / `createOutletBasic()` / `createUserBasic()` for FK references
3. All 1,524 tests pass after refactoring
4. No FK constraint errors

## Stories

| Story | Files | Est. Hours |
|-------|-------|------------|
| 11.1 | `cost-tracking.db.test.ts`, `cost-auditability.test.ts` | 3 |
| 11.2 | `cogs-posting.test.ts` | 2 |
| 11.3 | `users.test.ts`, `auth.test.ts` | 2 |
| 11.4 | 7 remaining test files | 3 |

## Files to Modify

1. `apps/api/src/lib/cost-tracking.db.test.ts`
2. `apps/api/src/lib/cost-auditability.test.ts`
3. `apps/api/src/lib/cogs-posting.test.ts`
4. `apps/api/src/lib/users.test.ts`
5. `apps/api/src/lib/auth.test.ts`
6. + 7 more files (TBD after audit)
