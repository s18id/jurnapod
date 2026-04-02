# story-23.4.1: Extract sync push business logic

## Description
Extract residual sync push business logic from the API routes to package services, thinning the push route to auth/validation/response orchestration only.

## Acceptance Criteria

- [ ] `routes/sync/push.ts` retains only auth/validation/response orchestration
- [ ] Push domain handling delegated to package services
- [ ] `client_tx_id` idempotency behavior unchanged

## Files to Modify

- `apps/api/src/routes/sync/push.ts` (thin to adapter)
- `packages/sync-core/src/*` and/or affected domain package sync adapters
- `apps/api/src/lib/sync/*` (adapter cleanup)

## Dependencies

- story-23.2.1 (Posting engines extraction should be complete)
- story-23.3.2 (Orders extraction should be complete)
- story-23.3.5 (Item catalog extraction should be complete)
- story-23.3.8 (Reservations extraction should be complete)

## Estimated Effort

4 hours

## Priority

P1

## Validation Commands

```bash
cd /home/ahmad/jurnapod
npm run test:unit:sync -w @jurnapod/api
npm run test:unit:single -w @jurnapod/api src/routes/sync/push.test.ts
```

## Notes

**CRITICAL**: Sync push affects POS offline-first behavior. client_tx_id idempotency must be preserved. Run full sync test suite.
