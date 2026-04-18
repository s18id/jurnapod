# Story 45.1: Dead Code Audit Step in Consolidation Stories

**Epic:** Epic 45 — Tooling Standards & Process Documentation  
**Story ID:** 45-1-dead-code-audit-step  
**Status:** Ready for Implementation

---

## As a:
Developer

## I want:
A documented dead code audit step in extraction/consolidation stories

## So that:
Unused code is identified and removed during refactoring and does not accumulate as technical debt.

---

## Acceptance Criteria:

**Given** an extraction or consolidation story is being executed,
**When** the adapter/implementation code is deleted after route flipping,
**Then** a dead code audit must be performed checking for:
- Any exported functions from the deleted module that are no longer referenced by any consumer
- Any type definitions that became orphaned after the deletion
- Any test files that only tested the deleted code (and should be removed)
**And** findings must be documented in the story completion report

**Given** dead code is found,
**When** the audit is complete,
**Then** the developer must either delete the orphaned code or create a tracked action item with owner and priority

---

## What to implement:

1. **Read the existing story completion template** at `docs/templates/story-completion-template.md`
2. **Add a "Dead Code Audit" section** to the template with:
   - A checklist of what to check (orphaned exports, types, test files)
   - A field for documenting what was found (clean / found X items)
   - A field for documenting action taken (deleted / action item created with ID)
3. **Update `epic-45-retrospective.md`** (or create it at `_bmad-output/implementation-artifacts/stories/epic-45/epic-45.retrospective.md`) to note this work
4. **Do NOT modify any production code** — template changes only

## Rules:
- Output must be a proper story spec file and a completion note
- Update sprint-status.yaml when status changes
- Document what you created in the completion note

---

## Implementation Tasks:

- [ ] AC1: Read existing story completion template at `docs/templates/story-completion-template.md`
- [ ] AC2: Add "Dead Code Audit" section with checklist, findings field, and action field
- [ ] AC3: Create or update epic-45-retrospective.md to document this work
- [ ] AC4: Create story completion note documenting the template changes
- [ ] AC5: Update sprint-status.yaml to mark story as done

---

## Dev Agent Record

{To be filled during implementation}

---

## File List

{To be filled during implementation}
