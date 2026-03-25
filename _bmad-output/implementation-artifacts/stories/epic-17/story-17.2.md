# Story 17.2: Preserve `base_order_updated_at_ts` as version-marker semantics

Status: ready-for-dev

## Story

As a developer,
I want `base_order_updated_at_ts` treated as a copied version marker,
so that stale update detection remains correct during retries, replays, and concurrent sync.

## Acceptance Criteria

1. `base_order_updated_at_ts` is used as an optimistic-concurrency/version marker and not interpreted as business/display time.
2. Stale update scenarios continue to reject or handle outdated updates according to current sync contract.
3. Tests prove version-marker behavior under replay/concurrency scenarios.

## Tasks / Subtasks

- [ ] Task 1: Audit current usage of `base_order_updated_at_ts` (AC: 1)
  - [ ] Subtask 1.1: Review sync push ingestion and any downstream comparison logic.
  - [ ] Subtask 1.2: Identify any misleading or overloaded uses.
- [ ] Task 2: Harden version-marker semantics in code/comments/tests (AC: 1, 2)
  - [ ] Subtask 2.1: Ensure comparisons treat the field as base-state version metadata.
  - [ ] Subtask 2.2: Avoid using it for display/business event logic.
- [ ] Task 3: Add stale-update regression tests (AC: 2, 3)
  - [ ] Subtask 3.1: Cover outdated base version input.
  - [ ] Subtask 3.2: Cover retry/replay behavior with valid base version.

## Dev Notes

### Developer Context

- `base_order_updated_at_ts` is currently inserted in `processOrderUpdates` from `update.base_order_updated_at`, but Epic 17 defines it as a version marker, not an event/display timestamp. [Source: `apps/api/src/routes/sync/push.ts`]
- The field belongs to sync/version ordering semantics in ADR work, not general time display logic. [Source: `_bmad-output/planning-artifacts/epics.md`]

### Technical Requirements

- Preserve idempotent replay behavior.
- Do not repurpose this field as domain event time.
- Keep stale-update detection deterministic.

### Architecture Compliance

- Sync logic must remain duplicate-safe and tenant-safe. [Source: `docs/project-context.md#Architecture Principles`]

### Library / Framework Requirements

- If normalization is needed, route it through `date-helpers` or clearly isolated sync helpers.

### File Structure Requirements

- Likely implementation file: `apps/api/src/routes/sync/push.ts`
- Likely tests: `apps/api/src/routes/sync/push.test.ts`

### Testing Requirements

- Favor unit/integration sync tests over documentation-only clarification.

### Previous Story Intelligence

- Story 17.1 establishes sync time authority rules; keep `base_order_updated_at_ts` separate from `event_at_ts` and `created_at_ts` semantics.

### Project Structure Notes

- If shared contract comments or schema docs are updated, keep them aligned with actual route behavior.

### References

- `_bmad-output/planning-artifacts/epics.md#Story 17.2: Preserve base_order_updated_at_ts as version-marker semantics`
- `apps/api/src/routes/sync/push.ts`
- `apps/api/src/routes/sync/push.test.ts`

## Dev Agent Record

### Agent Model Used

openai/gpt-5.4

### Debug Log References

- Story created from Epic 17 stale-update/version-marker requirements.

### Completion Notes List

- Pending implementation.

### File List

- `apps/api/src/routes/sync/push.ts`
- `apps/api/src/routes/sync/push.test.ts`
