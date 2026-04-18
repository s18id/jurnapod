# Story {story_number}: {story_title}

Status: {ready-for-dev|in-progress|review|done}

> ⚠️ **Sprint-Status Append-Only Rule (E45-A1):**
> If this story modifies `_bmad-output/implementation-artifacts/sprint-status.yaml`:
> - **PREFERRED**: Use `npx tsx scripts/update-sprint-status.ts --epic N --story N-X --status done` (the canonical utility)
> - **IF editing manually**: READ the file before editing, APPEND only your epic's section, never replace the entire file
> - **PRESERVE** all existing epic entries (Epics 1–N)
> - If accidentally overwritten: `git checkout HEAD -- _bmad-output/implementation-artifacts/sprint-status.yaml`
> - Never use `replaceAll` on epic section markers
> - **Validate** after editing: `npx tsx scripts/validate-sprint-status.ts`

## Story

As a **{role}**,  
I want **{feature}**,  
So that **{benefit}**.

## Context

{Background context, previous work, dependencies, and why this story exists}

---

## API Contract Verification (MANDATORY for UI Stories)

> **Purpose:** Verify all API endpoints return expected contract shapes BEFORE starting UI implementation.
> *"Endpoint exists" ≠ "Endpoint is complete"*

### Pre-Implementation Checklist

- [ ] Call each API endpoint directly (e.g., via curl, Postman, or API client)
- [ ] Verify response shape matches API contract in story or shared package
- [ ] Verify required fields are present and not null/placeholder
- [ ] Verify authentication/authorization works as expected
- [ ] Verify error responses (400, 401, 403, 404, 500) are properly shaped
- [ ] Document any API gaps discovered in the table below

### API Endpoint Verification Results

| Endpoint | Method | Expected Shape | Verified | Notes |
|----------|--------|----------------|---------|-------|
| `/api/v1/...` | GET | `{ data: [], pagination: {} }` | ✅/❌ | {notes} |

### API Gaps Found (Document Here)

If any gaps are found, either:
1. Block story until API is fixed, OR
2. Document gap and proceed with acknowledgment that UI is built against incomplete contract

| Gap | Impact | Resolution |
|-----|--------|-----------|
| {description} | {High/Medium/Low} | {Fixed/Will fix later/Proceeding with known gap} |

---

## Acceptance Criteria

**AC1: {criterion_name}**
**Given** {precondition}
**When** {action}
**Then** {expected_result}

{... more ACs as needed}

## Bulk Migration AC Rule (MANDATORY for Cross-Cutting Refactors)

> When migrating multiple files/functions/hooks (bulk migrations), enumerate **every target explicitly in the AC table below**, not just in the completion report. This closes the loophole where "AC passes but a target was missed."

### Bulk Migration Targets

| # | Target File/Function | Status |
|---|----------------------|--------|
| 1 | `path/to/file` | To be migrated |
| 2 | `path/to/file` | To be migrated |
| ... | ... | ... |

**AC verification requires:** All rows show "migrated" — partial completion is not acceptance.

## Test Coverage Criteria

- [ ] Coverage target: __% (or "all paths")
- [ ] Happy paths to test:
  - [ ] ...
- [ ] Error paths to test:
  - [ ] 400: ...
  - [ ] 404: ...
  - [ ] 409: ...
  - [ ] 500: ...

## Test Fixtures

**Complete this section if the story introduces new data patterns, extraction/migration work, or canonical patterns.**

> Reference: [AGENTS.md](../../AGENTS.md) - "Canonical Test Fixtures" and "Extraction Story Checklist" sections

### Pre-Implementation Checklist
- [ ] New patterns identified that need canonical fixtures (timestamps, status IDs, enum values, etc.)
- [ ] Existing canonical fixtures reviewed for reuse potential
- [ ] Fixture location determined (`packages/db/test-fixtures.ts`, `packages/shared/test/fixtures.ts`, or package-level equivalent)

