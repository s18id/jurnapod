# Story 57.1: AR Snapshot/Archive Trigger Compatibility Verification

**Status:** planned

> ⚠️ **Sprint-Status Append-Only Rule (E45-A1 / E46-A1) — MANDATORY:**
> If this story modifies `_bmad-output/implementation-artifacts/sprint-status.yaml`:
> - **REQUIRED**: Run `npx tsx scripts/update-sprint-status.ts --epic 57 --story 57-1 --status done` (the canonical utility)
> - **REQUIRED**: After editing, run `npx tsx scripts/validate-sprint-status.ts` to confirm file integrity
> - **NEVER** replace the entire file — always append only

---

## Story

As a **senior engineer**,  
I want **trigger 0201 to operate correctly for AR snapshot rows on the shared `ap_reconciliation_snapshots` table**,  
So that **Stories 57.2–57.4 can proceed with AR write-path correctness without trigger-induced regressions**.

---

## Context

**Source:** Epic 57 kickoff; Epic 56 Story 56.1 (archive flow trigger resolution)

**Background:** Trigger 0201 (Migration `0201_allow_archive_path.sql`) was created during Epic 56 to allow `status='ARCHIVED'` transitions on `ap_reconciliation_snapshots`. The trigger operates on the same table for both AP and AR snapshot rows.

AR correctness (Stories 57.2–57.4) shares the `ap_reconciliation_snapshots` table with AP. Before AR invoice/payment/credit/void work begins, this story verifies trigger 0201 does not block AR snapshot paths.

**Predecessor evidence:**
- Story 56.1 AC2: `status='ARCHIVED'` transition allowed for AP
- Story 56.1 AC6: 24/24 AP snapshot tests pass
- Story 56.2: CI lint gate (`npm run lint:migrations`) exits 0

**Key question this story answers:** Does trigger 0201 allow AR rows to be archived, or does some AR-specific column or state block the archive path?

---

## Test Scenario Review Checkpoint (MANDATORY — E54-A1)

### Pre-Implementation Checklist

- [ ] **Happy paths identified:** AR snapshot creation, AR archive transition
- [ ] **Error paths identified:** Non-archive UPDATE blocked (immutability), AR company isolation
- [ ] **Edge cases identified:** AR archive of already-archived snapshot (no-op), AR vs AP row co-existence in same table
- [ ] **Test fixture needs identified:** AR company row, AR snapshot row with `status='ACTIVE'` (AR snapshot rows use `status='ACTIVE'` — POSTED is an invoice status, not a snapshot status)
- [ ] Existing canonical fixtures reviewed: `createTestCompanyMinimal` (company only; no customer needed for trigger test)
- [ ] Fixture approach: No owner-package fixture files created for 57.1. Test setup uses direct Kysely INSERT on `ap_reconciliation_snapshots` to isolate trigger validation from service-layer logic.

> **Rationale:** Trigger behavior must be verified with direct DB operations. Service-layer fixture helpers (if any exist) are not used here because this story proves the trigger condition itself — not business invariants enforced by application code. Direct Kysely setup is the appropriate tool for DB-level trigger testing.
>
> **Partial Fixture Mode (Exception):** scope=trigger-validation-only, rationale=trigger behavior requires direct DB state not achievable via service-layer fixtures, owner=epic-57-implementation.

### Fixture Creation/Update
- [ ] **New fixtures needed:** None (no owner-package fixture files for 57.1)
- [ ] **Test setup method:** Direct Kysely INSERT of AR company row + AR snapshot row (`status='ACTIVE'`) in each test before block; cleanup via `resetFixtureRegistry()`
- [ ] **Existing fixtures to update:** None

### Test File Audit (Post-Implementation - MANDATORY)
- [ ] All tests use direct Kysely for trigger path setup (not service-layer fixture helpers)
- [ ] Teardown uses `cleanupTestFixtures()` and `resetFixtureRegistry()`
- [ ] Review existing `ap-reconciliation-snapshots.test.ts` for AP-specific fixture patterns (for reference only; do not modify)
- [ ] Write integration tests for AC1–AC8 (real DB required — trigger behavior only)
- [ ] Verify `npm run lint:migrations` exits 0
- [ ] Run `npm run lint -w @jurnapod/api` and `npm run typecheck -w @jurnapod/api` — both pass
- [ ] Code review with no P0/P1 blockers

