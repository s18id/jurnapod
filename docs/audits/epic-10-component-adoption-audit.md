# Epic 10 Component Adoption Audit

**Audit Date:** 2026-03-22  
**Auditor:** BMAD Sprint Planning Agent  
**Epic:** 10 - Backoffice Consistency and Navigation Standards  

---

## Executive Summary

| Component | Available | Pages Using Legacy | Pages Using Epic 10 | Pages Without Component | Total Pages |
|-----------|-----------|--------------------|--------------------|-------------------------|-------------|
| PageHeader | ✅ | N/A | 0 | 40+ | 40+ |
| FilterBar | ✅ | 10 | 0 | 30+ | 40+ |
| DataTable | ✅ | 5 | 4 | 30+ | 40+ |

**Conclusion:** All Epic 10 components are available but adoption is **LOW**. Migration effort needed.

---

## Detailed Findings

### PageHeader Component

**Status:** Available at `components/ui/PageHeader/PageHeader.tsx`  
**Pages Using:** 0  
**Pages NOT Using:** All pages

#### Pages Missing PageHeader

1. `features/users-page.tsx`
2. `features/companies-page.tsx`
3. `features/outlets-page.tsx`
4. `features/roles-page.tsx`
5. `features/items-page.tsx`
6. `features/prices-page.tsx`
7. `features/reservations-page.tsx`
8. `features/reservation-calendar-page.tsx`
9. `features/table-board-page.tsx`
10. `features/outlet-tables-page.tsx`
11. `features/reports-pages.tsx`
12. `features/tax-rates-page.tsx`
13. `features/accounts-page.tsx`
14. `features/fixed-assets-page.tsx`
15. `features/account-mappings-page.tsx`
16. `features/cash-bank-page.tsx`
17. `features/fiscal-years-page.tsx`
18. `features/account-types-page.tsx`
19. `features/audit-logs-page.tsx`
20. `features/sync-history-page.tsx`
21. `features/sync-queue-page.tsx`
22. `features/sales-invoices-page.tsx`
23. `features/sales-payments-page.tsx`
24. `features/supplies-page.tsx`
25. `features/item-groups-page.tsx`
26. `features/modules-page.tsx`
27. `features/module-roles-page.tsx`
28. `features/feature-settings-page.tsx`
29. `features/inventory-settings-page.tsx`
30. `features/platform-settings-page.tsx`
31. And more...

#### Recommended Priority for PageHeader Adoption

| Priority | Pages | Reason |
|----------|-------|--------|
| HIGH | users, outlets, roles, items, accounts | High-traffic, frequently used |
| MEDIUM | reservations, table-board, reports | Core business workflows |
| LOW | settings pages, static pages | Less frequent use |

---

### FilterBar Component

**Status:** Legacy at `components/FilterBar.tsx`, Epic 10 at `components/ui/FilterBar/FilterBar.tsx`  
**Pages Using Legacy:** 10  
**Pages Using Epic 10:** 0

#### Pages Using Legacy FilterBar (Need Migration)

| Page | File | Migration Complexity |
|------|------|---------------------|
| Users | `features/users-page.tsx` | MEDIUM - Custom filter UI |
| Companies | `features/companies-page.tsx` | LOW |
| Outlets | `features/outlets-page.tsx` | MEDIUM |
| Roles | `features/roles-page.tsx` | LOW |
| Reservations | `features/reservations-page.tsx` | HIGH - Complex filters |
| Reservation Calendar | `features/reservation-calendar-page.tsx` | HIGH |
| Table Board | `features/table-board-page.tsx` | MEDIUM |
| Outlet Tables | `features/outlet-tables-page.tsx` | MEDIUM |
| Reports | `features/reports-pages.tsx` | MEDIUM |
| Module Roles | `features/module-roles-page.tsx` | LOW |

#### Migration Pattern

**Before:**
```tsx
import { FilterBar } from "../components/FilterBar";

function MyPage() {
  return (
    <FilterBar onSearch={...} onStatusChange={...} />
  );
}
```

**After:**
```tsx
import { FilterBar } from "../components/ui/FilterBar";
import { useFilters } from "../hooks";

function MyPage() {
  const { filters, setFilter, clearFilters, hasActiveFilters } = useFilters({
    schema: myFilterSchema,
    storageId: "my-page"
  });

  return (
    <FilterBar filters={filters} onFilterChange={setFilter}>
      <TextInput value={filters.search} onChange={...} />
    </FilterBar>
  );
}
```

---

### DataTable Component

