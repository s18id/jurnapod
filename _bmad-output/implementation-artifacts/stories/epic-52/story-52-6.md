# Story 52-6: Sync Contract: Standardize OK/DUPLICATE/ERROR Semantics

## Story Metadata

| Field | Value |
|-------|-------|
| Story ID | 52-6 |
| Epic | Epic 52: Datetime Standardization + Idempotency Hardening |
| Title | Sync Contract: Standardize OK/DUPLICATE/ERROR Semantics |
| Status | done |
| Risk | P0 |
| Owner | dev |
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

- [x] `PosSyncPushResultSchema` and POS sync pull contracts use canonical statuses/cursors (`OK|DUPLICATE|ERROR`, `since_version`, `data_version`)
- [x] `TableSyncPushStatusSchema` updated: remove `CONFLICT` status (not in canonical contract)
- [x] All sync push handlers return `{ client_tx_id, result: "OK"|"DUPLICATE"|"ERROR", ... }`
- [x] All sync pull handlers use `since_version` (request) / `data_version` (response) per canonical contract
- [x] `sync_versions` table is single storage authority; no `sync_data_versions` or `sync_tier_versions` in response payloads
- [x] Tiered sync rows use explicit `tier` column; tiered requests validated

## Tasks/Subtasks

- [x] 6.1 Audit all sync schemas in `packages/shared/src/schemas/` for status enums
- [x] 6.2 Find and remove `CONFLICT` status from any sync status schema
- [x] 6.3 Audit all sync pull response payloads for alias cursor fields (`sync_data_version`, `sync_tier_version`)
- [x] 6.4 Replace all alias fields with canonical `data_version`
- [x] 6.5 Verify `sync_versions` table is the sole cursor storage authority
- [x] 6.6 Verify tiered sync uses explicit `tier` column values
- [x] 6.7 Add integration test: sync push returns only OK/DUPLICATE/ERROR (no CONFLICT)
- [x] 6.8 Add integration test: sync pull uses `since_version`/`data_version` correctly
- [x] 6.9 Run `npm run test:integration -w @jurnapod/pos-sync -- --grep "OK.*DUPLICATE.*ERROR" --run` (documented command is invalid for current Vitest; equivalent integration command executed)

## Audit Findings

### Status enum audit (`packages/shared/src/schemas/`)

- `CONFLICT` existed in `TableSyncPushStatusSchema` at `packages/shared/src/schemas/table-reservation.ts`.
- POS sync push result schemas already used canonical `z.enum(["OK", "DUPLICATE", "ERROR"])` in `packages/shared/src/schemas/pos-sync.ts`.

### Cursor alias audit (`sync_data_version`, `sync_tier_version`)

- No alias cursor fields found in runtime sync payload schemas/routes.
- Remaining matches are archival DB type names in `packages/db/src/kysely/schema.ts`:
  - `archive_sync_data_versions`
  - `archive_sync_tier_versions`
  These are schema type names only, not runtime response payload fields.

### Canonical cursor audit (`since_version`, `data_version`)

- `apps/api/src/routes/sync/pull.ts` uses `since_version` request query parsing and delegates to module `sinceVersion`.
- Pull response contract validates payload with `SyncPullPayloadSchema` containing `data_version`.
- `packages/pos-sync/src/*` and `packages/sync-core/src/*` remain aligned with canonical contract.

## Dev Notes

- `CONFLICT` is not a valid sync status per canonical contract — it should not exist in any sync schema
- `sync_data_version` and `sync_tier_version` are legacy alias fields — must not appear in any response payload
- The canonical sync contract is defined in project-context.md and AGENTS.md
- `sync_versions` table has rows with `tier IS NULL` for data-sync version, and explicit tier values for tiered sync

## Validation Commands

