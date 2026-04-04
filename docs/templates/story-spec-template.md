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
