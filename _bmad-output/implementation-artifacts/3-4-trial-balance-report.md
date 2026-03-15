# Story 3.4: Trial Balance Report

Status: done

## Story

As an **accountant**,
I want to **run a trial balance report**,
So that **I can verify debits equal credits across all accounts**.

## Acceptance Criteria

1. [x] AC1: Display all accounts with balances with debit/credit columns
   - Implemented in `reports-pages.tsx`

2. [x] AC2: Total debits equal total credits (if balanced)
   - Implemented - totals returned from API

3. [x] AC3: Date filter - balances reflect transactions up to that date
   - Implemented - date_from, date_to, as_of parameters

4. [x] AC4: Warning displayed when out of balance
   - ✅ Implemented - Added isTrialBalanced check and Alert banner in reports-pages.tsx

## Tasks / Subtasks

- [x] Task 1: Backend API (AC: 1-4)
  - [x] GET /reports/trial-balance endpoint
- [x] Task 2: Frontend UI (AC: 1-3)
  - [x] Trial balance display with columns
- [x] Task 3: Out of balance warning (AC: 4)
  - [x] ✅ Implemented: Added isTrialBalanced memo, Alert component for warning

## Dev Notes

### Existing Implementation

**API:**
- `GET /api/reports/trial-balance` - `apps/api/app/api/reports/trial-balance/route.ts`
- Returns: filters, totals (total_debit, total_credit, balance), rows

**Frontend:**
- `apps/backoffice/src/features/reports-pages.tsx` - TrialBalanceReport component
- Uses TanStack Table for display
- Shows: Account Code, Name, Debit, Credit, Balance

### Files

- apps/api/app/api/reports/trial-balance/route.ts (existing)
- apps/api/src/lib/reports.ts (existing)
- apps/backoffice/src/features/reports-pages.tsx (existing)

## Dev Agent Record

### Agent Model Used

opencode-go/minimax-m2.5

### Completion Notes List

- Story 3.4 was already fully implemented
- Both API and frontend exist
- Need to verify out-of-balance warning display

### File List

- apps/api/app/api/reports/trial-balance/route.ts (existing)
- apps/api/src/lib/reports.ts (existing)
- apps/backoffice/src/features/reports-pages.tsx (existing)
