# Phase 8 Business Rules Specification

## Decision Summary (Locked Scope)
Adopt a **strict, audit-first policy**: split allocations are cent-exact, splits become payment truth when present, refunds are constrained to original payment accounts only, legacy backfill never guesses, and idempotency is immutable (same `client_ref` + different payload = conflict).  
This minimizes financial risk and reuses existing idempotency/accounting patterns with the least ambiguous behavior.

---

## 1. Split Sum Policy
- **Rule:**  
  When `splits` is provided, `SUM(splits.amount)` **must equal** `payment.amount` in **exact cents** (minor units).  
  No tolerance window (0.00 only).
- **Rationale:**  
  Prevents hidden rounding drift and guarantees journal/posting determinism.
- **Edge cases:**  
  - 100.00 total with splits 33.33 + 33.33 + 33.33 => reject (99.99).  
  - Client must send a corrected split (e.g., 33.34 + 33.33 + 33.33).  
  - Any amount with >2 decimals must be rejected at API boundary (no implicit rounding).

## 2. Header account_id Behavior
- **Rule:**  
  - If `splits` is absent: existing behavior applies (`account_id` required, single-method payment).  
  - If `splits` is present: `splits` is the **single source of truth** for payment allocation.  
  - Header `account_id` becomes compatibility metadata:
    - If provided, it **must equal `splits[0].account_id`**.
    - If omitted, server derives header `account_id = splits[0].account_id` for backward compatibility.
- **Rationale:**  
  Keeps legacy consumers/schema stable while eliminating ambiguity in multi-method allocation.
- **Edge cases:**  
  - `splits` present but empty => reject.  
  - Header `account_id` provided but does not match first split => reject with validation error.

## 3. Refund Method Policy
- **Rule:**  
  - Refunds tied to credit notes must reverse through **original payment account(s)** only.  
  - Override to unrelated/different account is **not allowed** in Phase 8.  
  - For multi-method originals, refund allocation is deterministic:
    1. earliest posted payment first (`payment_at`, then `payment_id`),  
    2. then split order (`split_index` ascending).
  - Refund ceiling =  
    **total posted payment splits for invoice** minus  
    **total posted refund allocations already applied** plus  
    **voided refund allocations restored**.
- **Rationale:**  
  Preserves cash/bank reconciliation and prevents method-switch leakage.
- **Edge cases:**  
  - Invoice has credit note amount but insufficient refundable payments => reject posting refund allocation.  
  - Prior refund voided => amount becomes refundable again.  
  - Original includes CASH+QRIS; refund 100% to CASH only is rejected if CASH refundable balance is insufficient.

## 4. Legacy Method Backfill
- **Rule:**  
  - Legacy `method` backfill requires explicit mapping per company/method to a valid payable `account_id`.  
  - If mapping is missing/ambiguous, row is marked **UNRESOLVED** and cutover fails explicitly.  
  - **Never silently guess** account mapping.
- **Rationale:**  
  Backfill errors affect historical GL integrity; explicit failure is safer than incorrect mapping.
- **Exception report format and handling path:**  
  - Report fields (minimum):
    - `company_id`
    - `payment_id`
    - `payment_no`
    - `invoice_id`
    - `outlet_id`
    - `legacy_method`
    - `amount`
    - `payment_at`
    - `reason_code` (`MISSING_MAPPING` | `AMBIGUOUS_MAPPING` | `ACCOUNT_INVALID`)
    - `details`
  - Handling:
    1. Generate report
    2. Finance/ops defines mapping corrections
    3. Re-run backfill
    4. Proceed only when unresolved count = 0

## 5. Idempotency Rules
- **Rule:**  
  `client_ref` idempotency applies to the **entire canonical payment payload**, including splits.  
  - Same `client_ref` + identical payload => return existing payment (idempotent success).  
  - Same `client_ref` + any payload difference (amount/account/split count/order/split amounts) => **409 Idempotency Conflict**.  
  - Retries must **not** mutate previously created payment.
- **Rationale:**  
  Aligns with offline/retry safety and prevents duplicate or silent mutation risk.
- **Edge cases:**  
  - Retry with same splits but different order => conflict (order is semantic because first split determines header compatibility value).  
  - Retry with same totals but different split composition => conflict.

## 6. Split Limits
- **Rule:**  
  - Minimum splits when provided: **1**  
  - Maximum splits per payment: **10**
  - Each split amount > 0
  - Duplicate `account_id` entries in one payment are **not allowed** (client must aggregate before submit)
- **Rationale:**  
  Keeps payloads practical, guards abuse, and simplifies validation/posting/audit.
- **Edge cases:**  
  - 11 splits => reject.  
  - One split with amount 0 => reject.  
  - Same account repeated across two splits => reject.

---

## Acceptance Criteria
- [ ] API rejects payment create/update when split sum differs from header amount by even 0.01.
- [ ] API rejects any split amount with precision > 2 decimals.
- [ ] With splits present, posting/journal uses split accounts and amounts as source of truth.
- [ ] Header `account_id` mismatch with first split is rejected.
- [ ] Refund allocation never exceeds refundable balance per original payment method.
- [ ] Refund allocation to non-original account is rejected.
- [ ] Refund ceiling correctly restores capacity when prior refund is voided.
- [ ] Backfill process produces explicit exception report for unmapped legacy methods.
- [ ] Backfill cutover is blocked until unresolved mappings are cleared.
- [ ] Same `client_ref` + identical split payload returns existing payment.
- [ ] Same `client_ref` + changed split payload returns idempotency conflict.
- [ ] Split count outside 1..10 is rejected.

## Edge Cases to Handle
1. `payment.amount = 100.00`, splits = 33.33/33.33/33.33: reject (sum mismatch).
2. Splits provided with `account_id` header omitted: derive from first split.
3. Splits provided with header `account_id` different from first split: reject.
4. Same `client_ref` retry with reordered splits: idempotency conflict.
5. Multi-method original payment partially refunded already: enforce per-method remaining ceiling.
6. Refund attempt after original payment is VOID/unposted: reject allocation.
7. Legacy row with `method='CARD'` and no mapped account: unresolved exception row, no silent fallback.
8. Payload contains 11 split lines: reject.
9. Payload contains duplicate account in splits: reject; require client-side aggregation.
10. Void of prior refund should increase available refundable capacity accordingly.

## Rejected options and key tradeoffs

1. **Tolerance-based split validation (e.g., ±0.01)**
   - Rejected because it introduces drift and non-deterministic posting edge cases.

2. **Derive header `account_id` from "largest split" or arbitrary split**
   - Rejected due to ambiguity and unstable behavior when split amounts change.

3. **Allow refund override to any account**
   - Rejected for Phase 8; increases reconciliation risk and audit complexity.

4. **Silent legacy backfill guessing from account name patterns**
   - Rejected because it can misstate historical GL and is hard to detect later.

5. **Idempotent retry updates existing payment**
   - Rejected; retries must be immutable to remain safe under unstable networks.

6. **Unlimited split count**
   - Rejected for now to reduce abuse/performance risk and implementation surface area.
