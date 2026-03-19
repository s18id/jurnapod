# Story 12.6: POS Sync for Table Operations

Status: done

## Story

As a POS device,
I want to sync table state changes with the server,
so that multiple cashiers see consistent table states across terminals.

## Acceptance Criteria

1. **Given** offline POS operations
   **When** `POST /api/sync/push/table-events` is called with `client_tx_id`
   **Then** idempotency check prevents duplicate processing
   **And** events are applied transactionally
   **And** table versions are incremented atomically

2. **Given** sync with conflicts
   **When** `expected_table_version` does not match server version
   **Then** `409 CONFLICT` is returned with canonical current state
   **And** conflict events are audit-logged for traceability
   **And** POS can resolve conflict and retry with updated version

3. **Given** POS needs current state
   **When** `GET /api/sync/pull/table-state` is called with cursor
   **Then** response includes table occupancy snapshots
   **And** incremental events since cursor are returned
   **And** response includes `staleness_ms` for each table

4. **Given** two cashiers modify same table simultaneously
   **When** both push events with same expected version
   **Then** first operation succeeds
   **And** second receives `CONFLICT` with merged state
   **And** both events are logged for audit trail

5. **Given** network instability
   **When** sync retries occur
   **Then** exponential backoff is applied (max 5 retries)
   **And** duplicate `client_tx_id` values are silently accepted
   **And** no partial state changes are committed

## Tasks / Subtasks

- [x] Task 1: Add shared table-sync contracts in `@jurnapod/shared` (AC: 1,2,3,5)
  - [x] Subtask 1.1: Add `TableSyncPushRequestSchema` with strict validation for `client_tx_id`, `expected_table_version`, actor/outlet scoping, and event payload
  - [x] Subtask 1.2: Add `TableSyncPushResponseSchema` with per-event result (`OK | DUPLICATE | ERROR | CONFLICT`) and canonical conflict payload
  - [x] Subtask 1.3: Add `TableSyncPullRequestSchema` and `TableSyncPullResponseSchema` including cursor, occupancy snapshots, incremental events, `staleness_ms`
  - [x] Subtask 1.4: Export schemas/constants from shared index and align with `packages/shared/src/constants/table-states.ts`

- [x] Task 2: Implement table sync domain service in API lib (AC: 1,2,3,4,5)
  - [x] Subtask 2.1: Create `apps/api/src/lib/table-sync.ts` for transactional mutation/apply logic
  - [x] Subtask 2.2: Implement idempotency using `table_events` unique key `(company_id, outlet_id, client_tx_id)`
  - [x] Subtask 2.3: Implement optimistic lock check against current `table_occupancy.version`
  - [x] Subtask 2.4: On conflict, return canonical state snapshot (`occupancy`, active session metadata, latest version)
  - [x] Subtask 2.5: Implement pull reader using cursor (`table_events.id` or `recorded_at`) and include `staleness_ms`
  - [x] Subtask 2.6: Ensure all write paths are atomic (`beginTransaction/commit/rollback`) and append audit events

- [x] Task 3: Implement `POST /api/sync/push/table-events` route (AC: 1,2,4,5)
  - [x] Subtask 3.1: Create route file `apps/api/app/api/sync/push/table-events/route.ts`
  - [x] Subtask 3.2: Enforce auth + outlet access guard via `withAuth` and `requireAccess`
  - [x] Subtask 3.3: Parse and validate payload with new shared Zod schema
  - [x] Subtask 3.4: Return deterministic per-event outcomes and conflict payload format
  - [x] Subtask 3.5: Add correlation-id and sync audit hooks consistent with existing `/api/sync/push`

- [x] Task 4: Implement `GET /api/sync/pull/table-state` route (AC: 3)
  - [x] Subtask 4.1: Create route file `apps/api/app/api/sync/pull/table-state/route.ts`
  - [x] Subtask 4.2: Enforce auth + outlet access guard and query validation
  - [x] Subtask 4.3: Return occupancy snapshot + incremental table events + cursor + `staleness_ms`
  - [x] Subtask 4.4: Keep response shape stable and parse with response schema before returning

