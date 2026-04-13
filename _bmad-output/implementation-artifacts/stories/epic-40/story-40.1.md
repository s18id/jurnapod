# story-40.1: Sales Credit Notes Management Page

> **Epic:** 40 - Backoffice Feature Completeness - API-to-UI Gap Closure  
> **Priority:** P0  
> **Estimate:** 24h

---

## Description

Create a comprehensive backoffice page for managing sales credit notes. The API endpoints for credit notes already exist, but there is no corresponding UI. This story implements the full credit note management interface including list view, creation, editing, posting, and voiding capabilities.

---

## Context

### Current State
- API endpoints exist at `/api/v1/sales/credit-notes` with full CRUD operations
- No backoffice UI exists for credit notes
- Users must use API directly or database access to manage credit notes

### Why This Matters
Credit notes are essential for sales operations - they allow businesses to:
- Refund customers for returned goods
- Correct billing errors on invoices
- Apply discounts after invoice issuance
- Maintain proper GL integration through posting

### Reference Implementations
- **Sales Invoices Page:** `apps/backoffice/src/features/sales-invoices-page.tsx` - Use as the primary pattern
- **Credit Notes API:** `apps/api/src/routes/sales/credit-notes.ts` - Reference for data structures
- **Routes Config:** `apps/backoffice/src/app/routes.ts` - See how routes are registered

---

## Acceptance Criteria

### AC1: List View
- [ ] Create `/sales-credit-notes` route and page component
- [ ] Display paginated list of credit notes with columns:
  - Credit Note Number
  - Customer Name
  - Reference Invoice (if applicable)
  - Date
  - Total Amount
  - Status (Draft, Posted, Voided)
  - Actions (View, Edit, Post, Void)
- [ ] Implement filtering by:
  - Status (multi-select)
  - Outlet
  - Date range (start/end)
  - Customer
- [ ] Implement sorting by date and amount
- [ ] Show loading state while fetching
- [ ] Show empty state when no credit notes exist

### AC2: Create Credit Note
- [ ] Create new credit note form at `/sales-credit-notes/new`
- [ ] Form fields:
  - Customer (searchable dropdown)
  - Reference Invoice (optional, searchable)
  - Credit Note Date
  - Outlet
  - Notes
  - Line Items section:
    - Item/Description
    - Quantity
    - Unit Price
    - Tax Rate
    - Line Total (calculated)
  - Subtotal, Tax Total, Grand Total (calculated)
- [ ] Validate all fields with Zod schema
- [ ] Show validation errors inline
- [ ] Submit to `POST /api/v1/sales/credit-notes`
- [ ] Redirect to detail view after successful creation
- [ ] Show success/error notifications

### AC3: Edit Credit Note
- [ ] Edit form accessible at `/sales-credit-notes/:id/edit`
- [ ] Only allow editing when status is "Draft"
- [ ] Pre-populate form with existing data
- [ ] Same validation as create form
- [ ] Submit to `PATCH /api/v1/sales/credit-notes/:id`
- [ ] Show loading state while saving
- [ ] Handle concurrent edit conflicts gracefully

### AC4: Credit Note Detail View
- [ ] Detail view at `/sales-credit-notes/:id`
- [ ] Display:
  - Credit note header info (number, date, status, customer)
  - Reference invoice details (if linked)
  - Line items table with all columns
  - Totals section
  - Audit trail (created by, created at, posted by, posted at, voided info)
- [ ] Action buttons:
  - Edit (visible only for Draft)
  - Post to GL (visible only for Draft)
  - Void (visible only for Posted)
  - Print/PDF
  - Back to list
- [ ] Show GL journal entries after posting

### AC5: Post Credit Note
- [ ] "Post" button in detail view for Draft credit notes
- [ ] Confirmation modal explaining the action
- [ ] Call `POST /api/v1/sales/credit-notes/:id/post`
- [ ] Show success notification with journal reference
- [ ] Refresh detail view to show Posted status
- [ ] Disable editing after posting

### AC6: Void Credit Note
- [ ] "Void" button in detail view for Posted credit notes
- [ ] Confirmation modal requiring reason input
- [ ] Call `POST /api/v1/sales/credit-notes/:id/void`
- [ ] Show success notification
- [ ] Refresh detail view to show Voided status
- [ ] Show void reason in audit trail

### AC7: Navigation and Permissions
- [ ] Add "Credit Notes" menu item under Sales section in sidebar
- [ ] Menu item visibility controlled by `modules.sales.enabled`
- [ ] Enforce ACL permissions:
  - List/View: `sales.credit_notes.READ`
  - Create: `sales.credit_notes.CREATE`
  - Edit: `sales.credit_notes.UPDATE` (and status is Draft)
  - Post: `sales.credit_notes.UPDATE` (and status is Draft)
  - Void: `sales.credit_notes.UPDATE` (and status is Posted)
- [ ] Hide action buttons when user lacks permission

