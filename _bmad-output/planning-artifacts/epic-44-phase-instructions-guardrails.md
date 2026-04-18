# Epic 44 — Phase Instructions & Guardrails

## Purpose

Execution guide for remaining Epic 44 stories using phased delivery with explicit quality and safety guardrails.

Remaining scope:
- Story 44.3 — Invoice Header Discounts Alignment
- Story 44.5 — Credit Note Customer Flow
- Story 44.4 — Receivables Ageing Reporting Completion

---

## Global Guardrails (All Phases)

1. **ACL parity is mandatory**
   - Keep non-OpenAPI and OpenAPI routes behaviorally identical.
   - Any ACL/resource check added to one must be added to the other.

2. **Tenant safety is mandatory**
   - Every read/write must enforce `company_id` scope (and `outlet_id` where relevant).
   - Cross-company entity references must fail deterministically.

3. **DB migration safety**
   - MySQL/MariaDB portable SQL only.
   - Idempotent guards via `information_schema` checks before `ALTER TABLE`.
   - Match signed/unsigned FK column types exactly.

4. **Validation boundary discipline**
   - Zod parse in `try/catch`; return 400 for malformed/invalid payloads.
   - Never allow Zod validation errors to bubble as unhandled 500.

5. **Testing policy**
   - Use real DB integration tests; no DB mocks.
   - Negative permission tests must use low privilege (`CASHIER` or equivalent custom low-priv role).
   - Run tests in background with PID + log file.

6. **Build order policy**
   - If changing `packages/*`, build affected package(s) before app typecheck/tests.

7. **Risk language in reviews**
   - Review findings must be classified as P0/P1/P2/P3.
   - No “minor” dismissal without explicit risk rationale.

---

## Phase 1 — Story 44.3 (Invoice Header Discounts Alignment)

### Phase 1A: Baseline Verification
**Objective**: confirm discount schema baseline and avoid unnecessary migration churn.

**Instructions**
- Verify whether `sales_invoices` already has required discount fields in current schema/runtime.
- If fields exist and contracts are aligned, do not add fallback migration.
- If missing in target runtime, create guarded idempotent migration only.

**Guardrails**
- No duplicate columns or duplicate constraints.
- Do not introduce incompatible precision/scale for money fields.

### Phase 1B: Contract + Service Alignment
**Objective**: enforce canonical discount behavior before tax.

**Instructions**
- Align shared schema fields and bounds for `discount_percent` and `discount_fixed`.
- Enforce service-level invariant: total discount cannot exceed subtotal.
- Ensure calculation order: subtotal → header discount(s) → taxable base → tax → grand total.

**Guardrails**
- Validation must exist at service layer, not only schema layer.
- No float drift from unsafe arithmetic in critical money paths.

### Phase 1C: Test Coverage
**Objective**: lock behavior with integration coverage.

**Instructions**
- Add/adjust tests for: percent-only, fixed-only, both, over-discount rejection, totals correctness.
- Run focused `sales.invoices` tests first, then broader validation later.

**Guardrails**
- Preserve existing invoice behavior for non-discount payloads.
- Any regression in totals is P1.

---

## Phase 2 — Story 44.5 (Credit Note Customer Flow)

### Phase 2A: Migration
**Objective**: add `sales_credit_notes.customer_id` safely.

**Instructions**
- Add nullable `customer_id` with index and FK to `customers(id)`.
- Use idempotent guards and signedness compatibility checks.

**Guardrails**
- FK mismatch (signed vs unsigned) is blocker.
- Backward compatibility: existing rows remain valid with `NULL`.

### Phase 2B: Inheritance Logic
**Objective**: source invoice customer continuity.

**Instructions**
- On credit note create with `source_invoice_id`, inherit `customer_id` from source invoice.
- Ignore explicit request override when source invoice exists (deterministic behavior).

**Guardrails**
- Inheritance must run in transactionally consistent path.
- Missing source invoice should fail with explicit error, not silent fallback.

### Phase 2C: ACL + Validation
**Objective**: secure customer assignment paths.

**Instructions**
- Require `platform.customers.READ` when setting non-null `customer_id`.
- Validate same-company customer ownership.
- Keep OpenAPI/non-OpenAPI parity.

**Guardrails**
- ACL bypass through alternate route path is P0.

### Phase 2D: Integration Tests
**Objective**: verify end-to-end customer flow for credit notes.

**Instructions**
- Cover inheritance, manual set, update, ACL denial, invalid FK handling.
- Use low-privilege role for negative authorization tests.

**Guardrails**
- Any test mutating system ACL baseline roles is P0 blocker.

---

## Phase 3 — Story 44.4 (Receivables Ageing Reporting Completion)

### Phase 3A: Query Extension
**Objective**: include customer context + overdue flag.

**Instructions**
- Extend existing `/reports/receivables-ageing` data path with customer fields via LEFT JOIN.
- Add overdue flag (`due_date` vs reference date).

**Guardrails**
- Preserve current bucket logic and backward-compatible output shape.
- Maintain tenant and outlet scoping in all query paths.

### Phase 3B: Drill-down Endpoint
**Objective**: customer-specific ageing detail endpoint.

**Instructions**
- Add `/reports/receivables-ageing/customer/:customerId` with same ACL/filter semantics as main report.
- Ensure customer belongs to authenticated company.

**Guardrails**
- Missing ACL/filter parity with main report is P1.

### Phase 3C: Contracts + Tests
**Objective**: enforce API/runtime contract integrity.

**Instructions**
- Update response contracts/types consumed by API/backoffice.
- Add integration tests for customer fields, overdue, drill-down scoping, ACL denial.

**Guardrails**
- Contract drift between runtime and shared schemas is P1.

---

## Phase 4 — Hardening & Exit Gate

### Mandatory Validation Sequence
1. Build changed libs/workspaces first.
2. Typecheck affected app(s)/packages.
3. Lint affected app(s)/packages.
4. Run focused integration tests by changed domain.
5. Run full `@jurnapod/api` integration suite.

### Exit Criteria
- No unresolved P0/P1 findings.
- ACL/tenant invariants preserved.
- All phase acceptance tests passing.
- Story artifacts updated with validation evidence.

---

## Suggested Execution Order

1. **Phase 1 (44.3)** first — independent and narrows financial calculation risks early.
2. **Phase 2 (44.5)** next — depends on 44.2 and closes customer continuity in AR documents.
3. **Phase 3 (44.4)** after 44.5 — reporting extension on stabilized invoice/credit-note customer links.
4. **Phase 4** final hardening and release readiness check.
