# Epic 46 Retrospective — Purchasing / Accounts Payable Module

**Date:** 2026-04-19
**Facilitator:** Bob (Scrum Master)
**Participants:** Bob (SM), Winston (Architect), Amelia (Dev), Mary (Analyst), John (PM), Quinn (QA), Sally (UX Designer)
**Session Mode:** BMAD Party Mode — multi-agent collaborative discussion
**Epic:** 46 — Purchasing / Accounts Payable Module
**Status:** ✅ Complete

---

## What Went Well

### Architecture & Extraction
- **Layered architecture held up** — domain library → route adapter split was consistent across all 8 stories. Each library carried business rules and invariants; adapters stayed thin at HTTP boundaries (auth, parsing, response mapping). Repeatability and clean test targeting achieved.
- **Modular decomposition matched business capabilities** (supplier, PO, GRN, AP invoice/payment/credit, aging), enabling team parallelism.
- **Migration discipline** — 11 incremental, additive migrations (0166–0185) with no rollback incidents. Appropriate for a financial system — smaller migrations reduce blast radius and improve rollback isolation.

### Implementation & Testing
- **Fixture hygiene** — canonical `test-fixtures.ts` used across all 5 suites; no ad-hoc inserts creeping in.
- **Migration + suite parity** — every new domain library got a test suite alongside it, not bolted on later.
- **ACL coverage on route adapters** — every route adapter got permission-level tests with role matrix checks. Review was cleaner.
- **POS sync patterns reused** — `client_tx_id` idempotency and outbox-based assertions carried over to AP async workflows.
- **Post-review P0/P1 discipline** — 46.5 had 3 post-review catches (currency conversion formula, account ownership validation, route error mapping), all resolved before merge. No P0s shipped.

### Process & Coordination
- **Sprint-status utility scripts** — E46-A1/A4 enforcement made append-only tracking reliable; validation caught any risk of wholesale file replacement. **Process update: E46-A1/A4 becomes standard for all future epic closes.**
- **2-item action item cap** — kept retro actionable and focused (per E46-A2 constraint).

---

## What Could Improve

### Cross-Entity Workflow Seams
- **Status transition consistency** across PO → GRN → Invoice → Payment/Credit chain needs explicit canonical transition rules in shared contracts/tests. Seam stress appeared when multi-step flows combined (create → post → journal → balance update).
- **Error semantics at adapter edges** diverge under pace — same domain failure mapped differently by different routes. API consistency risk that makes observability harder across distributed retries.

**Cross-talk note:** Winston (Architect) and Amelia (Dev) discussed enforcement mechanisms for cross-entity contract drift. Winston's recommendation: layered approach — (1) shared contract files in `packages/shared` with types exported and type-checked at boundary, (2) story prep checklist item before starting any story that touches multiple entities, (3) cross-entity integration test suite owned by the epic, not individual stories.

### Requirements Discovery Gaps (from Mary)
- **Credit note entity boundary** — supplier vs. customer credit notes treated as distinct, then discovered mid-sprint they share journal-posting logic. Late schema change (type column) required. Root cause: initial requirements didn't map supplier credit note against the existing credit-note pattern.
- **Exchange rate temporal integrity** — rate updates could affect already-finalized invoices. Missing `effective_from` constraint surfaced late. Root cause: business assumption "exchange rates are descriptive, not prescriptive" wasn't stress-tested against accounting immutability.
- **AP aging timezone ambiguity** — defaulted to UTC; bucket shifts for non-UTC companies. Scope expansion required. Root cause: aging is an operational-day concept, not a timezone-agnostic accounting report.

**Cross-talk note:** Mary challenged Winston's "mostly legitimate" migration count assessment — argued the reason for discovery-driven migrations was starting with incomplete entity maps, not scope growth. Winston agreed: the migrations were the right call, but the trigger for some was missing upstream clarity. Pre-epic Entity-Relationship review would have caught this.

