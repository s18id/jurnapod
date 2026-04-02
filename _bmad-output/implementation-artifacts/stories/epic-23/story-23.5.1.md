# story-23.5.1: Remove deprecated API lib implementations

## Description
Remove deprecated duplicate implementations from `apps/api/src/lib` that have been extracted to packages, leaving only adapters and boundary glue.

## Acceptance Criteria

- [ ] Deprecated duplicate implementations removed from `apps/api/src/lib`
- [ ] Remaining API lib files are adapters or boundary glue only
- [ ] No orphan imports/exports remain

## Files to Modify

- `apps/api/src/lib/**` (targeted deletions/cleanup)
- `apps/api/src/lib/index.ts` or route imports (if applicable)

## Dependencies

- Completion of Phase 1-4 relevant extraction stories

## Estimated Effort

3 hours

## Priority

P1

## Validation Commands

```bash
cd /home/ahmad/jurnapod
npm run typecheck -w @jurnapod/api
npm run build -w @jurnapod/api
npm run test:unit:critical -w @jurnapod/api
```

## Notes

Perform this cleanup carefully. Ensure no active code paths reference the deprecated implementations before removal.
