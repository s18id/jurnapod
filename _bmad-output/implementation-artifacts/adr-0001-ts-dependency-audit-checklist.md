# ADR-0001 `_ts` Dependency Audit Checklist

## Purpose

Track all dependency discovery required before implementing ADR-0001:

- remove `pos_item_cancellations.created_at_ts`
- remove `pos_order_snapshot_lines.created_at_ts`
- remove `pos_order_snapshots.created_at_ts`
- preserve retained `_ts` semantics for POS sync and reservations

This checklist is execution-oriented: use it before any destructive migration lands.

---

## Audit Commands

Run from repo root:

```bash
rg -n "created_at_ts" apps packages docs _bmad-output
rg -n "event_at_ts|base_order_updated_at_ts|opened_at_ts|closed_at_ts|reservation_start_ts|reservation_end_ts|cancelled_at_ts|updated_at_ts" apps packages docs
```

---

## Audit Table — Dropped Columns

| Dropped Field | Path | Current Usage | Consumer Type | Action Before Drop | Status |
|---|---|---|---|---|---|
| `pos_order_snapshots.created_at_ts` | `apps/api/src/routes/sync/push.ts:1230-1275` | Snapshot upsert writes `created_at_ts` from `order.updated_at` | API write path / sync ingest | Remove insert column/value; preserve `opened_at_ts`, `closed_at_ts`, `updated_at_ts` | TODO |
| `pos_order_snapshots.created_at_ts` | `apps/api/src/lib/service-sessions.test.ts:751-755` | Test fixture inserts snapshot with `created_at_ts` | Unit test fixture | Update fixture to stop inserting dropped column | TODO |
| `pos_order_snapshots.created_at_ts` | `apps/api/src/lib/service-sessions.test.ts:1321-1324` | Test fixture inserts snapshot with `created_at_ts` | Unit test fixture | Update fixture | TODO |
| `pos_order_snapshots.created_at_ts` | `apps/api/src/lib/reservations.test.ts:201-223` | Test fixture inserts snapshot with `created_at_ts` | Unit test fixture | Update fixture | TODO |
| `pos_order_snapshots.created_at_ts` | `apps/api/src/lib/outlet-tables.test.ts:95-117` | Test fixture inserts snapshot with `created_at_ts` | Unit test fixture | Update fixture | TODO |
| `pos_order_snapshots.created_at_ts` | `packages/db/migrations/0115_pos_sync_timestamps_unix_ms_columns.sql:28-32` | Source migration adds the column | Schema migration history | Leave historical migration intact; add new guarded drop migration | TODO |
| `pos_order_snapshots.created_at_ts` | `packages/db/0000_version_1.sql:1984-2007` | Baseline schema still contains column | Schema baseline | Update baseline dump/schema after migration strategy is settled | TODO |
| `pos_order_snapshot_lines.created_at_ts` | `apps/api/src/lib/service-sessions.ts:1688-1711` | Session close insert writes `created_at_ts` alongside `updated_at_ts` | API write path | Remove insert column/value; keep `updated_at_ts` | TODO |
| `pos_order_snapshot_lines.created_at_ts` | `apps/api/src/routes/sync/push.ts:1286-1313` | Sync push line insert writes `created_at_ts` from `line.updated_at` | API write path / sync ingest | Remove insert column/value; keep `updated_at_ts` | TODO |
| `pos_order_snapshot_lines.created_at_ts` | `packages/db/migrations/0115_pos_sync_timestamps_unix_ms_columns.sql:37-39` | Source migration adds the column | Schema migration history | Leave historical migration intact; add new guarded drop migration | TODO |
| `pos_order_snapshot_lines.created_at_ts` | `packages/db/0000_version_1.sql:1946-1963` | Baseline schema still contains column | Schema baseline | Update baseline dump/schema after migration strategy is settled | TODO |
| `pos_item_cancellations.created_at_ts` | `apps/api/src/routes/sync/push.ts:1442-1458` | Cancellation insert writes `created_at_ts` | API write path / sync ingest | Remove insert column/value; preserve `cancelled_at_ts` | TODO |
| `pos_item_cancellations.created_at_ts` | `packages/db/migrations/0115_pos_sync_timestamps_unix_ms_columns.sql:21-23` | Source migration adds the column | Schema migration history | Leave historical migration intact; add new guarded drop migration | TODO |
| `pos_item_cancellations.created_at_ts` | `packages/db/0000_version_1.sql:1919-1922` | Baseline schema still contains column | Schema baseline | Update baseline dump/schema after migration strategy is settled | TODO |

### Explicit follow-up check

