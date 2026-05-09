# Story 61.4: AP Invoice/Payment Lifecycle & Period-Close Enforcement

**Status:** ready-for-dev

> **Sprint-Status Append-Only Rule (E45-A1 / E46-A1) — MANDATORY:**
> - **REQUIRED**: `npx tsx scripts/update-sprint-status.ts --epic 61 --story 61-4 --status done --title ap-invoice-payment-lifecycle-period-close`

---

## Story

As a **financial controller**,  
I want **AP invoice and payment lifecycles to enforce period-close guards and create reversal journals on void**,  
So that **posting to a closed fiscal year is rejected and corrections are auditable**.

## Context

- Source: Epic 61 (FR4) — AP Invoice/Payment Lifecycle & Period-Close Enforcement
- Depends on: Story 61.3 (purchasing document chain)
- Scope: `@jurnapod/modules-purchasing`, `@jurnapod/modules-accounting`, `apps/api/src/routes/purchasing/*`
- Risk: P1 — period-close violations allow backdated entries

### Period-Close Guard

```
AP Invoice POST ──► Check fiscal year ──► OPEN? ──yes──► Post to GL
                                              │
                                            closed?
                                              │
                                              ▼
                                         409 CONFLICT
                                         "Fiscal year is closed"
```

## Test Scenario Review Checkpoint (MANDATORY — E54-A1)

| Scenario | Type | Coverage Plan |
|----------|------|--------------|
| AP invoice posts when fiscal year is open | Happy | Integration |
| AP invoice rejected when fiscal year closed | Error | Integration |
| AP payment rejected when fiscal year closed | Error | Integration |
| AP invoice void creates reversal journal | Happy | Integration |
| Void uses DELETE permission | Error | Integration |
| Concurrent post during period close | Edge | Integration |

---

## Acceptance Criteria

**AC1: AP invoice posting respects period-close**
**Given** an AP invoice with a date in a closed fiscal year,
**When** posting is attempted,
**Then** the request is rejected with 409 CONFLICT,
**And** the error message indicates the fiscal year is closed.

**AC2: AP payment posting respects period-close**
**Given** an AP payment with a date in a closed fiscal year,
**When** posting is attempted,
**Then** the request is rejected with 409 CONFLICT.

**AC3: AP invoice void creates reversal journals**
**Given** a posted AP invoice,
**When** void is executed,
**Then** reversal journal entries are created,
**And** the original entries are reversed (not deleted).

**AC4: Void/correction uses DELETE permission**
**Given** a user without DELETE on purchasing.invoices,
**When** void is attempted,
**Then** the request is rejected with 403.

**AC5: Period-close guard in application code**
**Given** the AP posting flow,
**When** the guard is enforced,
**Then** it MUST be in application code (not a DB trigger — AGENTS.md §C).

---

## Tasks / Subtasks

- [ ] Task 1: Implement period-close check for AP invoice posting (AC: 1)
- [ ] Task 2: Implement period-close check for AP payment posting (AC: 2)
- [ ] Task 3: Verify void reversal journals (AC: 3)
- [ ] Task 4: Verify DELETE permission on void (AC: 4)
- [ ] Task 5: Integration tests (AC: all)

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `packages/modules/purchasing/src/` | Modify | Period-close guard in AP invoice/payment services |
| `packages/modules/accounting/src/` | Audit | Fiscal year close status check |
| `apps/api/src/routes/purchasing/` | Modify | Period-close enforcement in route handlers |
| `apps/api/__test__/integration/purchasing/` | Create | Period-close integration tests |

## Dev Notes

- Fiscal year close status check: `fiscal_years.is_closed` column
- Use `packages/modules/accounting` to query fiscal year status
- Period-close check must happen BEFORE posting, not after
- Void reversal: debit AP, credit expense (mirror of original: debit expense, credit AP)
- Existing period-close infrastructure from Epic 55 (AP reconciliation/snapshot)

## Dependencies

- Story 61.3 (purchasing document chain — AP invoices and payments)
- Epic 55 (AP reconciliation/snapshot correctness)
- Epic 56 (archive flow trigger fix — migration 0201)

## Risk Level

P1 — Period-close violations allow backdated entries
