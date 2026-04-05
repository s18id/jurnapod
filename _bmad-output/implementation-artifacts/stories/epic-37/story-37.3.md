# Story 37.3: API Integration with Thin Runtime Adapter

## Story Summary

| Field | Value |
|-------|-------|
| Story | story-37.3 |
| Title | API Integration with Thin Runtime Adapter |
| Status | pending |
| Type | Extraction/Refactor |
| Sprint | TBD |
| Priority | P1 |
| Estimate | 8-10h |

---

## Story

As a developer,
I want the API to use the `@jurnapod/notifications` outbox service while keeping runtime orchestration (cron, worker, env wiring) in the API,
So that the domain logic is properly extracted but the processing lifecycle remains manageable in this phase.

---

## Background

Stories 37.1 and 37.2 established the domain model, port interface, and domain service in `@jurnapod/notifications`. This story wires the API to use the package service. The API implements the `OutboxStore` port using Kysely, injects it into `OutboxService`, and keeps `processPendingEmails()` as a thin runtime adapter that calls the package service.

---

## Acceptance Criteria

1. `OutboxStorePort` implementation is created in `apps/api/src/lib/outbox-store.ts` using Kysely
2. `apps/api/src/lib/email-outbox-runtime.ts` is created:
   - Implements `processPendingEmails()` using `OutboxService.claimAndProcess()`
   - Gets mailer from existing `getMailer()` and passes send function to `claimAndProcess()`
   - Keeps retry config from `getAppEnv().email.outbox`
3. `apps/api/src/lib/email-outbox.ts` is updated:
   - `queueEmail()` delegates to `OutboxService.queueEmail()`
   - `getPendingEmailCount()` delegates to `OutboxService.getPendingCount()`
   - `retryFailedEmail()` is preserved with existing semantics
4. Cron/scheduler integration in API unchanged (still calls `processPendingEmails()`)
5. Environment configuration (retry max attempts, backoff seconds) stays in API
6. API remains thin adapter: config resolution → calls package service
7. No `apps/api` logic leaks into `@jurnapod/notifications` package
8. `npm run typecheck -w @jurnapod/api` passes
9. `npm run typecheck -w @jurnapod/notifications` passes

---

## Technical Notes

### API Adapter Structure

```typescript
// apps/api/src/lib/outbox-store.ts
export function createOutboxStore(db: Database): OutboxStore {
  return {
    async enqueue(entry) { /* Kysely insert */ },
    async claimPending(limit) { /* atomic claim via update+select */ },
    async markSent(id) { /* Kysely update */ },
    async markFailed(id, error, nextRetryAt) { /* Kysely update */ },
    async getPendingCount() { /* Kysely count query */ },
  };
}
```

### Runtime Adapter

```typescript
// apps/api/src/lib/email-outbox-runtime.ts
export async function processPendingEmails(): Promise<ProcessResult> {
  const db = getDb();
  const env = getAppEnv();
  const store = createOutboxStore(db);
  const service = new OutboxService({
    store,
    retryPolicy: {
      maxAttempts: env.email.outbox.retryMaxAttempts,
      baseBackoffSeconds: env.email.outbox.retryBackoffSeconds,
      backoffMultiplier: 2,
    },
  });

  return service.claimAndProcess(50, async (entry) => {
    const mailer = await getMailer();
    await mailer.sendMail({ to: entry.toEmail, subject: entry.subject, html: entry.html, text: entry.text });
  });
}
```

### Keep in API (Phase Boundary)

- `processPendingEmails()` worker loop
- Cron/scheduler bindings (existing integration points)
- `getAppEnv()` and `getMailer()` wiring
- `retryFailedEmail()` direct DB update (simple operation)

### Move to Package

- Queue state machine
- Retry/backoff decisions
- `claimAndProcess()` orchestration
- `queueEmail()` entry point

### Wire Order

1. API boots → reads env config
2. Creates `OutboxStore` implementation with Kysely `db`
3. Creates `OutboxService` with store + retry policy
4. Routes call `queueEmail()` via thin API adapter
5. Cron calls `processPendingEmails()` → delegates to service

---

## Tasks

- [ ] Create `apps/api/src/lib/outbox-store.ts` implementing `OutboxStore` port with Kysely
- [ ] Create `apps/api/src/lib/email-outbox-runtime.ts` with `processPendingEmails()`
- [ ] Update `apps/api/src/lib/email-outbox.ts`:
  - `queueEmail()` → delegates to `OutboxService.queueEmail()`
  - `getPendingEmailCount()` → delegates to `OutboxService.getPendingCount()`
  - Keep `retryFailedEmail()` unchanged initially
- [ ] Wire env config (retryMaxAttempts, retryBackoffSeconds) into `OutboxService`
- [ ] Verify typecheck for both `@jurnapod/api` and `@jurnapod/notifications`
- [ ] Integration test: verify emails are sent through the wired flow

---

## Validation

```bash
npm run typecheck -w @jurnapod/api
npm run typecheck -w @jurnapod/notifications
```
