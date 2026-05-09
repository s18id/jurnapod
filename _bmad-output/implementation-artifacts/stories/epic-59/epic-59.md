# Epic 59: POS Core Correctness Consolidation

> **Owner:** Architecture Program (Correctness > Safety > Speed)
> **Status:** planned
> **Sprint:** 59
> **Theme:** Prove POS lifecycle, sync idempotency, tenant/ACL, and tax/settings correctness without net-new feature scope.
> **Primary Modules:** `apps/api`, `@jurnapod/pos-sync`, `@jurnapod/modules-sales`, `@jurnapod/modules-platform`
> **Predecessor:** Epic 58 (Inventory/Costing Correctness)
> **Exit Gate:** P0/P1 = 0 in epic scope; critical suites green; gate evidence script exits 0.

---

## 0) HARD GATE / Predecessor Unblock

Epic 59 MUST NOT start implementation before Epic 58 close gates are green.

| Gate ID | Requirement | Artifact | Status |
|---|---|---|---|
| E58-G1 | Inventory↔GL variance within tolerance | Epic 58 gate evidence | required |
| E58-G2 | COGS reconciliation within tolerance | Epic 58 gate evidence | required |
| E58-G3 | No unresolved P0/P1 in Epic 58 scope | sprint-status + review output | required |

---

## 1) Charter

### 1.1 Program Alignment

Epic 59 continues correctness-first sequencing from Epics 56–58 and targets POS/sync/tenant correctness invariants.

### 1.2 What We Know

- POS is offline-first and idempotent via `client_tx_id`.
- `/sync/push` MUST be transactional (doc + journal together).
- `/sync/pull` MUST use canonical cursor fields: `since_version` and `data_version`.
- Finalized records are immutable; correction is VOID/REFUND only.
- ACL is resource-level (`module.resource`) with explicit `resource` enforcement.

### 1.3 Non-Goals

- No net-new POS features.
- No frozen-app scope expansion (`apps/backoffice`, `apps/pos`) without explicit exception.
- No business-logic DB triggers.

---

## 2) Requirements Inventory

### Functional Requirements

| FR | Requirement |
|---|---|
| FR1 | POS lifecycle transitions MUST be valid and immutable post-finalization. |
| FR2 | Sync push MUST enforce `client_tx_id` idempotency. |
| FR3 | Duplicate `client_tx_id` MUST return `DUPLICATE` without duplicate financial effect. |
| FR4 | Sync push MUST be atomic across business document and journal posting. |
| FR5 | Sync cursors MUST use `since_version` (request) and `data_version` (response). |
| FR6 | POS reads/writes MUST enforce `company_id` and `outlet_id` scope. |
| FR7 | ACL checks MUST enforce explicit `resource` for POS routes. |
| FR8 | Tax/settings/master data MUST resolve consistently (company→outlet policy as defined by domain rules). |
| FR9 | POS financial outputs MUST reconcile to journals. |
| FR10 | Audit events MUST capture success + tenant context for critical operations. |

### Non-Functional Requirements

| NFR | Requirement | Validation |
|---|---|---|
| NFR1 | P0/P1 defects in epic scope MUST be zero at close gate. | consolidated review gate |
| NFR2 | No cross-tenant data leakage is permitted. | integration scoping tests |
| NFR3 | Duplicate retries MUST NOT create duplicate posting effects. | sync idempotency tests |
| NFR4 | API boundary input MUST be Zod-validated. | route-level integration tests |
| NFR5 | Business invariants MUST remain in app code (not DB triggers). | migration lint + code review |

### FR Coverage Map

| FR | Story |
|---|---|
| FR1 | 59.1, 59.7 |
| FR2, FR3 | 59.2 |
| FR4, FR5 | 59.3 |
| FR6, FR7 | 59.4 |
| FR8, FR9 | 59.5 |
| FR10 | 59.6 |

---

## 3) Story Breakdown

### Story 59.1 — POS Transaction Lifecycle Correctness
**Status:** planned  
**Type:** lifecycle correctness  
**Risk:** P1  
**FR Coverage:** FR1

Prove that finalized POS records are immutable and all correction paths use VOID/REFUND with balanced reversal effects.

### Story 59.2 — Sync Idempotency Contract Correctness
**Status:** planned  
**Type:** idempotency correctness  
**Risk:** P1  
**FR Coverage:** FR2, FR3

Prove duplicate `client_tx_id` requests are safely deduplicated and return canonical `DUPLICATE` responses.

### Story 59.3 — Push/Pull Sync Transactional & Cursor Correctness
**Status:** planned  
**Type:** sync transaction contract  
**Risk:** P0  
**FR Coverage:** FR4, FR5

