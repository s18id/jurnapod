# Story 18.3: Add guarded drop migration for redundant `created_at_ts` columns

Status: ready-for-dev

## Story

As a developer,
I want a rerunnable MySQL/MariaDB-safe migration that drops only the redundant columns,
so that schema cleanup is operationally safe.

## Acceptance Criteria

1. A new migration drops only:
   - `pos_order_snapshots.created_at_ts`
   - `pos_order_snapshot_lines.created_at_ts`
   - `pos_item_cancellations.created_at_ts`
2. The migration uses guarded `information_schema` existence checks before attempting `DROP COLUMN`.
3. The migration is rerunnable/idempotent and compatible with MySQL and MariaDB.
4. Historical migrations are not rewritten.

## Tasks / Subtasks

- [ ] Task 1: Create a new guarded drop migration (AC: 1, 2, 3, 4)
  - [ ] Subtask 1.1: Add a new SQL migration under `packages/db/migrations/`.
  - [ ] Subtask 1.2: Use `information_schema`-guarded dynamic DDL for each drop.
  - [ ] Subtask 1.3: Ensure only the three low-value columns are dropped.
- [ ] Task 2: Validate migration safety assumptions (AC: 2, 3)
  - [ ] Subtask 2.1: Confirm app/test references were removed first (Stories 18.1/18.2).
  - [ ] Subtask 2.2: Review for MySQL/MariaDB portability.
- [ ] Task 3: Add migration execution/smoke notes (AC: 3)
  - [ ] Subtask 3.1: Record expected smoke verification steps.

## Dev Notes

### Developer Context

- Existing source migration `0115_pos_sync_timestamps_unix_ms_columns.sql` introduced these columns and must remain historical record, not be edited. [Source: `packages/db/migrations/0115_pos_sync_timestamps_unix_ms_columns.sql`]
- Repo migration rules require rerunnable/idempotent MySQL/MariaDB-safe DDL using `information_schema` checks. [Source: `AGENTS.md#Database compatibility`, `packages/db/AGENTS.md#Migration review`]

### Technical Requirements

- Do not use non-portable `DROP COLUMN IF EXISTS` shortcuts unless confirmed compatible across supported engines/versions.
- Drop only the three targeted columns.
- Assume destructive rollback is not safe; prefer forward-fix posture.

### Architecture Compliance

- This migration comes after app/test cleanup and focused validation, not before.

### File Structure Requirements

- New migration: `packages/db/migrations/<next-sequence>_*.sql`
- Baseline/schema doc refresh is explicitly deferred to Story 18.5.

### Testing Requirements

- Migration smoke verification should be documented.
- No historical migration edits.

### Previous Story Intelligence

- Story 18.1 and 18.2 are prerequisites so the schema drop does not break live code/tests.

### Project Structure Notes

- Keep the migration narrowly scoped and operationally boring.

### References

- `_bmad-output/planning-artifacts/epics.md#Story 18.3: Add guarded drop migration for redundant created_at_ts columns`
- `_bmad-output/implementation-artifacts/adr-0001-ts-rollout-plan.md`
- `packages/db/migrations/0115_pos_sync_timestamps_unix_ms_columns.sql`
- `packages/db/AGENTS.md`

## Dev Agent Record

### Agent Model Used

openai/gpt-5.4

### Debug Log References

- Story created from ADR-0001 rollout and migration safety rules.

### Completion Notes List

- Pending implementation.

### File List

- `packages/db/migrations/<next-sequence>_*.sql`
