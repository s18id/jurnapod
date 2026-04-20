# Epic 48 Risk Register — Correctness-First Stability Lockdown

> Sprint: 48
> 
> Last Updated: 2026-04-20
> 
> Status Scale: `open`, `mitigating`, `blocked`, `closed`

---

## Severity Model

- **P0**: Immediate correctness/security failure (financial corruption, tenant leak, auth bypass)
- **P1**: High-likelihood correctness/reliability risk requiring sprint resolution
- **P2**: Important maintainability risk; resolve if in touched scope
- **P3**: Improvement backlog

---

## Active Risks (Sprint 48 Scope)

| Risk ID | Severity | Domain | Risk Statement | Trigger / Symptom | Mitigation Plan | Owner | SLA | Status |
|---------|----------|--------|----------------|-------------------|-----------------|-------|-----|--------|
| R48-000 | P1 | quality-gate/process | Kickoff lint gate fails on pre-existing eslint errors, blocking progression to hardening stories per sprint gate policy | `npm run lint -w @jurnapod/api` exits non-zero | Triage lint errors, classify as in-scope incidental fixes vs deferred action items, then re-run kickoff gate | @bmad-sm | Sprint 48 Day 1 | open |
| R48-001 | P1 | accounting/fiscal-control | Concurrency race around close/approve/override could yield inconsistent close behavior | Non-deterministic status transitions under parallel requests | Add deterministic lock/retry + concurrency integration tests | @bmad-dev | Sprint 48 | open |
| R48-002 | P1 | purchasing-ap | AP reconciliation/snapshot paths may regress under date/time edge boundaries | Cutoff mismatch around local business date | Harden cutoff tests and date normalization paths | @bmad-dev | Sprint 48 | open |
| R48-003 | P1 | db/migrations | Migration behavior may diverge between MySQL and MariaDB | Migration passes in one DB and fails in another | Execute dual-DB checks and rerunnable migration verification | @bmad-architect | Sprint 48 | open |
| R48-004 | P1 | test-infra | Flaky integration behavior may hide real correctness failures | Same suite alternates pass/fail without code changes | Stabilize fixture lifecycle and rerun protocol | @bmad-qa | Sprint 48 | open |
| R48-005 | P1 | process/quality gate | P0/P1 findings might be deferred due to weak closure rules | Sprint marked done with unresolved critical findings | Enforce pre-close no-P0/P1 gate and adversarial GO/NO-GO | @bmad-sm | Sprint 48 | open |
| R48-006 | P2 | api code quality | Touched hotspots retain high `any`/lint debt, reducing confidence in fixes | Type holes in files under active bugfix | Apply touched-scope debt containment only | @bmad-dev | Sprint 48 | open |

---

## Risk Review Cadence

1. **Kickoff:** confirm severity, owner, SLA, and mitigation scope
2. **Midpoint:** update status and escalate unresolved P1 blockers
3. **Pre-close:** unresolved P0/P1 must be `closed` or sprint is NO-GO

---

## Evidence Expectations Per Risk

- Reproduction artifact (test/log)
- Fix PR/work evidence
- Regression validation artifact
- Final disposition note (closed or carry-over with explicit approval)

---

## Carry-Over Policy

- P0/P1 carry-over is not allowed without explicit program-level exception approval.
- P2/P3 carry-over must include owner + next sprint target + success criterion.
