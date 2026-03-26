# Story 4.4: Update Story Template and Create Sync Checklist

Status: done

## Story

As a **Jurnapod scrum master**,  
I want **improved story templates and sync validation checklists**,  
So that **future stories have explicit test coverage criteria and sync changes are properly validated**.

## Context

Epic 3 retrospective identified gaps in process:
1. Story 3.5 accepted fixed-assets coverage gap - future stories should require explicit test coverage criteria
2. Story 3.6 uncovered sync protocol edge cases - future sync changes need mandatory validation checklist

This story improves our templates and creates a sync protocol validation checklist.

## Acceptance Criteria

**AC1: Story Template Update**
**Given** the existing story spec template
**When** updating it
**Then** add mandatory section: "Test Coverage Criteria"
**And** require explicit coverage percentage or "all paths" statement
**And** require listing of error paths to be tested
**And** apply to Epic 4 and future stories

**AC2: Sync Protocol Validation Checklist**
**Given** sync-related changes need validation
**When** creating the checklist
**Then** document mandatory validation steps:
- Idempotency verification (client_tx_id handling)
- Conflict resolution behavior
- Offline-first guarantees
- Regression test execution

**AC3: Checklist Integration**
**Given** the sync checklist
**When** referenced in planning
**Then** it is located at `docs/process/sync-protocol-checklist.md`
**And** it is linked from Epic 4 planning
**And** it is referenced in ADR-0009

**AC4: Template Application**
**Given** the updated templates
**When** reviewing Epic 4 stories
**Then** all stories include explicit test coverage criteria
**And** sync-related stories reference the validation checklist

## Test Coverage Criteria

- Coverage target: documentation/process verification only
- Happy paths to test:
  - template renders with required coverage section
  - checklist renders and links resolve correctly
  - Epic 4 stories include explicit coverage criteria after backfill
- Error paths to test:
  - broken documentation links are corrected before completion

## Tasks / Subtasks

- [x] Review current story template
- [x] Add "Test Coverage Criteria" section to template
- [x] Define coverage requirement options (percentage vs "all paths")
- [x] Add error paths listing requirement
- [x] Create sync protocol validation checklist
- [x] Document idempotency verification steps
- [x] Document conflict resolution validation
- [x] Document offline-first guarantees check
- [x] Add regression test requirements
- [x] Update ADR-0009 to reference checklist
- [x] Apply updated template to Epic 4 stories (backfill)

## Files to Create

| File | Description |
|------|-------------|
| `docs/process/sync-protocol-checklist.md` | Mandatory validation steps for sync changes |

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `docs/templates/story-spec-template.md` | Modify | Add test coverage criteria section |
| `docs/adr/ADR-0009-kysely-type-safe-query-builder.md` | Modify | Reference sync checklist |

## Estimated Effort

0.5 days

## Risk Level

None (process documentation)

## Dev Notes

Story Template additions:
```markdown
## Test Coverage Criteria

- [ ] Coverage target: __% (or "all paths")
- [ ] Happy paths to test:
  - [ ] ...
- [ ] Error paths to test:
  - [ ] 400: ...
  - [ ] 404: ...
  - [ ] 409: ...
  - [ ] 500: ...
```

Sync Protocol Checklist structure:
1. Pre-Implementation
   - [ ] Identify sync touchpoints
   - [ ] Review offline-first requirements
2. Implementation
   - [ ] client_tx_id handling verified
   - [ ] Idempotency logic implemented
   - [ ] Conflict resolution strategy defined
3. Testing
   - [ ] Regression tests added/updated
   - [ ] Offline scenario tests pass
   - [ ] Concurrent sync tests pass
4. Documentation
   - [ ] ADR updated if protocol changes
   - [ ] API contracts updated

## File List

- `docs/process/sync-protocol-checklist.md` (new)
- `docs/templates/story-spec-template.md` (new)
- `docs/adr/ADR-0009-kysely-type-safe-query-builder.md`
- `_bmad-output/implementation-artifacts/stories/epic-4/story-4.1-extract-shared-master-data-utilities.md`
- `_bmad-output/implementation-artifacts/stories/epic-4/story-4.2-backfill-fixed-assets-route-tests.md`
- `_bmad-output/implementation-artifacts/stories/epic-4/story-4.3-document-epic-3-product-enablement.md`
- `_bmad-output/implementation-artifacts/stories/epic-4/story-4.4-update-story-template-and-sync-checklist.md`

## Validation Evidence

- Template renders correctly in markdown
- Checklist is comprehensive yet usable
- ADR-0009 references the checklist
- Epic 4 stories updated with coverage criteria

## Dependencies

- None (can be done in parallel with other Epic 4 stories)

## Notes

- This addresses P2 actions from Epic 3 retrospective
- Process improvements prevent future coverage gaps
- Sync checklist prevents protocol regressions
- Apply lessons learned to future epics

---

## Dev Agent Record

### Implementation Summary

**Date:** 2026-03-26

**Completed:**
1. Created `docs/process/sync-protocol-checklist.md` with mandatory validation steps organized into 4 sections (Pre-Implementation, Implementation, Testing, Documentation)
2. Created `docs/templates/story-spec-template.md` with new mandatory "Test Coverage Criteria" section including coverage target, happy paths, and error path requirements (400, 404, 409, 500)
3. Updated `docs/adr/ADR-0009-kysely-type-safe-query-builder.md` to reference the new sync protocol checklist as mandatory for sync-related changes

**Completed in follow-up:**
- Backfilled explicit test coverage criteria into all Epic 4 story files
- Fixed the ADR-0009 link path in `docs/process/sync-protocol-checklist.md`

### Files Created
- `docs/process/sync-protocol-checklist.md` (96 lines)
- `docs/templates/story-spec-template.md` (80 lines)

### Files Modified
- `docs/adr/ADR-0009-kysely-type-safe-query-builder.md` (added Sync Protocol Validation section + reference in References)

### Validation
- Templates render correctly in markdown (verified by visual inspection)
- Checklist is comprehensive yet usable (covers pre-impl, impl, testing, docs phases)
- ADR-0009 references the checklist in both dedicated section and References list
- Epic 4 story files now include explicit test coverage criteria
