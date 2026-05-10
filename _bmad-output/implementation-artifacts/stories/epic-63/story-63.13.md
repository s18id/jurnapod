# Story 63-13: Full validation gate

Status: ready-for-dev

> **Sprint-Status Append-Only Rule (E45-A1 / E46-A1) -- MANDATORY:**
> If this story modifies `_bmad-output/implementation-artifacts/sprint-status.yaml`:
> - **REQUIRED**: Run `npx tsx scripts/update-sprint-status.ts --epic 63 --story 63-13 --status done` (the canonical utility)
> - **REQUIRED**: After editing, run `npx tsx scripts/validate-sprint-status.ts` to confirm file integrity
> - **NEVER** replace the entire file -- always append only
> - **NEVER** use `replaceAll` on epic section markers
> - If accidentally overwritten: `git checkout HEAD -- _bmad-output/implementation-artifacts/sprint-status.yaml`
> - **Retrospective workflow will check this before closing the epic** (E46-A4)

## Story

As a **developer**,  
I want **all quality gates to pass after all story changes**,  
So that **Epic 63 is proven complete with zero regressions**.

## Context

This is the final validation gate for Epic 63. All previous stories must be complete before this gate can be run. The gate verifies that the epic's exit criteria are met: zero test stubs, all raw SQL replaced, 3x consecutive green suites, and `lint:fixture-flow` passing.

**Gates to pass:**
1. `npm run lint -w @jurnapod/api` --> 0 errors
2. `npm run typecheck -w @jurnapod/api` --> pass
3. `npm run build` (all modified packages: accounting, sales, purchasing, treasury) --> pass
4. Full test suite --> 3 consecutive green runs
5. `npm run lint:fixture-flow` --> 0 violations
6. SOLID/DRY/KISS scoring sheet completed with evidence
7. Adversarial review (@bmad-review agent) on entire changeset --> GO
8. No unresolved P0/P1 in epic scope

---

## Test Scenario Review Checkpoint (MANDATORY -- E54-A1)

### Pre-Implementation Checklist

- [x] **Happy paths identified:** All gates pass on first attempt
- [x] **Error paths identified:** Gate fails, requires remediation
- [x] **Edge cases identified:** Flaky tests, environment-specific failures
- [x] **Test fixture needs identified:** None -- this is validation
- [x] **Integration test scope defined:** Full suite
- [x] **Negative auth test role selected:** N/A -- validation gate

### Review Outcome

| Scenario | Type | Coverage Plan |
|----------|------|--------------|
| All gates pass | Happy | Validation |
| Gate failure requiring remediation | Error | Validation |
| 3x consecutive green runs | Happy | Validation |
| Adversarial review GO | Happy | Validation |

**Sign-off:** Test scenarios reviewed and approved before implementation begins.

---

## Cross-Module Error Boundary Verification (MANDATORY -- E58-A1)

N/A -- no implementation changes in this story.

---

## Cross-Module Decision Gate (MANDATORY -- E54-A1 Follow-Up)

### Pre-Implementation Checklist

- [x] **Modules touched:** All modules modified in Epic 63
- [x] **Cross-module decisions identified:** None -- this is validation
- [x] **Winston sign-off obtained:** Not required for validation
- [x] **Decisions recorded:** N/A

### Decision Record

| # | Decision | Modules Affected | Rationale | Alternatives Considered | Winston Sign-Off |
|---|----------|-----------------|-----------|------------------------|-----------------|
| 1 | No cross-module decisions | N/A | Validation gate only | N/A | N/A |

---

## API Contract Verification (MANDATORY for UI Stories)

N/A -- no UI changes.

---

## Acceptance Criteria

**AC1: All lint gates pass**
**Given** the modified codebase
**When** `npm run lint -w @jurnapod/api` is executed
**Then** it exits 0 with 0 errors

**AC2: All typecheck gates pass**
**Given** the modified codebase
**When** `npm run typecheck -w @jurnapod/api` is executed
**Then** it exits 0 with no errors

**AC3: All package builds pass**
**Given** the modified packages
**When** `npm run build` is executed for each
**Then** all builds pass without errors

**AC4: Full test suite passes 3x consecutively**
**Given** the full test suite
**When** executed three times in succession
**Then** all three runs pass with identical results

**AC5: lint:fixture-flow exits 0**
**Given** the fixture flow linter
**When** `npm run lint:fixture-flow` is executed
**Then** it exits 0 with 0 violations

**AC6: SOLID/DRY/KISS scorecard completed**
**Given** the epic changeset
**When** scored
**Then** the SOLID/DRY/KISS scorecard is completed with evidence