**Status:** Legacy at `components/DataTable.tsx`, Epic 10 at `components/ui/DataTable/DataTable.tsx`  
**Pages Using Legacy:** 5  
**Pages Using Epic 10:** 4

#### Pages Using Legacy DataTable (Need Migration)

| Page | File | Migration Complexity |
|------|------|---------------------|
| Reservations | `features/reservations-page.tsx` | HIGH - Custom rendering |
| Outlet Tables | `features/outlet-tables-page.tsx` | MEDIUM |
| Reports | `features/reports-pages.tsx` | MEDIUM |
| Module Roles | `features/module-roles-page.tsx` | LOW |
| Audit Logs | `features/audit-logs-page.tsx` | MEDIUM |

#### Pages Already Using Epic 10 DataTable (GOOD)

| Page | File | Notes |
|------|------|-------|
| Users | `features/users-page.tsx` | ✅ |
| Companies | `features/companies-page.tsx` | ✅ |
| Outlets | `features/outlets-page.tsx` | ✅ |
| Roles | `features/roles-page.tsx` | ✅ |

#### Migration Pattern

**Before:**
```tsx
import { DataTable } from "../components/DataTable";

<DataTable columns={columns} data={data} />
```

**After:**
```tsx
import { DataTable } from "../components/ui/DataTable";
import { columnHelper } from "../utils/column-helper";

const columns = [
  columnHelper.accessor("name", { header: "Name" }),
];

<DataTable columns={columns} data={data} pagination={...} />
```

---

## Migration Effort Estimate

| Component | Pages to Migrate | Effort/Page | Total Effort |
|-----------|-----------------|-------------|--------------|
| PageHeader | 40+ | 1 hour | 40+ hours |
| FilterBar | 10 | 2-4 hours | 20-40 hours |
| DataTable | 5 | 2-3 hours | 10-15 hours |

**Total Estimated Effort:** 70-95 hours (significant)

---

## Recommendations

### Phase 1: Quick Wins (8 hours)

1. **Migrate high-traffic pages to use Epic 10 DataTable** (already 4 pages done, migrate 5 more)
   - Target: users, companies, outlets, roles, module-roles
   
2. **Add PageHeader to top 5 pages** without removing existing headers
   - Just wrap content in PageHeader

### Phase 2: Core Workflows (16-24 hours)

1. **Complete DataTable migration** for all 9 pages
2. **Complete FilterBar migration** for 10 pages
3. **Add PageHeader** to core workflow pages

### Phase 3: Settings & Admin (16-24 hours)

1. **Migrate all settings pages** to use PageHeader
2. **Standardize filter patterns** across all pages

### Phase 4: Complete Adoption (30-40 hours)

1. **Full audit and cleanup** of legacy components
2. **Delete legacy component files** once migration complete
3. **Update lint rules** to prevent regression

---

## Action Items from Audit

| ID | Action | Priority | Owner | Estimate |
|----|--------|----------|-------|----------|
| AUDIT-001 | Create PageHeader migration guide | HIGH | Dev Team | 2 hours |
| AUDIT-002 | Migrate top 5 pages to use PageHeader | HIGH | Dev Team | 5 hours |
| AUDIT-003 | Migrate remaining DataTable pages | MEDIUM | Dev Team | 15 hours |
| AUDIT-004 | Migrate FilterBar pages | MEDIUM | Dev Team | 30 hours |
| AUDIT-005 | Delete legacy components | LOW | Dev Team | 2 hours |
| AUDIT-006 | Update lint rules to enforce adoption | MEDIUM | Dev Team | 4 hours |

---

## Files to Review After Migration

### Legacy Components (To Be Deprecated)

```
apps/backoffice/src/components/
├── FilterBar.tsx              # Replace with ui/FilterBar/FilterBar.tsx
├── DataTable.tsx             # Replace with ui/DataTable/DataTable.tsx
```

### Epic 10 Components (Target)

```
apps/backoffice/src/components/ui/
├── PageHeader/
│   ├── PageHeader.tsx
│   └── PageHeader.test.ts
├── FilterBar/
│   ├── FilterBar.tsx
│   └── FilterBar.test.ts
└── DataTable/
    ├── DataTable.tsx
    └── DataTable.test.ts
```

---

## References

- [UI Standards](../ui-standards.md)
- [Patterns Guide](../patterns/README.md)
- [ADR-001: Backoffice UI Component Architecture](../adr/adr-001-backoffice-ui-component-architecture.md)
- Epic 10 Stories: 10-1, 10-2, 10-3, 10-4
