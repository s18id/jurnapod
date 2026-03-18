---
epic: 8
story: 8.8
title: Update Routing and Add Cross-Navigation
status: review
created: 2026-03-17
---

# Story 8.8: Update Routing and Add Cross-Navigation

**Epic:** 8 - Backoffice-Items-Split  
**Priority:** P0  
**Effort:** ~1 hour

---

## User Story

As a **developer**,  
I want to **update routes and add navigation between Items and Prices**,  
So that **users can move seamlessly between related features**.

---

## Acceptance Criteria

### AC 1: Items Route
**Given** the new pages exist  
**When** I navigate to `/items`  
**Then** the Items page renders (no 404)

### AC 2: Prices Route
**Given** I navigate to `/prices`  
**When** the route is accessed  
**Then** the Prices page renders

### AC 3: Old Route Redirect
**Given** the old `/items-prices` route  
**When** accessed  
**Then** it redirects to `/items` (temporary redirect, not permanent)

### AC 4: Items to Prices Navigation
**Given** I'm on the Items page  
**When** I look at the header/actions  
**Then** I see a "Manage Prices" button linking to `/prices`

### AC 5: Prices to Items Navigation
**Given** I'm on the Prices page  
**When** I look at the header/actions  
**Then** I see a "View Items" button linking to `/items`

### AC 6: Sidebar Navigation
**Given** navigation menu is updated  
**When** viewed in the sidebar  
**Then** "Items" and "Prices" appear as separate menu items (not "Items & Prices")

### AC 7: Sync Success Links
**Given** the backoffice sync module has navigation  
**When** sync completes for items or prices  
**Then** appropriate success message includes link to view the data

### AC 8: Deep Linking
**Given** deep linking is supported  
**When** I share `/prices?outlet=123`  
**Then** recipient sees prices filtered to that outlet

---

## Technical Notes

- Update `apps/backoffice/src/app/routes.ts`
- Update `apps/backoffice/src/app/router.tsx`
- Add query param support for outlet filtering
- Remove or redirect old `/items-prices` route
- Update sidebar navigation configuration

---

## Implementation Hints

1. Add `/items` and `/prices` routes to router configuration
2. Implement redirect from `/items-prices` to `/items`
3. Add cross-navigation buttons in page headers
4. Update sidebar menu items
5. Add outlet query param support
6. Update sync success messages with links

---

## Definition of Done

- [x] `/items` route functional
- [x] `/prices` route functional
- [x] `/items-prices` redirects to `/items`
- [x] Cross-navigation buttons working
- [x] Sidebar updated with separate menu items
- [x] Deep linking with query params works
- [x] Sync success messages include links
- [x] Unit tests passing
- [ ] Code reviewed and approved

---

## Dev Agent Record

### Implementation Plan

**Phase 1: Analyze Current State**
- Reviewed existing routes.ts - /items and /prices routes already configured
- Reviewed existing router.tsx - redirect from /items-prices to /items already implemented
- Verified cross-navigation buttons exist in both ItemsPage and PricesPage
- Confirmed sidebar navigation in layout.tsx shows separate Items and Prices menu items

**Phase 2: Implement Deep Linking (AC 8)**
- Added `getOutletIdFromUrl()` helper to parse outlet query param from hash URL
- Added `updateUrlWithOutlet()` helper to update URL when outlet changes
- Added `handleOutletChange()` callback that updates both state and URL
- Added `useEffect` to listen for hash changes and sync outlet selection
- Outlet selection is now bidirectionally bound to URL query param

**Phase 3: Implement Sync Success Links (AC 7)**
- Enhanced sync-notification.tsx to include navigation links
- Added "View Items" and "View Prices" links in sync success notification
- Links appear when sync completes with at least one successful sync
- Extended timeout to 8 seconds to allow time for link clicks

**Phase 4: Testing**
- Added 3 new test cases for deep linking functionality
- All 93 tests passing
- Verified query param parsing, outlet validation, and URL construction

### Completion Notes

**Story 8.8 Implementation Complete - 2026-03-17**

**AC 1: Items Route** - Already implemented in routes.ts and router.tsx
**AC 2: Prices Route** - Already implemented in routes.ts and router.tsx
**AC 3: Old Route Redirect** - Already implemented in router.tsx (lines 157-161)
**AC 4: Items to Prices Navigation** - Already implemented in items-page.tsx (lines 445-452)
**AC 5: Prices to Items Navigation** - Already implemented in prices-page.tsx (lines 463-470)
**AC 6: Sidebar Navigation** - Already implemented in layout.tsx (line 85)
**AC 7: Sync Success Links** - Implemented in sync-notification.tsx with Items/Prices navigation links
**AC 8: Deep Linking** - Implemented in prices-page.tsx with outlet query param support

**Files Modified:**
1. `apps/backoffice/src/features/prices-page.tsx` - Added deep linking functionality
2. `apps/backoffice/src/components/sync-notification.tsx` - Added sync success navigation links
3. `apps/backoffice/src/features/prices-page.test.ts` - Added deep linking tests

**Tests:** 93 tests passing (including 3 new deep linking tests)

**Testing Evidence:**
```
# Subtest: Prices Page - Deep Linking (AC 8)
    # Subtest: parses outlet ID from URL query params correctly
    ok 1 - parses outlet ID from URL query params correctly
    # Subtest: validates outlet ID belongs to user's outlets
    ok 2 - validates outlet ID belongs to user's outlets
    # Subtest: constructs shareable URL with outlet param
    ok 3 - constructs shareable URL with outlet param
1..3
ok 27 - Prices Page - Deep Linking (AC 8)
```

---

## File List

### Modified Files
- `apps/backoffice/src/features/prices-page.tsx`
- `apps/backoffice/src/components/sync-notification.tsx`
- `apps/backoffice/src/features/prices-page.test.ts`

### Existing Files (Verified/Already Implemented)
- `apps/backoffice/src/app/routes.ts` - Routes configuration
- `apps/backoffice/src/app/router.tsx` - Router with redirect logic
- `apps/backoffice/src/app/layout.tsx` - Sidebar navigation
- `apps/backoffice/src/features/items-page.tsx` - Cross-navigation button

---

## Change Log

| Date | Change | Author |
|------|--------|--------|
| 2026-03-17 | Implemented deep linking with outlet query param support | Dev Agent |
| 2026-03-17 | Added sync success navigation links to Items and Prices pages | Dev Agent |
| 2026-03-17 | Added 3 unit tests for deep linking functionality | Dev Agent |
| 2026-03-17 | Verified all acceptance criteria met, 93 tests passing | Dev Agent |
