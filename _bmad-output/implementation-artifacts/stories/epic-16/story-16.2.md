# Story 16.2: Implement Temporal-backed internals in `date-helpers`

Status: done

## Story

As a developer,
I want `date-helpers` to use `@js-temporal/polyfill` internally,
so that timezone and DST handling are deterministic and safer than ad hoc `Date` usage.

## Acceptance Criteria

1. `date-helpers` uses `@js-temporal/polyfill` internally for timezone-aware conversion logic.
2. Callers do not need to instantiate or work directly with Temporal objects.
3. Malformed UTC/local/timezone inputs fail deterministically with testable errors.
4. Existing behavior required by current tests and consumers remains stable or is intentionally updated with matching test coverage.

## Tasks / Subtasks

- [ ] Task 1: Introduce Temporal-backed internal conversion primitives (AC: 1, 2)
  - [ ] Subtask 1.1: Add internal wrappers for UTC instant parsing and timezone-aware conversion.
  - [ ] Subtask 1.2: Keep Temporal types private to the module.
- [ ] Task 2: Replace current Intl/binary-search implementation where appropriate (AC: 1, 3)
  - [ ] Subtask 2.1: Refactor `normalizeDate`/related helpers to Temporal-backed internals.
  - [ ] Subtask 2.2: Preserve deterministic output formats.
- [ ] Task 3: Standardize error handling (AC: 3)
  - [ ] Subtask 3.1: Reject malformed timezone names, invalid UTC strings, invalid epoch values, and malformed local datetime input with clear errors.
  - [ ] Subtask 3.2: Keep error behavior stable enough for tests and callers.
- [ ] Task 4: Update unit tests around the new internals (AC: 4)
  - [ ] Subtask 4.1: Add tests that cover Temporal-backed conversion behavior.
  - [ ] Subtask 4.2: Confirm existing covered cases still pass.

## Dev Notes

### Developer Context

- Current `date-helpers` uses `Intl.DateTimeFormat` plus binary search to resolve timezone boundaries; this story replaces internal strategy, not the public wrapper role. [Source: `apps/api/src/lib/date-helpers.ts`]
- Existing date-helper tests already cover DST and offset edge cases; they are the regression harness for the refactor. [Source: `apps/api/src/lib/date-helpers.test.ts`]
- Story 16.1 should establish the public contract first; implement internals to satisfy that contract rather than inventing a different API.

### Technical Requirements

- Keep public return values primitive-only.
- Fail clearly for malformed input; no silent coercion.
- Preserve RFC3339/UTC normalization semantics already expected by current API code.

### Architecture Compliance

- Centralize conversion logic in `date-helpers`; do not scatter Temporal instantiation through routes or business modules. [Source: `docs/project-context.md#Architecture Principles`]
- Avoid broad caller refactors in this story beyond what is required to support the internal shift.

### Library / Framework Requirements

- Use `@js-temporal/polyfill` internally.
- Do not expose Temporal objects in exported signatures.

### File Structure Requirements

- Implementation: `apps/api/src/lib/date-helpers.ts`
- Tests: `apps/api/src/lib/date-helpers.test.ts`
- Consumer compatibility spot-checks should consider:
  - `apps/api/src/lib/reports.ts`
  - `apps/api/src/lib/reservations.ts`

### Testing Requirements

- Cover invalid timezone names and malformed input.
- Preserve existing DST/date-boundary coverage.
- Add focused tests for new internal behavior without reducing current regression assertions.

### Previous Story Intelligence

- Build on Story 16.1’s contract; if a helper name or primitive output was defined there, do not drift from it in implementation.

### Project Structure Notes

- This is a private implementation swap under the same helper entry point.
- The goal is safer internals, not a new shared package.

### References

- `_bmad-output/planning-artifacts/epics.md#Story 16.2: Implement Temporal-backed internals in date-helpers`
- `apps/api/src/lib/date-helpers.ts`
- `apps/api/src/lib/date-helpers.test.ts`
- `docs/project-context.md`

## Dev Agent Record

### Agent Model Used

openai/gpt-5.4

### Debug Log References

- Story created from the Epic 16 internal-implementation refactor scope.

### Completion Notes List

- Story 16.2 complete. `date-helpers` now uses `@js-temporal/polyfill` internally for timezone-aware conversion logic.
- Temporal remains private to the module; public helper signatures still return primitive values only.
- Malformed UTC/local/timezone inputs fail deterministically, including invalid epoch-ms inputs via `fromEpochMs()`.
- Existing helper behavior remains covered by the expanded `date-helpers.test.ts` regression suite.

### File List

- `apps/api/src/lib/date-helpers.ts`
- `apps/api/src/lib/date-helpers.test.ts`
- `apps/api/package.json`