---

## Files to Create

| File | Description |
|------|-------------|
| `apps/api/__test__/integration/sales/ar-snapshot-trigger-compatibility.test.ts` | Integration tests for AR trigger compatibility (DB-level ACs only) |

**Note:** No owner-package fixture files needed for 57.1. Tests use direct Kysely operations on `ap_reconciliation_snapshots` to isolate trigger validation from service-layer logic. This approach is intentional and appropriate for DB-level trigger verification.

---

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| None | — | No modifications required for this story |

---

## Estimated Effort

0.5 day (DB-level trigger test; no fixture creation, no service-layer code)

## Risk Level

Medium (P1 — blocking story; must pass before 57.2–57.4 can proceed safely)

## Dev Notes

- **Trigger 0201 scope:** The trigger's `IF NOT (...)` condition allows:
  1. `NEW.status = 'ARCHIVED'` — archive path (allowed)
  2. `OLD.superseded_by_snapshot_id IS NULL AND NEW.superseded_by_snapshot_id IS NOT NULL` — supersession chain (allowed)
  - Everything else is blocked (`SIGNAL SQLSTATE '45000'`)
- **AR company isolation:** Trigger does not enforce `company_id` scoping at DB level. Application code must include `company_id` filter in all queries — this is verified in AC6.
- **No new migration:** 57.1 does NOT create migrations. Trigger 0201 operates on the shared table; AR-specific behavior is a query/application concern.
- **Service-level side effects deferred:** Audit trail entries (`ap_reconciliation_audit_trail`), `archive_version` increment, and `archived_at` assignment are the responsibility of the archive service that calls the UPDATE. This story only validates the trigger condition itself.

## Cross-Cutting Concerns

### Audit Integration
- [ ] Audit events: N/A (this story tests trigger paths only; audit trail recording is service-layer concern for downstream stories)
- [ ] Audit fields: N/A
- [ ] Audit tier: N/A

### Idempotency
- [ ] Idempotency key field: `client_ref` (for AR invoice creation in downstream stories — not relevant for 57.1)
- [ ] Idempotency service: N/A for 57.1 (trigger tests use direct Kysely; no service path)

### Validation Rules
- [x] `company_id` scoping enforced in all queries (AC6 — application-level)
- [ ] `customer_id` FK: not required for trigger test (snapshot row does not require customer FK)

### Error Handling
- [x] Trigger blocks: `SQLSTATE '45000'` — test captures this by catching the error from blocked UPDATE
- [ ] 404 Not Found: N/A for 57.1 (no service path; direct DB operations only)

## Validation Evidence

```bash
# Run AR snapshot trigger compatibility tests
npm run test:single -- "apps/api/__test__/integration/sales/ar-snapshot-trigger-compatibility.test.ts" -w @jurnapod/api

# Verify lint gate still clean
npm run lint:migrations

# Typecheck
npm run typecheck -w @jurnapod/api
```

---

## Dependencies

- Epic 56 Story 56.1 complete (trigger 0201 exists and operational)
- `ap_reconciliation_snapshots` table schema confirmed

---

## Technical Debt Review

- [ ] No shortcuts taken that require follow-up
- [ ] No `TODO`/`FIXME` comments left in production code
- [ ] No new migrations introduced
- [ ] Integration tests written for all AC paths
- [ ] All new debt items added to registry

---

## Notes

**Why this story is mandatory before 57.2–57.4:** Trigger 0201 was created with AP context. If it blocks AR rows for any reason (e.g., AR-specific column constraints, AR-specific settings not present), the block would only be discovered mid-57.2 when an AR invoice is posted. Making it Story 57.1 converts a potential mid-sprint P0 into a planned pre-flight check.

_Last Updated: 2026-05-05_