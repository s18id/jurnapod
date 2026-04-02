# story-23.3.8: Extract reservations/table services

## Description
Move reservations, table occupancy, and outlet table workflows from the API to the modules-reservations package.

## Acceptance Criteria

- [ ] Reservations, table occupancy, and outlet table workflows moved to package
- [ ] Canonical reservation timestamp semantics unchanged
- [ ] API route logic is adapter-only after extraction

## Files to Modify

- `packages/modules/reservations/src/reservations/*` (create)
- `packages/modules/reservations/src/table-occupancy/*` (create)
- `packages/modules/reservations/src/outlet-tables/*` (create)
- `apps/api/src/lib/reservations/*` (adapter/removal)
- `apps/api/src/lib/table-occupancy.ts` (adapter/removal)
- `apps/api/src/lib/outlet-tables.ts` (adapter/removal)

## Dependencies

- story-23.3.7 (Reservations bootstrap must be complete)

## Estimated Effort

4 hours

## Priority

P1

## Validation Commands

```bash
cd /home/ahmad/jurnapod
npm run test:unit:single -w @jurnapod/api src/routes/reservations/*.test.ts
npm run typecheck -w @jurnapod/modules-reservations
```

## Notes

Ensure reservation time semantics remain consistent with the canonical time model defined in story-23.3.7.
