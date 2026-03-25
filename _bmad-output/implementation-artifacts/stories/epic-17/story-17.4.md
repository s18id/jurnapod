# Story 17.4: Preserve reservation boundary timestamp behavior

Status: ready-for-dev

## Story

As a developer,
I want reservation boundary timestamps to remain canonical for overlap and range logic,
so that booking behavior and indexed query semantics do not regress.

## Acceptance Criteria

1. Reservation overlap checks continue using `reservation_start_ts` and `reservation_end_ts` as canonical boundaries.
2. Adjacent reservations (`end == next start`) remain non-overlapping.
3. Reservation date/window queries remain index-friendly and do not wrap canonical timestamp columns in SQL functions.
4. Reservation tests verify overlap, adjacency, date filtering, and timezone-sensitive behavior remain unchanged.

## Tasks / Subtasks

- [ ] Task 1: Audit canonical reservation boundary usage (AC: 1, 2, 3)
  - [ ] Subtask 1.1: Review `apps/api/src/lib/reservations.ts` list/filter/overlap logic.
  - [ ] Subtask 1.2: Review related reservation-group behavior if shared overlap logic exists.
- [ ] Task 2: Preserve or harden canonical boundary behavior (AC: 1, 2, 3)
  - [ ] Subtask 2.1: Keep overlap rule `a_start < b_end && b_start < a_end`.
  - [ ] Subtask 2.2: Keep index-friendly query shape.
  - [ ] Subtask 2.3: Preserve fallback behavior for legacy rows only where necessary.
- [ ] Task 3: Add/refresh regression tests (AC: 4)
  - [ ] Subtask 3.1: Cover adjacency and overlap boundaries.
  - [ ] Subtask 3.2: Cover date filtering/timezone-sensitive cases.

## Dev Notes

### Developer Context

- Reservation list/filter logic already prefers `reservation_start_ts` / `reservation_end_ts` with legacy `reservation_at` fallback. [Source: `apps/api/src/lib/reservations.ts`]
- Story 12.10 previously established canonical reservation timestamp behavior; do not regress it. [Source: `_bmad-output/implementation-artifacts/stories/epic-12/story-12.10.md`]

### Technical Requirements

- Preserve overlap rule and adjacency semantics.
- Keep canonical timestamp columns raw in SQL predicates for index usage.
- Maintain timezone resolution behavior required by reservation flows.

### Architecture Compliance

- Reservation timing must remain deterministic across timezones and sync/replay flows.
- Avoid UTC fallback for date-only filtering where outlet/company timezone resolution is required by repo rules. [Source: `AGENTS.md#Reservation time schema (canonical)`]

### Library / Framework Requirements

- Use `date-helpers` for normalization when app-layer boundary values are prepared.

### File Structure Requirements

- Implementation files:
  - `apps/api/src/lib/reservations.ts`
  - `apps/api/src/lib/reservation-groups.ts` (if shared logic applies)
- Tests:
  - `apps/api/src/lib/reservations.test.ts`
  - `apps/api/src/lib/reservation-groups.test.ts` if touched

### Testing Requirements

- Preserve DB pool cleanup hooks in modified DB-using unit tests.
- Reuse existing canonical reservation regression patterns from Story 12.10.

### Previous Story Intelligence

- Story 12.10 already captured canonical reservation timestamp doctrine and useful guardrails for this story; build on that precedent rather than rethinking semantics.

### Project Structure Notes

- This story is about preserving canonical behavior under the new helper/ADR work, not redesigning reservation APIs.

### References

- `_bmad-output/planning-artifacts/epics.md#Story 17.4: Preserve reservation boundary timestamp behavior`
- `apps/api/src/lib/reservations.ts`
- `_bmad-output/implementation-artifacts/stories/epic-12/story-12.10.md`
- `apps/api/src/lib/reservations.test.ts`

## Dev Agent Record

### Agent Model Used

openai/gpt-5.4

### Debug Log References

- Story created from Epic 17 reservation-boundary preservation requirements.

### Completion Notes List

- Pending implementation.

### File List

- `apps/api/src/lib/reservations.ts`
- `apps/api/src/lib/reservations.test.ts`
- `apps/api/src/lib/reservation-groups.ts`
