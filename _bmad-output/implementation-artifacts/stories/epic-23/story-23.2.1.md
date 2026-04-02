# story-23.2.1: Move posting engines to @jurnapod/modules-accounting

## Description
Move posting engine implementations (sales, COGS, depreciation, sync-push) from the API to the modules-accounting package, centralizing GL posting logic.

## Acceptance Criteria

- [ ] `sales-posting`, `cogs-posting`, `depreciation-posting`, `sync-push-posting` runtime logic moved to accounting package
- [ ] Accounting package exports stable posting interfaces for API/domain callers
- [ ] No financial behavior drift in journal balancing and posting idempotency tests

## Files to Modify

- `packages/modules/accounting/src/posting/*` (create)
- `apps/api/src/lib/sales-posting.ts` (adapter/removal)
- `apps/api/src/lib/cogs-posting.ts` (adapter/removal)
- `apps/api/src/lib/depreciation-posting.ts` (adapter/removal)
- `apps/api/src/lib/sync-push-posting.ts` (adapter/removal)

## Dependencies

- story-23.1.4 (Platform audit extraction should be complete)

## Estimated Effort

4 hours

## Priority

P1

## Validation Commands

```bash
cd /home/ahmad/jurnapod
npm run typecheck -w @jurnapod/modules-accounting
npm run build -w @jurnapod/modules-accounting
npm run test:unit:critical -w @jurnapod/api
npm run test:unit:single -w @jurnapod/api src/routes/sync/push.test.ts
```

## Notes

**CRITICAL**: This is a P0 risk area. All journal balancing must remain correct. Ensure posting idempotency is preserved. Run full critical test suite before and after extraction.
