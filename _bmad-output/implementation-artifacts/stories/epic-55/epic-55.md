# Epic 55 — AP Reconciliation/Snapshot Correctness

> **Owner:** Architecture Program (Correctness > Safety > Speed)
> **Status:** planned
> **Sprint:** 55 (per S48–S61 blueprint)
> **Theme:** Prove reconciliation computation and snapshot audit trail are correct; no new features
> **Primary Module:** `modules-purchasing` (snapshot/reconciliation), `modules-accounting` (GL control balance)
> **Exit Gate:** recon/snapshot critical test suites all green; E51-A1 auto-snapshot race closed

---

## 0) HARD GATE — E51-A1 Carry-Over (MANDATORY)

> **RFC Keywords (Agent-Safe):** Implementation of ANY Epic 55 story MUST NOT begin until ALL of the following conditions are met:

| Gate ID | Requirement | Artifact | Status |
|---------|-------------|----------|--------|
| **E51-A1** | Auto-snapshot race from Epic 51 formally tracked with owner assigned | `action-items.md` entry with owner = Epic 55 | ✅ Tracked for Epic 55 (to be assigned at kickoff) |
| **E55-A1** | Kysely `ON DUPLICATE KEY` `affectedRows` spike completed | Story 55.1 spec MUST include spike evidence before production code | MUST be present |
| **E55-A2** | Second-pass review checklist in every story spec | Each `story-55.X.md` | MUST be present |

**Rationale:** Epic 55 closes the sole open P1 action item in the S48–S61 program. The E51-A1 race fix is the primary driver, and the fix depends on Kysely/MySQL `ON DUPLICATE KEY` semantics. A spike MUST verify this before production code is written.

---

## 1) Charter

### 1.1 Program Alignment

Epic 55 is Sprint 55 in the S48–S61 Correctness-First Architecture Blueprint:

| Sprint | Blueprint Focus | Epic 55 Alignment |
|--------|-----------------|-------------------|
| 50 | Ledger correctness hardening | Posting integration tests (5 suites, 26 tests) delivered |
| 51 | Fiscal correctness hardening | Close/override concurrency proof; 4 subledger reconciliations |
| 52–53 | Drift prevention (datetime + idempotency) | Emergency epics; datetime API + idempotency contracts stabilized |
| 54 | AP lifecycle correctness | Invoice, payment, state machine, FX, period close proven correct |
| **55** | **AP reconciliation/snapshot correctness** | **This epic** — reconcile AP subledger to GL control; snapshot audit trail integrity; E51-A1 race fix |
| 56 | AR + treasury correctness | Sales-AR + treasury correctness hardening |

### 1.2 What We Know from Exploration

**Epic 47 (done):** AP reconciliation + period close controls. `ap_reconciliation_snapshots` and `ap_reconciliation_audit_trail` tables created. Immutable append-only snapshot persistence. Snapshot comparison and CSV export endpoints.

**Epic 48 (done):** AP snapshot hardening. Integration tests for snapshot CRUD + auto-snapshot on fiscal close. 8/8 tests passing.

**Epic 51 (done):** Subledger reconciliations verified (AR, AP, Inventory). AP reconciliation proved `purchase_invoices` + `purchase_payments` + `supplier_credit_notes` balances to AP GL control account.

**Epic 54 (done):** AP lifecycle correctness. Invoice create/post/void, payment create/post/allocate, state machine integrity, multi-currency, period-close enforcement all proven.

**What Epic 55 must prove:**
- AP subledger balance computation is deterministic under concurrent AP writes
- GL control account balance computation is deterministic and matches subledger
- Variance formula (`gl_control_balance - ap_subledger_balance`) is correct for all states
- Snapshot chain (`superseded_by_snapshot_id`) never breaks under concurrent writes
- Every snapshot has a corresponding audit trail entry with correct provenance
- Auto-snapshot race (E51-A1) is eliminated — check-then-create gap closed

### 1.3 Non-Goals

- Net-new snapshot or reconciliation features
- Changes to `apps/backoffice` or `apps/pos` (frozen per architecture-first scope freeze)
- Changes to fiscal year close business logic beyond the race fix boundary
- New API endpoints
- Changes to AP invoice/payment/state machine behavior (covered in Epic 54)

---

## 2) Story Breakdown

