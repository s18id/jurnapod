# Story 9.6: Refactor Route Tests

**Status:** backlog
**Epic:** Epic 9: Use Library Functions in Tests
**Story ID:** 9-6-refactor-route-tests

## Context
Refactor HTTP route tests to use library functions for entity setup.

## Acceptance Criteria
1. Route tests use library functions for entity creation
2. Direct SQL only for read-only verification queries
3. Tests pass after refactoring

## Files to Refactor
- `routes/accounts.test.ts`
- `routes/inventory.test.ts`
- `routes/sales/*.test.ts`

## Technical Notes
- HTTP route tests often need auth setup
- Use library functions for entity creation, then HTTP for operations

## Dependencies
Story 9.2

## Estimated Effort
1.5 days

## Priority
P2
