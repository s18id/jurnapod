# Story 54.2: AP Payment Write-Path Correctness Hardening

> **HARD GATE (E54-A2):** Implementation of this story MUST NOT begin until the E54-A2 second-pass review checklist is included below.

**Status:** done — ✅ E54-A2 second-pass signed off 2026-05-03

---

## Story Context

**Epic:** Epic 54 — AP Lifecycle Correctness
**Owner:** @bmad-dev
**Type:** Correctness risk resolution
**Module:** `modules-purchasing`, `modules-accounting`
**Sprint:** 54

---

## Problem Statement

AP payment create → post → allocate is the most complex AP write path. Payment allocation to multiple invoices, partial payments, and overpayment handling all have correctness risks. This story proves the payment path is correct, idempotent, and produces accurate invoice balance updates.

---

## Implementation Plan

**This story is test-only.** No production code changes are planned. The deliverable is a single integration test suite proving the AP payment write path is correct.

**Execution order:**
1. **Write AC1b first** (concurrent create idempotency). This is a P0 discovery test.
   - If it passes → production concurrency is safe. Continue with AC2–AC7.
   - If it fails → production bug confirmed. Scope expands to fix the idempotency gap, then resume.
2. Write AC2–AC7 in parallel batches where independent.
3. Run full suite 3× consecutively (AC8).
4. Submit for code review (AC9).
5. Complete E54-A2 second-pass checklist.

**Fixture strategy:** HTTP API path (same as existing `ap-payments.test.ts`). No new canonical fixture needed — full production flow maintains invariant parity between tests and production.

---

## E54-A2: Second-Pass Determinism Review (MANDATORY)

**When required:** Payment allocation corrupting invoice balances is a P0 risk. Second-pass review is **MANDATORY**.

**Second-pass checklist:**
- [x] Payment create idempotency proven — **sequential** (AC1a)
- [x] Payment create idempotency proven — **concurrent** (AC1b)  ← NEW
- [x] Payment post produces correct GL entries (debit AP, credit bank)
- [x] Partial payment reduces invoice open amount correctly
- [x] Full payment sets invoice balance to zero
- [x] Overpayment is rejected or handled per business rules
- [x] Multi-invoice allocation is proportional and correct
- [x] Concurrent payment post with same ID is safe
- [x] No `Date.now()` or `Math.random()` introduced during fix
- [x] 3× consecutive green evidence on AP payment integration suite
- [x] No post-review fixes expected after second-pass sign-off

**Second-pass sign-off:** ✅ 2026-05-03 — 5 review findings resolved, all ACs green

---

## Acceptance Criteria

**AC1a:** Payment create idempotency — sequential
- **Given** a payment is created with `idempotency_key = "pay-abc123"`
- **When** a second create request arrives with the same key
- **Then** the second request returns the same payment (no duplicate)
- **And** exactly one `ap_payments` row exists with that key

**AC1b:** Payment create idempotency — concurrent (NEW)
- **Given** two concurrent create requests with the same `idempotency_key`
- **When** both requests arrive simultaneously
- **Then** both return the same payment ID
- **And** exactly one `ap_payments` row exists with that key

**AC2:** Payment post produces correct GL entries
- **Given** a draft payment of $500.00 to a bank account
- **When** the payment is posted
- **Then** the journal batch contains:
  - Debit AP control account: $500.00
  - Credit bank account: $500.00
  - Batch total debits = total credits

**AC3:** Partial payment reduces invoice open amount correctly
- **Given** an invoice with open amount $1,000.00
- **When** a payment of $300.00 is allocated to the invoice
- **Then** the invoice open amount becomes $700.00
- **And** the invoice status remains POSTED (not PAID)

**AC4:** Full payment sets invoice balance to zero
- **Given** an invoice with open amount $500.00
- **When** a payment of $500.00 is allocated to the invoice
- **Then** the invoice open amount becomes $0.00
- **And** the invoice status remains POSTED (Epic 46 design: no PAID status)

**AC5:** Overpayment is rejected
- **Given** an invoice with open amount $300.00
- **When** a payment allocation of $400.00 is attempted
- **Then** the request is rejected with 400 and clear error message

**AC6:** Payment allocation to multiple invoices is proportional
- **Given** two invoices: Inv-A ($300 open), Inv-B ($700 open)
- **When** a payment of $500 is allocated: $200 to A, $300 to B
- **Then** Inv-A open amount = $100; Inv-B open amount = $400
- **And** total allocated = $500

