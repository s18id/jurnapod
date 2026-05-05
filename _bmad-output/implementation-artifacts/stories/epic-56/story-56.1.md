# Story 56.1: Archive Flow Trigger Constraint Resolution

**Status:** ready-for-dev

> ⚠️ **Sprint-Status Append-Only Rule (E45-A1 / E46-A1) — MANDATORY:**
> If this story modifies `_bmad-output/implementation-artifacts/sprint-status.yaml`:
> - **REQUIRED**: Run `npx tsx scripts/update-sprint-status.ts --epic N --story N-X --status done` (the canonical utility)
> - **REQUIRED**: After editing, run `npx tsx scripts/validate-sprint-status.ts` to confirm file integrity
> - **NEVER** replace the entire file — always append only

---

## Story

As a **developer reconciling AP accounts**,  
I want **the append-only trigger on `ap_reconciliation_snapshots` to allow the archive path**,  
So that **snapshots beyond retention policy can be archived while immutability is preserved for all other operations**.

## Context

**Source:** Epic 55 Retrospective action item E55-A2.

During Epic 55 Story 55.1, Migration 0191's `ap_reconciliation_snapshots_append_only` trigger was discovered to block `INSERT ... ON DUPLICATE KEY` by intercepting the internal UPDATE path. The same trigger blocks the archive/retention flow (`status='ARCHIVED'`, `archived_at`, `archive_version`).

The trigger was deferred as P3 in Epic 55. It becomes P1 (blocker) the moment AR reconciliation work begins, because both AP and AR archive paths will be blocked.

**Migration 0191** adds:
```sql
CREATE TRIGGER trg_ap_reconciliation_snapshots_before_update
BEFORE UPDATE ON ap_reconciliation_snapshots
FOR EACH ROW
SIGNAL SQLSTATE '45000'
SET MESSAGE_TEXT = 'ap_reconciliation_snapshots is append-only: UPDATE is not allowed';
```

This trigger fires on ALL updates — including the archive flow. The fix must modify this trigger (or replace it) to allow `status='ARCHIVED'` transitions while blocking all other mutations.

### E55-A2 Closure Criteria

> **From action-items.md:** 
> - Snapshots beyond `retention_policy_years` can be transitioned to `status='ARCHIVED'`
> - `archived_at` and `archive_version` columns are writable
> - `ap_reconciliation_snapshots_append_only` trigger modified to allow archive path

---

## Test Scenario Review Checkpoint (MANDATORY — E54-A1)

### Pre-Implementation Checklist

- [x] **Happy paths identified:** 1 core path (archive valid snapshot via trigger)
- [x] **Error paths identified:** 2 (non-archive update still blocked, DELETE still blocked)
- [x] **Edge cases identified:** concurrent archive, archive of already-archived, app-level retention enforcement
- [x] **Test fixture needs identified:** Existing snapshot fixtures sufficient
- [x] **Integration test scope defined:** All tests use real DB
- [x] **Negative auth test role selected:** N/A — migration-only story

### Review Outcome

| Scenario | Type | Coverage Plan |
|----------|------|--------------|
| Archive snapshot (status='ARCHIVED' transition) | Happy | Integration |
| Non-archive UPDATE still blocked | Error | Integration |
| DELETE still blocked | Error | Integration |
| Archive of already-archived snapshot (no-op) | Edge | Integration |
| Existing snapshot tests unchanged | Regression | Integration |
| MariaDB + MySQL 8.0 both pass | Compatibility | Integration |

**Sign-off:** Test scenarios reviewed and approved before implementation begins.

---

## Cross-Module Decision Gate (MANDATORY)

### Pre-Implementation Checklist

- [x] **Modules touched:** `modules-purchasing` (trigger owner), `packages/db` (migration)
- [x] **Cross-module decisions identified:** None — trigger is single-table, single-database
- [x] **Decision: Trigger modification approach** — modify existing trigger to add archive condition (minimum change) vs. create replacement trigger
- [x] **Decision: Archive condition detection** — check `NEW.status = 'ARCHIVED'` AND `OLD.status != 'ARCHIVED'` AND `NEW.archived_at IS NOT NULL`

### Decision Record

| # | Decision | Modules Affected | Rationale | Alternatives Considered | Sign-Off |
|---|----------|-----------------|-----------|------------------------|----------|
| 1 | Modify existing trigger, don't replace | `packages/db` | Minimal diff; exact same trigger name preserves migration history | New trigger with new name (higher cognitive load) | — |
| 2 | Retention policy enforcement in app code, NOT trigger | `apps/api` (service layer) | Per AGENTS.md §C: business invariants MUST be in application code. Trigger only gates on status field. | Retention check in trigger (violates AGENTS.md §C, blocked by E55-A1) | — |

---

## Acceptance Criteria

**AC1: Non-archive UPDATE still blocked**
**Given** a snapshot within retention policy years
**When** an UPDATE attempts to change any non-archive field
**Then** the trigger still raises `45000: ap_reconciliation_snapshots is append-only`

**AC2: Archive transition allowed (trigger level)**
**Given** a snapshot in any non-archived status
**When** an UPDATE sets `status='ARCHIVED'`, `archived_at`, `archive_version`
**Then** the UPDATE succeeds (trigger allows status transition to ARCHIVED)

