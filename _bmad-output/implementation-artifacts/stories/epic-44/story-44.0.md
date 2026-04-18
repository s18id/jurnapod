# Story 44.0: Numbering Reset Verification & Closeout

**Status:** planned
**Priority:** P1

## Story

As a **platform engineer**,
I want **to verify numbering reset support and SALES_CUSTOMER template baseline already in runtime**,
So that **Epic 44 can proceed without duplicate implementation or numbering regressions**.

## Context

Epic 44 planning originally treated reset support and SALES_CUSTOMER seed as missing. Current runtime indicates the capability already exists (WEEKLY/DAILY reset handling and numbering tests). This story is now a verification/closeout checkpoint that captures evidence and locks assumptions before dependent stories (44.1+).

## Acceptance Criteria

**AC1: Reset period baseline verified**
**Given** the current runtime numbering logic
**When** engineer reviews `RESET_PERIODS` and `needsReset()` behavior
**Then** WEEKLY and DAILY support is confirmed with no missing implementation gaps.

**AC2: SALES_CUSTOMER numbering baseline verified**
**Given** numbering template initialization logic and seed/migration state
**When** engineer validates template behavior
**Then** SALES_CUSTOMER pattern `CUST/{{yyyy}}/{{seq4}}` with yearly reset is present/available in canonical path.

**AC3: Regression tests validated**
**Given** existing unit/integration tests for numbering reset behavior
**When** tests are executed
**Then** baseline passes and no new implementation work is required.

**AC4: Evidence captured in story completion notes**
**Given** this story acts as a verification gate
**When** the story is completed
**Then** completion notes include concrete evidence (files reviewed, commands run, outcomes).

## Technical Details

### Evidence Targets (No Net-New Build Scope)

| File | Verification focus |
|------|--------------------|
| `apps/api/src/lib/numbering.ts` | RESET_PERIODS values and `needsReset()` behavior |
| `apps/api/__test__/unit/numbering/numbering-reset.test.ts` | WEEKLY/DAILY reset regression coverage |
| `packages/db` numbering template seed/migration path | SALES_CUSTOMER template baseline availability |

## Test Coverage Criteria

- [x] WEEKLY reset behavior verified by existing tests
- [x] DAILY reset behavior verified by existing tests
- [x] Existing YEARLY/MONTHLY behavior unaffected
- [x] SALES_CUSTOMER template behavior verified

## Tasks / Subtasks

- [ ] Verify numbering runtime behavior in canonical files
- [ ] Run/confirm numbering unit tests
- [ ] Verify SALES_CUSTOMER template baseline in seed/migration flow
- [ ] Capture evidence in completion notes
- [ ] Mark story as done (verification closeout)

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `story-44.0.completion.md` | Create/Modify | Capture verification evidence and signoff |

## Estimated Effort

1 hour

## Risk Level

Low — verification-only scope; primary risk is false assumptions if evidence is incomplete.

## Dev Notes

- Do not re-implement reset logic unless a validated gap is found.
- If a gap is discovered, open a scoped follow-up task instead of expanding this story.

## Validation Evidence

```bash
npm run test:unit -w @jurnapod/api -- numbering-reset
```

## Dependencies

None (verification gate).

## Technical Debt Review

- [ ] No duplicate implementation introduced
- [ ] No `TODO`/`FIXME` comments left in production code
- [ ] Evidence recorded for future traceability

## ADR References

- [ADR-0020: Numbering System](../../../../docs/adr/adr-0020-numbering-system.md)
