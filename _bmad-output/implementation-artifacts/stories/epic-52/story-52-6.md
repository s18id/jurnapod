# Story 52-6: Sync Contract: Standardize OK/DUPLICATE/ERROR Semantics

## Story Metadata

| Field | Value |
|-------|-------|
| Story ID | 52-6 |
| Epic | Epic 52: Datetime Standardization + Idempotency Hardening |
| Title | Sync Contract: Standardize OK/DUPLICATE/ERROR Semantics |
| Status | backlog |
| Risk | P0 |
| Owner | architect |
| QA Gate | yes |
| Dependencies | Story 52-3 (POS timestamp alignment) |

## Story

Enforce canonical sync status enum `OK | DUPLICATE | ERROR` across all sync adapters; eliminate `CONFLICT` and alias status values; all sync responses use consistent schema.

## Context

The explorer audit found `CONFLICT` status in some sync schemas and alias fields (`sync_data_version`, `sync_tier_version`) still present in response payloads. The canonical sync contract specifies:
- Push request cursor: `since_version`
- Push response cursor: `data_version`
- Status: `OK | DUPLICATE | ERROR` only

## Acceptance Criteria

- [ ] `PosSyncPushResultSchema` and `PosSyncPullResponseSchema` use `z.enum(["OK", "DUPLICATE", "ERROR"])` exclusively
- [ ] `TableSyncPushStatusSchema` updated: remove `CONFLICT` status (not in canonical contract)
- [ ] All sync push handlers return `{ client_tx_id, result: "OK"|"DUPLICATE"|"ERROR", ... }`
- [ ] All sync pull handlers use `since_version` (request) / `data_version` (response) per canonical contract
- [ ] `sync_versions` table is single storage authority; no `sync_data_versions` or `sync_tier_versions` in response payloads
- [ ] Tiered sync rows use explicit `tier` column; tiered requests validated

## Tasks/Subtasks

- [ ] 6.1 Audit all sync schemas in `packages/shared/src/schemas/` for status enums
- [ ] 6.2 Find and remove `CONFLICT` status from any sync status schema
- [ ] 6.3 Audit all sync pull response payloads for alias cursor fields (`sync_data_version`, `sync_tier_version`)
- [ ] 6.4 Replace all alias fields with canonical `data_version`
- [ ] 6.5 Verify `sync_versions` table is the sole cursor storage authority
- [ ] 6.6 Verify tiered sync uses explicit `tier` column values
- [ ] 6.7 Add integration test: sync push returns only OK/DUPLICATE/ERROR (no CONFLICT)
- [ ] 6.8 Add integration test: sync pull uses `since_version`/`data_version` correctly
- [ ] 6.9 Run `npm run test:integration -w @jurnapod/pos-sync -- --grep "OK.*DUPLICATE.*ERROR" --run`

## Dev Notes

- `CONFLICT` is not a valid sync status per canonical contract — it should not exist in any sync schema
- `sync_data_version` and `sync_tier_version` are legacy alias fields — must not appear in any response payload
- The canonical sync contract is defined in project-context.md and AGENTS.md
- `sync_versions` table has rows with `tier IS NULL` for data-sync version, and explicit tier values for tiered sync

## Validation Commands

```bash
rg "CONFLICT" packages/shared/src/schemas/ --type ts
rg "sync_data_version|sync_tier_version" packages/ --type ts -l
# Both should be zero
npm run test:integration -w @jurnapod/pos-sync -- --grep "OK.*DUPLICATE.*ERROR" --run
```

## File List

```
packages/shared/src/schemas/
packages/pos-sync/src/
packages/sync-core/src/
apps/api/src/routes/sync/
```

## Change Log

- (none yet)

## Dev Agent Record

- (none yet)