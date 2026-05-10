# Story 63-2: Replace inline scaled() with @jurnapod/shared in purchasing tests

Status: ready-for-dev

> **Sprint-Status Append-Only Rule (E45-A1 / E46-A1) -- MANDATORY:**
> If this story modifies `_bmad-output/implementation-artifacts/sprint-status.yaml`:
> - **REQUIRED**: Run `npx tsx scripts/update-sprint-status.ts --epic 63 --story 63-2 --status done` (the canonical utility)
> - **REQUIRED**: After editing, run `npx tsx scripts/validate-sprint-status.ts` to confirm file integrity
> - **NEVER** replace the entire file -- always append only
> - **NEVER** use `replaceAll` on epic section markers
> - If accidentally overwritten: `git checkout HEAD -- _bmad-output/implementation-artifacts/sprint-status.yaml`
> - **Retrospective workflow will check this before closing the epic** (E46-A4)

## Story

As a **developer**,  
I want **4 purchasing test files to use canonical scaled() from @jurnapod/shared**,  
So that **IEEE 754 rounding bugs from inline parseFloat()*10000 are eliminated**.

## Context

Four purchasing test files reimplement the `scaled()` function from `@jurnapod/shared` using `BigInt(Math.round(parseFloat(val) * 10000))`. This introduces IEEE 754 float rounding errors because `parseFloat()` followed by multiplication can produce inexact results before `Math.round()` is applied.

The canonical `scaled()` function in `packages/shared/src/decimal-scale4.ts` uses string-based parsing to avoid float precision issues. It already exists and is used in production code. The test files should import it rather than reimplementing it.

**Files to fix:**
1. `apps/api/__test__/integration/purchasing/ap-payments.test.ts` (lines 751-756, 1277-1279)
2. `apps/api/__test__/integration/purchasing/ap-multicurrency-correctness.test.ts` (lines 42-49, `toScaledBigInt` function)
3. `apps/api/__test__/integration/purchasing/ap-reconciliation-snapshots.test.ts` (lines 1024-1027, `parseDecimal` function)
4. `apps/api/__test__/integration/purchasing/ap-reconciliation.test.ts` (lines 114-118, `toScaled4` function)

**Production side:** No changes needed -- `scaled()` and `unscaled()` already exist in `@jurnapod/shared`.

---

## Test Scenario Review Checkpoint (MANDATORY -- E54-A1)

### Pre-Implementation Checklist

- [x] **Happy paths identified:** All 4 test suites pass with canonical scaled() after replacement
- [x] **Error paths identified:** Edge cases with decimal values that trigger float precision issues
- [x] **Edge cases identified:** Very large decimal values, values with many decimal places
- [x] **Test fixture needs identified:** None -- existing test data unchanged
- [x] **Integration test scope defined:** All 4 files are integration tests with real DB
- [x] **Negative auth test role selected:** N/A -- this is a correctness fix, not auth-gated

### Review Outcome

| Scenario | Type | Coverage Plan |
|----------|------|--------------|
| Replace inline scaled in ap-payments.test.ts | Happy | Integration |
| Replace inline toScaledBigInt in ap-multicurrency-correctness.test.ts | Happy | Integration |
| Replace inline parseDecimal in ap-reconciliation-snapshots.test.ts | Happy | Integration |
| Replace inline toScaled4 in ap-reconciliation.test.ts | Happy | Integration |
| Verify no precision regression | Edge | Integration |

**Sign-off:** Test scenarios reviewed and approved before implementation begins.

---

## Cross-Module Error Boundary Verification (MANDATORY -- E58-A1)

N/A -- no error boundary changes. This is a test-only refactor using existing production exports.

---

## Cross-Module Decision Gate (MANDATORY -- E54-A1 Follow-Up)

### Pre-Implementation Checklist

- [x] **Modules touched:** `@jurnapod/shared` (import only), `apps/api` (test files)
- [x] **Cross-module decisions identified:** None -- using existing exported function
- [x] **Winston sign-off obtained:** Not required for test-only import change
- [x] **Decisions recorded:** N/A

### Decision Record

| # | Decision | Modules Affected | Rationale | Alternatives Considered | Winston Sign-Off |
|---|----------|-----------------|-----------|------------------------|-----------------|
| 1 | Import canonical scaled() instead of inline reimplementation | apps/api tests | Correctness -- eliminates float precision bugs | Keep inline (rejected: introduces bugs) | N/A |

---

## API Contract Verification (MANDATORY for UI Stories)

N/A -- no UI or API changes.

---

## Acceptance Criteria

**AC1: All 4 files import scaled/unscaled from @jurnapod/shared**
**Given** the 4 purchasing test files
**When** inspected
**Then** each file imports `scaled` and/or `unscaled` from `"@jurnapod/shared"`

**AC2: All existing assertions pass with correct scaled() implementation**
**Given** the 4 purchasing test files
**When** executed
**Then** all existing test assertions pass without modification

**AC3: No inline decimal conversion functions remain**
**Given** the 4 purchasing test files
**When** inspected
**Then** no `Math.round(parseFloat())`, `toScaledBigInt`, `parseDecimal`, or `toScaled4` function definitions remain

**AC4: All 4 purchasing test suites pass**
**Given** the purchasing test suite
**When** executed
**Then** all 4 test suites pass via `npm test -w @jurnapod/api -- --run`

## Bulk Migration AC Rule (MANDATORY for Cross-Cutting Refactors)

### Bulk Migration Targets

