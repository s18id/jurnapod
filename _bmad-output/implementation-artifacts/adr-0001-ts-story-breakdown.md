# ADR-0001 `_ts` Story Breakdown

## Goal

Break ADR-0001 rollout into implementation-ready work items that can be executed in order without violating migration safety.

---

## Epic Summary

**Epic:** Standardize POS/reservation `_ts` semantics and remove low-value snapshot creation epoch duplicates.

**Primary risks:**
- POS sync ordering regressions
- stale update/version regressions
- reservation overlap/query regressions
- destructive migration landing before app/test cleanup

---

## Story 1 — Remove dropped-column references from application and tests

### Objective
Eliminate active code and fixture references to:

- `pos_item_cancellations.created_at_ts`
- `pos_order_snapshot_lines.created_at_ts`
- `pos_order_snapshots.created_at_ts`

### Scope
- `apps/api/src/routes/sync/push.ts`
- `apps/api/src/lib/service-sessions.ts`
- `apps/api/src/lib/service-sessions.test.ts`
- `apps/api/src/lib/reservations.test.ts`
- `apps/api/src/lib/outlet-tables.test.ts`

### Acceptance Criteria
- Snapshot upsert no longer writes `pos_order_snapshots.created_at_ts`
- Session line sync no longer writes `pos_order_snapshot_lines.created_at_ts`
- Cancellation insert no longer writes `pos_item_cancellations.created_at_ts`
- Affected fixtures/tests no longer reference dropped columns
- Repo-wide search confirms no active app/test references remain to dropped columns

### Evidence
- diff of affected write paths
- green targeted test runs from impacted files
- grep output showing cleanup status

### Dependencies
- none; this should be first

---

## Story 2 — Enforce retained `_ts` authority semantics in sync write paths

### Objective
Align retained `_ts` handling with ADR-0001 authority rules.

### Focus fields
- `pos_order_updates.event_at_ts`
- `pos_order_updates.created_at_ts`
- `pos_order_updates.base_order_updated_at_ts`
- `pos_order_snapshots.updated_at_ts`
- `pos_order_snapshot_lines.updated_at_ts`
- `pos_item_cancellations.cancelled_at_ts`

### Acceptance Criteria
- Client-authoritative event-time fields are validated and preserved according to contract
- Server-authoritative `_ts` fields are generated/overwritten server-side
- `base_order_updated_at_ts` remains treated as version marker, not domain event time
- Tests cover malformed input, accepted input, overwrite behavior, and stale-update semantics

### Evidence
- added/updated sync push tests
- notes identifying final authority behavior per retained field

### Dependencies
- Story 1 complete

---

## Story 3 — Prove reservation regression safety

### Objective
Protect canonical reservation boundary behavior while ADR-0001 changes land nearby.

### Focus areas
- overlap rule
- adjacency rule (`end == next start` non-overlap)
- date/window filtering
- timezone resolution order (`outlet -> company`)
- index-friendly query shape

### Acceptance Criteria
- Reservation overlap behavior remains unchanged
- Reservation range/date filtering remains unchanged
- No regression to timezone resolution order
- Query logic continues using canonical boundary timestamp columns directly
- Relevant reservation tests pass

### Evidence
- `reservations.test.ts` coverage/results
- code-review note or assertion on query shape

### Dependencies
- may proceed in parallel with Story 2 after Story 1 cleanup if desired

---

## Story 4 — Create guarded DB migration to drop low-value `created_at_ts` columns

### Objective
Drop the three low-value creation epoch columns safely on MySQL and MariaDB.

### Scope
- add new migration only
- do not edit historical migration `0115_pos_sync_timestamps_unix_ms_columns.sql`

### Acceptance Criteria
- New migration guards existence checks via `information_schema`
- Migration drops only:
  - `pos_item_cancellations.created_at_ts`
  - `pos_order_snapshot_lines.created_at_ts`
  - `pos_order_snapshots.created_at_ts`
- Migration is rerunnable/idempotent
- Migration smoke validation passes

### Evidence
- migration file
- execution output or smoke-validation note

### Dependencies
- Story 1 complete
- Story 2 and Story 3 validation complete

---

## Story 5 — Refresh schema baseline/docs and capture rollout evidence

### Objective
Align repo schema artifacts and docs with the final post-migration state.

### Scope
- `packages/db/0000_version_1.sql`
- `packages/db/migrations/archive/0000_version_1.sql`
- `docs/db/schema.md`
- implementation/completion notes as needed

### Acceptance Criteria
- Baseline schema artifacts no longer show dropped columns
- Schema docs reflect retained vs removed `_ts` columns accurately
- Completion notes capture tests run, migration notes, and touched files

### Evidence
- updated schema/docs files
- final grep/test summary

### Dependencies
- Story 4 complete

---

## Suggested Execution Order

1. Story 1 — cleanup references
2. Story 2 — authority enforcement
3. Story 3 — reservation regression proof
4. Story 4 — guarded migration
5. Story 5 — baseline/doc refresh

---

## Parallelization Notes

- Story 2 and Story 3 may run in parallel after Story 1 if ownership is split.
- Story 4 must wait for Story 1 plus validation confidence from Stories 2/3.
- Story 5 should be last to avoid churn in baseline/schema artifacts.

---

## Definition of Done for This ADR Work

- [ ] Dropped-column app/test references removed
- [ ] Retained `_ts` semantics enforced where required
- [ ] Sync/replay tests pass
- [ ] Reservation regression tests pass
- [ ] Guarded drop migration applied/validated
- [ ] Baseline schema/docs updated
- [ ] Final grep confirms no active references to dropped columns remain

---

## Recommended Start Point

Start with **Story 1**. It has the least ambiguity and is the prerequisite for every safe follow-on step.
