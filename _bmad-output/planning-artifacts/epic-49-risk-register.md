# Epic 49 Risk Register

> **Epic:** 49 — Test Determinism + CI Reliability  
> **Sprint:** 49  
> **Owner:** @bmad-dev  
> **Date:** 2026-04-21  
> **Status:** Active

---

## Purpose

This risk register initializes Epic 49 tracking by carrying forward open items from Epic 48 and adding new risks discovered in the Story 49.1 audit (AC2 and AC4). Each risk has an explicit owner, SLA, and story assignment.

---

## Risk Register

### R49-001 — Undiscovered Time-Dependent Tests (P1)

| Field | Value |
|-------|-------|
| **Risk ID** | R49-001 |
| **Severity** | P1 |
| **Category** | Test Determinism — Time-Dependent |
| **Description** | Audit (AC2) found 504 `Date.now()` usages and 88 `Math.random()` usages across api integration suites. Without deterministic timestamp substitution, these tests are inherently flaky and will fail intermittently under load or time pressure. |
| **Owner** | @bmad-dev |
| **SLA** | Must be hardened in Stories 49.2–49.5 before 49.6 CI gate opens |
| **Status** | Open — mitigating via audit (AC2) |
| **Evidence** | `grep -rn "Date.now\|new Date()" apps/api/__test__/integration/ --include="*.test.ts" \| wc -l` → 504 matches  
`grep -rn "Math.random" apps/api/__test__/integration/ --include="*.test.ts" \| wc -l` → 88 matches |
| **Story Assignment** | 49.2 (accounting), 49.3 (purchasing), 49.4 (platform/ACL), 49.5 (sync/POS/inventory) |
| **Mitigation** | Replace all `Date.now()` usages with canonical timestamp fixtures; replace `Math.random()` with deterministic unique-id helpers |
| **Verification** | 3-consecutive-green rerun evidence per hardened suite |

---

### R49-002 — Pool Cleanup Gaps Across Broad Suite Set (P1)

| Field | Value |
|-------|-------|
| **Risk ID** | R49-002 |
| **Severity** | P1 |
| **Category** | Test Infrastructure — Resource Leaks |
| **Description** | Pool cleanup (`afterAll` with `pool.end()`) is present in some suites but not verified across all ~50 critical integration suites. Missing cleanup causes DB connection leaks, runner hangs, and cross-test pollution. |
| **Owner** | @bmad-dev |
| **SLA** | All critical suites must have verified pool cleanup before Story 49.6 CI gate |
| **Status** | Open — mitigating via AC2 audit |
| **Evidence** | `grep -rn "afterAll\|afterEach" apps/api/__test__/integration/ --include="*.test.ts"` → 292 matches (not all call `pool.end()`)  
Full suite audit in `_bmad-output/planning-artifacts/epic-49-suite-audit.md` |
| **Story Assignment** | 49.2–49.5 (per suite hardening) |
| **Mitigation** | Add explicit `afterAll(async () => { await pool.end(); })` to every suite; verify with `--detect-open-handles` |
| **Verification** | No runner hangs in CI; no connection exhaustion in 3-consecutive-green runs |

---

### R49-003 — Epic 48.6 Lint Debt Not Landed Before 49.6 CI Gate (P2)

| Field | Value |
|-------|-------|
| **Risk ID** | R49-003 |
| **Severity** | P2 |
| **Category** | CI/CD — Lint Gate Dependency |
| **Description** | Story 48.6 (Type/Lint Debt Containment) status is `done` per sprint-status.yaml, but lint baseline must be verified as green before Story 49.6 CI gate can close. If lint regressions exist, 49.6 cannot proceed. |
| **Owner** | @bmad-dev |
| **SLA** | Lint must be green before 49.6 begins (dependency gate) |
| **Status** | ✅ VERIFIED GREEN — 2026-04-21 baseline run |
| **Evidence** | `npm run lint -w @jurnapod/api` → 0 errors, 178 warnings, exit 0 ✅ |
| **Lint Log** | `_bmad-output/planning-artifacts/epic-49-logs/lint-api.log` (PID=285896) |
| **Story Assignment** | 49.6 (CI Pipeline Reliability Enforcement) |
| **Mitigation** | ✅ Lint green confirmed — R49-003 resolved |
| **Verification** | `npm run lint -w @jurnapod/api` exits 0 — confirmed 2026-04-21 |

---

### R49-004 — Canonical Fixtures Not Extracted to `@jurnapod/db/test-fixtures` (P1)

| Field | Value |
|-------|-------|
| **Risk ID** | R49-004 |
| **Severity** | P1 |
| **Category** | Architecture — Ownership Drift |
| **Description** | `apps/api/src/lib/test-fixtures.ts` is a high-coupling hub used across all integration tests. Keeping it in API lib blocks package-level reuse and creates a single point of ownership ambiguity. Q49-001 extraction is the first priority in the migration queue. |
| **Owner** | @bmad-dev |
| **SLA** | 49.1 intake/design must be complete; Pass 1 extraction starts in 49.2 and completes before 49.6 CI gate |
| **Status** | Open — intake complete; execution starts in 49.2 |
| **Evidence** | `_bmad-output/planning-artifacts/epic-49-q49-001-test-fixtures-execution-pass-1.md` |
| **Story Assignment** | 49.1 (intake/design) + 49.2–49.5 (execution + consumer flips) |
| **Mitigation** | Execute Q49-001 Pass 1 per execution plan; validate with `npm run build -w @jurnapod/db` |
| **Verification** | `packages/db/src/test-fixtures/` exists and is imported by at least one API integration suite |