**AC7: Adversarial review verdict: GO**
**Given** the entire changeset
**When** reviewed by @bmad-review agent
**Then** the verdict is GO with no unresolved P0/P1 items

**AC8: No unresolved P0/P1 items**
**Given** the epic scope
**When** audited
**Then** zero unresolved P0/P1 items remain

## Test Coverage Criteria

- [ ] Coverage target: All paths in full test suite
- [ ] Happy paths to test:
  - [ ] All gates pass
- [ ] Error paths to test:
  - [ ] Gate failure remediation

## Test Fixtures

N/A -- this is a validation gate story.

## Tasks / Subtasks

- [ ] Wait for ALL previous stories (63-1 through 63-12) to be complete
- [ ] Run `npm run lint -w @jurnapod/api`
- [ ] Run `npm run typecheck -w @jurnapod/api`
- [ ] Run `npm run build` for all modified packages
- [ ] Run full test suite (run 1)
- [ ] Run full test suite (run 2)
- [ ] Run full test suite (run 3)
- [ ] Run `npm run lint:fixture-flow`
- [ ] Complete SOLID/DRY/KISS scorecard
- [ ] Request adversarial review from @bmad-review agent
- [ ] Address any review findings
- [ ] Verify no unresolved P0/P1 items

## Files to Create

| File | Description |
|------|-------------|
| `epic-63.completion.md` | Epic completion report with all gate evidence |

## Files to Modify

None.

## Estimated Effort

1 day (may extend if remediation needed)

## Risk Level

High (P0 -- gate story, epic cannot close without it)

## Dev Notes

- **CRITICAL:** This story MUST NOT start until ALL previous stories are complete.
- The 3x consecutive green runs requirement means exactly that -- three separate executions of the full suite, not one execution with three reporters
- If any gate fails, the failure must be remediated before the epic can close
- SOLID/DRY/KISS scoring follows the S48-61 architecture program baseline:
  - Kickoff Gate: score each principle (Unknown/Pass/Fail)
  - Pre-Close Gate: rescore with evidence
  - Any failed item must be tracked as explicit sprint work with severity
- Adversarial review must be requested from @bmad-review agent with the full changeset
- If review finds P0/P1 issues, they must be resolved or explicitly accepted by the user

## Cross-Cutting Concerns

### Audit Integration
- [ ] Audit events required? No

### Idempotency
- [ ] Idempotency key field: N/A

### Feature Flags
- [ ] Feature flag required? No

### Validation Rules
- [ ] `company_id` must match authenticated company: N/A

### Error Handling
- [ ] Retryable errors: N/A
- [ ] Non-retryable errors: N/A

### Health Check
- [ ] Health check required? No

## File List

- `epic-63.completion.md` (new)

## Validation Evidence

```bash
# Gate 1: Lint
npm run lint -w @jurnapod/api

# Gate 2: Typecheck
npm run typecheck -w @jurnapod/api

# Gate 3: Build all modified packages
npm run build -w @jurnapod/modules-accounting
npm run build -w @jurnapod/modules-sales
npm run build -w @jurnapod/modules-purchasing
npm run build -w @jurnapod/modules-treasury

# Gate 4: 3x consecutive green runs
npm test -w @jurnapod/api -- --run  # Run 1
npm test -w @jurnapod/api -- --run  # Run 2
npm test -w @jurnapod/api -- --run  # Run 3

# Gate 5: Fixture flow
npm run lint:fixture-flow -w @jurnapod/api

# Gate 6: Sprint status validation
npx tsx scripts/validate-sprint-status.ts
```

## Dependencies

- **ALL previous stories (63-1 through 63-12)** -- MUST be complete

## Shared Contract Changes (MANDATORY for Constants/Types)

N/A -- no contract changes.

## Technical Debt Review

- [x] No shortcuts taken that require follow-up
- [x] No `TODO`/`FIXME` comments left in production code without a linked TD item
- [x] No `as any` casts added without justification and TD item
- [x] No deprecated functions used without a migration plan
- [x] No N+1 query patterns introduced
- [x] No in-memory state introduced that won't survive restarts or multi-instance deployment
- [x] Integration tests included in this story's AC (not deferred)
- [x] All new debt items added to registry before story closes

## Notes

This is the final gate story. It does not involve implementation work unless gates fail. If gates fail:
1. Document the failure
2. Create a remediation story (or use existing story if applicable)
3. Do NOT close Epic 63 until all gates pass

The epic completion report (`epic-63.completion.md`) must include evidence for all 8 ACs with command output or screenshots.
