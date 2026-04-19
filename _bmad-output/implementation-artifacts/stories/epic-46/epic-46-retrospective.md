# Epic 46 Retrospective — Purchasing / Accounts Payable Module

**Date:** 2026-04-19
**Facilitator:** Bob (Scrum Master)
**Participants:** Bob (SM), Winston (Architect), Amelia (Dev), Mary (Analyst), John (PM), Quinn (QA)
**Epic:** 46 — Purchasing / Accounts Payable Module
**Status:** ✅ Complete

---

## What Went Well

### Architecture & Extraction
- **Layered architecture held up** — domain library → route adapter split was consistent across all 8 stories. Each library carried business rules and invariants; adapters stayed thin at HTTP boundaries (auth, parsing, response mapping). Repeatability and clean test targeting achieved.
- **Modular decomposition matched business capabilities** (supplier, PO, GRN, AP invoice/payment/credit, aging), enabling team parallelism.
- **Migration discipline** — 11 incremental, additive migrations (0166–0185) with no rollback incidents. Smaller migrations reduced rollback risk and isolated failures appropriately for a financial system.

### Implementation & Testing
- **Fixture hygiene** — canonical `test-fixtures.ts` used across all 5 suites; no ad-hoc inserts creeping in.
- **Migration + suite parity** — every new domain library got a test suite alongside it, not bolted on later.
- **ACL coverage on route adapters** — every route adapter got permission-level tests with role matrix checks. Review was cleaner.
- **POS sync patterns reused** — `client_tx_id` idempotency and outbox-based assertions carried over to AP async workflows.
- **Post-review P0/P1 discipline** — 46.5 had 3 post-review catches (currency conversion formula, account ownership validation, route error mapping), all resolved before merge. No P0s shipped.

### Process & Coordination
- **Sprint-status utility scripts** — E46-A1/A4 enforcement made append-only tracking reliable; validation caught any risk of wholesale file replacement.
- **2-item action item cap** — kept retro actionable and focused.

---

## What Could Improve

### Cross-Entity Workflow Seams
- **Status transition consistency** across PO → GRN → Invoice → Payment/Credit chain needs explicit canonical transition rules in shared contracts/tests. Seam stress appeared when multi-step flows combined (create → post → journal → balance update).
- **Error semantics at adapter edges** diverge under pace — same domain failure mapped differently by different routes. API consistency risk.

### Requirements Discovery Gaps (from Mary)
- **Credit note entity boundary** — supplier vs. customer credit notes treated as distinct, then discovered mid-sprint they share journal-posting logic. Late schema change (type column) required.
- **Exchange rate temporal integrity** — rate updates could affect already-finalized invoices. Missing `effective_from` constraint surfaced late.
- **AP aging timezone ambiguity** — defaulted to UTC; bucket shifts for non-UTC companies. Scope expansion required.

### Test Coverage Gaps (from Quinn)
- **Credit edge cases** — partial credits, credit-vs-invoice matching, credit sequencing under concurrent payments: thin coverage.
- **Cross-document cascades** — invoice less than received; GRN quantity adjusted post-invoice: not stressed.
- **Foreign currency scenarios** — rate fluctuation cascades into AP ledger: thin coverage.
- **Critical integration paths not stressed:**
  - Purchasing → Accounting (journal balance, account code correctness, void reversal)
  - Purchasing → Treasury (payment execution, AP balance update)
  - PO → Inventory (GRN → stock movement)

### Fixture Debt (from Amelia)
- `createTestPurchasingAccounts()` and `createTestPurchasingSettings()` invented mid-sprint (46.5) instead of being canonical before Epic 47. Downstream stories (46.6, 46.7) also need these; risk of ad-hoc INSERTs if not promoted to canonical.

### Product Gaps (from John)
- **Module shipped transactional skeleton, not operational muscle** — no three-way matching (PO ↔ receipt ↔ invoice), no approval workflows. Cashier can pay an invoice with no PO or receipt — leakage risk.
- **Supplier credit note application rules** — explicit PI reference vs. FIFO fallback works, but UI clarity on eligible invoices and over-application prevention needs real-user validation.
- **Exchange rate volatility** — rate between invoice date and payment date: which rate applies? Realized gain/loss rule not defined.
- **Outlet-level vs. company-level liability** — `company_id` scope may not fit businesses with outlet-specific supplier accounts.

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

---

## Deferred to Backlog (Not Lost)

The following items were identified but not prioritized for this retro (per 2-item cap):

- **Pre-epic Entity-Relationship Review** — map all business-document entities against existing tables before writing stories (Mary)
- **Timezone-aware AC checklist** — explicit timezone resolution order in any report or aging calculation (Mary)
- **Immutable-document guardrails** — validation rule for any config that could affect finalized documents (exchange rates, tax rates, payment terms) (Mary)
- **AP → GL integration stress testing** — journal balance, account code correctness, void reversal (Quinn)
- **Purchasing → Treasury payment execution** end-to-end path (Quinn)
- **PO → Inventory stock movement** integration (Quinn)
- **Real-user validation** — shadow 2 AP clerks; log support tickets for 30 days (John)
- **Three-way matching and approval workflows** — plug leakage risk (John)
- **Supplier scorecard / performance tracking** — negotiation leverage (John)

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

**Epic 47 scope** (deferred items + new stories): three-way matching, approval workflows, credit note application rules, partial payment allocation, AP→GL integration, foreign currency cascade scenarios.

---

*Retrospective complete. Epic 46 closed.*