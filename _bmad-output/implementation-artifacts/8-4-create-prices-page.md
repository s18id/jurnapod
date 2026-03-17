---
epic: 8
story: 8.4
title: Create New /prices Page
status: review
created: 2026-03-17
---

# Story 8.4: Create New /prices Page

**Epic:** 8 - Backoffice-Items-Split  
**Priority:** P0  
**Effort:** ~2.5 hours

---

## User Story

As a **backoffice user**,  
I want to **access a dedicated Prices page**,  
So that **I can manage pricing with clear hierarchy visibility**.

---

## Acceptance Criteria

### AC 1: Page Navigation
**Given** I navigate to `/prices`  
**When** the page loads  
**Then** I see a pricing view with outlet selector and "Company Defaults" section

### AC 2: Outlet Selection
**Given** I select an outlet from the dropdown  
**When** the view updates  
**Then** I see outlet-specific prices with visual indicators for overrides

### AC 3: Pricing Hierarchy Display
**Given** the Prices page  
**When** I view an item's price  
**Then** I can see: Company Default Price → Outlet Override Price (if any)

### AC 4: Create Override
**Given** a company default price  
**When** I click "Set Override"  
**Then** a modal opens to create outlet-specific price

### AC 5: Save Override
**Given** the override modal  
**When** I enter a price and save  
**Then** the override is created and displayed with visual distinction

### AC 6: Edit Override
**Given** an existing override  
**When** I click "Edit"  
**Then** I can modify the override price

### AC 7: Remove Override
**Given** an existing override  
**When** I click "Remove Override"  
**Then** the outlet reverts to company default price

### AC 8: Import Integration
**Given** the Prices page has import functionality  
**When** I click "Import Prices"  
**Then** the ImportWizard modal opens with price-specific configuration

### AC 9: Export Functionality
**Given** the Prices page has export functionality  
**When** I click "Export"  
**Then** prices are downloaded as CSV with scope indicators

---

## Technical Notes

- **Location:** `apps/backoffice/src/features/prices-page.tsx`
- Visual hierarchy is key differentiator from old combined page
- **File size target:** < 800 lines
- Use visual indicators from Story 8.7
- Handle both company defaults and outlet overrides

---

## Implementation Hints

1. Start with outlet selector and company defaults view
2. Implement override creation/editing modals
3. Add visual hierarchy indicators (Story 8.7)
4. Integrate ImportWizard for prices
5. Implement CSV export with scope indicators
6. Ensure clear visual distinction between defaults and overrides

---

## Dev Agent Record

### Implementation Plan

**Architecture:**
- Refactored monolithic 1,119-line prices-page.tsx into modular structure
- Extracted 5 modal components into separate files
- Created reusable PricesTable and PricesMobileCard components
- Integrated ImportWizard from Story 8.5

**Key Technical Decisions:**
1. Used useItems and useItemGroups hooks from Stories 8.1/8.2 for data fetching
2. Implemented visual hierarchy with color-coded badges (green=default, blue=override)
3. Added warning indicator for significant price differences (>20%)
4. Created modular modal system for better maintainability
5. Used existing export utilities with scope indicators

**File Structure:**
```
apps/backoffice/src/features/
├── prices-page.tsx (671 lines - under 800 target)
└── prices-page/
    ├── create-price-modal.tsx
    ├── edit-price-modal.tsx
    ├── override-price-modal.tsx
    ├── delete-price-modal.tsx
    ├── prices-mobile-card.tsx
    ├── prices-table.tsx
    └── index.ts (barrel exports)
```

### Completion Notes

**Implementation Complete - Story 8.4**

All Acceptance Criteria satisfied:

✅ **AC 1: Page Navigation** - `/prices` route renders with outlet selector and Company Defaults section
✅ **AC 2: Outlet Selection** - Outlet dropdown updates view with visual indicators for overrides
✅ **AC 3: Pricing Hierarchy Display** - Shows Company Default → Override with strikethrough styling
✅ **AC 4: Create Override** - "Set Override" button opens modal to create outlet-specific price
✅ **AC 5: Save Override** - Override created and displayed with blue badge distinction
✅ **AC 6: Edit Override** - Edit modal allows modification of override prices
✅ **AC 7: Remove Override** - Delete action removes override, outlet reverts to default
✅ **AC 8: Import Integration** - ImportWizard integrated with price-specific CSV configuration
✅ **AC 9: Export Functionality** - CSV export with scope indicators (default/outlet)

