# Story 63-1: Fix sync-modules lifecycle mock -> real integration test

Status: ready-for-dev

> **Sprint-Status Append-Only Rule (E45-A1 / E46-A1) -- MANDATORY:**
> If this story modifies `_bmad-output/implementation-artifacts/sprint-status.yaml`:
> - **REQUIRED**: Run `npx tsx scripts/update-sprint-status.ts --epic 63 --story 63-1 --status done` (the canonical utility)
> - **REQUIRED**: After editing, run `npx tsx scripts/validate-sprint-status.ts` to confirm file integrity
> - **NEVER** replace the entire file -- always append only
> - **NEVER** use `replaceAll` on epic section markers
> - If accidentally overwritten: `git checkout HEAD -- _bmad-output/implementation-artifacts/sprint-status.yaml`
> - **Retrospective workflow will check this before closing the epic** (E46-A4)

## Story

As a **developer**,  
I want **the sync-modules lifecycle test to use real DB and real sync packages**,  
So that **contract drift between mocked and real sync packages is caught at test time**.

## Context

The file `apps/api/__test__/unit/sync/sync-modules.lifecycle.test.ts` currently uses `vi.mock('../../../src/lib/db')` to return `{ mocked: true }` and replaces all 3 sync packages with in-test fake classes. This creates a false sense of security -- the test validates behavior of mock objects, not the real production code. When the real sync packages change their behavior (e.g., initialization order, connection handling, cleanup logic), the test will still pass because it's testing fakes.

This violates FR1 (no test stubs of internal production code) and FR2 (integration tests must use real DB and canonical fixtures).

The fix is to:
1. Move the test from `__test__/unit/` to `__test__/integration/`
2. Remove all `vi.mock()` calls for `getDbPool`, `@jurnapod/sync-core`, `@jurnapod/pos-sync`, `@jurnapod/backoffice-sync`
3. Use the real DB pool and real sync package imports
4. Test lazy init, concurrent calls, and cleanup lifecycle against real production infrastructure
5. Update the test to use the `beforeAll seedCtx` caching pattern per project conventions

---

## Test Scenario Review Checkpoint (MANDATORY -- E54-A1)

### Pre-Implementation Checklist

- [ ] **Happy paths identified:** Lazy init on first access, concurrent init deduplication, cleanup on test teardown
- [ ] **Error paths identified:** Connection failure during init, double-cleanup safety
- [ ] **Edge cases identified:** Concurrent access during initialization, cleanup when module never initialized
- [ ] **Test fixture needs identified:** Real DB pool, seed context with company/outlet
- [ ] **Integration test scope defined:** Full integration test with real DB and real sync packages
- [ ] **Negative auth test role selected:** N/A -- this is infrastructure test, not auth-gated

### Review Outcome

| Scenario | Type | Coverage Plan |
|----------|------|--------------|
| Lazy init on first access | Happy | Integration |
| Concurrent calls deduplicate init | Edge | Integration |
| Cleanup lifecycle | Happy | Integration |
| Connection failure handling | Error | Integration |

**Sign-off:** Test scenarios reviewed and approved before implementation begins.

---

## Cross-Module Error Boundary Verification (MANDATORY -- E58-A1)

### Pre-Implementation Checklist

- [ ] Producer error classes are enumerated for this story.
- [ ] Consumer catch paths validate `instanceof` checks for each producer error class.
- [ ] Consumer catch paths include `error.name` fallback handling for cross-package boundary mismatches.
- [ ] Error response mapping is deterministic across `instanceof` and `error.name` detection paths.
- [ ] Any missing fallback path is recorded and blocked before implementation starts.

### Error Boundary Test Matrix

| Error Class | Source Package | Consumer Package | instanceof Works | error.name Fallback |
|-------------|----------------|------------------|------------------|---------------------|
| N/A | N/A | N/A | N/A | N/A |

**Hard gate:** This story is infrastructure refactoring -- no cross-module error boundary changes.

---

## Cross-Module Decision Gate (MANDATORY -- E54-A1 Follow-Up)

### Pre-Implementation Checklist

- [ ] **Modules touched:** `apps/api`, `@jurnapod/sync-core`, `@jurnapod/pos-sync`, `@jurnapod/backoffice-sync`
- [ ] **Cross-module decisions identified:** None -- this story removes abstraction layers, does not add them
- [ ] **Winston sign-off obtained:** Not required for test-only refactoring with no API contract changes
- [ ] **Decisions recorded:** N/A

### Decision Record

| # | Decision | Modules Affected | Rationale | Alternatives Considered | Winston Sign-Off |
|---|----------|-----------------|-----------|------------------------|-----------------|
| 1 | No cross-module decisions required | N/A | Test-only refactoring, no API changes | N/A | N/A |

**Hard gate:** N/A for this story.

---

## API Contract Verification (MANDATORY for UI Stories)

N/A -- this is an infrastructure/test story with no UI or API changes.

---

## Acceptance Criteria

**AC1: Test uses real getDbPool()**
**Given** the sync-modules lifecycle test file
**When** executed
**Then** it calls the real `getDbPool()` function (not a mock returning `{ mocked: true }`)

**AC2: Test uses real sync package classes**
**Given** the sync-modules lifecycle test file
**When** executed
**Then** it uses real `PosSyncModule`, `BackofficeSyncModule`, and `sync-core` registry (not fake classes)

**AC3: Lifecycle functions tested against real infrastructure**
**Given** the sync-modules lifecycle test file
**When** testing lazy init, concurrent access, and cleanup
**Then** all assertions pass against real production infrastructure

