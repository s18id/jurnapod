# Story 50.4: Correctness Fixes from Testing

> **HARD GATE (E49-A1):** Implementation of this story MUST NOT begin until:
> 1. The PR template at `.github/pull_request_template.md` is in place with second-pass review checklist
> 2. E49-A1 artifacts are reviewed and approved
>
> **Agent-safe language:** "MUST NOT begin implementation until..." — no ambiguity permitted.

**Status:** backlog

---

## Story Context

**Epic:** Epic 50 — Ledger Correctness Hardening
**Owner:** @bmad-dev
**Type:** Correctness defect resolution
**Module:** `modules-accounting`
**Sprint:** 50 (2026-04-27 to 2026-05-08)

---

## Problem Statement

Story 50.3 will surface defects in the posting flows. This story captures fixing those defects. Epic 50 cannot close until this story is done.

---

## E49-A1: Second-Pass Determinism Review (MANDATORY)

> **RFC Mandate:** Post-review fixes were needed in 3/7 Epic 49 stories. Self-review alone misses patterns in deterministic hardening work. Second-pass review is **MANDATORY** for correctness defect fixes because:
> - Defect fixes can introduce new non-determinism if not carefully reviewed
> - Fixes to posting correctness MUST be deterministic (no time-dependent test patterns)
> - Story 50.3 was created to surface defects — fixes MUST be thorough and deterministic

**When required:** This story fixes defects surfaced by Story 50.3. Second-pass review is **MANDATORY** for every fix because these are correctness-critical posting defects.

**Second-pass reviewer:** Charlie (Senior Dev) or designated second-pass reviewer

**Second-pass checklist:**
- [ ] All Story 50.3 defects fixed with deterministic proofs
- [ ] No `Date.now()` or `Math.random()` introduced in fix code
- [ ] No new P1/P2 defects introduced (adversarial check)
- [ ] Post-fix 3× consecutive green on all 5 posting suites
- [ ] Risk register updated (R50-003 if REFUND gap confirmed)
- [ ] No post-review fixes expected after second-pass sign-off

---

## Acceptance Criteria

**AC1:** All Story 50.3 defects fixed with evidence

**AC2:** No new P1/P2 defects introduced in fixes

**AC3:** Post-fix 3-consecutive-green on all posting suites

**AC4:** Risk register updated (R50-003 elevated if REFUND gap confirmed)

**AC5:** Sprint status updated

---

## Exit Criteria

- All Story 50.3 defects resolved
- All 5 posting suites 3× consecutive green
- Risk register updated
- Sprint status reflects completion