### UX Checkpoint Gap (from Sally)
- **Multi-step financial workflows lacked UX danger-point review** — PI creation (46.5) didn't get UX review during story prep. Sally's recommendation: before any story touching a multi-step financial workflow, UX rep gets a copy of the AC and flags the **danger points**: "Where could a user get confused, make a mistake, or need help?" Low ceremony, high signal. The danger points become UI subtasks (e.g., "warn user if they navigate away mid-entry").

**Cross-talk note:** Amelia observed that the UX danger-point gap could have caught the 46.5 conversion formula ambiguity — if UX had asked "does the user understand what rate they're locking?", the requirements might have caught the formula error, not just the implementation. Bob agreed: adding this to the retrospective notes as a pre-story checkpoint for Epic 47.

### Test Coverage Gaps (from Quinn)
- **Credit edge cases** — partial credits, credit-vs-invoice matching, credit sequencing under concurrent payments: thin coverage.
- **Cross-document cascades** — invoice less than received; GRN quantity adjusted post-invoice: not stressed.
- **Foreign currency scenarios** — rate fluctuation cascades into AP ledger: thin coverage.
- **Approval workflows on POs** — blind spot. Who approves, at what threshold, what happens when approver is deactivated? Not covered.
- **Critical integration paths not stressed:**
  - Purchasing → Accounting (journal balance, account code correctness, void reversal)
  - Purchasing → Treasury (payment execution, AP balance update)
  - PO → Inventory (GRN → stock movement)

### Fixture Debt (from Amelia)
- `createTestPurchasingAccounts()` and `createTestPurchasingSettings()` invented mid-sprint (46.5) instead of being canonical before Epic 47. Downstream stories (46.6, 46.7) also needed these; risk of ad-hoc INSERTs if not promoted to canonical.

**Cross-talk note:** Winston asked whether the two action items should be combined under one owner. Amelia argued **keep them separate** — action item 1 is a test pattern discipline (checklist), action item 2 is a code audit and fixture promotion. Different deliverables, same owner is fine. John (PM) granted dev team autonomy to improve test infrastructure without product sign-off, and recommended a 30-minute sync between dev, QA, and product before Epic 47 starts to align on the retrospective findings.

### Product Gaps (from John)
- **Module shipped transactional skeleton, not operational muscle** — no three-way matching (PO ↔ receipt ↔ invoice), no approval workflows. Cashier can pay an invoice with no PO or receipt — leakage risk.
- **Supplier credit note application rules** — explicit PI reference vs. FIFO fallback works, but UI clarity on eligible invoices and over-application prevention needs real-user validation.
- **Exchange rate volatility** — rate between invoice date and payment date: which rate applies? Realized gain/loss rule not defined.
- **Outlet-level vs. company-level liability** — `company_id` scope may not fit businesses with outlet-specific supplier accounts.

