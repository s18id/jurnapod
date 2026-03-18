---
epic: 8
story: 8.1
title: Extract useItems Hook with Caching
status: review
created: 2026-03-17
---

# Story 8.1: Extract useItems Hook with Caching

**Epic:** 8 - Backoffice-Items-Split  
**Priority:** P0  
**Effort:** ~1.5 hours

---

## User Story

As a **developer**,  
I want to **extract a reusable useItems hook with caching**,  
So that **both Items and Prices pages can share item data efficiently**.

---

## Acceptance Criteria

### AC 1: Hook Extraction
**Given** the existing items data fetching logic in items-prices-page.tsx  
**When** I extract it into a standalone `useItems()` hook  
**Then** the hook returns `{ items, loading, error, refresh, itemMap }`

### AC 2: Caching Between Components
**Given** the useItems hook is implemented  
**When** multiple components use the hook  
**Then** data is cached and shared between components (not re-fetched)

### AC 3: Refresh Capability
**Given** cached item data  
**When** the `refresh()` function is called  
**Then** data is re-fetched from the API and cache is updated

### AC 4: Memory Safety
**Given** the hook is used  
**When** the component unmounts  
**Then** no memory leaks occur (proper cleanup)

---

## Tasks/Subtasks

### Phase 1: Verify Hook Implementation
- [x] Review existing useItems hook in `apps/backoffice/src/hooks/use-items.ts`
- [x] Verify hook returns `{ items, loading, error, refresh, itemMap }`
- [x] Verify caching is implemented via CacheService
- [x] Verify memory cleanup with isMounted ref

### Phase 2: Update items-prices-page.tsx
- [x] Import useItems hook
- [x] Replace local items state with useItems hook
- [x] Update refreshData to use hook's refresh function
- [x] Remove local itemMap computation (use hook's itemMap)
- [x] Verify imports still work after refactoring

### Phase 3: Testing & Validation
- [x] Run existing unit tests for useItems hook
- [x] Verify items-prices-page.tsx still works correctly
- [x] Verify no regressions in functionality
- [x] Run full test suite (45 tests passed)

### Phase 4: Documentation
- [x] Update Dev Agent Record with implementation notes
- [x] Update File List with all modified files
- [x] Update Change Log

---

## Technical Notes

- **Location:** `apps/backoffice/src/hooks/use-items.ts`
- Use React Context or Zustand for shared state
- Cache invalidation on mutations
- TypeScript interfaces for all return values
- Include loading and error states for proper UX

---

## Implementation Hints

1. Analyze existing items-prices-page.tsx for data fetching patterns
2. Extract fetch logic into a custom hook
3. Implement caching layer (Zustand store or React Context)
4. Add proper TypeScript types
5. Test in isolation before integrating into pages

---

## Definition of Done

- [x] Hook implemented with full TypeScript types
- [x] Caching works between multiple components
- [x] Refresh functionality tested
- [x] No memory leaks verified
- [x] Unit tests passing (45 tests)
- [ ] Code reviewed and approved (PENDING)

---

## Dev Agent Record

### Implementation Plan

**Phase 1 Analysis:**
- The `useItems` hook already exists at `apps/backoffice/src/hooks/use-items.ts`
- It implements caching via CacheService (IndexedDB-based)
- Returns `{ items, loading, error, refresh, itemMap }` as required
- Has proper memory cleanup with `isMounted` ref

**Phase 2 Integration:**
- The `items-prices-page.tsx` currently manages items state locally
- Need to replace local state management with useItems hook
- Hook already handles caching, loading states, and error handling

**Technical Decisions:**
- Keep existing CacheService for caching (already implemented)
- Use the existing hook as-is (no modifications needed)
- Update page component to use hook instead of local state

### Debug Log

**2026-03-17:**
- Story started
- Found existing useItems hook with full implementation
- items-prices-page.tsx currently uses local state for items
- Plan: Replace local items management with useItems hook

### Completion Notes

**Implementation Summary:**
- ✅ AC 1: Hook returns `{ items, loading, error, refresh, itemMap }` - VERIFIED
- ✅ AC 2: Caching works via CacheService (IndexedDB) - IMPLEMENTED
- ✅ AC 3: Refresh capability via `refresh()` function - WORKING
- ✅ AC 4: Memory safety with isMounted ref - IMPLEMENTED

**Key Changes:**
1. Verified existing `useItems` hook at `apps/backoffice/src/hooks/use-items.ts` already implemented with:
   - Full TypeScript types
   - CacheService integration for IndexedDB caching
   - Proper cleanup with isMounted ref (memory leak prevention)
   - Complete return interface: items, loading, error, refresh, itemMap

2. Updated `items-prices-page.tsx` to use the hook:
   - Replaced local `items` state with `useItems()` hook
   - Removed duplicate `itemMap` useMemo (now from hook)
   - Updated `refreshData()` to call `refreshItems()` from hook
   - Combined hook's loading/error states with local states
   - Added import: `import { useItems } from "../hooks/use-items"`

**Tests:**
- All 45 backoffice tests passing
- useItems hook tests passing
- No TypeScript errors
- No regressions detected

---

## File List

- `apps/backoffice/src/hooks/use-items.ts` (existing - verified)
- `apps/backoffice/src/hooks/use-items.test.ts` (existing - tests passing)
- `apps/backoffice/src/features/items-prices-page.tsx` (modified - now uses useItems hook)

---

## Change Log

- **2026-03-17**: Story started - Found existing useItems hook implementation
- **2026-03-17**: Updated items-prices-page.tsx to use useItems hook
- **2026-03-17**: Combined hook and local loading/error states
- **2026-03-17**: All 45 tests passing, TypeScript clean
- **2026-03-17**: Story marked complete, ready for review