**AC3: Archive within retention is an app-level enforcement (trigger does NOT check)**
**Given** a snapshot within `retention_policy_years`
**When** the application-level archive service processes the snapshot
**Then** the app service refuses to archive it (invariant enforced in app code, not trigger)

> **Note:** The trigger only gates on `status='ARCHIVED'` field transitions. Retention policy enforcement is in the application layer. This is intentional — per AGENTS.md §C, business invariants (retention periods) MUST be in application code, not DB triggers.

**AC4: DELETE still blocked**
**Given** any snapshot
**When** a DELETE is attempted
**Then** the trigger raises `45000: ap_reconciliation_snapshots is append-only`

**AC5: Existing snapshot integration tests pass unchanged**
**Given** the current snapshot test suite
**When** run against the modified trigger
**Then** all 21+ tests pass

**AC6: MariaDB and MySQL 8.0 both pass**
**Given** the migration and tests
**When** run on both database engines
**Then** behavior is identical

**AC7: Code review GO required**

---

## Test Coverage Criteria

- [x] Coverage target: all paths
- [x] Happy paths to test:
  - [x] Archive valid (status='ARCHIVED' transition)
- [x] Error paths to test:
  - [x] Non-archive UPDATE (blocked)
  - [x] DELETE (blocked)

## Tasks / Subtasks

- [ ] Read current `trg_ap_reconciliation_snapshots_before_update` trigger definition
- [ ] Modify trigger to allow `status='ARCHIVED'` transitions
- [ ] Add migration file (0201_allow_archive_path.sql)
- [ ] Ensure migration is rerunnable (DROP TRIGGER IF EXISTS before CREATE TRIGGER)
- [ ] Run existing snapshot test suite — verify no regressions
- [ ] Run archive-specific integration tests

## Files to Create

| File | Description |
|------|-------------|
| `packages/db/migrations/0201_allow_archive_path.sql` | Migration modifying `trg_ap_reconciliation_snapshots_before_update` to allow `status='ARCHIVED'` transitions and preserve the supersession chain path (Migration 0193) |

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `apps/api/__test__/integration/purchasing/ap-reconciliation-snapshots.test.ts` | Modify | Add archive-path tests (AC1–AC6); update any test assertions that check the trigger error message text string (changed from `"UPDATE is not allowed"` to `"UPDATE is not allowed for non-archive transitions"`) |

## Estimated Effort

Small (1–2 days)

## Risk Level

Medium — trigger modification must preserve existing behavior for non-archive paths

## Dev Notes

- Migration MUST be rerunnable (use `DROP TRIGGER IF EXISTS` + `CREATE TRIGGER` or `information_schema` check)
- Trigger name is `trg_ap_reconciliation_snapshots_before_update` — do NOT rename
- Archive condition: `NEW.status = 'ARCHIVED'` transitions allowed; supersession chain (`OLD.superseded_by_snapshot_id IS NULL AND NEW.superseded_by_snapshot_id IS NOT NULL`) also allowed per Migration 0193
- Existing `SIGNAL SQLSTATE '45000'` message text should indicate which path was blocked
- **Retention policy enforcement is in app code, NOT in the trigger** — the trigger only gates on the `status` field transition. This is intentional per AGENTS.md §C (no business logic in DB triggers). The archive service layer reads `retention_policy_years` from the company config and refuses archive of in-retention snapshots before calling the UPDATE.
- **MariaDB DELIMITER syntax**: The existing trigger body is a single `SIGNAL` statement (no `BEGIN...END`). The new version uses `BEGIN...END` for the `IF` block. MariaDB may require `DELIMITER // ... // DELIMITER ;` wrap. Test on MariaDB 11.x before marking done. See [MariaDB trigger syntax](https://mariadb.com/kb/en/create-trigger/).

### Trigger Implementation Sketch

```sql
CREATE TRIGGER trg_ap_reconciliation_snapshots_before_update
BEFORE UPDATE ON ap_reconciliation_snapshots
FOR EACH ROW
BEGIN
  -- Allow archive transitions and supersession chain updates (Migration 0193)
  IF NOT (
    NEW.status = 'ARCHIVED'
    OR (OLD.superseded_by_snapshot_id IS NULL AND NEW.superseded_by_snapshot_id IS NOT NULL)
  ) THEN
    SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'ap_reconciliation_snapshots is append-only: UPDATE is not allowed for non-archive transitions';
  END IF;
END;
```

## Architecture Cleanup

- [x] Architecture Cleanup Policy (A) — no TODO/FIXME/Debt in modified area to clean up
- [x] No new business DB triggers — this modifies existing trigger, does NOT add a new one

## Validation Evidence

```bash
# Run snapshot test suite (archive tests + regression)
npm run test:single -- "apps/api/__test__/integration/purchasing/ap-reconciliation-snapshots.test.ts" -w @jurnapod/api

# Build check
npm run build -w @jurnapod/db && npm run build -w @jurnapod/api

# Typecheck
npm run typecheck -w @jurnapod/api
```

## Dependencies

- Migration 0191 (existing trigger definition) — must be present

## Technical Debt Review

- [x] No shortcuts taken that require follow-up
- [x] Integration tests included in ACs (not deferred)
- [x] All new debt items added to registry before story closes