Prove push atomicity and cursor field canonicality (`since_version`/`data_version`).

### Story 59.4 — Tenant/Outlet Scoping & ACL Resource Enforcement
**Status:** planned  
**Type:** security and isolation correctness  
**Risk:** P0  
**FR Coverage:** FR6, FR7

Prove no cross-tenant leakage and enforce explicit resource-level authorization checks.

### Story 59.5 — Tax/Settings/Master-Data Consistency in POS Flows
**Status:** planned  
**Type:** tax/settings correctness  
**Risk:** P1  
**FR Coverage:** FR8, FR9

Prove tax and default resolution produce stable totals and journal-consistent outcomes.

### Story 59.6 — Auditability & Epic Gate Automation
**Status:** planned  
**Type:** quality gate automation  
**Risk:** P2  
**FR Coverage:** FR10

Produce machine-verifiable gate evidence for close/no-close decisioning.

### Story 59.7 — POS VOID/REFUND Reversal Journal Linkage Correctness
**Status:** backlog  
**Type:** financial reversal correctness  
**Risk:** P0  
**FR Coverage:** FR1

Executes Story 59.1 AC4 handoff: implement and verify reversal-journal posting, balance integrity, and deterministic audit linkage for POS VOID/REFUND corrections.

---

## 4) Epic Risk Register

| Risk ID | Severity | Mitigation | Status |
|---|---|---|---|
| R59-001 | P0 | Enforce idempotency and verify duplicate no-op posting | planned |
| R59-002 | P0 | Validate push transaction atomicity with rollback checks | planned |
| R59-003 | P0 | Add cross-tenant negative tests and ACL resource checks | planned |
| R59-004 | P1 | Validate tax/settings cascade and total consistency | planned |

---

## 5) Preconditions

| # | Precondition | Enforcement |
|---|---|---|
| 1 | Epic 58 close gate complete | MUST verify before Story 59.1 implementation |
| 2 | Critical test scripts available and runnable | MUST verify at kickoff |
| 3 | Sprint-status append-only protocol active | MUST use update utility |

---

## 6) Exit Gate

Epic 59 closes only when all conditions are true:

1. **Correctness Gate:** lifecycle + sync + scoping + tax critical suites pass.
2. **Risk Gate:** unresolved P0/P1 in epic scope = 0.
3. **Evidence Gate:** `validate-epic-59-gates` script exits 0 and includes machine-readable gate lines.

---

## 7) Sprint Kickoff Checkpoint

### 7.1 Pre-Flight Gate

- Run lint/typecheck for API scope.
- Verify Epic 58 close evidence.
- Confirm test suites for POS/sync/scoping/ACL run.

### 7.2 SOLID/DRY/KISS Baseline

| Principle | Score |
|---|---|
| SOLID | Unknown |
| DRY | Unknown |
| KISS | Unknown |

## 7.3) E58-A2 Spike — Concurrent Posting Deadlock Sizing

**Owner:** Elena  
**Deadline:** Before Epic 59 mid-sprint review

### Required Investigation Tasks

1. Review posting lock order in concurrent payment/posting paths.
2. Reproduce potential deadlock pattern and document triggering conditions.
3. Identify minimal safe mitigation candidates with risk notes.
4. Provide one recommendation approved by story owner + reviewer.

### Decision Options

- **Option A (<1 sprint):** If fix scope is less than one sprint, implementation MUST be scheduled inside Epic 59 scope with explicit AC/test evidence.
- **Option B (>1 sprint):** If fix scope exceeds one sprint, item MUST move to backlog with effort estimate, risk level, and target epic recommendation.

### Expected Output Artifact

- `_bmad-output/planning-artifacts/epic-59-concurrent-posting-deadlock-spike.md`

This artifact MUST include reproduction notes, lock-order analysis, option comparison, and final recommendation.

### Current Status (2026-05-08)

- Spike artifact created: `_bmad-output/planning-artifacts/epic-59-concurrent-posting-deadlock-spike.md`
- Decision note recorded: `_bmad-output/planning-artifacts/epic-59-concurrent-posting-deadlock-decision-note.md`
- **Option A selected** (<1 sprint mitigation) for Epic 59 scope.
- Contingency rule: if Option A does not stabilize retry/deadlock behavior, Option B MUST be promoted to backlog with explicit capacity and target epic.

---

## 8) Validation Commands

```bash
npm run lint -w @jurnapod/api
npm run typecheck -w @jurnapod/api
npm run test:integration -w @jurnapod/api
npx tsx scripts/validate-sprint-status.ts
```

---

_Last Updated: 2026-05-08_
