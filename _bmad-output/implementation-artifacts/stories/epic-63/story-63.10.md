# Story 63-10: Replace 14 duplicate makeTag() in purchasing tests

Status: ready-for-dev

> **Sprint-Status Append-Only Rule (E45-A1 / E46-A1) -- MANDATORY:**
> If this story modifies `_bmad-output/implementation-artifacts/sprint-status.yaml`:
> - **REQUIRED**: Run `npx tsx scripts/update-sprint-status.ts --epic 63 --story 63-10 --status done` (the canonical utility)
> - **REQUIRED**: After editing, run `npx tsx scripts/validate-sprint-status.ts` to confirm file integrity
> - **NEVER** replace the entire file -- always append only
> - **NEVER** use `replaceAll` on epic section markers
> - If accidentally overwritten: `git checkout HEAD -- _bmad-output/implementation-artifacts/sprint-status.yaml`
> - **Retrospective workflow will check this before closing the epic** (E46-A4)

## Story

As a **developer**,  
I want **all purchasing test files to use the canonical makeTag from helpers/tags.ts**,  
So that **tag uniqueness is deterministic and no file-local counters create collisions**.

## Context

14 of 15 purchasing test files define their own `makeTag()` function with local counters instead of importing from the canonical `helpers/tags.ts`. This violates the determinism policy and creates uniqueness collisions when tests run concurrently or in different orders.

**Files to fix:** ALL files in `apps/api/__test__/integration/purchasing/` EXCEPT `ap-period-close-enforcement.test.ts` (which already uses canonical):
1. `goods-receipts.test.ts:22`
2. `purchase-credits.test.ts:23`
3. `document-chain.test.ts:43`
4. `ap-multicurrency-correctness.test.ts:36`
5. `ap-payments.test.ts:30`
6. `ap-state-machine.test.ts:71`
7. `ap-payment-correctness.test.ts:35`
8. `ap-invoice-correctness.test.ts:43`
9. `purchase-invoices.test.ts:27`
10. `supplier-statements.test.ts:28`
11. `ap-aging-report.test.ts:24`
12. `supplier-contacts.test.ts:20`
13. `suppliers.test.ts:20`
14. `suppliers-tenant-isolation.test.ts:24`
15. `supplier-soft-delete.regression.test.ts:19`

**Fix:** Replace all duplicate `makeTag` functions with `import { makeTag } from "../../helpers/tags"`. Remove explicit counter parameters (canonical helper has shared counter). Verify no tag collision failures.

---

## Test Scenario Review Checkpoint (MANDATORY -- E54-A1)

### Pre-Implementation Checklist

- [x] **Happy paths identified:** All 14 files import canonical makeTag, all tests pass
- [x] **Error paths identified:** Tag collision failures if shared counter not properly initialized
- [x] **Edge cases identified:** Concurrent test execution, tests running in different order
- [x] **Test fixture needs identified:** None -- using existing canonical helper
- [x] **Integration test scope defined:** All 14 files are integration tests
- [x] **Negative auth test role selected:** N/A -- DRY consolidation

### Review Outcome

| Scenario | Type | Coverage Plan |
|----------|------|--------------|
| Replace makeTag in 14 files | Happy | Integration |
| Verify no tag collisions | Edge | Integration |
| Full purchasing suite passes | Happy | Integration |

**Sign-off:** Test scenarios reviewed and approved before implementation begins.

---

## Cross-Module Error Boundary Verification (MANDATORY -- E58-A1)

N/A -- no error boundary changes.

---

## Cross-Module Decision Gate (MANDATORY -- E54-A1 Follow-Up)

### Pre-Implementation Checklist

- [x] **Modules touched:** `apps/api` (test files only)
- [x] **Cross-module decisions identified:** None
- [x] **Winston sign-off obtained:** Not required
- [x] **Decisions recorded:** N/A

### Decision Record

| # | Decision | Modules Affected | Rationale | Alternatives Considered | Winston Sign-Off |
|---|----------|-----------------|-----------|------------------------|-----------------|
| 1 | Import canonical makeTag instead of file-local copies | apps/api tests | DRY + determinism policy | Keep local copies (rejected: violates policy) | N/A |

---

## API Contract Verification (MANDATORY for UI Stories)

N/A -- no UI changes.

---

## Acceptance Criteria

**AC1: All 14 files import makeTag from ../../helpers/tags**
**Given** the 14 purchasing test files
**When** inspected
**Then** each file imports `makeTag` from `"../../helpers/tags"`

**AC2: No file-local makeTag function definitions**
**Given** the 14 purchasing test files
**When** inspected
**Then** zero file-local `function makeTag` definitions remain

**AC3: No test failures from tag collisions**
**Given** the purchasing test suite
**When** executed
**Then** zero tag collision failures occur

**AC4: All purchasing integration tests pass**
**Given** the purchasing test suite
**When** executed
**Then** all purchasing integration tests pass

## Bulk Migration AC Rule (MANDATORY for Cross-Cutting Refactors)

### Bulk Migration Targets

