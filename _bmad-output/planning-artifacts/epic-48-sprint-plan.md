# Sprint Plan: Epic 48

> **Epic:** Correctness-First Stability Lockdown (Wave A Kickoff)
> **Duration:** 1 sprint (2 weeks)
> **Goal:** Establish a deterministic correctness baseline by freezing architecture scope, triaging fragility by severity, and hardening the most critical regression paths before deeper module extraction in later sprints.

---

## Program Alignment (MANDATORY)

This sprint is governed by:

- `_bmad-output/planning-artifacts/sprint-48-61-correctness-first-architecture-blueprint.md`
- Priority: `Correctness > Safety > Speed`
- No net-new features in sprint scope

---

## Hard Prerequisite Gate (Must Pass Before Story 48.2+)

1. Sprint 48 kickoff scorecard created (`epic-48-solid-dry-kiss-scorecard.md`)
2. Sprint 48 risk register initialized (`epic-48-risk-register.md`)
3. Baseline gate evidence captured (lint, typecheck, critical integration logs)

---

## Dependency Graph

```text
48.1 Architecture truth map + risk register freeze
    ↓
48.2 Financial correctness hardening pack
    ├── 48.3 Migration reliability gate hardening
    └── 48.4 Integration test determinism hardening

48.5 CI quality gate enforcement depends on: 48.2 + 48.3 + 48.4
48.6 Type/lint debt containment depends on: 48.5 (policy) and 48.2/48.4 touched files
```

---

## Sprint Breakdown

### Story 48.1 — Architecture Truth Map & Risk Register Freeze
- **Priority:** P1
- **Dependencies:** None
- **Focus:**
  - Freeze module ownership map (authoritative write boundaries)
  - Register top correctness risks with owner + SLA + evidence path
  - Link risks to invariants (ledger, idempotency, tenancy, ACL, immutability)

### Story 48.2 — Financial Correctness Hardening Pack
- **Priority:** P0/P1
- **Dependencies:** 48.1
- **Focus:**
  - Period-close + snapshot + reconciliation correctness edge cases
  - Concurrency and replay safety around close/approve/override paths
  - Regression tests proving no duplicate/incorrect financial effect

### Story 48.3 — Migration Reliability Gate Hardening
- **Priority:** P1
- **Dependencies:** 48.2 (for discovered schema touchpoints)
- **Focus:**
  - Dual-DB compatibility checks (MySQL + MariaDB)
  - Rerunnable migration validation workflow
  - Block non-portable DDL patterns in practice

### Story 48.4 — Integration Test Determinism Hardening
- **Priority:** P1
- **Dependencies:** 48.2
- **Focus:**
  - Fixture lifecycle hardening for persistent/append-only tables
  - Remove flake-prone ordering/time assumptions in critical suites
  - Require repeatability evidence for critical runs

### Story 48.5 — CI Quality Gate Enforcement
- **Priority:** P1
- **Dependencies:** 48.2, 48.3, 48.4
- **Focus:**
  - Enforce sprint closure blocker on unresolved P0/P1
  - Add practical gate checks for regression reliability and migration safety
  - Standardize evidence collection output for pre-close review

### Story 48.6 — Type/Lint Debt Containment (Touched-Hotspots Only)
- **Priority:** P2 (non-blocking unless correctness-related)
- **Dependencies:** 48.5
- **Focus:**
  - Reduce `no-explicit-any` and similar debt in files touched by 48.2–48.4
  - Prevent new warning debt in touched scope
  - Keep this bounded (no broad refactor)

---

## Architecture Notes (Critical Decisions)

1. Sprint 48 is bugfix/regression only; no feature scope.
2. Financial correctness and tenant/ACL safety findings are P1 minimum.
3. Any failing SOLID/DRY/KISS item in sprint scope becomes explicit tracked work.
4. No sprint close if unresolved P0/P1 remains.

---

## Key Risks & Decisions

| # | Risk | Decision |
|---|------|----------|
| 1 | Hidden race windows in period-close flows | Concurrency tests + deterministic lock/retry behavior required |
| 2 | Regression flakiness masks real correctness issues | Require repeated-run evidence in critical suites |
| 3 | Non-portable migration introduces environment-specific failures | Dual-DB validation and rerunnable migration checks |
| 4 | Scope drift into broad refactor | Enforce narrow defect-linked changes only |
| 5 | P0/P1 issues deferred to "later" | Sprint close gate blocks closure until resolved |

---

## Sprint 48 Exit Gate

Sprint 48 can be marked complete only if:

- [ ] Stories 48.1–48.6 status updated with evidence
- [ ] Kickoff, midpoint, and pre-close SOLID/DRY/KISS scoring completed
- [ ] No unresolved P0/P1 findings in sprint scope
- [ ] Adversarial review verdict is GO
- [ ] Baseline reliability evidence logs attached

---

## Validation Commands (Kickoff Baseline)

```bash
npm run lint -w @jurnapod/api
npm run typecheck -w @jurnapod/api
nohup npm run test:single -- __test__/integration/accounting/period-close-guardrail.test.ts __test__/integration/purchasing/ap-reconciliation.test.ts __test__/integration/purchasing/ap-reconciliation-snapshots.test.ts > logs/epic-48-kickoff-critical-integration.log 2>&1 & echo $! > logs/epic-48-kickoff-critical-integration.pid
```

---

## References

- Program baseline: `_bmad-output/planning-artifacts/sprint-48-61-correctness-first-architecture-blueprint.md`
- Root policy: `AGENTS.md` (Architecture Program Baseline section)
- Sprint tracking: `_bmad-output/implementation-artifacts/sprint-status.yaml`
