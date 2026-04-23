# Story 50.1: POS Sync Unbalanced Posting Override: Investigate & Resolve

> **HARD GATE (E49-A1/E49-A2):** Implementation of this story MUST NOT begin until:
> 1. This document includes a reviewed and signed-off Tiered Audit Table (Critical → High → Medium)
> 2. The PR template at `.github/pull_request_template.md` is in place with second-pass review checklist
> 3. Both E49-A1 and E49-A2 artifacts are reviewed and approved
>
> **Agent-safe language:** "MUST NOT begin implementation until..." — no ambiguity permitted.

**Status:** backlog

---

## Story Context

**Epic:** Epic 50 — Ledger Correctness Hardening
**Owner:** @bmad-dev
**Type:** Correctness risk resolution
**Module:** `accounting-ledger` / POS sync
**Sprint:** 50 (2026-04-27 to 2026-05-08)

---

## Problem Statement

`SYNC_PUSH_POSTING_FORCE_UNBALANCED` exists in the codebase with a deliberate override that allows unbalanced journals to be posted. This is a P1 correctness risk because it can leak into production.

---

## E49-A2: Tiered Audit Table (MANDATORY — E49-A2 Gate Artifact)

> **RFC Keywords:** This table MUST be reviewed and signed off before Story 50.1 implementation begins. Execution MUST proceed in Critical → High → Medium order.

### Tier Assignment Rationale

| Factor | Rationale |
|--------|-----------|
| **Critical tier** | `SYNC_PUSH_POSTING_FORCE_UNBALANCED` directly enables unbalanced journals — production correctness P0 |
| **High tier** | `isTestUnbalancedPostingEnabled` guard narrows scope to test-only; verification required to confirm scope |
| **Medium tier** | Downstream consumers of posting flow — verify no regressions when override is removed/hardened |

### Audit Table

| Tier | Priority | Scope | Search Pattern | Owner | Rationale |
|------|----------|-------|----------------|-------|-----------|
| **Critical** | P0 | `SYNC_PUSH_POSTING_FORCE_UNBALANCED` usage sites | `rg 'SYNC_PUSH_POSTING_FORCE_UNBALANCED' --type ts` | @bmad-dev | Unbalanced journal override — production correctness risk |
| **Critical** | P0 | `isTestUnbalancedPostingEnabled` guard implementation | `rg 'isTestUnbalancedPostingEnabled' --type ts` | @bmad-dev | Guard may have gaps; must verify `NODE_ENV === "test"` is the only path |
| **High** | P1 | All posting code paths that call the override | `@/services/posting` + `pos-sync` consumers | @bmad-dev | Ensure no call sites depend on unbalanced behavior |
| **High** | P1 | POS sync push transaction flow | `packages/pos-sync/src/**` | @bmad-dev | Verify sync flow doesn't rely on unbalanced override |
| **Medium** | P2 | Downstream journal validation in `modules-accounting` | `packages/modules/accounting/src/**` | @bmad-dev | Verify no regressions when override removed/hardened |
| **Medium** | P2 | Any `POSTING_FORCE_UNBALANCED` in tests or fixtures | `rg 'FORCE_UNBALANCED' --type ts -l` | @bmad-dev | Tests may have patterns that depend on override |

### Execution Order

> **RFC Mandate:** Implementors MUST execute tiers in order: **Critical → High → Medium**. You MUST NOT skip tiers. You MUST provide evidence of tier completion before proceeding to the next tier.

1. **Critical tier** (P0): Document every usage site; produce recommendation (remove OR harden to `NODE_ENV === "test"`)
2. **High tier** (P1): Verify call sites and sync flow; confirm no dependency on unbalanced behavior
3. **Medium tier** (P2): Regression check on downstream consumers

---

## E49-A1: Second-Pass Determinism Review (MANDATORY)

> **RFC Mandate:** Post-review fixes were needed in 3/7 Epic 49 stories. Self-review alone misses patterns in deterministic hardening work. Second-pass review MUST catch `trial-balance.test.ts` line 75 class before the review phase.

**When required:** This story touches code that controls posting balance behavior. Second-pass review is **MANDATORY** because:
- Override controls production journal correctness
- Guard verification requires deterministic pattern checking
- Changes affect POS sync idempotency contracts

**Second-pass reviewer:** Charlie (Senior Dev) or designated second-pass reviewer

**Second-pass checklist:**
- [ ] `SYNC_PUSH_POSTING_FORCE_UNBALANCED` fully documented (not just grep'd)
- [ ] `isTestUnbalancedPostingEnabled` guard has explicit `NODE_ENV === "test"` proof
- [ ] No remaining `Date.now()` or `Math.random()` introduced during fix
- [ ] 3× consecutive green evidence attached
- [ ] No post-review fixes expected after second-pass sign-off

---

## Acceptance Criteria

**AC1:** Purpose documented (git history trace + use case confirmation)

**AC2:** Decision with recommendation committed to one path

**AC3:** Resolution applied (override deleted OR guard hardened to `NODE_ENV === "test"` only)

**AC4:** Code review GO required

---

## Technical Notes

- Search for `SYNC_PUSH_POSTING_FORCE_UNBALANCED` and `isTestUnbalancedPostingEnabled`
- Trace git history for original justification
- Either remove entirely or harden to test-only environment

---

## Exit Criteria

- Story cannot be marked done without explicit reviewer GO
- Validation commands:
  ```bash
  rg 'SYNC_PUSH_POSTING_FORCE_UNBALANCED' --type ts -l
  rg 'isTestUnbalancedPostingEnabled' --type ts -l
  ```

---

## Appendix: Cross-Story Traceability (E50-A4)

> **Append-only section — do not modify existing ACs above.**

### Relationship to Story 50.5 (FX Acknowledgment)

Story 50.5 (`story-50.5.md`) implements Sales AR FX Acknowledgment which adds a new `fx_acknowledged_at` guard to payment posting. Story 50.1 resolves unbalanced posting override risk in POS sync. The two stories operate in different areas but share the `journal posting` correctness domain:

| Risk | Story 50.1 Scope | Story 50.5 Scope | Interaction |
|------|------------------|-------------------|-------------|
| Unbalanced journal | `SYNC_PUSH_POSTING_FORCE_UNBALANCED` in pos-sync | FX delta journal entry via `modules-accounting` | Story 50.1 resolve override; Story 50.5 adds new balanced FX journal |
| Guard enforcement | Hardened `isTestUnbalancedPostingEnabled` | `fx_acknowledged_at` check in `payment-posting-hook.ts` | Independent guards — no shared code paths |
| POS sync flow | POS sync push transaction flow | Sales payment post with FX delta | Different transaction types — no overlap |

### Coordination Protocol

1. Story 50.1 resolution (hardening unbalanced override guard) MUST NOT be undone by Story 50.5 FX journal additions.
2. If Story 50.5 FX delta posting causes any new unbalanced journal exposure in the POS sync path, file as P0 risk in both stories.
3. Story 50.1 is independent of FX acknowledgment — it can proceed and close before Story 50.5.