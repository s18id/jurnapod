---
epic: 8
story: 8.3
title: Create New /items Page
priority: P0
status: Ready
estimate: 3-4 hours
dependencies: Stories 8.1, 8.2
---

# Story 8.3: Create New /items Page

## User Story

As a **backoffice user**,  
I want to **access a dedicated Items page**,  
So that **I can manage the product catalog without pricing distractions**.

## Acceptance Criteria

### Page Display

**Given** I navigate to `/items`  
**When** the page loads  
**Then** I see a list of all items with columns: ID, SKU, Name, Group, Type, Status

**Given** the Items page  
**When** data is loading  
**Then** I see loading skeletons or spinner

**Given** the Items page  
**When** no items exist  
**Then** I see "No items found" message with create button

### Search and Filters

**Given** the Items page  
**When** I use the search box  
**Then** items are filtered by name or SKU in real-time

**Given** the Items page  
**When** I use filters (Type, Group, Status)  
**Then** the table updates to show only matching items

**Given** multiple filters applied  
**When** I click "Clear All"  
**Then** all filters reset and full list shows

### Create Item

**Given** the Items page  
**When** I click "Create Item"  
**Then** a modal opens with form fields: SKU, Name, Type, Group, Active

**Given** the create item form  
**When** I fill in valid data and click "Create"  
**Then** the item is created and appears in the list

**Given** invalid form data  
**When** I try to submit  
**Then** validation errors appear near relevant fields

### Edit Item

**Given** an existing item in the list  
**When** I click "Edit"  
**Then** an edit modal opens pre-filled with item data

**Given** the edit modal is open  
**When** I modify fields and click "Save"  
**Then** changes are saved and list refreshes

**Given** I click "Cancel" in edit modal  
**When** cancel is clicked  
**Then** modal closes without saving changes

### Delete Item

**Given** an item in the list  
**When** I click "Delete"  
**Then** a confirmation modal appears before deletion

**Given** delete confirmation modal  
**When** I confirm deletion  
**Then** item is deleted and removed from list

### Import/Export

**Given** the Items page has import functionality  
**When** I click "Import Items"  
**Then** the ImportWizard modal opens

**Given** the Items page has export functionality  
**When** I click "Export"  
**Then** items are downloaded as CSV

## Technical Implementation

### Files to Create

1. **`apps/backoffice/src/features/items-page.tsx`** - Main page component
2. **`apps/backoffice/src/features/items-page.test.tsx`** - Integration tests

### Files to Reference (for extraction)

- `apps/backoffice/src/features/items-prices-page.tsx` (lines ~916-1222 for items section)
- Extract: Items table, filters, create/edit modals, import modal

### Page Structure

```typescript
// apps/backoffice/src/features/items-page.tsx
import { useItems } from '../hooks/use-items';
import { useItemGroups } from '../hooks/use-item-groups';
import { ImportWizard } from '../components/import-wizard';

export function ItemsPage() {
  // Use extracted hooks
  const { items, loading, error, refresh, itemMap } = useItems();
  const { itemGroups, groupMap } = useItemGroups();
  
  // Local state for filters
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [groupFilter, setGroupFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<boolean | null>(null);
  
  // Modal states
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [importModalOpen, setImportModalOpen] = useState(false);
  
  // Filtered items
  const filteredItems = useMemo(() => {
    return items.filter(item => {
      if (searchTerm && !item.name.toLowerCase().includes(searchTerm.toLowerCase()) && 
          !item.sku.toLowerCase().includes(searchTerm.toLowerCase())) {
        return false;
      }
      if (typeFilter && item.type !== typeFilter) return false;
      if (groupFilter && String(item.item_group_id) !== groupFilter) return false;
      if (statusFilter !== null && item.is_active !== statusFilter) return false;
      return true;
    });
  }, [items, searchTerm, typeFilter, groupFilter, statusFilter]);
  
  // ... rest of component
}
```

### Component Breakdown

1. **PageHeader** - Title "Items" + Create Item button + Export button
2. **FilterBar** - Search, Type select, Group select, Status select, Clear All
3. **DataTable** - Items table with actions (Edit, Delete)
4. **CreateItemModal** - Form for creating new items
5. **EditItemModal** - Form for editing existing items (no inline editing)
6. **DeleteConfirmationModal** - Confirm before delete
7. **ImportWizard** - For CSV import (reuse component from Story 8.5)

### Table Columns

| Column | Field | Actions |
|--------|-------|---------|
| ID | item.id | - |
| SKU | item.sku | - |
| Name | item.name | - |
| Group | groupMap.get(item.item_group_id)?.name | - |
| Type | item.type | Badge |
| Status | item.is_active | Badge (Active/Inactive) |
| Actions | - | Edit, Delete dropdown |

### Key Features

1. **No Inline Editing** - All edits via modals (explicit save/cancel)
2. **Real-time Search** - Filter as you type
3. **Clear Filters** - One-click reset
4. **Loading States** - Skeletons while fetching
5. **Error Handling** - Display errors with retry option

## Files to Modify

1. **`apps/backoffice/src/app/routes.ts`** - Add `/items` route
2. **`apps/backoffice/src/app/router.tsx`** - Add route handler
3. **`apps/backoffice/src/features/pages.tsx`** - Export items-page

## Dependencies

- ✅ Story 8.1 (useItems hook)
- ✅ Story 8.2 (useItemGroups hook)
- ✅ Existing DataTable component
- ✅ Existing Modal components (Mantine)
- ✅ API endpoints: GET, POST, PATCH, DELETE /api/inventory/items

## Definition of Done

- [ ] Page created at `apps/backoffice/src/features/items-page.tsx`
- [ ] Route `/items` accessible and working
- [ ] All items displayed in table
- [ ] Search filters by name/SKU
- [ ] Filter by Type, Group, Status
- [ ] Create Item modal works
- [ ] Edit Item modal works (no inline editing)
- [ ] Delete with confirmation works
- [ ] Export to CSV works
- [ ] Import button opens ImportWizard
- [ ] File size < 600 lines (vs original 2,195)
- [ ] Tests passing

## Size Target

**Target:** < 600 lines  
**Original:** 2,195 lines in combined page  
**Improvement:** ~73% reduction in complexity

## Notes

- This is the **main deliverable** of Epic 8
- Focus on clean separation from pricing logic
- Remove ALL inline editing patterns
- Use extracted hooks for data
- Cross-navigation to Prices page will be added in Story 8.8
