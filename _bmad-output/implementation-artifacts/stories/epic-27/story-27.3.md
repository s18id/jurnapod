# story-27.3: COGS parity in modules-accounting

## Description

Port missing API behaviors to `packages/modules/accounting/src/posting/cogs.ts`, then migrate callers to the package version and delete `apps/api/src/lib/cogs-posting.ts`.

## Context

**Duplicate situation:**
- `apps/api/src/lib/cogs-posting.ts` — API-local copy (688 LOC)
- `packages/modules/accounting/src/posting/cogs.ts` — package version (313 LOC)

The API version has additional behaviors not in the package version:
- Precomputed `deductionCosts` with `stockTxId` linkage
- Deterministic inventory transaction linkage after posting
- `postCogsForSale` with full `CogsPostingInput` support

**Source:** `apps/api/src/lib/cogs-posting.ts` lines 1–688

## Acceptance Criteria

- [ ] Package `posting/cogs.ts` gains parity with API version:
  - `deductionCosts` precomputed rows with `stockTxId`
  - Deterministic inventory transaction linkage
  - Full `CogsPostingInput` support
- [ ] API callers (`sync/push/transactions.ts`, others) updated to use package
- [ ] `apps/api/src/lib/cogs-posting.ts` deleted
- [ ] `npm run typecheck -w @jurnapod/modules-accounting`
- [ ] `npm run build -w @jurnapod/modules-accounting`
- [ ] `npm run typecheck -w @jurnapod/api`
- [ ] `npm run test:unit:single -w @jurnapod/api src/lib/cogs-posting.test.ts`

## Files to Modify

```
packages/modules/accounting/src/posting/cogs.ts    (add missing behaviors)
apps/api/src/lib/cogs-posting.ts                  (DELETE)
apps/api/src/lib/sync/push/transactions.ts         (update import)
apps/api/src/lib/stock.ts                          (update import if present)
```

## Dependency

- `story-27.3` → `story-27.1` (type contracts must be in place)

## Implementation Notes

### Step 1: Compare behaviors
Read both files. The API version at minimum has:
- `calculateSaleCogs(input)` — COGS calculation with item cost lookup
- `postCogsForSale(input)` — journal posting with inventory account
- `getItemAccounts(...)` — account resolution
- `getItemAccountsBatch(...)` — batch account resolution
- `deductionCosts` support — precomputed cost rows with `stockTxId`

### Step 2: Port missing behaviors to package
Add to `packages/modules/accounting/src/posting/cogs.ts`:
- Deduction costs support with `stockTxId` linkage
- Full `CogsPostingInput` contract parity
- `postCogsForSale` with deterministic inventory journal linkage

### Step 3: Update API callers
```typescript
// In transactions.ts and other API files:
import { calculateSaleCogs, postCogsForSale } from "@jurnapod/modules-accounting/posting/cogs.js";
```

### Step 4: Delete
Delete `apps/api/src/lib/cogs-posting.ts`

## Validation Commands

```bash
npm run typecheck -w @jurnapod/modules-accounting
npm run build -w @jurnapod/modules-accounting
npm run typecheck -w @jurnapod/api
npm run test:unit:single -w @jurnapod/api src/lib/cogs-posting.test.ts
```
