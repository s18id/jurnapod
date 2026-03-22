# ADR-001: Backoffice UI Component Architecture

**Status:** Accepted  
**Date:** 2026-03-22  
**Deciders:** Epic 10 Team  

---

## Context

During Epic 10 (Backoffice Consistency and Navigation Standards), we created reusable UI components to establish consistency across the backoffice application. The key components created were:

1. **PageHeader** - Standardized page layout with breadcrumbs, title, and actions slot
2. **FilterBar** - Reusable filter controls with URL state persistence
3. **DataTable** - TanStack Table wrapper with consistent table interactions

### Problem Statement

Before Epic 10:
- Pages had inconsistent header layouts and breadcrumbs
- Filter implementations varied across pages (URL state, component state, mixed)
- Table implementations differed (mantine Table, custom solutions)
- No standardized approach to accessibility (WCAG 2.1 AA)

### Decision Drivers

1. **Consistency** - Same layout patterns across all pages
2. **Accessibility** - WCAG 2.1 AA compliance built-in
3. **Maintainability** - Single source of truth for each component pattern
4. **Testability** - Components designed for unit and integration testing
5. **Developer Experience** - Clear patterns that are easy to adopt

---

## Decision

We will use a **layered component architecture** with three tiers:

### Tier 1: Primitives (Mantine)
- Use Mantine UI primitives directly for atomic elements
- Mantine components: Box, Text, Button, TextInput, Select, etc.

### Tier 2: Epic 10 Reusable Components (`/components/ui/`)
- **PageHeader** - Page layout container with breadcrumbs slot
- **FilterBar** - Filter controls with URL state sync
- **DataTable** - TanStack Table wrapper with sort/pagination/selection

### Tier 3: Feature Components (`/components/features/`)
- Feature-specific compositions built on Tier 2 components
- Examples: UserTable, ItemTable, ReservationTable

### Component Locations

```
apps/backoffice/src/components/
├── ui/                          # Epic 10 reusable components
│   ├── PageHeader/
│   │   ├── PageHeader.tsx
│   │   └── PageHeader.test.ts
│   ├── FilterBar/
│   │   ├── FilterBar.tsx
│   │   └── FilterBar.test.ts
│   └── DataTable/
│       ├── DataTable.tsx
│       └── DataTable.test.ts
├── features/                    # Feature-specific components
│   ├── users/
│   ├── items/
│   └── reservations/
└── [legacy]                     # Deprecated, migrate to ui/
    ├── DataTable.tsx            # DEPRECATED - use ui/DataTable
    └── FilterBar.tsx            # DEPRECATED - use ui/FilterBar
```

---

## Consequences

### Positive

1. **Consistent UX** - All pages follow the same layout patterns
2. **Faster Development** - New pages can compose existing components
3. **Accessibility Built-in** - WCAG 2.1 AA compliance in base components
4. **Single Source of Truth** - Changes propagate to all pages automatically

### Negative

1. **Migration Effort** - Existing pages need refactoring to adopt new components
2. **Breaking Changes** - Changes to base components affect all pages
3. **Learning Curve** - Developers need to understand the component hierarchy

### Neutral

1. **Increased File Structure Complexity** - Three-tier hierarchy
2. **Mantine Coupling** - Components depend on Mantine primitives

---

## Implementation Notes

### PageHeader Usage

```tsx
import { PageHeader } from "./ui/PageHeader";

function UsersPage() {
  return (
    <PageHeader
      title="Users"
      breadcrumbs={[
        { label: "Home", href: "/" },
        { label: "Users", current: true }
      ]}
    >
      {/* Page content */}
    </PageHeader>
  );
}
```

### FilterBar Usage

```tsx
import { FilterBar } from "./ui/FilterBar";
import { useFilters } from "../hooks/useFilters";

function ItemsPage() {
  const { filters, setFilter, clearFilters } = useFilters({
    search: "",
    category: "",
    status: "active"
  });

  return (
    <FilterBar
      filters={filters}
      onFilterChange={setFilter}
      onClear={clearFilters}
    >
      {/* Custom filter controls */}
    </FilterBar>
  );
}
```

### DataTable Usage

```tsx
import { DataTable } from "./ui/DataTable";

function UsersTable({ users }) {
  const columns = [
    columnHelper.accessor("name", { header: "Name" }),
    columnHelper.accessor("email", { header: "Email" }),
  ];

  return (
    <DataTable
      columns={columns}
      data={users}
      pagination={{ pageIndex: 0, pageSize: 25 }}
      onSort={handleSort}
      selection={{ selectedIds, onSelectionChange }}
    />
  );
}
```

---

## Adoption Status

| Component | Status | Pages Adopted | Legacy File |
|-----------|--------|---------------|-------------|
| PageHeader | ✅ Available | 0 (pending audit) | N/A |
| FilterBar | ✅ Available | 0 (pending audit) | FilterBar.tsx |
| DataTable | ✅ Available | 0 (pending audit) | DataTable.tsx |

### Migration Plan

1. **Audit** (E10-ACT-001) - Identify all pages using legacy components
2. **Prioritize** - Start with high-traffic pages
3. **Refactor** - Replace legacy with Epic 10 components
4. **Remove** - Delete legacy files once migration complete

---

## References

- Epic 10 Retrospective: `_bmad-output/implementation-artifacts/epic-10-retro-2026-03-22.md`
- UI Standards: `/docs/ui-standards.md`
- Story 10.1: `10-1-reusable-pageheader-component.md`
- Story 10.2: `10-2-reusable-filterbar-component.md`
- Story 10.3: `10-3-standardized-table-interaction-patterns.md`
