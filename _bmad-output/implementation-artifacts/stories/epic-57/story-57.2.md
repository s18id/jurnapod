# Story 57.2: AR Invoice + Payment Posting Correctness

**Status:** planned

> ⚠️ **Sprint-Status Append-Only Rule (E45-A1 / E46-A1) — MANDATORY:**
> If this story modifies `_bmad-output/implementation-artifacts/sprint-status.yaml`:
> - **REQUIRED**: Run `npx tsx scripts/update-sprint-status.ts --epic 57 --story 57-2 --status done` (the canonical utility)
> - **REQUIRED**: After editing, run `npx tsx scripts/validate-sprint-status.ts` to confirm file integrity

---

## Story

As a **finance operations team**,  
I want **AR invoice creation and payment posting to produce balanced, tenant-isolated, idempotent journal entries**,  
So that **AR subledger balances reconcile to the GL and no duplicate postings occur under retry**.

---

## Context

**Source:** Epic 57 kickoff; Sprint 57 AR + Treasury Correctness

**Background:** AR invoice lifecycle (create → post → complete) and payment application (payment → allocation → completion) must produce correct, balanced journal entries. This is the primary correctness story for AR write-path.

**Predecessor:** Story 57.1 verified trigger 0201 allows AR archive transitions. This story focuses on the AR invoice and payment write-path correctness.

**AR journal pattern:**
- AR Invoice: Dr. Accounts Receivable (customer) | Cr. Revenue (or other income account)
- AR Payment: Dr. Cash/Bank | Cr. Accounts Receivable (customer)

**Known constraints:**
- Tenant isolation: all queries scoped by `company_id`
- Idempotency: `client_ref` prevents duplicate postings
- Immutability: POSTED invoices use VOID pattern (not mutation)
- Balanced journal: total debits = total credits per transaction

---

## Test Scenario Review Checkpoint (MANDATORY — E54-A1)

### Pre-Implementation Checklist

- [ ] **Happy paths identified:** AR invoice creation (balanced journal), AR payment posting (balanced journal), idempotent retry (DUPLICATE response)
- [ ] **Error paths identified:** Invalid company_id (400), invoice not found (404), completed invoice mutation attempt (409), unbalanced journal (should not occur — invariants prevent it)
- [ ] **Edge cases identified:** Partial payment allocation, overpayment, underpayment, multi-invoice payment, concurrent invoice creation
- [ ] **Test fixture needs identified:** AR company, AR customer with receivable account, AR invoice settings, cash/bank account
- [ ] **Integration test scope defined:** Real DB required (journal entries, idempotency, tenant isolation)
- [ ] **Negative auth test role selected:** `CASHIER` role (has sales.READ but not sales.MANAGE — use for negative tests on invoice/payment creation)

### Review Outcome

| Scenario | Type | Coverage Plan |
|----------|------|--------------|
| AR invoice created — balanced journal (Dr Receivable, Cr Revenue) | Happy | Integration |
| AR payment posted — balanced journal (Dr Cash, Cr Receivable) | Happy | Integration |
| Idempotent retry — DUPLICATE response, no double-post | Happy | Integration |
| Invoice create with invalid company_id — 400 | Error | Integration |
| Invoice create with invalid customer_id — 400 | Error | Integration |
| Duplicate invoice with same client_ref — DUPLICATE | Edge | Integration |
| POSTED invoice mutation attempt — 409 + trigger block | Error | Integration |
| Overpayment allocation — excess credited to suspense/rule | Edge | Integration |
| Concurrent AR invoice creation — 2 same customer, idempotency | Edge | Integration |
| Invoice not found — 404 | Error | Integration |

**Sign-off:** Test scenarios reviewed and approved before implementation begins.

---

## Cross-Module Decision Gate (MANDATORY — E54-A1 Follow-Up)

### Pre-Implementation Checklist

- [ ] **Modules touched:** `modules-sales` (AR invoice), `modules-accounting` (journal), `modules-treasury` (cash accounts), `modules-platform` (company/customer)
- [ ] **Cross-module decisions identified:**
  1. AR invoice uses `accounts_receivable` account from customer settings (not hardcoded)
  2. Revenue account sourced from AR invoice line items (not from global company default)
  3. Cash/bank account for AR payment from treasury bank account settings
  4. Journal entries are posted synchronously (not async via outbox) — correct for AR?
- [ ] **Winston sign-off obtained:** Awaiting
- [ ] **Decisions recorded:** Per table below

### Decision Record

