# Story 61.6: Sales↔Purchasing↔GL Reconciliation Gate

**Status:** ready-for-dev

> **Sprint-Status Append-Only Rule (E45-A1 / E46-A1) — MANDATORY:**
> - **REQUIRED**: `npx tsx scripts/update-sprint-status.ts --epic 61 --story 61-6 --status done --title sales-purchasing-gl-reconciliation-gate`

---

## Story

As a **financial controller**,  
I want **sales and purchasing journal postings to reconcile to their respective subledgers (AR aging, AP aging)**,  
So that **the general ledger is demonstrably the source of truth for all financial positions**.

## Context

- Source: Epic 61 (FR5) — All finalized documents MUST reconcile to journals
- Depends on: Stories 61.1–61.4 (lifecycle correctness for sales and purchasing)
- Scope: `@jurnapod/modules-accounting`, reconciliation scripts, gate automation
- Risk: P1 — unreconciled subledgers indicate GL integrity issues

### Reconciliation Gate

```
Sales Invoices ──► AR Subledger ──► compare ──► GL AR Account
Sales Payments ──► AR Subledger ──► compare ──► GL Cash Account
AP Invoices    ──► AP Subledger ──► compare ──► GL AP Account
AP Payments    ──► AP Subledger ──► compare ──► GL Cash Account
                                              │
                                         difference?
                                              │
                                         ┌────┴────┐
                                       zero     non-zero
                                         │         │
                                       PASS     FAIL + report
```

## Test Scenario Review Checkpoint (MANDATORY — E54-A1)

| Scenario | Type | Coverage Plan |
|----------|------|--------------|
| Sales invoices reconcile to AR GL | Happy | Integration |
| Sales payments reconcile to cash GL | Happy | Integration |
| AP invoices reconcile to AP GL | Happy | Integration |
| AP payments reconcile to cash GL | Happy | Integration |
| Unreconciled difference reported | Error | Integration |
| Void documents excluded from subledger | Edge | Integration |
| Zero-threshold tolerance check | Edge | Integration |

---

## Acceptance Criteria

**AC1: Sales→AR reconciliation**
**Given** all posted (non-voided) sales invoices and payments,
**When** the AR subledger is compared to the GL AR account balance,
**Then** the difference MUST be zero (or within configurable tolerance).

**AC2: Purchasing→AP reconciliation**
**Given** all posted (non-voided) AP invoices and payments,
**When** the AP subledger is compared to the GL AP account balance,
**Then** the difference MUST be zero (or within configurable tolerance).

**AC3: Reconciliation gate automation**
**Given** the reconciliation script,
**When** executed against the database,
**Then** it produces machine-verifiable pass/fail output,
**And** any discrepancy is reported with specific document references.

**AC4: Void documents excluded**
**Given** voided invoices/payments,
**When** the subledger reconciliation runs,
**Then** voided documents (and their reversals) net to zero contribution.

**AC5: Cross-module journal integrity**
**Given** sales and purchasing postings,
**When** journals are queried,
**Then** every posting has a corresponding journal entry,
**And** journal entries are balanced (debits = credits).

---

## Tasks / Subtasks

- [ ] Task 1: Implement Sales→AR reconciliation (AC: 1)
- [ ] Task 2: Implement Purchasing→AP reconciliation (AC: 2)
- [ ] Task 3: Build reconciliation gate automation (AC: 3)
- [ ] Task 4: Verify void document exclusion (AC: 4)
- [ ] Task 5: Verify cross-module journal integrity (AC: 5)
- [ ] Task 6: Integration tests with seeded test data

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `packages/modules/accounting/src/` | Create/Modify | Reconciliation logic |
| `scripts/` | Create | Gate automation script |
| `apps/api/__test__/integration/reconciliation/` | Create | Subledger reconciliation tests |

## Dev Notes

- Use journal posting data as single source of truth — never subledger tables directly
- Reconciliation query pattern: `SUM(journal_lines.debit) - SUM(journal_lines.credit) GROUP BY account_code`
- AR account code: `AR` (Accounts Receivable)
- AP account code: `AP` (Accounts Payable)
- Gate automation: produce `__EPIC61_GATE__` JSON output (same pattern as Epic 59 gate script)
- Configurable tolerance via env var: `JP_RECONCILIATION_TOLERANCE` (default: 0.00)

## Validation Evidence

```bash
npm run reconcile:sales-ar
npm run reconcile:purchasing-ap
# Expected: both exit 0, produce __EPIC61_GATE__ pass evidence
```

## Dependencies

- Stories 61.1–61.4 (all lifecycle correctness must be verified first)
- `@jurnapod/modules-accounting` journal query API
- Epic 58 (inventory/GL reconciliation) — reuse reconciliation patterns

## Risk Level

P1 — Unreconciled subledgers indicate GL integrity issues
