# story-27.6: API simplification + full validation gate

## Description

Thin the API route to pure adapter, clean up remaining dead files, run full validation gate.

## Context

After stories 27.1–27.5:
- `sync-push-posting.ts` deleted (27.2)
- `cogs-posting.ts` deleted (27.3)
- `sync/push/stock.ts` reduced to delegation or deleted (27.4)
- `pos-sync` phase2 stubs replaced (27.5)

This final story ensures the API route is genuinely thin and runs the full gate.

## Acceptance Criteria

- [ ] `apps/api/src/routes/sync/push.ts` is thin adapter only:
  - Auth middleware
  - Zod validation
  - Request mapping to package input types
  - Response mapping from package output types
  - Feature-flag gating
  - NO business SQL
  - NO direct module calls (only through package facades)
- [ ] `apps/api/src/lib/sync/push/transactions.ts` heavy orchestration removed (should delegate to pos-sync)
- [ ] `apps/api/src/lib/sync/push/stock.ts` deleted or thin delegation only
- [ ] Remaining API sync push files are mapping/adapter only
- [ ] `npm run typecheck -w @jurnapod/api`
- [ ] `npm run build -w @jurnapod/api`
- [ ] `npm run test:unit:single -w @jurnapod/api src/routes/sync/push.test.ts`
- [ ] `npm run test:unit:critical -w @jurnapod/api`
- [ ] Sync push integration tests pass (duplicate replay, retry safety, journal correctness)
- [ ] All Epic 27 story statuses updated to `done`
- [ ] `epic-27: done` in sprint-status.yaml

## Files to Modify

```
apps/api/src/routes/sync/push.ts           (thin to adapter only)
apps/api/src/lib/sync/push/transactions.ts  (remove heavy orchestration)
apps/api/src/lib/sync/push/stock.ts         (delete or thin)
```

## Dependency

- `story-27.6` → `story-27.5` (full gate only after all packages wired)

## Validation Commands

```bash
npm run typecheck -w @jurnapod/pos-sync
npm run build -w @jurnapod/pos-sync
npm run typecheck -w @jurnapod/modules-inventory
npm run build -w @jurnapod/modules-inventory
npm run typecheck -w @jurnapod/modules-accounting
npm run build -w @jurnapod/modules-accounting
npm run typecheck -w @jurnapod/api
npm run build -w @jurnapod/api
npm run test:unit:single -w @jurnapod/api src/routes/sync/push.test.ts
npm run test:unit:critical -w @jurnapod/api
npm run test:unit -w @jurnapod/api
```

## Epic Completion Checklist

- [ ] All 6 Epic 27 stories marked `done` in sprint-status.yaml
- [ ] `epic-27: done`
- [ ] Coordination doc updated with final results
