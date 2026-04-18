# ADR-0022: AR Transaction Model — Invoice Snapshot & Credit Note Effects

**Date:** 2026-04-15
**Status:** Accepted
**Deciders:** Ahmad, Architect

## Context

Epic 44 extends AR workflows with customer-linked invoices, ageing drill-down, overdue visibility, and credit note completion. Today, invoices only hold a nullable `customer_id` and do not snapshot customer legal identity fields. Credit notes reference source invoice and amount, but customer inheritance and AR allocation behavior are not yet fully formalized.

For accounting correctness and legal document stability, historical invoices must not drift when customer master data changes. For AR visibility, credit notes must reduce customer exposure predictably and integrate with ageing logic. Design must also preserve module boundaries: sales/AR behavior should integrate with accounting journals without circular dependencies.

## Decision

1. **Invoice customer snapshot at issue time**
   - On invoice creation in `DRAFT`, persist denormalized fields:
     - `customer_name_at_issue`
     - `customer_company_name_at_issue`
     - `customer_tax_id_at_issue`
   - `customer_id` remains as relational FK for analytics/linking.
   - After posting, snapshot fields are immutable and become display/legal source of truth.

2. **Customer master updates are non-retroactive**
   - Changes to customer master data do not modify existing invoices, including posted documents.
   - Historical legal identity on invoice is always read from snapshot fields, not live customer row.

3. **Credit note AR semantics**
   - Creating a credit note generates a new AR movement with negative amount from the customer perspective.
   - Allocation policy is FIFO against oldest unpaid invoices by `due_date`.
   - Credit notes affect AR ledger balances and invoice `payment_status` only; they do not restore inventory and do not directly mutate prior GL entries.
   - Full credit note clears entire source exposure; partial credit note reduces outstanding amounts proportionally according to allocation results.

4. **Journal linkage without circular dependency**
   - Credit note journal posting (debit AR, credit revenue reversal) is handled by `modules-accounting` via existing integration boundaries.
   - `modules-sales` does not embed accounting internals; it emits required domain intent/data.

5. **Customer inheritance and override control**
   - `createCreditNote(sourceInvoiceId)` auto-inherits `customer_id` from source invoice.
   - Manual override is permitted only with ACL permission `platform.customers UPDATE`.
   - Override requires mandatory reason/notes for auditability.

6. **AR ageing bucket rule**
   - Credit note reductions decrease outstanding balances in ageing outputs.
   - Bucket determination remains anchored to original invoice `due_date`, not credit note date.

## Consequences

**Positive:**
- Legal/customer identity on historical invoices is stable and audit-safe.
- AR totals and ageing become economically faithful when credits are issued.
- Clear ownership split avoids architecture erosion between sales and accounting modules.

**Negative:**
- Additional snapshot fields increase write-path payload and migration coordination.
- FIFO allocation logic adds complexity for partial credit scenarios.

**Neutral/Future:**
- Future advanced allocation strategies (manual or policy-based) can extend this model while keeping FIFO as default.

## Related Stories

- Story 44.1 — Customer master CRUD
- Story 44.2 — Invoice → customer link
- Story 44.4 — AR ageing UX completion
- Story 44.5 — Credit note customer flow