### Fixture Creation/Update
- [ ] **New fixtures needed:** List patterns requiring canonical fixtures:
  - [ ] Pattern 1: `___` (e.g., `reservation_start_ts` handling)
  - [ ] Pattern 2: `___` (e.g., `status_id` conventions)
  - [ ] Pattern 3: `___`
- [ ] **Existing fixtures to update:**
  - [ ] `___` (file path) - update reason: ___

### Test File Audit (Post-Implementation - MANDATORY)
- [ ] All new tests use canonical fixtures (not ad-hoc raw SQL INSERT/UPDATE)
- [ ] Existing tests audited against new canonical patterns
- [ ] Test files requiring fixture updates identified:
  - [ ] `___` (test file path) - needs: ___
  - [ ] `___` (test file path) - needs: ___
- [ ] All identified test files updated to use canonical fixtures

### Extraction/Migration Stories Only
- [ ] Pre-extraction: All consumers of code being extracted identified
- [ ] Post-extraction: Adapter shim immediately deleted (no lingering shims)
- [ ] Route flipping verified: all consumers use new package imports
- [ ] Full test suite run to verify no regressions

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

## Cross-Cutting Concerns

Complete this section if the story involves sync operations, data persistence, or cross-module interactions.

### Audit Integration
- [ ] Audit events required? (`startEvent`, `completeEvent`, `failEvent`)
- [ ] Audit fields to capture: `company_id`, `outlet_id`, `user_id`, `module_id`, `operation`, `duration_ms`
- [ ] Audit tier: `MASTER` | `OPERATIONAL` | `REALTIME` | `ADMIN` | `ANALYTICS`

### Idempotency
- [ ] Idempotency key field: `client_tx_id` | `update_id` | `cancellation_id` | `adjustment_id` | `other: ___`
- [ ] Duplicate handling: `return DUPLICATE` | `skip and log` | `throw error`
- [ ] Idempotency service: `syncIdempotencyService` from `@jurnapod/sync-core`

### Feature Flags
- [ ] Feature flag required? Yes / No
- [ ] Flag name: `___`
- [ ] Rollout modes: `shadow` | `10` | `50` | `100` (percentage)
- [ ] Shadow mode behavior: `log metrics` | `compare outputs` | `no-op`

### Validation Rules
- [ ] `company_id` must match authenticated company
- [ ] `service_type: 'DINE_IN'` requires `table_id`
- [ ] Other validation constraints: ___

### Error Handling
- [ ] Retryable errors: `ERROR_CLASSIFICATION.RETRYABLE`
- [ ] Non-retryable errors: `ERROR_CLASSIFICATION.NON_RETRYABLE`
- [ ] Error response format: `{ success: false, error_message: string }`

### Health Check
- [ ] Health check required? Yes / No
- [ ] Checks: database connectivity | external API | cache | other: ___

## File List

- `file1.md` (new)
- `file2.ts`

## Validation Evidence

- {How to validate this story is complete}
- {Test commands, expected outcomes}

## Dependencies

- {What other stories or work must be complete first}

## Shared Contract Changes (MANDATORY for Constants/Types)

> Applies when: story modifies shared constants, types, or contracts consumed by other packages/tests.

### Blast Radius Check (E33-A1)
Before marking complete, verify the change doesn't break consumers:

- [ ] Grep for all usages of the changed constant/type in other packages
- [ ] Grep for all usages in test files
- [ ] Run consuming package tests — all must pass
- [ ] Document any consumer files that needed updates

### Constant Change Verification (E33-A4)
When changing shared constant values:

- [ ] Update all test expectations that reference the constant
- [ ] Verify no hardcoded assertion values remain from old constants
- [ ] Cross-reference with canonical fixtures

### Consumer Audit Results

| Consumer File | Tested | Result |
|--------------|---------|--------|
| `packages/shared/src/...` | ✅/❌ | Pass/Fail |

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