| # | Decision | Modules Affected | Rationale | Alternatives Considered | Winston Sign-Off |
|---|----------|-----------------|-----------|------------------------|-----------------|
| 1 | AR invoice uses outlet-level AR account from `account_mappings` (key=`AR`) | sales, accounting | AR receivable account is resolved from outlet/company-level `account_mappings` via `readOutletAccountMappingByKey()` — not per-customer. This is implemented in `sales-posting.ts:162-166`. | Per-customer `receivable_account_id` (does not exist in current schema) | implemented |
| 2 | AR payment cash account from `treasury_bank_accounts.id` (explicit selection) | sales, treasury | Explicit bank account selection per payment; matches POS payment pattern | Default cash account (no explicit selection) | pending |
| 3 | Journal posting is synchronous (not outbox) for AR invoice/payment | sales, accounting | AR payments are immediate financial events; outbox adds latency with no benefit | Outbox pattern (used for POS sync only) | pending |

**Hard gate:** These cross-module decisions are advisory — decisions should be reviewed and confirmed before implementation begins to avoid rework. Sign-off status: `pending`.

---

## Acceptance Criteria

**AC1: AR invoice creation produces balanced journal**
**Given** a valid AR company with outlet configured with AR account mapping (`account_mappings` with key `AR`), and invoice line items
**When** POST `/sales/invoices` is called
**Then** a journal entry is created with: debit to the outlet-level AR account (from `account_mappings` with key `AR`), credit to revenue account per line item
**And** total debits = total credits
**And** journal entry tagged with `company_id` and `reference_type='ar_invoice'`

> **Note:** AR receivable account is sourced from `account_mappings` (key=`AR`) at the outlet/company level — not from a per-customer `receivable_account_id`. This matches the `readOutletAccountMappingByKey()` implementation in `sales-posting.ts:162-166`. Customer-level receivable accounts are not used in the current posting flow.

**AC2: AR invoice idempotency**
**Given** a duplicate POST to `/sales/invoices` with same `client_ref`
**When** the first request succeeded and returned a journal entry ID
**Then** the second request returns `200 OK` with the existing invoice (no second journal entry created)
**And** the response body is the existing invoice object (not wrapped in `{ duplicate: true }`)
**And** `client_ref` is preserved on the returned invoice

**AC3: AR payment posting produces balanced journal**
**Given** a valid AR company with outlet configured with AR account mapping, and cash/bank account selected
**When** POST `/sales/payments` is called
**Then** a journal entry is created with: debit to selected cash/bank account, credit to outlet-level AR account (from `account_mappings` key `AR`)
**And** total debits = total credits
**And** journal entry tagged with `company_id` and `reference_type='ar_invoice'`

> **Note:** The receivable account for AR payment is sourced from `account_mappings` (key=`AR`) at the outlet/company level — not from a per-customer `receivable_account_id`.

**AC4: AR payment idempotency**
**Given** a duplicate POST to `/sales/payments` with same `client_ref`
**When** the first request succeeded
**Then** the second request returns `200 OK` with the existing payment object (no second journal entry created)
**And** the response body is the existing payment object (not wrapped in `{ duplicate: true }`)

> **Note:** Both invoice and payment idempotency return the existing record directly (no `{ duplicate: true }` wrapper). The caller can detect duplicates by comparing the returned `client_ref` with the request's `client_ref`.

**AC5: Tenant isolation**
**Given** Company A and Company B both active on the same database
**When** Company A creates an AR invoice
**Then** Company B's AR invoice list returns only Company B's invoices
**And** Company A's journal entries are not visible to Company B

**AC6: Immutability — POSTED invoice mutation rejected**
**Given** a POSTED AR invoice
**When** PUT/PATCH `/sales/invoices/{id}` is attempted to modify amount or lines
**Then** response is `409 Conflict` with message indicating invoice is finalized
**And** underlying snapshot row update is blocked by trigger 0201 (application translates `SQLSTATE '45000'` to `409`)

**AC7: Validation — invalid customer_id**
**Given** an AR invoice request with `customer_id` referencing a non-existent customer
**When** POST `/sales/invoices` is called
**Then** response is `400 Bad Request` with validation error

**AC8: Validation — invalid receivable account**
**Given** an AR invoice request where customer's `receivable_account_id` is null or inactive
**When** POST `/sales/invoices` is called
**Then** response is `400 Bad Request` with error indicating receivable account issue

**AC9: Invoice not found returns 404**
**Given** a request for an invoice that does not exist or belongs to another company
**When** GET `/sales/invoices/{id}` is called
**Then** response is `404 Not Found`

**AC10: Code review GO required**

---

## Test Coverage Criteria

- [ ] Coverage target: all AR invoice and payment paths
- [ ] Happy paths to test:
  - [ ] AR invoice creation with balanced journal
  - [ ] AR payment posting with balanced journal
