# UI Standards Documentation

**Version:** 1.0.0  
**Last Updated:** 2026-03-22  
**Epic:** 10 - Backoffice Consistency and Navigation Standards

---

## Table of Contents

1. [Overview](#overview)
2. [PageHeader Component](#pageheader-component)
3. [FilterBar Component](#filterbar-component)
4. [DataTable Component](#datatable-component)
5. [Modal Patterns](#modal-patterns)
6. [Form Patterns](#form-patterns)
7. [Action Patterns](#action-patterns)
8. [Accessibility Requirements](#accessibility-requirements)
9. [PR Checklist](#pr-checklist)

---

## Overview

This document defines the UI standards for the Jurnapod Backoffice application. These standards ensure consistency across all pages and provide a cohesive user experience.

### Design Principles

1. **Consistency** - All pages use the same structural components
2. **Accessibility** - WCAG 2.1 AA compliance is mandatory
3. **Responsive** - Mobile-first design with tablet/desktop adaptations
4. **Performance** - Optimized rendering with skeleton states
5. **Clarity** - Clear visual hierarchy and feedback

### Tech Stack

- **UI Framework:** Mantine v7
- **Table Library:** TanStack React Table v8
- **Icons:** Tabler Icons
- **Routing:** Hash-based routing via React Router

---

## PageHeader Component

**Location:** `apps/backoffice/src/components/ui/PageHeader/PageHeader.tsx`

### Purpose

Provides a consistent page header structure across all backoffice pages with title, breadcrumbs, and action buttons.

### Props Interface

```typescript
interface PageHeaderProps {
  title: string;                    // Required - renders as h1
  subtitle?: string;                // Optional description
  breadcrumbs?: BreadcrumbItem[];   // Navigation trail
  actions?: ReactNode;             // Action buttons
  loading?: boolean;               // Skeleton state (default: false)
  className?: string;
  "data-testid"?: string;
}

interface BreadcrumbItem {
  label: string;     // Display text
  href?: string;     // Link URL (undefined = current page)
  current?: boolean; // Marks current page
}
```

### Usage Examples

#### Minimal Header
```tsx
<PageHeader title="User Management" />
```

#### Full Featured Header
```tsx
<PageHeader
  title="Item Details"
  subtitle="Viewing item #12345"
  breadcrumbs={[
    { label: "Items", href: "#/items" },
    { label: "Item Details", current: true }
  ]}
  actions={<Button leftSection={<IconPlus />}>Add Item</Button>}
/>
```

### Responsive Behavior

| Viewport | Breadcrumbs | Actions Layout |
|----------|-------------|----------------|
| Mobile (<576px) | Hidden | Below title, stacked |
| Tablet+ (≥576px) | Visible | Right-aligned next to title |

### Do's and Don'ts

#### ✅ Do
- Use `title` as a clear, descriptive page name
- Provide `subtitle` for additional context
- Use `breadcrumbs` on pages with parent navigation
- Pass `loading` prop during data fetches

#### ❌ Don't
- Use heading elements other than h1 for page titles
- Hardcode navigation links in breadcrumbs
- Omit `current: true` on the last breadcrumb item
- Use `javascript:` URLs in breadcrumb links

### Accessibility

- Renders title as `<h1>` for proper document outline
- Uses `<header>` landmark
- Breadcrumb links have `aria-current="page"` on current item
- Breadcrumb separators are `aria-hidden`
- Focus states meet WCAG 2.1 AA (2px outline, 2px offset)

---

## FilterBar Component

**Location:** `apps/backoffice/src/components/ui/FilterBar/FilterBar.tsx`

### Purpose

A configurable, reusable filter bar for consistent filtering behavior across report and history pages.

### Props Interface

```typescript
interface FilterBarProps {
  schema: FilterSchema;                              // Filter field definitions
  onFilterChange: (filters: Record<string, FilterValue>) => void;
  resultCount?: number;                             // For accessibility announcements
  isLoading?: boolean;                              // For accessibility announcements
  "data-testid"?: string;
  className?: string;
  manageUrlState?: boolean;                         // Default: true
  focusTargetId?: string;                          // Focus target after filter changes
}

interface FilterSchema {
  fields: FilterField[];
  defaultValues?: Record<string, FilterValue>;
}

interface FilterField {
  key: string;                                      // Unique key for URL params
  type: "text" | "select" | "date" | "daterange" | "status";
  label: string;
  placeholder?: string;
  options?: SelectOption[];                         // Required for select/status
  validationPattern?: string;                       // Regex string for text
  helpText?: string;
}

type FilterValue = string | DateRange | string[] | null | undefined;

interface DateRange {
  from: string;                                     // YYYY-MM-DD
  to: string;                                       // YYYY-MM-DD
}
```

### Usage Examples

#### Basic Filter Schema
```typescript
const schema: FilterSchema = {
  fields: [
    { key: "search", type: "text", label: "Search", placeholder: "Search..." },
    { 
      key: "status", 
      type: "select", 
      label: "Status", 
      options: [
        { value: "all", label: "All" },
        { value: "active", label: "Active" },
        { value: "inactive", label: "Inactive" }
      ] 
    },
    { key: "date_range", type: "daterange", label: "Date Range" },
  ],
  defaultValues: { search: "", status: "all" },
};
```

#### Component Usage
```tsx
<FilterBar
  schema={schema}
  onFilterChange={handleFilterChange}
  resultCount={results.length}
  isLoading={isLoading}
/>
```

### URL Parameter Format

Filter values are serialized to URL query parameters with the `filter_` prefix:

| Filter Type | URL Format |
|-------------|------------|
| text | `?filter_search=value` |
| select | `?filter_status=value` |
| date | `?filter_date_from=2024-01-01` |
| daterange | `?filter_date_range_from=2024-01-01&filter_date_range_to=2024-01-31` |
| status | `?filter_status=value1,value2` (comma-separated) |

### Do's and Don'ts

#### ✅ Do
- Define `defaultValues` for filters
- Use `validationPattern` for text input validation
- Provide `placeholder` text for text filters
- Include `helpText` for complex filter fields
- Handle empty/undefined values gracefully

#### ❌ Don't
- Use filter keys that conflict with existing URL params
- Hardcode filter options - derive from API when possible
- Skip the `resultCount` prop for accessibility
- Use `manageUrlState: false` unless necessary

### Accessibility

- Live region announcements for filter results
- `aria-describedby` for help text and error messages
- Focus management after filter changes
- Keyboard navigation for all filter controls

---

## DataTable Component

**Location:** `apps/backoffice/src/components/ui/DataTable/DataTable.tsx`

### Purpose

A feature-rich, accessible data table component built on TanStack React Table.

### Props Interface

```typescript
interface DataTableProps<TData> {
  columns: DataTableColumnDef<TData>[];
  data: TData[];
  getRowId: (row: TData) => string;
  loading?: LoadingState;
  error?: TableError | null;
  totalCount?: number;
  pagination?: PaginationState;
  sort?: SortState | null;
  selection?: RowSelectionState;
  batchActions?: BatchAction[];
  onSortChange?: OnSortChange;
  onPaginationChange?: OnPaginationChange;
  onSelectionChange?: OnSelectionChange;
  onRefresh?: () => void;
  emptyState?: ReactNode;
  "data-testid"?: string;
}

interface PaginationState {
  pageIndex: number;
  pageSize: number;
}

interface SortState {
  id: string;
  desc: boolean;
}

type RowSelectionState = Record<string, boolean>;

interface BatchAction {
  id: string;
  label: string;
  icon?: ReactNode;
  variant?: "filled" | "light" | "subtle";
  color?: string;
  disabled?: boolean;
  onClick: (selectedIds: string[]) => void;
}
```

### Column Definition

```typescript
interface DataTableColumnDef<TData> {
  id: string;
  accessorKey?: keyof TData;
  accessorFn?: (row: TData) => unknown;
  header: string;
  enableSorting?: boolean;
  enableResizing?: boolean;
  size?: number;
  minSize?: number;
  maxSize?: number;
  cell?: (props: CellContext<TData, unknown>) => ReactNode;
  skeleton?: () => ReactNode;
}
```

### Usage Examples

#### Basic Table
```tsx
<DataTable
  columns={[
    { id: "name", accessorKey: "name", header: "Name", enableSorting: true },
    { id: "status", accessorKey: "status", header: "Status" },
    { id: "actions", header: "Actions", cell: ActionCell },
  ]}
  data={items}
  getRowId={(row) => row.id}
  pagination={{ pageIndex: 0, pageSize: 20 }}
  totalCount={totalItems}
/>
```

#### Table with Selection and Batch Actions
```tsx
<DataTable
  columns={columns}
  data={items}
  getRowId={(row) => row.id}
  selection={selectedRows}
  onSelectionChange={setSelectedRows}
  batchActions={[
    { id: "delete", label: "Delete", icon: <IconTrash />, color: "red", onClick: handleDelete },
    { id: "export", label: "Export", icon: <IconDownload />, onClick: handleExport },
  ]}
/>
```

### Features

| Feature | Description |
|---------|-------------|
| **Sorting** | Click column headers to sort; Shift+click for multi-sort |
| **Pagination** | Page size options: 10, 20, 50, 100 |
| **Row Selection** | Checkbox column with select all header |
| **Batch Actions** | Action buttons enabled when rows selected |
| **Skeleton Loading** | Per-column skeleton renderers |
| **Empty State** | Custom empty state component |
| **Error State** | Error message with retry action |
| **Responsive** | Horizontal scroll on small viewports |
| **Column Resizing** | Drag column borders to resize |

### Do's and Don'ts

#### ✅ Do
- Provide `getRowId` for proper row identification
- Use skeleton renderers for expensive cell computations
- Define `enableSorting: false` for non-sortable columns
- Set reasonable `pageSize` defaults (20 is recommended)
- Handle empty and error states explicitly

#### ❌ Don't
- Use tables for layout purposes
- Enable sorting on action columns
- Forget to handle `totalCount` for pagination
- Hardcode row actions - use batch actions instead

### Accessibility

- Proper `<table>` semantic structure
- `aria-sort` on sortable column headers
- `aria-selected` on selected rows
- Keyboard navigation for all interactive elements
- Screen reader announcements for selection changes

---

## Modal Patterns

### Usage Guidelines

Use modals for:
- **Confirmation dialogs** - Destructive action confirmations
- **Quick edits** - Single-field inline editing
- **Detail views** - Viewing full details without navigation
- **Forms** - Multi-step processes or complex input

### Do's and Don'ts

#### ✅ Do
- Use `size` prop to control modal width (sm, md, lg, xl)
- Provide clear modal titles
- Include cancel and confirm actions
- Close on Escape key and backdrop click (when safe)
- Trap focus within modal

#### ❌ Don't
- Use modals for simple confirmations that could be inline
- Stack multiple modals (use stepper instead)
- Open modal on page load without user action
- Forget to disable backdrop close for critical confirmations

### Example
```tsx
<Modal
  opened={isOpen}
  onClose={handleClose}
  title="Confirm Deletion"
  size="sm"
>
  <Text>Are you sure you want to delete this item?</Text>
  <Group justify="flex-end" mt="md">
    <Button variant="subtle" onClick={handleClose}>Cancel</Button>
    <Button color="red" onClick={handleConfirm}>Delete</Button>
  </Group>
</Modal>
```

---

## Form Patterns

### Input Guidelines

1. **Labels** - Always visible, positioned above inputs
2. **Placeholders** - Supplementary hints, not replacements for labels
3. **Help Text** - Below input for complex fields
4. **Error Messages** - Below input, red text, with icon
5. **Required Fields** - Mark with asterisk and aria-required

### Validation Approach

- **Client-side** - Real-time validation with debouncing
- **Server-side** - Display API errors below inputs
- **Prevent Submission** - Disable submit until required fields valid

### Do's and Don'ts

#### ✅ Do
- Use `required` prop for mandatory fields
- Provide clear error messages
- Use appropriate input types (email, tel, number)
- Show loading state during form submission

#### ❌ Don't
- Use placeholder as label
- Clear errors before user attempts to fix
- Submit forms with invalid required fields
- Hide field-level validation errors

---

## Action Patterns

### Button Hierarchy

| Variant | Use Case |
|---------|----------|
| **filled** | Primary actions (submit, save) |
| **light** | Secondary actions (cancel, back) |
| **subtle** | Tertiary actions (filters, more options) |
| **filled** + color | Destructive actions (delete, remove) |

### Action Placement

| Location | Actions |
|----------|---------|
| PageHeader | Primary page actions (add, create) |
| Table | Row actions (edit, delete) |
| Modals | Confirmation actions |
| Forms | Submit/Cancel |

### Do's and Don'ts

#### ✅ Do
- Use clear, action-verb labels ("Save Changes", not "Submit")
- Disable buttons during loading states
- Show confirmation for destructive actions
- Group related actions together

#### ❌ Don't
- Use vague labels ("Actions", "More")
- Place too many actions in header
- Mix action types in button groups
- Use color alone to indicate action type

---

## Accessibility Requirements

### Global Requirements

1. **Color Contrast** - Minimum 4.5:1 for text, 3:1 for UI elements
2. **Focus Indicators** - Visible 2px outline with 2px offset
3. **Keyboard Navigation** - All interactions accessible via keyboard
4. **Screen Readers** - Proper ARIA labels and live regions
5. **Reduced Motion** - Respect `prefers-reduced-motion`

### Component-Specific

| Component | Requirements |
|-----------|---------------|
| PageHeader | h1 hierarchy, header landmark, aria-current for breadcrumbs |
| FilterBar | Live regions for result counts, aria-describedby for errors |
| DataTable | aria-sort, aria-selected, proper table semantics |
| Modals | Focus trap, Escape to close, aria-modal |
| Forms | aria-required, aria-invalid, aria-describedby |

### Testing Checklist

- [ ] Tab through entire page flow
- [ ] Verify with screen reader (NVDA/VoiceOver)
- [ ] Check color contrast with contrast checker
- [ ] Test with `prefers-reduced-motion: reduce`
- [ ] Verify keyboard focus is visible

---

## PR Checklist

Before submitting a PR that adds or modifies UI components, verify:

### Code Quality
- [ ] Component follows the patterns defined in this document
- [ ] No inline styles - use Mantine props and theme
- [ ] Props interface properly typed with JSDoc comments
- [ ] No `any` types - use proper type definitions
- [ ] Error boundaries handle failures gracefully

### Functionality
- [ ] All interactive elements are accessible
- [ ] Loading states show skeletons
- [ ] Error states display meaningful messages
- [ ] Empty states have appropriate messaging
- [ ] Responsive behavior works correctly

### Accessibility
- [ ] `aria-*` attributes properly set
- [ ] Keyboard navigation works
- [ ] Screen reader announces changes
- [ ] Focus management is correct
- [ ] Color is not the only indicator

### Testing
- [ ] Unit tests for helper functions
- [ ] Integration tests for component behavior
- [ ] No console errors in tests
- [ ] Tests pass locally

### Documentation
- [ ] JSDoc comments on exported functions
- [ ] README updated if new component
- [ ] This document updated if pattern changed

---

## Changelog

### v1.0.0 (2026-03-22)

- Initial documentation for Epic 10
- PageHeader, FilterBar, DataTable patterns documented
- Modal, form, and action patterns defined
- Accessibility requirements specified
- PR checklist created

---

## Related Stories

- Story 10.1: Reusable PageHeader Component
- Story 10.2: Reusable FilterBar Component
- Story 10.3: Standardized Table Interaction Patterns
- Story 10.4: Breadcrumb Navigation and UI Standards Documentation (this story)

---

## References

- [Mantine v7 Documentation](https://mantine.dev)
- [TanStack Table v8 Documentation](https://tanstack.com/table)
- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
- [ARIA Authoring Practices](https://www.w3.org/WAI/ARIA/apg/)