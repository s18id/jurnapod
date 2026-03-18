---
epic: 8
story: 8.2
title: Extract useItemGroups Hook
status: review
created: 2026-03-17
updated: 2026-03-17
---

# Story 8.2: Extract useItemGroups Hook

**Epic:** 8 - Backoffice-Items-Split  
**Priority:** P0  
**Effort:** ~1 hour

---

## User Story

As a **developer**,  
I want to **extract a reusable useItemGroups hook**,  
So that **item group data can be shared across pages**.

---

## Acceptance Criteria

### AC 1: Hook Extraction
**Given** the existing item groups fetching logic  
**When** I extract it into `useItemGroups()` hook  
**Then** the hook returns `{ itemGroups, loading, error, refresh, groupMap }`

### AC 2: Cross-Page Usage
**Given** the useItemGroups hook  
**When** used in Items or Prices page  
**Then** group data is available for filtering and display

### AC 3: Efficient Lookup
**Given** a groupMap derived from itemGroups  
**When** looking up a group by ID  
**Then** O(1) lookup time is achieved

---

## Technical Notes

- **Location:** `apps/backoffice/src/hooks/use-item-groups.ts`
- Share with useItems hook via same state management approach
- Include groupMap for efficient lookups by ID
- Follow same patterns as useItems hook for consistency

---

## Implementation Hints

1. Use same caching approach as Story 8.1
2. Transform itemGroups array into groupMap object for O(1) lookup
3. Keep hook interface consistent with useItems
4. Handle empty states gracefully

---

## Tasks / Subtasks

- [x] Create useItemGroups hook with TypeScript types
- [x] Implement itemGroups, loading, error, refresh, groupMap return values
- [x] Implement O(1) lookup via Map-based groupMap
- [x] Add caching integration with CacheService
- [x] Write unit tests for hook exports and type validation
- [x] Export hook from hooks/index.ts
- [x] Add tests to test aggregator (all.test.ts)
- [x] Run full test suite and verify all tests pass

---

## Dev Agent Record

### Implementation Plan
The useItemGroups hook was already implemented following the same patterns as useItems hook:
1. Uses CacheService for IndexedDB caching
2. Returns { itemGroups, loading, error, refresh, groupMap }
3. Implements O(1) lookup via JavaScript Map
4. Handles loading/error states properly
5. Includes automatic cleanup on unmount

### Debug Log
- Tests initially not included in all.test.ts aggregator
- Added import statements for both use-item-groups.test and use-items.test
- All 13 tests passing (9 existing + 4 new hook tests)

### Completion Notes
✅ All Acceptance Criteria met:
- AC 1: Hook returns { itemGroups, loading, error, refresh, groupMap } - VERIFIED
- AC 2: Hook exported from hooks/index.ts for cross-page usage - VERIFIED  
- AC 3: groupMap uses JavaScript Map for O(1) lookup - VERIFIED

Files modified:
- apps/backoffice/src/tests/all.test.ts (added hook test imports)

Files created: None (already existed)

Test results: 13/13 passing
- useItemGroups hook: 2 tests passing
- useItems hook: 2 tests passing
- Existing outbox tests: 9 tests passing

---

## File List

- apps/backoffice/src/hooks/use-item-groups.ts (existing)
- apps/backoffice/src/hooks/use-item-groups.test.ts (existing)
- apps/backoffice/src/hooks/index.ts (existing - already exports hook)
- apps/backoffice/src/tests/all.test.ts (modified - added test imports)

---

## Change Log

- 2026-03-17: Added useItemGroups and useItems tests to test aggregator
- 2026-03-17: Verified all acceptance criteria met
- 2026-03-17: Story marked complete, ready for review

---

## Definition of Done

- [x] Hook implemented with full TypeScript types
- [x] groupMap provides O(1) lookup
- [x] Shared state management with useItems (same CacheService pattern)
- [x] Unit tests passing
- [x] Code ready for review
