# Story 16.3: Define and implement DST ambiguity policy

Status: ready-for-dev

## Story

As a developer,
I want ambiguous and nonexistent local times handled by explicit policy,
so that reservation and event-time normalization does not silently pick the wrong instant.

## Acceptance Criteria

1. Nonexistent local times in DST-observing zones are rejected by default.
2. Ambiguous local times are rejected by default unless an explicit supported strategy is introduced and documented.
3. DST ambiguity/nonexistence policy is documented in helper comments/tests.
4. Tests demonstrate deterministic behavior for DST edge cases.

## Tasks / Subtasks

- [ ] Task 1: Define the DST policy in the helper contract (AC: 1, 2, 3)
  - [ ] Subtask 1.1: Choose explicit default behavior for nonexistent and ambiguous local times.
  - [ ] Subtask 1.2: Document any optional strategy mechanism if introduced.
- [ ] Task 2: Implement policy enforcement in conversion helpers (AC: 1, 2)
  - [ ] Subtask 2.1: Detect nonexistent local times during timezone resolution.
  - [ ] Subtask 2.2: Detect ambiguous local times during timezone resolution.
- [ ] Task 3: Add DST-focused tests (AC: 3, 4)
  - [ ] Subtask 3.1: Cover spring-forward nonexistent wall time rejection.
  - [ ] Subtask 3.2: Cover fall-back ambiguous wall time rejection or explicit strategy behavior.
  - [ ] Subtask 3.3: Verify error messaging remains deterministic.

## Dev Notes

### Developer Context

- Existing tests cover date-range boundaries around DST transitions, but not explicit ambiguous/nonexistent local wall-time policy. [Source: `apps/api/src/lib/date-helpers.test.ts`]
- This story is critical for reservation/event normalization because silent wall-time coercion can move bookings/events to the wrong instant.

### Technical Requirements

- Policy must be explicit and testable.
- Avoid silent fallback to server timezone or guessed offsets.
- If an optional ambiguity strategy is supported later, default behavior should still be safe-by-default.

### Architecture Compliance

- Keep policy centralized in `date-helpers`; routes and business modules should not make DST-policy decisions inline.

### Library / Framework Requirements

- Use Temporal-backed internals from Story 16.2 to detect DST ambiguity/nonexistence.
- Preserve primitive-only public API behavior.

### File Structure Requirements

- Implementation: `apps/api/src/lib/date-helpers.ts`
- Tests: `apps/api/src/lib/date-helpers.test.ts`

### Testing Requirements

- Add focused DST edge-case tests in addition to existing range-boundary tests.
- No DB integration required.

### Previous Story Intelligence

- Reuse Story 16.1 contract language and Story 16.2 internal primitives; avoid adding a one-off DST helper API that bypasses the established wrapper pattern.

### Project Structure Notes

- This story should not migrate call sites broadly; it defines and verifies helper behavior.

### References

- `_bmad-output/planning-artifacts/epics.md#Story 16.3: Define and implement DST ambiguity policy`
- `apps/api/src/lib/date-helpers.ts`
- `apps/api/src/lib/date-helpers.test.ts`

## Dev Agent Record

### Agent Model Used

openai/gpt-5.4

### Debug Log References

- Story created from Epic 16 DST safety requirements.

### Completion Notes List

- Pending implementation.

### File List

- `apps/api/src/lib/date-helpers.ts`
- `apps/api/src/lib/date-helpers.test.ts`
