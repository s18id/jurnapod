# story-23.3.9: Extract service-session + table-sync

## Description
Move service-session and table-sync domain logic from the API to the modules-reservations package with interface-based sync integration.

## Acceptance Criteria

- [x] Service-session and table-sync domain logic moved to reservations package
- [x] Sync-facing integration points are interface-based (no transport coupling)
- [x] Tenant scoping tests pass

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
npm run test:unit:single -w @jurnapod/api src/lib/service-sessions.test.ts
npm run test:unit:single -w @jurnapod/api src/routes/sync/push.test.ts
npm run test:unit:single -w @jurnapod/api src/routes/sync/pull.test.ts
npm run typecheck -w @jurnapod/modules-reservations
npm run typecheck -w @jurnapod/api
```

## Notes

Service sessions integrate with sync protocol. Ensure no direct sync transport dependencies in the domain package.

## Status

REVIEW

## Dev Agent Record

### Implementation Summary

1. **Service Sessions** - Domain logic already existed in `packages/modules/reservations/src/service-sessions/`:
   - `types.ts` - Error classes and types
   - `session-utils.ts` - Shared utilities (mappers, helpers)
   - `lifecycle.ts` - getSession, listSessions, lockSessionForPayment, closeSession
   - `lines.ts` - addSessionLine, updateSessionLine, removeSessionLine
   - `checkpoint.ts` - finalizeSessionBatch, adjustSessionLine

2. **Table Sync** - Created new implementation in `packages/modules/reservations/src/table-sync/`:
   - `types.ts` - Already existed with interface types
   - `service.ts` - Full implementation with interface-based integration
   - `index.ts` - Re-exports

3. **API Thin Adapters** - Updated API files to delegate to reservations module:
   - `apps/api/src/lib/service-sessions/types.ts` - Re-exports from @jurnapod/modules-reservations
   - `apps/api/src/lib/service-sessions/session-utils.ts` - Re-exports from @jurnapod/modules-reservations
   - `apps/api/src/lib/service-sessions/lifecycle.ts` - Thin adapter injecting db connection
   - `apps/api/src/lib/service-sessions/lines.ts` - Thin adapter injecting db connection
   - `apps/api/src/lib/service-sessions/checkpoint.ts` - Thin adapter injecting db connection
   - `apps/api/src/lib/service-sessions/index.ts` - Simplified re-exports
   - `apps/api/src/lib/table-sync.ts` - Thin adapter with ApiSettingsResolver

4. **Module Export** - Updated `packages/modules/reservations/src/index.ts` to export:
   - `service-sessions/index.js`
   - `table-sync/index.js`

5. **Path Alias** - Added `@jurnapod/modules-reservations` to `tsconfig.base.json`

### Test Results

- Service sessions tests: **22/22 PASSED**
- Sync push tests: **34/34 PASSED**
- Sync pull tests: **23/23 PASSED**
- TypeScript typecheck: **Passes for both modules**

### Key Design Decisions

1. **Interface-based integration**: Table sync uses `ISettingsResolver` interface to decouple from transport
2. **Db injection pattern**: API adapters inject `db` connection via `getDb()` before calling module functions
3. **Backward compatibility**: API exports same types and functions, just delegating to module

## Files Modified/Created

### packages/modules/reservations/
- `src/index.ts` - Added service-sessions and table-sync exports
- `src/table-sync/types.ts` - Existing interface types
- `src/table-sync/service.ts` - **NEW** Full implementation
- `src/table-sync/index.ts` - **NEW** Module exports

### apps/api/src/lib/
- `service-sessions/types.ts` - **MODIFIED** Now re-exports from module
- `service-sessions/session-utils.ts` - **MODIFIED** Now re-exports from module
- `service-sessions/lifecycle.ts` - **MODIFIED** Thin adapter
- `service-sessions/lines.ts` - **MODIFIED** Thin adapter
- `service-sessions/checkpoint.ts` - **MODIFIED** Thin adapter
- `service-sessions/index.ts` - **MODIFIED** Simplified re-exports
- `table-sync.ts` - **MODIFIED** Thin adapter with ApiSettingsResolver

### Root
- `tsconfig.base.json` - Added `@jurnapod/modules-reservations` path