# Epic 48: Correctness-First Stability Lockdown (Wave A)

**Status:** in-progress
**Theme:** Architecture Program — Correctness Baseline
**Started:** 2026-04-21
**Completed:** —

## Context

Epic 48 is the first sprint of the S48–S61 Correctness-First Architecture Program. The goal is to establish a deterministic correctness baseline by freezing architecture scope, triaging fragility by severity, and hardening the most critical regression paths before deeper module extraction in later sprints.

This sprint is governed by the program baseline:
- `_bmad-output/planning-artifacts/sprint-48-61-correctness-first-architecture-blueprint.md`
- Priority: `Correctness > Safety > Speed`
- No net-new features in sprint scope

A hard prerequisite gate must pass before Story 48.2+:
1. Sprint 48 kickoff scorecard created (`epic-48-solid-dry-kiss-scorecard.md`)
2. Sprint 48 risk register initialized (`epic-48-risk-register.md`)
3. Baseline gate evidence captured (lint, typecheck, critical integration logs)

## Goals

1. Freeze module ownership map and register top correctness risks with evidence paths
2. Harden financial correctness around period-close, snapshot, and reconciliation paths
3. Enforce migration reliability (dual-DB), integration test determinism, and CI quality gates

## Stories

| Story | Title | Status | Est | Actual |
|-------|-------|--------|-----|--------|
| 48.1 | Architecture Truth Map & Risk Register Freeze | done | 2h | — |
| 48.2 | Financial Correctness Hardening Pack | done | 4h | — |
| 48.3 | Migration Reliability Gate Hardening | done | 3h | — |
| 48.4 | Integration Test Determinism Hardening | done | 3h | — |
| 48.5 | CI Quality Gate Enforcement | done | 2h | — |
| 48.6 | Type/Lint Debt Containment (Touched-Hotspots Only) | ready-for-dev | 2h | — |
| 48.7 | Canonical File Structure Rules (v1) | done | 2h | — |
| 48.8 | File Structure Baseline & Gap Register | done | 2h | — |
| 48.9 | CI Ratchet Gate — Structure Conformance | done | 2h | — |

## Success Criteria

- [ ] Stories 48.1–48.9 status updated with evidence
- [ ] Kickoff, midpoint, and pre-close SOLID/DRY/KISS scoring completed
- [ ] No unresolved P0/P1 findings in sprint scope
- [ ] Adversarial review verdict is GO
- [ ] Baseline reliability evidence logs attached

## Dependencies

- Epic 47 (AP Reconciliation) — base integration tests for reconciliation, period close
- Program baseline: `sprint-48-61-correctness-first-architecture-blueprint.md`

## Risks

| Risk | Mitigation |
|------|------------|
| Hidden race windows in period-close flows | Concurrency tests + deterministic lock/retry behavior required |
| Regression flakiness masks real correctness issues | Require repeated-run evidence in critical suites |
| Non-portable migration introduces environment-specific failures | Dual-DB validation and rerunnable migration checks |
| Scope drift into broad refactor | Enforce narrow defect-linked changes only |
| P0/P1 issues deferred to "later" | Sprint close gate blocks closure until resolved |

## Notes

- Dependency graph: 48.1 → 48.2 → {48.3, 48.4} → 48.5 → 48.6 → {48.7, 48.8} → 48.9
- Story 48.6 is P2 (non-blocking unless correctness-related)
- Artifacts: `epic-48-solid-dry-kiss-scorecard.md`, `epic-48-risk-register.md`
- Validation: `npm run lint -w @jurnapod/api`, `npm run typecheck -w @jurnapod/api`

## Retrospective

See: [Epic 48 Retrospective](./epic-48.retrospective.md) _(not yet created — epic in-progress)_
