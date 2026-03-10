# Item Availability per Outlet - Implementation Plan

## Overview
Allow items to be marked as unavailable in specific outlets while remaining available in others. This is achieved by treating an inactive outlet price override as "hidden" rather than falling back to the company default.

## Problem Statement
- Currently, an inactive outlet override falls back to the company default price in the effective price calculation.
- This means an item cannot be hidden from a specific outlet's POS catalog.
- Need: When an outlet override exists (even if inactive), it should take precedence and hide the item for that outlet.

## Solution Approach
1. **API**: Fix effective price precedence so inactive override wins over default.
2. **UI**: Add "Mark Unavailable" action in backoffice to create/update outlet overrides as inactive.
3. **Tests**: Automate verification of precedence behavior.

---

## Scope 1: API Effective Price Resolution (Core)

### File: `apps/api/src/lib/master-data.ts`
### Function: `listEffectiveItemPricesForOutlet` (around line 1301)

**Current Behavior:**
- Uses `CASE WHEN override.is_active = 1 THEN override ELSE default` - falls back to default when override is inactive.

**New Behavior:**
- Strict precedence: override always wins if it exists, regardless of active state.
- Filter `isActive: true` now excludes items with inactive override.

### Changes Required:

```typescript
// In listEffectiveItemPricesForOutlet, change COALESCE logic:
// FROM: COALESCE(CASE WHEN override.is_active = 1 THEN override.id END, def.id)
// TO:   COALESCE(override.id, def.id)

// And for is_active filter:
// FROM: COALESCE(CASE WHEN override.is_active = 1 THEN override.is_active END, def.is_active)
// TO:   COALESCE(override.is_active, def.is_active)
```

---

## Scope 2: Backoffice UI Actions

### File: `apps/backoffice/src/features/items-prices-page.tsx`

### Changes Required:

1. **Extend `createOutletOverride` signature:**
   - Add `isActive` parameter (default `true`)
   - Use in POST body

2. **Add `setOutletAvailabilityFromDefault` helper:**
   - Check if override already exists for item in current outlet
   - PATCH if exists, CREATE if not
   - Handle both unavailable (false) and available (true) states

3. **Add "Mark Unavailable" button:**
   - On default rows in outlet pricing table
   - Creates inactive override

4. **Add "Make Available" button:**
   - On inactive override rows
   - Reactivates the override

5. **Update status badges:**
   - Override active: green "Override"
   - Override inactive: red "Unavailable"
   - Default: gray "Default"

---

## Scope 3: Automated Tests

### File: `apps/api/src/lib/master-data.item-prices.test.ts`

### Test Cases:

1. **Inactive override hides item from active prices**
   - Default active + override inactive → active filter excludes item

2. **Active override wins over default**
   - Override active with different price → override returned

3. **Default fallback when no override**
   - Only default → default returned

4. **Inactive override visible without filter**
   - Inactive override → included when `isActive` not specified

---

## Acceptance Criteria

- [x] API returns no active effective price when outlet override is inactive
- [x] Sync pull excludes items with inactive overrides from POS catalog
- [x] Backoffice shows "Mark Unavailable" action on default rows
- [x] Backoffice shows "Make Available" action on inactive override rows
- [x] Status badges correctly reflect: Override, Unavailable, Default
- [x] All required API precedence scenarios are covered and passing (3 tests including unfiltered inactive assertion)

---

## Commands

```bash
# Run API tests (uses node directly to avoid script lookup)
cd apps/api && node --test --test-concurrency=1 --import tsx src/lib/master-data.item-prices.test.ts

# Run all API unit tests
npm run -w apps/api test:unit

# Typecheck
npm run -w apps/api typecheck
npm run -w apps/backoffice typecheck

# Build
npm run -w apps/backoffice build
```

---

## Non-Goals (Out of Scope)

- No database schema changes
- No shared contract changes (existing `is_active` field sufficient)
- No accounting flow changes
