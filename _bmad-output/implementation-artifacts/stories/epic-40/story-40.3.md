# story-40.3: Sales Orders Management Page

> **Epic:** 40 - Backoffice Feature Completeness - API-to-UI Gap Closure
> **Priority:** P1
> **Estimate:** 20h

---

## Description

Create a comprehensive backoffice page for managing sales orders. The API endpoints for sales orders already exist, but there is no corresponding UI. This story implements the full sales order management interface including list view, creation, editing, and conversion to invoice workflow.

---

## Context

### Current State
- API endpoints exist at `/api/v1/sales/orders` with full CRUD operations
- No backoffice UI exists for sales orders
- Users must use API directly to manage orders
- Conversion to invoice endpoint exists but has no UI integration

### Why This Matters
Sales orders are essential for sales operations - they allow businesses to:
- Create provisional sales records before invoicing
- Track pending orders and reservations
- Convert approved orders directly to invoices
- Manage the order-to-cash workflow
- Coordinate between sales and fulfillment teams

### Reference Implementations
- **Sales Invoices Page:** `apps/backoffice/src/features/sales-invoices-page.tsx` - Use as the primary pattern
- **Sales Orders API:** `apps/api/src/routes/sales/orders.ts` - Reference for data structures
- **Routes Config:** `apps/backoffice/src/app/routes.ts` - See how routes are registered

### Shared Package References
Import schemas/types from `@jurnapod/shared`:
- `SalesOrderCreateRequestSchema` - For validation
- `SalesOrderListQuerySchema` - For query parameters
- `SalesOrderResponseSchema` - For type definitions

---

## Acceptance Criteria

### AC1: List View
- [x] Create `/sales-orders` route and page component
- [ ] Display paginated list of sales orders with columns:
  - Order Number
  - Customer Name
  - Outlet
  - Order Date
  - Total Amount
  - Status (Draft, Confirmed, Converted, Cancelled)
  - Actions (View, Edit, Convert)
- [ ] Implement filtering by:
  - Status (multi-select)
  - Outlet
  - Date range (start/end)
  - Customer
- [ ] Implement sorting by date and amount
- [ ] Show loading state while fetching
- [ ] Show empty state when no orders exist

### AC2: Create Sales Order
- [x] Create new order form at `/sales-orders/new`
- [ ] Form fields:
  - Customer (searchable dropdown)
  - Order Date
  - Expected Delivery Date (optional)
  - Outlet
  - Notes
  - Line Items section:
    - Item (searchable dropdown)
    - Description
    - Quantity
    - Unit Price
    - Tax Rate
    - Line Total (calculated)
  - Subtotal, Tax Total, Grand Total (calculated)
- [ ] Validate all fields with Zod schema (`SalesOrderCreateRequestSchema`)
- [ ] Show validation errors inline
- [ ] Submit to `POST /api/v1/sales/orders`
- [ ] Redirect to detail view after successful creation
- [ ] Show success/error notifications

### AC3: Edit Sales Order
- [x] Edit form accessible at `/sales-orders/:id/edit`
- [ ] Only allow editing when status is "Draft" or "Confirmed"
- [ ] Pre-populate form with existing data
- [ ] Same validation as create form
- [ ] Submit to `PATCH /api/v1/sales/orders/:id`
- [ ] Show loading state while saving
- [ ] Handle concurrent edit conflicts gracefully

### AC4: Sales Order Detail View
- [x] Detail view at `/sales-orders/:id`
- [ ] Display:
  - Order header info (number, dates, status, customer)
  - Outlet information
  - Line items table with all columns
  - Totals section
  - Status history/audit trail
  - Linked invoice information (if converted)
- [ ] Action buttons:
  - Edit (visible only for Draft/Confirmed)
  - Convert to Invoice (visible only for Confirmed)
  - Cancel (visible only for Draft/Confirmed)
  - Print/PDF
  - Back to list

