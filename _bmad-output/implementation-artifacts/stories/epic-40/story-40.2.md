# story-40.2: Fiscal Year Closing Workflow

> **Epic:** 40 - Backoffice Feature Completeness - API-to-UI Gap Closure  
> **Priority:** P0  
> **Estimate:** 16h

---

## Description

Enhance the existing fiscal years page to support the complete year-end closing workflow. The API endpoints for fiscal year closing already exist (preview, initiate, approve), but the UI lacks the corresponding workflow interface. This story adds the closing workflow UI to enable accountants to perform year-end closes through the backoffice.

---

## Context

### Current State
- Fiscal years page exists at `/fiscal-years` with basic CRUD
- API endpoints exist for closing workflow:
  - `POST /api/v1/accounting/fiscal-years/:id/close-preview` - Preview closing entries
  - `POST /api/v1/accounting/fiscal-years/:id/close-initiate` - Initiate close
  - `POST /api/v1/accounting/fiscal-years/:id/close-approve` - Approve close
- No UI exists for the closing workflow
- Users must use API directly to close fiscal years

### Why This Matters
Fiscal year closing is a critical accounting operation that:
- Finalizes financial records for the period
- Generates closing journal entries
- Transfers retained earnings
- Prepares books for the new fiscal year
- Ensures audit compliance

### Reference Implementations
- **Fiscal Years Page:** `apps/backoffice/src/features/fiscal-years-page.tsx` - Base page to enhance
- **Fiscal Years API:** `apps/api/src/routes/accounting/fiscal-years.ts` - Reference for closing endpoints
- **Modal Pattern:** Use existing modal patterns from invoice posting or payment recording

---

## Acceptance Criteria

### AC1: Close Action Button
- [ ] Add "Close Year" action button to fiscal years list
- [ ] Button only visible for fiscal years with status "Open"
- [ ] Button disabled for:
  - Current/active fiscal year (cannot close current period)
  - Years with unposted transactions
  - Years where previous year is not closed (must close sequentially)
- [ ] Show tooltip explaining why button is disabled
- [ ] Button visibility controlled by `accounting.fiscal_years.MANAGE` permission

### AC2: Close Preview Modal
- [ ] Clicking "Close Year" opens preview modal
- [ ] Modal displays:
  - Fiscal year being closed (name, start date, end date)
  - Summary statistics:
    - Total revenue accounts balance
    - Total expense accounts balance
    - Net income/loss amount
    - Number of closing entries to be created
  - Warning if unposted transactions exist
  - List of closing entries that will be created (preview)
- [ ] Each closing entry preview shows:
  - Entry description
  - Debit account(s) and amount(s)
  - Credit account(s) and amount(s)
- [ ] Action buttons in modal:
  - "Cancel" - Close modal without action
  - "Initiate Close" - Proceed to initiation (enabled only if no blockers)

### AC3: Initiate Close
- [ ] Clicking "Initiate Close" calls `POST /api/v1/accounting/fiscal-years/:id/close-initiate`
- [ ] Show loading state during API call
- [ ] On success:
  - Close preview modal
  - Show success notification
  - Refresh fiscal years list to show status change
  - Display "Pending Approval" status on the fiscal year
- [ ] On error:
  - Show error notification with message from API
  - Keep modal open for user to review

### AC4: Approval Workflow UI
- [ ] Show pending close status in fiscal years list
- [ ] For fiscal years with "Pending Close" status:
  - Show "Approve Close" button (for users with MANAGE permission)
  - Show "Reject/Cancel Close" button (optional enhancement)
  - Show who initiated the close and when
- [ ] Display pending closing entries in read-only view

### AC5: Approve Close
- [ ] Clicking "Approve Close" shows confirmation modal
- [ ] Modal displays:
  - Warning that this action is irreversible
  - Summary of closing entries that will be posted
  - Checkbox requiring explicit confirmation ("I understand this will finalize the fiscal year")
- [ ] On confirmation, call `POST /api/v1/accounting/fiscal-years/:id/close-approve`
- [ ] Show loading state
- [ ] On success:
  - Close modal
  - Show success notification
  - Refresh list to show "Closed" status
  - Display posted journal numbers
- [ ] On error:
  - Show error notification
  - Provide option to retry

### AC6: Close Status Display
- [ ] Update fiscal years list to show status column with clear indicators:
  - **Open**: Blue/green badge - Year is active
  - **Pending Close**: Yellow/amber badge - Awaiting approval
  - **Closed**: Gray badge - Year finalized
- [ ] Add filter for status in list view
- [ ] Sort by status (Open first, then Pending, then Closed)

### AC7: Close History and Audit
- [ ] In fiscal year detail view, show close history:
  - Initiated by (user name)
  - Initiated at (timestamp)
  - Approved by (user name)
  - Approved at (timestamp)
  - Closing journal entries created (with links)
- [ ] Show void/lock indicators on closed years

