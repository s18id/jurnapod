# Jurnapod Patterns Guide

**Version:** 1.0.0  
**Last Updated:** 2026-03-22  
**Epics:** Epic 9 (UX Simplification), Epic 10 (UI Consistency)

---

## Table of Contents

1. [Overview](#overview)
2. [Epic 9 Hooks](#epic-9-hooks) - Filter, URL, Dirty State, Breadcrumbs
3. [Epic 10 Components](#epic-10-components) - PageHeader, FilterBar, DataTable
4. [Usage Patterns](#usage-patterns) - How to use these together
5. [Migration Guide](#migration-guide) - Moving from legacy to Epic patterns

---

## Overview

Epics 9 and 10 established reusable patterns for the backoffice:

| Epic | Focus | Artifacts |
|------|-------|-----------|
| Epic 9 | UX Simplification | Hooks for filters, URL state, dirty state, breadcrumbs |
| Epic 10 | UI Consistency | Components: PageHeader, FilterBar, DataTable |

### Pattern Philosophy

1. **Composition over Configuration** - Composable pieces over monolithic components
2. **URL as Source of Truth** - Filter state persists in URL
3. **Accessibility First** - WCAG 2.1 AA compliance built-in
4. **Testability** - Pure logic functions are unit-testable

---

## Epic 9 Hooks

All hooks are located in `apps/backoffice/src/hooks/`

### useFilters

**File:** `use-filters.ts`  
**Purpose:** Centralized filter state management with URL sync

```typescript
import { useFilters } from "../hooks";

function MyPage() {
  const { 
    filters,              // Current filter values
    setFilter,            // Update single filter
    setFilters,           // Update multiple filters
    clearFilters,         // Reset all to defaults
    hasActiveFilters,     // boolean for "Clear All" visibility
    isLoading             // For async filter operations
  } = useFilters({
    schema: z.object({
      search: z.string().optional(),
      status: z.enum(["active", "inactive", "all"]).default("all"),
      category: z.string().optional(),
    }),
    storageId: "my-page",  // Unique ID for persistence
    defaultValues: {
      search: "",
      status: "all",
    }
  });

  return (
    <div>
      <input 
        value={filters.search} 
        onChange={(e) => setFilter("search", e.target.value)}
      />
      <select 
        value={filters.status}
        onChange={(e) => setFilter("status", e.target.value)}
      >
        <option value="all">All</option>
        <option value="active">Active</option>
        <option value="inactive">Inactive</option>
      </select>
      {hasActiveFilters && (
        <button onClick={clearFilters}>Clear All</button>
      )}
    </div>
  );
}
```

### useUrlFilterState

**File:** `use-url-filter-state.ts`  
**Purpose:** Sync filter state to URL query parameters

```typescript
import { useUrlFilterState } from "../hooks";

function MyPage() {
  const {
    params,           // Current URL params as object
    setParam,         // Set single param
    setParams,        // Set multiple params
    clearParams,      // Clear all params
    initializeFromUrl // Call on mount to restore state
  } = useUrlFilterState();

  // Initialize from URL on mount
  useEffect(() => {
    initializeFromUrl();
  }, []);

  // URL becomes: #/my-page?search=foo&status=active
}
```

### useDirtyState

**File:** `use-dirty-state.ts`  
**Purpose:** Track unsaved changes with confirmation dialog

```typescript
import { useDirtyState } from "../hooks";
import { DirtyConfirmDialog } from "../components/dirty-confirm-dialog";

function EditForm() {
  const {
    isDirty,           // true if form has unsaved changes
    markClean,         // Call after successful save
    markDirty,         // Call when any field changes
    hasUnsavedChanges  // Alias for isDirty
  } = useDirtyState();

  const handleSave = async () => {
    await saveData();
    markClean();
  };

  const handleCancel = () => {
    if (isDirty) {
      // Show confirmation dialog
      setShowConfirmDialog(true);
    } else {
      navigateAway();
    }
  };

  return (
    <>
      <Form onChange={markDirty} />
      <button onClick={handleSave}>Save</button>
      <button onClick={handleCancel}>Cancel</button>
      
      <DirtyConfirmDialog
        opened={showConfirmDialog}
        onConfirm={() => { setShowConfirmDialog(false); navigateAway(); }}
        onCancel={() => setShowConfirmDialog(false)}
      />
    </>
  );
}
```

### useBreadcrumbs

**File:** `use-breadcrumbs.ts`  
**Purpose:** Automatic breadcrumb generation from routes

```typescript
import { useBreadcrumbs } from "../hooks";

function MyPage() {
  const {
    breadcrumbs,       // Array of { label, href, current }
    isKnownRoute,     // true if route is in known routes
    registerRoute     // Register a route with custom breadcrumbs
  } = useBreadcrumbs();

  return (
    <nav aria-label="Breadcrumb">
      {breadcrumbs.map((crumb, i) => (
        <a 
          key={i} 
          href={crumb.href}
          aria-current={crumb.current ? "page" : undefined}
        >
          {crumb.label}
        </a>
      ))}
    </nav>
  );
}

// Custom route registration
useEffect(() => {
  registerRoute({
    path: "/items/:id",
    generateBreadcrumbs: (params) => [
      { label: "Items", href: "#/items" },
      { label: `Item #${params.id}`, current: true }
    ]
  });
}, []);
```

---

## Epic 10 Components

All components are located in `apps/backoffice/src/components/ui/`

### PageHeader

**File:** `ui/PageHeader/PageHeader.tsx`  
**Purpose:** Consistent page layout with title, breadcrumbs, and actions

```tsx
import { PageHeader } from "./ui/PageHeader";

