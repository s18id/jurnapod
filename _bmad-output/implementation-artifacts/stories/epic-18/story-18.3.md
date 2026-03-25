# Story 18.3: Prepare `created_at_ts` columns for nullable DEFAULT NULL

Status: done

## Story

As a developer,
I want all redundant `created_at_ts` columns to be nullable with DEFAULT NULL before code stops writing them,
so that Story 18.1 INSERT changes don't break with `ER_NO_DEFAULT_FOR_FIELD`.

## Acceptance Criteria

1. New migration modifies the following columns to allow NULL and have DEFAULT NULL:
   - `pos_order_updates.created_at_ts`
   - `pos_order_snapshots.created_at_ts`
   - `pos_order_snapshot_lines.created_at_ts`
   - `pos_item_cancellations.created_at_ts`
2. New migration ensures `pos_order_updates.created_at` has `DEFAULT CURRENT_TIMESTAMP`.
3. Migration uses `information_schema`-guarded dynamic DDL.
4. Migration is rerunnable/idempotent and compatible with MySQL 8.0+ and MariaDB.
5. Historical migrations are not rewritten.

## Tasks / Subtasks

- [ ] Task 1: Create preparatory nullable migration (AC: 1, 2, 3)
  - [ ] Subtask 1.1: Add new migration `0117_story_18_3_prepare_created_at_ts_nullable.sql`.
  - [ ] Subtask 1.2: Use `information_schema`-guarded dynamic DDL for each column.
  - [ ] Subtask 1.3: Ensure all three columns get `DEFAULT NULL`.
- [ ] Task 2: Smoke test the migration (AC: 3)
  - [ ] Subtask 2.1: Verify migration runs without error on a test DB.
  - [ ] Subtask 2.2: Confirm existing code (pre-18.1) still works after migration.

## Dev Notes

### Developer Context

- This is a **two-part Epic 18.3 migration**. This story (18.3) is the preparatory step that makes the redundant columns nullable with DEFAULT NULL and ensures DB-owned `created_at` defaulting for `pos_order_updates`. The guarded DROP comes after Stories 18.1/18.2 complete (Story 18.3b).
- Existing source migration `0115_pos_sync_timestamps_unix_ms_columns.sql` introduced these columns as `NOT NULL` without DEFAULT. [Source: `packages/db/migrations/0115_pos_sync_timestamps_unix_ms_columns.sql`]
- Repo migration rules require rerunnable/idempotent MySQL/MariaDB-safe DDL using `information_schema` checks. [Source: `AGENTS.md#Database compatibility`, `packages/db/AGENTS.md#Migration review`]
- `pos_order_updates.created_at_ts` is now part of the drop scope.

### Technical Requirements

- Use guarded `MODIFY COLUMN` statements (not `ALTER COLUMN SET DEFAULT NULL` which has MariaDB quirks).
- Each column modification should check `information_schema.COLUMNS` for the column's current state before modifying.
- Do NOT drop the columns — that comes in Story 18.3b after code cleanup.
- Ensure `pos_order_updates.created_at` remains available via `DEFAULT CURRENT_TIMESTAMP` before removing `created_at_ts` writes.

### Architecture Compliance

- This migration must run BEFORE Story 18.1 (code cleanup) so that code changes don't break tests.
- It must also run BEFORE any 18.1/18.2 code changes land in a deployment.

### File Structure Requirements

- New migration: `packages/db/migrations/0117_story_18_3_prepare_created_at_ts_nullable.sql`
- Baseline/schema doc refresh is deferred to Story 18.5.

### Testing Requirements

- Smoke verify the migration doesn't break existing app writes.
- No historical migration edits.

### Previous Story Intelligence

- Code in `syncSnapshotLinesFromSession` (service-sessions.ts) calls INSERT without `created_at_ts` after Story 18.1 changes. Without this preparatory migration, those INSERTs would fail with `ER_NO_DEFAULT_FOR_FIELD`.

### References

- `_bmad-output/planning-artifacts/epics.md#Story 18.3: Add guarded drop migration for redundant snapshot/cancellation created_at_ts columns`
- `_bmad-output/implementation-artifacts/adr-0001-ts-rollout-plan.md`
- `packages/db/migrations/0115_pos_sync_timestamps_unix_ms_columns.sql`
- `packages/db/AGENTS.md`

## Dev Agent Record

### Agent Model Used

minimax-m2.5

### Debug Log References

- Story created from ADR-0001 rollout and migration safety rules.
- Reordered to run before 18.1 due to ER_NO_DEFAULT_FOR_FIELD constraint.

### Completion Notes List

- Created `0117_story_18_3_prepare_created_at_ts_nullable.sql` using guarded dynamic DDL compatible with MySQL/MariaDB.
- Prepared all four redundant `created_at_ts` columns with `DEFAULT NULL` and ensured `pos_order_updates.created_at` uses `DEFAULT CURRENT_TIMESTAMP`.

### File List

- `packages/db/migrations/0117_story_18_3_prepare_created_at_ts_nullable.sql`
