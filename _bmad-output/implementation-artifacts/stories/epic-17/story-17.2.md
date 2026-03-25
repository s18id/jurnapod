# Story 17.2: Preserve `base_order_updated_at_ts` as version-marker metadata (NOT optimistic-concurrency)

Status: done

## Story

As a developer,
I want `base_order_updated_at_ts` treated as preserved version-marker metadata (not as business/display time, not as optimistic-concurrency control),
so that the field maintains its semantic purpose as client-copied metadata for potential future stale detection when an authoritative server-side order version exists.

## Acceptance Criteria

1. `base_order_updated_at_ts` is stored as-preserved metadata, not interpreted as business/display time.
2. No fake optimistic-concurrency rejection logic (no authoritative server version exists yet).
3. Idempotency via `update_id` remains intact.
4. Story 17.1 authority semantics remain intact (event_at client-authoritative, created_at_ts server-authoritative).

## Tasks / Subtasks

- [x] Task 1: Audit current usage of `base_order_updated_at_ts` (AC: 1)
  - [x] Subtask 1.1: Review sync push ingestion and any downstream comparison logic.
  - [x] Subtask 1.2: Identify any misleading or overloaded uses.
- [x] Task 2: Remove fake OCC logic and document correct semantics (AC: 1, 2)
  - [x] Subtask 2.1: Remove stale rejection based on MAX(previous base versions) - not authoritative.
  - [x] Subtask 2.2: Document that base_order_updated_at_ts is preserved metadata only.
- [x] Task 3: Add tests proving correct metadata preservation (AC: 1, 2, 3)
  - [x] Subtask 3.1: Prove base_order_updated_at_ts is stored correctly and not as event/business time.
  - [x] Subtask 3.2: Prove null is stored as null.
  - [x] Subtask 3.3: Prove idempotency still works with base_order_updated_at present.
  - [x] Subtask 3.4: Prove multiple base versions are stored without fake OCC rejection.

## Dev Notes

### Developer Context

- `base_order_updated_at_ts` was previously incorrectly compared against MAX(previous base versions) for stale detection.
- This comparison is NOT true optimistic-concurrency because both values are client-claimed metadata.
- No authoritative server-side order version exists currently in the codebase.
- True OCC requires either: (a) server-generated version counter, or (b) verified snapshot updated_at_ts with enforced advancement.

### Technical Decision: Option B

**Rationale for NOT implementing OCC:**
1. The comparison target (`MAX(base_order_updated_at_ts)` from previous updates) is just client-claimed values compared against each other - not authoritative server state
2. `pos_order_snapshots.updated_at_ts` is also set from client-provided `updated_at` in `active_orders`, so it's not truly server-authoritative either
3. Implementing fake OCC by comparing client-claimed values would be misleading and incorrect
4. `base_order_updated_at_ts` is preserved as metadata for potential future stale detection when an authoritative version source exists

### Architecture Compliance

- Sync logic must remain duplicate-safe and tenant-safe. [Source: `docs/project-context.md#Architecture Principles`]
- Story 17.1 authority semantics preserved (event_at client, created_at_ts server).

### Library / Framework Requirements

- If normalization is needed, route it through `date-helpers` or clearly isolated sync helpers.

### File Structure Requirements

- Implementation file: `apps/api/src/routes/sync/push.ts`
- Tests: `apps/api/tests/integration/sync-push.integration.test.mjs`

### Testing Requirements

- Prove metadata is stored correctly (not as event/business time)
- Prove null stores as null
- Prove idempotency remains intact
- Prove multiple base versions can coexist (no fake OCC rejection)

### Previous Story Intelligence

- Story 17.1 establishes sync time authority rules; keep `base_order_updated_at_ts` separate from `event_at_ts` and `created_at_ts` semantics.

### References

- `_bmad-output/planning-artifacts/epics.md#Story 17.2`
- `apps/api/src/routes/sync/push.ts`
- `apps/api/src/routes/sync/push.test.ts`

## Dev Agent Record

### Agent Model Used

openai/gpt-5.4

### Debug Log References

- Story created from Epic 17 stale-update/version-marker requirements.

## Completion Notes

