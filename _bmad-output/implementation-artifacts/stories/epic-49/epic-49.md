# Epic 49: Test Determinism + CI Reliability

**Status:** backlog
**Theme:** Architecture Program — Test Reliability (Sprint 49)
**Started:** —
**Completed:** —

## Context

Sprint 48 (Correctness-First Stability Lockdown) established the architecture baseline and hardened 4 critical suites (fiscal-year-close, ap-reconciliation, ap-reconciliation-snapshots, period-close-guardrail) with 3-consecutive-green evidence. Sprint 49 deepens this across **all remaining critical integration suites** to achieve a project-wide stable test baseline.

The exit gate for Sprint 49 is: **3 consecutive green reruns on all critical integration test suites**, producing evidence logs that demonstrate deterministic behavior across the full integration suite portfolio.

Epic 48's test determinism story (48.4) was partial — it established the rerun protocol and fixed the 4 critical suites in scope for fiscal-close and AP reconciliation. Epic 49 extends that work to the remaining suites, addressing:
- Flaky test isolation (persistent/shared tables like `fiscal_years`, `sync_versions`, `module_roles`, `company_modules`)
- Time-dependent assertions (wall-clock `Date.now()` usage instead of deterministic timestamps)
- Pool cleanup gaps (missing `afterAll` cleanup causing DB pool hangs or cross-test pollution)
- Fixture ordering dependencies (implicit reliance on clean-state or insertion order)
- Critical path coverage gaps (suites not yet running in full CI pipeline)

## Goals

1. Achieve 3-consecutive-green reruns on **all** critical integration suites (accounting, purchasing, platform/ACL, sync/POS, inventory)
2. Enforce CI pipeline reliability as a formal sprint gate with evidence capture
3. Establish a deterministic test baseline that eliminates flaky-test noise masking real correctness regressions
4. Score SOLID/DRY/KISS at kickoff, midpoint, and pre-close gates

## Stories

| Story | Title | Status | Est | Actual |
|-------|-------|--------|-----|--------|
| 49.1 | Kickoff Gate + Test Reliability Audit | backlog | — | — |
| 49.2 | Accounting Suite Determinism Hardening | backlog | — | — |
| 49.3 | Purchasing Suite Determinism Hardening | backlog | — | — |
| 49.4 | Platform + ACL Suite Determinism Hardening | backlog | — | — |
| 49.5 | Sync + POS + Inventory Suite Determinism Hardening | backlog | — | — |
| 49.6 | CI Pipeline Reliability Enforcement | backlog | — | — |
| 49.7 | Pre-Close Validation + Final SOLID/DRY/KISS Gate | backlog | — | — |

## Success Criteria

- [ ] ALL critical integration test suites pass 3 consecutive green reruns with evidence logs
- [ ] No unresolved P0/P1 findings in sprint scope
- [ ] CI pipeline enforces lint, typecheck, and integration test gates on every PR
- [ ] SOLID/DRY/KISS pre-close scoring shows all items Pass
- [ ] Adversarial review verdict is GO
- [ ] Sprint 48 risk register carry-forward risks updated with Epic 49 disposition

## Dependencies

- Epic 48.4 (Integration Test Determinism Hardening) — provides rerun protocol template
- Epic 48.5 (CI Quality Gate Enforcement) — provides `validate-sprint-status.ts` script
- Epic 48.6 (Type/Lint Debt Containment) — must land before 49.6 CI gate can be fully closed (lint/typecheck must be green)

## Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Undiscovered time-dependent tests in untested suites cause intermittent failures during 3-rerun gate | P1 | Story 49.1 audit must catalog ALL `Date.now()`, `new Date()`, and `Math.random()` usages in integration test files |
| Pool cleanup gaps in broad suite set cause cross-test pollution or hangs | P1 | Every suite modified in 49.2–49.5 must have explicit `afterAll` pool cleanup verified |
| Some suites have deep fixture ordering dependencies that are non-trivial to remove | P2 | Tag fundamentally non-deterministic suites with skip reason; move to Story 49.7 backlog |
| CI runner resources insufficient for 3×all-suites rerun matrix | P2 | Prioritize critical suites (financial + ACL) in CI; secondary suites run in extended runner |
| Epic 48.6 (lint debt) not landed before 49.6 CI gate closes | P2 | 49.6 CI gate must pass lint/typecheck; 48.6 is pre-requisite for 49.6 |

## Notes

- **Scope restriction**: No changes to `apps/backoffice` or `apps/pos` (architecture-first freeze). All test hardening targets `apps/api` and `packages/*` integration suites only.
- **No new features**: All changes are bug-fix, fixture cleanup, and deterministic hardening only.
- **Priority order**: `Correctness > Safety > Speed`
- **Epic 48 carry-over**: R48-006 (lint debt, P2) remains open. Story 49.6 CI gate depends on lint/typecheck being green — Epic 48.6 must land first.
- **"Critical" suite definition**: Suites that exercise financial correctness (journal posting, AP/AR, period close), ACL/tenant scoping, or sync/idempotency contracts. All other suites are "non-critical" and run in CI but do not block sprint close.

## Retrospective

See: [Epic 49 Retrospective](./epic-49.retrospective.md)
