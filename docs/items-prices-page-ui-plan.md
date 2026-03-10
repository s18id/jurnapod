# Items + Prices Page UI/UX Improvement Plan

## Overview
Improve the user interface and user experience of `apps/backoffice/src/features/items-prices-page.tsx` using Mantine UI library components while preserving all business logic and API behavior.

## Objectives
- Modernize the UI with consistent Mantine design patterns
- Improve accessibility and responsive design
- Enhance data presentation clarity
- Maintain offline-first behavior and stale data warnings
- Preserve all existing business logic and API interactions

## Current Issues
1. Inconsistent styling with inline style objects
2. Native HTML form controls instead of Mantine components
3. Basic table layout without scroll areas
4. Poor visual hierarchy and spacing
5. Limited feedback for loading/error states
6. `window.prompt` for setting overrides (poor UX)

## Implementation Plan

### Phase 1: Page Structure and Navigation
**Goal:** Establish consistent page layout with Mantine components

#### Changes:
1. **Page Wrapper**
   - Use `Stack` component with `gap="md"` for consistent vertical spacing
   - Remove inline `boxStyle` objects

2. **Header Section**
   - Convert title to Mantine `Title` component
   - Replace `<details>` element with `Accordion` for Item Types Guide
   - Use `Card` with shadow and padding for section containers

3. **Control Bar**
   - Replace native `<select>` with Mantine `Select` component
   - Convert radio buttons to `SegmentedControl` for Pricing View mode
   - Group outlet selector and pricing mode in `Group` with `justify="space-between"`
   - Add responsive layout with `SimpleGrid cols={{ base: 1, md: 2 }}`

#### Components to Use:
- `Stack`, `Card`, `Title`, `Text`
- `Select`, `SegmentedControl`
- `Group`, `SimpleGrid`
- `Accordion` (for Item Types Guide)

---

### Phase 2: Create Item Form
**Goal:** Modernize item creation form with proper inputs and feedback

#### Changes:
1. **Form Layout**
   - Use `SimpleGrid` with responsive columns (1 on mobile, 2-3 on desktop)
   - Group related fields with `Fieldset` or `Stack`

2. **Input Controls**
   - Replace native `<input>` with Mantine `TextInput` (SKU, Name)
   - Replace native `<select>` with Mantine `Select` (Type, Group)
   - Use `Checkbox` for Active toggle
   - Add `description` prop to inputs for helper text

3. **Type Selection UX**
   - Show type description below select using `Text` with `c="dimmed"`
   - Display type-specific warnings using `Alert` component

4. **Action Button**
   - Use Mantine `Button` with `variant="filled"` or `variant="light"`
   - Add loading state with `loading` prop

#### Components to Use:
- `TextInput`, `Select`, `Checkbox`, `Button`
- `SimpleGrid`, `Stack`, `Fieldset`
- `Text`, `Alert`

---

### Phase 3: Items Table
**Goal:** Modernize items display with Mantine Table and DataTable component

#### Changes:
1. **Table Container**
   - Wrap in `Card` with proper padding
   - Use `ScrollArea` for horizontal overflow
   - Add `Table` with `striped` or `highlightOnHover` props

2. **Table Headers**
   - Use `Table.Thead` and `Table.Th`
   - Add sort indicators if implementing sorting

3. **Editable Rows**
   - Replace inline inputs with compact Mantine inputs (`size="sm"`)
   - Group Save/Delete actions in `Group` with `gap="xs"`
   - Use `ActionIcon` for delete (with confirmation)

4. **Empty State**
   - Show `Text` with `c="dimmed"` when no items
   - Center align with proper spacing

5. **Alternative: DataTable Component**
   - Consider using existing `DataTable` component from `components/DataTable.tsx`
   - Define columns with proper `cell` renderers for editable fields

#### Components to Use:
- `Table`, `Table.Thead`, `Table.Tbody`, `Table.Tr`, `Table.Th`, `Table.Td`
- `ScrollArea`
- `TextInput`, `Select`, `Checkbox`
- `Button`, `ActionIcon`, `Group`
- Or: `DataTable` from components

---

### Phase 4: Create Price Form
**Goal:** Improve price creation UX with proper validation and feedback

#### Changes:
1. **Form Layout**
   - Use `SimpleGrid` for responsive layout
   - Group item selector and price input

2. **Input Controls**
   - Replace native `<select>` with `Select` (Item)
   - Use `NumberInput` for Price (with min={0} and proper formatting)
   - Use `Checkbox` for Company Default and Active toggles
   - Show conditional fields based on pricing view mode

3. **Validation & Feedback**
   - Add inline validation with `error` prop
   - Show item type warnings using `Alert` component
   - Disable submit if form is invalid

#### Components to Use:
- `Select`, `NumberInput`, `Checkbox`, `Button`
- `SimpleGrid`, `Group`
- `Alert`, `Text`

---

### Phase 5: Prices Tables
**Goal:** Differentiate company defaults vs outlet overrides clearly

#### Changes:
1. **Table Layout**
   - Use consistent `Table` structure with `ScrollArea`
   - Add section `Card` with descriptive title using `Title` and `Text`

