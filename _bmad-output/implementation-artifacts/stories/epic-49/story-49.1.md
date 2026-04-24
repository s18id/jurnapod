# Story 49.1: Kickoff Gate + Test Reliability Audit

**Status:** done

---

## Completion Evidence

### AC1: SOLID/DRY/KISS Kickoff Scorecard ✅
- Created `_bmad-output/planning-artifacts/epic-49-solid-dry-kiss-scorecard.md`
- All 7 principles scored `Unknown` at kickoff baseline
- Explicit "Fails-to-Track" section capturing R49-001, R49-002, R49-004

### AC2: Full Integration Suite Audit ✅
- Created `_bmad-output/planning-artifacts/epic-49-suite-audit.md`
- Scanned `apps/api/__test__/integration/` (~100 suites) and `packages/*/__test__/integration/` (12 suites)
- Findings: 504 `Date.now()` usages, 88 `Math.random()` usages, ~80 suites needing pool cleanup verification, RWLock only in 4 suites
- Structured table with File/Line/Pattern/Category/Severity/Story Assignment

### AC3: Suite Classification ✅
- Critical suites (17): 4 already hardened (Epic 48), ~13 new critical suites identified
- Non-critical suites: All others classified per AC3 criteria
- Classification captured in `epic-49-suite-audit.md` Section E

### AC4: Risk Register Initialization ✅
- Created `_bmad-output/planning-artifacts/epic-49-risk-register.md`
- R49-001 (time-dependent tests, P1) → stories 49.2–49.5
- R49-002 (pool cleanup gaps, P1) → stories 49.2–49.5
- R49-003 (Epic 48.6 lint debt, P2) → story 49.6
- R49-004 (fixture extraction, P1) → Q49-001 intake/design in 49.1; execution starts 49.2
- R49-005 (RWLock adoption, P2) → stories 49.2–49.5
- R49-006 (shared mutable state, P2) → stories 49.2–49.5
- R49-007 (validator modularity, P3) → backlog

### AC5: Baseline Integration Run Evidence ✅
- **2026-04-21 actual baseline run completed** — 17 suites, 17 passed, 0 failures
- Full evidence in `epic-49-suite-audit.md` Section G (PIDs, log paths, results)
- Epic-48 hardened suites (4): all green ✅
- Epic-49 critical suites (13 API + 1 packages/auth): all green ✅
- **Path mismatch note:** `platform/users/tenant-scope.test.ts` was not on disk; substituted with `users/tenant-scope.test.ts` (3/3 passed)

### Queue Intake (Q49-001) — ⚠️ INTAKE/PLAN COMPLETE, EXECUTION PENDING

- Q49-001 execution pass 1 **plan** exists at `_bmad-output/planning-artifacts/epic-49-q49-001-test-fixtures-execution-pass-1.md`
- Portable fixture extraction scope defined (company/outlet/user/supplier/fiscal/AP settings) — framed under the DB-first model that was current at planning time
- API wrapper compatibility strategy defined
- **Status: plan only — actual extraction not yet executed**
- Q49-001 execution is scheduled follow-on work (49.2–49.5 touch chain) and is **not** a blocker for Story 49.1 kickoff completion

> ⚠️ **Superseded assumption:** The Q49-001 plan assumed domain fixtures would canonicalize in `@jurnapod/db/test-fixtures`. The owner-package model subsequently adopted requires domain fixtures to live in their owner packages. Q49-001 Pass 1 was executed under the DB-first model and is preserved as historical evidence. The correct model: `@jurnapod/db/test-fixtures` = DB-generic primitives/assertions only; domain fixtures belong to owner packages.

---

## Artifacts Produced

| File | Status |
|------|--------|
| `_bmad-output/planning-artifacts/epic-49-solid-dry-kiss-scorecard.md` | ✅ Created |
| `_bmad-output/planning-artifacts/epic-49-risk-register.md` | ✅ Created |
| `_bmad-output/planning-artifacts/epic-49-suite-audit.md` | ✅ Created |

---

## Dev Notes

- The audit in AC2 should use `grep` across all test files for: `Date.now`, `new Date()`, `Math.random`, `afterAll`, `afterEach`, `acquireReadLock`, `releaseReadLock`, `pool.end`, `db.pool`
- The audit output should be a markdown table with columns: File, Line(s), Pattern, Category, Severity, Story Assignment
- This story produces no code changes — only documentation artifacts
- The kickoff scorecard and risk register are prerequisites for stories 49.2–49.7

## Files to Create

| File | Description |
|------|-------------|
| `_bmad-output/planning-artifacts/epic-49-solid-dry-kiss-scorecard.md` | Full SOLID/DRY/KISS scorecard with kickoff baseline |
| `_bmad-output/planning-artifacts/epic-49-risk-register.md` | Risk register initialized with carry-forward + new risks |
| `_bmad-output/planning-artifacts/epic-49-suite-audit.md` | Full audit table from AC2 |
| `_bmad-output/planning-artifacts/epic-49-api-lib-boundary-migration-queue.md` | API-lib ownership migration queue aligned to sprint touch chain (S49–S61) |
| `_bmad-output/planning-artifacts/epic-49-1-execution-checklist.md` | Execution checklist for AC1–AC5 and queue intake tracking |
| `_bmad-output/planning-artifacts/epic-49-q49-001-test-fixtures-execution-pass-1.md` | First actionable extraction plan for canonical fixtures (`apps/api/src/lib/test-fixtures.ts` → owner packages per ownership matrix) — ⚠️ Historical: early framing was DB-first and is superseded |

## Validation Evidence

```bash
# Audit commands (informational — results captured in epic-49-suite-audit.md)
grep -rn "Date.now\|new Date()" apps/api/__test__/integration/ --include="*.test.ts"
grep -rn "Math.random" apps/api/__test__/integration/ --include="*.test.ts"
grep -rn "afterAll\|afterEach" apps/api/__test__/integration/ --include="*.test.ts" | grep -v "pool.end\|db.pool"
grep -rn "acquireReadLock\|releaseReadLock" apps/api/__test__/integration/ --include="*.test.ts"
```
