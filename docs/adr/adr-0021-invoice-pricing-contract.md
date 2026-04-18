# ADR-0021: Invoice Pricing Contract — Canonical Discount & Tax Calculation

**Date:** 2026-04-15
**Status:** Accepted
**Deciders:** Ahmad, Architect

## Context

Epic 44 completes AR invoicing behavior by adding invoice header discounts and aligning invoice totals with customer-linked AR workflows. Current invoice computation derives `subtotal` from lines, computes tax, then sets `grand_total = subtotal + tax_amount`. This is insufficient once both percentage and fixed header discounts are introduced.

Without a single pricing contract, totals can drift between backend services, UI previews, and import validation paths. Given accounting/GL centrality, drift is unacceptable: financial documents must compute exactly once using shared business rules, then persist canonical values transactionally.

## Decision

1. **Single source of truth function**
   - Canonical computation contract is:
     `computeInvoiceTotals(subtotal, discount_percent?, discount_fixed?, tax_rate_percent?)`
     returning `{ discount_amount, taxable, tax_amount, grand_total }`.
   - Ownership is in `modules-sales`; routes delegate to service.

2. **Calculation sequence and validation**
   - `discount_amount = subtotal * (discount_percent / 100)`
   - `taxable = subtotal - discount_amount - discount_fixed`
   - `tax_amount = taxable * (tax_rate_percent / 100)`
   - `grand_total = taxable + tax_amount`
   - If `discount_amount + discount_fixed > subtotal`, reject with `ValidationError`.
   - Header discounts cannot reduce taxable amount below zero.

3. **Line vs header precedence**
   - Line-level economics are settled first:
     `line_subtotal = sum(qty * unit_price - line.discount_amount)`.
   - Header discounts then apply to aggregate line subtotal.
   - This preserves line-level intent while allowing customer-level commercial adjustments at header.

4. **Rounding and persistence contract**
   - DB persistence uses `DECIMAL(19,4)` for intermediate and final monetary totals.
   - Final `grand_total` is also `DECIMAL(19,4)`.
   - API responses expose amounts as integer cents for frontend contract stability.

5. **Atomic update behavior**
   - On DRAFT invoice updates, changes to discount fields and recomputed totals occur in one transaction.
   - No partial state where discount fields and totals disagree.

6. **Lifecycle immutability**
   - Discounts are editable only while invoice status is `DRAFT`.
   - Once `POSTED`, pricing fields and derived totals are immutable; corrections follow existing `VOID/REFUND` patterns.

7. **No duplicate calculators**
   - UI preview and import validation must call the same domain computation path or contract-equivalent shared implementation.
   - Independent bespoke calculators are disallowed.

## Consequences

**Positive:**
- Deterministic pricing with a single canonical rule set across entry points.
- Reduced reconciliation risk between invoice screen, imports, and posted ledger effects.
- Cleaner auditability because one pricing contract governs all persisted totals.

**Negative:**
- Existing UI preview/import flows may need contract alignment work.
- Strict validation may surface previously hidden bad discount inputs.

**Neutral/Future:**
- Current precision standard (`DECIMAL(19,4)` + cents in API) is sufficient for MVP and can be extended if multi-currency sub-cent rules are introduced.

## Related Stories

- Story 44.2 — Invoice → customer link
- Story 44.3 — Invoice header discounts
- Story 44.5 — Credit note customer flow (downstream pricing consistency)
