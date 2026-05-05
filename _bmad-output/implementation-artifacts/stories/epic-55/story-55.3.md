# Story 55.3: Validate Snapshot Chain Integrity and Append-Only Guarantees

Status: ready-for-dev

> ⚠️ **Sprint-Status Append-Only Rule (E45-A1 / E46-A1) — MANDATORY:**
> If this story modifies `_bmad-output/implementation-artifacts/sprint-status.yaml`:
> - **REQUIRED**: Run `npx tsx scripts/update-sprint-status.ts --epic 55 --story 55-3 --status done` (the canonical utility)
> - **REQUIRED**: After editing, run `npx tsx scripts/validate-sprint-status.ts` to confirm file integrity

## Story

As an **auditor**,  
I want the **snapshot chain (`superseded_by_snapshot_id`) to be inviolable**,  
So that **historical snapshots remain intact and the audit trail is tamper-proof**.

## Context

Epic 47 established `ap_reconciliation_snapshots` as an append-only table with a `superseded_by_snapshot_id` pointer forming a version chain. Migration 0191 added a trigger to block `UPDATE` and `DELETE`. Epic 55 must prove these guarantees hold under all conditions, including concurrent writes.

**The chain structure:**
- Each snapshot has an optional `superseded_by_snapshot_id` pointing to the next version
- The chain terminates at a snapshot with `status = 'CURRENT'` (no superseder)
- Snapshots are append-only: no `UPDATE` or `DELETE` allowed

**Risk:** Concurrent snapshot creation could create:
- Orphan snapshots (pointing to non-existent IDs)
- Broken chains (two snapshots both claiming to be `CURRENT`)
- Constraint violations (duplicate `(company_id, as_of_date, snapshot_version)`)

**Files involved:**
- `packages/modules/purchasing/src/services/ap-reconciliation-snapshot-service.ts` — chain linking logic
- Database trigger from Migration 0191 — append-only enforcement

---

## Test Scenario Review Checkpoint (MANDATORY — E54-A1)

### Pre-Implementation Checklist

- [x] **Happy paths identified:** (1) Chain with 2 versions, (2) Chain with 3+ versions, (3) Single snapshot (no superseder)
- [x] **Error paths identified:** Attempted UPDATE/DELETE on snapshot, invalid superseder ID
- [x] **Edge cases identified:** Concurrent snapshot creation, chain of 10+ versions, archived snapshot in chain
- [x] **Test fixture needs identified:** Multiple snapshots for same company/date, archived snapshot
- [x] **Integration test scope defined:** All tests need real DB (triggers and constraints are DB-level)
- [x] **Negative auth test role selected:** `CASHIER`

### Review Outcome

| Scenario | Type | Coverage Plan |
|----------|------|--------------|
| Chain with 2 versions: v1 → v2 | Happy | Integration |
| Chain with 3 versions: v1 → v2 → v3 | Happy | Integration |
| Single snapshot (no superseder) | Happy | Integration |
| Concurrent snapshot creation for same date | Edge | Integration |
| Attempted UPDATE on snapshot (trigger blocks) | Edge | Integration |
| Attempted DELETE on snapshot (trigger blocks) | Edge | Integration |
| Chain of 10+ versions | Edge | Integration |
| Archived snapshot in chain | Edge | Integration |
| Orphan snapshot (invalid superseder_id) | Error | Integration |
| Unauthorized role rejected | Error | Integration |

**Sign-off:** Test scenarios reviewed and approved before implementation begins.

---

## Cross-Module Decision Gate (MANDATORY — E54-A1 Follow-Up)

### Pre-Implementation Checklist

- [x] **Modules touched:** `purchasing` (snapshot service)
- [x] **Cross-module decisions identified:** None — this story is confined to purchasing snapshot domain
- [x] **Winston sign-off obtained:** N/A (no cross-module decisions)
- [x] **Decisions recorded:** N/A

**Hard gate:** No cross-module decisions required for this story.

---

## Acceptance Criteria

**AC1: Chain Integrity — 2 Versions**
**Given** snapshot v1 exists for a company and `as_of_date`
**When** snapshot v2 is created for the same company and `as_of_date`
**Then** v1 has `superseded_by_snapshot_id = v2.id`
**And** v2 has `superseded_by_snapshot_id = NULL`
**And** v2 has `status = 'CURRENT'`

