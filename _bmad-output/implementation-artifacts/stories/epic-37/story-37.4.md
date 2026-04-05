# Story 37.4: Parity Hardening, Concurrency Safety, Cleanup

## Story Summary

| Field | Value |
|-------|-------|
| Story | story-37.4 |
| Title | Parity Hardening, Concurrency Safety, Cleanup |
| Status | pending |
| Type | Extraction/Refactor |
| Sprint | TBD |
| Priority | P2 |
| Estimate | 8-10h |

---

## Story

As a developer,
I want to verify the extracted outbox infrastructure maintains behavioral parity, handles concurrent claims safely, and has no legacy code paths,
So that the extraction is complete and production-ready.

---

## Background

The three preceding stories extracted the domain model, domain service, and API adapter. This story validates correctness via integration tests, ensures the atomic claim pattern prevents duplicate processing, and removes or deprecates any leftover code paths from the original `email-outbox.ts`.

---

## Acceptance Criteria

1. Integration tests verify:
   - Concurrent email processing (two workers claiming same email) — only one succeeds
   - Retry backoff behavior: entries rescheduled with correct `nextRetryAt`
   - Status transition correctness: PENDING → SENDING → SENT/FAILED paths
   - Max attempts exhaustion: entry transitions to FAILED after `retryMaxAttempts`
2. Atomic claim pattern verified: concurrent `claimPending()` calls return disjoint sets
3. All existing API routes using `queueEmail()` continue to work
4. Legacy direct DB code in `email-outbox.ts` is removed or marked deprecated
5. `retryFailedEmail()` is either:
   - Re-implemented using `OutboxStore` port, OR
   - Preserved as a simple direct update (acceptable since it's a manual override)
6. Sprint status is updated with story completion
7. All workspace tests pass for affected packages

---

## Technical Notes

### Concurrency Test Pattern

```typescript
test('concurrent claim returns disjoint sets', async () => {
  // Seed 10 PENDING entries
  await seedPendingEmails(10);

  // Run two claims concurrently
  const [set1, set2] = await Promise.all([
    outboxService.claimAndProcess(5, mockSend),
    outboxService.claimAndProcess(5, mockSend),
  ]);

  // No overlap between claimed sets
  const ids1 = new Set(set1.claimed.map(e => e.id));
  const ids2 = new Set(set2.claimed.map(e => e.id));
  expect([...ids1].some(id => ids2.has(id))).toBe(false);
});
```

### Retry Backoff Verification

```typescript
test('retry backoff doubles with each attempt', async () => {
  const policy = { maxAttempts: 3, baseBackoffSeconds: 1, backoffMultiplier: 2 };
  const clock = mockClock(new Date('2026-01-01T00:00:00Z'));

  // Attempt 1 fails → nextRetry at T+1s
  // Attempt 2 fails → nextRetry at T+2s
  // Attempt 3 fails → nextRetry at T+4s
  // Attempt 4 would exceed max → FAILED
});
```

### Cleanup Checklist

- [ ] Remove deprecated `queueEmail` wrapper in API if fully superseded
- [ ] Verify no remaining direct Kysely `email_outbox` operations outside `OutboxStore` adapter
- [ ] Remove any temporary feature flags / dual-write paths from Phase 1

### Sprint Status Update

Update `_bmad-output/implementation-artifacts/sprint-status.yaml`:
- Mark Epic 37 as completed
- Log actual vs estimated hours per story
- Note any scope changes or risks encountered

---

## Tasks

- [ ] Write integration test: concurrent claim returns disjoint email sets
- [ ] Write integration test: retry backoff follows exponential curve
- [ ] Write integration test: max attempts transitions to FAILED
- [ ] Write integration test: status transitions follow state machine
- [ ] Verify all existing email-outbox API routes work end-to-end
- [ ] Remove legacy direct DB code from `apps/api/src/lib/email-outbox.ts`
- [ ] Verify no `apps/api` imports leak into `@jurnapod/notifications`
- [ ] Update sprint status with completion notes
- [ ] Run full test suite for affected packages

---

## Validation

```bash
npm run typecheck -w @jurnapod/api
npm run typecheck -w @jurnapod/notifications
npm test -w @jurnapod/notifications
# Integration tests for email-outbox in api
```
