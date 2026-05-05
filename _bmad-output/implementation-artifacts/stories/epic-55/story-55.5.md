# Story 55.5: Harden Recon/Snapshot Critical Test Suites

Status: planned

> ⚠️ **Sprint-Status Append-Only Rule (E45-A1 / E46-A1) — MANDATORY:**
> If this story modifies `_bmad-output/implementation-artifacts/sprint-status.yaml`:
> - **REQUIRED**: Run `npx tsx scripts/update-sprint-status.ts --epic 55 --story 55-5 --status done` (the canonical utility)
> - **REQUIRED**: After editing, run `npx tsx scripts/validate-sprint-status.ts` to confirm file integrity

## Story

As a **QA engineer**,  
I want the **recon/snapshot test suites to cover concurrent and edge case scenarios**,  
So that **regressions in correctness are caught before they reach production**.

## Context

**Scope enforcement:** Story 55.5 MUST NOT introduce new scope. It is exclusively a follow-up closure bucket for:
1. Defects/gaps surfaced by Stories 55.1–55.4
2. Mandatory concurrent simulation tests that prove the E51-A1 fix works under real concurrency

This is the Epic 55 closure story. No new features, no new API endpoints, no schema changes.

### Coverage Audit: What 55.1–55.4 Already Prove

Several ACs in this story are ALREADY covered by prior stories. These MUST NOT be re-tested (DRY):

| 55.5 AC | Covered By | Evidence |
|---------|-----------|----------|
| **AC2** (duplicate auto-trigger) | Story 55.1 — "concurrent auto-snapshot calls produce one snapshot" test | Lines 511–569 of `ap-reconciliation-snapshots.test.ts` — verifies same inputs, same ID returned, 1 row |
| **AC3** (chain integrity parallel writes) | Story 55.3 AC6 — "concurrent manual snapshot creation maintains chain integrity" test | Lines 365–403 of `ap-reconciliation-snapshots.test.ts` — verifies sequential versions, no orphans, exactly 1 CURRENT row |

### Schema Reality: Append-Only Trigger Constraints

The `ap_reconciliation_snapshots` append-only trigger (Migration 0193) blocks all UPDATE paths except `superseded_by_snapshot_id NULL→non-NULL`. Setting `status='ARCHIVED'`, `archived_at`, or `archive_version` via UPDATE is blocked. No archive service method exists. The archive flow gap (from Story 55.3 AC7) is **explicitly deferred** — noted in AC6 with P-level and owner.

### Datetime Standardization (MANDATORY — ADHERED)

All existing tests comply with Canonical Datetime API (Epic 53):
- `Date.now()` used ONLY for unique identifiers (company codes, emails, account names) — NEVER for business dates
- All business dates are fixed YYYY-MM-DD strings (e.g., `"2026-04-19"`)
- `toUtcIso.dateLike()` used for DB timestamp → Z string conversion
- Snapshot service uses ZERO `new Date()` or `Date.now()` calls

55.5 MUST maintain this compliance in all new code.

---

## Test Scenario Review Checkpoint (MANDATORY — E54-A1)

### Pre-Implementation Checklist

- [x] **Happy paths identified:** (1) Concurrent simulation tests pass, (2) All existing tests still pass, (3) 3× consecutive green achieved
- [x] **Error paths identified:** Defects from 55.1–55.4 regression
- [x] **Edge cases identified:** Actual race condition simulation, flaky test elimination, MariaDB compatibility
- [x] **Test fixture needs identified:** Same fixtures as Stories 55.1–55.4
- [x] **Integration test scope defined:** All tests need real DB
- [x] **Negative auth test role selected:** `CASHIER`

### Review Outcome

| Scenario | Type | Coverage Plan |
|----------|------|--------------|
| Actual race: manual snapshot between close commit and auto-trigger | Edge | Integration |
| Duplicate auto-trigger with same inputs | Edge | Integration |
| Chain integrity under parallel snapshot writes | Edge | Integration |
| CSV export correctness vs. compare output | Edge | Integration |
| All tests 3× consecutive green | Happy | Integration |
| Defects from 55.1–55.4 regression test | Error | Integration |

**Sign-off:** Test scenarios reviewed and approved before implementation begins.

---