**Implemented Correct Metadata Semantics for base_order_updated_at_ts (Option B):**

**Changes to `apps/api/src/routes/sync/push.ts`:**

1. **Corrected `processOrderUpdates` function JSDoc** (lines ~1354-1400):
   - Documented `base_order_updated_at_ts` as VERSION MARKER METADATA only
   - Explicitly states this is NOT business time, event time, or display time
   - Documented that no server-side stale detection is performed because:
     - No authoritative server-generated order version exists
     - Comparing client-claimed values is not true OCC
   - Future enhancement: when authoritative server version exists, stale detection can be implemented

2. **Removed fake OCC rejection logic**:
   - Previously compared incoming against MAX(previous base versions)
   - This was incorrect because both are client-claimed values
   - Now stores base_order_updated_at_ts as preserved metadata only

**Integration Tests Added (apps/api/tests/integration/sync-push.integration.test.mjs):**

4 new route-level integration tests proving correct metadata semantics:

1. **"order_updates base_order_updated_at_ts is preserved as metadata, not as event/business time (Story 17.2)"**: 
   - Proves base_order_updated_at_ts is stored as a positive timestamp
   - Proves base_order_updated_at_ts is DIFFERENT from event_at_ts (different semantics)
   - Proves base_order_updated_at_ts is DIFFERENT from created_at_ts (different semantics)

2. **"order_updates null base_order_updated_at is stored as null (Story 17.2)"**: 
   - Proves null base_order_updated_at results in NULL base_order_updated_at_ts

3. **"order_updates idempotency via update_id still works with base_order_updated_at (Story 17.2)"**: 
   - Proves idempotency preserved (retry with same update_id → DUPLICATE)
   - Proves base_order_updated_at_ts is correctly stored

4. **"order_updates multiple base versions stored without OCC rejection (Story 17.2)"**: 
   - Proves updates with earlier, same, and later base versions are ALL accepted
   - Proves no fake OCC rejection when no authoritative version exists
   - Proves all three base_order_updated_at_ts values are correctly stored

**Test Results:**
- Unit tests: 686 pass
- TypeScript typecheck: ✅ Pass
- ESLint lint: ✅ Pass  
- Build: ✅ Pass

**Key Implementation Pattern:**
```typescript
// base_order_updated_at_ts is stored as VERSION MARKER METADATA only.
// No server-side stale detection is performed - see JSDoc for rationale.
await executor.execute(
  `INSERT INTO pos_order_updates (
     update_id, order_id, company_id, outlet_id, base_order_updated_at, base_order_updated_at_ts,
     event_type, delta_json, actor_user_id, device_id, event_at, event_at_ts, created_at, created_at_ts
   ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  [
    update.update_id,
    // ...
    update.base_order_updated_at
      ? toMysqlDateTimeStrict(update.base_order_updated_at, "base_order_updated_at")
      : null,
    update.base_order_updated_at
      ? toTimestampMs(update.base_order_updated_at, "base_order_updated_at")
      : null,
    // event_at and created_at_ts handled separately with correct authority semantics
  ]
);
```

**What This Story Does NOT Implement (Future Work):**
- True optimistic-concurrency stale detection (requires authoritative server version)
- Server-generated order version counter or verified snapshot updated_at_ts

## Change Log

- **2026-03-25**: Implemented Epic 17 Story 17.2 - Preserved `base_order_updated_at_ts` as version-marker metadata (Option B).
  - **CORRECTION**: Removed fake OCC rejection logic that compared client-claimed values
  - Documented that base_order_updated_at_ts is preserved metadata only, not business/event time
  - Documented why no server-side stale detection is performed (no authoritative version exists)
  - Added 4 route-level integration tests proving:
    - base_order_updated_at_ts is stored correctly (different from event_at_ts and created_at_ts)
    - null is stored as null
    - Idempotency via update_id remains intact
    - Multiple base versions are stored without fake OCC rejection
  - All 686 unit tests pass, typecheck/lint/build all pass.

## File List

- `apps/api/src/routes/sync/push.ts` (modified - removed fake OCC logic, documented correct metadata semantics)
- `apps/api/tests/integration/sync-push.integration.test.mjs` (replaced 4 tests proving correct metadata semantics)
