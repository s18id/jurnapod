# Story 64.1: Fix ap-multicurrency-correctness — Use computePurchaseInvoiceOpenAmount

Status: done

> ⚠️ **Sprint-Status Append-Only Rule (E45-A1 / E46-A1) — MANDATORY:**
> If this story modifies `_bmad-output/implementation-artifacts/sprint-status.yaml`:
> - **REQUIRED**: Run `npx tsx scripts/update-sprint-status.ts --epic 64 --story 64-1 --status done` (the canonical utility)
> - **REQUIRED**: After editing, run `npx tsx scripts/validate-sprint-status.ts` to confirm file integrity
> - **NEVER** replace the entire file — always append only
> - **NEVER** use `replaceAll` on epic section markers
> - If accidentally overwritten: `git checkout HEAD -- _bmad-output/implementation-artifacts/sprint-status.yaml`
> - **Retrospective workflow will check this before closing the epic** (E46-A4)

## Story

As a **developer maintaining the purchasing module**,  
I want **test verification to use `computePurchaseInvoiceOpenAmount` instead of inline SQL**,  
So that **tests remain correct when the production formula changes**.

## Context

Epic 63 eliminated test stubs and raw SQL INSERTs for setup. A deeper audit found that `ap-multicurrency-correctness.test.ts` still uses inline SQL aggregation to verify AP invoice open amounts:

```sql
SELECT (pi.grand_total * pi.exchange_rate - COALESCE(SUM(apl.allocation_amount), 0))
```

This formula duplicates what `computePurchaseInvoiceOpenAmount()` already computes in production. The function is already exported from `@jurnapod/modules-purchasing`. Replacing the inline SQL with the production function eliminates drift risk.

**Predecessor:** Epic 63 (Test Production-Code Hardening)
**Parallel batch:** Batch 1 (stories 64.1, 64.2, 64.3 — no dependencies)

---

## Test Scenario Review Checkpoint (MANDATORY — E54-A1)

### Pre-Implementation Checklist

- [ ] **Happy paths identified:** Migration succeeds, test assertions match production output
- [ ] **Error paths identified:** None — this is a test-only migration
- [ ] **Edge cases identified:** Multi-currency exchange rate variations, partial payment allocations
- [ ] **Test fixture needs identified:** Existing fixtures sufficient — no new fixtures needed
- [ ] **Integration test scope defined:** This IS an integration test modification
- [ ] **Negative auth test role selected:** N/A — test-only change, no auth boundary

### Review Outcome

| Scenario | Type | Coverage Plan |
|----------|------|--------------|
| Replace inline SQL with production function call | Happy | Integration |
| Verify output matches prior assertion (or adjust if formula differs) | Edge | Integration |

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

- [ ] **Modules touched:** `purchasing`
- [ ] **Cross-module decisions identified:** None — uses already-exported function
- [ ] **Winston sign-off obtained:** N/A
- [ ] **Decisions recorded:** N/A

### Decision Record

| # | Decision | Modules Affected | Rationale | Alternatives Considered | Winston Sign-Off |
|---|----------|-----------------|-----------|------------------------|-----------------|
| 1 | Use `computePurchaseInvoiceOpenAmount` directly | `purchasing` | Already exported, canonical formula | Inline SQL (rejected: drift risk) | N/A |

**Hard gate:** No cross-module decisions required. Implementation may proceed.

---

## Acceptance Criteria

**AC1: Inline SQL replaced with production function**
**Given** the test file `ap-multicurrency-correctness.test.ts`
**When** the inline `SELECT (pi.grand_total * pi.exchange_rate - COALESCE(SUM(apl.allocation_amount), 0))` at line ~409 is replaced
**Then** the test uses `computePurchaseInvoiceOpenAmount(invoiceId)` from `@jurnapod/modules-purchasing`

**AC2: Test assertions remain correct**
**Given** the migrated test
**When** it runs
**Then** all assertions pass (adjust expected values if production formula computes differently, with documented rationale)

**AC3: No inline SQL aggregation remains in verification path**
**Given** the migrated test file
**When** grepped for `COALESCE(SUM` or `SUM(.*?debit` or `SUM(.*?credit`
**Then** zero matches found in verification queries

## Bulk Migration AC Rule (MANDATORY for Cross-Cutting Refactors)

### Bulk Migration Targets

| # | Target File/Function | Status |
|---|----------------------|--------|
| 1 | `apps/api/__test__/integration/purchasing/ap-multicurrency-correctness.test.ts` line ~409 | To be migrated |

**AC verification requires:** All rows show "migrated" — partial completion is not acceptance.

## Test Coverage Criteria

- [ ] Coverage target: N/A — migration of existing test
- [ ] Happy paths to test:
  - [ ] Test passes after migration with same or adjusted assertions
- [ ] Error paths to test:
  - [ ] N/A

## Test Fixtures

**No new fixtures needed.** Existing test setup is sufficient.

### Pre-Implementation Checklist
- [x] Existing canonical fixtures reviewed for reuse potential
- [x] No new patterns identified

## Tasks / Subtasks

- [ ] Open `ap-multicurrency-correctness.test.ts`
- [ ] Locate inline SQL at line ~409
- [ ] Replace with `computePurchaseInvoiceOpenAmount(invoiceId)` call
- [ ] Run test and compare output to previous assertion
- [ ] Adjust assertion if needed (document any difference)
- [ ] Verify `COALESCE(SUM` no longer appears in verification path

## Files to Create

| File | Description |
|------|-------------|
| None | No new files |

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `apps/api/__test__/integration/purchasing/ap-multicurrency-correctness.test.ts` | Modify | Replace inline SQL with `computePurchaseInvoiceOpenAmount()` |

## Estimated Effort

0.5 day

## Risk Level

Low

## Dev Notes

- `computePurchaseInvoiceOpenAmount` is already exported from `@jurnapod/modules-purchasing`
- The function signature: `computePurchaseInvoiceOpenAmount(invoiceId: number, db?: Kysely<DB>)`
- If the test uses raw mysql2 pool, you may need to wrap with `withKysely()` or pass the pool
- Document any formula difference in the story completion report

## Cross-Cutting Concerns

N/A — test-only change, no production code affected.

## Validation Evidence

- `npm run test:integration -w @jurnapod/api -- --run ap-multicurrency-correctness` passes
- `grep -n 'COALESCE(SUM' apps/api/__test__/integration/purchasing/ap-multicurrency-correctness.test.ts` returns 0 results

## Dependencies

- None (service already exported)

## Shared Contract Changes (MANDATORY for Constants/Types)

N/A — no shared contract changes.

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

- This is the simplest story in the epic — a direct function swap.
- If the production function requires a Kysely instance and the test uses raw mysql2, consider adding a thin adapter or using `withKysely()`.
