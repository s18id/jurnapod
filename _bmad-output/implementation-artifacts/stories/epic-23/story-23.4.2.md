# story-23.4.2: Extract sync pull business logic

## Description
Extract residual sync pull business logic from the API routes to package services, preserving cursor contracts and sync version store invariants.

## Acceptance Criteria

- [ ] `routes/sync/pull.ts` contains only route adapter concerns
- [ ] Cursor contract unchanged (`since_version` in request, `data_version` in response)
- [ ] Sync version store invariant preserved (`sync_versions`, no legacy table dependencies)

## Files to Modify

- `apps/api/src/routes/sync/pull.ts` (thin to adapter)
- `packages/sync-core/src/*` and/or domain sync handlers
- `apps/api/src/lib/sync/*` (adapter cleanup)

## Dependencies

- story-23.4.1 (Sync push extraction should be complete)

## Estimated Effort

4 hours

## Priority

P1

## Validation Commands

```bash
cd /home/ahmad/jurnapod
npm run test:unit:sync -w @jurnapod/api
npm run test:unit:single -w @jurnapod/api src/routes/sync/pull.test.ts
```

## Notes

**CRITICAL**: The sync protocol must remain unchanged. since_version and data_version are canonical field names. Ensure sync_versions table remains the single source of truth.
