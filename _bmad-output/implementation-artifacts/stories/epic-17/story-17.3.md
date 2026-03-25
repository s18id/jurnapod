# Story 17.3: Apply canonical `_ts` semantics to snapshot and cancellation write paths

Status: ready-for-dev

## Story

As a developer,
I want retained snapshot and cancellation `_ts` fields to follow explicit semantics,
so that materialized state and event timelines stay consistent after ADR-0001 changes.

## Acceptance Criteria

1. `opened_at_ts`, `closed_at_ts`, and `updated_at_ts` in snapshot write paths follow their defined state-transition/snapshot-freshness semantics.
2. `cancelled_at_ts` preserves cancellation occurrence time according to contract.
3. Retained `_ts` fields do not rely on dropped `created_at_ts` columns for ordering behavior.
4. Tests cover snapshot and cancellation write-path expectations.

## Tasks / Subtasks

- [ ] Task 1: Audit snapshot and cancellation write logic (AC: 1, 2, 3)
  - [ ] Subtask 1.1: Review active-order snapshot writes in `apps/api/src/routes/sync/push.ts`.
  - [ ] Subtask 1.2: Review service-session snapshot-line writes in `apps/api/src/lib/service-sessions.ts`.
  - [ ] Subtask 1.3: Review cancellation writes in `apps/api/src/routes/sync/push.ts`.
- [ ] Task 2: Align retained `_ts` fields to explicit semantics (AC: 1, 2, 3)
  - [ ] Subtask 2.1: Keep state-transition timestamps distinct from update freshness timestamps.
  - [ ] Subtask 2.2: Preserve cancellation occurrence time handling.
- [ ] Task 3: Add regression tests (AC: 4)
  - [ ] Subtask 3.1: Update sync push tests for snapshots/cancellations.
  - [ ] Subtask 3.2: Update service session tests if snapshot-line writes are changed.

## Dev Notes

### Developer Context

- Snapshot upserts currently derive `_ts` values inline from payload `opened_at`, `closed_at`, and `updated_at`, and still populate `created_at_ts`. [Source: `apps/api/src/routes/sync/push.ts`]
- Service-session logic also still writes `created_at_ts` on snapshot lines, which later cleanup stories will remove. [Source: explore summary + dependency audit artifacts]

### Technical Requirements

- Keep retained `_ts` semantics explicit:
  - snapshot transition time
  - snapshot freshness/update time
  - cancellation event occurrence time
- Do not use dropped `created_at_ts` as hidden ordering fallback.

### Architecture Compliance

- Materialized state must remain deterministic across terminals and sync replay. [Source: `_bmad-output/planning-artifacts/table-reservation-pos-sync-architecture.md#Invariants`]

### Library / Framework Requirements

- Reuse `date-helpers` for normalization where Story 16 made it available.

### File Structure Requirements

- Implementation files:
  - `apps/api/src/routes/sync/push.ts`
  - `apps/api/src/lib/service-sessions.ts`
- Tests:
  - `apps/api/src/routes/sync/push.test.ts`
  - `apps/api/src/lib/service-sessions.test.ts`

### Testing Requirements

- Preserve DB pool cleanup hooks in modified DB-using unit tests.
- Confirm no regressions in snapshot freshness comparisons.

### Previous Story Intelligence

- Builds on Story 17.1 authority rules and Story 17.2 version-marker clarity.

### Project Structure Notes

- Keep retained semantics explicit in code comments or helper usage to reduce future timestamp drift.

### References

- `_bmad-output/planning-artifacts/epics.md#Story 17.3: Apply canonical _ts semantics to snapshot and cancellation write paths`
- `apps/api/src/routes/sync/push.ts`
- `apps/api/src/lib/service-sessions.ts`
- `apps/api/src/lib/service-sessions.test.ts`

## Dev Agent Record

### Agent Model Used

openai/gpt-5.4

### Debug Log References

- Story created from Epic 17 retained snapshot/cancellation semantics requirements.

### Completion Notes List

- Pending implementation.

### File List

- `apps/api/src/routes/sync/push.ts`
- `apps/api/src/lib/service-sessions.ts`
- `apps/api/src/routes/sync/push.test.ts`
- `apps/api/src/lib/service-sessions.test.ts`
