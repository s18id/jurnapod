# story-24.6: Full validation gate

## Description

Run full test suite to validate the costing extraction and freeze the costing package public API.

## Acceptance Criteria

- [ ] All existing tests pass
- [ ] No circular dependencies between packages
- [ ] Costing package public API documented
- [ ] API boundary violations in lint pass

## Files to Review

- `packages/modules/inventory-costing/src/index.ts` (document public API)
- `apps/api/src/lib/stock.ts` (verify clean delegation)
- `apps/api/src/lib/cogs-posting.ts` (verify clean usage)

## Dependencies

- story-24.5 (sync handlers must be complete)

## Implementation

1. Run full test suite:
   ```bash
   npm run test:unit:critical -w @jurnapod/api
   npm run test:unit:sync -w @jurnapod/api
   npm run test:unit:sales -w @jurnapod/api
   ```

2. Verify no circular deps:
   ```bash
   npm run lint -w @jurnapod/modules-inventory-costing
   npm run lint -w @jurnapod/modules-inventory
   npm run lint -w @jurnapod/modules-accounting
   ```

3. Document the costing package public API in `packages/modules/inventory-costing/src/index.ts`

4. Create ADR documenting the inventory/costing/accounting boundary

## Validation

```bash
npm run typecheck -w @jurnapod/api
npm run build -w @jurnapod/api
npm run test:unit -w @jurnapod/api
```

## Notes

This is the epic completion gate. No story should be marked done until this passes.