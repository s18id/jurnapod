---
epic: 8
story: 8.7
title: Add Visual Pricing Hierarchy Indicators
priority: P0
status: Ready
estimate: 2 hours
dependencies: Story 8.4
---

# Story 8.7: Add Visual Pricing Hierarchy Indicators

## User Story

As a **backoffice user**,  
I want to **see clear visual indicators of pricing hierarchy**,  
So that **I understand which prices are defaults vs overrides**.

## Acceptance Criteria

### Visual Indicators

**Given** I'm viewing the Prices page  
**When** I look at an item with only company default  
**Then** I see a visual indicator (e.g., "Default" badge) and the default price

**Given** an item has an outlet override  
**When** I view it in outlet mode  
**Then** I see: Default price (strikethrough or gray) → Override price (highlighted)

**Given** an item with override  
**When** I hover over the price  
**Then** a tooltip shows: "Default: $X.XX, Override: $Y.YY"

**Given** the pricing hierarchy  
**When** displayed visually  
**Then** it's clear that Outlet Price overrides Company Default

### Color Coding

**Given** color coding is used  
**Then** green = using default, blue = has override, red = override differs significantly (>20%)

**Given** an item using default price  
**When** displayed  
**Then** it has green "Default" badge

**Given** an item with outlet override  
**When** displayed  
**Then** it has blue "Override" badge

**Given** an override with >20% price difference  
**When** displayed  
**Then** it shows warning indicator (yellow/orange)

### View Context

**Given** I'm in "Company Defaults" view  
**When** I view the prices  
**Then** all items show default prices with "Default" badges

**Given** I'm in "Outlet" view  
**When** an item uses the default price (no override)  
**Then** it shows "Using Default" with the default price value

**Given** I'm in "Outlet" view  
**When** an item has an override  
**Then** both prices are visible: default (muted) and override (highlighted)

## Technical Implementation

### Files to Modify

1. **`apps/backoffice/src/features/prices-page.tsx`** - Add hierarchy display

### Component: PriceHierarchyDisplay

```tsx
// Price display with hierarchy
interface PriceHierarchyProps {
  defaultPrice: number | null;
  overridePrice: number | null;
  currency?: string;
}

function PriceHierarchyDisplay({ 
  defaultPrice, 
  overridePrice, 
  currency = 'IDR' 
}: PriceHierarchyProps) {
  const hasOverride = overridePrice !== null;
  const effectivePrice = overridePrice ?? defaultPrice;
  
  // Calculate difference percentage
  const differencePercent = hasOverride && defaultPrice
    ? Math.abs(((overridePrice - defaultPrice) / defaultPrice) * 100)
    : 0;
  
  const isSignificantDifference = differencePercent > 20;
  
  if (!hasOverride) {
    // Using default price
    return (
      <Tooltip label={`Default: ${formatPrice(defaultPrice, currency)}`}>
        <Group gap={4}>
          <Badge color="green" size="sm">Default</Badge>
          <Text>{formatPrice(defaultPrice, currency)}</Text>
        </Group>
      </Tooltip>
    );
  }
  
  // Has override
  return (
    <Tooltip 
      label={
        <Stack gap={2}>
          <Text size="xs">Default: {formatPrice(defaultPrice, currency)}</Text>
          <Text size="xs">Override: {formatPrice(overridePrice, currency)}</Text>
          {isSignificantDifference && (
            <Text size="xs" c="orange">
              ⚠️ {differencePercent.toFixed(0)}% difference
            </Text>
          )}
        </Stack>
      }
    >
      <Stack gap={2}>
        <Text size="xs" c="dimmed" style={{ textDecoration: 'line-through' }}>
          {formatPrice(defaultPrice, currency)}
        </Text>
        <Group gap={4}>
          <Badge color="blue" size="sm">Override</Badge>
          <Text fw={500}>
            {formatPrice(overridePrice, currency)}
          </Text>
          {isSignificantDifference && (
            <ThemeIcon color="orange" size="sm" variant="light">
              <IconAlertCircle size={14} />
            </ThemeIcon>
          )}
        </Group>
      </Stack>
    </Tooltip>
  );
}

// Utility function
function formatPrice(price: number | null, currency: string): string {
  if (price === null) return '-';
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
  }).format(price);
}
```

### Table Integration

```tsx
// In prices table
<Table.Tr key={price.id}>
  <Table.Td>{item.name}</Table.Td>
  <Table.Td>{group?.name}</Table.Td>
  <Table.Td>
    <PriceHierarchyDisplay 
      defaultPrice={price.defaultPrice}
      overridePrice={price.outletPrice}
    />
  </Table.Td>
  <Table.Td>
    <Badge color={price.is_active ? 'green' : 'red'}>
      {price.is_active ? 'Active' : 'Inactive'}
    </Badge>
  </Table.Td>
  <Table.Td>
    {/* Actions */}
  </Table.Td>
</Table.Tr>
```

### Header Explanation

Add a small info section at the top of Prices page:

```tsx
<Alert icon={<IconInfoCircle size={16} />} color="blue" variant="light">
  <Text size="sm">
    <strong>Pricing Hierarchy:</strong> Company Default prices apply to all outlets. 
    Outlet-specific overrides take precedence. Prices shown in blue indicate active overrides.
  </Text>
</Alert>
```

## Files to Modify

1. **`apps/backoffice/src/features/prices-page.tsx`** - Add PriceHierarchyDisplay component

## Dependencies

- ✅ Story 8.4 (Prices page must exist)
- ✅ Mantine Badge, Tooltip, ThemeIcon, Alert components
- ✅ Existing price data structure

## Definition of Done

- [ ] Default prices show green "Default" badge
- [ ] Override prices show blue "Override" badge
- [ ] Default price shown with strikethrough when override exists
- [ ] Tooltips show both prices on hover
- [ ] Significant differences (>20%) show warning indicator
- [ ] Color coding is consistent throughout
- [ ] Header explains pricing hierarchy
- [ ] Visual design is clear and intuitive

## Design Guidelines

### Color Usage
- **Green**: Safe, using default
- **Blue**: Information, has override
- **Orange/Yellow**: Warning, significant difference
- **Gray/Muted**: Secondary info (default price when overridden)

### Typography
- Default price (when overridden): `size="xs"`, `c="dimmed"`, `textDecoration: 'line-through'`
- Override price: `fw={500}` (medium weight)
- Effective price: Always visible and prominent

### Icons
- Use Mantine icons: `IconCheck`, `IconEdit`, `IconAlertCircle`
- Keep icons small (14-16px) within table context

## Benefits

1. **Clarity** - Users immediately understand the hierarchy
2. **Prevents errors** - Clear visual distinction prevents confusion
3. **Highlights issues** - Significant differences are flagged
4. **Educational** - Users learn the pricing model visually

## Notes

- This is a **differentiator** from the old combined page
- The visual hierarchy should be the primary UX improvement
- Test with actual users to ensure clarity
- Consider adding a legend or help tooltip explaining colors
