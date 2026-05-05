# Story 55.4: Ensure Complete Audit Trail Provenance for All Snapshots

Status: ready-for-dev

> ⚠️ **Sprint-Status Append-Only Rule (E45-A1 / E46-A1) — MANDATORY:**
> If this story modifies `_bmad-output/implementation-artifacts/sprint-status.yaml`:
> - **REQUIRED**: Run `npx tsx scripts/update-sprint-status.ts --epic 55 --story 55-4 --status done` (the canonical utility)
> - **REQUIRED**: After editing, run `npx tsx scripts/validate-sprint-status.ts` to confirm file integrity

## Story

As an **auditor**,  
I want **every snapshot to have a complete audit trail entry**,  
So that **I can trace the provenance of any snapshot back to its creation event, user, and trigger**.

## Context

Epic 47 created `ap_reconciliation_audit_trail` to track snapshot lifecycle events. However, there's no formal proof that:
1. Every snapshot row has at least one audit trail row
2. Auto-generated snapshots have correct audit entries
3. Manual snapshots are correctly tagged with the creating user
4. Superseded chain is proven by the bidirectional pointer (snapshot table `superseded_by_snapshot_id` + audit table `previous_snapshot_id`)
5. Audit trail failure doesn't destroy the snapshot

### Schema Reality Check

The `ap_reconciliation_audit_trail` table uses these real columns:

| Column | Values | Notes |
|--------|--------|-------|
| `action_type` | `'CREATED'` (first), `'RECALCULATED'` (subsequent) | **NOT** `SNAPSHOT_CREATED` |
| `previous_snapshot_id` | `NULL` or prior snapshot ID | Links the chain |
| `change_reason` | `"period_close_auto_snapshot"`, `"manual_snapshot"`, or custom | Indicates auto vs manual |
| `change_summary` | JSON `{ before, after, changed_fields }` | Contains the diff |
| `changed_by` | `createdBy` user ID | Always populated |
| `metadata` | JSON `{ as_of_date, account_source, configured_account_ids }` | Context |

There is **no** separate `SNAPSHOT_SUPERSEDED` action_type. The supersession chain is implicit:
- The superseded snapshot has `superseded_by_snapshot_id` pointing to the new version (on the snapshot table)
- The new snapshot's audit entry has `previous_snapshot_id` pointing back to the old version (on the audit table)
- Together these form a bidirectional verification

This story closes those gaps by adding integration tests and one service fix (non-fatal audit trail failure).

**Files involved:**
- `packages/modules/purchasing/src/services/ap-reconciliation-snapshot-service.ts` — audit trail creation logic

---

## Test Scenario Review Checkpoint (MANDATORY — E54-A1)

### Pre-Implementation Checklist

- [x] **Happy paths identified:** (1) Auto-snapshot has audit entry, (2) Manual snapshot has audit entry, (3) Superseded snapshot has supersede audit entry
- [x] **Error paths identified:** Audit trail creation failure (should be non-fatal), missing audit entry for existing snapshot
- [x] **Edge cases identified:** Snapshot created before audit trail existed (backfill), audit trail for archived snapshot
- [x] **Test fixture needs identified:** Snapshots with known provenance, users with different roles
- [x] **Integration test scope defined:** All tests need real DB
- [x] **Negative auth test role selected:** `CASHIER`

### Review Outcome

| Scenario | Type | Coverage Plan |
|----------|------|--------------|
| Auto-snapshot has audit trail entry | Happy | Integration |
| Manual snapshot has audit trail entry | Happy | Integration |
| Superseded snapshot has `SNAPSHOT_SUPERSEDED` entry | Happy | Integration |
| Full provenance query: snapshot → audit → user → fiscal year | Happy | Integration |
| Audit trail creation failure is non-fatal | Error | Integration |
| Snapshot without audit trail (backfill detection) | Error | Integration |
| Unauthorized role rejected | Error | Integration |

**Sign-off:** Test scenarios reviewed and approved before implementation begins.

---

## Cross-Module Decision Gate (MANDATORY — E54-A1 Follow-Up)

### Pre-Implementation Checklist

- [x] **Modules touched:** `purchasing` (snapshot + audit services)
- [x] **Cross-module decisions identified:** None — confined to purchasing domain
- [x] **Winston sign-off obtained:** N/A
- [x] **Decisions recorded:** N/A

**Hard gate:** No cross-module decisions required.

---

## Acceptance Criteria

**AC1: Every Snapshot Has Audit Trail**
**Given** all snapshots in the database
**When** queried for audit trail entries
**Then** every snapshot has at least one corresponding `ap_reconciliation_audit_trail` row

**AC2: Auto-Generated Snapshot Audit Entry**
**Given** an auto-generated snapshot (from fiscal year close)
**When** its audit trail is inspected
**Then** `action_type = 'CREATED'`
**And** the snapshot's `auto_generated` field is `true`
**And** `change_reason` contains `"period_close_auto_snapshot"`
**And** `changed_by` is populated with the creating user

**AC3: Manual Snapshot Audit Entry**
**Given** a manually-triggered snapshot
**When** its audit trail is inspected
**Then** `action_type = 'CREATED'`
**And** the snapshot's `auto_generated` field is `false`
**And** `change_reason` contains `"manual_snapshot"`
**And** `changed_by` references the user who triggered it

**AC4: Superseded Snapshot Chain Entry**
**Given** a snapshot that has been superseded by a newer version
**When** the chain is inspected on both tables
**Then** the old snapshot has `superseded_by_snapshot_id` pointing to the new version
**And** the new snapshot's audit entry has `action_type = 'RECALCULATED'`
**And** the new snapshot's audit entry has `previous_snapshot_id` pointing to the old version
**And** `change_summary.changed_fields` includes the changed fields

