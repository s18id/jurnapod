# story-40.4: Receivables Ageing Report

> **Epic:** 40 - Backoffice Feature Completeness - API-to-UI Gap Closure
> **Priority:** P1
> **Estimate:** 12h

---

## Description

Create a backoffice report page for receivables ageing analysis. The API endpoint for this report already exists, but there is no corresponding UI. This story implements the ageing report interface with filtering, tabular display, summary cards, and CSV export capability.

---

## Context

### Current State
- API endpoint exists at `GET /api/v1/reports/receivables-ageing`
- No backoffice UI exists for the receivables ageing report
- Users must use API directly to view ageing analysis
- Other reports like Profit & Loss already exist as UI patterns

### Why This Matters
Receivables ageing is critical for cash flow management - it allows businesses to:
- Track outstanding customer invoices by age bucket
- Identify overdue accounts requiring collection action
- Calculate days sales outstanding (DSO) metrics
- Assess credit risk and bad debt exposure
- Support audit and financial reporting requirements

### Reference Implementations
- **Profit & Loss Report:** `apps/backoffice/src/features/reports/profit-loss-page.tsx` - Use as primary pattern
- **Reports Layout:** Follow existing report layout patterns in `apps/backoffice/src/features/reports/`
- **Routes Config:** `apps/backoffice/src/app/routes.ts` - See how report routes are registered

### Shared Package References
Use existing report types from `@jurnapod/shared`:
- Import report response types for type safety
- Use shared date utilities for date range handling

### Ageing Buckets Definition
- **Current**: Not yet due (due date >= as-of date)
- **1-30**: 1-30 days overdue (due date < as-of date, >= as-of date - 30 days)
- **31-60**: 31-60 days overdue (due date < as-of date - 30 days, >= as-of date - 60 days)
- **61-90**: 61-90 days overdue (due date < as-of date - 60 days, >= as-of date - 90 days)
- **90+**: More than 90 days overdue (due date < as-of date - 90 days)

---

## Acceptance Criteria

### AC1: Report Route and Navigation
- [x] Create `/reports/receivables-ageing` route and page component
- [ ] Add "Receivables Ageing" menu item under Reports section in sidebar
- [ ] Menu item visibility controlled by:
  - `modules.reports.enabled` (or appropriate module flag)
  - User permission `accounting.reports.READ` or `sales.reports.READ`
- [ ] Follow existing report route patterns (e.g., `/reports/profit-loss`)

### AC2: Report Filters
- [x] Filter panel with:
  - **As-of Date**: Date picker, default to today
  - **Outlet**: Dropdown (optional, "All Outlets" default)
  - **Customer**: Searchable dropdown (optional, "All Customers" default)
- [ ] "Apply Filters" button to fetch report data
- [ ] "Reset" button to clear filters to defaults
- [ ] Loading state while fetching data
- [ ] Store filter state in URL query parameters for shareability

### AC3: Summary Cards
- [x] Display summary cards at top of report:
  - **Total Outstanding**: Sum of all ageing buckets
  - **Current**: Amount not yet due
  - **Overdue**: Sum of all overdue buckets (1-30 + 31-60 + 61-90 + 90+)
  - **% Overdue**: (Overdue / Total Outstanding) * 100
- [ ] Cards should update when filters change
- [ ] Format amounts with company currency settings
- [ ] Color coding: Green for Current, Yellow/Orange for Overdue, Red for high % Overdue (>30%)

### AC4: Ageing Table
- [x] Data table with columns:
  - Customer Name
  - Current (amount not yet due)
  - 1-30 Days (overdue amount)
  - 31-60 Days (overdue amount)
  - 61-90 Days (overdue amount)
  - 90+ Days (overdue amount)
  - Total Outstanding (sum of all buckets)
- [ ] Right-align all currency columns
- [ ] Format amounts with proper currency formatting
- [ ] Show row-level totals
- [ ] Show grand total row at bottom
- [ ] Handle empty state when no data

### AC5: Sorting
- [x] Make all columns sortable
- [ ] Default sort: Total Outstanding (descending)
- [ ] Indicate sort direction with icons
- [ ] Support multi-column sort (optional enhancement)

### AC6: CSV Export
- [x] "Export CSV" button in toolbar
- [ ] Export includes all columns from the table
- [ ] Filename format: `receivables-ageing-{as-of-date}.csv`
- [ ] Include report metadata in CSV (as-of date, generated at, filters applied)
- [ ] Handle large datasets (streaming or chunked download)
- [ ] Show loading state during export

### AC7: Detail Drill-Down
- [ ] Click on customer name to view customer detail page
- [ ] Click on ageing bucket amount to view filtered invoice list (optional enhancement)
- [ ] Hover tooltip showing invoice breakdown (optional enhancement)

### AC8: Data Hook
- [x] Create `useReceivablesAgeing()` hook in `apps/backoffice/src/hooks/`
- [ ] Hook signature:
  ```typescript
  function useReceivablesAgeing(params: {
    asOfDate: string;
    outletId?: number;
    customerId?: number;
  }): {
    data: ReceivablesAgeingReport | undefined;
    isLoading: boolean;
    error: Error | null;
    refetch: () => void;
  }
  ```
- [ ] Handle loading, error, and success states
- [ ] Support refetching after filter changes

---

## API Contracts

