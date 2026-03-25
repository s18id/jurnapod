# Story 18.3b: Add guarded drop migration for redundant `created_at_ts` columns

Status: done

## Story

As a developer,
I want a rerunnable MySQL/MariaDB-safe migration that drops only the redundant `created_at_ts` columns,
so that schema cleanup is operationally safe after Epic 18 write-path and test cleanup.

## Acceptance Criteria

1. A new migration drops only:
   - `pos_order_updates.created_at_ts`
   - `pos_order_snapshots.created_at_ts`
   - `pos_order_snapshot_lines.created_at_ts`
   - `pos_item_cancellations.created_at_ts`
2. The migration uses guarded `information_schema` existence checks before attempting `DROP COLUMN`.
3. The migration is rerunnable/idempotent and compatible with MySQL and MariaDB.
4. Historical migrations are not rewritten.

## Tasks / Subtasks

- [ ] Task 1: Create new guarded drop migration (AC: 1, 2, 3, 4)
  - [ ] Subtask 1.1: Add `packages/db/migrations/0118_story_18_3b_drop_created_at_ts_columns.sql`.
  - [ ] Subtask 1.2: Guard each drop via `information_schema.COLUMNS` checks and dynamic DDL.
  - [ ] Subtask 1.3: Keep scope limited to the four redundant `created_at_ts` columns.
- [ ] Task 2: Smoke validate post-drop schema (AC: 2, 3)
  - [ ] Subtask 2.1: Verify dropped columns no longer exist on dev DB.
  - [ ] Subtask 2.2: Re-run critical sync/service-session/reservation tests after drop.

## Dev Notes

- Story 18.1 and 18.2 cleanup are complete before this migration.
- Story 18.3 ensured `pos_order_updates.created_at` is DB-owned via `DEFAULT CURRENT_TIMESTAMP` before this drop.
- Use guarded dynamic DDL only; do not rewrite `0115_pos_sync_timestamps_unix_ms_columns.sql`.

## Dev Agent Record

### Agent Model Used

openai/gpt-5.4

### Completion Notes List

- Created `0118_story_18_3b_drop_created_at_ts_columns.sql`.
- Applied guarded drop on dev DB and verified all four `created_at_ts` columns are absent.
- Re-ran critical post-drop suites successfully.

### File List

- `packages/db/migrations/0118_story_18_3b_drop_created_at_ts_columns.sql`