## Cross-Module Decision Gate (MANDATORY — E54-A1 Follow-Up)

### Pre-Implementation Checklist

- [x] **Modules touched:** `purchasing` (snapshot), `accounting` (reconciliation)
- [x] **Cross-module decisions identified:** None — this is a test-only story
- [x] **Winston sign-off obtained:** N/A
- [x] **Decisions recorded:** N/A

**Hard gate:** No cross-module decisions required.

---

## Acceptance Criteria

**AC1: Actual Race Simulation (E51-A1 Proof)**
**Given** a fiscal year close in progress
**When** a manual snapshot is created in the gap between the close transaction commit and the auto-snapshot trigger
**Then** exactly one auto-snapshot exists for that `as_of_date`
**And** both the manual snapshot path and the auto-snapshot path return the same snapshot ID
**And** no duplicate snapshot rows are created

> **Note:** This AC simulates the REAL race condition, not two concurrent closes. The fiscal close uses `FOR UPDATE` on the fiscal year row, so two concurrent closes serialize. The real race is an independent manual snapshot during the post-close gap.

**AC2: Duplicate Auto-Trigger Idempotency**
**Given** an auto-snapshot already exists for a company and `as_of_date`
**When** the auto-snapshot trigger fires again (e.g., replayed fiscal close)
**Then** the existing snapshot is returned (no new version created)
**And** `inputs_hash` matches (same effective inputs)

**AC3: Chain Integrity Under Parallel Writes**
**Given** two concurrent manual snapshot creation requests for the same `company_id` and `as_of_date`
**When** both complete
**Then** the snapshot version chain is valid (sequential versions, no gaps)
**And** no `(company_id, as_of_date, snapshot_version)` constraint violations occur

**AC4: CSV Export Correctness**
**Given** a comparison between two snapshots
**When** both the `compareAPReconciliationSnapshots` result and the CSV export are inspected
**Then** the CSV content matches the compare result exactly
**And** CSV export for a superseded snapshot includes historical data correctly

**AC5: 3× Consecutive Green**
**Given** all recon/snapshot integration tests
**When** run 3 times consecutively
**Then** all tests pass every time (no flaky tests)

**AC6: Defect Closure**
**Given** all defects/gaps surfaced by Stories 55.1–55.4
**When** this story completes
**Then** every defect is either:
- Fixed with evidence (test + code change), OR
- Explicitly deferred with P-level, owner, and deadline

**AC7: Risk Register Updated**
**Given** the Epic 55 risk register
**When** this story completes
**Then** all risks are either:
- Closed with evidence, OR
- Explicitly deferred with P-level, owner, and deadline

**AC8: Code Review GO**
**Given** all changes in this story
**When** reviewed
**Then** reviewer approves with no blockers

---

## Test Coverage Criteria

- [ ] Coverage target: all edge cases + defect regression
- [ ] Edge cases:
  - [ ] Actual race: manual snapshot during post-close gap
  - [ ] Duplicate auto-trigger (replayed close)
  - [ ] Concurrent manual snapshots
  - [ ] CSV export vs. compare output
  - [ ] 3× consecutive green on all affected suites

## Tasks / Subtasks

- [ ] **Task 1:** Audit existing coverage — AC2, AC3 already covered (note only, no re-test)
- [ ] **Task 2:** Service fix: broaden idempotency guard — remove `previous.autoGenerated` condition (AC1 prerequisite)
- [ ] **Task 3:** Implement AC1 race simulation test: manual snapshot → auto-snapshot → same ID returned
- [ ] **Task 4:** Implement AC4 CSV export correctness test: CSV content matches compare endpoint
- [ ] **Task 5:** Run all recon/snapshot tests 3× consecutive (AC5)
- [ ] **Task 6:** Fix any flaky tests found (AC5)
- [ ] **Task 7:** Defect review — document deferred items from 55.1–55.4 (AC6)
- [ ] **Task 8:** Update risk register (AC7)
- [ ] **Task 9:** Code review request (AC8)

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `packages/modules/purchasing/src/services/ap-reconciliation-snapshot-service.ts` | Modify | Broaden idempotency guard — remove `previous.autoGenerated &&` (1 condition) |
| `apps/api/__test__/integration/purchasing/ap-reconciliation-snapshots.test.ts` | Modify | Add AC1 race simulation test + AC4 CSV-vs-compare correctness test |

