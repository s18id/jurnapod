# Epic 49 SOLID/DRY/KISS Kickoff Scorecard

> **Epic:** 49 — Test Determinism + CI Reliability  
> **Sprint:** 49  
> **Phase:** Kickoff (Baseline — all items Unknown)  
> **Owner:** @bmad-dev  
> **Date:** 2026-04-21

---

## Purpose

This scorecard establishes the kickoff baseline for Epic 49 using the SOLID/DRY/KISS checklist from the program baseline (S48–S61). All items start at `Unknown` to be re-assessed at mid-sprint checkpoint and pre-close gate. Any `Fail` items become explicit tracked work in Stories 49.2–49.5.

---

## SOLID Principles

### S — Single Responsibility Principle

| Item | Status | Evidence / Notes |
|------|--------|------------------|
| Each integration suite has one clear purpose (financial, ACL, sync) | Unknown | Suite classification done in AC3; needs verification |
| Test helpers in `__test__/helpers/setup.ts` have single responsibility | Unknown | RWLock helpers vs fixture helpers co-located — needs review |
| No test file mixes concerns (e.g., fiscal-year-close mixed with AP recon) | Unknown | 4 suites hardened in Epic 48; remaining ~46 suites need audit |
| Stories 49.2–49.5 each target one concern category | Unknown | Depends on AC2 audit output |

**Fails to track:** TBD after AC2 audit

---

### O — Open/Closed Principle

| Item | Status | Evidence / Notes |
|------|--------|------------------|
| Test fixtures are extensible without modifying core helpers | Unknown | `test-fixtures.ts` in API lib — Q49-001 targets extraction to `@jurnapod/db/test-fixtures` |
| Pool cleanup hooks can be extended without changing test logic | Unknown | `afterAll` pattern exists; consistency across all suites not verified |
| RWLock helpers support future new consumer patterns | Unknown | `acquireReadLock`/`releaseReadLock` used only in 4 suites; broader adoption unknown |
| Structure conformance validator supports new rule addition | Unknown | `scripts/validate-structure-conformance.ts` — plugin model not verified |

**Fails to track:** TBD after Q49-001 extraction pass

---

### L — Liskov Substitution Principle

| Item | Status | Evidence / Notes |
|------|--------|-------------------|
| Fixtures produce consistent shapes regardless of call site | Unknown | Canonical fixtures not yet extracted — `createTestCompanyMinimal` varies by test |
| Pool cleanup is always called regardless of test outcome | Unknown | 4 suites with explicit cleanup; ~46 remaining suites need audit |
| RWLock release is always called even if test fails early | Unknown | Not verified across all suites |
| `vi.useFakeTimers()` usage doesn't break date-sensitive logic | Unknown | `login-throttle.test.ts` uses fake timers; other suites need review |

**Fails to track:** TBD after pool cleanup audit (AC2)

---

### I — Interface Segregation Principle

| Item | Status | Evidence / Notes |
|------|--------|-------------------|
| No test helper has more interfaces than needed | Unknown | `helpers/setup.ts` bundles RWLock + auth + fixtures |
| Each integration suite imports only what it needs | Unknown | Many suites import full `setup` even when only RWLock needed |
| Packages expose minimal fixture surface for consumers | Unknown | `@jurnapod/db` doesn't yet have `test-fixtures` package |
| Structure validator rules are independently actionable | Unknown | Single ruleset file — needs modularity review |

**Fails to track:** TBD after fixture extraction (Q49-001)

---

### D — Dependency Inversion Principle

| Item | Status | Evidence / Notes |
|------|--------|-------------------|
| Tests depend on abstract fixture contracts, not concrete implementations | Unknown | Tests call `createTestCompany*` directly from API lib |
| Tests use package fixtures, not API-lib-only helpers | Unknown | Q49-001 extraction in progress |
| Package boundaries are respected in tests (no `apps/*` imports in `packages/*` tests) | Unknown | Some package tests may import from `apps/api` — needs scan |
| Sync/idempotency tests depend on `client_tx_id` contract from shared, not API lib | Unknown | Epic 48.4 established contract; needs adoption verification |

**Fails to track:** TBD after Q49-001 and cross-package import scan

---

## DRY Principle

| Item | Status | Evidence / Notes |
|------|--------|-------------------|
| Canonical test fixtures defined once and reused | Unknown | `apps/api/src/lib/test-fixtures.ts` exists; extraction to `@jurnapod/db/test-fixtures` planned |
| Date/timestamp helpers used consistently | Unknown | 504 `Date.now()` usages found across api integration tests |
| `Math.random()`-based test codes are replaced with deterministic generators | Unknown | 88 `Math.random()` usages found across api integration tests |
| Pool cleanup is defined once and reused via `afterAll` helper | Unknown | Many `afterAll` calls; not all call `pool.end()` correctly |
| Tenant isolation fixtures are canonical (one helper per entity) | Unknown | `createTestCompanyMinimal` + `createTestOutlet` + `createTestUser` vary by suite |
| ACL permission test helpers use canonical role fixtures | Unknown | `getOrCreateTestCashierForPermission` exists; adoption across suites unknown |

