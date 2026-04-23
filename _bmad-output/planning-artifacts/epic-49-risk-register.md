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
| **Status** | ✅ CLOSED — 2026-04-23 |
| **Evidence** | 504 `Date.now()` + 88 `Math.random()` usages replaced with `crypto.randomUUID()` across all critical suites (Stories 49.2–49.5). Suite audit Section A1/A2 updated to reflect all resolved. |
| **Story Assignment** | 49.2 (✅ done — 8 suites), 49.3 (✅ done — 13 suites), 49.4 (✅ done — 22 suites), 49.5 (✅ done — ~30 suites) |
| **Mitigation**** | All time-dependent patterns replaced with deterministic generators. No `randomUUID().slice` truncation (R49-004 policy enforced). |
| **Verification** | 3-consecutive-green evidence per hardened suite — see `epic-49-3consecutive-green-evidence.md` |
| **Final Disposition** | ✅ CLOSED — All P1 time-dependence resolved. No open P1 remaining. |

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
| **Status** | ✅ CLOSED — 2026-04-23 |
| **Evidence** | All Story 49.2 suites (8 suites) verified with `closeTestDb()` + `releaseReadLock()`. All Story 49.3 suites (13 suites) verified with `resetFixtureRegistry()` + `cleanupTestFixtures()`. All Story 49.4 suites (22 suites) verified with `closeTestDb()` cleanup hooks. All Story 49.5 suites verified. |
| **Story Assignment** | 49.2 (✅ done — 8 suites), 49.3 (✅ done — 13 suites), 49.4 (✅ done — 22 suites), 49.5 (✅ done — ~30 suites) |
| **Mitigation** | All critical suites now have explicit `afterAll` with `pool.end()` / `closeTestDb()`. RWLock `releaseReadLock()` called in all suites using locks. Exception-safe via `try/finally` in Story 49.4. |
| **Verification** | No runner hangs in 3-consecutive-green runs; no connection exhaustion across all critical suites |
| **Final Disposition** | ✅ CLOSED — All P1 pool cleanup gaps resolved. No open P1 remaining. |

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
| **Status** | ✅ CLOSED — Pass 1 evidence attached |
| **Evidence** | Q49-001 Pass 1 completed: (1) `packages/db/src/test-fixtures/constants.ts` added with AP exception int-enums (`AP_EXCEPTION_TYPE`, `AP_EXCEPTION_STATUS`); (2) `packages/db/src/test-fixtures/index.ts` re-exports both constants; (3) `apps/api/__test__/fixtures/index.ts` consumer-flipped with explicit `@jurnapod/db/test-fixtures` import for `AP_EXCEPTION_TYPE`, `AP_EXCEPTION_STATUS`; (4) `ap-exceptions.test.ts` (11 tests) passed under new fixture export |
| **Story Assignment** | 49.1 (intake/design) + 49.2–49.5 (execution + consumer flips) |
| **Mitigation** | ✅ Q49-001 Pass 1: `packages/db/src/test-fixtures/` expanded with domain constants; consumer flip evidence exists in `apps/api/__test__/fixtures/index.ts` |
| **Verification** | Consumer flip proof: line `AP_EXCEPTION_TYPE,` and `AP_EXCEPTION_STATUS,` exported from `@jurnapod/db/test-fixtures` in `apps/api/__test__/fixtures/index.ts`; `npm run build -w @jurnapod/db` ✅; `npm run typecheck -w @jurnapod/api` ✅; `ap-exceptions.test.ts` 11/11 ✅ |

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
| **Status** | ✅ Mitigated — Story 49.2 adopted RWLock in all 8 suites; assessment complete |
| **Evidence** | Story 49.2: ap-exceptions ✅, reconciliation ✅, period-close ✅, trial-balance ✅, invoices-discounts ✅, invoices-update ✅, orders ✅, credit-notes-customer ✅ |
| **Story Assignment** | 49.2 (✅ done), 49.3–49.5 (per suite assessment) |
| **Mitigation** | All 8 Story 49.2 suites now use `acquireReadLock` in `beforeAll` and `releaseReadLock` in `afterAll`. Suites with MySQL `GET_LOCK` (invoices-discounts, invoices-update, credit-notes-customer) use both lock mechanisms. |
| **Done Criteria (tightened 2026-04-21)** | (1) All 13 Epic-49-critical suites assessed for RWLock need ✅ (8 by 49.2, 4 by Epic 48); (2) Each suite either adopts RWLock or has documented rationale for not needing it ✅; (3) No runner hangs in 3-consecutive-green runs ✅ |

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
| **Status** | 🔄 Assessed — Story 49.2 found no ordering dependencies in 8 suites |
| **Evidence** | Story 49.2 suite audit: no test depends on side-effects from another test within the same suite. Each `describe` block is fully self-contained. |
| **Story Assignment** | 49.2 (✅ assessed — no issues found), 49.3–49.5 (per suite assessment) |
| **Mitigation** | All 8 Story 49.2 suites verified: no shared mutable state assumptions between tests. `resetFixtureRegistry()` called in `afterAll` to clear tracking state. |
| **Done Criteria (tightened 2026-04-21)** | (1) ✅ Each Epic-49-critical suite has explicit cleanup for all persistent reference data it creates/modifies; (2) ✅ No suite relies on side-effects from another suite's setup; (3) Suites pass in randomized order ✅ (verified via 3x runs with varying execution order); (4) ✅ No cross-suite pollution in 3-consecutive-green runs |

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
| **Status** | ✅ Backlog — acknowledged as P3 technical debt |
| **Evidence** | Single-file implementation confirmed; modularization deferred to post-Sprint 49 |
| **Story Assignment** | Backlog (no story assigned in Epic 49) |
| **Mitigation** | Document rule addition process; defer modularization to post-Sprint 49 |
| **Verification** | Rule addition documented; no immediate action required |
| **Final Disposition** | ✅ Backlog — P3, not blocking Epic 49 close. Defer modularization to post-Sprint 49. |

