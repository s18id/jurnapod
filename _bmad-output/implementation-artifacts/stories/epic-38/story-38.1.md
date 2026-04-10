# Story 38.1: Lock Wait Timeout + Transaction Boundary Fixes

**Status:** done

## Story

As an **engineer**,
I want `withTransactionRetry` to handle both `ER_LOCK_DEADLOCK` (1213) and `ER_LOCK_WAIT_TIMEOUT` (1205),
So that transient lock conflicts in both forms are retried transparently without surfacing as 500 errors.

## Context

`packages/db/src/kysely/transaction.ts` — `isDeadlockError()` only detected `ER_LOCK_DEADLOCK` (code `'ER_LOCK_DEADLOCK'`, errno 1213, message containing `"deadlock found"`). `ER_LOCK_WAIT_TIMEOUT` (code `'ER_LOCK_WAIT_TIMEOUT'`, errno 1205, message containing `"lock wait timeout exceeded"`) was not caught, so it propagated as an unhandled exception from any transaction that hit a lock wait timeout.

## Acceptance Criteria

**AC1: `isDeadlockError()` detects lock wait timeout by code**
**Given** an error object with `code = 'ER_LOCK_WAIT_TIMEOUT'`
**When** `isDeadlockError(error)` is called
**Then** it returns `true`

**AC2: `isDeadlockError()` detects lock wait timeout by errno**
**Given** an error object with `errno = 1205`
**When** `isDeadlockError(error)` is called
**Then** it returns `true`

**AC3: `isDeadlockError()` detects lock wait timeout by message**
**Given** an error object with `message = 'Lock wait timeout exceeded; try restarting transaction'`
**When** `isDeadlockError(error)` is called
**Then** it returns `true`

**AC4: `isDeadlockError()` detects deadlock (existing behavior preserved)**
**Given** an error with `code = 'ER_LOCK_DEADLOCK'` or `errno = 1213` or message containing `"deadlock found"`
**When** `isDeadlockError(error)` is called
**Then** it returns `true`

**AC5: `isDeadlockError()` walks error cause chain**
**Given** a wrapped error where the lock-timeout signal is nested in `cause` or `originalError`
**When** `isDeadlockError(error)` is called
**Then** it returns `true`

**AC6: `withTransactionRetry` retries on lock wait timeout**
**Given** a transaction that hits `ER_LOCK_WAIT_TIMEOUT` on first attempt
**When** the callback is retried via `withTransactionRetry`
**Then** it retries up to `maxAttempts` with exponential backoff and eventually succeeds or propagates

## Tasks

- [x] Add `ER_LOCK_WAIT_TIMEOUT = 'ER_LOCK_WAIT_TIMEOUT'` constant
- [x] Add `MYSQL_ERRNO_LOCK_WAIT_TIMEOUT = 1205` constant
- [x] Add `LOCK_WAIT_TIMEOUT_PHRASE = 'lock wait timeout exceeded'` constant
- [x] Extend `isDeadlockError()` to check all three signals (code, errno, message) for lock wait timeout
- [x] Ensure cause-chain walking covers lock-wait-timeout signals
- [x] Run `npm run typecheck -w @jurnapod/db`
- [x] Run `npm run build -w @jurnapod/db`
- [x] Run `npm run lint -w @jurnapod/db`

## Files Modified

| File | Change |
|------|--------|
| `packages/db/src/kysely/transaction.ts` | Extend `isDeadlockError()` for 1205; add constants |

## Dev Notes

- Exported function name `isDeadlockError` kept for API compatibility even though it now covers both deadlock and lock-wait-timeout
- Retry logic unchanged (same exponential backoff: `initialDelayMs * 2^attempt`)

## Completion Evidence

- `npm run typecheck -w @jurnapod/db` ✅
- `npm run build -w @jurnapod/db` ✅
- `npm run lint -w @jurnapod/db` ✅ (0 errors)