**AC7:** Concurrent payment post with same ID is safe
- **Given** two concurrent post requests for the same draft payment
- **When** both requests arrive simultaneously
- **Then** exactly one post succeeds; the second returns idempotent success or conflict

**AC8:** Integration tests written and 3× consecutive green

**AC9:** Code review GO required

---

## Test Coverage Criteria

- [ ] Idempotency (CRITICAL — write first):
  - [ ] Sequential duplicate create with same `idempotency_key` → same payment
  - [ ] Concurrent duplicate create (`Promise.allSettled`) → same payment, 1 DB row
- [ ] Happy paths:
  - [ ] Create draft payment → post → verify journal balanced
  - [ ] Partial payment → verify invoice open amount reduced via `computePurchaseInvoiceOpenAmount`
  - [ ] Full payment → verify invoice open amount = $0.00
  - [ ] Multi-invoice allocation → verify `ap_payment_lines` rows match expected amounts
- [ ] Error paths:
  - [ ] 400: Overpayment allocation rejected
  - [ ] 400: Payment with inactive bank account
  - [ ] 400: Payment with zero allocation amount
  - [ ] 409/200: Concurrent post race (exactly 1 journal batch)

---

## Files to Create / Modify

| File | Action | Description |
|------|--------|-------------|
| `apps/api/__test__/integration/purchasing/ap-payment-correctness.test.ts` | Create | New integration test suite for payment correctness |

## Estimated Effort

3 days

## Risk Level

High (P0 — payment allocation corrupts invoice balances)

## Dev Notes

### Important: No `payment_allocations` table
- Allocations are stored in `ap_payment_lines` with `purchase_invoice_id` FK and `allocation_amount` column
- Verify allocations by querying `ap_payment_lines`, not a nonexistent `payment_allocations` table
- Invoice open amount is **computed** (not stored) via `computePurchaseInvoiceOpenAmount()`

### Existing test reference
- `ap-payments.test.ts` (1848 lines) — comprehensive feature tests, not correctness proofs
- Uses HTTP API (POST `/api/purchasing/payments`, POST `/:id/post`) — follow same pattern
- Follows `loginForTest` + token pattern; does NOT use `getSeedSyncContext`

### Concurrent idempotency test (AC1b) — FIRST TEST TO WRITE
- This will prove or disprove a P0 production bug in concurrent CREATE with same `idempotency_key`
- If the test passes: production is safe for this path
- If the test fails: fix production code (add `UNIQUE KEY` on `(company_id, idempotency_key)` or strengthen lock), then resume

### Exact Import Cheat Sheet
```typescript
// Kysely tagged template
import { sql } from 'kysely';

// Test fixtures
import {
  cleanupTestFixtures, createTestCompanyMinimal, createTestUser,
  getRoleIdByCode, assignUserGlobalRole, setModulePermission,
  loginForTest, createTestSupplier, createTestPurchasingAccounts,
  createTestBankAccount,
} from '../../fixtures';

// Open amount computation (NOT in package index)
import { computePurchaseInvoiceOpenAmount }
  from '@jurnapod/modules-purchasing/src/services/purchase-invoice-open-amount.js';

// Monetary helpers
import { fromScaled4 } from '@jurnapod/modules-purchasing';
import { toScaled4 } from '@jurnapod/modules-purchasing/src/services/decimal-scale4.js';

// makeTag — define inline in test file
function makeTag(prefix: string, counter: number): string {
  const worker = process.env.VITEST_POOL_ID ?? '0';
  const pidTag = String(process.pid % 10000).padStart(4, '0');
  return `${prefix}${worker}${pidTag}${String(counter).padStart(4, '0')}`;
}
```

### HTTP Client Pattern
Use raw `fetch` with `Authorization: Bearer ${token}` — no wrapper helpers.
- Create: `POST ${baseUrl}/api/purchasing/payments`
- Post:   `POST ${baseUrl}/api/purchasing/payments/${paymentId}/post`
- Get:    `GET ${baseUrl}/api/purchasing/payments/${paymentId}`