**Note:** No separate test file needed (KISS). AC2 and AC3 are already covered by existing tests (DRY). No changes to `ap-reconciliation.test.ts` — CSV export correctness test added to snapshot suite where CSV export already lives.

## Estimated Effort

2 days (including defect fixes from 55.1–55.4)

## Risk Level

Medium — depends on defects found in previous stories

## Dev Notes

### AC1 — Idempotency Guard Fix (Prerequisite)

Current guard at lines 255–264 of `ap-reconciliation-snapshot-service.ts`:
```typescript
// BEFORE: only deduplicates auto→auto
if (isAutoGenerated && previous && previous.autoGenerated && previous.inputsHash === inputsHash) {
  return previous;
}
```
Fix: remove `previous.autoGenerated &&`
```typescript
// AFTER: deduplicates if ANY snapshot has same inputs
if (isAutoGenerated && previous && previous.inputsHash === inputsHash) {
  return previous;
}
```
This prevents redundant auto-snapshots when a manual snapshot already captured the same AP state. The `inputsHash` is a deterministic SHA-256 of the financial inputs, so same inputs → same hash → skip version bump.

### AC1 — Race Simulation Test

Simple sequential simulation (no complex delay logic needed):
1. Create a manual snapshot for `as_of_date` via `createAPReconciliationSnapshot({ autoGenerated: false })`
2. Call auto-snapshot for same `as_of_date` via `createAPReconciliationSnapshot({ autoGenerated: true })`
3. Verify auto-snapshot returns the SAME ID as the manual one
4. Verify exactly 1 row exists for that company+date
5. Verify `superseded_by_snapshot_id` is NULL (only one version)

### AC4 — CSV Export vs Compare Correctness

1. Create v1 and v2 snapshots
2. Call compare endpoint — capture `delta` and `changed_fields`
3. Export v1 and v2 as CSV
4. Verify the CSV numeric fields match compare delta
5. All dates must be fixed YYYY-MM-DD (not `Date.now()`)

### Datetime Standardization (MANDATORY)

- All business dates in new tests MUST be fixed YYYY-MM-DD strings
- `Date.now()` is ONLY allowed for unique identifiers (company codes, emails)
- When reading DB timestamp columns (`created_at`, `changed_at`), use `toUtcIso.dateLike()`
- No `new Date()`, `.toISOString()`, or `vi.useFakeTimers()` for business date logic

### Flaky Test Elimination

- Use fixed timestamps (not `Date.now()`) for business dates in tests
- Ensure DB connections cleaned up in `afterAll`
- 3× green rule: if any test fails even once in 3 runs, it's flaky. Fix it before marking this story done.

## Validation Evidence

```bash
# Run all recon/snapshot tests
npm run test:single -- "apps/api/__test__/integration/purchasing/ap-reconciliation-snapshots.test.ts" -w @jurnapod/api
npm run test:single -- "apps/api/__test__/integration/purchasing/ap-reconciliation.test.ts" -w @jurnapod/api

# Run 3× consecutive
for i in 1 2 3; do
  npm run test:single -- "apps/api/__test__/integration/purchasing/ap-reconciliation-snapshots.test.ts" -w @jurnapod/api
  npm run test:single -- "apps/api/__test__/integration/purchasing/ap-reconciliation.test.ts" -w @jurnapod/api
done

# Epic close gate
npx tsx scripts/validate-sprint-status.ts --epic 55
```

## Dependencies

- Stories 55.1–55.4 completed (defects must be surfaced before they can be fixed)

## Technical Debt Review

- [ ] No shortcuts taken that require follow-up
- [ ] Integration tests included in AC (not deferred)
- [ ] All new debt items added to registry before story closes

## Notes

- This is the Epic 55 closure story. It cannot be marked done until all defects from 55.1–55.4 are resolved.
- The actual race simulation test (AC1) is the crown jewel of this epic — it proves the E51-A1 fix works under the exact conditions that caused the original defect.
- If defects from 55.1–55.4 are too large to fix in this story, they must be explicitly deferred with P-level, owner, and deadline.
