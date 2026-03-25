# Story 17.5: Prevent unintended `_ts` exposure in public contracts

Status: ready-for-dev

## Story

As a developer,
I want internal `_ts` fields excluded from public response DTOs unless explicitly required,
so that machine-ordering fields are not mistaken for display or business-date values.

## Acceptance Criteria

1. Public API response DTOs in affected flows omit internal `_ts` fields unless explicitly documented.
2. Any intentionally exposed `_ts` field has documented machine-time semantics and matching test coverage.
3. Contract updates stay aligned between route code and shared schemas.

## Tasks / Subtasks

- [ ] Task 1: Audit affected public contracts (AC: 1, 2, 3)
  - [ ] Subtask 1.1: Review sync-related schemas in `packages/shared/src/schemas/pos-sync.ts`.
  - [ ] Subtask 1.2: Review reservation/public DTOs touched by Epic 17.
- [ ] Task 2: Remove unintended `_ts` leakage (AC: 1, 3)
  - [ ] Subtask 2.1: Omit internal machine-time fields where they are not contractually needed.
  - [ ] Subtask 2.2: Keep explicit contract docs/comments for any required `_ts` exposure.
- [ ] Task 3: Add contract/regression coverage (AC: 2, 3)
  - [ ] Subtask 3.1: Update route/schema tests for omitted fields.
  - [ ] Subtask 3.2: Add tests/documentation for any intentional exposed `_ts` field.

## Dev Notes

### Developer Context

- Epic 17 explicitly treats `_ts` as internal machine-time metadata unless a contract requires exposure. [Source: `_bmad-output/planning-artifacts/epics.md`]
- Shared sync schemas live in `packages/shared/src/schemas/pos-sync.ts` and should remain the source of truth for contract alignment.

### Technical Requirements

- Do not expose `_ts` values casually for display-facing consumers.
- Keep route responses and shared Zod schemas aligned.
- Document any exception clearly.

### Architecture Compliance

- Shared contracts should stay aligned across apps/packages. [Source: `AGENTS.md#Repo-wide operating principles`]
- Missing validation or contract drift at sync/API boundaries is a review issue. [Source: `AGENTS.md#Contracts and validation`]

### Library / Framework Requirements

- Update shared Zod contracts before or together with route response changes.

### File Structure Requirements

- Likely files:
  - `packages/shared/src/schemas/pos-sync.ts`
  - `apps/api/src/routes/sync/push.ts`
  - affected reservation/route response mappers if exposed
- Likely tests:
  - `apps/api/src/routes/sync/push.test.ts`
  - any contract-focused tests for affected routes

### Testing Requirements

- Verify omitted fields are absent where expected.
- Verify documented exceptions remain tested.

### Previous Story Intelligence

- This story should follow Stories 17.1–17.4 so the contract reflects settled semantics rather than speculative field meanings.

### Project Structure Notes

- Contract cleanup should be narrow and intentional; avoid breaking payload compatibility without an explicit documented decision.

### References

- `_bmad-output/planning-artifacts/epics.md#Story 17.5: Prevent unintended _ts exposure in public contracts`
- `packages/shared/src/schemas/pos-sync.ts`
- `apps/api/src/routes/sync/push.ts`

## Dev Agent Record

### Agent Model Used

openai/gpt-5.4

### Debug Log References

- Story created from Epic 17 contract-boundary requirements.

### Completion Notes List

- Pending implementation.

### File List

- `packages/shared/src/schemas/pos-sync.ts`
- `apps/api/src/routes/sync/push.ts`