### Fixture Setup Order
1. `createTestCompanyMinimal()` → companyId
2. `createTestUser(companyId)` → user
3. `getRoleIdByCode('OWNER')` → roleId; `assignUserGlobalRole(userId, roleId)`
4. `setModulePermission(companyId, roleId, 'purchasing', 63)` (CRUDAM)
5. `setModulePermission(companyId, roleId, 'accounting', 63)`
6. `createTestSupplier(companyId)` → supplierId
7. `createTestPurchasingAccounts(companyId)` → {ap_account_id, expense_account_id}
8. `createTestBankAccount(companyId)` → bankAccountId
9. `loginForTest(baseUrl, ...)` → ownerToken
10. Create 3 purchase invoices via HTTP, POST all to `/:id/post`:
    - PI-1: grand_total="100000.0000" ($1000) — for partial/full tests
    - PI-2: grand_total="30000.0000" ($300)   — for multi-invoice tests
    - PI-3: grand_total="70000.0000" ($700)   — for multi-invoice tests

### Teardown (afterAll)
```typescript
// @fixture-teardown-allowed
await sql`DELETE apl FROM ap_payment_lines apl INNER JOIN ap_payments ap ON ap.id = apl.ap_payment_id WHERE ap.company_id = ${companyId}`.execute(db);
await sql`DELETE FROM ap_payments WHERE company_id = ${companyId}`.execute(db);
await sql`DELETE FROM journal_lines WHERE company_id = ${companyId}`.execute(db);
await sql`DELETE FROM journal_batches WHERE company_id = ${companyId}`.execute(db);
await sql`DELETE FROM purchase_invoice_lines WHERE company_id = ${companyId}`.execute(db);
await sql`DELETE FROM purchase_invoices WHERE company_id = ${companyId}`.execute(db);
await sql`DELETE FROM accounts WHERE company_id = ${companyId}`.execute(db);
await sql`DELETE FROM suppliers WHERE company_id = ${companyId}`.execute(db);
```

### Key Assertion Patterns

**Open amount after payment:**
```typescript
import { computePurchaseInvoiceOpenAmount }
  from '@jurnapod/modules-purchasing/src/services/purchase-invoice-open-amount.js';
// ... after payment posted
const open = await computePurchaseInvoiceOpenAmount(db, companyId, invoiceId);
// open is a bigint (scaled × 10,000)
expect(open).toBe(7000000n); // $700.00
```

**Allocation rows verification:**
```typescript
const lines = await sql<{ invoice_id: number; amount: string }>`
  SELECT purchase_invoice_id, allocation_amount
  FROM ap_payment_lines WHERE ap_payment_id = ${paymentId}
`.execute(db);
```

**Journal batch verification:**
```typescript
const journal = await sql<{ account_id: number; debit: string; credit: string }>`
  SELECT account_id, debit, credit FROM journal_lines
  WHERE journal_batch_id = ${batchId}
`.execute(db);
const totalDr = journal.rows.reduce((s, r) => s + Number(r.debit), 0);
const totalCr = journal.rows.reduce((s, r) => s + Number(r.credit), 0);
expect(totalDr).toBe(totalCr); // Balanced
```

### Concurrent test pattern (Epic 51)
```typescript
const [r1, r2] = await Promise.allSettled([
  fetch(`${baseUrl}/api/purchasing/payments/${id}/post`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } }),
  fetch(`${baseUrl}/api/purchasing/payments/${id}/post`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } }),
]);
const res1 = r1.status === 'fulfilled' ? r1.value : null;
const res2 = r2.status === 'fulfilled' ? r2.value : null;
// Assert: exactly one batch created in DB
```

### No `Date.now()` or `Math.random()`
All test values must be deterministic. Use fixed amounts from the fixture setup above.

## Risk Register

| ID | Risk | Severity | Mitigation |
|----|------|----------|------------|
| R1 | Concurrent CREATE with same `idempotency_key` may produce duplicate payments (no `UNIQUE KEY` on that column) | **P0** | AC1b is the **first test to write**. If it fails, fix production before proceeding. |
| R2 | `voidAPPayment` does not recalculate invoice open amounts — only creates reversal journal | P0 | **Not in scope** for Story 54.2. Flagged for follow-up story. |
| R3 | `computePurchaseInvoiceOpenAmount` called outside `FOR UPDATE` lock in `createDraft` | P1 | Existing design; lock held during read. No action. |

## Dependencies

- Story 54.1 (invoice correctness) — should be done first or concurrent
- Canonical payment fixtures in `modules-purchasing`

## Validation Evidence

```bash
npm run test:single -w @jurnapod/api -- "__test__/integration/purchasing/ap-payment-correctness.test.ts"
```
