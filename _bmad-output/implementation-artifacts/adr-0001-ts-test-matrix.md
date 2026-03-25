# ADR-0001 `_ts` Test Matrix

## Purpose

Define the minimum regression and enforcement coverage required to implement ADR-0001 safely.

This matrix assumes:

- dropped columns are removed only after dependency cleanup
- retained `_ts` fields keep their ADR-defined semantics
- POS sync correctness and reservation overlap behavior are release-blocking

---

## Test Priorities

### P0 — Must pass before migration lands
- POS sync ordering / replay semantics
- server-authoritative `_ts` overwrite behavior
- dropped-column cleanup in active write paths
- reservation overlap and range-filter regressions

### P1 — Must pass before story closure
- fixture cleanup for dropped columns
- public/API DTO non-exposure checks for internal `_ts`
- stale update detection around `base_order_updated_at_ts`

### P2 — Nice to add if gaps are discovered
- deeper forensic/debug workflow checks
- support/export smoke checks if any consumer exists

---

## Test Matrix

| ID | Area | Scenario | Expected Result | Suggested Level | Candidate Location |
|---|---|---|---|---|---|
| TC-01 | Dropped columns | Snapshot sync write path no longer inserts `pos_order_snapshots.created_at_ts` | insert/upsert succeeds without dropped column | unit/integration | `apps/api/src/routes/sync/push.test.ts` or integration sync push suite |
| TC-02 | Dropped columns | Session line sync no longer inserts `pos_order_snapshot_lines.created_at_ts` | insert succeeds using only `updated_at_ts` | unit | `apps/api/src/lib/service-sessions.test.ts` |
| TC-03 | Dropped columns | Cancellation insert no longer inserts `pos_item_cancellations.created_at_ts` | insert succeeds using `cancelled_at_ts` only | unit/integration | sync push tests |
| TC-04 | Dropped columns | Repo fixtures no longer reference removed columns | all affected tests run green after fixture cleanup | unit/integration | existing fixture-backed test files |
| TC-05 | Client-authoritative | valid `pos_order_updates.event_at_ts` from offline payload is accepted/preserved | stored event time matches accepted client occurrence time | integration | sync push tests |
| TC-06 | Client-authoritative | malformed or out-of-contract `event_at_ts` / event time input is rejected | request/update result is validation error, no write | integration | sync push tests |
| TC-07 | Client-authoritative | valid `cancelled_at_ts` from client cancellation event is preserved | stored cancellation event time matches accepted payload time | integration | sync push tests |
| TC-08 | Server-authoritative | client attempts to influence server-authoritative `pos_order_updates.created_at_ts` | persisted server ingest value is generated/overwritten server-side per contract | integration | sync push tests |
| TC-09 | Server-authoritative | client attempts to influence `pos_order_snapshots.updated_at_ts` in a path designated server/application-authoritative | persisted value follows server/application rule, not raw client override | unit/integration | sync push/service-session tests |
| TC-10 | Derived marker | `base_order_updated_at_ts` is copied/compared as version marker, not treated as event time | stale update detection uses version semantics correctly | integration | sync push stale-update scenario |
| TC-11 | Replay ordering | duplicate/replayed update with same identity remains idempotent | no duplicate side effects; result remains deterministic | integration | sync push integration suite |
| TC-12 | Deterministic fallback | replay/tie-break behavior does not reinterpret ingest time as domain event time | ordering logic remains deterministic without changing event semantics | integration | sync push integration suite |
| TC-13 | Snapshot freshness | retained `updated_at_ts` fields still support freshness/version checks after dropped-column cleanup | sync comparisons still work | unit/integration | sync push + service session tests |
| TC-14 | Reservation overlap | overlap rule `a_start < b_end && b_start < a_end` is unchanged | overlapping reservations are blocked; adjacent boundaries are allowed | unit | `apps/api/src/lib/reservations.test.ts` |
| TC-15 | Reservation non-overlap edge | `end == next start` remains non-overlap | adjacent reservations are accepted | unit | `apps/api/src/lib/reservations.test.ts` |
| TC-16 | Reservation range filters | date/window filters continue using `reservation_start_ts` / `reservation_end_ts` semantics | same result set as pre-change for canonical rows | unit/integration | reservations tests |
| TC-17 | Reservation timezone behavior | displayed/filter-derived reservation behavior still resolves timezone in outlet -> company order | no UTC fallback regression for missing timezone | unit/integration | reservations tests |
| TC-18 | Query shape | reservation overlap/range queries remain index-friendly and do not wrap canonical boundary columns in SQL functions | query shape preserved per ADR/repo rules | code review + targeted test/assertion | `apps/api/src/lib/reservations.ts` |
| TC-19 | DTO exposure | internal `_ts` fields remain excluded from public response DTOs unless explicitly contracted | API responses do not leak unintended `_ts` fields | integration/contract | relevant route tests |
| TC-20 | Reporting safety | reporting/business date logic does not switch to `_ts` fields | business/reporting tests still use `*_date` semantics | unit/integration | affected reporting tests if present |