**AC2: Chain Integrity — 3+ Versions**
**Given** a chain v1 → v2 for a company and `as_of_date`
**When** snapshot v3 is created
**Then** v2 has `superseded_by_snapshot_id = v3.id`
**And** v1 still has `superseded_by_snapshot_id = v2.id`
**And** v3 has `superseded_by_snapshot_id = NULL` and `status = 'CURRENT'`

**AC3: No Orphan Snapshots**
**Given** any snapshot in the database
**When** its `superseded_by_snapshot_id` is non-NULL
**Then** the referenced snapshot exists

**AC4: Append-Only Trigger Blocks UPDATE**
**Given** an existing snapshot
**When** an `UPDATE` statement attempts to modify any column
**Then** the trigger raises an error
**And** the transaction rolls back

**AC5: Append-Only Trigger Blocks DELETE**
**Given** an existing snapshot
**When** a `DELETE` statement attempts to remove the row
**Then** the trigger raises an error
**And** the transaction rolls back

**AC6: Concurrent Snapshot Creation**
**Given** two concurrent processes create snapshots for the same `company_id` and `as_of_date`
**When** both complete
**Then** the chain is valid (no duplicate `CURRENT` statuses)
**And** no orphan snapshots exist
**And** the `(company_id, as_of_date, snapshot_version)` unique constraint is not violated

**AC7: Archive Flow**
**Given** a snapshot chain with `retention_policy_years` exceeded
**When** the archive process runs
**Then** snapshots are marked `status = 'ARCHIVED'` with `archived_at` set
**And** `archive_version` is populated
**And** the chain remains traversable

**AC8: CSV Export for Superseded Snapshots**
**Given** a superseded snapshot (not `CURRENT`)
**When** CSV export is requested
**Then** the export succeeds with historical data

**AC9: Integration Tests 3× Green**
**Given** the snapshot test suite
**When** run 3 times consecutively
**Then** all tests pass every time

---

## Test Coverage Criteria

- [ ] Coverage target: all chain states + trigger paths
- [ ] Happy paths to test:
  - [ ] Chain with 2 versions
  - [ ] Chain with 3+ versions
  - [ ] Single snapshot
- [ ] Error paths to test:
  - [ ] UPDATE blocked by trigger
  - [ ] DELETE blocked by trigger
  - [ ] Orphan snapshot (invalid superseder)
- [ ] Edge cases:
  - [ ] Concurrent snapshot creation
  - [ ] Chain of 10+ versions
  - [ ] Archived snapshot in chain
  - [ ] CSV export of superseded snapshot

## Tasks / Subtasks

- [ ] **Task 1:** Verify existing chain linking logic in `ap-reconciliation-snapshot-service.ts`
- [ ] **Task 2:** Verify append-only trigger from Migration 0191 is active
- [ ] **Task 3:** Add chain traversal verification test
- [ ] **Task 4:** Add trigger enforcement test (UPDATE/DELETE blocked)
- [ ] **Task 5:** Add concurrent snapshot creation test
- [ ] **Task 6:** Add long-chain test (10+ versions)
- [ ] **Task 7:** Add archive flow test
- [ ] **Task 8:** Add CSV export for superseded snapshot test
- [ ] **Task 9:** Run full suite 3× consecutive
- [ ] **Task 10:** Code review request

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `apps/api/__test__/integration/purchasing/ap-reconciliation-snapshots.test.ts` | Modify | Add chain integrity, trigger, concurrent, archive, CSV tests |

## Estimated Effort

2 days

## Risk Level

Low — verification story, no schema changes

## Dev Notes

- **Trigger verification:** Query `information_schema.TRIGGERS` to confirm the append-only trigger exists and is active.
- **Chain traversal:** Write a helper function that walks `superseded_by_snapshot_id` from oldest to newest. Use this in tests to verify chain integrity.
- **Concurrent test:** Use `Promise.all([createSnapshot(), createSnapshot()])` with the same inputs. The unique constraint + `ON DUPLICATE KEY` from Story 55.1 should prevent duplicates while maintaining chain integrity.
- **Archive test:** Use a snapshot with `retention_policy_years = 0` and a past `created_at` to trigger archive eligibility.

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

- Story 55.1 completed (the `ON DUPLICATE KEY` fix is the foundation for concurrent snapshot safety)

## Technical Debt Review

- [ ] No shortcuts taken that require follow-up
- [ ] Integration tests included in AC (not deferred)

## Notes

- This story heavily depends on Story 55.1's `ON DUPLICATE KEY` fix. If 55.1 changes the snapshot creation logic, verify chain linking is still correct.
- The append-only trigger is the last line of defense. Tests should verify it's active, not just that it's defined in a migration.