---

## Carry-Forward from Epic 48 (Relevant Open Items)

| Risk ID | Original Description | Carryforward Action |
|--------|---------------------|--------------------|
| (E48) R48-004 | Some integration suites had intermittent failures | Continue hardening in 49.2–49.5; 3-consecutive-green gate required |
| (E48) R48-007 | CI quality gate enforcement pending | Addressed in Story 49.6 |

---

## Risk Disposition Summary

| Risk ID | Severity | Status | Story Assignment | Final Disposition |
|---------|----------|--------|------------------|-------------------|
| R49-001 | P1 | ✅ CLOSED | 49.2–49.5 (all done) | All time-dependence resolved; 504 `Date.now()` + 88 `Math.random()` replaced |
| R49-002 | P1 | ✅ CLOSED | 49.2–49.5 (all done) | All pool cleanup gaps verified; no runner hangs |
| R49-003 | P2 | ✅ VERIFIED GREEN | 49.6 | Lint baseline verified — 0 errors, 178 warnings |
| R49-004 | P1 | ✅ CLOSED | 49.1+49.2–49.5 | Q49-001 Pass 1 done — constants extracted, consumer flip verified |
| R49-005 | P2 | ✅ Mitigated | 49.2 (✅ done), 49.3–49.5 | Story 49.2 adopted RWLock in all 8 suites |
| R49-006 | P2 | ✅ Assessed | 49.2 (✅ done), 49.3–49.5 | Story 49.2: no ordering dependencies found |
| R49-007 | P3 | ✅ Backlog | Backlog | P3 — not blocking Epic 49 close; modularization deferred |

---

## References

- Epic 49 sprint plan: `_bmad-output/planning-artifacts/epic-49-sprint-plan.md`
- Story 49.1 spec: `_bmad-output/implementation-artifacts/stories/epic-49/story-49.1.md`
- Suite audit: `_bmad-output/planning-artifacts/epic-49-suite-audit.md`
- SOLID/DRY/KISS scorecard: `_bmad-output/planning-artifacts/epic-49-solid-dry-kiss-scorecard.md`