---

## Mandatory Existing Test Files to Revisit

### Directly implicated by current audit
- `apps/api/src/lib/service-sessions.test.ts`
- `apps/api/src/lib/reservations.test.ts`
- `apps/api/src/lib/outlet-tables.test.ts`
- `apps/api/tests/integration/sync-push.integration.test.mjs`

### Likely implementation files needing companion coverage
- `apps/api/src/routes/sync/push.ts`
- `apps/api/src/lib/service-sessions.ts`
- `apps/api/src/lib/reservations.ts`

---

## Coverage by ADR Rule

| ADR Concern | Required Tests |
|---|---|
| Dropped low-value `created_at_ts` fields are fully removed | TC-01, TC-02, TC-03, TC-04 |
| Client-authoritative event times are validated/preserved | TC-05, TC-06, TC-07 |
| Server-authoritative machine-time fields are generated/overwritten server-side | TC-08, TC-09 |
| Derived version markers retain stale-update semantics | TC-10 |
| Sync/replay correctness remains intact | TC-11, TC-12, TC-13 |
| Reservation boundary semantics remain canonical | TC-14, TC-15, TC-16, TC-17, TC-18 |
| `_ts` does not leak into public display/reporting misuse | TC-19, TC-20 |

---

## Suggested Execution Order

1. **Fixture cleanup tests first**
   - Remove dropped-column references from test inserts
   - Get local unit tests green

2. **Write-path enforcement tests second**
   - Sync push `_ts` authority semantics
   - Service session snapshot-line behavior

3. **Reservation regression tests third**
   - Overlap / adjacency / date filter / timezone behavior

4. **Final smoke pass before migration**
   - sync push integration
   - targeted reservation tests
   - repo-wide search confirming no dropped-column references remain

---

## Suggested Commands

Run from repo root:

```bash
npm run test:single apps/api/src/lib/service-sessions.test.ts
npm run test:single apps/api/src/lib/reservations.test.ts
npm run test:single apps/api/src/lib/outlet-tables.test.ts
npm run test:unit -w @jurnapod/api
```

If sync push coverage is integration-only in this repo, also run the relevant integration suite used by the existing API test workflow.

---

## Exit Criteria Before Destructive Migration

- [ ] TC-01 through TC-04 pass
- [ ] TC-05 through TC-13 pass
- [ ] TC-14 through TC-18 pass
- [ ] Any impacted public DTO/contract checks for TC-19 pass
- [ ] Reporting/date safety checks for TC-20 pass or are explicitly documented as not impacted
- [ ] Repo-wide search confirms no application/test/report/export/support references remain to dropped columns

---

## Recommended Next Artifact

Create the **ADR-0001 rollout plan** next, sequencing:

1. dependency cleanup
2. authority-rule implementation
3. focused test execution
4. guarded drop migration
5. schema baseline/doc refresh