- [ ] Re-run repo-wide search after cleanup and confirm **zero** remaining app/test/report/export/support references to the three dropped columns.

---

## Audit Table — Retained `_ts` Fields Requiring Enforcement Checks

| Retained Field | Path | Expected ADR Semantics | Audit Focus | Status |
|---|---|---|---|---|
| `pos_order_updates.event_at_ts` | `apps/api/src/routes/sync/push.ts:1370-1388` | Client-authoritative event time | Validate payload authority, format, and preservation rules | TODO |
| `pos_order_updates.created_at_ts` | `apps/api/src/routes/sync/push.ts:1370-1388` | Server/ingest ordering time | Confirm whether API overwrites or currently trusts client `created_at`; align to ADR | TODO |
| `pos_order_updates.base_order_updated_at_ts` | `apps/api/src/routes/sync/push.ts:1370-1388` | Derived version marker from base order state | Ensure it is treated as version marker, not business/event time | TODO |
| `pos_order_snapshots.opened_at_ts` | `apps/api/src/routes/sync/push.ts:1230-1275` | State transition time | Confirm canonical source and any fixture assumptions | TODO |
| `pos_order_snapshots.closed_at_ts` | `apps/api/src/routes/sync/push.ts:1230-1275` | State transition time | Confirm null/non-null transition behavior | TODO |
| `pos_order_snapshots.updated_at_ts` | `apps/api/src/routes/sync/push.ts:1230-1275` | Server/application snapshot freshness marker | Confirm write path authority and sync comparisons | TODO |
| `pos_order_snapshot_lines.updated_at_ts` | `apps/api/src/lib/service-sessions.ts:1688-1711`, `apps/api/src/routes/sync/push.ts:1286-1313` | Line-level materialized update time | Confirm no reliance on dropped `created_at_ts` for ordering | TODO |
| `pos_item_cancellations.cancelled_at_ts` | `apps/api/src/routes/sync/push.ts:1442-1458` | Client-authoritative cancellation event time | Validate preserved event time semantics | TODO |
| `reservations.reservation_start_ts` / `reservation_end_ts` | `apps/api/src/lib/reservations.ts:617-658`, `1045-1087`, `1391-1424` | Canonical overlap/range boundaries | Verify overlap logic, date filters, and index-friendly query shape stay unchanged | TODO |

---

## Dependency Categories to Clear Before Migration

### 1. API write paths
- [ ] `apps/api/src/routes/sync/push.ts`
- [ ] `apps/api/src/lib/service-sessions.ts`

### 2. Unit/integration fixtures
- [ ] `apps/api/src/lib/service-sessions.test.ts`
- [ ] `apps/api/src/lib/reservations.test.ts`
- [ ] `apps/api/src/lib/outlet-tables.test.ts`
- [ ] `apps/api/tests/integration/sync-push.integration.test.mjs` (verify no dropped-column assertions)

### 3. Schema artifacts
- [ ] `packages/db/migrations/0115_pos_sync_timestamps_unix_ms_columns.sql` (historical only; do not mutate for rollout)
- [ ] new guarded drop migration to be created
- [ ] `packages/db/0000_version_1.sql`
- [ ] `packages/db/migrations/archive/0000_version_1.sql`
- [ ] `docs/db/schema.md`

### 4. Reporting / export / support / docs
- [ ] confirm no admin/reporting SQL depends on dropped columns
- [ ] confirm no ETL/export/debug script depends on dropped columns
- [ ] confirm no support tooling references dropped columns
- [ ] confirm no public API contract exposes dropped columns

---

## Suggested Rollout Gate

Do **not** author the destructive migration until all items below are true:

- [ ] App write paths no longer reference dropped columns
- [ ] Fixtures/tests no longer reference dropped columns
- [ ] Retained `_ts` authority rules have named owners and target tests
- [ ] Dependency audit shows no reporting/export/support consumer of dropped columns
- [ ] Baseline schema update plan is agreed (`0000_version_1.sql`, archive dump, docs)

---

## Notes from Initial Audit

1. The dropped columns are referenced in active API write paths, not only schema files.
2. `sync/push.ts` currently appears to derive several `_ts` values directly from payload-provided `*_at` values; retained-field authority rules need explicit implementation review before ADR rollout.
3. Reservation boundary timestamps are already deeply wired into overlap and range filtering logic, so they should be treated as regression-critical.

---

## Recommended Next Artifact

Create the **ADR-0001 test matrix** next, using the retained-field audit rows above as the source of truth for:

- client-authoritative event-time tests
- server-authoritative overwrite tests
- stale update / replay ordering tests
- reservation overlap and date-filter regressions
