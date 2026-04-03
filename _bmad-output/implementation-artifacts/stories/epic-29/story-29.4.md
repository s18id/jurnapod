# story-29.4: Extract depreciation plan/run service

## Description

Implement `DepreciationService` in `modules-accounting/src/fixed-assets/` with full parity to the existing `apps/api/src/lib/depreciation.ts` (704 LOC). This covers depreciation plan CRUD and monthly run execution with journal posting.

## Context

The source file `apps/api/src/lib/depreciation.ts` contains:
- Depreciation plan: create, update, get
- Depreciation run: execute for a period
- Journal posting integration via `depreciation-posting.ts`
- Fiscal year guard validation

## Endpoints Covered

| Method | Path | Operation |
|--------|------|-----------|
| POST | `/accounts/fixed-assets/:id/depreciation-plan` | Create depreciation plan |
| PATCH | `/accounts/fixed-assets/:id/depreciation-plan` | Update depreciation plan |
| POST | `/accounts/depreciation/run` | Execute depreciation run |

## Approach

1. Read `apps/api/src/lib/depreciation.ts` (source of truth)
2. Read `packages/modules/accounting/src/posting/depreciation.ts` (existing posting hook)
3. Implement `DepreciationService` with:
   - Plan lifecycle (create, update, get)
   - Run execution with idempotency (unique key per asset + period)
   - Journal posting via injected hook
4. Verify `modules-accounting` typechecks

## Parity Checklist

- [ ] `createDepreciationPlan(companyId, assetId, input, actor)` — validates asset exists, sets up plan
- [ ] `updateDepreciationPlan(companyId, planId, input, actor)` — partial update, validates plan exists
- [ ] `executeDepreciationRun(companyId, periodKey, actor)` — processes all active plans for period, posts journals
- [ ] Idempotency: if run for same asset+period exists, skip (match existing behavior)
- [ ] Fiscal year guard: validates fiscal year is open before posting
- [ ] Journal posting: uses `DepreciationPostingHook` (injectable)
- [ ] Transaction atomicity: book update + run record + journal in same DB transaction

## Key Behaviors to Preserve

1. **Idempotency**: Duplicate run for same period returns existing run (no duplicate journal)
2. **Period enforcement**: Cannot run depreciation for future periods
3. **Fiscal year check**: Depreciation run blocked if fiscal year is closed
4. **Method support**: STRAIGHT_LINE, DECLINING_BALANCE, SUM_OF_YEARS (match existing)
5. **Book value cap**: Depreciation cannot reduce book value below salvage value

## Files to Modify

```
packages/modules/accounting/src/fixed-assets/interfaces/types.ts              # add depreciation types
packages/modules/accounting/src/fixed-assets/repositories/fixed-asset-repo.ts  # add plan/run queries
packages/modules/accounting/src/fixed-assets/services/depreciation-service.ts  # implement
packages/modules/accounting/src/fixed-assets/interfaces/fixed-asset-ports.ts  # add DepreciationPostingHook port
packages/modules/accounting/src/fixed-assets/index.ts                        # export DepreciationService
```

## Dependency

- story-29.2 (scaffolding must be in place; depends on story 29.3 for asset validation)

## Validation Commands

```bash
npm run typecheck -w @jurnapod/modules-accounting
npm run build -w @jurnapod/modules-accounting
```

## Status

**Status:** review