### Story 55.1 — Auto-Snapshot Race Fix (E51-A1)
**Status:** planned
**Owner:** @bmad-dev
**Type:** Correctness risk resolution (P1 action item closure)

Close the TOCTOU race in fiscal year close auto-snapshot trigger by replacing check-then-create with `INSERT ... ON DUPLICATE KEY` idempotent guard.

**AC1:** Kysely `ON DUPLICATE KEY` `affectedRows` spike completed — verify MySQL 8.0 and MariaDB return distinguishable row counts for insert vs. update
**AC2:** Snapshot `createAPReconciliationSnapshot` uses `INSERT ... ON DUPLICATE KEY` as atomic idempotency mechanism
**AC3:** TOCTOU window between `hasAutoSnapshotForFiscalYearEnd` check and snapshot creation is eliminated
**AC4:** `AutoSnapshotWarning` non-fatal path preserved — snapshot failure does not block fiscal year close
**AC5:** All existing integration tests pass without changes to test assertions
**AC6:** Concurrent auto-snapshot simulation test proves idempotency under concurrency
**AC7:** Code review GO required

---

### Story 55.2 — Reconciliation Computation Correctness
**Status:** planned
**Owner:** @bmad-dev
**Type:** Correctness risk resolution

Prove that AP reconciliation computation (subledger balance, GL control balance, variance) is deterministic and correct under concurrent writes.

**AC1:** AP subledger balance computation is deterministic: same `as_of_date` → same balance
**AC2:** GL control account balance computation is deterministic and matches subledger for reconciled state
**AC3:** Variance formula verified correct for all states (zero, positive, negative)
**AC4:** Open items, matched items, and disputed items correctly categorized
**AC5:** Edge cases verified: zero AP balance, fully paid period, partial period, multicurrency AP
**AC6:** Integration tests written and 3× consecutive green
**AC7:** Code review GO required

---

### Story 55.3 — Snapshot Chain Integrity & Immutability
**Status:** planned
**Owner:** @bmad-dev
**Type:** Correctness risk resolution

Prove that snapshot chain (`superseded_by_snapshot_id`) and append-only guarantees are inviolable.

**AC1:** `superseded_by_snapshot_id` chain verified: no orphans, terminates at `CURRENT`
**AC2:** Append-only trigger blocks `UPDATE` and `DELETE` on `ap_reconciliation_snapshots`
**AC3:** Archive/retention flow works: snapshots beyond `retention_policy_years` archived correctly
**AC4:** CSV export works for any snapshot in chain (current or superseded)
**AC5:** Chain integrity under concurrent writes verified: parallel snapshots maintain version chain
**AC6:** Integration tests written and 3× consecutive green
**AC7:** Code review GO required

---

### Story 55.4 — Audit Trail Completeness
**Status:** planned
**Owner:** @bmad-dev
**Type:** Correctness risk resolution

Prove that every snapshot has complete audit trail provenance.

**AC1:** Every `ap_reconciliation_snapshots` row has at least one `ap_reconciliation_audit_trail` row
**AC2:** Auto-generated snapshot audit entry: `action_type = 'CREATED'`, `change_reason` contains `"period_close_auto_snapshot"`, snapshot's `auto_generated` field is `true`
**AC3:** Manually-triggered snapshot audit entry: `action_type = 'CREATED'`, `change_reason` contains custom reason or `"manual_snapshot"`, `changed_by` = user, snapshot's `auto_generated` field is `false`
**AC4:** Superseded chain proven bidirectionally: old snapshot has `superseded_by_snapshot_id` pointing to new; new snapshot's audit entry has `action_type = 'RECALCULATED'` with `previous_snapshot_id` pointing to old
**AC5:** Full provenance query works: snapshot → audit trail → user (via `changed_by`)
**AC6:** Integration tests written and 3× consecutive green
**AC7:** Code review GO required

---

### Story 55.5 — Critical Test Suite Hardening
**Status:** planned
**Owner:** @bmad-dev
**Type:** Defect resolution / test hardening

> **Scope enforcement:** Story 55.5 MUST NOT introduce new scope. It is exclusively a follow-up closure bucket for defects/gaps surfaced by Stories 55.1–55.4, plus mandatory concurrent simulation tests.

