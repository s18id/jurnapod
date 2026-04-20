# Epic 49.1 Execution Checklist — Kickoff Gate + Test Reliability Audit

> **Story:** `_bmad-output/implementation-artifacts/stories/epic-49/story-49.1.md`  
> **Status:** ready-to-execute  
> **Owner:** @bmad-sm (coordination), @bmad-dev (execution), @bmad-architect (boundary decisions)  
> **Prepared:** 2026-04-21

---

## Objective

Execute Story 49.1 with concrete, auditable steps and include the API-lib boundary migration queue intake so Sprint 49 starts with explicit ownership enforcement.

---

## Pre-Execution Prerequisites

- [ ] Epic 48 artifacts are stable (48.1–48.5 done; 48.6 status acknowledged)
- [ ] `scripts/validate-sprint-status.ts --epic 48` output attached
- [ ] `scripts/validate-structure-conformance.ts` baseline output attached
- [ ] This checklist linked in Story 49.1 working notes

---

## AC1 — SOLID/DRY/KISS Kickoff Scorecard

Target output: `_bmad-output/planning-artifacts/epic-49-solid-dry-kiss-scorecard.md`

- [ ] Create scorecard file using checklist template from program baseline
- [ ] Set all kickoff items to `Unknown` initially
- [ ] Record explicit `Fail` findings as backlog items assigned to 49.2–49.5
- [ ] Add evidence references (lint/typecheck/integration logs)

Acceptance check:

- [ ] Scorecard exists and contains full SOLID + DRY + KISS sections

---

## AC2 — Full Integration Suite Audit

Target output: `_bmad-output/planning-artifacts/epic-49-suite-audit.md`

- [ ] Run scan for time-dependence (`Date.now`, `new Date`, `Math.random`)
- [ ] Run scan for cleanup gaps (`afterAll`, `afterEach` without pool cleanup)
- [ ] Run scan for RWLock usage gaps
- [ ] Review persistent-table coupling risk (`fiscal_years`, `sync_versions`, `module_roles`, `company_modules`)
- [ ] Produce structured table: File, Line(s), Pattern, Category, Severity, Owner, Story Assignment

Acceptance check:

- [ ] Audit table covers **all** integration suites in `apps/api` and `packages/*`

---

## AC3 — Critical vs Non-Critical Suite Classification

- [ ] Start from the 17 critical suites listed in Story 49.1
- [ ] Classify every discovered suite as Critical/Non-critical
- [ ] Mark sprint-close blockers explicitly
- [ ] Add newly discovered critical suites from AC2 to final list

Acceptance check:

- [ ] Final critical suite list is explicit and referenced by 49.2–49.7

---

## AC4 — Epic 49 Risk Register Initialization

Target output: `_bmad-output/planning-artifacts/epic-49-risk-register.md`

- [ ] Create/register R49-001, R49-002, R49-003 from Story 49.1
- [ ] Carry forward unresolved relevant risks from Epic 48
- [ ] Add owner + SLA + mitigation + evidence path for each risk
- [ ] Link each P1 risk to a specific story (49.2–49.6)

Boundary intake additions (from migration queue):

- [ ] Add API-lib ownership drift risk (if not already captured)
- [ ] Add parser/rule drift risk for structure validator (if not already captured)

Acceptance check:

- [ ] Risk register has no TBD owner/SLA for P1 items

---

## AC5 — Baseline Integration Run Evidence

- [ ] Execute baseline run for all critical suites once
- [ ] Save log artifacts under `logs/epic-49-*`
- [ ] For any failing suite, assign remediation story before hardening begins

Acceptance check:

- [ ] Baseline run log linked in story notes with pass/fail per suite

---

## API-Lib Boundary Queue Intake (S49.1 Mandatory)

Reference: `_bmad-output/planning-artifacts/epic-49-api-lib-boundary-migration-queue.md`

### Q49-001 — Canonical fixture extraction
- [ ] Follow execution pass document: `_bmad-output/planning-artifacts/epic-49-q49-001-test-fixtures-execution-pass-1.md`
- [ ] Design target `packages/db/test-fixtures.ts` API
- [ ] Identify API routes/tests currently coupled to `apps/api/src/lib/test-fixtures.ts`
- [ ] Create migration plan and acceptance tests

### Q49-002 — DB/audit infra extraction
- [ ] Classify `db.ts`, `audit.ts`, `audit-logs.ts`, `batch.ts` ownership boundaries
- [ ] Define package-level replacements in `packages/db`

### Q49-003 — Shared utility cleanup
- [ ] List utility files moving to `packages/shared`
- [ ] Confirm no domain invariants are mixed into utility modules

### Q49-004 — Purchasing package skeleton
- [ ] Define `packages/modules/purchasing` package skeleton + public API
- [ ] Capture constraints for S52/S53 extraction

### Q49-005 — Auth/platform extraction prep
- [ ] Mark high-risk oversized files (`users.ts`, `companies.ts`, `settings.ts`) for S57
- [ ] Record interim touch exceptions (if any) with owner/deadline

Acceptance check:

- [ ] Queue intake status recorded for Q49-001..Q49-005

---

## Validation Commands

```bash
# Sprint status integrity and gate checks
npx tsx scripts/validate-sprint-status.ts
npx tsx scripts/validate-sprint-status.ts --epic 48

# Structure conformance ratchet (baseline-aware; no origin/main dependency)
npx tsx scripts/validate-structure-conformance.ts

# Story 49.1 audit commands
grep -rn "Date.now\|new Date()" apps/api/__test__/integration/ --include="*.test.ts"
grep -rn "Math.random" apps/api/__test__/integration/ --include="*.test.ts"
grep -rn "afterAll\|afterEach" apps/api/__test__/integration/ --include="*.test.ts" | grep -v "pool.end\|db.pool"
grep -rn "acquireReadLock\|releaseReadLock" apps/api/__test__/integration/ --include="*.test.ts"
```

---

## Blocker Log

| Date | Blocker | Severity | Owner | Resolution Plan |
|---|---|---|---|---|
| — | — | — | — | — |

---

## Story 49.1 Done Criteria (Checklist Sign-off)

- [ ] AC1 through AC5 complete with linked artifacts
- [ ] Queue intake Q49-001..Q49-005 completed
- [ ] No unassigned P1 findings
- [ ] `sprint-status.yaml` updated for Story 49.1 when execution completes

**Sign-off:**  
Prepared by: @bmad-sm  
Execution owner: @bmad-dev  
Architecture approver: @bmad-architect