- [x] Task 5: Add test coverage for sync idempotency/conflict/concurrency (AC: 1,2,3,4,5)
  - [x] Subtask 5.1: Add integration tests for push idempotency replay (`DUPLICATE`), conflict (`409`), and tenant/outlet isolation
  - [x] Subtask 5.2: Add integration tests for pull cursor behavior and incremental event windows
  - [x] Subtask 5.3: Add concurrency test (dual-cashier same table/version race; first wins, second conflicts)
  - [x] Subtask 5.4: Add retry-path tests for unstable network semantics (same `client_tx_id` returns stable replay)
  - [x] Subtask 5.5: Ensure DB pool cleanup hooks are present in any new unit test file

- [x] Task 6: Documentation and story evidence updates (AC: all)
  - [x] Subtask 6.1: Update `docs/API.md` with table-sync push/pull contracts and conflict examples
  - [x] Subtask 6.2: Update architecture/schema docs if new columns/indexes are added
  - [x] Subtask 6.3: Add completion evidence in story (files changed, tests, known limitations)

### Review Follow-ups (AI)

- [x] [AI-Review][HIGH] Return HTTP 409 for sync conflict responses to match AC2, or update AC/docs/tests if 200-with-item-CONFLICT is intended contract. [apps/api/app/api/sync/push/table-events/route.ts:183] ✓ FIXED - Route returns 409 when any event has CONFLICT status
- [x] [AI-Review][HIGH] Ensure conflict attempts are audit-traceable in table event history (append conflict event or equivalent immutable audit entry) to satisfy AC4. [apps/api/src/lib/table-sync.ts:308] ✓ FIXED - Conflict attempts are appended to `table_events` with `is_conflict=1` and `conflict_reason` under transactional flow for immutable traceability
- [x] [AI-Review][HIGH] Add bounded exponential retry handling for transient sync write failures (max 5 attempts) while preserving idempotency/no partial commit semantics (AC5). [apps/api/src/lib/table-sync.ts:220] ✓ FIXED - Added retry loop with exponential backoff for lock/deadlock errors
- [x] [AI-Review][MEDIUM] Update Dev Agent Record File List to include all modified implementation and test files for this story. [_bmad-output/implementation-artifacts/stories/epic-12/story-12.6.md:245] ✓ FIXED - Comprehensive file list added under Dev Agent Record
- [x] [AI-Review][MEDIUM] Align push result schema and route mapping so ERROR rows do not emit invalid `table_version=0` against positive-int contract. [packages/shared/src/schemas/table-reservation.ts:480] ✓ FIXED - Route now emits `null` when table version is unavailable
- [x] [AI-Review][MEDIUM] Reduce direct SQL fixture setup in integration tests where API setup endpoints exist; keep DB writes for cleanup/read-only verification only. [apps/api/app/api/sync/push/table-events/route.test.ts:109] ✓ FIXED - Removed occupancy fallback insert and assert API-created occupancy record
- [x] [AI-Review][MEDIUM] Normalize pull route test assertions to numeric IDs to match current API contract and avoid brittle string coercion assumptions. [apps/api/app/api/sync/pull/table-state/route.test.ts:154] ✓ FIXED - Pull tests now assert normalized numeric payload fields/endpoints
- [x] [AI-Review][LOW] Fix stale comments in push route that still describe `outlet_id` as UUID. [apps/api/app/api/sync/push/table-events/route.ts:111] ✓ FIXED - Comment updated to reflect numeric ID coercion
- [x] [AI-Review][HIGH] Ensure `pushTableEvents` emits exactly one result per input event by exiting retry loop on terminal outcomes (not-found/duplicate) instead of retry-loop continue. [apps/api/src/lib/table-sync.ts:254] ✓ FIXED - Terminal branches now break current event loop and preserve 1:1 result mapping
- [x] [AI-Review][HIGH] Remove duplicate optimistic-version conflict path outside transaction and keep conflict detection under transactional `FOR UPDATE` lock. [apps/api/src/lib/table-sync.ts:296] ✓ FIXED - Pre-transaction conflict branch removed; transactional conflict handling remains canonical
- [x] [AI-Review][MEDIUM] Document `apps/api/package.json` in story file list to align Dev Agent Record with actual git changes. [_bmad-output/implementation-artifacts/stories/epic-12/story-12.6.md:265] ✓ FIXED - File list now includes API workspace package metadata
- [x] [AI-Review][LOW] Replace weak invalid-event-type test with explicit status/message assertions. [apps/api/app/api/sync/push/table-events/route.test.ts:921] ✓ FIXED - Test now asserts `ERROR` status and non-empty `errorMessage`

