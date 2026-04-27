# Story 51.3: Payables Subledger Reconciliation

> **HARD GATE (E50-A1/E50-A2 carry-over):** Implementation of this story MUST NOT begin until:
> 1. The E50-A1 second-pass review checklist is included below
> 2. E50-A1/E50-A2 artifacts are reviewed and approved
>
> **Agent-safe language:** "MUST NOT begin implementation until..." — no ambiguity permitted.

**Status:** backlog

---

## Story Context

**Epic:** Epic 51 — Fiscal Correctness Hardening
**Owner:** @bmad-dev
**Type:** Correctness verification + defect resolution
**Module:** `modules-purchasing`, `modules-accounting`
**Sprint:** 51 (2026-05-11 to 2026-05-22)

---

## Problem Statement

The AP (accounts payable) subledger is not reconciled to the GL `accounts_payable` control account. Without reconciliation, AP balance can drift from GL without detection — a P1 correctness gap.

---

## Kickoff Implementation Checklist (Sprint 51)

- [ ] Story 51.1 fiscal-close state contract is linked in this story notes section.
- [ ] Reconciliation cutoff definitions are fixed and documented (no ambiguous time-window handling).
- [ ] Test evidence plan is defined for deterministic 3× green runs.
- [ ] Risk owners are assigned for open P1/P2 reconciliation risks.

### Kickoff Evidence Stub

| Gate | Evidence | Status |
|------|----------|--------|
| 51.1 dependency contract linked | Story 51.1 contract snapshot linked (`story-51.1.md`, section: Story 51.1 Close-State Contract Snapshot) | Done |
| Reconciliation cutoff defined | Canonical cutoff rule recorded in AC/test notes | In Progress |
| Determinism plan defined | 3× consecutive green plan attached | In Progress |
| Implementation unblocked | All kickoff gates satisfied | Blocked |

> Implementation for Story 51.3 MUST NOT begin until Story 51.1 close-state contract is frozen and linked.

---

## E50-A1: Second-Pass Determinism Review (MANDATORY)

> **RFC Mandate:** Post-review fixes were needed in 3/7 Epic 49 stories. Self-review alone misses patterns in deterministic hardening work. Second-pass review is **MANDATORY** for subledger reconciliation because:
> - Reconciliation logic must be deterministic (no time-dependent assertions)
> - Variance drilldown must be reproducible across runs
> - AP balance computation involves multiple transaction types (invoices, payments, credit notes)

**When required:** This story implements AP subledger-to-GL reconciliation. Second-pass review is **MANDATORY** because correctness gap affects financial statement accuracy.

**Second-pass reviewer:** Charlie (Senior Dev) or designated second-pass reviewer

**Second-pass checklist:**
- [ ] AP subledger sum computed deterministically (purchase invoices + payments + credit notes)
- [ ] GL control account balance retrieved from `journal_entries` with correct account code filter
- [ ] Reconciliation report deterministic (same data → same result)
- [ ] Variance drilldown reproducible
- [ ] No `Date.now()` or `Math.random()` in reconciliation logic or test fixtures
- [ ] Integration test 3× consecutive green
- [ ] No post-review fixes expected after second-pass sign-off

---

## Acceptance Criteria

**AC1:** AP subledger-to-GL reconciliation implemented:
- AP subledger sum = `purchase_invoices.unpaid_amount + purchase_payments.amount - credit_note_amounts`
- GL control account balance = SUM(journal_entries) where account_code = AP control account
- Reconciliation = AP subledger sum - GL control account balance (must be zero)

**AC2:** Reconciliation report endpoint created or updated:
- `GET /accounting/reconciliation/ap` or equivalent
- Returns subledger total, GL total, variance, and drilldown data

**AC3:** Variances surfaced with drilldown capability:
- Non-zero variance returns breakdown by document type (invoice, payment, credit note)
- Each drilldown item links to source document

**AC4:** All gaps/defects fixed with evidence

**AC5:** Integration tests written and 3× consecutive green

**AC6:** Code review GO required

---

## Test Location

Integration tests go in: `packages/modules/purchasing/__test__/integration/reconciliation/ap-subledger-reconciliation.test.ts`

---

## Exit Criteria

- AP reconciliation logic deterministic
- All ACs verified with evidence
- Integration tests 3× consecutive green
- Second-pass review sign-off from Charlie (Senior Dev) or designated reviewer

---

## Appendix: Cross-Story Traceability (E51-A4)

> **Append-only section — do not modify existing ACs above.**

### Relationship to Story 51.5 (Follow-Up Closure Bucket)

Story 51.5 captures all defects/gaps surfaced by Stories 51.1–51.4. If Story 51.3 surfaces any defects not fully resolved before Story 51.5 closes, those defects MUST be captured in Story 51.5.

| Situation | Required Action |
|-----------|-----------------|
| Story 51.3 surfaces AP reconciliation variance | Fix in Story 51.3; if not fully resolved, capture in Story 51.5 |
| Story 51.3 finds FX interaction with AP reconciliation | Document interaction; Story 51.5 tracks cross-story dependency if fix spans stories |
| Story 51.3 finds scenario where exchange rate handling affects AP balance | Document; coordinate with Story 51.5 if fix spans stories |

### Coordination Protocol (E50-A2 reference)

Contract reference for this story:
- `_bmad-output/implementation-artifacts/stories/epic-51/story-51.1.md` — **Story 51.1 Close-State Contract Snapshot (Frozen v1 — 2026-04-26)**

When Story 51.3 runs concurrently with Stories 51.2, 51.4, and 51.5:
1. AP reconciliation logic MUST NOT be affected by concurrent AR/inventory reconciliation fixes
2. If a shared reconciliation utility is introduced by Story 51.3, it MUST be reviewed for thread-safety before Stories 51.2/51.4 use it
3. Story 51.3 defects that affect shared infrastructure MUST be resolved before Stories 51.2/51.4 proceed
