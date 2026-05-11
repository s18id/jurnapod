# Story 64.9: Full validation gate

Status: ready-for-dev

> ⚠️ **Sprint-Status Append-Only Rule (E45-A1 / E46-A1) — MANDATORY:**
> If this story modifies `_bmad-output/implementation-artifacts/sprint-status.yaml`:
> - **REQUIRED**: Run `npx tsx scripts/update-sprint-status.ts --epic 64 --story 64-9 --status done` (the canonical utility)
> - **REQUIRED**: After editing, run `npx tsx scripts/validate-sprint-status.ts` to confirm file integrity
> - **NEVER** replace the entire file — always append only
> - **NEVER** use `replaceAll` on epic section markers
> - If accidentally overwritten: `git checkout HEAD -- _bmad-output/implementation-artifacts/sprint-status.yaml`
> - **Retrospective workflow will check this before closing the epic** (E46-A4)

## Story

As a **scrum master / tech lead**,  
I want **all validation gates to pass after Epic 64 stories are complete**,  
So that **the epic meets the definition of done and can be closed**.

## Context

This is the final gate story for Epic 64. It depends on ALL preceding stories (64.1–64.8) being complete. It runs the full validation suite to ensure:
1. No inline SQL aggregation remains in test verification paths
2. All production services are properly exported
3. All tests pass
4. Code quality gates pass
5. SOLID/DRY/KISS score passes

**Predecessor:** Stories 64.1, 64.2, 64.3, 64.4, 64.5, 64.6, 64.7, 64.8
**Dependencies:** ALL stories must be complete before this gate runs.

---

## Test Scenario Review Checkpoint (MANDATORY — E54-A1)

### Pre-Implementation Checklist

- [ ] **Happy paths identified:** All gates pass
- [ ] **Error paths identified:** Gate failures → fix and re-run
- [ ] **Edge cases identified:** N/A
- [ ] **Test fixture needs identified:** N/A
- [ ] **Integration test scope defined:** N/A — this is a validation gate
- [ ] **Negative auth test role selected:** N/A

### Review Outcome

| Scenario | Type | Coverage Plan |
|----------|------|--------------|
| All validation gates pass | Happy | Manual/Script |
| Gate failure → fix → re-run | Error | Manual/Script |

**Sign-off:** Test scenarios reviewed and approved before implementation begins.

---

## Cross-Module Error Boundary Verification (MANDATORY — E58-A1)

N/A — validation gate story.

---

## Cross-Module Decision Gate (MANDATORY — E54-A1 Follow-Up)

N/A — validation gate story.

---

## Acceptance Criteria

**AC1: Inline SQL elimination gate**
**Given** the entire `__test__/` directory tree
**When** `grep -rE 'COALESCE\(SUM|SUM\(.*debit|SUM\(.*credit' apps/api/__test__/ packages/modules/*/__test__/ --include='*.test.ts'` is run
**Then** zero matches are found in test verification paths

**AC2: Build gate**
**Given** all modified packages
**When** `npm run build -w @jurnapod/modules-accounting && npm run build -w @jurnapod/modules-treasury && npm run build -w @jurnapod/modules-purchasing && npm run build -w @jurnapod/modules-inventory-costing && npm run build -w @jurnapod/api` is run
**Then** all builds succeed with zero errors

**AC3: Test gate**
**Given** all modified tests
**When** `npm run test:integration -w @jurnapod/api` and `npm run test:integration -w @jurnapod/modules-accounting` are run
**Then** all tests pass

**AC4: Lint gate**
**Given** the codebase
**When** `npm run lint -w @jurnapod/api` and `npm run lint:migrations` are run
**Then** zero errors (warnings acceptable)

**AC5: Typecheck gate**
**Given** the codebase
**When** `npm run typecheck -w @jurnapod/api` is run
**Then** zero errors

**AC6: Fixture flow gate**
**Given** the codebase
**When** `npm run lint:fixture-flow -w @jurnapod/api` is run
**Then** zero violations

**AC7: SOLID/DRY/KISS gate**
**Given** the epic scope
**When** the SOLID/DRY/KISS checklist is applied
**Then** all items score Pass (no Fail)

## Bulk Migration AC Rule (MANDATORY for Cross-Cutting Refactors)

N/A — gate story.

## Test Coverage Criteria

- [ ] Coverage target: N/A — validation gate
- [ ] Happy paths to test:
  - [ ] All gates pass
- [ ] Error paths to test:
  - [ ] Any gate failure is documented and fixed

## Test Fixtures

N/A — gate story.

## Tasks / Subtasks

- [ ] Confirm all stories 64.1–64.8 are marked done
- [ ] Run inline SQL elimination check
- [ ] Run build for all modified packages
- [ ] Run integration tests for all modified packages
- [ ] Run lint
- [ ] Run typecheck
- [ ] Run fixture flow lint
- [ ] Run SOLID/DRY/KISS scoring
- [ ] Document any failures and create fix stories if needed
- [ ] Update sprint-status for this story

## Files to Create

| File | Description |
|------|-------------|
| None | No new files |

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| None | N/A | N/A |

## Estimated Effort

0.5 day

## Risk Level

Low

## Dev Notes

- This story MUST NOT begin until 64.1–64.8 are all marked done.
- If any gate fails, document the failure and decide:
  - Fix inline if small and within epic scope
  - Create follow-up story if large or out of scope
- SOLID/DRY/KISS scoring must be performed by a reviewer, not the implementing developer.

## Cross-Cutting Concerns

N/A — gate story.

## Validation Evidence

- All commands in AC1–AC7 pass
- `npx tsx scripts/validate-sprint-status.ts --epic 64` exits 0

## Dependencies

- Stories 64.1, 64.2, 64.3, 64.4, 64.5, 64.6, 64.7, 64.8 (ALL)

## Shared Contract Changes (MANDATORY for Constants/Types)

N/A — gate story.

## Technical Debt Review

- [ ] No shortcuts taken that require follow-up
- [ ] No `TODO`/`FIXME` comments left in production code without a linked TD item
- [ ] No `as any` casts added without justification and TD item
- [ ] No deprecated functions used without a migration plan
- [ ] No N+1 query patterns introduced
- [ ] No in-memory state introduced that won't survive restarts or multi-instance deployment
- [ ] Integration tests included in this story's AC (not deferred)
- [ ] All new debt items added to registry before story closes

## Notes

- This is the final gate. If all AC pass, the epic can be closed.
- If SOLID/DRY/KISS scores Fail, the epic cannot close per Architecture Program Baseline (S48–S61).
- Document all gate results in the epic completion report.