```bash
rg "CONFLICT" packages/shared/src/schemas/ --type ts
rg "sync_data_version|sync_tier_version" packages/ --type ts -l
npm run build -w @jurnapod/shared
npm run build -w @jurnapod/modules-reservations
npm run build -w @jurnapod/pos-sync
npm run typecheck -w @jurnapod/shared
npm run typecheck -w @jurnapod/modules-reservations
npm run typecheck -w @jurnapod/pos-sync

# Canonical integration validation commands
npm test -w @jurnapod/shared -- --run __test__/unit/table-reservation.test.ts
npm run test:integration -w @jurnapod/pos-sync -- --run __test__/integration/pos-sync-module.integration.test.ts
npm run test:integration -w @jurnapod/pos-sync -- --run __test__/integration
npm test -w @jurnapod/modules-reservations -- --run
```

Validation results:
- `rg "CONFLICT" packages/shared/src/schemas/ --type ts` → **0 matches** ✅
- `rg "sync_data_version|sync_tier_version" packages/ --type ts -l` → only archival DB schema type names in `packages/db/src/kysely/schema.ts` ✅
- `@jurnapod/shared` unit test target: **1 file, 7 tests passed** ✅
- `@jurnapod/pos-sync` integration target (`pos-sync-module.integration.test.ts`): **1 file, 26 tests passed** ✅
- `@jurnapod/pos-sync` integration suite (`__test__/integration`): **2 files, 37 tests passed** ✅
- `@jurnapod/modules-reservations` suite: **3 files, 26 tests passed** ✅
- Build/typecheck: shared + modules-reservations + pos-sync all pass ✅

## File List

```
packages/shared/src/schemas/table-reservation.ts
packages/modules/reservations/src/table-sync/types.ts
packages/modules/reservations/src/table-sync/service.ts
packages/shared/__test__/unit/table-reservation.test.ts
packages/pos-sync/__test__/integration/pos-sync-module.integration.test.ts
_bmad-output/implementation-artifacts/sprint-status.yaml
_bmad-output/implementation-artifacts/stories/epic-52/story-52-6.md
```

## Change Log

- 2026-04-30 — Story 52-6 implementation started using 52-1 reporting convention.
- 2026-04-30 — Removed `CONFLICT` from `TableSyncPushStatusSchema` and reservations table-sync result union.
- 2026-04-30 — Canonicalized table-sync conflict response status to `ERROR` while preserving `conflictPayload` and setting `error_message`.
- 2026-04-30 — Added shared schema unit tests to enforce canonical table-sync statuses and reject `CONFLICT`.
- 2026-04-30 — Added pos-sync integration tests for canonical pull cursor (`since_version` → `data_version`) and canonical push statuses (`OK|DUPLICATE|ERROR`).
- 2026-04-30 — Verified alias cursor fields are absent in runtime payloads; archival DB type names only remain in Kysely schema typings.
- 2026-04-30 — Code review cleanup: updated stale conflict helper comment and corrected validation command documentation to current Vitest-compatible commands.

## Dev Agent Record

### What was implemented

- Removed non-canonical `CONFLICT` from public table-sync status contract:
  - `packages/shared/src/schemas/table-reservation.ts`: `TableSyncPushStatusSchema` now `z.enum(['OK', 'DUPLICATE', 'ERROR'])`.
  - `packages/modules/reservations/src/table-sync/types.ts`: `PushTableEventResult.status` union now `'OK' | 'DUPLICATE' | 'ERROR'`.
- Updated conflict return path in `packages/modules/reservations/src/table-sync/service.ts`:
  - status changed `CONFLICT` → `ERROR`
  - `conflictPayload` preserved
  - `error_message` set to concrete conflict reason.

### Tests created/updated

- `packages/shared/__test__/unit/table-reservation.test.ts`
  - Added test asserting canonical status acceptance (`OK`, `DUPLICATE`, `ERROR`).
  - Added test asserting `CONFLICT` is rejected by `TableSyncPushResultSchema`.
