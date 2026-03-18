---
epic: 8
story: 8.4
title: Create New /prices Page
priority: P0
status: Ready
estimate: 3-4 hours
dependencies: Stories 8.1, 8.2
---

# Story 8.4: Create New /prices Page

## User Story

As a **backoffice user**,  
I want to **access a dedicated Prices page**,  
So that **I can manage pricing with clear hierarchy visibility**.

## Acceptance Criteria

### Page Display

**Given** I navigate to `/prices`  
**When** the page loads  
**Then** I see a pricing view with outlet selector and "Company Defaults" section

**Given** I select an outlet from the dropdown  
**When** the view updates  
**Then** I see outlet-specific prices with visual indicators for overrides

### Pricing Hierarchy Display

**Given** the Prices page  
**When** I view an item's price  
**Then** I can see: Company Default Price → Outlet Override Price (if any)

**Given** an item with only company default  
**When** viewed in outlet mode  
**Then** it shows "Using Default" with the default price

**Given** color coding is used  
**Then** green = using default, blue = has override, red = significant difference

### Create/Edit Overrides

**Given** a company default price  
**When** I click "Set Override"  
**Then** a modal opens to create outlet-specific price

**Given** the override modal  
**When** I enter a price and save  
**Then** the override is created and displayed with visual distinction

**Given** an existing override  
**When** I click "Edit"  
**Then** I can modify the override price

**Given** an existing override  
**When** I click "Remove Override"  
**Then** the outlet reverts to company default price

### Import/Export

**Given** the Prices page has import functionality  
**When** I click "Import Prices"  
**Then** the ImportWizard modal opens

**Given** the Prices page has export functionality  
**When** I click "Export"  
**Then** prices are downloaded as CSV with scope indicators

## Technical Implementation

### Files to Create

1. **`apps/backoffice/src/features/prices-page.tsx`** - Main page component
2. **`apps/backoffice/src/features/prices-page.test.tsx`** - Integration tests

### Page Structure

```typescript
// apps/backoffice/src/features/prices-page.tsx
type PricingViewMode = 'defaults' | 'outlet';

export function PricesPage() {
  const { items, itemMap } = useItems();
  const { itemGroups, groupMap } = useItemGroups();
  const { outlets } = useOutlets(); // Existing hook
  
  const [viewMode, setViewMode] = useState<PricingViewMode>('outlet');
  const [selectedOutletId, setSelectedOutletId] = useState<number>(user.default_outlet_id);
  
  // Pricing data
  const { prices, companyDefaults, loading } = usePrices(selectedOutletId);
  
  // Derived data with hierarchy
  const pricesWithHierarchy = useMemo(() => {
    return items.map(item => {
      const defaultPrice = companyDefaults.find(p => p.item_id === item.id);
      const outletPrice = prices.find(p => p.item_id === item.id);
      
      return {
        item,
        defaultPrice,
        outletPrice,
        effectivePrice: outletPrice?.price ?? defaultPrice?.price,
        hasOverride: !!outletPrice,
      };
    });
  }, [items, prices, companyDefaults]);
  
  // ... rest of component
}
```

### Key UI Elements

1. **PageHeader** - Title "Prices" + Outlet selector + View mode toggle + Create Price button
2. **Hierarchy Display** - Visual indicators showing default vs override
3. **DataTable** - Prices with columns: Item, Group, Default Price, Override Price, Status
4. **CreatePriceModal** - For creating new prices
5. **OverrideModal** - For setting outlet-specific overrides
6. **ImportWizard** - For CSV import

### Visual Hierarchy Design

```tsx
// Example hierarchy display in table
<Table.Td>
  {row.hasOverride ? (
    <Stack gap={2}>
      <Text size="xs" c="dimmed" style={{ textDecoration: 'line-through' }}>
        Default: {formatPrice(row.defaultPrice?.price)}
      </Text>
      <Group gap={4}>
        <Badge color="blue" size="sm">Override</Badge>
        <Text fw={500}>{formatPrice(row.outletPrice?.price)}</Text>
      </Group>
    </Stack>
  ) : (
    <Group gap={4}>
      <Badge color="green" size="sm">Default</Badge>
      <Text>{formatPrice(row.defaultPrice?.price)}</Text>
    </Group>
  )}
</Table.Td>
```

### Table Columns

| Column | Content | Notes |
|--------|---------|-------|
| Item | item.name | From itemMap |
| Group | group.name | From groupMap |
| Default Price | companyDefault.price | Always shown |
| Outlet Price | override.price | If exists |
| Status | is_active | Badge |
| Actions | Edit, Remove Override | Conditional |

### Actions Logic

**Given** viewing in "Company Defaults" mode:
- Create new default price
- Edit existing default
- Delete default

**Given** viewing specific outlet:
- Set override (if no override exists)
- Edit override (if override exists)
- Remove override (revert to default)

## Files to Modify

1. **`apps/backoffice/src/app/routes.ts`** - Add `/prices` route
2. **`apps/backoffice/src/app/router.tsx`** - Add route handler
3. **`apps/backoffice/src/features/pages.tsx`** - Export prices-page

## Dependencies

- ✅ Story 8.1 (useItems hook)
- ✅ Story 8.2 (useItemGroups hook)
- ✅ Existing useOutlets hook
- ✅ API endpoints: GET, POST, PATCH, DELETE /api/inventory/item-prices
- ✅ Visual hierarchy design (Story 8.7)

## Definition of Done

- [ ] Page created at `apps/backoffice/src/features/prices-page.tsx`
- [ ] Route `/prices` accessible
- [ ] Company defaults view works
- [ ] Outlet-specific view works
- [ ] Visual hierarchy indicators present
- [ ] Create price modal works
- [ ] Set override modal works
- [ ] Edit override works
- [ ] Remove override works
- [ ] Export to CSV works
- [ ] Import button opens ImportWizard
- [ ] Outlet selector functional
- [ ] File size < 800 lines

## Size Target

**Target:** < 800 lines  
**Original:** Part of 2,195 lines  
**Improvement:** Clean separation of concerns

## Notes

- This is where **visual hierarchy** really matters
- Users must clearly understand: Default → Override relationship
- Color coding: Green (default), Blue (override), Red (big difference)
- Tooltips helpful for explaining hierarchy
- Cross-navigation to Items page added in Story 8.8
