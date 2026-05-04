# ADR-0024: Accounts Payable Correctness — Invariants and Architectural Decisions

**Date:** 2026-04-15
**Status:** Accepted
**Deciders:** Winston (Architect), Quinn (QA), Amelia (Dev), Bob (SM)
**Story:** Epic 54 — Accounts Payable Correctness
**References:** D54-001 · D54-002 · D54-003 · D54-004 · D54-005 · migration-0201 · migration-0202

---

## Context

Epic 54 (Accounts Payable Correctness) resolved five correctness defects in the AP subsystem and added a full proof suite. This ADR records the architectural decisions, invariant rules, and operational constraints established during that epic so they are:

1. **Enforceable** — QA can validate test coverage against them
2. **Discoverable** — new team members can understand invariants without reading test code
3. **Immutable without ADR** — future changes require a new ADR, not a silent override

---

## Decision

### 1. AP State Machine — Purchase Invoice

The `purchase_invoices` table has three terminal states. All transitions are enforced in `purchase-invoice-service.ts`.

| Status | Value | Entry Conditions | Exit Conditions |
|--------|-------|-----------------|-----------------|
| `DRAFT` | `0` | Always allowed | Only `postPI()` can advance |
| `POSTED` | `1` | `postPI()` only; requires `DRAFT` | Only `voidPI()` can advance |
| `VOID` | `2` | `voidPI()` only; requires `POSTED` | Terminal — no further transitions |

**Invariant rule:** No state transition may skip intermediate states. `DRAFT → VOID` is illegal without a posted intermediate. This is enforced at the service layer, not the DB layer.

```typescript
// postPI — must be DRAFT
if (invoice.status !== PURCHASE_INVOICE_STATUS.DRAFT) {
  throw new PIError("INVALID_STATUS_TRANSITION", "Only DRAFT invoices may be posted");
}

// voidPI — must be POSTED
if (invoice.status !== PURCHASE_INVOICE_STATUS.POSTED) {
  throw new PIError("INVALID_STATUS_TRANSITION", "Only POSTED invoices may be voided");
}
```

---

### 2. GRN Quantity Enforcement — `invoiced_qty` Accumulator (D54-002)

**Problem:** Before migration 0201, the system allowed cumulative invoiced quantity to exceed received quantity. Two PIs referencing the same PO line could each pass validation but together violate the GRN constraint.

**Solution:** `purchase_order_lines.invoiced_qty DECIMAL(19,4) NOT NULL DEFAULT 0.0000` accumulates all posted PI line quantities. The `postPI()` check uses the accumulator atomically with a `FOR UPDATE` lock.

**Schema:**
```sql
ALTER TABLE purchase_order_lines
  ADD COLUMN invoiced_qty DECIMAL(19,4) NOT NULL DEFAULT 0.0000 AFTER received_qty;
```

**PostPI logic** (inside `FOR UPDATE` transaction):
```typescript
// Atomically: check AND increment in one statement
const newInvoicedQty = receivedQty - currentInvoicedQty;
if (invoiceQty > newInvoicedQty) {
  throw new PIGrnInsufficientQtyError(line.po_line_id, line.qty, String(newInvoicedQty));
}
// Then increment
await sql`
  UPDATE purchase_order_lines
  SET invoiced_qty = invoiced_qty + ${toScaled4(String(line.qty))}
  WHERE id = ${line.po_line_id}
`.execute(trx);
```

**VoidPI logic** — reverses atomically:
```typescript
await sql`
  UPDATE purchase_order_lines
  SET invoiced_qty = invoiced_qty - ${toScaled4(String(line.qty))}
  WHERE id = ${line.po_line_id}
`.execute(trx);
```

**Invariant:** At all times, `SUM(pi_line.qty for all POSTED PI lines against a PO line) <= purchase_order_lines.received_qty`. This is guaranteed by the atomic check-and-increment inside `FOR UPDATE`.

**No FK triggers used** — this invariant is enforced in application code, not DB triggers.

---

### 3. Three-Way Matching — Company-Level Flag (D54-001)

**Problem:** No enforcement that invoiced quantities respect the PO's ordered quantity. A PI could invoice quantities far in excess of what was ordered.

**Decision:** Add `companies.three_way_matching TINYINT(1) NOT NULL DEFAULT 0` — a company-level boolean. No per-supplier or per-PO configuration.

**Schema:**
```sql
ALTER TABLE companies ADD COLUMN three_way_matching TINYINT(1) NOT NULL DEFAULT 0;
```

**Rationale for company-level over supplier-level:**