## Dev Notes

### Story Foundation and Business Context

- This story is the sync bridge between table/session operations (Stories 12.3-12.5) and multi-terminal consistency.
- The table domain is event-driven: occupancy/session mutations are auditable via append-only `table_events` and replay-safe via `client_tx_id`.
- This story must preserve offline-first semantics: retries are normal behavior and must be safe.
- [Source: _bmad-output/planning-artifacts/epics-split/epic-12-table-reservation-pos-sync.md#Story-12.6-POS-Sync-for-Table-Operations]

### Dependencies on Previous Stories (Do Not Rebuild)

- Story 12.3 already implemented occupancy APIs and optimistic-version behavior (`hold/seat/release`). Reuse those patterns.
- Story 12.4 already implemented reservation transitions and outlet/company scoping.
- Story 12.5 already implemented service session lifecycle, checkpoint finalization, and session events.
- New sync routes must integrate with these existing invariants; do not duplicate domain mutation logic in route handlers.
- [Source: _bmad-output/implementation-artifacts/stories/epic-12/story-12.3.md]
- [Source: _bmad-output/implementation-artifacts/stories/epic-12/story-12.4.md]
- [Source: _bmad-output/implementation-artifacts/stories/epic-12/story-12.5.md#Dev-Notes]

### Technical Requirements (Mandatory)

1. **Idempotency is hard requirement**
   - Enforce uniqueness with existing `table_events` unique key on `(company_id, outlet_id, client_tx_id)`.
   - Duplicate push must return stable replay result, never duplicate effects.
2. **Optimistic concurrency**
   - Validate `expected_table_version` against canonical current occupancy/session version.
   - On mismatch return conflict payload with latest canonical state.
3. **Transactional safety**
   - Mutation apply must execute as one DB transaction: read current version, apply mutation, bump version, append event.
4. **Tenant/outlet isolation**
   - Every query and write path must include `company_id`; outlet-scoped operations must include `outlet_id`.
5. **Append-only event log**
   - Do not update/delete `table_events` rows.
6. **No DB ENUM usage**
   - Use integer status/type constants from shared package.
- [Source: _bmad-output/planning-artifacts/table-reservation-pos-sync-architecture.md#5-Concurrency-and-Conflict-Model]
- [Source: _bmad-output/planning-artifacts/table-reservation-pos-sync-architecture.md#9-Invariants-Must-Hold]

### Architecture Compliance Guardrails

- Reuse existing API route conventions from sync and dine-in routes:
  - auth wrapper via `withAuth`
  - authorization via `requireAccess`
  - request validation with shared Zod schemas
  - `successResponse` / `errorResponse`
  - correlation id and sync audit service for observability
- Prefer existing sync route architecture under `apps/api/app/api/sync/**` instead of creating ad-hoc modules elsewhere.
- Keep business logic in `apps/api/src/lib/*`, not inside route handlers.
- [Source: apps/api/app/api/sync/push/route.ts]
- [Source: apps/api/app/api/sync/pull/route.ts]

### File Structure Requirements

- Create/modify only expected story scope files first:
  - `apps/api/app/api/sync/push/table-events/route.ts`
  - `apps/api/app/api/sync/pull/table-state/route.ts`
  - `apps/api/src/lib/table-sync.ts`
  - `apps/api/app/api/sync/push/table-events/route.test.ts`
  - `apps/api/app/api/sync/pull/table-state/route.test.ts`
  - `packages/shared/src/schemas/table-reservation.ts`
  - `packages/shared/src/constants/table-states.ts` (only if new table sync event constants needed)
- Avoid broad refactors outside these files unless required by failing type checks/tests.

### Testing Requirements

- Add focused tests for:
  - duplicate replay behavior (same `client_tx_id`)
  - version conflict behavior (`expected_table_version` mismatch)
  - dual-cashier race behavior
  - pull cursor correctness and incremental event windows
  - tenant/outlet isolation negative cases
- Integration fixture policy:
  - Use API-driven fixture setup for business entities when endpoints exist
  - Direct DB writes allowed only for teardown/cleanup and read-only verification
- Any new unit test using `getDbPool()` must include:

```typescript
test.after(async () => {
  await closeDbPool();
});
```

- [Source: docs/project-context.md#Testing-Standards]
- [Source: apps/api/AGENTS.md#Unit-test-database-cleanup]

### Previous Story Intelligence (12.5)

- Deterministic idempotency replay is critical; avoid returning "latest row" patterns when replaying.
- Preserve strict conflict semantics when duplicate key belongs to a different logical operation.
- Integration tests were hardened to API-first fixture setup; keep this discipline here.
- Route-level validation and service-level idempotency short-circuit both matter (do not rely on one layer only).
- Session checkpoint model is now canonical; sync payload/state should align with finalized batch/versioned events.
- [Source: _bmad-output/implementation-artifacts/stories/epic-12/story-12.5.md#Review-Follow-ups-AI]
- [Source: _bmad-output/implementation-artifacts/stories/epic-12/story-12.5.md#Completion-Notes-List]

### Git Intelligence Summary (Recent Patterns)

- Recent epic work consistently uses:
  - shared constants/schemas first
  - service-layer transaction functions
  - thin route wrappers with auth and parsing
  - integration tests plus unit tests in same story
- Story 12.5 commit introduced finalize/adjust endpoints and hardened idempotency and snapshot linkage; Story 12.6 should extend this style for sync endpoints, not invent a separate architecture.
- [Source: git log -5 oneline]
- [Source: git log -5 --name-only]

### Latest Technical Information

- Hono docs continue to emphasize lightweight route handlers and middleware composition; current project is already on Hono and should keep route composition patterns used in existing sync routes.
- MySQL2 docs continue to recommend pooled connections + explicit transactions + prepared statements (`execute`) for safe and performant write paths.
- Zod latest line has moved to major v4 upstream, but current repo is on Zod 3.24.x in architecture docs; do not upgrade Zod in this story. Keep compatibility with existing shared schema code and parser behavior.
- [Source: https://hono.dev/docs/]
- [Source: https://sidorares.github.io/node-mysql2/docs]
- [Source: https://www.npmjs.com/package/zod]

### API Contract and Response Guidance

- `POST /api/sync/push/table-events`
  - Input must include outlet + transaction list with `client_tx_id`, event type, table id, expected version, and mutation payload.
  - Response should include per-event results with deterministic code and optional conflict payload.
- `GET /api/sync/pull/table-state?outlet_id=...&cursor=...`
  - Return canonical table snapshots and events since cursor.
  - Return `next_cursor` and `staleness_ms` to support client reconciliation.
- Keep error envelope consistent with existing API conventions.
- [Source: _bmad-output/planning-artifacts/epics-split/epic-12-table-reservation-pos-sync.md#Story-12.6-POS-Sync-for-Table-Operations]
- [Source: docs/api/sync-contract.md]

### Project Structure Notes

- This repository stores implementation stories under `_bmad-output/implementation-artifacts/stories/epic-12/`.
- Story file naming convention is `story-12.X.md` and should be preserved for continuity.
- Keep imports in API routes aligned with alias/path conventions from AGENTS (`@/` for `apps/api/src`).

### References

- `_bmad-output/planning-artifacts/epics-split/epic-12-table-reservation-pos-sync.md`
- `_bmad-output/planning-artifacts/table-reservation-pos-sync-architecture.md`
- `_bmad-output/planning-artifacts/architecture.md`
- `_bmad-output/planning-artifacts/prd.md`
- `docs/project-context.md`
- `docs/api/sync-contract.md`
- `apps/api/app/api/sync/push/route.ts`
- `apps/api/app/api/sync/pull/route.ts`
- `_bmad-output/implementation-artifacts/stories/epic-12/story-12.5.md`

## Dev Agent Record

### Agent Model Used

openai/gpt-5.3-codex

### Debug Log References

- Create-story workflow executed with explicit target `12.6`
- Input discovery completed for epics, architecture, PRD, project context, previous story, and recent git history
- Existing sync route implementations analyzed for reuse patterns

### Completion Notes List

- Completed sync push/pull hardening: removed non-portable pull filter, normalized MySQL row coercions, and added transactional version re-check under `FOR UPDATE` for race safety.
- Added bounded exponential retry (max 5 attempts) for retryable DB lock/deadlock errors in table push processing while preserving transactional rollback semantics.
- Documented conflict audit schema (`is_conflict`, `conflict_reason`, conflict index) and updated API contract examples for push/pull table sync endpoints.
- Validation evidence:
  - `npm run test:unit:single -w @jurnapod/api -- app/api/sync/pull/table-state/route.test.ts` (31/31 pass)
  - `npm run test:unit:single -w @jurnapod/api -- app/api/sync/push/table-events/concurrency.test.ts` (9/9 pass)
  - `npm run test:unit:single -w @jurnapod/api -- app/api/sync/push/table-events/route.test.ts` (24/24 pass)
  - `npm run typecheck -w @jurnapod/api` (pass)
- Code review follow-up fixes applied:
  - Removed duplicate pre-transaction optimistic-version conflict branch from push flow; conflict detection now occurs under transactional `FOR UPDATE` lock for race-safe consistency.
  - Fixed retry-loop terminal paths to ensure one result row per input event (no duplicate result emission on table-not-found/idempotent duplicate).
  - Updated push route outlet comment to match numeric/coerced `outlet_id` contract and hardened unknown event-type test with explicit assertions.
  - Tightened push-route outlet guard parser to accept only positive safe integers before access-check evaluation.
- Known limitations:
  - Exponential backoff is currently implemented at API sync write layer for retryable DB contention; client-side adaptive backoff remains orchestrator-driven in POS sync service.
  - Working tree intentionally remained uncommitted during iterative code-review workflow passes; this story records implementation/review state, not git-commit state.

### Files Created/Modified
- `apps/api/src/lib/table-sync.ts` - Core sync logic with conflict audit
- `apps/api/app/api/sync/push/table-events/route.ts` - Push endpoint with 409 conflict handling
- `apps/api/app/api/sync/pull/table-state/route.ts` - Pull endpoint with cursor pagination
- `apps/api/app/api/sync/push/table-events/route.test.ts` - Push integration tests
- `apps/api/app/api/sync/pull/table-state/route.test.ts` - Pull integration tests
- `apps/api/app/api/sync/push/table-events/concurrency.test.ts` - Concurrency race tests
- `apps/api/package.json` - API workspace scripts/dependencies metadata
- `_bmad-output/implementation-artifacts/sprint-status.yaml` - Sprint story status/timestamp tracking
- `_bmad-output/implementation-artifacts/stories/epic-12/story-12.6.md` - Story lifecycle, evidence, and AI review follow-ups
- `_bmad-output/implementation-artifacts/stories/epic-12/story-12.6.completion.md` - Story completion artifact
- `packages/shared/src/schemas/table-reservation.ts` - Sync schemas
- `packages/db/migrations/0109_story_12_6_conflict_audit_columns.sql` - Conflict audit columns/index migration
- `docs/API.md` - Sync push/pull endpoint contracts and 409 conflict payload examples
- `docs/db/schema.md` - Table event conflict-audit schema/index notes