**Fails to track:** R49-001 (time-dependent tests), R49-002 (pool cleanup gaps)

---

## KISS Principle

| Item | Status | Evidence / Notes |
|------|--------|-------------------|
| Each test suite has readable, linear setup → act → assert structure | Unknown | Some suites have deep nesting or implicit ordering |
| No test suite requires >3 `beforeAll` hooks chained | Unknown | Not measured — needs survey |
| Test helper composition is flat (no hidden call chains) | Unknown | `acquireReadLock` → implicit DB connection acquisition chain not documented |
| RWLock pattern is self-documenting | Unknown | Comment-only documentation; no type-safe enforcement |
| No test suite exceeds 30-second timeout under normal conditions | Unknown | Not measured — needs baseline run |

**Fails to track:** TBD after baseline integration run (AC5)

---

## Fails-to-Track Summary (from Kickoff Baseline)

### Kickoff Lint Debt Classification (E48-A1)

| Classification | Result | Evidence Path |
|----------------|--------|---------------|
| Sprint-introduced lint errors | None detected (`0` errors, lint exit `0`) | `_bmad-output/planning-artifacts/epic-49-logs/lint-api.log` |
| Pre-existing lint debt | `@typescript-eslint/no-explicit-any` warning baseline tracked as technical debt (TD-038) | `docs/adr/TECHNICAL-DEBT.md` (TD-038), `_bmad-output/planning-artifacts/epic-49-risk-register.md` (R49-003) |

**Kickoff classification note:** Epic 49 kickoff explicitly separates sprint-introduced lint errors from pre-existing debt per E48-A1. Lint baseline evidence is archived in `epic-49-logs/lint-api.log`; pre-existing debt remains tracked via TD-038.

| Finding | Category | Severity | Story Assignment |
|---------|----------|----------|------------------|
| 504 `Date.now()` usages in api integration tests | Time-dependent | P1 | 49.2, 49.3, 49.4, 49.5 |
| 88 `Math.random()` usages in api integration tests | Time-dependent | P1 | 49.2, 49.3, 49.4, 49.5 |
| Many suites lack `pool.end()` in `afterAll` | Pool cleanup | P1 | 49.2–49.5 |
| `test-fixtures.ts` not extracted to `@jurnapod/db/test-fixtures` | DRY / DIP | P1 | 49.1 (Q49-001) |
| RWLock usage only in 4 of ~50 critical suites | KISS / DIP | P2 | 49.2–49.5 |
| No cross-package import scan performed | DIP | P2 | 49.4 |
| `login-throttle.test.ts` uses `vi.useFakeTimers()` — needs coverage check | KISS | P3 | 49.4 |

---

## Mid-Sprint Checkpoint (TBD — to be filled at Sprint 49 midpoint)

| Principle | Score at Kickoff | Score at Midpoint | Delta |
|-----------|-----------------|-------------------|-------|
| SRP | Unknown | — | — |
| OCP | Unknown | — | — |
| LSP | Unknown | — | — |
| ISP | Unknown | — | — |
| DIP | Unknown | — | — |
| DRY | Unknown | — | — |
| KISS | Unknown | — | — |

---

## Pre-Close Gate (TBD — to be filled before Epic 49 close)

| Principle | Score at Kickoff | Score at Midpoint | Score at Pre-Close | Final Status |
|-----------|-----------------|-------------------|-------------------|--------------|
| SRP | Unknown | — | — | — |
| OCP | Unknown | — | — | — |
| LSP | Unknown | — | — | — |
| ISP | Unknown | — | — | — |
| DIP | Unknown | — | — | — |
| DRY | Unknown | — | — | — |
| KISS | Unknown | — | — | — |

---

## References

- Program baseline: `_bmad-output/planning-artifacts/sprint-48-61-correctness-first-architecture-blueprint.md`
- Epic 49 sprint plan: `_bmad-output/planning-artifacts/epic-49-sprint-plan.md`
- Story 49.1 spec: `_bmad-output/implementation-artifacts/stories/epic-49/story-49.1.md`
- Suite audit: `_bmad-output/planning-artifacts/epic-49-suite-audit.md`
- Risk register: `_bmad-output/planning-artifacts/epic-49-risk-register.md`