| Scope | Pros | Cons |
|-------|------|------|
| **Company-level (chosen)** | Single flag; KISS; easy to audit; policy decision not a supplier attribute | No fine-grained control per supplier |
| Supplier-level | Fine-grained | Operational complexity; buyer must decide per supplier; no clear business requirement |

**PostPI logic** — inside `FOR UPDATE` transaction, after GRN check:
```typescript
const receivedAvailable = receivedQty - currentInvoicedQty;           // standard cap
const orderedAvailable  = orderedQty  - currentInvoicedQty;           // three-way cap
const effectiveAvailable = company?.three_way_matching
  ? (receivedAvailable < orderedAvailable ? receivedAvailable : orderedAvailable) // min when enabled
  : receivedAvailable;                                                // standard only when disabled

if (invoiceQty > effectiveAvailable) {
  throw new PIGrnInsufficientQtyError(line.po_line_id, line.qty, String(effectiveAvailable));
}
```

**When `three_way_matching = 0` (default):** only `received_qty` constrains invoicing. This is the backward-compatible default.

**When `three_way_matching = 1`:** cap is `min(received - invoiced, ordered - invoiced)`. If `ordered_qty < received_qty`, the ordered constraint bites first.

**Invariant:** For any PO line, `SUM(posted PI line qty) <= MIN(received_qty, ordered_qty)` when three-way matching is enabled. This is enforced atomically with `invoiced_qty`.

---

### 4. Period-Close Override — Audit Trail and Guardrails (D54-004 / D54-005 / AC3+AC4 from 54.5)

**Rule:** Posting or voiding any AP transaction into a closed period requires:
1. An explicit `period_close_overrides` row authorizing the override
2. An `audit_logs` entry capturing the override event

Both writes happen in the same DB transaction. The canonical helper is `insertPeriodCloseOverride()` from `period-close-override-utils.ts`.

**Transaction type → `period_close_overrides.transaction_type` values:**
| Transaction | Type Value |
|-------------|-----------|
| Post purchase invoice | `PURCHASE_INVOICE` |
| Void purchase invoice | `PURCHASE_INVOICE_VOID` |
| Post AP payment | `AP_PAYMENT` |
| Void AP payment | `AP_PAYMENT_VOID` |
| Apply purchase credit | `PURCHASE_CREDIT` |
| Void purchase credit | `PURCHASE_CREDIT_VOID` |

**Audit log fields:**
```typescript
{
  action: "PERIOD_CLOSE_OVERRIDE",
  result: "SUCCESS",        // never "DENIED" — denials throw before this row
  success: 1,
  company_id, user_id, module_id,
  payload_json: JSON.stringify({ periodId, reason, transactionType, transactionId })
}
```

**Backdate guard (AC4 from 54.5):** `invoiceDate` (not system date) is used for period boundary resolution. If `invoiceDate` falls in a closed period and no valid override exists, the request is rejected with `409 Conflict`.

**Invariant:** No AP transaction may be recorded in a closed period without a corresponding `period_close_overrides` row and `audit_logs` row, both inserted in the same transaction as the business event.

---

### 5. Multi-Currency AP — FX Gain/Loss Posting Rules

**No FX gain/loss on PI posting.** The PI records the expense in company currency using the invoice date's exchange rate. The AP liability is a single journal entry in company currency.

**FX gain/loss occurs at payment** when:
- Payment currency ≠ Invoice currency, **AND**
- Full or over-settlement occurs

**FX variance formula:**
```
fxDiff = allocationAmount (in company currency) − openAmount (in company currency)
fxDiff > 0 → FX Loss  (DR FX Loss account)
fxDiff < 0 → FX Gain  (CR FX Gain account)
```

**Partial settlements:** No FX entry. Simple 2-line journal:
```
DR AP Account       (open amount in company currency)
CR Bank Account     (allocation amount)
```

**Full/over-settlements:** 3-line journal:
```
DR AP Account          (open amount)
DR FX Loss / CR FX Gain (variance)
CR Bank Account        (allocation amount)
```

**FX account auto-creation:**
| Account | Code | Type |
|---------|------|------|
| FX Gain | `PAYMENT_VARIANCE_GAIN` | `REVENUE` |
| FX Loss | `PAYMENT_VARIANCE_LOSS` | `EXPENSE` |

**Invariant:** FX variance is computed in company currency (not payment currency) against the invoice's `openAmount` computed by `computePurchaseInvoiceOpenAmount()`. This aggregates all posted payment applications against the invoice.

---

### 6. AP Payment State Machine

