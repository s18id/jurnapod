# UI/UX Improvement Plan: Item Groups Page

## Overview
Modernize `apps/backoffice/src/features/item-groups-page.tsx` using Mantine components while preserving all existing behavior (API calls, hierarchy logic, cache refresh, offline handling).

## Current Issues

| Issue | Impact |
|-------|--------|
| Inline styles (`boxStyle`, `inputStyle`, etc.) | Inconsistent with backoffice design system |
| Inline editing in table | Poor UX, cluttered interface |
| No form validation feedback | Users don't know what fields are required |
| Basic loading state | Just shows "Loading..." text |
| No delete confirmation | Accidental deletes possible |
| No search/filter | Hard to find groups in large lists |
| Native HTML controls | Not consistent with Mantine-based app |

## Patch Set

### Patch 1: Mantine Layout Migration
- Replace `section`/`div` with `Container` + `Stack` + `Card`
- Use `Title` + `Text` for headings/descriptions
- Remove inline style constants
- Add Mantine imports

**Mantine components to import:**
```typescript
Alert, Badge, Button, Card, Container, Group, 
Loader, ScrollArea, Select, SimpleGrid, Stack, 
Switch, Table, Text, TextInput, Title
```

### Patch 2: Create Form UX Upgrade
- Replace `<input>` with `TextInput`
- Replace `<select>` with `Select`
- Replace checkbox with `Switch`
- Add responsive layout with `SimpleGrid`
- Add inline validation (name required)
- Disable button while loading or invalid

### Patch 3: Table Modernization + Search
- Add `searchQuery` state
- Add filtered rows memo (case-insensitive filter on name, code, hierarchy path)
- Add search input above table
- Replace plain table with `ScrollArea` + `Table`
- Keep inline editing (for speed)
- Add `Badge` for active/inactive status
- Improve action buttons

### Patch 4: Safe Delete Confirmation
- Add `confirmDeleteGroup` state (ItemGroup | null)
- Add `deleting` state
- Add delete confirmation modal
- Only call API after user confirms
- Disable while deleting

### Patch 5: Loading/Error/Empty States
- Replace "Loading..." with `Loader`
- Replace error text with `Alert color="red"`
- Add empty state message
- Keep `OfflinePage` unchanged

### Patch 6: Consistency Pass (Optional)
- Use existing `PageCard` component where appropriate
- Align with backoffice visual conventions

## Acceptance Criteria

### Functional
- [ ] Create group works with/without parent
- [ ] Edit name/code/parent/active, then save
- [ ] Parent cannot select self or descendants (preserve existing logic)
- [ ] Delete requires confirmation modal
- [ ] Search filters by name/code/path
- [ ] Offline shows `OfflinePage`
- [ ] Cache refresh behavior unchanged
- [ ] API endpoints unchanged

### Visual
- [ ] No inline style constants remain
- [ ] Consistent with Mantine design system
- [ ] Responsive on mobile
- [ ] Clear loading/error/empty states

## Verification Commands

```bash
# Type check
cd apps/backoffice && pnpm typecheck

# Manual testing checklist
# 1. Create group (with/without parent)
# 2. Edit and save changes
# 3. Try invalid parent selection (should be blocked)
# 4. Delete with confirmation
# 5. Search functionality
# 6. Offline mode
```

## File Changes

**Target:** `apps/backoffice/src/features/item-groups-page.tsx`

**Kept unchanged:**
- All API calls (`apiRequest` patterns)
- Hierarchy logic (`collectDescendants`, `getGroupPath`, `getGroupDepth`, `getParentOptions`)
- Cache service calls
- Offline handling (`OfflinePage`, `StaleDataWarning`)
- All type definitions

**Modified:**
- Imports (add Mantine)
- State (add search, confirm modal)
- JSX (use Mantine components)
- Remove inline styles

## Implementation Order

1. Patch 1: Layout + Imports
2. Patch 2: Create Form
3. Patch 3: Table + Search
4. Patch 4: Delete Confirmation
5. Patch 5: States Cleanup
6. Patch 6: Consistency (optional)
