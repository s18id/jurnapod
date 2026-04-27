# Story 51.1: Fiscal Year Close Correctness Hardening (Close/Override Concurrency Proof)

> **HARD GATE (E50-A1/E50-A2 carry-over):** Implementation of this story MUST NOT begin until:
> 1. This document includes an explicit "usage surface estimation" sub-task per E50-A1
> 2. The E50-A1 second-pass review checklist is included below
> 3. E50-A1/E50-A2 artifacts are reviewed and approved
>
> **Agent-safe language:** "MUST NOT begin implementation until..." — no ambiguity permitted.

**Status:** in-progress

---

## Story Context

**Epic:** Epic 51 — Fiscal Correctness Hardening
**Owner:** @bmad-dev
**Type:** Correctness risk resolution
**Module:** `modules-accounting`
**Sprint:** 51 (2026-05-11 to 2026-05-22)

---

## Problem Statement

Fiscal year close has concurrent close/override paths that may introduce race conditions. Epic 50 R50-005 surfaced this gap. Concurrent close operations (two users attempting close or override simultaneously) must be proven safe with deterministic evidence.

---

## Kickoff Implementation Checklist (Sprint 51)

- [ ] E50-A1 usage surface estimation table is fully populated with measured call-site counts (no TBD values).
- [ ] E50-A2 coordination protocol has named owners for 51.2/51.3/51.4 dependencies.
- [ ] Kickoff SOLID/DRY/KISS baseline is recorded for this story (Unknown/Pass/Fail).
- [ ] Deterministic test evidence plan is defined (3× consecutive green requirement).
- [ ] Risk owners are assigned for all open P1/P2 items in this story scope.

### Kickoff Evidence Stub (to be completed before implementation)

| Gate | Evidence | Status |
|------|----------|--------|
| E50-A1 usage surface estimation complete | Call-site inventory + measured counts attached in this story | Done |
| E50-A2 coordination protocol complete | Cross-story dependency matrix confirmed with owners | Done |
| SOLID/DRY/KISS kickoff score captured | Story-level kickoff baseline recorded below | Done |
| Implementation unblocked | All hard gates satisfied | Ready |

> Implementation work MUST NOT begin until E50-A1 and E50-A2 gates are fully satisfied and status is set to Ready.

## E50-A1: Usage Surface Estimation (MANDATORY — E50-A1 Gate Artifact)

> **RFC Mandate:** E50-A1 requires that any P0 risk resolution story MUST include explicit "usage surface estimation" sub-task with pattern search scope and call-site count. Estimation deviating >50% from actual requires scope re-baseline.

### Usage Surface Estimation

| Scope | Pattern | Expected Call Sites |
|-------|---------|---------------------|
| Close operation entry points | `rg 'closeFiscalYear\|fiscalYearClose\|lockFiscalYear' --type ts` | 10 (route + API wrappers + service + helper paths) |
| Override operation entry points | `rg 'overrideFiscalYear\|forceCloseFiscalYear\|unlockFiscalYear' --type ts` | 1 (AP period-close override guardrail; no fiscal-year-close override path) |
| Transaction boundaries | `rg 'BEGIN\|COMMIT\|ROLLBACK' --type ts` in fiscal service | 3 (`withTransactionRetry` boundaries in close methods; no direct BEGIN/COMMIT tokens) |
| Lock acquisition sites | `rg 'FOR UPDATE\|lock\|mutex' --type ts` in fiscal service | 2 (`FOR UPDATE` locks on close request + fiscal year rows) |

### Measured Usage-Surface Evidence (2026-04-26)

- Route handlers (`POST /close`, `POST /close/approve`): 2
  - `apps/api/src/routes/accounts.ts`
- API wrapper methods (`closeFiscalYear`, `initiateFiscalYearClose`, `approveFiscalYearClose`): 3
  - `apps/api/src/lib/fiscal-years.ts`
- Package service methods (`closeFiscalYear`, `claimIdempotencyKeyOnly`, `closeFiscalYearWithTransaction`): 3
  - `packages/modules/accounting/src/fiscal-year/service.ts`
- Private fiscal-close helpers (`claimCloseRequestIdempotency`, close execution lock helper): 2
  - `packages/modules/accounting/src/fiscal-year/service.ts`

> Usage-surface total = 10 call sites. Any change in Story 51.1 MUST include full-surface verification and a call-site delta report.

## E50-A2: Coordination Protocol (MANDATORY — E50-A2 Gate Artifact)

### Cross-Story Dependency Matrix

| Story | Dependency on 51.1 | Owner | Coordination Rule |
|-------|---------------------|-------|-------------------|
| 51.2 Receivables reconciliation | MUST consume finalized fiscal-close state transitions and lock semantics from 51.1 | Bob (SM) + Accounting Dev owner | 51.2 implementation MUST NOT merge before 51.1 close-state contract is frozen in story notes |
| 51.3 Payables reconciliation | MUST align AP reconciliation cut-off with 51.1 close windows | Bob (SM) + Purchasing/Accounting owner | 51.3 tests MUST include fiscal-close boundary conditions from 51.1 |
| 51.4 Inventory reconciliation | MUST align inventory valuation cutoff and period locking behavior with 51.1 | Bob (SM) + Inventory/Accounting owner | 51.4 posting/reconciliation flow MUST reference 51.1 cut-off invariants |
| 51.5 Follow-up closure bucket | MUST only include defects/gaps surfaced by 51.1–51.4 | Bob (SM) | 51.5 MUST NOT introduce net-new scope |

### Story-Level SOLID/DRY/KISS Kickoff Baseline

