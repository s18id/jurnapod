# story-23.3.5: Extract item catalog services

## Description
Move item, group, price, and variant business logic from the API to the modules-inventory package.

## Acceptance Criteria

- [ ] Item, group, price, and variant business logic moved to inventory package
- [ ] Company/outlet scoping retained and covered by tests
- [ ] API lib files reduced to adapter-level logic

## Files to Modify

- `packages/modules/inventory/src/items/*` (create)
- `packages/modules/inventory/src/item-groups/*` (create)
- `packages/modules/inventory/src/item-prices/*` (create)
- `packages/modules/inventory/src/item-variants/*` (create)
- `apps/api/src/lib/items/*` (adapter/removal)
- `apps/api/src/lib/item-groups/*` (adapter/removal)
- `apps/api/src/lib/item-prices/*` (adapter/removal)
- `apps/api/src/lib/item-variants.ts` (adapter/removal)

## Dependencies

- story-23.3.4 (Inventory bootstrap must be complete)

## Estimated Effort

4 hours

## Priority

P1

## Validation Commands

```bash
cd /home/ahmad/jurnapod
npm run test:unit:single -w @jurnapod/api src/routes/items/*.test.ts
npm run test:unit:single -w @jurnapod/api src/routes/item-groups/*.test.ts
npm run typecheck -w @jurnapod/modules-inventory
```

## Notes

Item catalog is foundational to sales and inventory operations. Ensure proper tenant scoping is maintained throughout.
