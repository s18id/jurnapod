# story-26.5: Full validation gate

## Description

Run the full validation gate for Epic 26, ensuring all packages build, typecheck, and existing tests pass.

## Acceptance Criteria

- [ ] `npm run typecheck -w @jurnapod/modules-inventory`
- [ ] `npm run build -w @jurnapod/modules-inventory`
- [ ] `npm run typecheck -w @jurnapod/api`
- [ ] `npm run build -w @jurnapod/api`
- [ ] `npm run test:unit:single -w @jurnapod/api src/lib/stock.test.ts`
- [ ] `npm run test:unit:critical -w @jurnapod/api`
- [ ] Sync push integration smoke test (at minimum, confirm the stock operations compile and typecheck in sync context):
  - `apps/api/src/lib/sync/push/stock.ts` — imports `deductStockWithCost`
  - `apps/api/src/lib/sync/push/transactions.ts` — imports `StockDeductResult`, `deductStockWithCost`
- [ ] No regressions: existing inventory tests still pass
- [ ] Update sprint-status.yaml: mark all Epic 26 stories done, epic done

## Files to Check (no modifications expected)

```
packages/modules/inventory/src/
apps/api/src/lib/stock.ts
apps/api/src/lib/sync/push/stock.ts
apps/api/src/lib/sync/push/transactions.ts
apps/api/src/routes/stock.ts
apps/api/src/middleware/stock.ts
```

## Dependency

- `story-26.5` → `story-26.4` (full gate only after delegation story)

## Validation Commands

```bash
npm run typecheck -w @jurnapod/modules-inventory
npm run build -w @jurnapod/modules-inventory
npm run typecheck -w @jurnapod/api
npm run build -w @jurnapod/api
npm run test:unit:single -w @jurnapod/api src/lib/stock.test.ts
npm run test:unit:critical -w @jurnapod/api
npm run test:unit -w @jurnapod/api
```

## Epic Completion Checklist

- [ ] All Epic 26 stories marked done in `_bmad-output/implementation-artifacts/sprint-status.yaml`
- [ ] Epic status updated: `epic-26: done`
- [ ] Coordination doc updated with final validation results