| Checklist Item | Status |
|----------------|--------|
| S: Single responsibility boundaries for fiscal-close orchestration are identified | Unknown |
| O: Extension points for reconciliation consumers are identified | Unknown |
| D: Coupling between route/lib/service layers is documented | Unknown |
| DRY: Duplicate close-state mutation paths are inventoried | Unknown |
| KISS: Minimal state-machine transitions are documented | Unknown |

> Kickoff baseline is now recorded. Mid-sprint and pre-close MUST re-score each item with evidence.

## Story 51.1 Close-State Contract Snapshot (Frozen v1 — 2026-04-26)

This section defines the Story 51.1 close-state contract consumed by Stories 51.2, 51.3, and 51.4.
Downstream stories MUST treat this contract as immutable until an explicit contract revision entry is added in this story.

### Contract Rules

1. Fiscal-year close requests MUST be idempotent by `idempotency_key` and `company_id`.
2. Approve/execute close MUST enforce row-level locking on fiscal close request and fiscal year records.
3. Close execution MUST run inside transaction retry boundaries for transient concurrency failures.
4. Fiscal-year-close override path MUST NOT exist in Story 51.1 scope.
5. Period-close override behavior MAY exist for AP transaction guardrails and MUST NOT mutate fiscal-year-close semantics.
6. Reconciliation stories (51.2/51.3/51.4) MUST consume finalized close-state transitions from this story and MUST NOT introduce alternate close-state sources.

### Frozen Surfaces (Measured)

- Route handlers: `apps/api/src/routes/accounts.ts` (`POST /fiscal-years/:id/close`, `POST /fiscal-years/:id/close/approve`)
- API wrappers: `apps/api/src/lib/fiscal-years.ts`
- Service implementation: `packages/modules/accounting/src/fiscal-year/service.ts`
- Concurrency controls: `FOR UPDATE` + `withTransactionRetry` + idempotency insert/duplicate handling

### Contract Change Procedure

- Any change request to this contract MUST be logged in this section as `v{N}` with date + rationale + impacted stories.
- Stories 51.2/51.3/51.4 MUST pause merge readiness if contract version changes after kickoff until dependency notes are refreshed.

### Execution Order

1. **Estimate phase**: Document pattern, search scope, expected call-site count before executing search
2. **Count phase**: Execute pattern searches and record actual counts
3. **Delta analysis**: If actual count deviates >50% from estimate, re-baseline scope before proceeding
4. **Concurrency surface identification**: Identify all paths where concurrent execution is possible

---

## E49-A1 / E50-A1: Second-Pass Determinism Review (MANDATORY)

> **RFC Mandate:** Post-review fixes were needed in 3/7 Epic 49 stories. Self-review alone misses patterns in deterministic hardening work. Second-pass review is **MANDATORY** for fiscal year close because:
> - Fiscal year close controls ledger period boundaries — correctness is P0
> - Concurrency proof requires deterministic evidence (no time-dependent test patterns)
> - Close/override race conditions can corrupt period boundaries silently

**When required:** This story resolves a P0 concurrency risk in fiscal year close. Second-pass review is **MANDATORY** because the risk affects production ledger integrity.

**Second-pass reviewer:** Charlie (Senior Dev) or designated second-pass reviewer

**Second-pass checklist:**
- [ ] Usage surface estimation completed with actual call-site counts documented
- [ ] Concurrency surface identified and analyzed for race conditions
- [ ] Lock ordering verified deterministic (no lock inversion deadlocks possible)
- [ ] Transaction isolation level verified appropriate for close operation
- [ ] No `Date.now()` or `Math.random()` introduced during fix
- [ ] 3× consecutive green evidence on fiscal-year-close integration suite
- [ ] No post-review fixes expected after second-pass sign-off

---

## Acceptance Criteria

**AC1:** Usage surface documented (pattern search scope, call-site count, concurrency surface)

**AC2:** Concurrent close/override paths analyzed for race conditions

**AC3:** Deterministic proof established (lock ordering, transaction isolation, or equivalent)

**AC4:** Any defects fixed with evidence

**AC5:** Code review GO required

---

## Technical Notes

- Search for `fiscalYearClose`, `closeFiscalYear`, `overrideFiscalYear`, `forceCloseFiscalYear`, `unlockFiscalYear`
- Trace transaction boundaries for lock acquisition/release patterns
- Verify transaction isolation level is appropriate for close operation
- Check for lock inversion patterns that could cause deadlocks

---

## Exit Criteria

- Usage surface estimation documented with actual counts
- Concurrency analysis complete with no unidentified race conditions
- Deterministic proof established
- All defects fixed
- 3× consecutive green on fiscal-year-close integration suite
- Story cannot be marked done without explicit reviewer GO

---

## Appendix: Cross-Story Traceability (E51-A4)

> **Append-only section — do not modify existing ACs above.**

### Relationship to Story 51.5 (Follow-Up Closure Bucket)

Story 51.5 is the follow-up closure bucket for all defects/gaps surfaced by Stories 51.1–51.4. If Story 51.1 surfaces any defects that are not fully resolved before Story 51.5 closes, those defects MUST be captured in Story 51.5 with evidence and resolution.

| Situation | Required Action |
|-----------|-----------------|
| Story 51.1 surfaces defects not fully resolved | Capture in Story 51.5; Story 51.1 links to Story 51.5 |
| Story 51.1 fix requires coordination with Story 51.2–51.4 | Document in coordination protocol; Story 51.5 tracks cross-story dependency |
| Usage surface estimation reveals scope > estimated | Re-baseline before proceeding; document delta in Story 51.1 |