**Integration Verified:**
- useItems hook (Story 8.1) - Returns { items, loading, error, refresh, itemMap }
- useItemGroups hook (Story 8.2) - Returns { itemGroups, loading, error, groupMap }
- ImportWizard component (Story 8.5) - 3-step wizard with Source/Preview/Apply

**Test Results:**
```
# tests 73
# suites 22
# pass 73
# fail 0
```

**Files Created/Modified:**
- Modified: `apps/backoffice/src/features/prices-page.tsx` (refactored from 1119 to 671 lines)
- Created: `apps/backoffice/src/features/prices-page/create-price-modal.tsx`
- Created: `apps/backoffice/src/features/prices-page/edit-price-modal.tsx`
- Created: `apps/backoffice/src/features/prices-page/override-price-modal.tsx`
- Created: `apps/backoffice/src/features/prices-page/delete-price-modal.tsx`
- Created: `apps/backoffice/src/features/prices-page/prices-mobile-card.tsx`
- Created: `apps/backoffice/src/features/prices-page/prices-table.tsx`
- Created: `apps/backoffice/src/features/prices-page/index.ts`
- Created: `apps/backoffice/src/features/prices-page.test.ts`
- Modified: `apps/backoffice/src/tests/all.test.ts` (added prices-page.test import)

**Change Log:**
- 2026-03-17: Story moved from backlog → in-progress
- 2026-03-17: Refactored prices-page.tsx into modular components
- 2026-03-17: Added ImportWizard integration
- 2026-03-17: Implemented export functionality with scope indicators
- 2026-03-17: Created 28 unit tests for prices page
- 2026-03-17: All 73 tests passing
- 2026-03-17: Story marked complete, ready for review

---

## File List

- Modified: `apps/backoffice/src/features/prices-page.tsx` (refactored: 1119 → 671 lines)
- Created: `apps/backoffice/src/features/prices-page/create-price-modal.tsx` (107 lines)
- Created: `apps/backoffice/src/features/prices-page/edit-price-modal.tsx` (83 lines)
- Created: `apps/backoffice/src/features/prices-page/override-price-modal.tsx` (83 lines)
- Created: `apps/backoffice/src/features/prices-page/delete-price-modal.tsx` (68 lines)
- Created: `apps/backoffice/src/features/prices-page/prices-mobile-card.tsx` (141 lines)
- Created: `apps/backoffice/src/features/prices-page/prices-table.tsx` (149 lines)
- Created: `apps/backoffice/src/features/prices-page/index.ts` (10 lines)
- Created: `apps/backoffice/src/features/prices-page.test.ts` (287 lines, 28 tests)
- Modified: `apps/backoffice/src/tests/all.test.ts` (added prices-page.test import)
- Modified: `_bmad-output/implementation-artifacts/sprint-status.yaml` (status: in-progress → review)

---

## Change Log

- 2026-03-17: Story moved from backlog → in-progress
- 2026-03-17: Refactored prices-page.tsx into modular components
- 2026-03-17: Added ImportWizard integration from Story 8.5
- 2026-03-17: Implemented CSV export with scope indicators
- 2026-03-17: Created 28 unit tests for prices page logic
- 2026-03-17: All 73 tests passing (45 existing + 28 new)
- 2026-03-17: File size optimized: 1119 → 671 lines (under 800 target)
- 2026-03-17: Story marked complete, status: review

---

## Definition of Done

- [x] Page renders at `/prices` route
- [x] Outlet selector functional
- [x] Company defaults view working
- [x] Override create/edit/remove functional
- [x] Visual hierarchy clear and intuitive
- [x] Import/Export integrated
- [x] File size under 800 lines
- [x] Unit tests passing
- [ ] Code reviewed and approved
