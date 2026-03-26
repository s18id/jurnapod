# Story {story_number}: {story_title}

Status: {ready-for-dev|in-progress|review|done}

## Story

As a **{role}**,  
I want **{feature}**,  
So that **{benefit}**.

## Context

{Background context, previous work, dependencies, and why this story exists}

## Acceptance Criteria

**AC1: {criterion_name}**
**Given** {precondition}
**When** {action}
**Then** {expected_result}

{... more ACs as needed}

## Test Coverage Criteria

- [ ] Coverage target: __% (or "all paths")
- [ ] Happy paths to test:
  - [ ] ...
- [ ] Error paths to test:
  - [ ] 400: ...
  - [ ] 404: ...
  - [ ] 409: ...
  - [ ] 500: ...

## Tasks / Subtasks

- [ ] {task_description}
- [ ] {subtask if needed}

## Files to Create

| File | Description |
|------|-------------|
| `path/to/file` | {description} |

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `path/to/file` | Modify/Create | {description} |

## Estimated Effort

{X} days

## Risk Level

{Low|Medium|High|None}

## Dev Notes

{Technical guidance, architecture decisions, patterns to follow, previous learnings}

## File List

- `file1.md` (new)
- `file2.ts`

## Validation Evidence

- {How to validate this story is complete}
- {Test commands, expected outcomes}

## Dependencies

- {What other stories or work must be complete first}

## Technical Debt Review

Complete before marking story done. If any box is checked, add a TD item to [TECHNICAL-DEBT.md](../adr/TECHNICAL-DEBT.md) before closing.

- [ ] No shortcuts taken that require follow-up
- [ ] No `TODO`/`FIXME` comments left in production code without a linked TD item
- [ ] No `as any` casts added without justification and TD item
- [ ] No deprecated functions used without a migration plan
- [ ] No N+1 query patterns introduced
- [ ] No in-memory state introduced that won't survive restarts or multi-instance deployment
- [ ] Integration tests included in this story's AC (not deferred)
- [ ] All new debt items added to registry before story closes

## Notes

{Additional context, retrospective learnings, caveats}