### Get Receivables Ageing Report
```
GET /api/v1/reports/receivables-ageing?as_of_date=&outlet_id=&customer_id=
Response: {
  as_of_date: string,
  outlet_id: number | null,
  customer_id: number | null,
  summary: {
    total_outstanding: number,
    current: number,
    bucket_1_30: number,
    bucket_31_60: number,
    bucket_61_90: number,
    bucket_90_plus: number,
    overdue_total: number,
    overdue_percentage: number
  },
  customers: [
    {
      customer_id: number,
      customer_name: string,
      customer_code: string,
      current: number,
      bucket_1_30: number,
      bucket_31_60: number,
      bucket_61_90: number,
      bucket_90_plus: number,
      total_outstanding: number
    }
  ]
}
```

---

## Files to Create

```
apps/backoffice/src/
├── features/
│   └── reports/
│       └── receivables-ageing-page.tsx    # Main report page
├── components/
│   └── reports/
│       └── receivables-ageing/
│           ├── ageing-summary-cards.tsx   # Summary cards component
│           ├── ageing-table.tsx           # Data table component
│           ├── ageing-filters.tsx         # Filter controls
│           └── ageing-export-button.tsx   # CSV export button
├── hooks/
│   └── use-receivables-ageing.ts          # Data fetching hook
└── types/
    └── reports/
        └── receivables-ageing.ts          # TypeScript types
```

---

## Files to Modify

```
apps/backoffice/src/
├── app/
│   ├── routes.ts                          # Add /reports/receivables-ageing route
│   └── layout.tsx                         # Add reports navigation item
├── components/
│   └── layout/
│       └── sidebar.tsx                    # Add "Receivables Ageing" under Reports
└── features/
    └── reports/
        └── index.tsx                      # Export new report page (if applicable)
```

---

## Definition of Done

- [ ] All acceptance criteria implemented
- [ ] Route registered and accessible
- [ ] Navigation menu item visible when module enabled
- [ ] ACL permissions enforced on report access
- [ ] Filters working with proper validation
- [ ] Summary cards displaying correctly
- [ ] Table with all ageing buckets implemented
- [ ] Sortable columns functional
- [ ] CSV export working
- [ ] Loading states implemented
- [ ] Error handling with user-friendly messages
- [ ] `npm run typecheck -w @jurnapod/backoffice` passes
- [ ] `npm run lint -w @jurnapod/backoffice` passes
- [ ] No console errors or warnings
- [ ] Responsive design tested

---

## Dev Notes

### TypeScript Types
```typescript
interface ReceivablesAgeingBucket {
  current: number;
  bucket_1_30: number;
  bucket_31_60: number;
  bucket_61_90: number;
  bucket_90_plus: number;
}

interface ReceivablesAgeingCustomer extends ReceivablesAgeingBucket {
  customer_id: number;
  customer_name: string;
  customer_code: string;
  total_outstanding: number;
}

interface ReceivablesAgeingSummary extends ReceivablesAgeingBucket {
  total_outstanding: number;
  overdue_total: number;
  overdue_percentage: number;
}

interface ReceivablesAgeingReport {
  as_of_date: string;
  outlet_id: number | null;
  customer_id: number | null;
  summary: ReceivablesAgeingSummary;
  customers: ReceivablesAgeingCustomer[];
}
```

### Summary Card Component
```typescript
const SummaryCard = ({ 
  title, 
  amount, 
  variant = 'neutral' 
}: { 
  title: string; 
  amount: number; 
  variant?: 'success' | 'warning' | 'danger' | 'neutral';
}) => (
  <Card>
    <Text size="sm" color="dimmed">{title}</Text>
    <Text size="xl" weight={700} color={variantColorMap[variant]}>
      {formatCurrency(amount)}
    </Text>
  </Card>
);
```

### CSV Export Function
```typescript
const exportToCSV = (report: ReceivablesAgeingReport) => {
  const headers = ['Customer', 'Current', '1-30 Days', '31-60 Days', '61-90 Days', '90+ Days', 'Total'];
  const rows = report.customers.map(c => [
    c.customer_name,
    c.current,
    c.bucket_1_30,
    c.bucket_31_60,
    c.bucket_61_90,
    c.bucket_90_plus,
    c.total_outstanding
  ]);
  
  const csv = [headers, ...rows]
    .map(row => row.join(','))
    .join('\n');
  
  downloadCSV(csv, `receivables-ageing-${report.as_of_date}.csv`);
};
```

### Permission Check
```typescript
const canViewReport = hasPermission('accounting.reports.READ') || hasPermission('sales.reports.READ');
```

### Default Filter Values
```typescript
const defaultFilters = {
  asOfDate: new Date().toISOString().split('T')[0], // Today
  outletId: undefined, // All outlets
  customerId: undefined // All customers
};
```

### Table Sorting Logic
```typescript
const sortedCustomers = useMemo(() => {
  if (!report?.customers) return [];
  
  return [...report.customers].sort((a, b) => {
    const aValue = a[sortColumn];
    const bValue = b[sortColumn];
    const multiplier = sortDirection === 'asc' ? 1 : -1;
    
    if (typeof aValue === 'string') {
      return aValue.localeCompare(bValue) * multiplier;
    }
    return (aValue - bValue) * multiplier;
  });
}, [report?.customers, sortColumn, sortDirection]);
```

---

## Related Stories

- **Story 40.1:** Sales Credit Notes Management Page
- **Story 40.2:** Fiscal Year Closing Workflow
- **Story 40.3:** Sales Orders Management Page

---

## Change Log

| Date | Version | Changes |
|------|---------|---------|
| 2026-04-13 | 1.0 | Initial story creation |