### AC5: Convert to Invoice Workflow
- [x] "Convert to Invoice" button in detail view for Confirmed orders
- [ ] Open conversion modal with preview:
  - Order summary (number, customer, total)
  - Invoice date selection (default today)
  - Line items to be included (with option to exclude)
  - Tax calculations
  - Final invoice total preview
- [ ] Validation in modal:
  - All line items must have valid quantities and prices
  - At least one line item must be selected
- [ ] Action buttons in modal:
  - "Cancel" - Close modal without action
  - "Create Invoice" - Call conversion endpoint
- [ ] Call `POST /api/v1/sales/orders/:id/convert-to-invoice`
- [ ] On success:
  - Close modal
  - Show success notification with link to new invoice
  - Refresh order detail to show "Converted" status
  - Display created invoice number and link
- [ ] On error:
  - Show error notification with message from API
  - Keep modal open for user to review

### AC6: Cancel Order
- [x] "Cancel" button in detail view for Draft/Confirmed orders
- [ ] Confirmation modal requiring reason input
- [ ] Call `POST /api/v1/sales/orders/:id/cancel` (or equivalent endpoint)
- [ ] Show success notification
- [ ] Refresh detail view to show "Cancelled" status
- [ ] Show cancel reason in audit trail

### AC7: Navigation and Permissions
- [x] Add "Sales Orders" menu item under Sales section in sidebar
- [ ] Menu item visibility controlled by `modules.sales.enabled`
- [ ] Enforce ACL permissions:
  - List/View: `sales.orders.READ`
  - Create: `sales.orders.CREATE`
  - Edit: `sales.orders.UPDATE` (and status allows editing)
  - Convert: `sales.orders.UPDATE` (and status is Confirmed)
  - Cancel: `sales.orders.UPDATE` (and status is Draft/Confirmed)
- [ ] Hide action buttons when user lacks permission

### AC8: Data Hooks
- [x] Create `useSalesOrders()` hook for listing with filters in `apps/backoffice/src/hooks/`
- [ ] Create `useSalesOrder(id)` hook for detail fetching
- [ ] Create `useCreateSalesOrder()` hook for creation
- [ ] Create `useUpdateSalesOrder(id)` hook for updates
- [ ] Create `useConvertOrderToInvoice(id)` hook for conversion
- [ ] Create `useCancelSalesOrder(id)` hook for cancellation
- [ ] All hooks must handle loading, error, and success states

---

## API Contracts

### List Sales Orders
```
GET /api/v1/sales/orders?status=&outlet_id=&date_from=&date_to=&page=&limit=
Response: {
  data: SalesOrder[],
  pagination: { page, limit, total, totalPages }
}
```

### Get Sales Order Detail
```
GET /api/v1/sales/orders/:id
Response: {
  id, order_number, customer_id, customer_name,
  outlet_id, outlet_name, order_date, expected_delivery_date,
  status, notes, subtotal, tax_total, grand_total,
  line_items: [...],
  converted_invoice_id, converted_invoice_number,
  created_by, created_at, updated_at
}
```

### Create Sales Order
```
POST /api/v1/sales/orders
Body: {
  customer_id, outlet_id, order_date, expected_delivery_date (optional),
  notes, line_items: [{ item_id, description, quantity, unit_price, tax_rate }]
}
```

### Update Sales Order
```
PATCH /api/v1/sales/orders/:id
Body: { same as create, but only allowed for Draft/Confirmed }
```

### Convert to Invoice
```
POST /api/v1/sales/orders/:id/convert-to-invoice
Body: {
  invoice_date, line_item_ids (optional - if selective conversion)
}
Response: {
  invoice_id, invoice_number, total_amount
}
```

### Cancel Order
```
POST /api/v1/sales/orders/:id/cancel
Body: { reason }
```

---

## Files to Create

