# Story 64.8: Fix cogs-posting package test — Create inventory fixtures

Status: ready-for-dev

> ⚠️ **Sprint-Status Append-Only Rule (E45-A1 / E46-A1) — MANDATORY:**
> If this story modifies `_bmad-output/implementation-artifacts/sprint-status.yaml`:
> - **REQUIRED**: Run `npx tsx scripts/update-sprint-status.ts --epic 64 --story 64-8 --status done` (the canonical utility)
> - **REQUIRED**: After editing, run `npx tsx scripts/validate-sprint-status.ts` to confirm file integrity
> - **NEVER** replace the entire file — always append only
> - **NEVER** use `replaceAll` on epic section markers
> - If accidentally overwritten: `git checkout HEAD -- _bmad-output/implementation-artifacts/sprint-status.yaml`
> - **Retrospective workflow will check this before closing the epic** (E46-A4)

## Story

As a **developer maintaining the accounting module**,  
I want **COGS posting tests to use canonical inventory fixtures instead of inline INSERTs**,  
So that **test setup follows the canonical fixture flow and stays aligned with production invariants**.

## Context

Epic 63 eliminated raw SQL INSERTs for test setup in `apps/api/`. However, a deeper audit found that `packages/modules/accounting/__test__/integration/posting/cogs-posting.test.ts` still uses inline `INSERT INTO items/inventory_transactions/item_prices` functions at lines ~211-261. These inline INSERTs bypass domain logic and create drift risk.

The canonical fixtures exist in `packages/modules/inventory/test-fixtures/`. This story replaces the inline INSERTs with calls to those canonical fixtures.

**Predecessor:** Epic 63
**Parallel batch:** Can run parallel with any batch (independent — different package)

---

## Test Scenario Review Checkpoint (MANDATORY — E54-A1)

### Pre-Implementation Checklist

- [ ] **Happy paths identified:** Inline INSERTs replaced with canonical fixtures, test passes
- [ ] **Error paths identified:** None — test-only migration
- [ ] **Edge cases identified:** Fixture defaults may differ from inline INSERTs; verify test assertions still valid
- [ ] **Test fixture needs identified:** `createTestItem()`, `createTestVariant()`, inventory transaction fixtures from `packages/modules/inventory/test-fixtures/`
- [ ] **Integration test scope defined:** This IS an integration test modification
- [ ] **Negative auth test role selected:** N/A

### Review Outcome

| Scenario | Type | Coverage Plan |
|----------|------|--------------|
| Replace inline INSERTs with canonical fixtures | Happy | Integration |
| Verify test still passes with fixture defaults | Edge | Integration |

**Sign-off:** Test scenarios reviewed and approved before implementation begins.

---

## Cross-Module Error Boundary Verification (MANDATORY — E58-A1)

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

**Hard gate:** N/A — no cross-module error boundary for this test-only migration.

---

## Cross-Module Decision Gate (MANDATORY — E54-A1 Follow-Up)

### Pre-Implementation Checklist

- [ ] **Modules touched:** `accounting`, `inventory`
- [ ] **Cross-module decisions identified:** Which canonical fixtures to use; whether to add new fixtures if existing ones don't cover the test's needs
- [ ] **Winston sign-off obtained:** Required if new fixtures needed
- [ ] **Decisions recorded:** Yes

### Decision Record

| # | Decision | Modules Affected | Rationale | Alternatives Considered | Winston Sign-Off |
|---|----------|-----------------|-----------|------------------------|-----------------|
| 1 | Use existing canonical fixtures from `packages/modules/inventory/test-fixtures/` | `inventory`, `accounting` | Follows canonical fixture flow, aligns with production invariants | Create new fixtures (rejected: unnecessary if existing ones suffice) | ⏳ Pending |
| 2 | If existing fixtures don't cover `item_prices` setup, add fixture to owner package | `inventory` | Owner package rule: fixtures belong to the package that owns the domain | Add fixture in accounting package (rejected: violates ownership) | ⏳ Pending |

**Hard gate:** Implementation MUST NOT begin until fixture inventory is complete and Winston signs off if new fixtures are needed.

---

## Acceptance Criteria

**AC1: Inline INSERTs replaced with canonical fixtures**
**Given** the test file `cogs-posting.test.ts`
**When** lines ~211-261 are reviewed
**Then** no inline `INSERT INTO items`, `INSERT INTO inventory_transactions`, or `INSERT INTO item_prices` remains

