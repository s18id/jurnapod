# Story 9.3: Refactor Import & Progress Tests

**Status:** backlog
**Epic:** Epic 9: Use Library Functions in Tests
**Story ID:** 9-3-refactor-import-progress-tests

## Context
Refactor import session and progress tracking tests to use library functions.

## Acceptance Criteria
1. `lib/import/session-store.ts` - `createImportSession()` used
2. `lib/progress/progress-store.ts` - `createProgress()` used
3. Tests pass after refactoring

## Files to Refactor
- `lib/import/checkpoint-resume.test.ts`
- `lib/import/batch-recovery.test.ts`
- `lib/progress/progress-store.test.ts`

## Technical Notes
- Import session functions handle checkpoint data
- Progress functions handle SSE controller cleanup

## Dependencies
Story 9.1 (audit)

## Estimated Effort
1 day

## Priority
P1

## Risk Level
Medium - Session and progress tests are complex with multiple dependencies
