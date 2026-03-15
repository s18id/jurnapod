# Story 3.5: General Ledger Report

Status: done

## Story

As an **accountant**,
I want to **view the general ledger by account**,
So that **I can see detailed transactions per account**.

## Acceptance Criteria

1. [x] AC1: Display all journal entries affecting selected account in date range
   - Implemented - account_id filter, date_from, date_to parameters

2. [x] AC2: Full entry details including opposing entries shown on click
   - Implemented - lines array contains full entry details

3. [x] AC3: Running balance after each entry
   - Implemented - balance field in each line

4. [x] AC4: Accounts grouped by account type
   - Implemented - data structure includes account_type

## Tasks / Subtasks

- [x] Task 1: Backend API
  - [x] GET /reports/general-ledger endpoint
- [x] Task 2: Frontend UI
  - [x] GeneralLedgerPage component

## Dev Notes

### Existing Implementation

**API:**
- `GET /api/reports/general-ledger` - `apps/api/app/api/reports/general-ledger/route.ts`
- Returns: filters, rows (with opening/period debit/credit, balances, lines)
- Parameters: outlet_id, account_id, date_from, date_to, round, line_limit, line_offset

**Frontend:**
- `apps/backoffice/src/features/reports-pages.tsx` - GeneralLedgerPage component
- Uses TanStack Table for display
- Route: /general-ledger in router.tsx

### Files

- apps/api/app/api/reports/general-ledger/route.ts (existing)
- apps/api/src/lib/reports.ts (existing)
- apps/backoffice/src/features/reports-pages.tsx (existing)
- apps/backoffice/src/app/router.tsx (existing)

## Verification

All ACs verified as implemented in existing codebase.