### AC8: Data Hooks
- [ ] Create `useCreditNotes()` hook for listing with filters
- [ ] Create `useCreditNote(id)` hook for detail fetching
- [ ] Create `useCreateCreditNote()` hook for creation
- [ ] Create `useUpdateCreditNote(id)` hook for updates
- [ ] Create `usePostCreditNote(id)` hook for posting
- [ ] Create `useVoidCreditNote(id)` hook for voiding
- [ ] All hooks must handle loading, error, and success states

---

## API Contracts

### List Credit Notes
```
GET /api/v1/sales/credit-notes?status=&outlet_id=&date_from=&date_to=&page=&limit=
Response: {
  data: CreditNote[],
  pagination: { page, limit, total, totalPages }
}
```

### Get Credit Note Detail
```
GET /api/v1/sales/credit-notes/:id
Response: {
  id, credit_note_number, customer_id, customer_name,
  reference_invoice_id, reference_invoice_number,
  outlet_id, outlet_name, credit_note_date, notes,
  status, subtotal, tax_total, grand_total,
  line_items: [...],
  created_by, created_at, posted_by, posted_at,
  voided_by, voided_at, void_reason
}
```

### Create Credit Note
```
POST /api/v1/sales/credit-notes
Body: {
  customer_id, reference_invoice_id (optional),
  outlet_id, credit_note_date, notes,
  line_items: [{ item_id, description, quantity, unit_price, tax_rate }]
}
```

### Update Credit Note
```
PATCH /api/v1/sales/credit-notes/:id
Body: { same as create, but only allowed for Draft }
```

### Post Credit Note
```
POST /api/v1/sales/credit-notes/:id/post
Response: { journal_id, journal_number }
```

### Void Credit Note
```
POST /api/v1/sales/credit-notes/:id/void
Body: { reason }
```

---

## Files to Create

```
apps/backoffice/src/
├── features/
│   └── sales-credit-notes-page.tsx          # Main list page
├── components/
│   └── credit-notes/
│       ├── credit-note-list.tsx             # List table component
│       ├── credit-note-filters.tsx          # Filter controls
│       ├── credit-note-form.tsx             # Create/edit form
│       ├── credit-note-detail.tsx           # Detail view component
│       ├── credit-note-line-items.tsx       # Line items table/editor
│       └── credit-note-actions.tsx          # Post/Void buttons
├── hooks/
│   └── credit-notes/
│       ├── use-credit-notes.ts              # List hook
│       ├── use-credit-note.ts               # Detail hook
│       ├── use-create-credit-note.ts        # Create mutation
│       ├── use-update-credit-note.ts        # Update mutation
│       ├── use-post-credit-note.ts          # Post mutation
│       └── use-void-credit-note.ts          # Void mutation
├── types/
│   └── credit-note.ts                       # TypeScript types
└── app/
    └── routes.ts                            # Add route definitions
```

---

## Files to Modify

```
apps/backoffice/src/
├── app/
│   ├── routes.ts                            # Add /sales-credit-notes routes
│   └── layout.tsx                           # Add sidebar navigation item
├── components/
│   └── layout/
│       └── sidebar.tsx                      # Add "Credit Notes" menu item
└── lib/
    └── permissions.ts                       # Add credit_notes resource (if needed)
```

---

## Definition of Done

- [ ] All acceptance criteria implemented
- [ ] Routes registered and accessible
- [ ] Navigation menu item visible when module enabled
- [ ] ACL permissions enforced on all actions
- [ ] Form validation working with Zod
- [ ] Loading states implemented
- [ ] Error handling with user-friendly messages
- [ ] `npm run typecheck -w @jurnapod/backoffice` passes
- [ ] `npm run lint -w @jurnapod/backoffice` passes
- [ ] No console errors or warnings
- [ ] Responsive design tested

---

## Dev Notes

### Zod Schema for Credit Note
```typescript
const creditNoteLineItemSchema = z.object({
  item_id: z.number().optional(),
  description: z.string().min(1),
  quantity: z.number().positive(),
  unit_price: z.number().nonnegative(),
  tax_rate: z.number().min(0).max(100),
});

const creditNoteSchema = z.object({
  customer_id: z.number().positive(),
  reference_invoice_id: z.number().optional(),
  outlet_id: z.number().positive(),
  credit_note_date: z.string().date(),
  notes: z.string().optional(),
  line_items: z.array(creditNoteLineItemSchema).min(1),
});
```

### Status Badge Colors
- Draft: gray/blue
- Posted: green
- Voided: red

### Permission Check Pattern
```typescript
const canEdit = hasPermission('sales.credit_notes.UPDATE') && creditNote.status === 'DRAFT';
const canPost = hasPermission('sales.credit_notes.UPDATE') && creditNote.status === 'DRAFT';
const canVoid = hasPermission('sales.credit_notes.UPDATE') && creditNote.status === 'POSTED';
```

---

## Related Stories

- **Story 40.2:** Fiscal Year Closing Workflow
- **Story 40.3:** Sales Orders Management Page (optional)
- **Story 40.4:** Receivables Ageing Report

---

## Change Log

| Date | Version | Changes |
|------|---------|---------|
| 2026-04-13 | 1.0 | Initial story creation |
