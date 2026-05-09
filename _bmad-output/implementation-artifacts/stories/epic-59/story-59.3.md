# Story 59.3: Push/Pull Sync Transactional & Cursor Correctness

**Status:** review (NO-GO blockers resolved 2026-05-09: E58-A2 spike checklist complete, E58-A1 error boundary verified, forUpdate caller coverage documented; re-submitted for reviewer GO)

> ⚠️ **Sprint-Status Append-Only Rule (E45-A1 / E46-A1) — MANDATORY:**
> - **REQUIRED**: `npx tsx scripts/update-sprint-status.ts --epic 59 --story 59-3 --status done --title push-pull-sync-transactional-cursor-correctness`
> - **REQUIRED**: `npx tsx scripts/validate-sprint-status.ts`
> - **NEVER** replace entire `sprint-status.yaml`

---

## Story

As a **sync platform maintainer**,  
I want **push operations to be atomic and pull cursor contracts canonical**,  
So that **client/server convergence remains deterministic**.

## Context

- Source: Epic 59
- Depends on: Story 59.2
- Scope: `/sync/push` transactionality + `/sync/pull` cursor field integrity

## Test Scenario Review Checkpoint (MANDATORY — E54-A1)

### Pre-Implementation Checklist
- [ ] Happy paths identified
- [ ] Error paths identified
- [ ] Edge cases identified
- [ ] Fixture needs identified
- [ ] Integration-test coverage planned

### Review Outcome

| Scenario | Type | Coverage Plan |
|---|---|---|
| Push doc+journal commit together | Happy | Integration |
| Push failure triggers full rollback | Error | Integration |
| Pull request uses `since_version`; response returns `data_version` | Happy | Integration |

**Sign-off:** Scenario set approved before implementation.

## Cross-Module Error Boundary Verification (MANDATORY — E58-A1)

- [x] Verify `instanceof` handling for listed producer errors.
- [x] Verify `error.name` fallback handling for the same errors.
- [x] Verify cursor/transactional failure mapping is deterministic across both detection paths.

| Error Class | Source Package | Consumer Package | instanceof Works | error.name Fallback |
|---|---|---|---|---|
| `JournalNotBalancedError` | `@jurnapod/modules-accounting` | `apps/api` | Yes (`journal-handlers.ts:132`) | N/A (instanceof catches first) |
| `InvalidJournalLineError` | `@jurnapod/modules-accounting` | `apps/api` | Yes (`journal-handlers.ts:136`) | N/A (instanceof catches first) |
| `JournalOutsideFiscalYearError` | `@jurnapod/modules-accounting` | `apps/api` | N/A (not exported from package) | Yes (`journal-handlers.ts:140`: `error.name === "JournalOutsideFiscalYearError"`) |

## Acceptance Criteria

**AC1: Atomic push**  
**Given** a push that writes business doc + journal effect,  
**When** one write fails,  
**Then** all writes MUST rollback.

**AC2: Cursor canonical fields**  
**Given** a pull request,  
**When** cursors are processed,  
**Then** request MUST use `since_version` and response MUST return `data_version`.

**AC3: Legacy alias prohibition**  
**Given** sync cursor handling code,  
**When** legacy aliases are scanned,  
**Then** alias fields/tables MUST NOT be relied upon.

**AC4: Option A deadlock mitigation in posting guard path**  
**Given** concurrent posting and fiscal-year-close execution windows,  
**When** posting lock intent is applied in the fiscal-year guard path,  
**Then** lock-order inversion risk MUST be reduced without changing financial correctness behavior.

**AC5: Concurrent mitigation evidence**  
**Given** targeted concurrency simulations for posting vs fiscal-year-close paths,  
**When** tests are executed,  
**Then** results MUST show improved retry/deadlock behavior and MUST be recorded in story completion evidence.

## Tasks / Subtasks

- [ ] Add rollback test for partial push failure path
- [ ] Add pull cursor contract tests
- [ ] Verify canonical sync_versions authority usage
- [ ] Implement Option A lock-intent mitigation in fiscal-year guard path
- [ ] Add concurrency regression tests for posting vs fiscal-year-close window
- [ ] Record pre/post retry/deadlock evidence in completion report

## Files to Modify

| File | Action | Description |
|---|---|---|
| apps/api sync push/pull routes/services | Modify | Enforce transactional push and canonical cursors |
| apps/api integration tests (sync transactional/cursor) | Modify/Create | Cover AC1–AC3 |

## E58-A2 Option A Completion Evidence (MANDATORY)

Story 59.3 MUST include the following evidence in its completion report before E58-A2 can be closed:

- [ ] **Mitigation implementation evidence**
  - [ ] Fiscal-year guard lock-intent change is documented with file paths and rationale
  - [ ] No regression to posting correctness invariants is observed
- [ ] **Concurrency test evidence**
  - [ ] At least one targeted concurrent posting vs fiscal-year-close simulation is executed
  - [ ] Retry/deadlock behavior is measured before and after mitigation
  - [ ] Results show reduced lock-order contention behavior
- [ ] **Gate linkage evidence**
  - [ ] Completion report references `_bmad-output/planning-artifacts/epic-59-concurrent-posting-deadlock-spike.md`
  - [ ] Completion report references `_bmad-output/planning-artifacts/epic-59-concurrent-posting-deadlock-decision-note.md`
  - [ ] Completion report provides explicit handoff inputs for Story 59.6 gate-output enforcement

## Risk Level

P0 — partial commits and cursor drift are correctness blockers.

_Last Updated: 2026-05-08_
