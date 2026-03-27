# Story 8.1: Import Resume/Checkpoint for Interrupted Imports

**Status:** review
**Epic:** Epic 8: Production Scale & POS Variant Sync
**Story ID:** 8-1-import-resume-checkpoint

## Context

TD-013: The import framework processes data in batches, but if an import of 10,000 rows fails at row 8,000, the entire import must restart. This is unacceptable for production workloads where imports may take hours and failures should be recoverable.

Building on the session persistence work from Story 7.2 (MySQL-backed import sessions) and batch progress tracking from Story 7.3, we now implement full checkpoint/resume capability.

## Acceptance Criteria

**AC1: Checkpoint Tracking** ✅
- After each successfully committed batch, record `last_successful_batch_number` and `rows_committed` in the import session row
- Checkpoint includes: batch number, row count, timestamp, and validation hash
- Validation hash ensures data integrity when resuming (detects file modification)

**AC2: Resume Capability** ✅
- On import apply, check if session has existing checkpoints
- If resuming: skip already-committed batches, start from `last_successful_batch_number + 1`
- Resume only valid within session TTL window (30 minutes from last activity)
- Clear error message if resume window expired: "Import session expired. Please restart from beginning."

**AC3: Validation on Resume** ✅
- Verify uploaded file hash matches checkpoint hash (detect file changes)
- If hash mismatch: reject resume, require fresh upload
- Log resume attempts at INFO level with checkpoint details

**AC4: Partial Failure Handling** ✅
- When batch K fails: batches 1..K-1 remain committed, batch K..N not processed
- Return structured error with: `failed_at_batch`, `rows_committed`, `can_resume: true/false`
- Client can call apply again with same session ID to resume (if within TTL)

**AC5: Integration Tests** ✅
- Test: Import 1000 rows, simulate failure at batch 5, verify batches 1-4 committed
- Test: Resume from checkpoint completes successfully
- Test: Hash mismatch detection rejects resume
- Test: Expired session cannot resume (returns 410 Gone)
- Test: Multiple resumes on same session work correctly

## Technical Notes

- Leverage `import_sessions` table from Story 7.2
- Add columns: `checkpoint_data` (JSON), `file_hash` (VARCHAR 64)
- Use SHA-256 hash of file buffer for integrity check
- Consider batch size tuning for optimal checkpoint frequency

## Dependencies

Story 7.2 (MySQL session persistence), Story 7.3 (batch progress tracking)

## Estimated Effort

2 days

## Priority

P0

## Risk Level

Medium (modifies critical import flow)

## Tasks/Subtasks

- [x] Create migration for checkpoint columns (checkpoint_data, file_hash)
- [x] Update session-store.ts with checkpoint functions
- [x] Update import routes with resume support
- [x] Implement file hash validation
- [x] Write integration tests for checkpoint/resume
- [x] Run typecheck, build, lint, tests

## Dev Agent Record

### Implementation Plan
1. Created migration 0120_import_session_checkpoint.sql with checkpoint_data (JSON) and file_hash (VARCHAR 64) columns
2. Extended session-store.ts with CheckpointData interface and new functions: updateCheckpoint, clearCheckpoint, updateFileHash, computeFileHash, getCheckpoint
3. Updated ApplyResult interface to include canResume, failedAtBatch fields
4. Modified apply routes to use new checkpoint mechanism with file hash validation
5. Created comprehensive test file checkpoint-resume.test.ts with 27 tests covering all acceptance criteria

### Completion Notes
All acceptance criteria implemented:
- **AC1**: Checkpoint tracking via `checkpoint_data` JSON column with lastSuccessfulBatchNumber, rowsCommitted, timestamp
- **AC2**: Resume capability using stored checkpoint, skipping committed batches
- **AC3**: SHA-256 file hash validation on upload and resume
- **AC4**: Partial failure handling with structured error response (failedAtBatch, rowsCommitted, canResume)
- **AC5**: 27 integration tests passing covering all scenarios

### Test Execution Results
```
# tests 27
# suites 10
# pass 27
# fail 0
# cancelled 0
# duration_ms 1480.404113
```

All validation checks passed:
- Typecheck: ✅
- Build: ✅  
- Lint: ✅
- Unit tests: 1416 pass, 0 fail

## File List

### Created
- `packages/db/migrations/0120_import_session_checkpoint.sql` - Migration for checkpoint columns
- `apps/api/src/lib/import/checkpoint-resume.test.ts` - Integration tests (27 tests)

### Modified
- `apps/api/src/lib/import/session-store.ts` - Added checkpoint functions and exports
- `apps/api/src/routes/import.ts` - Added resume logic with checkpoint persistence
- `apps/api/src/lib/import/types.ts` - Extended types as needed

## Change Log

| Date | Change |
|------|--------|
| 2026-03-28 | Initial implementation of checkpoint/resume capability |
