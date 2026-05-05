# Epic 56 — Correctness Infrastructure

> **Owner:** Architecture Program (Correctness > Safety > Speed)
> **Status:** ready-for-dev
> **Sprint:** 56 (per S48–S61 blueprint)
> **Theme:** Resolve two structural debt items from Epic 55 — archive flow trigger and CI lint gate for no-business-trigger rule
> **Primary Module:** `modules-purchasing` (archive trigger), `modules-shared` or `scripts` (CI lint gate)
> **Exit Gate:** Archive flow unblocked; CI lint gate for no-trigger rule operational

---

## 0) HARD GATE — Epic 55 Retro Action Items

| Gate ID | Requirement | Artifact | Status |
|---------|-------------|----------|--------|
| **E55-A1** | CI lint gate blocking new business-logic DB triggers | `action-items.md` | open — Epic 56 Sprint 2 |
| **E55-A2** | Archive flow trigger constraint resolved before AR work | `action-items.md` | open — Epic 56 Sprint 1 (P1) |

**Rationale:** Both items are the sole output of Epic 55's retrospective (max 2 action items per AGENTS.md E46-A2). Epic 56 resolves these debt items so downstream correctness work (AR, Treasury, etc.) is not blocked.

---

## 1) Charter

### 1.1 Program Alignment

Epic 56 is Sprint 56 infrastructure debt resolution in the S48–S61 Correctness-First Architecture Blueprint:

| Sprint | Blueprint Focus | Epic 56 Alignment |
|--------|-----------------|-------------------|
| 55 | AP reconciliation/snapshot correctness | **This epic's predecessor** — archive trigger constraint discovered; CI gate gap identified |
| **56** | **Correctness infrastructure** | Resolve E55-A1 (CI lint gate) + E55-A2 (archive trigger) |
| 57+ | AR + Treasury, Inventory/Costing, POS, etc. | Depends on Epic 56 unblocking archive and trigger CI |

### 1.2 What We Know

**Epic 55 (done):** AP reconciliation/snapshot correctness. During Story 55.1, `INSERT ... ON DUPLICATE KEY` was blocked by Migration 0191's `trg_ap_reconciliation_snapshots_before_update` trigger. This trigger also blocks the archive/retention flow (`status='ARCHIVED'`, `archived_at`, `archive_version`). The archive flow was deferred as P3 but becomes P1 when AR work begins (both AP and AR archive paths blocked).

Additionally, the "no new business DB triggers" rule (AGENTS.md §C) had no CI enforcement — Migration 0191 passed review without catching the business-logic trigger.

### 1.3 Non-Goals

- Net-new snapshot or reconciliation features
- AR or Treasury correctness implementation
- Changes to `apps/backoffice` or `apps/pos` (frozen per architecture-first scope freeze)
- New API endpoints

---

## 2) Story Breakdown

### Story 56.1 — Archive Flow Trigger Constraint Resolution
**Status:** ready-for-dev
**Owner:** @bmad-dev
**Type:** Correctness infrastructure (E55-A2)

Modify the `trg_ap_reconciliation_snapshots_before_update` trigger (Migration 0191) to allow the archive path while preserving immutability for non-archive operations (and preserving the supersession chain path from Migration 0193).

**AC1:** Append-only trigger still blocks `UPDATE` and `DELETE` for non-archive transitions
**AC2:** Trigger allows `status='ARCHIVED'` + `archived_at` + `archive_version` transitions (no retention check — gate is on status field only)
**AC3:** Snapshots can be archived: trigger permits UPDATE to `status='ARCHIVED'`; retention enforcement is app-level (per AGENTS.md §C)
**AC4:** DELETE still blocked by trigger
**AC5:** All existing snapshot integration tests pass unchanged
**AC6:** MariaDB and MySQL 8.0 both pass
**AC7:** App-level archive service enforces retention policy before calling UPDATE
**AC8:** Code review GO required

---

### Story 56.2 — CI Lint Gate for No-Business-Trigger Rule
**Status:** ready-for-dev
**Owner:** @bmad-dev + @bmad-testarch
**Type:** Correctness infrastructure (E55-A1)

Add a CI lint gate that detects new business-logic DB triggers in migrations and fails the build.

**AC1:** `npm run lint:migrations` (or equivalent script) scans all migration files for `CREATE TRIGGER` statements
**AC2:** A migration adding a business-logic trigger (UPDATE/DELETE blocking, validation in trigger body) fails CI with clear error message
**AC3:** A migration without triggers passes CI
**AC4:** A migration with an allowed non-business trigger (e.g., a pure audit timestamp trigger) passes CI with explicit annotation
**AC5:** Integration test verifies the lint gate catches a synthetic bad migration
**AC6:** Existing trigger (Migration 0191) grandfathered with `-- lint:allow-business-trigger` annotation — first `npm run lint:migrations` exits 0
**AC7:** Documentation updated in AGENTS.md §C referencing the CI gate
**AC8:** Code review GO required

---

## 3) Epic 56 Risk Register

| Risk | Severity | Mitigation | Status |
|------|----------|------------|--------|
| R56-001: Trigger modification breaks existing append-only behavior | P0 | Story 56.1 AC1 — non-archive paths still blocked | planned |
| R56-002: CI lint gate false positives on legitimate triggers | P1 | Story 56.2 AC4 — annotation-based allowlist | planned |
| R56-003: Archive flow still blocked after trigger change (policy interpretation) | P1 | Story 56.1 AC2–AC3 — integration tests prove archiving works | planned |
| R56-004: Migration 0191 grandfathering forgotten → CI breaks on first lint:migrations run | P2 | Story 56.2 AC6 — explicit AC for grandfathering | planned |

---

## 4) Sprint 56 Kickoff Checkpoint

### 4.1 SOLID/DRY/KISS Baseline

| Principle | Item | Status | Notes |
|-----------|------|-------|-------|
| **SRP** | Each story targets one debt item | Pass | Archive trigger, CI lint gate isolated |
| **OCP** | Existing trigger behavior preserved for non-archive paths | Pass | Story 56.1 AC1 |
| **LSP** | Snapshot table behavior unchanged for existing consumers | Pass | Story 56.1 AC5 |
| **ISP** | Trigger modification focused on archive path only | Pass | No unrelated changes |
| **DIP** | CI lint gate is standalone script; no runtime dependency | Pass | Story 56.2 |
| **DRY** | Both items are single-purpose | Pass | No duplicated scope |
| **KISS** | Minimal trigger change; explicit annotation pattern | Pass | Architecture over clever regex |

### 4.2 Exit Gate Criteria

1. Story 56.1: Archive flow trigger modified, existing tests pass, 3× green
2. Story 56.2: CI lint gate detects bad migrations, documentation updated, 3× green
3. E55-A1 and E55-A2 closed in `action-items.md` with evidence
4. No unresolved P0/P1 in Epic 56 scope
5. Sprint status validated: `npx tsx scripts/validate-sprint-status.ts --epic 56` exits 0

---

## 5) Validation Commands

```bash
# Story 56.1 — Archive Flow Trigger
npm run test:single -- "apps/api/__test__/integration/purchasing/ap-reconciliation-snapshots.test.ts" -w @jurnapod/api

# Story 56.2 — CI Lint Gate
npm run lint:migrations

# Epic close gate
npx tsx scripts/validate-sprint-status.ts --epic 56
```
