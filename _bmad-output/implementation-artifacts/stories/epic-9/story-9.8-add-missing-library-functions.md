# Story 9.8: Add Missing Library Functions

**Status:** done
**Epic:** Epic 9: Use Library Functions in Tests
**Story ID:** 9-8-add-missing-library-functions

## Context
Create library functions where none exist but are needed for tests.

## Acceptance Criteria
1. Functions for commonly-tested entities where library is missing
2. Functions are added to appropriate `lib/` files
3. Functions are well-documented and have JSDoc

## Likely Additions
- `lib/outlets.ts` - add `createOutlet()` if missing
- `lib/items.ts` - ensure `deleteItem()` exists for cleanup
- `lib/sync.ts` - add sync helper functions

## Technical Notes
- New functions should follow existing library patterns
- Include proper error handling
- Add to barrel exports

## Dependencies
Story 9.7 (identifies what's missing)

## Estimated Effort
1 day

## Priority
P2

## Risk Level
Low - Adding new functions, not modifying existing
