# Story 4.11: Image Reorder Atomic Resequence

Status: backlog

## Story

As a backoffice admin,
I want to reorder item images atomically,
so that the image sequence is never left in an inconsistent state during concurrent edits.

## Acceptance Criteria

### AC 1: Atomic Image Position Updates

**Given** item with multiple images  
**When** admin reorders images  
**Then** all image position values update in a single transaction  
**And** no partial state is visible if the update fails

- [ ] Task 1: Add transaction wrapper to image reorder endpoint
- [ ] Task 2: Add optimistic locking for image sequence
- [ ] Task 3: Add concurrency tests

### AC 2: Concurrent Reorder Conflict Handling

**Given** concurrent reorder requests  
**When** both try to update same item  
**Then** one succeeds and one receives a conflict error  
**And** no data corruption occurs

- [ ] Task 1: Add transaction wrapper to image reorder endpoint
- [ ] Task 2: Add optimistic locking for image sequence
- [ ] Task 3: Add concurrency tests

## Dev Notes

### Original Deferred Follow-up

**Source:** `_bmad-output/implementation-artifacts/epic-4-retro-2026-03-18.md` (lines 72-75)

> Image reorder atomic resequence limitation remains documented as known follow-up (`4-8`).

**Context from Retro:**
- Story 4-8 (Barcode & image support) was completed but flagged a concurrency issue
- Image reorder operations could leave sequence in inconsistent state under concurrent edits
- This was explicitly added to the backlog as a carry-forward action item

### Technical Background

The atomic resequence issue occurs when:
1. Admin A reads image positions [img1:1, img2:2, img3:3]
2. Admin B reads image positions [img1:1, img2:2, img3:3]
3. Admin A moves img3 to position 1 -> [img1:2, img2:3, img3:1]
4. Admin B moves img1 to position 3 -> [img1:3, img2:1, img3:2] (inconsistent!)

The fix should use:
- Transaction wrapper to make all position updates atomic
- Optimistic locking (version column) to detect concurrent modifications
- Return 409 CONFLICT when version mismatch detected

### References

- Epic: `_bmad-output/planning-artifacts/epics-split/epic-4-items-catalog.md`
- Story 4-8: Barcode & image support (original implementation)
- Retro: `_bmad-output/implementation-artifacts/epic-4-retro-2026-03-18.md`

### Dependencies

- Story 4-8 (Barcode & image support) must be complete before this optimization
- May require migration to add version column to image sequence

### Related Stories

- Story 4.8: Barcode & image support (parent feature)
- Story 4.10: Variant stats N+1 optimization (related optimization)

---

## Dev Agent Record

*To be completed when story is implemented.*