**AC4: No vi.mock() calls remain**
**Given** the sync-modules lifecycle test file
**When** inspected
**Then** zero `vi.mock()` calls remain in the file

**AC5: Test directory correct**
**Given** the project test structure
**When** the story is complete
**Then** the test file exists at `apps/api/__test__/integration/sync/sync-modules.lifecycle.test.ts`

## Test Coverage Criteria

- [ ] Coverage target: All paths
- [ ] Happy paths to test:
  - [ ] Lazy initialization on first module access
  - [ ] Concurrent access to same module deduplicates init
  - [ ] Cleanup lifecycle properly releases resources
- [ ] Error paths to test:
  - [ ] Connection failure during module initialization
  - [ ] Double-cleanup is safe (idempotent)

## Test Fixtures

### Pre-Implementation Checklist
- [x] New patterns identified: Real DB pool access, real sync module initialization
- [x] Existing canonical fixtures reviewed: `getSeedSyncContext` pattern from `beforeAll` caching
- [x] Fixture location: Use existing `apps/api/src/lib/test-fixtures.ts` for seed context

### Fixture Creation/Update
- [ ] **New fixtures needed:** None -- uses real production code directly
- [ ] **Existing fixtures to update:** None

### Test File Audit (Post-Implementation -- MANDATORY)
- [x] All new tests use canonical fixtures (not ad-hoc raw SQL INSERT/UPDATE)
- [x] Existing tests audited against new canonical patterns
- [x] Test files requiring fixture updates identified: N/A
- [x] All identified test files updated to use canonical fixtures

## Tasks / Subtasks

- [ ] Read current `apps/api/__test__/unit/sync/sync-modules.lifecycle.test.ts`
- [ ] Identify all `vi.mock()` calls and their purposes
- [ ] Create new file at `apps/api/__test__/integration/sync/sync-modules.lifecycle.test.ts`
- [ ] Remove all `vi.mock()` calls
- [ ] Import real `getDbPool`, `PosSyncModule`, `BackofficeSyncModule`, `sync-core` registry
- [ ] Rewrite test assertions to exercise real production code
- [ ] Use `beforeAll seedCtx` caching pattern
- [ ] Ensure DB pool cleanup in `afterAll`
- [ ] Delete old file at `apps/api/__test__/unit/sync/sync-modules.lifecycle.test.ts`
- [ ] Run test suite and verify all assertions pass

## Files to Create

| File | Description |
|------|-------------|
| `apps/api/__test__/integration/sync/sync-modules.lifecycle.test.ts` | New integration test using real sync packages |

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `apps/api/__test__/unit/sync/sync-modules.lifecycle.test.ts` | Delete | Replaced by integration version |

## Estimated Effort

1 day

## Risk Level

High (P0 -- changes test infrastructure, must not break CI)

## Dev Notes

- Use the `beforeAll seedCtx` caching pattern:
  ```typescript
  import { getSeedSyncContext as loadSeedSyncContext } from '../../../fixtures';
  let seedCtx: Awaited<ReturnType<typeof loadSeedSyncContext>>;
  const getSeedSyncContext = async () => seedCtx;
  beforeAll(async () => { seedCtx = await loadSeedSyncContext(); });
  ```
- Ensure `afterAll` calls `resetFixtureRegistry()` to clean up
- The sync module lifecycle may require database connectivity -- ensure test DB is seeded
- If any real sync module requires environment variables, check `.env` setup in test environment

## Cross-Cutting Concerns

### Audit Integration
- [ ] Audit events required? No

### Idempotency
- [ ] Idempotency key field: N/A

### Feature Flags
- [ ] Feature flag required? No

### Validation Rules
- [ ] `company_id` must match authenticated company: N/A -- infrastructure test

### Error Handling
- [ ] Retryable errors: N/A
- [ ] Non-retryable errors: N/A

### Health Check
- [ ] Health check required? No

## File List

- `apps/api/__test__/integration/sync/sync-modules.lifecycle.test.ts` (new)
- `apps/api/__test__/unit/sync/sync-modules.lifecycle.test.ts` (delete)

## Validation Evidence

```bash
# Verify test passes with real infrastructure
npm test -w @jurnapod/api -- --run apps/api/__test__/integration/sync/sync-modules.lifecycle.test.ts

# Verify no vi.mock remains in the new file
grep -n "vi.mock" apps/api/__test__/integration/sync/sync-modules.lifecycle.test.ts || echo "PASS: no vi.mock found"

# Verify old file is gone
ls apps/api/__test__/unit/sync/sync-modules.lifecycle.test.ts 2>&1 || echo "PASS: old file removed"
```

## Dependencies

- None -- this is a parallel Batch 1 story

## Shared Contract Changes (MANDATORY for Constants/Types)

N/A -- no shared contract changes.

## Technical Debt Review

Complete before marking story done. If any box is checked, add a TD item to [TECHNICAL-DEBT.md](../adr/TECHNICAL-DEBT.md) before closing.

- [x] No shortcuts taken that require follow-up
- [x] No `TODO`/`FIXME` comments left in production code without a linked TD item
- [x] No `as any` casts added without justification and TD item
- [x] No deprecated functions used without a migration plan
- [x] No N+1 query patterns introduced
- [x] No in-memory state introduced that won't survive restarts or multi-instance deployment
- [x] Integration tests included in this story's AC (not deferred)
- [x] All new debt items added to registry before story closes

## Notes

This is a foundational P0 story. All other integration tests depend on the sync modules working correctly. If this test reveals real bugs in the sync module lifecycle, those bugs must be fixed as part of this story (not deferred). The "mock-to-real" transition is the primary value -- we want to discover any real issues now, not in production.