function UsersPage() {
  return (
    <PageHeader
      title="User Management"
      subtitle="Manage user accounts and permissions"
      breadcrumbs={[
        { label: "Home", href: "#/" },
        { label: "Users", current: true }
      ]}
      actions={
        <Button leftSection={<IconPlus />}>
          Add User
        </Button>
      }
    >
      {/* Page content */}
    </PageHeader>
  );
}
```

**Props:**
```typescript
interface PageHeaderProps {
  title: string;                    // Required - renders as h1
  subtitle?: string;                // Optional description
  breadcrumbs?: BreadcrumbItem[];   // Navigation trail
  actions?: ReactNode;             // Action buttons
  loading?: boolean;               // Skeleton state
}
```

### FilterBar

**File:** `ui/FilterBar/FilterBar.tsx`  
**Purpose:** Reusable filter controls with Epic 9 hooks integration

```tsx
import { FilterBar } from "./ui/FilterBar";
import { useFilters } from "../hooks";

function ItemsPage() {
  const { filters, setFilter, clearFilters, hasActiveFilters } = useFilters({
    schema: itemFilterSchema,
    storageId: "items-page"
  });

  return (
    <FilterBar
      filters={filters}
      onFilterChange={setFilter}
      onClear={clearFilters}
      showClearAll={hasActiveFilters}
    >
      {/* Custom filter controls */}
      <TextInput
        label="Search"
        placeholder="Search items..."
        value={filters.search || ""}
        onChange={(e) => setFilter("search", e.target.value)}
      />
      <Select
        label="Category"
        data={categories}
        value={filters.category}
        onChange={(val) => setFilter("category", val)}
      />
    </FilterBar>
  );
}
```

### DataTable

**File:** `ui/DataTable/DataTable.tsx`  
**Purpose:** TanStack Table wrapper with sort, pagination, selection

```tsx
import { DataTable } from "./ui/DataTable";
import { columnHelper } from "../utils/column-helper";

const columns = [
  columnHelper.accessor("name", { 
    header: "Name",
    cell: (info) => <strong>{info.getValue()}</strong>
  }),
  columnHelper.accessor("status", { 
    header: "Status",
    cell: (info) => <StatusBadge status={info.getValue()} />
  }),
  columnHelper.accessor("createdAt", { 
    header: "Created",
    cell: (info) => formatDate(info.getValue())
  }),
];

function UsersTable({ users, onSelectionChange }) {
  return (
    <DataTable
      columns={columns}
      data={users}
      pagination={{ pageIndex: 0, pageSize: 25 }}
      onSort={(sortBy) => handleSort(sortBy)}
      selection={{
        selectedIds: selectedRows,
        onSelectionChange: onSelectionChange
      }}
      emptyState="No users found"
      onRowClick={(row) => navigateToUser(row.id)}
    />
  );
}
```

---

## Usage Patterns

### Full Page Pattern

Combining Epic 9 hooks and Epic 10 components:

```tsx
import { PageHeader } from "../components/ui/PageHeader";
import { FilterBar } from "../components/ui/FilterBar";
import { DataTable } from "../components/ui/DataTable";
import { useFilters, useBreadcrumbs } from "../hooks";

