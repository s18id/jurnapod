# Story 17.1: Enforce `_ts` authority rules in sync update ingestion

Status: review

## Story

As a developer,
I want sync update ingestion to distinguish client-authoritative event time from server-authoritative ingest time,
so that offline replay and ordering remain deterministic without conflating occurrence time and persistence time.

## Acceptance Criteria

1. Client-authoritative event time is validated and preserved according to contract when sync updates are ingested.
2. Server-authoritative ingest time is generated or overwritten server-side.
3. `pos_order_updates.created_at_ts` remains ingest/order metadata and not domain event occurrence time.
4. Sync tests cover accepted input, rejected malformed input, and server overwrite behavior.

## Tasks / Subtasks

- [x] Task 1: Define authority handling in sync update ingestion (AC: 1, 2, 3)
  - [x] Subtask 1.1: Audit `OrderUpdate` payload handling in `apps/api/src/routes/sync/push.ts`.
  - [x] Subtask 1.2: Separate client-authoritative event-time handling from server ingest metadata.
- [x] Task 2: Implement server-authoritative ingest-time behavior (AC: 2, 3)
  - [x] Subtask 2.1: Ensure persisted `created_at_ts` semantics are server-owned.
  - [x] Subtask 2.2: Avoid treating payload `created_at` as domain event truth.
- [x] Task 3: Add validation and regression coverage (AC: 1, 4)
  - [x] Subtask 3.1: Add sync push tests for valid and malformed event-time payloads.
  - [x] Subtask 3.2: Add tests proving server overwrite/generation for ingest time.

## Dev Notes

### Developer Context

- `apps/api/src/routes/sync/push.ts` currently inserts `event_at_ts` from `update.event_at` and `created_at_ts` from `update.created_at`, which risks conflating client occurrence time with server ingest time. [Source: `apps/api/src/routes/sync/push.ts`]
- Epic 17 must preserve offline-first semantics and idempotent sync behavior. [Source: `docs/project-context.md#Architecture Principles`]

### Technical Requirements

- Keep `event_at_ts` as client-authoritative event time where contract allows.
- Treat `created_at_ts` as server ingest/order metadata.
- Do not break explicit sync outcomes (`OK`, `DUPLICATE`, `ERROR`).

### Architecture Compliance

- `/sync/push` is high scrutiny: avoid duplicate creation, auth bypass, and tenant leakage. [Source: `apps/api/AGENTS.md#POS sync`]
- Maintain tenant scoping on all persisted update paths.

### Library / Framework Requirements

- Reuse `date-helpers` from Epic 16 for normalization where possible.
- Keep schema validation aligned with `packages/shared/src/schemas/pos-sync.ts` if payload shape changes are needed.

### File Structure Requirements

- Implementation files:
  - `apps/api/src/routes/sync/push.ts`
  - `packages/shared/src/schemas/pos-sync.ts` (if contract updates are required)
- Tests:
  - `apps/api/src/routes/sync/push.test.ts`
  - `apps/api/tests/integration/sync-push.integration.test.mjs` if integration coverage is needed

### Testing Requirements

- Cover malformed input, accepted input, and server-owned ingest-time behavior.
- Preserve idempotency and company/outlet scoping assertions.

### Project Structure Notes

- Keep authority logic close to sync ingestion; do not duplicate timestamp rules in multiple route branches.

### References

- `_bmad-output/planning-artifacts/epics.md#Story 17.1: Enforce _ts authority rules in sync update ingestion`
- `apps/api/src/routes/sync/push.ts`
- `packages/shared/src/schemas/pos-sync.ts`
- `docs/project-context.md`

## Dev Agent Record

### Agent Model Used

openai/gpt-5.4

### Debug Log References

- Story created from Epic 17 authority-rule requirements for sync updates.

### Completion Notes List

**Implemented Authority Semantics for Sync Update Ingestion:**

**Changes to `apps/api/src/routes/sync/push.ts`:**

1. **processOrderUpdates function** (lines ~1354-1430):
   - Added authority semantics documentation in JSDoc
   - `event_at` / `event_at_ts`: Now explicitly client-authoritative, validated and preserved from payload
   - `created_at` / `created_at_ts`: Changed to server-authoritative, generated server-side using `new Date()` at ingest time
   - Previously incorrectly used `update.created_at` from client payload; now uses server-generated time

2. **processItemCancellations function** (lines ~1434-1502):
   - Added authority semantics documentation in JSDoc
   - `cancelled_at` / `cancelled_at_ts`: Client-authoritative, preserved from payload
   - `created_at` / `created_at_ts`: Changed to server-authoritative, generated server-side
   - Previously incorrectly used `cancelled_at` for both `cancelled_*` and `created_*` fields