- `packages/pos-sync/__test__/integration/pos-sync-module.integration.test.ts`
  - Added pull contract test: `since_version` request usage maps to pull results containing canonical `data_version`.
  - Added push contract test: observed statuses from OK + DUPLICATE + ERROR flows are canonical only (no `CONFLICT`).

### Key decisions (SOLID / DRY / KISS / YAGNI)

- **SOLID:** Limited changes to contract edges (schema + explicit result typing + conflict return value); no unrelated refactors.
- **DRY:** Reused existing conflict payload structure (`conflictPayload`) rather than introducing duplicate conflict channels.
- **KISS:** Canonicalized one status value (`CONFLICT` → `ERROR`) without changing conflict-detection logic.
- **YAGNI:** Kept internal sync-core conflict classification untouched because it is internal retry taxonomy, not public API contract.

### Verification

- `npm run build -w @jurnapod/shared` ✅
- `npm run build -w @jurnapod/modules-reservations` ✅
- `npm run build -w @jurnapod/pos-sync` ✅
- `npm run typecheck -w @jurnapod/shared` ✅
- `npm run typecheck -w @jurnapod/modules-reservations` ✅
- `npm run typecheck -w @jurnapod/pos-sync` ✅
- `npm test -w @jurnapod/shared -- --run __test__/unit/table-reservation.test.ts` ✅ (7 passed)
- `npm run test:integration -w @jurnapod/pos-sync -- --run __test__/integration/pos-sync-module.integration.test.ts` ✅ (26 passed)
- `npm run test:integration -w @jurnapod/pos-sync -- --run __test__/integration` ✅ (37 passed)
- `npm test -w @jurnapod/modules-reservations -- --run` ✅ (26 passed)

### Notes

- Validation command block now lists Vitest-compatible integration commands executed in this story.
- **Breaking-change note:** Table-sync conflict responses now use `status: "ERROR"` (not `"CONFLICT"`). Consumers that branched on `status === "CONFLICT"` MUST migrate to `status === "ERROR"` and inspect `conflict_payload` for version-conflict context.

## Senior Developer Review (AI)

- Date: 2026-04-30
- Outcome: **Approve**

### Findings Summary

- High: 0
- Medium: 2
- Low: 4

### Action Items

- [x] [Medium] Update stale comment in `packages/modules/reservations/src/table-sync/service.ts` (`CONFLICT CANONICALIZATION` → `VERSION CONFLICT PAYLOAD`).
- [x] [Medium] Replace broken Vitest `--grep` validation command in story docs with executed, Vitest-compatible commands.

### Review Notes

- Canonical public sync status contract (`OK | DUPLICATE | ERROR`) is enforced in shared table sync schema and reservations table-sync typing.
- Conflict path canonicalization is correct: result status is `ERROR` while `conflictPayload` is preserved for caller conflict handling.
- Cursor contract (`since_version` request, `data_version` response) remains canonical in API route and module integration tests.

### Review Findings (bmad-code-review)

- [x] [Review][Patch] Schema `errorMessage` naming inconsistent vs snake_case convention [`packages/shared/src/schemas/table-reservation.ts:482`]
  - Fixed: field is now `error_message` to align with snake_case contract fields (`client_tx_id`, `table_version`, `conflict_payload`).
- [x] [Review][Patch] Add breaking-change note for `CONFLICT`→`ERROR` status change [`_bmad-output/implementation-artifacts/stories/epic-52/story-52-6.md`]
  - Table-sync consumers handling `CONFLICT` specially need migration guidance.
- [x] [Review][Patch] Schema test `.toThrow()` is too generic [`packages/shared/__test__/unit/table-reservation.test.ts:96`]
  - Fixed: `CONFLICT` rejection test now uses `safeParse` and asserts `status` enum validation failure details.
- [x] [Review][Defer] No table-sync integration tests for conflict path — deferred, pre-existing infrastructure gap (no table-sync integration test harness exists)