| Status | Value | Entry Conditions |
|--------|-------|-----------------|
| `DRAFT` | `0` | Always allowed |
| `POSTED` | `1` | `postAPPayment()` from DRAFT |
| `VOID` | `2` | `voidAPPayment()` from POSTED |

**Void logic:** Full reversal journal — all original `journal_lines` copied with swapped debit/credit, doc type `AP_PAYMENT_VOID`. `applied_amount` reset to `"0.0000"` on any applied credit notes.

**Overpayment guard:** Throws `APPaymentOverpaymentError` when `allocatedAmount > openAmount` for same-currency invoices or when the invoice is not in an open-currency state. Foreign-currency invoices with `openAmount > 0` are exempt (FX may have moved the rate).

---

### 7. Purchase Credit State Machine

| Status | Value | Entry Conditions |
|--------|-------|-----------------|
| `DRAFT` | `0` | Always allowed |
| `PARTIAL` | `1` | Partial application via `applyPurchaseCredit()` |
| `APPLIED` | `2` | All credit applied via `applyPurchaseCredit()` |
| `VOID` | `3` | `voidPurchaseCredit()` from PARTIAL or APPLIED |

**Void logic:** Resets `applied_amount` to `"0.0000"`. Same pattern as AP Payment void — consistent.

**FIFO ordering:** Credits are applied to open PIs ordered by `invoice_date ASC, id ASC`. Explicit `purchase_invoice_id` on credit lines is applied first.

**Journal on apply:**
```
DR AP Account       (total applied amount)
CR Expense Account  (total applied amount)
```
Balanced — equal DR/CR.

---

## Alternatives Considered

### Three-Way Matching: Supplier-Level Configuration
Rejected because the operational overhead of per-supplier configuration has no clear business justification. Three-way matching is an organizational procurement policy, not a supplier-specific attribute. Company-level is KISS and YAGNI compliant.

### DB Triggers for GRN Enforcement
Rejected per Architecture Program Rule C (No new business DB triggers). The `invoiced_qty` accumulator enforcement in application code is testable, reviewable, and version-controllable. A trigger would hide the invariant in the database layer.

### Per-Location `invoiced_qty`
Rejected (YAGNI). All Epic 54 scenarios use `company_id` scoping without outlet-level PO lines. Adding outlet-level tracking adds complexity with no current requirement.

---

## Consequences

### Positive
- GRN enforcement is atomic and race-condition-free (FOR UPDATE + atomic UPDATE)
- Three-way matching is a single company-level flag, auditable in one place
- All state transitions are explicit and throw on invalid transitions
- FX gain/loss is predictable: always in company currency, always at full settlement
- Period-close overrides are always audited — no silent writes to closed periods

### Negative / Trade-offs
- `invoiced_qty` is per-PO-line, not per-PO-line-per-receipt. If a company receives multiple GRNs against one PO line before invoicing, the accumulator correctly aggregates them, but a partial GRN receipt does not block partial invoicing. This is intentional — the invariant only enforces total qty constraints, not receipt-by-receipt matching.
- FX gain/loss is not recorded on PI posting. If exchange rates move significantly between invoice date and payment date, the variance appears only at settlement. This matches AR treatment and the subledger balance provider contract.

### Neutral / Future
- The `invoiced_qty` column could be extended to track `received_at` timestamps per receipt event for more granular GRN matching. Not in scope for Epic 54.
- Three-way matching at PO release (vs. PI posting) is not enforced — a PO could be released with `ordered_qty = 0`. This is a purchasing workflow concern, not an AP correctness concern.

---

## References

- Migration `0201_purchase_order_lines_invoiced_qty.sql` — D54-002
- Migration `0202_companies_three_way_matching.sql` — D54-001
- `packages/modules/purchasing/src/services/purchase-invoice-service.ts` — postPI, voidPI
- `packages/modules/purchasing/src/services/ap-payment-service.ts` — postAPPayment, voidAPPayment
- `packages/modules/purchasing/src/services/purchase-credit-service.ts` — applyPurchaseCredit, voidPurchaseCredit
- `packages/modules/purchasing/src/services/period-close-override-utils.ts` — insertPeriodCloseOverride
- `apps/api/__test__/integration/purchasing/ap-period-close-enforcement.test.ts` — 12 tests
- `apps/api/__test__/integration/accounting/period-close-guardrail.test.ts` — 22 deterministic tests
- Epic 54 story specs: `story-54.3.md`, `story-54.4.md`, `story-54.5.md`
- `TECHNICAL-DEBT.md` — no open AP items