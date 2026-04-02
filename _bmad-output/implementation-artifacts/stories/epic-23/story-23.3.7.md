# story-23.3.7: modules-reservations bootstrap with time model

## Description
Bootstrap the modules-reservations package with canonical timestamp contracts and overlap rules for reservation management.

## Acceptance Criteria

- [ ] Reservation package defines canonical timestamp contract (`reservation_start_ts`, `reservation_end_ts`)
- [ ] Overlap rule captured in package-level test/spec (`a_start < b_end && b_start < a_end`)
- [ ] Timezone resolution policy preserved (`outlet -> company`, no UTC fallback)

## Files to Modify

- `packages/modules/reservations/src/index.ts` (create/update)
- `packages/modules/reservations/src/time/*` (create)
- `docs/tech-specs/reservations-detachment-notes.md` (optional)

## Dependencies

- story-23.0.3 (Package scaffolds must exist)

## Estimated Effort

3 hours

## Priority

P1

## Validation Commands

```bash
cd /home/ahmad/jurnapod
npm run typecheck -w @jurnapod/modules-reservations
npm run test:unit:single -w @jurnapod/api src/lib/reservations/*.test.ts
```

## Notes

The time model is critical for reservation correctness. Ensure the overlap rule matches existing behavior: a_start < b_end && b_start < a_end.