**Key implementation pattern:**
```typescript
// Generate server-authoritative ingest time for created_at / created_at_ts
const serverNow = new Date();
const serverCreatedAtMysql = toMysqlDateTimeStrict(serverNow.toISOString(), "server_created_at");
const serverCreatedAtTs = serverNow.getTime();
```

**Integration Tests Added (apps/api/tests/integration/sync-push.integration.test.mjs):**

4 new route-level integration tests that verify actual DB persistence:

1. **Order Update Authority Test (Story 17.1)**: Proves `event_at`/`event_at_ts` are preserved from client payload while `created_at_ts` is server-generated within ingest window. Queries actual DB rows to verify persisted values.

2. **Malformed event_at Rejection Test (Story 17.1)**: Verifies rolled dates (Feb 30), invalid formats, and naive datetimes without timezone offset are rejected at schema level (400 response).

3. **Item Cancellation Authority Test (Story 17.1)**: Proves `cancelled_at`/`cancelled_at_ts` are client-authoritative while `created_at_ts` is server-generated and different from client's cancellation time.

4. **Idempotency Preservation Test (Story 17.1)**: Confirms idempotency still works correctly with authority semantics - same `update_id` returns DUPLICATE on replay without creating duplicate rows.

**Contract Fix Tests Added (Story 17.1 Correction):**

5. **Missing client created_at accepted Test**: Proves `order_updates` without `created_at` field is accepted. Server generates `created_at_ts` server-side regardless.

6. **Malformed created_at ignored Test**: Proves malformed `created_at` in payload (e.g., `"not-a-valid-datetime"`) is IGNORED by server. `event_at` validation still enforced. Server generates its own `created_at_ts`.

**Schema Contract Change (packages/shared/src/schemas/pos-sync.ts):**
- `order_updates[].created_at` changed from required (`z.string().datetime({ offset: true })`) to optional (`z.string().optional()`)
- Since the server ignores `created_at` entirely and generates its own `created_at_ts`, no validation is performed on this field
- The field is now purely for backward compatibility if clients still send it

**Type Change (apps/api/src/routes/sync/push.ts):**
- `OrderUpdate.created_at` changed from required to optional in type definition
- JSDoc updated to clarify server-authoritative semantics

**Test Results:**
- Unit tests: 34 pass
- Integration tests: 21 pass (including 6 Story 17.1 tests)

**Validation:**
- TypeScript typecheck: ✅ Pass
- ESLint lint: ✅ Pass
- Build: ✅ Pass

### File List

- `apps/api/src/routes/sync/push.ts` (modified - authority semantics for order_updates and item_cancellations, updated OrderUpdate type)
- `packages/shared/src/schemas/pos-sync.ts` (modified - made order_updates[].created_at optional)
- `apps/api/tests/integration/sync-push.integration.test.mjs` (added 6 route-level integration tests for Story 17.1)

## Change Log

- **2026-03-25**: Implemented Epic 17 Story 17.1 - Enforced `_ts` authority rules in sync update ingestion. 
  - Modified `processOrderUpdates` to use server-generated `created_at`/`created_at_ts` instead of client payload values.
  - Modified `processItemCancellations` to use server-generated `created_at`/`created_at_ts` instead of client `cancelled_at`.
  - Preserved client-authoritative `event_at`/`cancelled_at` from payloads.
  - Added 4 route-level integration tests in sync-push.integration.test.mjs proving:
    - event_at/event_at_ts preserved from client, created_at_ts server-generated within ingest window
    - Malformed event_at rejected at schema level (400 response)
    - Item cancellation authority semantics with DB persistence verification
    - Idempotency preserved with authority semantics
  - All 34 unit tests pass, 15 integration tests pass (including 4 new Story 17.1 tests), typecheck/lint/build all pass.

- **2026-03-25 (Correction 1)**: Replaced weak unit-level tests with route-level integration tests that verify actual DB persistence. Original tests only verified helper/Date.now() behavior in isolation; new tests prove:
  - Persisted DB values for event_at/event_at_ts match client payload
  - Persisted DB values for created_at_ts are within server-ingest window
  - created_at_ts NOT equal to client's created_at/cancelled_at

- **2026-03-25 (Correction 2 - Contract Fix)**: Fixed schema contract mismatch:
  - `order_updates[].created_at` was required but server ignores it (server-authoritative ingest metadata)
  - Changed schema from `z.string().datetime({ offset: true })` to `z.string().optional()`
  - Since server ignores this field entirely, no validation is performed on it
  - Added 2 integration tests proving:
    - Missing client `created_at` is accepted for order_updates
    - Malformed client `created_at` is ignored, server generates its own
  - Updated OrderUpdate type in push.ts to reflect optional `created_at`
  - All 686 unit tests pass, 21 integration tests pass (including 6 Story 17.1 tests), typecheck/lint/build all pass.
