# Story 9.7: Batch Refactor Remaining Tests

**Status:** done
**Epic:** Epic 9: Use Library Functions in Tests
**Story ID:** 9-7-batch-refactor-remaining

## Context
Refactor all remaining test files to use library functions.

## Acceptance Criteria
1. All 67 test files assessed for library function usage
2. Direct SQL reduced to <36 instances (80% reduction target)
3. All tests pass

## Technical Notes
Prioritized order:
1. `lib/master-data.supplies.test.ts`
2. `lib/master-data.item-prices.test.ts`
3. `lib/service-sessions.test.ts`
4. `lib/reservations.test.ts`
5. Remaining route and lib tests

## Dependencies
Stories 9.2-9.6

## Estimated Effort
2 days

## Priority
P1

## Risk Level
Medium - Large number of files to refactor
