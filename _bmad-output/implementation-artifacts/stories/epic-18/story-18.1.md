# Story 18.1: Remove dropped-column references from active write paths

Status: done

## Story

As a developer,
I want application write paths to stop referencing low-value `created_at_ts` columns,
so that schema cleanup can proceed without breaking sync, snapshots, or cancellations.

## Acceptance Criteria

1. Active write paths no longer insert or update:
   - `pos_order_updates.created_at_ts`
   - `pos_order_snapshots.created_at_ts`
   - `pos_order_snapshot_lines.created_at_ts`
   - `pos_item_cancellations.created_at_ts`
2. `created_at` remains server-authoritative via DB defaults, and retained `_ts` fields continue to be written according to their defined semantics.
3. Active write-path tests remain green after cleanup.

## Tasks / Subtasks

- [ ] Task 1: Remove dropped-column writes from sync snapshot/cancellation code (AC: 1, 2)
  - [ ] Subtask 1.1: Update `apps/api/src/routes/sync/push.ts` snapshot upsert SQL and values.
  - [ ] Subtask 1.2: Update snapshot-line insert SQL and values.
  - [ ] Subtask 1.3: Update item-cancellation insert SQL and values.
- [ ] Task 2: Remove dropped-column writes from service-session paths (AC: 1, 2)
  - [ ] Subtask 2.1: Update `apps/api/src/lib/service-sessions.ts` snapshot-line write path.
- [ ] Task 3: Run focused regression checks (AC: 2, 3)
  - [ ] Subtask 3.1: Update affected tests if SQL/value shapes changed.
  - [ ] Subtask 3.2: Confirm retained `_ts` fields still behave correctly.

## Dev Notes

### Developer Context

- The dependency audit already identified active app write paths still referencing all three dropped columns. [Source: `_bmad-output/implementation-artifacts/adr-0001-ts-dependency-audit-checklist.md`]
- `apps/api/src/routes/sync/push.ts` currently writes `created_at_ts` for snapshots, snapshot lines, and cancellations. [Source: `apps/api/src/routes/sync/push.ts`]
- `apps/api/src/lib/service-sessions.ts` also writes snapshot-line `created_at_ts`. [Source: explore summary + audit artifact]

### Technical Requirements

- Remove only the dropped-column writes.
- Preserve retained `_ts` semantics (`opened_at_ts`, `closed_at_ts`, `updated_at_ts`, `cancelled_at_ts`, `event_at_ts`, `base_order_updated_at_ts`).
- Keep sync push idempotency behavior unchanged.
- Use DB-owned `created_at DEFAULT CURRENT_TIMESTAMP` as the single retained ingest-time field.

### Architecture Compliance

- This cleanup must not introduce duplicate creation or ordering regressions in `/sync/push`. [Source: `apps/api/AGENTS.md#POS sync`]

### Library / Framework Requirements

- Reuse helper-based normalization from Epic 16/17 where already established; do not add new timestamp conversion duplication.

### File Structure Requirements

- Implementation files:
  - `apps/api/src/routes/sync/push.ts`
  - `apps/api/src/lib/service-sessions.ts`
- Tests likely affected:
  - `apps/api/src/routes/sync/push.test.ts`
  - `apps/api/src/lib/service-sessions.test.ts`

### Testing Requirements

- Re-run focused sync/service-session tests after removing dropped-column writes.
- Preserve DB pool cleanup hooks in touched DB unit tests.

### Project Structure Notes

- This story is code cleanup only; it should land before destructive migration.

### References

- `_bmad-output/implementation-artifacts/adr-0001-ts-dependency-audit-checklist.md`
- `_bmad-output/planning-artifacts/epics.md#Story 18.1: Remove dropped-column references from active write paths`
- `apps/api/src/routes/sync/push.ts`
- `apps/api/src/lib/service-sessions.ts`

## Dev Agent Record

### Agent Model Used

openai/gpt-5.4

### Debug Log References

- Story created from ADR-0001 dependency audit active-write-path findings.

### Completion Notes List

- Removed active writes for `created_at_ts` from sync push paths.
- Switched retained ingest-time handling to DB-owned `created_at` defaults.
- Verified critical sync integration coverage passes after cleanup.

### File List

- `apps/api/src/routes/sync/push.ts`
- `apps/api/src/lib/service-sessions.ts`
- `apps/api/src/routes/sync/push.test.ts`
- `apps/api/src/lib/service-sessions.test.ts`
