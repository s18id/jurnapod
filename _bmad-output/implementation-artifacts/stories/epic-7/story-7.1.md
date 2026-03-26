# Story 7.1: TDB Registry Fix + TD Health Check Template

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a development team member,
I want the Technical Debt Registry to accurately reflect resolved items and have a standardized health check process,
so that technical debt is properly tracked and we can consistently assess debt health before each epic retrospective.

## Context

The Technical Debt Registry has two issues to fix before Epic 7 begins:
1. TD-016 through TD-019 incorrectly marked `Open` — resolved in Story 6.7
2. New debt from Epic 6 retro assigned conflicting IDs — reassigned as TD-026 through TD-029

Additionally, the Epic 6 retro action item #4 calls for a per-epic TD health check template.

## Acceptance Criteria

### AC1: Registry Corrections
- Update TD-016 through TD-019 status to `RESOLVED` with reference to Story 6.7
- Add TD-026 through TD-029 with correct IDs, descriptions, and resolution plans
- Update summary statistics table

### AC2: TD Health Check Template
- Create `docs/adr/td-health-check-template.md`
- Template covers: open P1/P2 items audit, new debt introduced this epic, registry update checklist
- Add reference to template in TECHNICAL-DEBT.md process section
- Template should be runnable before every epic retrospective

### AC3: Epic 6 Retro Process Items
- Document "No new TD without tracking" rule in TECHNICAL-DEBT.md process section
- Add TD debt checklist to story template (`_bmad-output/implementation-artifacts/stories/story-template.md` or equivalent)

## Tasks / Subtasks

- [x] Update TECHNICAL-DEBT.md registry (AC1)
  - [x] Mark TD-016 to TD-019 as RESOLVED with Story 6.7 reference
  - [x] Add TD-026 through TD-029 with descriptions and resolution plans
  - [x] Update summary statistics table
- [x] Create TD Health Check Template (AC2)
  - [x] Create docs/adr/td-health-check-template.md
  - [x] Include open P1/P2 items audit section
  - [x] Include new debt introduced this epic section
  - [x] Include registry update checklist
  - [x] Add template reference to TECHNICAL-DEBT.md process section
- [x] Update process documentation (AC3)
  - [x] Document "No new TD without tracking" rule in TECHNICAL-DEBT.md
  - [x] Add TD checklist to story template

## Dev Notes

### Technical Requirements
- No code changes - documentation and process only
- Maintain markdown formatting consistency with existing docs
- Follow existing ADR and technical debt documentation patterns

### Files to Modify
- `docs/adr/TECHNICAL-DEBT.md` - Update registry entries and add process documentation
- `_bmad-output/implementation-artifacts/stories/story-template.md` - Add TD checklist

### Files to Create
- `docs/adr/td-health-check-template.md` - New health check template

### Project Structure Notes
- ADRs are stored in `docs/adr/` directory
- Story templates are in `_bmad-output/implementation-artifacts/stories/`
- Follow existing markdown structure and formatting

### References

- [Source: _bmad-output/planning-artifacts/epic-7.md] - Epic 7 full specification
- [Source: docs/adr/TECHNICAL-DEBT.md] - Current technical debt registry
- [Source: _bmad-output/implementation-artifacts/stories/story-template.md] - Story template to update

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

- [COMPLETED 2026-03-28] All acceptance criteria met
- TD-016 through TD-019 marked RESOLVED with Story 6.7 references
- TD-026 through TD-029 added with resolution plans linked to Epic 7 stories
- Health check template created with 5-part audit process
- "No New TD Without Tracking" rule documented with triggers and process

### File List

**Created:**
- `docs/adr/td-health-check-template.md` (87 lines)

**Modified:**
- `docs/adr/TECHNICAL-DEBT.md` - Updated registry entries, added process section, updated statistics and changelog
