# Story 37.1: Define Outbox Domain Model + Interfaces

## Story Summary

| Field | Value |
|-------|-------|
| Story | story-37.1 |
| Title | Define Outbox Domain Model + Interfaces |
| Status | pending |
| Type | Extraction/Refactor |
| Sprint | TBD |
| Priority | P1 |
| Estimate | 6-8h |

---

## Story

As a developer,
I want to define the outbox domain model and repository port interface in `@jurnapod/notifications`,
So that the email queue lifecycle and persistence contract are cleanly separated from API runtime logic.

---

## Background

Epic 37 extracts email outbox infrastructure from `apps/api/src/lib/email-outbox.ts` into `@jurnapod/notifications`. This story establishes the foundation: types, enums, entry shape, retry metadata, and the `OutboxStore` port interface. The API will supply the DB implementation of this port in a later story.

---

## Acceptance Criteria

1. `EmailQueueStatus` enum/union is defined with values: `PENDING`, `SENDING`, `SENT`, `FAILED`
2. `EmailOutboxEntry` type captures all queue entry fields: `id`, `companyId`, `userId?`, `toEmail`, `subject`, `html`, `text`, `status`, `attempts`, `maxAttempts`, `nextRetryAt?`, `errorMessage?`, `createdAt`, `sentAt?`
3. `OutboxStore` port interface defines all persistence operations:
   - `enqueue(entry)` → creates new outbox entry, returns entry ID
   - `claimPending(limit)` → atomically claims up to `limit` pending emails (returns claimed entries)
   - `markSent(id)` → marks entry as SENT with `sentAt`
   - `markFailed(id, error, retryAt?)` → marks entry as FAILED or reschedules with `nextRetryAt`
   - `getPendingCount()` → returns count of PENDING entries
4. Retry configuration type `RetryPolicy` is defined: `maxAttempts`, `baseBackoffSeconds`, `backoffMultiplier`
5. `packages/notifications/src/outbox/types.ts` and `ports/outbox-store.ts` are created
6. `packages/notifications/src/outbox/retry-policy.ts` is created with default retry values
7. Package has **no** `getDb()` calls — all DB access goes through port interface
8. `npm run typecheck -w @jurnapod/notifications` passes

---

## Technical Notes

### Port Pattern

The `OutboxStore` port is a TypeScript interface that the API will implement using Kysely:

```typescript
export interface OutboxStore {
  enqueue(entry: NewEmailOutboxEntry): Promise<number>;
  claimPending(limit: number): Promise<EmailOutboxEntry[]>;
  markSent(id: number): Promise<void>;
  markFailed(id: number, error: string, nextRetryAt?: Date): Promise<void>;
  getPendingCount(): Promise<number>;
}
```

### EmailQueueStatus Union

```typescript
export type EmailQueueStatus = 'PENDING' | 'SENDING' | 'SENT' | 'FAILED';
```

### Directory Structure

```
packages/notifications/src/
  outbox/
    index.ts              # Re-exports
    types.ts              # EmailQueueStatus, EmailOutboxEntry, NewEmailOutboxEntry, RetryPolicy
    retry-policy.ts       # Default retry config + backoff calculator
    ports/
      outbox-store.ts      # OutboxStore interface
```

### Dependency Injection Principle

The package must remain persistence-agnostic. The API injects the store implementation at runtime. This enables deterministic unit testing with in-memory store mocks.

---

## Tasks

- [ ] Create `packages/notifications/src/outbox/` directory structure
- [ ] Define `EmailQueueStatus` union type
- [ ] Define `EmailOutboxEntry` and `NewEmailOutboxEntry` types
- [ ] Define `RetryPolicy` configuration type
- [ ] Create `packages/notifications/src/outbox/ports/outbox-store.ts` with `OutboxStore` interface
- [ ] Create `packages/notifications/src/outbox/retry-policy.ts` with default retry values and `calculateNextRetry()` function
- [ ] Create `packages/notifications/src/outbox/index.ts` re-exporting public types
- [ ] Add unit tests for `calculateNextRetry()` with various attempt counts
- [ ] Verify typecheck passes

---

## Validation

```bash
npm run typecheck -w @jurnapod/notifications
```
