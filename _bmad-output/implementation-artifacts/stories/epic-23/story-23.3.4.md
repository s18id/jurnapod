# story-23.3.4: modules-inventory bootstrap + scoping guards

## Description
Bootstrap the modules-inventory package with company/outlet scoped service entrypoints and shared validation seams.

## Acceptance Criteria

- [ ] Inventory package exports company/outlet scoped service entrypoints
- [ ] Shared validation/seams for item/group/price services are established
- [ ] API imports package interfaces without route behavior change

## Files to Modify

- `packages/modules/inventory/src/index.ts` (create/update)
- `packages/modules/inventory/src/interfaces/*` (create)
- `apps/api/src/lib/items/*` (initial adapter wiring)

## Dependencies

- story-23.0.3 (Package scaffolds must exist)

## Estimated Effort

3 hours

## Priority

P1

## Validation Commands

```bash
cd /home/ahmad/jurnapod
npm run typecheck -w @jurnapod/modules-inventory
npm run typecheck -w @jurnapod/api
```

## Notes

Tenant scoping is critical for inventory. Ensure all service interfaces require company_id/outlet_id parameters.