Harden recon/snapshot test suites with concurrent simulation and edge case coverage.

**AC1:** Race simulation test: manual snapshot created between fiscal close commit and auto-snapshot trigger → exactly one auto-snapshot exists, both paths return same ID
**AC2:** Duplicate auto-trigger: same inputs → same snapshot; different inputs → new version
**AC3:** Chain integrity under parallel writes: concurrent snapshots for same `as_of_date` maintain version chain without constraint violations
**AC4:** CSV export correctness: export content matches compare output; historical snapshots exportable
**AC5:** All recon/snapshot tests pass 3× consecutive (flaky test elimination)
**AC6:** Risk register updated
**AC7:** Code review GO required

---

## 3) Epic 55 Risk Register

| Risk | Severity | Mitigation | Status |
|------|----------|------------|--------|
| R55-001: Kysely `ON DUPLICATE KEY` `affectedRows` semantics incompatible | P0 | Story 55.1 AC1 spike; raw SQL fallback | ✅ closed — trigger conflict found; pivoted to `SELECT FOR UPDATE + inputsHash` |
| R55-002: AP subledger balance non-deterministic under concurrent writes | P0 | Story 55.2 AC1–AC2 | ✅ closed — 55/55 tests, 3× green |
| R55-003: Snapshot chain breaks under concurrent writes | P1 | Story 55.3 AC1, AC5 | ✅ closed — 19 tests, chain integrity proven |
| R55-004: Audit trail missing for auto-generated snapshots | P1 | Story 55.4 AC1–AC2 | ✅ closed — all snapshots have audit entries |
| R55-005: MariaDB `ON DUPLICATE KEY` behavior differs from MySQL 8.0 | P1 | Story 55.1 AC1 spike on both DBs | ✅ closed — `SELECT FOR UPDATE` locking identical |
| R55-006: Story 55.5 scope creep | P2 | Story 55.5 scope enforcement; epic gate | ✅ closed — scope enforced, no new features |
| **R55-007 (E55-A1):** No CI gate for no-business-triggers rule — migration can add business-logic trigger undetected | P1 | Epic 56 Sprint 2: CI lint gate (AGENTS.md §C) | resolved — Story 56.2 complete: `scripts/lint-migrations.ts` scans all migrations, CI job wired as required gate |

| **R55-008 (E55-A2):** Append-only trigger blocks archive flow for AP and AR snapshots | P1 → P0 when AR work starts | Epic 56 Sprint 1: modify trigger to allow archive path | resolved — Story 56.1 complete: Migration 0201 replaces trigger, allowing `status='ARCHIVED'` + supersession chain |
---

## 4) Sprint 55 Kickoff Checkpoint Evidence

### 4.1 SOLID/DRY/KISS Baseline

| Principle | Item | Status | Notes |
|-----------|------|--------|-------|
| **SRP** | Each story targets one correctness concern | Pass | Race fix, computation, chain integrity, audit trail, test hardening each isolated |
| **OCP** | Snapshot service strengthened without API change | Pass | `INSERT ... ON DUPLICATE KEY` is implementation detail; public API unchanged |
| **LSP** | Snapshot subledger behaves like AR subledger | Pass | Both use `modules-accounting` reconciliation service with symmetric pattern |
| **ISP** | Snapshot interfaces lean (create, list, compare, export) | Pass | Core operations only |
| **DIP** | Snapshot posting depends on abstract journal interface | Pass | `modules-purchasing` delegates to `modules-accounting` for GL queries |
| **DRY** | Business logic: variance formula in one place | Pass | Computed in `ap-reconciliation-snapshot-service.ts` |
| **DRY** | Schema: snapshot types in `packages/shared` | Pass | Snapshot contracts in `packages/shared/src/schemas/purchasing/` |
| **DRY** | SQL: snapshot query patterns in `modules-purchasing` repositories | Unknown | Verify during story 55.1 |
| **DRY** | ACL: `requireAccess()` centralized | Pass | Snapshot routes use canonical `requireAccess({ module: 'purchasing', resource: 'ap_reconciliation_snapshots', permission: '...' })` |
| **DRY** | Test fixtures: canonical snapshot fixtures from owner package | Pass | `@jurnapod/modules-purchasing/test-fixtures` exports snapshot fixtures |
| **KISS** | No over-engineering: simple correctness proofs | Pass | Direct assertions over elaborate frameworks |
| **KISS** | Readable over clever: explicit snapshot version chain | Pass | Chain traversal is explicit `superseded_by_snapshot_id` pointer |
| **KISS** | Small interfaces: snapshot methods focused | Pass | Each method handles one operation |
| **KISS** | Flat over nested: snapshot flow is linear | Pass | Create→Audit→Chain link is single flow |
| **KISS** | Deferred complexity: new snapshot features stay deferred | Pass | Explicitly documented as non-goal in charter §1.3 |

