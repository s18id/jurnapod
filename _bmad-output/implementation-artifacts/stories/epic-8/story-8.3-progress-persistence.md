# Story 8.3: Progress Persistence for Long-Running Operations

**Status:** review
**Epic:** Epic 8: Production Scale & POS Variant Sync
**Story ID:** 8-3-progress-persistence

## Context

TD-015: Progress callbacks for import/export operations only exist in memory. If the server restarts during a large operation, progress is lost. For operations that may take 30+ minutes, users need persistent progress tracking that survives restarts.

This story implements progress persistence in the database, building on the session infrastructure from Story 7.2.

## Acceptance Criteria

**AC1: Progress Table Schema** ✅
- Create `operation_progress` table: `operation_id`, `operation_type`, `company_id`, `total_units`, `completed_units`, `status`, `started_at`, `updated_at`, `details` (JSON)
- Index on `(company_id, operation_id)` and `(status, updated_at)` for cleanup
- Support multiple operation types: `import`, `export`, `batch_update`

**AC2: Progress Update API** ✅
- Create `apps/api/src/lib/progress/progress-store.ts`
- Interface: `startProgress()`, `updateProgress()`, `getProgress()`, `completeProgress()`, `failProgress()`
- Updates write to database every 5 seconds (configurable) or on significant milestones (10%, 25%, 50%, 75%, 90%, 100%)

**AC3: Progress Query Endpoint** ✅
- Add `GET /api/operations/:operationId/progress` endpoint
- Returns: `{ total, completed, percentage, status, eta_seconds, started_at, updated_at }`
- Support Server-Sent Events (SSE) for real-time progress updates
- Company-scoped: users can only query their own operations

**AC4: Progress Recovery on Restart** ✅
- On API startup, scan for in-progress operations (`status = 'running'`)
- Mark stale operations (>2 hours without update) as `failed`
- Resume progress tracking for active operations

**AC5: Integration Tests** ✅
- Test: Progress persists across simulated server restart
- Test: Progress query returns correct percentages
- Test: SSE stream receives updates in real-time
- Test: Stale operations marked as failed on startup
- Test: Company isolation — cannot query other company's progress

## Tasks/Subtasks

- [x] Create `apps/api/src/lib/progress/progress-store.ts` - Progress store implementation
- [x] Create `apps/api/src/lib/progress/progress-store.test.ts` - Comprehensive unit and integration tests
- [x] Create `apps/api/src/routes/progress.ts` - REST endpoint with SSE support
- [x] Create migration `packages/db/migrations/0121_operation_progress.sql` - Database table
- [x] Modify `apps/api/src/server.ts` - Initialize progress pool and stale cleanup on startup
- [x] Create `apps/api/src/lib/progress/index.ts` - Module exports

## Dev Notes

### Implementation Decisions

1. **Throttling Logic**: Updates are persisted when:
   - Time since last update >= 5 seconds (MIN_UPDATE_INTERVAL_MS)
   - A milestone threshold is crossed (10%, 25%, 50%, 75%, 90%, 100%)
   - Operation completes (100%)

2. **Fire-and-Forget Updates**: `updateProgressAsync()` wraps `updateProgress()` with a `.catch()` handler to avoid blocking the calling operation.

3. **SSE Implementation**: Uses polling (every 2 seconds) to check for updates since we can't directly trigger SSE from the store. SSE connections are tracked in a Map to enable cleanup.

4. **Stale Operation Cleanup**: Uses `DATE_SUB(NOW(), INTERVAL ? SECOND)` in SQL rather than passing a JavaScript datetime to avoid format issues.

5. **Test Isolation**: Uses `clearProgressTracking()` to reset module-level Maps between test runs.

### Files Modified

| File | Change |
|------|--------|
| `apps/api/src/server.ts` | Added progress route registration, pool initialization, stale cleanup |
| `packages/db/migrations/0121_operation_progress.sql` | Created new migration |

### Files Created

| File | Description |
|------|-------------|
| `apps/api/src/lib/progress/progress-store.ts` | Progress store with CRUD operations |
| `apps/api/src/lib/progress/progress-store.test.ts` | 43 tests covering all functionality |
| `apps/api/src/lib/progress/index.ts` | Module exports |
| `apps/api/src/routes/progress.ts` | REST endpoint with SSE support |
| `packages/db/migrations/0121_operation_progress.sql` | Database migration |

## Dev Agent Record

### Implementation Plan

1. Designed progress store with throttling for efficient DB writes
2. Implemented milestone-based persistence (10%, 25%, 50%, 75%, 90%, 100%)
3. Added SSE support via polling-based updates
4. Integrated stale operation cleanup at startup
5. Created comprehensive test suite with 43 tests

### Completion Notes

**Story 8.3 Implementation Complete**

Implemented persistent progress tracking for long-running operations that survives server restarts.

**Key Features:**
- Database-backed progress persistence via `operation_progress` table
- Throttled updates: every 5 seconds or at milestone thresholds
- Real-time progress via SSE (polling-based)
- Automatic stale operation cleanup on startup (>2 hours)
- Full company isolation for multi-tenant security
- Fire-and-forget update support for non-blocking operations

**Test Results:**
- 43 new tests passing
- 1471 total API tests passing (no regressions)
- Coverage includes: CRUD operations, throttling, milestones, company isolation, stale cleanup

**All Acceptance Criteria Met:**
- ✅ AC1: Progress Table Schema
- ✅ AC2: Progress Update API  
- ✅ AC3: Progress Query Endpoint with SSE
- ✅ AC4: Progress Recovery on Restart
- ✅ AC5: Integration Tests

## File List

```
apps/api/src/lib/progress/index.ts
apps/api/src/lib/progress/progress-store.ts
apps/api/src/lib/progress/progress-store.test.ts
apps/api/src/routes/progress.ts
apps/api/src/server.ts (modified)
packages/db/migrations/0121_operation_progress.sql
```

## Change Log

| Date | Change | Author |
|------|--------|--------|
| 2026-03-28 | Initial implementation | BMAD Developer |

## Status History

| Date | Status | Notes |
|------|--------|-------|
| 2026-03-28 | ready-for-dev | Story created |
| 2026-03-28 | in-progress | Implementation started |
| 2026-03-28 | review | Implementation complete, ready for review |