2. **Scope Visualization**
   - Use `Badge` component for "Override" vs "Default" indicators
   - Color coding: green for override, gray for default

3. **Editable State Handling**
   - Default prices: show read-only with muted text (`c="dimmed"`, `fs="italic"`)
   - Override prices: editable inputs with `size="sm"`

4. **Override Creation**
   - **CRITICAL:** Replace `window.prompt` with Mantine `Modal`
   - Modal contains `NumberInput` for price
   - Add confirm/cancel buttons in modal footer
   - Pre-fill with default price value

5. **Action Buttons**
   - Group actions with `Group` and `gap="xs"`
   - Use consistent button variants
   - Add delete confirmation modal

#### Components to Use:
- `Table`, `ScrollArea`, `Card`, `Title`, `Text`
- `Badge` (for scope indicators)
- `Select`, `NumberInput`, `Checkbox`
- `Button`, `Group`
- `Modal` (for override creation and delete confirmation)

---

### Phase 6: Status and Feedback
**Goal:** Improve loading, error, and stale data presentation

#### Changes:
1. **Loading State**
   - Use `Loader` or `Skeleton` components instead of "Loading data..." text
   - Show skeletons for table rows while loading

2. **Error State**
   - Use `Alert` with `color="red"` for errors
   - Add `icon` prop with error icon

3. **Stale Data Warnings**
   - Convert `StaleDataWarning` to use Mantine `Alert` with `color="yellow"`
   - Group all warnings in a single `Card` or `Stack`

4. **Offline State**
   - Keep existing `OfflinePage` component
   - Ensure it uses Mantine components (already does)

5. **Quick Checks Section**
   - Convert to `Card` with `bg="gray.0"` or similar
   - Use `Text` with proper formatting
   - Add `Divider` for visual separation

#### Components to Use:
- `Loader`, `Skeleton`
- `Alert`
- `Card`, `Text`, `Divider`

---

## Component Migration Summary

| Current | Mantine Replacement |
|---------|---------------------|
| `<div>` with inline styles | `Stack`, `Card`, `Group`, `SimpleGrid` |
| Native `<input>` | `TextInput`, `NumberInput` |
| Native `<select>` | `Select` |
| Native `<table>` | `Table` (Mantine) or `DataTable` |
| Native `<button>` | `Button` |
| Native `<checkbox>` | `Checkbox` |
| Native radio buttons | `SegmentedControl` or `Radio.Group` |
| `<details>`/`<summary>` | `Accordion` |
| `window.prompt()` | `Modal` |
| Loading text | `Loader` or `Skeleton` |
| Error text | `Alert` |
| Inline style objects | Mantine props (`p`, `m`, `bg`, `c`, etc.) |

---

## Responsive Breakpoints

Use Mantine's responsive props for layout adjustments:

```tsx
// Example responsive grid
<SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="md">
  {/* Form fields */}
</SimpleGrid>

// Example responsive group
<Group justify="space-between" wrap={{ base: 'wrap', md: 'nowrap' }}>
  {/* Controls */}
</Group>
```

---

## Accessibility Considerations

1. Use proper `label` associations with all inputs
2. Ensure keyboard navigation works through all interactive elements
3. Add `aria-label` to icon-only buttons
4. Use semantic HTML structure within Mantine components
5. Ensure color contrast meets WCAG standards (Mantine defaults are good)

---

## State Management (Preserve Existing)

**No changes to:**
- Data fetching logic (`refreshData`)
- API calls (`createItem`, `saveItem`, `deleteItem`, etc.)
- State hooks (`useState`, `useEffect`, `useMemo`)
- Offline detection (`useOnlineStatus`)
- Cache handling (`CacheService`)

**Only presentation layer changes.**

---

## Testing Checklist

- [ ] Page loads without console errors
- [ ] All CRUD operations work correctly
- [ ] Offline mode displays correctly
- [ ] Stale data warnings appear properly
- [ ] Outlet selection changes data correctly
- [ ] Pricing view mode switches correctly
- [ ] Item creation works with all types
- [ ] Price creation works for both defaults and overrides
- [ ] Override creation modal works (replaces prompt)
- [ ] Delete confirmations work
- [ ] Responsive layout works on mobile/desktop
- [ ] Loading states display correctly
- [ ] Error states display correctly

---

## Implementation Order

1. **Phase 1:** Page structure and control bar
2. **Phase 2:** Create item form
3. **Phase 3:** Items table
4. **Phase 4:** Create price form
5. **Phase 5:** Prices tables (with modal)
6. **Phase 6:** Status and feedback improvements

Each phase should be testable independently before moving to the next.

---

## Files to Modify

- `apps/backoffice/src/features/items-prices-page.tsx` (main file)
- `apps/backoffice/src/components/stale-data-warning.tsx` (optional, for consistency)

## Dependencies

Ensure these are available (already in project):
- `@mantine/core`
- `@mantine/hooks` (for useDisclosure, etc.)
- `@tabler/icons-react` (for icons in Alert, Button, etc.)

---

## Notes

- Keep business logic exactly as-is
- Preserve all API call signatures
- Maintain offline-first behavior
- Don't change data structures or types
- Focus purely on presentation layer
- Follow existing patterns in other pages (e.g., `sync-queue-page.tsx`)
