# Story 9.5: Refactor User & Auth Tests

**Status:** backlog
**Epic:** Epic 9: Use Library Functions in Tests
**Story ID:** 9-5-refactor-user-auth-tests

## Context
Refactor user management and authentication tests.

## Acceptance Criteria
1. `lib/users.ts` - `createUser()` used where possible
2. `lib/auth.ts` functions used
3. Tests pass after refactoring

## Files to Refactor
- `lib/auth.test.ts`
- `routes/users.test.ts`
- `routes/auth.test.ts`

## Technical Notes
- User creation handles password hashing
- Session management

## Dependencies
Story 9.1 (audit)

## Estimated Effort
1 day

## Priority
P1
