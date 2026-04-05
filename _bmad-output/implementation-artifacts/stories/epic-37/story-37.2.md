# Story 37.2: Extract Outbox Domain Service to Package

## Story Summary

| Field | Value |
|-------|-------|
| Story | story-37.2 |
| Title | Extract Outbox Domain Service to Notifications Package |
| Status | pending |
| Type | Extraction/Refactor |
| Sprint | TBD |
| Priority | P1 |
| Estimate | 10-12h |

---

## Story

As a developer,
I want the outbox domain logic (state transitions, retry decisions, queue orchestration) to live in `@jurnapod/notifications`,
So that the email queue behavior is testable, portable, and not coupled to API runtime concerns.

---

## Background

Building on Story 37.1's type and port definitions, this story implements the domain service that orchestrates the outbox lifecycle. It uses the `OutboxStore` port to persist state changes, implements the state machine (PENDING → SENDING → SENT/FAILED with retry paths), and exposes a clean `queueEmail()` API. The API will wire this service via dependency injection in Story 37.3.

---

## Acceptance Criteria

1. `OutboxService` class is created in `packages/notifications/src/outbox/outbox-service.ts`
2. `queueEmail(params)` method creates a new PENDING entry via `OutboxStore.enqueue()`
3. `claimAndProcess(limit, sendFn)` method:
   - Atomically claims up to `limit` PENDING entries via `OutboxStore.claimPending()`
   - For each claimed entry, calls `sendFn(email)` (provided by API adapter)
   - On success: calls `OutboxStore.markSent()`
   - On failure: implements retry logic with exponential backoff
4. State transitions are enforced:
   - PENDING → SENDING (on claim)
   - SENDING → SENT (on success)
   - SENDING → PENDING (on failure, with retry metadata, if attempts < max)
   - SENDING → FAILED (on failure, if attempts >= max)
5. Retry logic uses `RetryPolicy` from Story 37.1 with exponential backoff: `baseBackoffSeconds * backoffMultiplier^(attempts-1)`
6. All DB operations go through `OutboxStore` port — no direct `getDb()` calls
7. Transaction support: `OutboxService` optionally accepts a transaction executor for atomic claim + update
8. `OutboxService` is exported from `packages/notifications/src/outbox/index.ts`
9. `npm run typecheck -w @jurnapod/notifications` passes

---

## Technical Notes

### State Machine

```
PENDING ──claim──► SENDING ──success──► SENT
                     │
                     ├──retry (attempts < max)──► PENDING (with nextRetryAt)
                     │
                     └──exhausted (attempts >= max)──► FAILED
```

### OutboxService Interface

```typescript
export interface OutboxServiceDeps {
  store: OutboxStore;
  retryPolicy: RetryPolicy;
  clock?: () => Date;  // for deterministic testing
}

export class OutboxService {
  constructor(private deps: OutboxServiceDeps) {}

  async queueEmail(params: QueueEmailParams): Promise<number>;
  async claimAndProcess(limit: number, sendFn: SendEmailFn): Promise<ProcessResult>;
  async getPendingCount(): Promise<number>;
}
```

### Retry Calculation

```typescript
function calculateNextRetry(attempts: number, policy: RetryPolicy): Date {
  const backoffMs = policy.baseBackoffSeconds * 1000 * Math.pow(policy.backoffMultiplier, attempts);
  return new Date(Date.now() + backoffMs);
}
```

### Atomic Claim Pattern

The `claimPending` in the port must be atomic. The API store implementation will use Kysely's update-then-select pattern:

```typescript
async claimPending(limit: number): Promise<EmailOutboxEntry[]> {
  // 1. Atomically claim by updating PENDING → SENDING
  await db.updateTable('email_outbox')
    .set({ status: 'SENDING' })
    .where('status', '=', 'PENDING')
    .where((eb) => eb.or([eb('next_retry_at', 'is', null), eb('next_retry_at', '<=', new Date())]))
    .orderBy('created_at', 'asc')
    .limit(limit)
    .execute();

  // 2. Fetch the claimed rows
  return db.selectFrom('email_outbox')
    .where('status', '=', 'SENDING')
    .orderBy('created_at', 'asc')
    .limit(limit)
    .selectAll()
    .execute();
}
```

### DI-First Design

`OutboxService` receives its dependencies via constructor, enabling:
- In-memory mock store for unit tests
- Deterministic clock for retry timing tests
- Future extraction to shared job runner

---

## Tasks

- [ ] Create `packages/notifications/src/outbox/outbox-service.ts`
- [ ] Implement `OutboxService` class with `queueEmail()`, `claimAndProcess()`, `getPendingCount()`
- [ ] Implement state transition enforcement
- [ ] Implement exponential backoff retry logic
- [ ] Add transaction support via optional executor injection
- [ ] Export `OutboxService` from `packages/notifications/src/outbox/index.ts`
- [ ] Write unit tests for:
  - State transition correctness
  - Retry backoff calculation
  - Max attempts exhaustion → FAILED
- [ ] Verify typecheck passes

---

## Validation

```bash
npm run typecheck -w @jurnapod/notifications
```