| # | Target File/Function | Status |
|---|----------------------|--------|
| 1 | `apps/api/__test__/integration/purchasing/ap-payments.test.ts` (lines 751-756, 1277-1279) | To be migrated |
| 2 | `apps/api/__test__/integration/purchasing/ap-multicurrency-correctness.test.ts` (lines 42-49, `toScaledBigInt`) | To be migrated |
| 3 | `apps/api/__test__/integration/purchasing/ap-reconciliation-snapshots.test.ts` (lines 1024-1027, `parseDecimal`) | To be migrated |
| 4 | `apps/api/__test__/integration/purchasing/ap-reconciliation.test.ts` (lines 114-118, `toScaled4`) | To be migrated |

**AC verification requires:** All rows show "migrated" -- partial completion is not acceptance.

## Test Coverage Criteria

- [ ] Coverage target: All paths in 4 test suites
- [ ] Happy paths to test:
  - [ ] All existing assertions pass after scaled() replacement
- [ ] Error paths to test:
  - [ ] No precision loss on decimal values that previously triggered float bugs

## Test Fixtures

### Pre-Implementation Checklist
- [x] New patterns identified: None -- using existing canonical scaled()
- [x] Existing canonical fixtures reviewed: `scaled()` and `unscaled()` from `@jurnapod/shared`
- [x] Fixture location: N/A

### Fixture Creation/Update
- [ ] **New fixtures needed:** None
- [ ] **Existing fixtures to update:** None

### Test File Audit (Post-Implementation -- MANDATORY)
- [x] All new tests use canonical fixtures (not ad-hoc raw SQL INSERT/UPDATE)
- [x] Existing tests audited against new canonical patterns
- [x] Test files requiring fixture updates identified: None
- [x] All identified test files updated to use canonical fixtures

## Tasks / Subtasks

- [ ] Read `apps/api/__test__/integration/purchasing/ap-payments.test.ts` and identify inline scaled() usage
- [ ] Read `apps/api/__test__/integration/purchasing/ap-multicurrency-correctness.test.ts` and identify `toScaledBigInt`
- [ ] Read `apps/api/__test__/integration/purchasing/ap-reconciliation-snapshots.test.ts` and identify `parseDecimal`
- [ ] Read `apps/api/__test__/integration/purchasing/ap-reconciliation.test.ts` and identify `toScaled4`
- [ ] Replace all inline implementations with `import { scaled, unscaled } from "@jurnapod/shared"`
- [ ] Verify `scaled()` signatures match usage patterns in all 4 files
- [ ] Run each test suite individually to verify pass
- [ ] Run full purchasing test suite to verify no regressions

## Files to Create

None.

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `apps/api/__test__/integration/purchasing/ap-payments.test.ts` | Modify | Replace inline scaled() with @jurnapod/shared import |
| `apps/api/__test__/integration/purchasing/ap-multicurrency-correctness.test.ts` | Modify | Replace `toScaledBigInt` with `scaled` import |
| `apps/api/__test__/integration/purchasing/ap-reconciliation-snapshots.test.ts` | Modify | Replace `parseDecimal` with `scaled` import |
| `apps/api/__test__/integration/purchasing/ap-reconciliation.test.ts` | Modify | Replace `toScaled4` with `scaled` import |

## Estimated Effort

0.5 day

## Risk Level

Medium (P0 -- correctness fix, must verify no assertion value changes)

## Dev Notes

- The canonical `scaled()` signature: `scaled(value: string | number): bigint`
- The canonical `unscaled()` signature: `unscaled(value: bigint): number`
- Before replacing, verify the inline function signatures match the canonical ones
- If any file uses a variant signature (e.g., different rounding mode), note it in dev notes
- Run each file individually first: `npm test -w @jurnapod/api -- --run path/to/file.test.ts`
- The `ap-multicurrency-correctness.test.ts` is especially important -- verify multi-currency assertions still pass

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

- `apps/api/__test__/integration/purchasing/ap-payments.test.ts`
- `apps/api/__test__/integration/purchasing/ap-multicurrency-correctness.test.ts`
- `apps/api/__test__/integration/purchasing/ap-reconciliation-snapshots.test.ts`
- `apps/api/__test__/integration/purchasing/ap-reconciliation.test.ts`

## Validation Evidence

```bash
# Verify each file passes individually
npm test -w @jurnapod/api -- --run apps/api/__test__/integration/purchasing/ap-payments.test.ts
npm test -w @jurnapod/api -- --run apps/api/__test__/integration/purchasing/ap-multicurrency-correctness.test.ts
npm test -w @jurnapod/api -- --run apps/api/__test__/integration/purchasing/ap-reconciliation-snapshots.test.ts
npm test -w @jurnapod/api -- --run apps/api/__test__/integration/purchasing/ap-reconciliation.test.ts

# Verify no inline functions remain
grep -n "toScaledBigInt\|parseDecimal\|toScaled4\|Math.round(parseFloat" apps/api/__test__/integration/purchasing/*.test.ts || echo "PASS: no inline decimal helpers found"

# Verify canonical imports exist
grep -n "from \"@jurnapod/shared\"" apps/api/__test__/integration/purchasing/ap-payments.test.ts
```

## Dependencies

- None -- parallel Batch 1 story

## Shared Contract Changes (MANDATORY for Constants/Types)

N/A -- no contract changes. Using existing exports.

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

This is a straightforward correctness fix. The main risk is assertion value changes if the inline implementation had different rounding behavior than the canonical `scaled()`. If any assertion fails after replacement, investigate whether the test was asserting against the buggy inline value (in which case, fix the assertion) or if there's a genuine behavioral difference (in which case, the canonical `scaled()` may need adjustment, escalate to architecture team).