**Cross-talk note:** John challenged whether the 46.5 implementation friction (Amelia's observation) matched what users would find complex. Amelia acknowledged: implementation complexity often signals UX complexity. The domain logic intricacy in 46.5 probably needed careful UI design too.

---

## Action Items (E46-A2 Constraint: Max 2)

### Action Item 1 — Regression Guard for Monetary Conversion

| Field | Value |
|-------|-------|
| **Owner** | Amelia (Dev) |
| **Deadline** | Before Epic 47 first story starts |
| **Success Criterion** | All currency conversion stories ship integration tests asserting `(original_amount * exchange_rate) === converted_amount`; tests live in `__test__/integration/purchasing/`; no exceptions without peer review |

**Rationale:** Story 46.5's unit tests passed but the journal-balancing integration test caught the P0 conversion formula bug (dividing instead of multiplying). The regression must be caught at integration level, not unit level. This checklist item should apply to every story involving currency conversion going forward.

### Action Item 2 — Canonical Purchasing Test Fixtures Audit

| Field | Value |
|-------|-------|
| **Owner** | Amelia (Dev) |
| **Deadline** | Before Epic 47 first story starts |
| **Success Criterion** | `packages/db/test-fixtures.ts` (or equivalent canonical location) has `createTestPurchasingAccounts()` and `createTestPurchasingSettings()` promoted to canonical; all Epic 47 purchasing tests use canonical fixtures — no ad-hoc INSERT in new purchasing tests |

**Rationale:** Both fixtures were invented mid-sprint (46.5) to support PI posting tests. Epic 47 (AP Reconciliation) will need them for every story. Without promotion to canonical, teams will either re-invent them or skip account-resolution coverage in test setup.

**Pre-Epic 47 sync (John's recommendation):** 30-minute alignment session between dev, QA, and product before Epic 47 starts — confirm action items, review deferred backlog, align on priorities.

---

## Deferred to Backlog (Not Lost)

The following items were identified but not prioritized for this retro (per 2-item cap), to be triaged into Epic 47 sprint planning:

| Item | Source | Priority Signal |
|------|--------|----------------|
| Pre-epic Entity-Relationship Review — map all business-document entities against existing tables before writing stories | Mary | High — prevents mid-sprint schema changes |
| Temporal and Immutability Awareness checkpoint — team self-assesses which entities lock amounts at a point in time and which are timezone-sensitive | Winston | High — prevents scope expansion mid-implementation |
| Timezone-aware AC checklist — explicit timezone resolution order in any report or aging calculation | Mary | Medium |
| Immutable-document guardrails — validation rule for any config that could affect finalized documents (exchange rates, tax rates, payment terms) | Mary | Medium |
| UX danger-point review as pre-story checkpoint for multi-step financial workflows | Sally | High — could have caught 46.5 conversion ambiguity |
| AP → GL integration stress testing — journal balance, account code correctness, void reversal | Quinn | High — critical path |
| Purchasing → Treasury payment execution end-to-end path | Quinn | Medium |
| PO → Inventory stock movement integration | Quinn | Medium |
| Real-user validation — shadow 2 AP clerks for a day; log support tickets for 30 days, bucket into "missing feature" / "confusing UX" / "bug" | John | High — informs whether matching/approvals or supplier scorecards are urgent |
| Three-way matching and approval workflows — plug leakage risk | John | High |
| Supplier scorecard / performance tracking | John | Low — nice to have, not urgent |

---

## Epic 46 Achievement Summary

| Metric | Value |
|--------|-------|
| Stories committed | 8/8 (46.1–46.8) ✅ |
| Migrations | 11 (0166–0185) ✅ |
| Domain libraries | 8 ✅ |
| Route adapters | 8 ✅ |
| Integration test suites | 5 ✅ |
| Total test pass rate | 155/155 ✅ |
| Post-review P0 catches | 3 (currency conversion, account ownership, route error mapping) |
| Data loss incidents | 0 ✅ |

**AP module transactional skeleton shipped:**
- PO → GRN → AP Invoice → Payment lifecycle scaffolded
- GL journal posting adapter in place
- Exchange rate temporal schema introduced
- Credit note entity modeled
- 11 migrations run cleanly

**Epic 47 scope** (deferred items + new stories): three-way matching, approval workflows, credit note application rules, partial payment allocation, AP→GL integration stress testing, foreign currency cascade scenarios, UX danger-point review checkpoint.

---

## Process Updates from Retrospective

| Update | Owner | Status |
|--------|-------|--------|
| Sprint-status validation (E46-A1/A4) becomes standard for all future epic closes | Bob (SM) | Confirmed — formalize in process docs |
| Pre-epic Entity-Relationship review recommended before Epic 47 starts | Mary | Deferred to Epic 47 prep |
| Temporal/immutability awareness checkpoint (self-assessment checklist) for financial epics | Winston | Deferred to Epic 47 prep |
| UX danger-point review as pre-story checkpoint for multi-step financial workflows | Sally | Deferred to Epic 47 prep |

---

*Retrospective complete. Epic 46 closed. Party Mode session concluded 2026-04-19.*