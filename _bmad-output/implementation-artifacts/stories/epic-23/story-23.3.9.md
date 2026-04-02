# story-23.3.9: Extract service-session + table-sync

## Description
Move service-session and table-sync domain logic from the API to the modules-reservations package with interface-based sync integration.

## Acceptance Criteria

- [ ] Service-session and table-sync domain logic moved to reservations package
- [ ] Sync-facing integration points are interface-based (no transport coupling)
- [ ] Tenant scoping tests pass

## Files to Modify

- `packages/modules/reservations/src/service-sessions/*` (create)
- `packages/modules/reservations/src/table-sync/*` (create)
- `apps/api/src/lib/service-sessions/*` (adapter/removal)
- `apps/api/src/lib/table-sync.ts` (adapter/removal)

## Dependencies

- story-23.3.8 (Reservations/table extraction should be complete)

## Estimated Effort

3 hours

## Priority

P2

## Validation Commands

```bash
cd /home/ahmad/jurnapod
npm run test:unit:single -w @jurnapod/api src/routes/service-sessions/*.test.ts
npm run test:unit:sync -w @jurnapod/api
```

## Notes

Service sessions integrate with sync protocol. Ensure no direct sync transport dependencies in the domain package.
