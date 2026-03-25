# ADR-0001 `_ts` Rollout Plan

## Goal

Implement ADR-0001 safely by:

1. removing redundant `created_at_ts` columns
2. preserving retained `_ts` semantics for POS sync and reservations
3. proving safety with targeted tests before any destructive migration

---

## Scope

### Dropped columns
- `pos_order_updates.created_at_ts`
- `pos_item_cancellations.created_at_ts`
- `pos_order_snapshot_lines.created_at_ts`
- `pos_order_snapshots.created_at_ts`

### Retained semantics requiring enforcement
- `pos_order_updates.event_at_ts`
- `pos_order_updates.base_order_updated_at_ts`
- `pos_order_snapshots.opened_at_ts`
- `pos_order_snapshots.closed_at_ts`
- `pos_order_snapshots.updated_at_ts`
- `pos_order_snapshot_lines.updated_at_ts`
- `pos_item_cancellations.cancelled_at_ts`
- `reservations.reservation_start_ts`
- `reservations.reservation_end_ts`

---

## Rollout Strategy

Use a **code-first, migration-last** sequence.

Important: ADR-0001 removes redundant `created_at_ts` duplicates and uses DB-owned `created_at DEFAULT CURRENT_TIMESTAMP` as the retained ingest-time field where needed.

Do not drop columns until:

- app write paths no longer reference them
- fixtures/tests no longer reference them
- retained-field authority rules are implemented or explicitly confirmed
- focused regression tests pass

---

## Phase 1 — Dependency Cleanup

### Objective
Remove all application and test references to the dropped columns.

### Target files from current audit
- `apps/api/src/routes/sync/push.ts`
- `apps/api/src/lib/service-sessions.ts`
- `apps/api/src/lib/service-sessions.test.ts`
- `apps/api/src/lib/reservations.test.ts`
- `apps/api/src/lib/outlet-tables.test.ts`

### Tasks
- Remove `created_at_ts` from snapshot upsert SQL and values
- Remove `created_at_ts` from snapshot-line insert SQL and values
- Remove `created_at_ts` from item-cancellation insert SQL and values
- Remove `created_at_ts` from order-update insert SQL and values
- Remove dropped-column usage from unit/integration fixtures
- Re-run repo-wide search for dropped columns
- Ensure `pos_order_updates.created_at` has `DEFAULT CURRENT_TIMESTAMP` before removing its `created_at_ts` writes.

### Exit gate
- `rg -n "pos_item_cancellations\.created_at_ts|pos_order_snapshot_lines\.created_at_ts|pos_order_snapshots\.created_at_ts" apps packages docs _bmad-output` returns only historical schema/docs locations intentionally kept until final cleanup

---

## Phase 2 — Authority Rule Hardening

### Objective
Align retained `_ts` fields with ADR semantics.

### Required checks

#### Client-authoritative
- `pos_order_updates.event_at_ts`
- `pos_item_cancellations.cancelled_at_ts`
- reservation boundary timestamps where applicable from booking flows

#### Server-authoritative
- `pos_order_updates.created_at`
- `pos_order_snapshots.updated_at_ts`
- `pos_order_snapshot_lines.updated_at_ts`

#### Derived marker
- `pos_order_updates.base_order_updated_at_ts`

### Tasks
- Validate allowed client-supplied event times
- Reject malformed/out-of-contract event time inputs
- Overwrite or generate server-authoritative `_ts` values server-side
- Confirm `base_order_updated_at_ts` remains a version marker, not event time
- Verify snapshot transition timestamps (`opened_at_ts`, `closed_at_ts`) remain semantically correct

### Exit gate
- targeted tests for TC-05 through TC-13 pass

---

## Phase 3 — Focused Regression Validation

### Objective
Prove there is no sync or reservation regression before schema drop.

### Required coverage

#### Sync / POS
- idempotent replay behavior
- stale update detection
- deterministic ordering fallback
- snapshot freshness comparisons

#### Reservations
- overlap rule unchanged
- `end == next start` remains non-overlap
- date/window filters unchanged
- timezone resolution remains outlet -> company
- query shape stays index-friendly

### Suggested commands
Run from repo root:

```bash
npm run test:single apps/api/src/lib/service-sessions.test.ts
npm run test:single apps/api/src/lib/reservations.test.ts
npm run test:single apps/api/src/lib/outlet-tables.test.ts
npm run test:unit -w @jurnapod/api
```

Add sync integration command(s) used by the repo’s existing API test workflow if sync push coverage is not fully present in unit tests.

### Exit gate
- all P0 tests from `adr-0001-ts-test-matrix.md` pass

---

## Phase 4 — Guarded Drop Migration

### Objective
Drop the redundant `created_at_ts` columns safely for MySQL and MariaDB.

### Migration requirements
- new migration only; do not rewrite historical migration `0115_pos_sync_timestamps_unix_ms_columns.sql`
- idempotent / rerunnable
- compatible with MySQL 8+ and MariaDB
- use guarded `information_schema` existence checks before `ALTER TABLE ... DROP COLUMN`

### Columns to drop
- `pos_order_updates.created_at_ts`
- `pos_item_cancellations.created_at_ts`
- `pos_order_snapshot_lines.created_at_ts`
- `pos_order_snapshots.created_at_ts`

### Operational rule
If dependency audit discovers any external/reporting/support consumer late, stop here and switch to deprecate-first rollout.

### Exit gate
- migration runs successfully on supported DB engines
- post-migration smoke tests pass

---

## Phase 5 — Baseline and Documentation Refresh

### Objective
Keep schema artifacts aligned after migration lands.

### Target artifacts
- `packages/db/0000_version_1.sql`
- `packages/db/migrations/archive/0000_version_1.sql`
- `docs/db/schema.md`
- any ADR-linked implementation notes if needed

### Tasks
- remove dropped columns from current schema baseline artifacts
- refresh schema docs
- keep historical migrations unchanged
- record rollout evidence in implementation notes/story completion notes

### Exit gate
- schema docs and baseline dumps match live intended schema

---

## Rollback / Fallback Strategy

### Before migration
Safe to iterate normally on application/test cleanup.

### If issues are found during Phase 2 or 3
- stop rollout
- keep columns in place
- document failing semantic case
- add/adjust tests before resuming

### If late dependency is found before migration
- switch to two-step deprecation plan:
  1. mark internal usage deprecated in code/docs
  2. remove consumer references
  3. drop in later migration

### If migration is applied and regression appears
- halt deployment progression
- use forward-fix migration or restore-compatible app code path
- do not rely on destructive rollback assumptions for MySQL-family DDL

---

## Ownership Suggestions

| Workstream | Suggested Owner |
|---|---|
| App write-path cleanup | API/dev |
| `_ts` authority enforcement | API/dev + architecture review |
| Reservation regression coverage | API/dev + QA |
| Migration authoring | DB/dev |
| Baseline/doc refresh | DB/dev + tech writer |

---

## Release Gates Summary

### Gate A — Cleanup complete
- [ ] dropped-column references removed from active code/tests

### Gate B — Semantics enforced
- [ ] retained `_ts` authority rules verified by tests

### Gate C — Regression safe
- [ ] sync and reservation tests pass

### Gate D — Migration safe
- [ ] guarded drop migration reviewed and executed successfully

### Gate E — Artifacts aligned
- [ ] baseline schema/docs refreshed

---

## Recommended Next Artifact

Create the **story breakdown** next so implementation can be tracked as discrete work items:

1. dependency audit + cleanup
2. `_ts` authority enforcement
3. guarded migration
4. regression validation + documentation
