# Story 18.4: Validate post-cleanup sync and reservation regressions

Status: ready-for-dev

## Story

As a developer,
I want focused regression coverage after cleanup and migration,
so that destructive schema simplification does not introduce behavioral bugs.

## Acceptance Criteria

1. Targeted sync tests confirm retries, replays, stale-update handling, and retained `_ts` behavior remain correct.
2. Targeted reservation tests confirm overlap, adjacency, date filtering, and timezone behavior remain unchanged.
3. All P0/P1 checks from the ADR-0001 test matrix pass before completion.

## Tasks / Subtasks

- [ ] Task 1: Run sync-focused regression coverage (AC: 1, 3)
  - [ ] Subtask 1.1: Execute targeted sync push tests.
  - [ ] Subtask 1.2: Verify replay/idempotency/stale update behavior.
- [ ] Task 2: Run reservation-focused regression coverage (AC: 2, 3)
  - [ ] Subtask 2.1: Execute reservation overlap/adjacency tests.
  - [ ] Subtask 2.2: Verify timezone-sensitive date filtering behavior.
- [ ] Task 3: Record evidence against the ADR test matrix (AC: 3)
  - [ ] Subtask 3.1: Map results back to TC-01..TC-20 as applicable.
  - [ ] Subtask 3.2: Document any explicitly non-impacted checks.

## Dev Notes

### Developer Context

- The ADR test matrix already defines P0/P1 validation categories and candidate test files. [Source: `_bmad-output/implementation-artifacts/adr-0001-ts-test-matrix.md`]
- This story is evidence gathering plus any necessary regression-fix completion, not broad feature work.

### Technical Requirements

- Sync correctness and reservation correctness are release-blocking.
- Validate after cleanup and migration work, not before only.
- Preserve canonical reservation timestamp semantics and sync idempotency.

### Architecture Compliance

- POS sync and reservation timing are high-risk correctness areas; treat regressions as blockers.

### File Structure Requirements

- Likely tests:
  - `apps/api/src/routes/sync/push.test.ts`
  - `apps/api/tests/integration/sync-push.integration.test.mjs`
  - `apps/api/src/lib/reservations.test.ts`
  - `apps/api/src/lib/service-sessions.test.ts`

### Testing Requirements

- Run tests from repo root.
- Preserve DB cleanup hooks in modified unit tests.
- Record outputs in completion notes when implementing.

### Previous Story Intelligence

- This story depends on Stories 18.1–18.3 landing first so regression evidence reflects the final intended state.

### Project Structure Notes

- The ADR test matrix is the source of truth for required evidence.

### References

- `_bmad-output/planning-artifacts/epics.md#Story 18.4: Validate post-cleanup sync and reservation regressions`
- `_bmad-output/implementation-artifacts/adr-0001-ts-test-matrix.md`
- `_bmad-output/implementation-artifacts/adr-0001-ts-rollout-plan.md`

## Dev Agent Record

### Agent Model Used

openai/gpt-5.4

### Debug Log References

- Story created from ADR-0001 regression validation plan.

### Completion Notes List

- Pending implementation.

### File List

- `apps/api/src/routes/sync/push.test.ts`
- `apps/api/tests/integration/sync-push.integration.test.mjs`
- `apps/api/src/lib/reservations.test.ts`
- `apps/api/src/lib/service-sessions.test.ts`
