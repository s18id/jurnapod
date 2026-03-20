# Story 4.10: Backoffice Variant Stats N+1 Fan-Out Optimization

Status: backlog

## Story

As a backoffice user,
I want variant statistics to load efficiently,
so that the items list remains responsive even with many variants.

## Acceptance Criteria

### AC 1: No N+1 Queries on Variant Stats Loading

**Given** items page with variants  
**When** variants are loaded  
**Then** no N+1 queries occur (batch loading)  
**And** all variant statistics are fetched in a single query or bounded batch

- [ ] Task 1: Audit current variant stats query pattern
- [ ] Task 2: Implement batch loading for variant statistics
- [ ] Task 3: Add performance tests

### AC 2: Item List Load Time Under 200ms

**Given** many variants per item  
**When** viewing item list  
**Then** load time remains under 200ms  
**And** performance is measured and documented

- [ ] Task 1: Audit current variant stats query pattern
- [ ] Task 2: Implement batch loading for variant statistics
- [ ] Task 3: Add performance tests

## Dev Notes

### Original Deferred Follow-up

**Source:** `_bmad-output/implementation-artifacts/epic-4-retro-2026-03-18.md` (lines 72-75)

> Backoffice variant stats N+1 fan-out optimization remains deferred (`4-7` documented follow-up).

**Context from Retro:**
- Story 4-7 (Item variants) was completed but flagged a known N+1 performance issue
- The variant statistics loading pattern was identified as needing batch optimization
- This was explicitly added to the backlog as a carry-forward action item

### Technical Background

The N+1 query issue occurs when:
1. Items list is loaded (1 query)
2. For each item, variant statistics are fetched individually (N queries)

The optimization should batch these into:
- Single query with JOIN and aggregation, OR
- Bounded batch queries (e.g., fetch stats for 50 items at a time)

### References

- Epic: `_bmad-output/planning-artifacts/epics-split/epic-4-items-catalog.md`
- Story 4-7: Item variants (original implementation)
- Retro: `_bmad-output/implementation-artifacts/epic-4-retro-2026-03-18.md`

### Dependencies

- Story 4-7 (Item variants) must be complete before this optimization
- May require coordination with API team for query changes

### Related Stories

- Story 4.7: Item variants (parent feature)
- Story 4.11: Image reorder atomic resequence (related optimization)

---

## Dev Agent Record

*To be completed when story is implemented.*
