# Story 51.5: Follow-Up Closure Bucket

> **HARD GATE (E50-A2 carry-over):** Implementation of this story MUST NOT begin until:
> 1. This document includes an explicit "coordination protocol" section per E50-A2
> 2. The E50-A1 second-pass review checklist is included below
> 3. E50-A1/E50-A2 artifacts are reviewed and approved
>
> **Agent-safe language:** "MUST NOT begin implementation until..." — no ambiguity permitted.
>
> **Scope enforcement:** Story 51.5 MUST NOT be used to introduce new scope. It is exclusively a follow-up closure bucket for defects/gaps surfaced by Stories 51.1–51.4. Any item that is not a direct follow-up from 51.1–51.4 MUST be deferred to a future epic.

**Status:** backlog

---

## Story Context

**Epic:** Epic 51 — Fiscal Correctness Hardening
**Owner:** @bmad-dev
**Type:** Defect resolution (follow-up)
**Module:** `modules-accounting`, `modules-sales`, `modules-purchasing`, `modules-inventory`
**Sprint:** 51 (2026-05-11 to 2026-05-22)

---

## Problem Statement

Stories 51.1–51.4 will surface defects and gaps. This story captures resolving those defects. Epic 51 cannot close until this story is done.

---

## E50-A2: Coordination Protocol (MANDATORY — E50-A2 Gate Artifact)

> **RFC Mandate:** E50-A2 requires that concurrent stories in the same epic MUST have an explicit "coordination protocol" section in their spec. Story 51.5 is the catch-all bucket that runs concurrently with the closure of Stories 51.1–51.4. This protocol is MANDATORY.

### Coordination Protocol

| Situation | Required Action |
|-----------|-----------------|
| Story 51.1 surfaces fiscal close defect | Fix in Story 51.1; if not fully resolved by Story 51.5 close, capture with evidence in Story 51.5 |
| Story 51.2 surfaces AR reconciliation defect | Fix in Story 51.2; if not fully resolved by Story 51.5 close, capture with evidence in Story 51.5 |
| Story 51.3 surfaces AP reconciliation defect | Fix in Story 51.3; if not fully resolved by Story 51.5 close, capture with evidence in Story 51.5 |
| Story 51.4 surfaces inventory reconciliation defect | Fix in Story 51.4; if not fully resolved by Story 51.5 close, capture with evidence in Story 51.5 |
| Defect spans multiple stories (e.g., fix in 51.2 breaks 51.3) | Story 51.5 coordinates fix; both stories link to Story 51.5 |
| Shared reconciliation utility has defect | Story 51.5 owns fix; all affected stories link to Story 51.5 |
| New scope identified during 51.1–51.4 work | MUST NOT be added to Story 51.5; defer to future epic with rationale |

### Coordination Order

1. **Parallel execution**: Stories 51.1–51.4 run in parallel during sprint
2. **Defect capture**: Each story captures any defects found with evidence
3. **Cross-story dependency**: If defect fix in one story affects another, Story 51.5 coordinates
4. **Closure gate**: Story 51.5 cannot close until all 51.1–51.4 defects are resolved or formally deferred

### Scope Enforcement

| In Scope (allowed) | Out of Scope (forbidden) |
|--------------------|--------------------------|
| Defects/gaps from 51.1–51.4 | New feature scope |
| Cross-story coordination | Refactor of unaffected code |
| Risk register updates | Net-new subledger types |
| Sprint status updates | Q49-001 continuation (backlog item) |

---

## E50-A1: Second-Pass Determinism Review (MANDATORY)

> **RFC Mandate:** Post-review fixes were needed in 3/7 Epic 49 stories. Self-review alone misses patterns in deterministic hardening work. Second-pass review is **MANDATORY** for defect resolution because:
> - Defect fixes can introduce new non-determinism if not carefully reviewed
> - Fixes to correctness-critical reconciliation logic MUST be deterministic
> - Story 51.5 is the epic closure story — fixes MUST be thorough and deterministic

**When required:** This story fixes defects surfaced by Stories 51.1–51.4. Second-pass review is **MANDATORY** for every fix because these are correctness-critical reconciliation defects.

**Second-pass reviewer:** Charlie (Senior Dev) or designated second-pass reviewer

**Second-pass checklist:**
- [ ] All Stories 51.1–51.4 defects fixed with deterministic proofs
- [ ] No `Date.now()` or `Math.random()` introduced in fix code
- [ ] No new P1/P2 defects introduced (adversarial check)
- [ ] Post-fix 3× consecutive green on all affected suites
- [ ] Risk register updated (any R51-XXX elevated or closed)
- [ ] No post-review fixes expected after second-pass sign-off

---

## Acceptance Criteria

**AC1:** All Story 51.1–51.4 defects captured with evidence

**AC2:** All captured defects resolved with evidence

**AC3:** No new P1/P2 defects introduced in fixes

**AC4:** Post-fix 3-consecutive-green on all affected suites

**AC5:** Risk register updated (any R51-XXX elevated or closed)

**AC6:** Sprint status updated

---

## Exit Criteria

- All Stories 51.1–51.4 defects resolved or formally deferred with rationale
- All affected test suites 3× consecutive green
- Risk register updated
- Sprint status reflects completion
- Story cannot be marked done without explicit reviewer GO

---

## Appendix: Cross-Story Defect Register (E51-A5)

> **Append-only section — do not modify existing ACs above.**

### Defect Log (Populated as Stories 51.1–51.4 Execute)

| Defect ID | Source Story | Description | Status | Resolution |
|-----------|--------------|-------------|--------|------------|
| D51-001 | 51.1 | [TBD — populated during execution] | open/resolved/deferred | [TBD] |
| D51-002 | 51.2 | [TBD — populated during execution] | open/resolved/deferred | [TBD] |
| D51-003 | 51.3 | [TBD — populated during execution] | open/resolved/deferred | [TBD] |
| D51-004 | 51.4 | [TBD — populated during execution] | open/resolved/deferred | [TBD] |

### Deferred Items

| Item | Source | Rationale | Deferred To |
|------|--------|-----------|-------------|
| [TBD] | [TBD] | [TBD] | [TBD] |