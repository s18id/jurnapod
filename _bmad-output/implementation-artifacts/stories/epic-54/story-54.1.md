# Story 54.1: AP Invoice Write-Path Correctness Hardening

> **HARD GATE (E54-A1/E54-A2):** Implementation of this story MUST NOT begin until:
> 1. This document includes an explicit "usage surface estimation" sub-task per E54-A1
> 2. The E54-A2 second-pass review checklist is included below
>
> **Agent-safe language:** "MUST NOT begin implementation until..." — no ambiguity permitted.

**Status:** done

---

## Story Context

**Epic:** Epic 54 — AP Lifecycle Correctness
**Owner:** @bmad-dev
**Type:** Correctness risk resolution
**Module:** `modules-purchasing`, `modules-accounting`
**Sprint:** 54

---

## Problem Statement

Epic 46 built the AP invoice workflow (create → post → void), but correctness under edge cases was not proven. This story hardens the AP invoice write path to eliminate:
- Non-idempotent create operations (duplicate invoices under retry)
- Incorrect journal entries (wrong debit/credit, unbalanced batches)
- Race conditions in concurrent post operations
- Multi-currency precision loss

---

## E54-A1: Usage Surface Estimation (MANDATORY — E54-A1 Gate Artifact)

### Usage Surface Estimation

| Scope | Pattern | Expected Call Sites |
|-------|---------|---------------------|
| Invoice create entry points | `rg 'createPurchaseInvoice\|insertPurchaseInvoice' --type ts` | 3 (route + service + helper) |
| Invoice post entry points | `rg 'postPurchaseInvoice\|publishPurchaseInvoice' --type ts` | 4 (route, service, batch post, auto-post) |
| Invoice void entry points | `rg 'voidPurchaseInvoice' --type ts` | 2 (route + service) |
| Journal posting calls | `rg 'createManualEntry\|postJournal' --type ts` in purchasing | 2 (invoice post, invoice void) |
| Idempotency checks | `rg 'idempotency_key\|client_tx_id' --type ts` in purchasing | 3 (create, post, void) |

### Measured Usage-Surface Evidence

| Call Site | File | Count |
|-----------|------|-------|
| `createDraftPI` | `purchase-invoice-service.ts:148` | 1 |
| `postPI` | `purchase-invoice-service.ts:511` | 1 |
| `voidPI` | `purchase-invoice-service.ts:839` | 1 |
| `postPI` adapter | `apps/api/src/lib/purchasing/purchase-invoice.ts:132` | 1 |
| `voidPI` adapter | `apps/api/src/lib/purchasing/purchase-invoice.ts:195` | 1 |
| `POST /:id/post` route | `purchase-invoices.ts:225` | 1 |
| `POST /:id/void` route | `purchase-invoices.ts:306` | 1 |
| **Total** | | **7** |

> Usage-surface total = 7 call sites. Changes in Story 54.1 verified against full surface.

---

## E54-A2: Second-Pass Determinism Review (MANDATORY)

**When required:** This story resolves P0 correctness risks in AP invoice posting. Second-pass review is **MANDATORY** because incorrect journal entries corrupt the general ledger.

**Second-pass reviewer:** Charlie (Senior Dev) or designated second-pass reviewer

**Second-pass checklist:**
- [x] Usage surface estimation completed with actual call-site counts documented (7 call sites)
- [x] Invoice create idempotency proven (duplicate key returns same result)
- [x] Invoice post journal entries verified correct (debit expense, debit tax, credit AP)
- [x] Invoice void reverses GL entries correctly
- [x] Multi-currency base amount precision verified (DECIMAL(19,4))
- [x] Concurrent post race condition analyzed and mitigated (status guard + ER_DUP_ENTRY catch)
- [x] No `Date.now()` or `Math.random()` introduced during fix
- [x] 3× consecutive green evidence on AP invoice integration suite
- [x] No post-review fixes expected after second-pass sign-off

---

## Acceptance Criteria

**AC1:** Usage surface documented (pattern search scope, call-site count, concurrency surface) ✅

**AC2:** Invoice create idempotency proven ✅
- **Given** an invoice is created with `idempotency_key = "abc123"`
- **When** a second create request arrives with the same `idempotency_key`
- **Then** the second request returns the same invoice (no duplicate created)
- **And** no duplicate journal batch is created

**AC3:** Invoice post produces correct GL entries ✅
- **Given** a draft invoice with lines totaling $1,000.00 expense, $100.00 tax (10%), $1,100.00 AP
- **When** the invoice is posted
- **Then** the journal batch contains:
  - Debit expense account: $1,000.00
  - Debit tax liability account: $100.00
  - Credit AP control account: $1,100.00
  - Batch total debits = total credits

**AC4:** Invoice void reverses GL entries correctly ✅
- **Given** a posted invoice with journal batch ID 123
- **When** the invoice is voided
- **Then** a reversing journal batch is created with:
  - Credit AP control account: $1,000.00 (reversal)
  - Debit expense account: $800.00 (reversal)
  - Debit tax liability account: $200.00 (reversal)

**AC5:** Multi-currency invoice computes base amount correctly ✅
- **Given** an invoice in USD with amount $100.00 and exchange rate 15,000 IDR/USD
- **When** the invoice is posted
- **Then** base_amount = 1,500,000.00 IDR (exact, no floating-point drift)

**AC6:** Concurrent invoice post with same ID is safe ✅
- **Given** two concurrent post requests for the same draft invoice
- **When** both requests arrive simultaneously
- **Then** exactly one post succeeds; the second returns idempotent success or conflict (not duplicate journal)

**AC7:** Integration tests written and 3× consecutive green ✅

**AC8:** Code review GO required ✅

---

## Test Coverage Criteria

- [x] Coverage target: All paths (create, post, void, idempotency, concurrency)
- [x] Happy paths:
  - [x] Create draft invoice → post → verify journal
  - [x] Create invoice with idempotency key → retry → verify no duplicate
  - [x] Post invoice → void → verify reversing journal
  - [x] Multi-currency invoice → verify base amount precision
- [x] Error paths:
  - [x] 400: Post draft invoice with missing AP account config
  - [x] 400: Post already-posted invoice
  - [x] 400: Void draft invoice (not posted)
  - [x] 409: Concurrent post race (handled gracefully)
  - [x] 409: Concurrent void race (handled gracefully)

---

## Files to Create / Modify

| File | Action | Description |
|------|--------|-------------|
| `apps/api/__test__/integration/purchasing/ap-invoice-correctness.test.ts` | Create | New integration test suite for invoice correctness |

## Estimated Effort

3 days

## Risk Level

High (P0 — incorrect journal entries corrupt GL)

## Dev Notes

- Use existing `purchase-invoices.test.ts` as reference for test patterns
- Leverage canonical AP fixtures from `modules-purchasing` test-fixtures
- Journal entry verification: query `journal_lines` table directly
- Idempotency: verify `idempotency_key` unique constraint behavior
- Multi-currency: use `toScaled` / `fromScaled` pattern from Epic 51 reconciliation

## Dependencies

- Epic 46 (AP module built) — ✅ done
- Epic 47 (AP reconciliation) — ✅ done
- Epic 51 (subledger reconciliation patterns) — ✅ done
- Canonical AP fixtures in `modules-purchasing` — must be verified available

## Validation Evidence

```bash
# Run AP invoice correctness tests
npm run test:single -w @jurnapod/api -- "__test__/integration/purchasing/ap-invoice-correctness.test.ts"

# Expected: all tests pass, 3× consecutive green
```
