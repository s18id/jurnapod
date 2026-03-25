# Story 18.2: Remove dropped-column references from tests and fixtures

Status: ready-for-dev

## Story

As a developer,
I want tests and fixtures cleaned up before migration,
so that the schema drop does not break automated validation.

## Acceptance Criteria

1. Impacted tests and fixtures no longer reference the three dropped columns.
2. Targeted affected test files pass after fixture cleanup.
3. Repo-wide search confirms no active app/test references remain outside intended historical/schema artifacts.

## Tasks / Subtasks

- [ ] Task 1: Remove fixture references to dropped columns (AC: 1)
  - [ ] Subtask 1.1: Update `apps/api/src/lib/service-sessions.test.ts`.
  - [ ] Subtask 1.2: Update `apps/api/src/lib/reservations.test.ts`.
  - [ ] Subtask 1.3: Update `apps/api/src/lib/outlet-tables.test.ts`.
- [ ] Task 2: Validate targeted test suites (AC: 2)
  - [ ] Subtask 2.1: Run single-file API tests for the affected files.
  - [ ] Subtask 2.2: Fix any assumptions tied to removed fixture columns.
- [ ] Task 3: Confirm cleanup completeness (AC: 3)
  - [ ] Subtask 3.1: Run repo-wide search for dropped columns.
  - [ ] Subtask 3.2: Confirm only historical schema/doc references remain until final baseline refresh.

## Dev Notes

### Developer Context

- The ADR dependency audit identified fixture references to `created_at_ts` in service-session, reservation, and outlet-table tests. [Source: `_bmad-output/implementation-artifacts/adr-0001-ts-dependency-audit-checklist.md`]
- Fixture cleanup should happen before destructive migration so the test suite remains a reliable safety net.

### Technical Requirements

- Remove only the dropped-column references.
- Keep test intent intact.
- Respect integration fixture policy: API-driven setup for business entities where applicable. [Source: `apps/api/AGENTS.md#Integration test fixture policy`]

### Architecture Compliance

- Tests covering sync, reservations, and service-session behavior are regression-critical for offline-first correctness.

### File Structure Requirements

- Primary test files:
  - `apps/api/src/lib/service-sessions.test.ts`
  - `apps/api/src/lib/reservations.test.ts`
  - `apps/api/src/lib/outlet-tables.test.ts`
- Potential additional verification:
  - `apps/api/tests/integration/sync-push.integration.test.mjs`

### Testing Requirements

- Preserve `closeDbPool()` cleanup hooks where DB pools are used.
- Run affected tests from repo root using the documented API test commands.

### Previous Story Intelligence

- Story 18.1 removes active writes; this story removes the parallel test/fixture assumptions.

### Project Structure Notes

- This story should complete before the schema-drop migration story.

### References

- `_bmad-output/implementation-artifacts/adr-0001-ts-dependency-audit-checklist.md`
- `_bmad-output/planning-artifacts/epics.md#Story 18.2: Remove dropped-column references from tests and fixtures`
- `apps/api/src/lib/service-sessions.test.ts`
- `apps/api/src/lib/reservations.test.ts`
- `apps/api/src/lib/outlet-tables.test.ts`

## Dev Agent Record

### Agent Model Used

openai/gpt-5.4

### Debug Log References

- Story created from ADR-0001 fixture cleanup audit findings.

### Completion Notes List

- Pending implementation.

### File List

- `apps/api/src/lib/service-sessions.test.ts`
- `apps/api/src/lib/reservations.test.ts`
- `apps/api/src/lib/outlet-tables.test.ts`
