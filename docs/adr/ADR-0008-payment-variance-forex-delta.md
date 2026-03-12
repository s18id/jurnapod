# ADR-0008: Handling Payment Variance for Foreign Clients (Forex Delta)

- Status: Accepted
- Date: 2026‑03‑11
- Context: Accounting for approximate payments from foreign clients in a single‑currency system

## Context
Jurnapod uses Indonesian Rupiah (IDR) as its sole bookkeeping currency. Nevertheless, some customers are located abroad and calculate their payment in IDR based on their home currency. Because these clients estimate the exchange rate when remitting funds, the amount paid in IDR often differs slightly from the invoice amount. For example, an invoice of IDR 10 000 000 may be paid as IDR 10 050 000 or IDR 9 950 000 depending on the customer’s conversion. Existing ADRs establish the general ledger (GL) as the source of truth for all posted documents, but they do not describe how to account for these small payment variances.

## Problem

Because invoices and the general ledger are denominated in IDR, any difference between the invoiced amount and the amount actually received must still be accounted for. These variances occur when a customer uses their own currency to approximate the IDR due. Without a defined policy, the difference is either ignored (misstating cash and revenue) or manually adjusted without traceability. We need a repeatable, audit‑friendly mechanism to record these payment variances as gains or losses.

## Decision

We will treat the difference between the **outstanding AR amount at payment posting time** and the IDR payment received as a realised gain or loss and post it to dedicated accounts. The policy is as follows:

**Core invariant:** Variance is computed against outstanding AR, not full invoice amount. This ensures correct behavior for multi-payment sequences.

Invoice recording: Invoices will continue to be denominated and recorded in IDR only. Post the journal as Dr Accounts Receivable (IDR) / Cr Revenue (IDR) based on the invoiced amount.

Payment recording: When payment is received, record the actual IDR amount received (`payment_amount_idr`). Before posting, compute:
- `outstanding_before = invoice.grand_total - invoice.paid_total`
- `invoice_amount_idr = min(payment_amount_idr, outstanding_before)` — amount applied to settle AR
- `payment_delta_idr = payment_amount_idr - invoice_amount_idr` — variance (always ≥ 0 in normal flow)

Post journal:
- Dr Cash/Bank (`payment_amount_idr`)
- Cr AR (`invoice_amount_idr`)
- Cr Payment Variance Gain (`payment_delta_idr`) — only when delta > 0

**Behavior by payment type:**
- **Exact settlement:** delta = 0 → no variance entry
- **Overpayment:** delta > 0 → posts to variance gain account
- **Underpayment (partial):** delta = 0 (capped at outstanding) → remaining AR stays open, no variance loss
- **Underpayment with final settlement:** not default; requires explicit configuration

Data model support: Store `payment_amount_idr` (received amount) and compute `invoice_amount_idr` and `payment_delta_idr` at posting time as persisted columns (not generated). These fields capture the variance for audit trail.

User interface & reporting: Update backoffice accounting screens to show the variance amount when posting payments. Financial statements should include aggregated realised payment variances as part of other income/expense. The POS can remain unchanged, as it already records only IDR totals.

## Consequences
### Positive

Financial accuracy: Revenue recognition remains based on the invoiced IDR amount; differences between the invoice and the actual payment are separated into dedicated gain/loss accounts, improving financial statement clarity.

Auditability: Storing both the invoiced amount, the amount received and the computed delta provides a clear trail for auditors and stakeholders.

Clarity: By isolating these deltas from core revenue, management can understand the impact of customers’ currency conversions without conflating it with operational income.

### Negative

System complexity: Requires additional fields, journal logic and UI elements to capture both invoice and payment amounts and compute the variance.

Performance impact: Posting payments will involve extra computations to determine the forex delta.

### Out of Scope (v1)

- Negative variance (underpayment loss) posting in default flow — partial payments keep AR open
- Multi-currency ledger support — this ADR handles only IDR-denominated payments with forex delta
- Automatic AR write-off — requires separate workflow

## Related Documents

General Ledger as Source of Truth: ADR‑0001

POS Cashier Service Flows: ADR‑0006 (conceptually related for settlement flows, though not currency specific)

## Implementation Notes

Chart of accounts: Use existing company account mappings infrastructure — add `PAYMENT_VARIANCE_GAIN` and `PAYMENT_VARIANCE_LOSS` as mapping keys under "Other Income/Expense" group. These indicate realised variances from customer currency conversions.

Migration: Already complete via `0086_sales_payments_add_variance_columns.sql` — adds `invoice_amount_idr`, `payment_amount_idr`, and `payment_delta_idr` as persisted (not generated) columns. Historical payments backfilled with delta = 0.

API & schemas: 
- Input: `actual_amount_idr` in payment create/update request (optional, defaults to `amount`)
- Output: `payment_amount_idr`, `invoice_amount_idr`, `payment_delta_idr` in response
- Business errors: `PAYMENT_VARIANCE_GAIN_MISSING` / `PAYMENT_VARIANCE_LOSS_MISSING` when variance accounts not configured

Testing requirements:
- Unit: outstanding-based variance calculation, gain/loss account direction
- Integration: exact settlement, overpayment (gain), partial underpayment (no variance), multi-payment sequence, retry idempotency, concurrent post race (single journal batch), missing config error, rounding (0.01 IDR)

- Proposed by: Signal18 ID (Jurnapod team)
- Reviewers: Accounting & Engineering leads
- Implementation milestone: v1.0 (Q2 2026)