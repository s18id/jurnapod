# Story 9.1: Audit Library Functions for Test Use

**Status:** backlog
**Epic:** Epic 9: Use Library Functions in Tests
**Story ID:** 9-1-audit-library-functions

## Context
Audit all library functions in `lib/` directory to determine which can be used in tests, which need modification, and which are missing.

## Acceptance Criteria
1. Complete audit of `lib/` directory functions
2. Document which functions are test-friendly (idempotent, have good defaults)
3. Identify gaps where no library function exists
4. Create `testing/library-usage-guide.md` with findings

## Technical Notes
- Focus on CRUD functions: create, read, update, delete
- Check if functions handle transactions properly
- Verify cleanup/deletion functions exist

## Dependencies
None

## Estimated Effort
0.5 days

## Priority
P0

## Risk Level
Low - Audit only, no code changes
