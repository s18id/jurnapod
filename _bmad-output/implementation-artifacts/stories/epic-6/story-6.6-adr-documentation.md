# Story 6.6: ADR Documentation & Debt Registry

**Status:** done

## Story

As a **Jurnapod architect**,
I want **to establish a systematic approach to tracking technical debt**,
So that **debt is visible, prioritized, and actively managed across epics**.

## Context

As the codebase matures (6 epics completed), technical debt needs active tracking. ADR-0010 was created for Epic 5 but there's no systematic approach.

## Acceptance Criteria

**AC1: Debt Registry**
- [x] Create `docs/adr/TECHNICAL-DEBT.md` as living debt registry
- [x] Catalog all known debt items across all epics
- [x] Link to specific ADRs for detailed tracking

**AC2: Review Process**
- [x] Document process for adding new debt items
- [x] Define priority levels (P1/P2/P3/P4)
- [x] Set review cadence (per-epic before closing retrospective)

**AC3: Debt Prevention**
- [x] Add debt items to story templates as checkboxes
- [x] Require debt review before closing epics

## Tasks

- [x] Create `docs/adr/TECHNICAL-DEBT.md` template
- [x] Catalog all known debt from Epics 0-6
- [x] Define priority levels and review process
- [x] Update story template with debt checkbox
- [x] Add debt review step to epic close process

## Estimated Effort

1 day

## Risk Level

None (process improvement)

## Dependencies

None

## Technical Debt Review

- [x] No shortcuts taken that require follow-up
- [x] All `TODO`/`FIXME` comments have linked issues or are documented
- [x] No deprecated functions used without migration plan
- [x] No `as any` casts added without justification
- [x] No N+1 query patterns introduced
- [x] All new debt items added to TECHNICAL-DEBT.md

**Debt Items Created:** None

## Dev Agent Record

### Agent Model Used

opencode-go/glm-5

### Debug Log References

N/A

### Completion Notes List

1. Created `docs/adr/TECHNICAL-DEBT.md` with comprehensive debt registry:
   - Cataloged 25 debt items from Epics 0-6
   - 14 open, 11 resolved
   - Priority breakdown: P1 (0 open), P2 (7 open), P3 (4 open), P4 (3 open)
   - Linked to ADR-0010 for Epic 5 debt details
   - Linked to retrospective documents for context

2. Defined priority levels:
   - P1: Critical (immediate response)
   - P2: High (1-2 sprints)
   - P3: Medium (capacity allows)
   - P4: Low (backlog)

3. Documented review process:
   - Per-epic review before closing retrospective
   - Quarterly review for all open items
   - Clear process for adding new debt items

4. Updated story template (`_bmad/bmm/workflows/4-implementation/create-story/template.md`):
   - Added "Technical Debt Review" section with checklist
   - Added "Debt Items Created" field for tracking
   - Links to TECHNICAL-DEBT.md for reference

5. Added debt review step to epic close process (documented in TECHNICAL-DEBT.md):
   - Audit debt created during epic
   - Update registry
   - Prioritize and assign owners
   - Schedule remediation

### File List

- `docs/adr/TECHNICAL-DEBT.md` (created)
- `_bmad/bmm/workflows/4-implementation/create-story/template.md` (modified)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (modified)
- `_bmad-output/implementation-artifacts/stories/epic-6/story-6.6-adr-documentation.md` (modified)

## Change Log

| Date | Change |
|------|--------|
| 2026-03-26 | Story completed - debt registry created, template updated |