**AC2: Use canonical fixtures from owner package**
**Given** the migrated test
**When** setup code is reviewed
**Then** it uses `createTestItem()`, `createTestVariant()`, and other canonical fixtures from `packages/modules/inventory/test-fixtures/`

**AC3: Test assertions remain correct**
**Given** the migrated test
**When** it runs
**Then** all assertions pass (adjust expected values if fixture defaults differ, with documented rationale)

**AC4: lint:fixture-flow passes**
**Given** the migrated test file
**When** `npm run lint:fixture-flow -w @jurnapod/api` is run
**Then** no fixture flow violations are reported for this test

## Bulk Migration AC Rule (MANDATORY for Cross-Cutting Refactors)

### Bulk Migration Targets

| # | Target File/Function | Status |
|---|----------------------|--------|
| 1 | `packages/modules/accounting/__test__/integration/posting/cogs-posting.test.ts` lines ~211-261 | To be migrated |

**AC verification requires:** All rows show "migrated" — partial completion is not acceptance.

## Test Coverage Criteria

- [ ] Coverage target: N/A — migration of existing test
- [ ] Happy paths to test:
  - [ ] Test passes after migration
- [ ] Error paths to test:
  - [ ] N/A

## Test Fixtures

### Pre-Implementation Checklist
- [ ] New patterns identified that need canonical fixtures (timestamps, status IDs, enum values, etc.)
- [x] Existing canonical fixtures reviewed for reuse potential
- [x] Fixture location determined by ownership model (`packages/modules-inventory/src/test-fixtures/`)

### Fixture Creation/Update
- [ ] **New fixtures needed:** List patterns requiring canonical fixtures:
  - [ ] `item_prices` fixture if not existing
- [ ] **Existing fixtures to update:**
  - [ ] N/A

### Test File Audit (Post-Implementation - MANDATORY)
- [ ] All new tests use canonical fixtures (not ad-hoc raw SQL INSERT/UPDATE)
- [ ] Existing tests audited against new canonical patterns
- [ ] Test files requiring fixture updates identified:
  - [ ] `packages/modules/accounting/__test__/integration/posting/cogs-posting.test.ts` — inline INSERTs → canonical fixtures
- [ ] All identified test files updated to use canonical fixtures

## Tasks / Subtasks

- [ ] Open `cogs-posting.test.ts` and analyze inline INSERTs at lines ~211-261
- [ ] Inventory existing canonical fixtures in `packages/modules/inventory/test-fixtures/`
- [ ] Determine if existing fixtures cover the test's needs
- [ ] If not, create new fixture in `packages/modules/inventory/test-fixtures/` (owner package)
- [ ] Replace inline INSERTs with fixture calls
- [ ] Run test and verify assertions
- [ ] Run `lint:fixture-flow` and verify clean

## Files to Create

| File | Description |
|------|-------------|
| `packages/modules/inventory/src/test-fixtures/item-price-fixtures.ts` (if needed) | New fixture for item_prices if not existing |

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `packages/modules/accounting/__test__/integration/posting/cogs-posting.test.ts` | Modify | Replace inline INSERTs with canonical fixtures |
| `packages/modules/inventory/src/test-fixtures/item-price-fixtures.ts` | Create (if needed) | Add item_prices fixture |
| `packages/modules/inventory/src/index.ts` | Modify (if needed) | Export new fixture |

## Estimated Effort

1 day

## Risk Level

Medium

## Dev Notes

- Follow the fixture ownership model: fixtures belong to the package that owns the domain invariant
- If `item_prices` doesn't have a canonical fixture, create one in `packages/modules/inventory/test-fixtures/`
- The fixture MUST use the same service/repository that production code uses (Full Fixture Mode)
- Document any fixture default differences that affect test assertions

## Validation Evidence

- `npm run test:integration -w @jurnapod/modules-accounting -- --run cogs-posting` passes
- `npm run lint:fixture-flow -w @jurnapod/api` clean
- `grep -n 'INSERT INTO items\|INSERT INTO inventory_transactions\|INSERT INTO item_prices' packages/modules/accounting/__test__/integration/posting/cogs-posting.test.ts` returns 0 results

## Dependencies

- None (independent — different package)

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

- This story is independent and can run in parallel with any other story.
- If creating new fixtures, follow the canonical fixture contract: deterministic defaults, typed input/output, cleanup registration.