function UsersPage() {
  // Hooks
  const { breadcrumbs } = useBreadcrumbs();
  const { 
    filters, setFilter, clearFilters, hasActiveFilters 
  } = useFilters({
    schema: userFilterSchema,
    storageId: "users-page"
  });

  // Data
  const { data: users, isLoading } = useQuery(["users", filters], 
    () => fetchUsers(filters)
  );

  return (
    <div className="users-page">
      <PageHeader
        title="User Management"
        breadcrumbs={breadcrumbs}
        actions={
          <Button leftSection={<IconPlus />}>
            Add User
          </Button>
        }
      />

      <FilterBar
        filters={filters}
        onFilterChange={setFilter}
        onClear={clearFilters}
        showClearAll={hasActiveFilters}
      >
        <TextInput
          label="Search"
          value={filters.search || ""}
          onChange={(e) => setFilter("search", e.target.value)}
        />
        <Select
          label="Role"
          data={roleOptions}
          value={filters.role}
          onChange={(val) => setFilter("role", val)}
        />
      </FilterBar>

      <DataTable
        columns={columns}
        data={users || []}
        pagination={{ pageIndex: 0, pageSize: 25 }}
        loading={isLoading}
        emptyState="No users match your filters"
      />
    </div>
  );
}
```

### Modal Edit Pattern

With dirty state tracking:

```tsx
import { useDirtyState } from "../hooks";
import { DirtyConfirmDialog } from "../components/dirty-confirm-dialog";

function EditUserModal({ userId, opened, onClose }) {
  const { isDirty, markClean, markDirty } = useDirtyState();
  const [formData, setFormData] = useState(initialData);
  const [showConfirm, setShowConfirm] = useState(false);

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    markDirty();
  };

  const handleSave = async () => {
    await updateUser(userId, formData);
    markClean();
    onClose();
  };

  const handleClose = () => {
    if (isDirty) {
      setShowConfirm(true);
    } else {
      onClose();
    }
  };

  return (
    <>
      <Modal opened={opened} onClose={handleClose}>
        <Form onChange={handleChange}>
          <TextInput label="Name" defaultValue={formData.name} />
          <TextInput label="Email" defaultValue={formData.email} />
        </Form>
        <Button onClick={handleSave}>Save</Button>
      </Modal>

      <DirtyConfirmDialog
        opened={showConfirm}
        onConfirm={() => { setShowConfirm(false); onClose(); }}
        onCancel={() => setShowConfirm(false)}
      />
    </>
  );
}
```

---

## Migration Guide

### Legacy → Epic 10 Components

#### FilterBar Migration

**Before (Legacy):**
```tsx
// apps/backoffice/src/components/FilterBar.tsx
function FilterBar({ onSearch, onStatusChange }) {
  return (
    <div>
      <input onChange={(e) => onSearch(e.target.value)} />
      <select onChange={(e) => onStatusChange(e.target.value)}>
        <option value="all">All</option>
        <option value="active">Active</option>
      </select>
    </div>
  );
}
```

**After (Epic 10):**
```tsx
import { FilterBar } from "./ui/FilterBar";
import { useFilters } from "../hooks";

function MyFilterBar() {
  const { filters, setFilter } = useFilters({
    schema: myFilterSchema,
    storageId: "my-page"
  });

  return (
    <FilterBar filters={filters} onFilterChange={setFilter}>
      <TextInput
        label="Search"
        value={filters.search || ""}
        onChange={(e) => setFilter("search", e.target.value)}
      />
    </FilterBar>
  );
}
```

#### DataTable Migration

**Before (Legacy):**
```tsx
// apps/backoffice/src/components/DataTable.tsx
function DataTable({ columns, data }) {
  return (
    <Table>
      <Table.Thead>
        <Table.Tr>
          {columns.map(col => <Table.Th>{col.header}</Table.Th>)}
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {data.map(row => (
          <Table.Tr>
            {columns.map(col => <Table.Td>{col.render(row)}</Table.Td>)}
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}
```

**After (Epic 10):**
```tsx
import { DataTable } from "./ui/DataTable";
import { columnHelper } from "../utils/column-helper";

const columns = [
  columnHelper.accessor("name", { header: "Name" }),
  columnHelper.accessor("status", { header: "Status" }),
];

function MyTable({ data }) {
  return (
    <DataTable
      columns={columns}
      data={data}
      pagination={{ pageIndex: 0, pageSize: 25 }}
    />
  );
}
```

---

## References

### Epic 9 Stories
- Story 9.1: Separate Account Editing
- Story 9.2: Matrix-based Outlet Role Assignment
- Story 9.3: Consolidated Row Action Menus
- Story 9.4: Standard Filters and Modal UX Behavior

### Epic 10 Stories
- Story 10.1: Reusable PageHeader Component
- Story 10.2: Reusable FilterBar Component
- Story 10.3: Standardized Table Interaction Patterns
- Story 10.4: Breadcrumb Navigation and UI Standards

### Documentation
- [UI Standards](./ui-standards.md)
- [UI Standards Changelog](./ui-standards-changelog.md)
- [ADR-001: Backoffice UI Component Architecture](./adr/adr-001-backoffice-ui-component-architecture.md)