```
apps/backoffice/src/
├── features/
│   └── sales-orders-page.tsx              # Main list page
├── components/
│   └── sales-orders/
│       ├── sales-order-list.tsx           # List table component
│       ├── sales-order-filters.tsx        # Filter controls
│       ├── sales-order-form.tsx           # Create/edit form
│       ├── sales-order-detail.tsx         # Detail view component
│       ├── sales-order-line-items.tsx     # Line items table/editor
│       ├── sales-order-actions.tsx        # Action buttons
│       └── convert-to-invoice-modal.tsx   # Conversion workflow modal
├── hooks/
│   └── sales-orders/
│       ├── use-sales-orders.ts            # List hook
│       ├── use-sales-order.ts             # Detail hook
│       ├── use-create-sales-order.ts      # Create mutation
│       ├── use-update-sales-order.ts      # Update mutation
│       ├── use-convert-order-to-invoice.ts # Convert mutation
│       └── use-cancel-sales-order.ts      # Cancel mutation
└── types/
    └── sales-order.ts                     # TypeScript types
```

---

## Files to Modify

```
apps/backoffice/src/
├── app/
│   ├── routes.ts                          # Add /sales-orders routes
│   └── layout.tsx                         # Add sidebar navigation item
├── components/
│   └── layout/
│       └── sidebar.tsx                    # Add "Sales Orders" menu item
└── lib/
    └── permissions.ts                     # Add orders resource (if needed)
```

---

## Definition of Done

- [ ] All acceptance criteria implemented
- [ ] Routes registered and accessible
- [ ] Navigation menu item visible when module enabled
- [ ] ACL permissions enforced on all actions
- [ ] Form validation working with Zod (`SalesOrderCreateRequestSchema`)
- [ ] Loading states implemented
- [ ] Error handling with user-friendly messages
- [ ] `npm run typecheck -w @jurnapod/backoffice` passes
- [ ] `npm run lint -w @jurnapod/backoffice` passes
- [ ] No console errors or warnings
- [ ] Responsive design tested

---

## Dev Notes

### Using Shared Package Schemas
```typescript
import { SalesOrderCreateRequestSchema, SalesOrderListQuerySchema } from '@jurnapod/shared';

// Use for form validation
const formSchema = SalesOrderCreateRequestSchema;

// Use for query validation
const querySchema = SalesOrderListQuerySchema;
```

### Zod Schema for Sales Order
```typescript
const salesOrderLineItemSchema = z.object({
  item_id: z.number().optional(),
  description: z.string().min(1),
  quantity: z.number().positive(),
  unit_price: z.number().nonnegative(),
  tax_rate: z.number().min(0).max(100),
});

const salesOrderSchema = z.object({
  customer_id: z.number().positive(),
  outlet_id: z.number().positive(),
  order_date: z.string().date(),
  expected_delivery_date: z.string().date().optional(),
  notes: z.string().optional(),
  line_items: z.array(salesOrderLineItemSchema).min(1),
});
```

### Status Badge Colors
- Draft: gray/blue
- Confirmed: yellow/amber
- Converted: green
- Cancelled: red

### Permission Check Pattern
```typescript
const canEdit = hasPermission('sales.orders.UPDATE') && ['DRAFT', 'CONFIRMED'].includes(order.status);
const canConvert = hasPermission('sales.orders.UPDATE') && order.status === 'CONFIRMED' && !order.converted_invoice_id;
const canCancel = hasPermission('sales.orders.UPDATE') && ['DRAFT', 'CONFIRMED'].includes(order.status);
```

### Conversion Modal State
```typescript
interface ConvertModalState {
  isOpen: boolean;
  invoiceDate: string;
  selectedLineItemIds: number[]; // If allowing selective conversion
}
```

---

## Related Stories

- **Story 40.1:** Sales Credit Notes Management Page
- **Story 40.2:** Fiscal Year Closing Workflow
- **Story 40.4:** Receivables Ageing Report

---

## Change Log

| Date | Version | Changes |
|------|---------|---------|
| 2026-04-13 | 1.0 | Initial story creation |