| # | Target File/Function | Status |
|---|----------------------|--------|
| 1 | `apps/api/__test__/integration/purchasing/goods-receipts.test.ts` (line 22) | To be migrated |
| 2 | `apps/api/__test__/integration/purchasing/purchase-credits.test.ts` (line 23) | To be migrated |
| 3 | `apps/api/__test__/integration/purchasing/document-chain.test.ts` (line 43) | To be migrated |
| 4 | `apps/api/__test__/integration/purchasing/ap-multicurrency-correctness.test.ts` (line 36) | To be migrated |
| 5 | `apps/api/__test__/integration/purchasing/ap-payments.test.ts` (line 30) | To be migrated |
| 6 | `apps/api/__test__/integration/purchasing/ap-state-machine.test.ts` (line 71) | To be migrated |
| 7 | `apps/api/__test__/integration/purchasing/ap-payment-correctness.test.ts` (line 35) | To be migrated |
| 8 | `apps/api/__test__/integration/purchasing/ap-invoice-correctness.test.ts` (line 43) | To be migrated |
| 9 | `apps/api/__test__/integration/purchasing/purchase-invoices.test.ts` (line 27) | To be migrated |
| 10 | `apps/api/__test__/integration/purchasing/supplier-statements.test.ts` (line 28) | To be migrated |
| 11 | `apps/api/__test__/integration/purchasing/ap-aging-report.test.ts` (line 24) | To be migrated |
| 12 | `apps/api/__test__/integration/purchasing/supplier-contacts.test.ts` (line 20) | To be migrated |
| 13 | `apps/api/__test__/integration/purchasing/suppliers.test.ts` (line 20) | To be migrated |
| 14 | `apps/api/__test__/integration/purchasing/suppliers-tenant-isolation.test.ts` (line 24) | To be migrated |
| 15 | `apps/api/__test__/integration/purchasing/supplier-soft-delete.regression.test.ts` (line 19) | To be migrated |

**AC verification requires:** All rows show "migrated" -- partial completion is not acceptance.

## Test Coverage Criteria

- [ ] Coverage target: All paths in 14 test suites
- [ ] Happy paths to test:
  - [ ] All 14 files use canonical makeTag
  - [ ] All tests pass without tag collisions
- [ ] Error paths to test:
  - [ ] Tag collision detection

## Test Fixtures

### Pre-Implementation Checklist
- [x] New patterns identified: None -- using existing canonical makeTag
- [x] Existing canonical fixtures reviewed: `makeTag` in `apps/api/__test__/helpers/tags.ts`
- [x] Fixture location: N/A

### Fixture Creation/Update
- [ ] **New fixtures needed:** None
- [ ] **Existing fixtures to update:** None

### Test File Audit (Post-Implementation -- MANDATORY)
- [x] All new tests use canonical fixtures
- [x] Existing tests audited against new canonical patterns
- [x] Test files requiring fixture updates identified: All 14 files listed above
- [x] All identified test files updated to use canonical fixtures

## Tasks / Subtasks

- [ ] Read `apps/api/__test__/helpers/tags.ts` to understand canonical makeTag signature
- [ ] For each of the 14 files:
  - [ ] Remove file-local `makeTag` function definition
  - [ ] Add `import { makeTag } from "../../helpers/tags"`
  - [ ] Remove any explicit counter parameters
  - [ ] Verify tag usage still works
- [ ] Run full purchasing test suite
- [ ] Verify no tag collisions

## Files to Create

None.

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| 14 purchasing test files | Modify | Replace local makeTag with canonical import |

## Estimated Effort

0.5 day

## Risk Level

Medium (P1 -- risk of tag collisions with shared counter)

## Dev Notes

- The canonical `makeTag` helper uses a shared counter. When replacing, remove any file-local counter variables
- Some files may pass explicit counter parameters to their local makeTag -- remove these
- The `ap-period-close-enforcement.test.ts` already uses the canonical helper -- use it as a reference
- Risk R63-002 applies: the shared counter changes uniqueness semantics. If tests previously relied on per-file counters for isolation, they may now collide. Run the full suite to verify.
- If tag collisions occur, investigate whether tests are creating tags in `beforeAll` vs `beforeEach` -- the canonical counter is shared across all tests in a suite

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

- 14 purchasing test files (listed in AC)

## Validation Evidence

```bash
# Verify no file-local makeTag remains
grep -rn "function makeTag" apps/api/__test__/integration/purchasing/*.test.ts || echo "PASS: no local makeTag found"

# Verify canonical imports exist
grep -rn "from \"../../helpers/tags\"" apps/api/__test__/integration/purchasing/*.test.ts

# Run full purchasing suite
npm test -w @jurnapod/api -- --run apps/api/__test__/integration/purchasing/
```

## Dependencies

- None -- parallel Batch 1 story

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

This is a straightforward DRY consolidation. The main risk is tag collisions if the shared counter doesn't provide enough uniqueness. The canonical `makeTag` helper should use a combination of prefix, counter, and randomness to ensure uniqueness. If collisions occur, the helper may need adjustment, but that's outside the scope of this story -- escalate to the architecture team.
