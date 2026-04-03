# Sync Test Stall RCA (2026-04-02)

## Symptom

`src/routes/sync/sync.test.ts` appeared to finish test assertions (`ok 1 - Sync Routes ...`) but process stayed alive until command timeout.

## What we observed

1. Teardown warnings:
   - `timeout waiting for stopApiServer after 10000ms`
   - `timeout waiting for closeDbPool after 10000ms`
2. Lingering API server child processes were present (`node --import tsx apps/api/src/server.ts`).
3. Single targeted tests passed, but full-file execution intermittently stalled at teardown.

## Root cause

The stall was caused by **teardown resource leaks**, not query correctness:

- Child API server process was not consistently terminating during test teardown.
- Open process/socket handles (including fetch/dispatcher and child stdio/process handles) kept the Node test runner alive.

This is an **operability/test-harness issue** in teardown handling, not a sync contract issue.

## Fix implemented

In `apps/api/src/routes/sync/sync.test.ts` teardown:

1. Added robust timeout wrapper with timer cleanup.
2. Added defensive child-process shutdown flow:
   - attempt normal stop
   - fallback `SIGKILL`
   - poll-by-pid kill fallback
   - destroy child stdio handles
3. Added final active-handle cleanup pass for non-stdio handles.
4. Kept DB pool close with bounded timeout.

## Verification

`node --test --test-concurrency=1 --import tsx src/routes/sync/sync.test.ts` now completes with summary output (`# pass 21`, `# fail 0`) instead of stalling.

## Follow-up hardening (recommended)

1. Move this teardown logic into shared integration harness to avoid per-test duplication.
2. Add a reusable `forceStopApiServer()` helper with pid-based fallback.
3. Add CI guard to detect lingering child processes after integration suites.
