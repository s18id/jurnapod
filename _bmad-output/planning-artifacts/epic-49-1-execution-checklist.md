# Epic 49.1 Execution Checklist — Kickoff Gate + Test Reliability Audit

> **Story:** `_bmad-output/implementation-artifacts/stories/epic-49/story-49.1.md`  
> **Status:** completed (49.1 kickoff complete; extraction execution deferred to 49.2+)  
> **Owner:** @bmad-sm (coordination), @bmad-dev (execution), @bmad-architect (boundary decisions)  
> **Prepared:** 2026-04-21

---

## Objective

Execute Story 49.1 with concrete, auditable steps and include the API-lib boundary migration queue intake so Sprint 49 starts with explicit ownership enforcement.

---

## Pre-Execution Prerequisites

- [x] Epic 48 artifacts are stable (48.1–48.5 done; 48.6 status acknowledged)
- [x] `scripts/validate-sprint-status.ts --epic 48` output attached
- [x] `scripts/validate-structure-conformance.ts` baseline output attached
- [x] This checklist linked in Story 49.1 working notes
- [x] Cleanup mandatory rule acknowledged: touched sprint scope requires cleanup before close
- [x] Fixture mode policy acknowledged: Full Fixture Mode default (production invariants and test invariants remain identical); Partial Fixture Mode only via decomposed domain parts provided by the same production package that owns the domain invariant, with explicit scope, rationale, and owner
- [x] No-new-business-trigger rule acknowledged

---

## AC1 — SOLID/DRY/KISS Kickoff Scorecard

Target output: `_bmad-output/planning-artifacts/epic-49-solid-dry-kiss-scorecard.md`

- [x] Create scorecard file using checklist template from program baseline
- [x] Set all kickoff items to `Unknown` initially
- [x] Record explicit `Fail` findings as backlog items assigned to 49.2–49.5
- [x] Add evidence references (lint/typecheck/integration logs)

Acceptance check:

- [x] Scorecard exists and contains full SOLID + DRY + KISS sections

---

## AC2 — Full Integration Suite Audit

Target output: `_bmad-output/planning-artifacts/epic-49-suite-audit.md`

- [x] Run scan for time-dependence (`Date.now`, `new Date`, `Math.random`)
- [x] Run scan for cleanup gaps (`afterAll`, `afterEach` without pool cleanup)
- [x] Run scan for RWLock usage gaps
- [x] Review persistent-table coupling risk (`fiscal_years`, `sync_versions`, `module_roles`, `company_modules`)
- [x] Produce structured table: File, Line(s), Pattern, Category, Severity, Owner, Story Assignment

Acceptance check:

- [x] Audit table covers **all** integration suites in `apps/api` and `packages/*`

---

## AC3 — Critical vs Non-Critical Suite Classification

- [x] Start from the 17 critical suites listed in Story 49.1
- [x] Classify every discovered suite as Critical/Non-critical
- [x] Mark sprint-close blockers explicitly
- [x] Add newly discovered critical suites from AC2 to final list

Acceptance check:

- [x] Final critical suite list is explicit and referenced by 49.2–49.7

---

## AC4 — Epic 49 Risk Register Initialization

Target output: `_bmad-output/planning-artifacts/epic-49-risk-register.md`

- [x] Create/register R49-001, R49-002, R49-003 from Story 49.1
- [x] Carry forward unresolved relevant risks from Epic 48
- [x] Add owner + SLA + mitigation + evidence path for each risk
- [x] Link each P1 risk to a specific story (49.2–49.6)

Boundary intake additions (from migration queue):

- [x] Add API-lib ownership drift risk (if not already captured)
- [x] Add parser/rule drift risk for structure validator (if not already captured)

Acceptance check:

- [x] Risk register has no TBD owner/SLA for P1 items

---

## AC5 — Baseline Integration Run Evidence

- [x] Execute baseline run for all critical suites once
- [x] Save log artifacts under `logs/epic-49-*`
- [x] For any failing suite, assign remediation story before hardening begins

Acceptance check:

- [x] Baseline run log linked in story notes with pass/fail per suite

---

## API-Lib Boundary Queue Intake (S49.1 Mandatory)

Reference: `_bmad-output/planning-artifacts/epic-49-api-lib-boundary-migration-queue.md`

### Q49-001 — Canonical fixture extraction
- [x] Follow execution pass document: `_bmad-output/planning-artifacts/epic-49-q49-001-test-fixtures-execution-pass-1.md`
- [x] Design target owner-package fixture APIs (`modules-platform`, `modules-accounting`, `modules-purchasing`) with `@jurnapod/db/test-fixtures` reserved for DB-generic primitives/assertions
- [x] Identify API routes/tests currently coupled to `apps/api/src/lib/test-fixtures.ts`
- [x] Create migration plan and acceptance tests

### Q49-002 — DB/audit infra extraction
- [x] Classify `db.ts`, `audit.ts`, `audit-logs.ts`, `batch.ts` ownership boundaries
- [x] Define package-level replacements in `packages/db`

### Q49-003 — Shared utility cleanup
- [x] List utility files moving to `packages/shared`
- [x] Confirm no domain invariants are mixed into utility modules

### Q49-004 — Purchasing package skeleton
- [x] Define `packages/modules/purchasing` package skeleton + public API
- [x] Capture constraints for S52/S53 extraction

### Q49-005 — Auth/platform extraction prep
- [x] Mark high-risk oversized files (`users.ts`, `companies.ts`, `settings.ts`) for S57
- [x] Record interim touch exceptions (if any) with owner/deadline

> Note: Queue intake is complete in Story 49.1. Execution of Q49-001..Q49-005 starts in 49.2+ per sprint touch-chain plan.

Acceptance check:

- [x] Queue intake status recorded for Q49-001..Q49-005

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

## Story Done Authority (MANDATORY)
The implementing developer MUST NOT mark their own story done. Done requires:
- Reviewer GO (code review approval with no blockers)
- Story owner explicit sign-off

No story may be marked DONE based solely on self-attestation of the implementing developer.

### Agent-Safe Documentation Language (MANDATORY)
All documentation, policy statements, and specifications MUST use RFC-style keywords: `MUST`, `MUST NOT`, `SHOULD`, `MAY`. Terms such as "should", "might", "could", "consider", "recommend", or "prefer" are forbidden in policy statements — they create ambiguity for agents executing against these documents. Where nuance is required, it MUST be expressed as an explicit conditional with a concrete example.

---

## Story 49.1 Done Criteria (Checklist Sign-off)

- [x] AC1 through AC5 complete with linked artifacts
- [x] Queue intake Q49-001..Q49-005 completed
- [x] No unassigned P1 findings
- [x] `sprint-status.yaml` updated for Story 49.1 when execution completes

**Sign-off:**  
Prepared by: @bmad-sm  
Execution owner: @bmad-dev  
Architecture approver: @bmad-architect