**AC5: Full Provenance Query**
**Given** any snapshot ID
**When** the provenance query is executed
**Then** it returns: snapshot → audit trail → user (via `changed_by`)
**And** the chain is complete (no missing links)
**And** for auto-generated snapshots, the `change_reason` indicates the trigger

**AC6: Audit Trail Creation Failure Is Non-Fatal**
**Given** a snapshot creation succeeds but audit trail creation fails
**When** the operation completes
**Then** the snapshot is preserved (NOT rolled back)
**And** the audit token row count is logged as a warning
**And** the operation returns the snapshot without error
**Note:** Currently the audit trail INSERT and snapshot INSERT are in the same transaction. AC6 requires wrapping the audit INSERT in a `try/catch` so a failure does not propagate.

**AC7: Backfill Detection**
**Given** existing snapshots created before this story's implementation
**When** the backfill check runs
**Then** any snapshot without an audit trail entry is flagged
**And** the count is reported (not auto-fixed — manual review required)

**AC8: Integration Tests 3× Green**
**Given** the audit trail test suite
**When** run 3 times consecutively
**Then** all tests pass every time

---

## Test Coverage Criteria

- [ ] Coverage target: all audit trail paths
- [ ] Happy paths to test:
  - [ ] Auto-snapshot audit entry
  - [ ] Manual snapshot audit entry
  - [ ] Superseded snapshot audit entry
  - [ ] Full provenance query
- [ ] Error paths to test:
  - [ ] Audit trail creation failure (non-fatal)
  - [ ] Snapshot without audit trail (backfill detection)
- [ ] Edge cases:
  - [ ] Archived snapshot audit trail
  - [ ] Concurrent snapshot + audit trail creation

## Tasks / Subtasks

- [ ] **Task 1:** Wrap audit trail INSERT in `try/catch` for non-fatal failure (AC6) — snapshot service
- [ ] **Task 2:** Add AC1 test — every snapshot has ≥1 audit trail row (LEFT JOIN)
- [ ] **Task 3:** Add AC2 test — auto-generated snapshot audit entry matches real schema
- [ ] **Task 4:** Add AC3 test — manual snapshot audit entry matches real schema
- [ ] **Task 5:** Add AC4 test — superseded chain proven by bidirectional pointers
- [ ] **Task 6:** Add AC5 test — provenance query (snapshot → audit → user JOIN)
- [ ] **Task 7:** Add AC7 test — backfill detection query (LEFT JOIN WHERE audit.id IS NULL)
- [ ] **Task 8:** Run full suite 3× consecutive (AC8)
- [ ] **Task 9:** Code review request

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `packages/modules/purchasing/src/services/ap-reconciliation-snapshot-service.ts` | Modify | Wrap audit INSERT in `try/catch` for non-fatal failure (AC6) |
| `apps/api/__test__/integration/purchasing/ap-reconciliation-snapshots.test.ts` | Modify | Add audit trail completeness tests (AC1-AC5, AC7) |

**Note:** No `ap-reconciliation-audit-service.ts` file exists — no service-level query is needed. The provenance query (AC5) and backfill detection (AC7) will be tested via inline SQL queries in the test file.

## Estimated Effort

2 days

## Risk Level

Low — no schema changes. One service code change: wrap audit INSERT in `try/catch` (AC6). All existing tests must continue passing unchanged.

## Dev Notes

- **Non-fatal audit failure (AC6):** Wrap the audit trail INSERT in `try/catch`. Log the error with `console.warn()` but don't re-throw. The snapshot is the primary data; the audit trail is observability. Example:
  ```typescript
  try {
    await sql`INSERT INTO ap_reconciliation_audit_trail (...) VALUES (...)`.execute(trx);
  } catch (auditError) {
    console.warn(`Audit trail creation failed for snapshot ${insertedSnapshotId}:`, auditError);
    // Non-fatal — snapshot is preserved
  }
  ```
- **Backfill detection (AC7):** This is a read-only check. Do NOT auto-fix — flag for manual review. Query:
  ```sql
  SELECT s.id, s.company_id, s.as_of_date, s.snapshot_version
  FROM ap_reconciliation_snapshots s
  LEFT JOIN ap_reconciliation_audit_trail a ON a.snapshot_id = s.id
  WHERE a.id IS NULL;
  ```
- **Provenance query (AC5):** The real schema uses `changed_by` on audit trail to reference users. No direct fiscal year event link exists. The query should JOIN `snapshots → audit_trail (via snapshot_id) → users (via changed_by)`.

## Validation Evidence

```bash
# Run snapshot test suite
npm run test:single -- "apps/api/__test__/integration/purchasing/ap-reconciliation-snapshots.test.ts" -w @jurnapod/api

# Run 3× consecutive
for i in 1 2 3; do
  npm run test:single -- "apps/api/__test__/integration/purchasing/ap-reconciliation-snapshots.test.ts" -w @jurnapod/api
done
```

## Dependencies

- Story 55.1 completed (audit trail must reflect the idempotent insert behavior)
- Story 55.3 completed (superseded snapshot audit entries depend on chain integrity)

## Technical Debt Review

- [ ] No shortcuts taken that require follow-up
- [ ] Integration tests included in AC (not deferred)

## Notes

- Audit trail completeness is a compliance requirement. Any gaps found during this story should be treated as P1 defects.
- The backfill detection query is intentionally read-only. Do not write a backfill migration in this story — that's a separate concern.
