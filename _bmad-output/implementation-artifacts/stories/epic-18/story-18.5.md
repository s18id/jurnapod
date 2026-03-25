# Story 18.5: Refresh schema baselines and documentation

Status: done

## Story

As a developer,
I want schema artifacts and docs aligned with the cleaned-up schema,
so that contributors and future migrations reflect the intended post-ADR state.

## Acceptance Criteria

1. Current-schema references no longer list the dropped columns after rollout completes.
2. Historical migrations remain unchanged.
3. Completion notes capture touched files, tests run, and migration evidence.

## Tasks / Subtasks

- [ ] Task 1: Refresh baseline schema artifacts (AC: 1, 2)
  - [ ] Subtask 1.1: Update `packages/db/0000_version_1.sql`.
  - [ ] Subtask 1.2: Update `packages/db/migrations/archive/0000_version_1.sql` if present/applicable.
- [ ] Task 2: Refresh schema/docs references (AC: 1)
  - [ ] Subtask 2.1: Update `docs/db/schema.md` and any ADR-linked implementation notes.
  - [ ] Subtask 2.2: Ensure dropped columns are not shown as current schema.
- [ ] Task 3: Capture rollout evidence (AC: 3)
  - [ ] Subtask 3.1: Record migration, grep, and test evidence in completion notes.

## Dev Notes

### Developer Context

- Story 18.5 is intentionally last: baseline/docs should only be refreshed once code, tests, and migration are settled. [Source: `_bmad-output/implementation-artifacts/adr-0001-ts-rollout-plan.md`]
- The dependency audit already flagged `packages/db/0000_version_1.sql` and docs as follow-up artifacts. [Source: `_bmad-output/implementation-artifacts/adr-0001-ts-dependency-audit-checklist.md`]

### Technical Requirements

- Historical migrations remain unchanged.
- Current-schema references must match the post-migration intended state.
- Completion evidence should make future review easy.

### Architecture Compliance

- Documentation must not reintroduce ambiguity about retained vs removed `_ts` fields.

### File Structure Requirements

- Likely files:
  - `packages/db/0000_version_1.sql`
  - `packages/db/migrations/archive/0000_version_1.sql`
  - `docs/db/schema.md`
  - story completion notes under `_bmad-output/implementation-artifacts/stories/epic-18/`

### Testing Requirements

- No primary implementation tests here, but documentation should reference the completed validation evidence from Story 18.4.

### Previous Story Intelligence

- Depends on Stories 18.1–18.4; do not update baseline/docs early.

### Project Structure Notes

- Keep historical record intact while making the current state clear.

### References

- `_bmad-output/planning-artifacts/epics.md#Story 18.5: Refresh schema baselines and documentation`
- `_bmad-output/implementation-artifacts/adr-0001-ts-rollout-plan.md`
- `_bmad-output/implementation-artifacts/adr-0001-ts-dependency-audit-checklist.md`

## Dev Agent Record

### Agent Model Used

openai/gpt-5.4

### Debug Log References

- Story created from ADR-0001 rollout finalization requirements.

### Completion Notes List

- Updated current schema artifacts to reflect the post-drop state.
- Confirmed historical migrations remain unchanged while archive baseline/docs now match the intended schema.
- Recorded validation evidence from Stories 18.3b and 18.4.

### File List

- `packages/db/0000_version_1.sql`
- `packages/db/migrations/archive/0000_version_1.sql`
- `docs/db/schema.md`