---

### R49-005 — RWLock Pattern Adoption Limited to 4 Suites (P2)

| Field | Value |
|-------|-------|
| **Risk ID** | R49-005 |
| **Severity** | P2 |
| **Category** | Test Infrastructure — Concurrency Safety |
| **Description** | RWLock (`acquireReadLock`/`releaseReadLock`) is used only in 4 suites (fiscal-year-close, ap-reconciliation, ap-reconciliation-snapshots, period-close-guardrail). Many other suites may need RWLock protection but don't use it, risking concurrent DB access conflicts. |
| **Owner** | @bmad-dev |
| **SLA** | RWLock adoption assessment required in Stories 49.2–49.5 |
| **Status** | Open — assessment pending |
| **Evidence** | `grep -rn "acquireReadLock\|releaseReadLock" apps/api/__test__/integration/ --include="*.test.ts"` → 12 matches, only in 4 suites |
| **Story Assignment** | 49.2–49.5 (per suite assessment) |
| **Mitigation** | Audit suites for potential concurrent fixture mutation; add RWLock where needed |
| **Done Criteria (tightened 2026-04-21)** | (1) All 13 Epic-49-critical suites assessed for RWLock need; (2) Each suite either adopts RWLock or has documented rationale for not needing it; (3) No runner hangs in 3-consecutive-green runs |

---

### R49-006 — Shared Mutable State via Persistent Tables (P2)

| Field | Value |
|-------|-------|
| **Risk ID** | R49-006 |
| **Severity** | P2 |
| **Category** | Test Determinism — Ordering Dependencies |
| **Description** | Suites share state through persistent reference tables (`fiscal_years`, `sync_versions`, `module_roles`, `company_modules`). Without proper isolation, test ordering can affect outcomes. |
| **Owner** | @bmad-dev |
| **SLA** | Assessment in Stories 49.2–49.5 |
| **Status** | Open — assessment pending |
| **Evidence** | AC2 audit (suite-audit.md) identifies ordering dependencies as a category |
| **Story Assignment** | 49.2–49.5 |
| **Mitigation** | Identify fixture cleanup scope per suite; ensure each suite cleans its own reference data |
| **Done Criteria (tightened 2026-04-21)** | (1) Each Epic-49-critical suite has explicit cleanup for all persistent reference data it creates/modifies; (2) No suite relies on side-effects from another suite's setup; (3) Suites pass in randomized order (use `--shuffle` vitest flag); (4) No cross-suite pollution in 3-consecutive-green runs |

---

### R49-007 — Structure Conformance Validator Not Modular (P3)

| Field | Value |
|-------|-------|
| **Risk ID** | R49-007 |
| **Severity** | P3 |
| **Category** | Architecture — Maintainability |
| **Description** | Structure conformance validator (`scripts/validate-structure-conformance.ts`) is a single ruleset file. Adding new rules requires modifying the file directly, which could cause merge conflicts in team environments. |
| **Owner** | @bmad-dev |
| **SLA** | Future improvement — not blocking for Sprint 49 |
| **Status** | Open — acknowledged as technical debt |
| **Evidence** | Single-file implementation observed |
| **Story Assignment** | Backlog (no story assigned in Epic 49) |
| **Mitigation** | Document rule addition process; defer modularization to post-Sprint 49 |
| **Verification** | Rule addition documented; no immediate action required |

---

## Carry-Forward from Epic 48 (Relevant Open Items)

| Risk ID | Original Description | Carryforward Action |
|--------|---------------------|--------------------|
| (E48) R48-004 | Some integration suites had intermittent failures | Continue hardening in 49.2–49.5; 3-consecutive-green gate required |
| (E48) R48-007 | CI quality gate enforcement pending | Addressed in Story 49.6 |

---

## Risk Disposition Summary

| Risk ID | Severity | Status | Story Assignment | Disposition |
|---------|----------|--------|------------------|-------------|
| R49-001 | P1 | Open | 49.2–49.5 | Must fix — time-dependent tests |
| R49-002 | P1 | Open | 49.2–49.5 | Must fix — pool cleanup |
| R49-003 | P2 | ✅ VERIFIED GREEN | 49.6 | Lint baseline verified — 0 errors, 178 warnings |
| R49-004 | P1 | Open | 49.1 (Q49-001) | Must execute — fixture extraction |
| R49-005 | P2 | Open | 49.2–49.5 | Should fix — RWLock adoption |
| R49-006 | P2 | Open | 49.2–49.5 | Should fix — shared state |
| R49-007 | P3 | Open | Backlog | May defer — validator modularity |

---

## References

- Epic 49 sprint plan: `_bmad-output/planning-artifacts/epic-49-sprint-plan.md`
- Story 49.1 spec: `_bmad-output/implementation-artifacts/stories/epic-49/story-49.1.md`
- Suite audit: `_bmad-output/planning-artifacts/epic-49-suite-audit.md`
- SOLID/DRY/KISS scorecard: `_bmad-output/planning-artifacts/epic-49-solid-dry-kiss-scorecard.md`
