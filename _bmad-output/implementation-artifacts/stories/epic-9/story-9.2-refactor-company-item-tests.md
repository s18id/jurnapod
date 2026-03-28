# Story 9.2: Refactor Company & Item Tests

**Status:** done
**Epic:** Epic 9: Use Library Functions in Tests
**Story ID:** 9-2-refactor-company-item-tests

## Context
Refactor tests that create companies and items to use existing library functions (`createCompany()`, `createItem()`) instead of direct SQL queries.

## Acceptance Criteria
1. `lib/companies.ts` - `createCompany()` used in all company-related tests
2. `lib/items.ts` - `createItem()` used in item tests
3. Delete any inline `createTestCompany()` or `createTestItem()` helper functions
4. Tests pass after refactoring

## Files to Refactor
- `lib/cogs-posting.test.ts` (has `createTestItem` helper)
- `lib/cost-auditability.test.ts` (has `createTestItem` helper)
- `lib/cost-tracking.db.test.ts` (has `createTestItem` helper)
- `lib/item-variants.test.ts`

## Technical Notes
- Use `createCompany()` from `lib/companies.ts`
- Use `createItem()` from `lib/items.ts`
- Library functions handle FK constraints properly

## Dependencies
Story 9.1 (audit must complete first to know available functions)

## Estimated Effort
1 day

## Priority
P0

## Risk Level
Medium - Refactoring existing tests, must ensure tests still pass