### 4.2 Initial Risk Baseline (P1/P2)

| Risk ID | Description | Severity | Initial Status | Mitigation Owner |
|---------|-------------|----------|----------------|------------------|
| R55-001 | Kysely `ON DUPLICATE KEY` semantics | P0 | planned — spike in story 55.1 AC1 | Story 55.1 |
| R55-002 | AP subledger balance non-deterministic | P0 | planned — proof by story 55.2 AC1–AC2 | Story 55.2 |
| R55-003 | Snapshot chain breaks under concurrency | P1 | planned — proof by story 55.3 AC1, AC5 | Story 55.3 |
| R55-004 | Audit trail missing for auto snapshots | P1 | planned — proof by story 55.4 AC1–AC2 | Story 55.4 |
| R55-005 | MariaDB behavior differs from MySQL | P1 | planned — spike in story 55.1 AC1 | Story 55.1 |
| R55-006 | Story 55.5 scope creep | P2 | planned — gate enforcement | Epic gate |

### 4.3 Hard Gate Status

| Gate ID | Requirement | Status |
|---------|-------------|--------|
| E51-A1 | Tracked in `action-items.md` with owner | ✅ Tracked for Epic 55 |
| E55-A1 | Kysely spike evidence in Story 55.1 | ⏳ To be verified at story kickoff |
| E55-A2 | Second-pass review checklist in all story specs | ⏳ To be verified at story kickoff |

> **Enforcement:** Implementors MUST verify E55-A1/E55-A2 presence before starting any Epic 55 work.

---

## 5) Exit Gate Criteria

Epic 55 can be marked `done` only when:

1. Story 55.1: E51-A1 race fix implemented and proven, 3× consecutive green, reviewer GO attached
2. Story 55.2: Reconciliation computation correctness proven, 3× consecutive green, reviewer GO attached
3. Story 55.3: Snapshot chain integrity proven, 3× consecutive green, reviewer GO attached
4. Story 55.4: Audit trail completeness proven, 3× consecutive green, reviewer GO attached
5. Story 55.5: All defects from 55.1–55.4 resolved + concurrent simulation tests, 3× green, reviewer GO attached
6. E51-A1 closed in `action-items.md` with evidence link
7. No unresolved P0/P1 in Epic 55 scope
8. Sprint status validated: `npx tsx scripts/validate-sprint-status.ts --epic 55` exits 0
9. Retrospective completed: `epic-55-retrospective` entry in sprint-status.yaml, retro action items tracked in `action-items.md` as E55-A1 and E55-A2

---

## 6) Retrospective (Max 2 Action Items)

```
## Epic 55 Retrospective — Max 2 Action Items

1. Action item:
   - Owner:
   - Deadline:
   - Success criterion:

2. Action item:
   - Owner:
   - Deadline:
   - Success criterion:
```

---

## 7) Validation Commands

```bash
# Story 55.1 — Auto-Snapshot Race Fix
npm run test:single -- "apps/api/__test__/integration/purchasing/ap-reconciliation-snapshots.test.ts" -w @jurnapod/api

# Story 55.2 — Reconciliation Computation
npm run test:single -- "apps/api/__test__/integration/purchasing/ap-reconciliation.test.ts" -w @jurnapod/api

# Story 55.3 — Snapshot Chain Integrity
# (tests in ap-reconciliation-snapshots.test.ts + new chain-specific tests)

# Story 55.4 — Audit Trail Completeness
# (tests in ap-reconciliation-snapshots.test.ts)

# Story 55.5 — All affected suites 3× green

# Epic close gate
npx tsx scripts/validate-sprint-status.ts --epic 55
# Expected: exit 0 — "Sprint 55 closure gate: GO"
```
