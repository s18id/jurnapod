# story-23.0.3: Scaffold new domain package workspaces

## Description
Create the workspace structure for the four new domain packages: modules-sales, modules-inventory, modules-reservations, and modules-reporting.

## Acceptance Criteria

- [ ] New package shells created: `modules-sales`, `modules-inventory`, `modules-reservations`, `modules-reporting`
- [ ] Each package has build/typecheck scripts and minimal public export entrypoint
- [ ] Packages compile in workspace without runtime logic yet

## Files to Modify

- `packages/modules/sales/package.json` (create)
- `packages/modules/sales/tsconfig.json` (create)
- `packages/modules/sales/src/index.ts` (create)
- `packages/modules/inventory/package.json` (create)
- `packages/modules/inventory/tsconfig.json` (create)
- `packages/modules/inventory/src/index.ts` (create)
- `packages/modules/reservations/package.json` (create)
- `packages/modules/reservations/tsconfig.json` (create)
- `packages/modules/reservations/src/index.ts` (create)
- `packages/modules/reporting/package.json` (create)
- `packages/modules/reporting/tsconfig.json` (create)
- `packages/modules/reporting/src/index.ts` (create)
- Root workspace config (`package.json`, `tsconfig` refs) as needed

## Dependencies

- story-23.0.1 (ADR must be completed)

## Estimated Effort

3 hours

## Priority

P2

## Validation Commands

```bash
cd /home/ahmad/jurnapod
npm run typecheck -ws --if-present
npm run build -ws --if-present
```

## Notes

These are empty package shells that will be populated in subsequent stories. Focus on getting the build pipeline working correctly.
