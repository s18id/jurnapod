# Story 17.1: Enforce `_ts` authority rules in sync update ingestion

Status: ready-for-dev

## Story

As a developer,
I want sync update ingestion to distinguish client-authoritative event time from server-authoritative ingest time,
so that offline replay and ordering remain deterministic without conflating occurrence time and persistence time.

## Acceptance Criteria

1. Client-authoritative event time is validated and preserved according to contract when sync updates are ingested.
2. Server-authoritative ingest time is generated or overwritten server-side.
3. `pos_order_updates.created_at_ts` remains ingest/order metadata and not domain event occurrence time.
4. Sync tests cover accepted input, rejected malformed input, and server overwrite behavior.

## Tasks / Subtasks

- [ ] Task 1: Define authority handling in sync update ingestion (AC: 1, 2, 3)
  - [ ] Subtask 1.1: Audit `OrderUpdate` payload handling in `apps/api/src/routes/sync/push.ts`.
  - [ ] Subtask 1.2: Separate client-authoritative event-time handling from server ingest metadata.
- [ ] Task 2: Implement server-authoritative ingest-time behavior (AC: 2, 3)
  - [ ] Subtask 2.1: Ensure persisted `created_at_ts` semantics are server-owned.
  - [ ] Subtask 2.2: Avoid treating payload `created_at` as domain event truth.
- [ ] Task 3: Add validation and regression coverage (AC: 1, 4)
  - [ ] Subtask 3.1: Add sync push tests for valid and malformed event-time payloads.
  - [ ] Subtask 3.2: Add tests proving server overwrite/generation for ingest time.

## Dev Notes

### Developer Context

- `apps/api/src/routes/sync/push.ts` currently inserts `event_at_ts` from `update.event_at` and `created_at_ts` from `update.created_at`, which risks conflating client occurrence time with server ingest time. [Source: `apps/api/src/routes/sync/push.ts`]
- Epic 17 must preserve offline-first semantics and idempotent sync behavior. [Source: `docs/project-context.md#Architecture Principles`]

### Technical Requirements

- Keep `event_at_ts` as client-authoritative event time where contract allows.
- Treat `created_at_ts` as server ingest/order metadata.
- Do not break explicit sync outcomes (`OK`, `DUPLICATE`, `ERROR`).

### Architecture Compliance

- `/sync/push` is high scrutiny: avoid duplicate creation, auth bypass, and tenant leakage. [Source: `apps/api/AGENTS.md#POS sync`]
- Maintain tenant scoping on all persisted update paths.

### Library / Framework Requirements

- Reuse `date-helpers` from Epic 16 for normalization where possible.
- Keep schema validation aligned with `packages/shared/src/schemas/pos-sync.ts` if payload shape changes are needed.

### File Structure Requirements

- Implementation files:
  - `apps/api/src/routes/sync/push.ts`
  - `packages/shared/src/schemas/pos-sync.ts` (if contract updates are required)
- Tests:
  - `apps/api/src/routes/sync/push.test.ts`
  - `apps/api/tests/integration/sync-push.integration.test.mjs` if integration coverage is needed

### Testing Requirements

- Cover malformed input, accepted input, and server-owned ingest-time behavior.
- Preserve idempotency and company/outlet scoping assertions.

### Project Structure Notes

- Keep authority logic close to sync ingestion; do not duplicate timestamp rules in multiple route branches.

### References

- `_bmad-output/planning-artifacts/epics.md#Story 17.1: Enforce _ts authority rules in sync update ingestion`
- `apps/api/src/routes/sync/push.ts`
- `packages/shared/src/schemas/pos-sync.ts`
- `docs/project-context.md`

## Dev Agent Record

### Agent Model Used

openai/gpt-5.4

### Debug Log References

- Story created from Epic 17 authority-rule requirements for sync updates.

### Completion Notes List

- Pending implementation.

### File List

- `apps/api/src/routes/sync/push.ts`
- `packages/shared/src/schemas/pos-sync.ts`
- `apps/api/src/routes/sync/push.test.ts`
