# Story 16.4: Add canonical time-helper test coverage

Status: ready-for-dev

## Story

As a developer,
I want comprehensive tests for `date-helpers`,
so that time conversion behavior remains safe during future refactors.

## Acceptance Criteria

1. Tests cover UTC roundtrip, business date derivation, epoch consistency, invalid timezone rejection, DST edge cases, and `resolveEventTime`.
2. `resolveEventTime` returns aligned `atUtc`, `ts`, `businessDate`, and `timeZone` values.
3. The helper test suite remains deterministic across supported environments.

## Tasks / Subtasks

- [ ] Task 1: Expand unit coverage for all public helper primitives (AC: 1)
  - [ ] Subtask 1.1: Add local → UTC → local roundtrip tests.
  - [ ] Subtask 1.2: Add business-date derivation tests across UTC, Asia/Jakarta, and DST-observing zones.
  - [ ] Subtask 1.3: Add epoch roundtrip tests.
- [ ] Task 2: Add `resolveEventTime` contract tests (AC: 1, 2)
  - [ ] Subtask 2.1: Validate aligned `atUtc`, `ts`, `businessDate`, and `timeZone` outputs.
  - [ ] Subtask 2.2: Validate failure behavior for malformed inputs.
- [ ] Task 3: Keep the test suite deterministic (AC: 3)
  - [ ] Subtask 3.1: Avoid environment-local timezone assumptions.
  - [ ] Subtask 3.2: Use fixed examples and explicit expected values.

## Dev Notes

### Developer Context

- The existing helper test suite is already the best place to centralize time-behavior regression protection. [Source: `apps/api/src/lib/date-helpers.test.ts`]
- This story should close the gap between today’s range-focused tests and the fuller helper contract established in Epic 16.

### Technical Requirements

- Tests must not rely on server local timezone.
- Use explicit IANA timezone names in assertions.
- Prefer fixed timestamps and date strings over `Date.now()` in helper unit coverage.

### Architecture Compliance

- Centralized helper tests are part of the guardrail against ad hoc time logic across modules.

### Library / Framework Requirements

- Use the existing Node test pattern already present in `date-helpers.test.ts`.

### File Structure Requirements

- Test file: `apps/api/src/lib/date-helpers.test.ts`
- Helper file under test: `apps/api/src/lib/date-helpers.ts`

### Testing Requirements

- Include the minimum test categories defined by Epic 16.
- If helper names changed in Stories 16.1/16.2, keep test naming aligned with the final public API.

### Previous Story Intelligence

- Stories 16.1–16.3 define the contract and policy; this story should codify them into regression tests before broad call-site migration.

### Project Structure Notes

- No DB/test-pool cleanup should be needed for this unit-only story.

### References

- `_bmad-output/planning-artifacts/epics.md#Story 16.4: Add canonical time-helper test coverage`
- `apps/api/src/lib/date-helpers.ts`
- `apps/api/src/lib/date-helpers.test.ts`

## Dev Agent Record

### Agent Model Used

openai/gpt-5.4

### Debug Log References

- Story created from Epic 16 required coverage categories.

### Completion Notes List

- Pending implementation.

### File List

- `apps/api/src/lib/date-helpers.test.ts`
- `apps/api/src/lib/date-helpers.ts`