- [ ] Idempotent invoice create (client_ref)
- [ ] Idempotent payment post (client_ref)
- [ ] Error paths to test:
  - [ ] 400: invalid customer_id, invalid receivable account
  - [ ] 404: invoice not found
  - [ ] 409: completed invoice mutation attempt
  - [ ] Note: unbalanced journal cannot occur in practice — balanced-journal invariant is enforced by service-layer validation before journal creation; no AC for 500 needed

---

## Test Fixtures

### Pre-Implementation Checklist
- [ ] New patterns identified: AR company with customer that has `receivable_account_id`, AR invoice with line items
- [ ] Existing canonical fixtures reviewed: `createTestCompanyMinimal`, `createTestUser`
- [ ] Fixture location: `packages/modules-sales/src/test-fixtures/` (owner package for AR domain)

### Fixture Creation/Update
- [ ] **New fixtures needed:**
  - [ ] Pattern: AR customer with `receivable_account_id` set (not generic customer)
  - [ ] Pattern: AR invoice with line items
  - [ ] Pattern: Cash/bank treasury account for AR payment

---

## Tasks / Subtasks

- [ ] Create AR customer fixture with `receivable_account_id` in `packages/modules/sales/src/test-fixtures/`
- [ ] Create AR invoice creation helper (uses existing `/sales/invoices` route)
- [ ] Write integration tests for AC1–AC10 (real DB required — journal balance, idempotency, tenant isolation)
- [ ] Run `npm run lint -w @jurnapod/api` and `npm run typecheck -w @jurnapod/api`
- [ ] Code review with no P0/P1 blockers

---

## Files to Create

| File | Description |
|------|-------------|
| `packages/modules/sales/src/test-fixtures/ar-customer-fixtures.ts` | AR customer with receivable account |
| `apps/api/__test__/integration/sales/ar-invoice-posting.test.ts` | AR invoice + payment posting tests |

---

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `packages/modules/sales/src/index.ts` | Export | Add AR customer and invoice fixtures |
| `apps/api/src/lib/test-fixtures.ts` | Export | Add thin wrapper re-export for AR customer fixtures |

---

## Estimated Effort

2 days

## Risk Level

High (P0/P1 — AR write-path correctness; journal imbalance would be financial correctness issue)

## Dev Notes

- **Journal balance invariant:** Every AR invoice and payment MUST produce a balanced journal (debits = credits). This is enforced in application code, not by the DB trigger.
- **Idempotency:** Use `client_ref` field for invoice and payment idempotency. `SalesInvoiceService.findInvoiceByClientRef()` and `SalesPaymentService.findPaymentByClientRef()` check for duplicates before posting.
- **Tenant isolation:** All queries include `company_id` filter. No implicit scoping — always explicit.
- **AR invoice customer:** Customer must have `receivable_account_id` set before AR invoice can be created. Validate this at the service layer.
- **Cash account for AR payment:** AR payment must specify a cash/bank treasury account explicitly. The `treasury_bank_accounts` table is the source of truth.
- **Trigger 0201 interaction:** If AR invoice update tries to modify a POSTED invoice's amount or lines, trigger 0201 will block the UPDATE. The application must translate `SQLSTATE '45000'` to `409 Conflict`.

## Cross-Cutting Concerns

### Audit Integration
- [x] Audit events required: AR invoice created, AR payment posted, AR invoice voided
- [x] Audit fields: `company_id`, `user_id`, `module_id`, `operation`, `reference_id`
- [x] Audit tier: `MASTER` (financial events)

### Idempotency
- [x] Idempotency key: `client_ref` on both AR invoice and payment
- [x] Duplicate handling: return DUPLICATE response, do not create second journal entry

### Validation Rules
- [x] `company_id` from auth context — never from request body
- [x] `customer_id` must exist and belong to the company
- [x] `receivable_account_id` must be active and belong to the company

## Validation Evidence

```bash
# Run AR invoice + payment posting tests
npm run test:single -- "apps/api/__test__/integration/sales/ar-invoice-posting.test.ts" -w @jurnapod/api

# Verify lint
npm run lint:migrations
npm run lint -w @jurnapod/api

# Typecheck
npm run typecheck -w @jurnapod/api
```

---

## Dependencies

- Story 57.1 complete (trigger 0201 verified for AR)
- AR customer with `receivable_account_id` fixture exists
- Treasury bank accounts table accessible

---

## Technical Debt Review

- [ ] No shortcuts taken
- [ ] No `TODO`/`FIXME` comments left
- [ ] No `as any` casts
- [ ] Integration tests for all AC paths
- [ ] All new debt items added to registry

---

_Last Updated: 2026-05-05_