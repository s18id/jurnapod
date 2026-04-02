# story-23.3.6: Extract stock/recipe/supplies

## Description
Move stock, recipe, and supplies business workflows from the API to the modules-inventory package.

## Acceptance Criteria

- [ ] Stock and recipe/supplies business workflows moved to inventory package
- [ ] No cross-domain cycles introduced with accounting/sales
- [ ] Batch operations remain correct where used

## Files to Modify

- `packages/modules/inventory/src/stock/*` (create)
- `packages/modules/inventory/src/recipes/*` (create)
- `packages/modules/inventory/src/supplies/*` (create)
- `apps/api/src/lib/stock.ts` (adapter/removal)
- `apps/api/src/lib/recipe-*` (adapter/removal)
- `apps/api/src/lib/supplies/*` (adapter/removal)

## Dependencies

- story-23.3.5 (Item catalog extraction should be complete)

## Estimated Effort

4 hours

## Priority

P2

## Validation Commands

```bash
cd /home/ahmad/jurnapod
npm run test:unit:single -w @jurnapod/api src/routes/inventory/*.test.ts
npm run typecheck -w @jurnapod/modules-inventory
```

## Notes

Recipe/costing logic may interact with COGS posting. Ensure proper interface boundaries with modules-accounting.