### AC8: Validation and Blockers
- [ ] Before showing preview, validate:
  - No unposted transactions exist in the year
  - All required accounts have balances
  - Previous fiscal year is closed (if not first year)
- [ ] Display clear error messages for any blockers
- [ ] Provide links to resolve blockers (e.g., link to unposted transactions)

---

## API Contracts

### Close Preview
```
POST /api/v1/accounting/fiscal-years/:id/close-preview
Response: {
  can_close: boolean,
  blockers: string[],
  summary: {
    total_revenue: number,
    total_expenses: number,
    net_income: number,
    entry_count: number
  },
  entries: [
    {
      description: string,
      debits: [{ account_id, account_name, amount }],
      credits: [{ account_id, account_name, amount }]
    }
  ]
}
```

### Initiate Close
```
POST /api/v1/accounting/fiscal-years/:id/close-initiate
Response: {
  fiscal_year_id,
  status: "PENDING_CLOSE",
  initiated_by,
  initiated_at
}
```

### Approve Close
```
POST /api/v1/accounting/fiscal-years/:id/close-approve
Response: {
  fiscal_year_id,
  status: "CLOSED",
  approved_by,
  approved_at,
  journal_entries: [{ id, number }]
}
```

### Get Fiscal Year (Enhanced)
```
GET /api/v1/accounting/fiscal-years/:id
Response: {
  id, name, start_date, end_date, status,
  close_info: {
    initiated_by, initiated_at,
    approved_by, approved_at,
    journal_entries: [...]
  } | null
}
```

---

## Files to Create

```
apps/backoffice/src/
├── components/
│   └── fiscal-years/
│       ├── fiscal-year-close-preview-modal.tsx    # Preview modal
│       ├── fiscal-year-close-confirm-modal.tsx    # Approval confirmation
│       ├── fiscal-year-close-status.tsx           # Status badge component
│       └── fiscal-year-close-history.tsx          # Close audit display
├── hooks/
│   └── fiscal-years/
│       ├── use-close-preview.ts                   # Preview mutation
│       ├── use-initiate-close.ts                  # Initiate mutation
│       ├── use-approve-close.ts                   # Approve mutation
│       └── use-close-blockers.ts                  # Blocker check hook
└── types/
    └── fiscal-year-close.ts                       # Closing types
```

---

## Files to Modify

```
apps/backoffice/src/
├── features/
│   └── fiscal-years-page.tsx                      # Add close action buttons
├── components/
│   └── fiscal-years/
│       ├── fiscal-year-list.tsx                   # Add status column, close button
│       └── fiscal-year-detail.tsx                 # Add close history section
├── hooks/
│   └── fiscal-years/
│       └── use-fiscal-year.ts                     # Include close_info in response
└── lib/
    └── permissions.ts                             # Ensure fiscal_years.MANAGE exists
```

---

## Definition of Done

- [ ] All acceptance criteria implemented
- [ ] Close workflow functional end-to-end
- [ ] Permissions enforced on close actions
- [ ] Module enablement checks in place
- [ ] Form validation and error handling
- [ ] Loading states implemented
- [ ] Success/error notifications
- [ ] `npm run typecheck -w @jurnapod/backoffice` passes
- [ ] `npm run lint -w @jurnapod/backoffice` passes
- [ ] No console errors

---

## Dev Notes

### Status Flow
```
OPEN → PENDING_CLOSE → CLOSED
   ↑                    ↓
   └────── (reject) ────┘
```

### Close Button Visibility Logic
```typescript
const canClose = 
  fiscalYear.status === 'OPEN' &&
  !fiscalYear.is_current &&
  fiscalYear.has_no_unposted_transactions &&
  (fiscalYear.is_first_year || fiscalYear.previous_year_closed) &&
  hasPermission('accounting.fiscal_years.MANAGE');
```

### Modal Size
- Preview modal: Large (xl) - needs space for entry tables
- Confirmation modal: Medium (md) - simple confirmation

### Error Handling Pattern
```typescript
try {
  await initiateClose(fiscalYearId);
  notifications.show({ title: 'Success', message: 'Close initiated', color: 'green' });
  refetchFiscalYears();
} catch (error) {
  notifications.show({ 
    title: 'Error', 
    message: error.message || 'Failed to initiate close', 
    color: 'red' 
  });
}
```

### Status Badge Colors
- Open: blue
- Pending Close: yellow/amber
- Closed: gray

---

## Related Documentation

- [Epic 32: Financial Period Close & Reconciliation Workspace](./epic-32-sprint-plan.md)
- [AGENTS.md](../../AGENTS.md) - Permission model reference

---

## Related Stories

- **Story 40.1:** Sales Credit Notes Management Page
- **Story 40.3:** Sales Orders Management Page (optional)
- **Story 40.4:** Receivables Ageing Report

---

## Change Log

| Date | Version | Changes |
|------|---------|---------|
| 2026-04-13 | 1.0 | Initial story creation |
