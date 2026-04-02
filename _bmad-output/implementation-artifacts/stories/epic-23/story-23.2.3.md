# story-23.2.3: Thin API accounting adapters to composition-only

## Description
Refactor API accounting adapters to be thin composition/IO boundary layers only, removing any business logic duplication.

## Acceptance Criteria

- [ ] API `accounts/account-types/journals` libs perform composition/IO boundary only
- [ ] Service construction duplication removed from API
- [ ] Public API behavior unchanged (status codes, envelopes, validations)

## Files to Modify

- `apps/api/src/lib/accounts.ts` (refactor to adapter)
- `apps/api/src/lib/account-types.ts` (refactor to adapter)
- `apps/api/src/lib/journals.ts` (refactor to adapter)
- Related route files in `apps/api/src/routes/**` (minimal wiring updates)

## Dependencies

- story-23.2.2 (Reconciliation service extraction should be complete)

## Estimated Effort

3 hours

## Priority

P2

## Validation Commands

```bash
cd /home/ahmad/jurnapod
npm run test:unit:critical -w @jurnapod/api
npm run test:unit:single -w @jurnapod/api src/routes/accounts/*.test.ts
```

## Notes

The API routes should only handle HTTP concerns (validation, auth, response formatting). All business logic should delegate to the accounting package.
