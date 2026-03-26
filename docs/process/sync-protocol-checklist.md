# Sync Protocol Validation Checklist

**Purpose:** Mandatory validation steps for any sync-related changes to prevent protocol regressions and ensure offline-first guarantees.

**When to use:** Any story that modifies POS sync, data synchronization, offline-first behavior, or conflict resolution logic.

---

## Section 1: Pre-Implementation

- [ ] Identify all sync touchpoints (push, pull, bidirectional)
- [ ] Review offline-first requirements with the team
- [ ] Document the current sync flow (sequence diagrams if complex)
- [ ] Identify what `client_tx_id` is used for in this flow
- [ ] Review existing ADR-0009 sync patterns (Epic 2 Lessons Learned)

---

## Section 2: Implementation

- [ ] `client_tx_id` handling verified (deduplication pre-check)
- [ ] Idempotency logic implemented (same request = same result)
- [ ] Conflict resolution strategy defined (last-write-wins, server-wins, merge?)
- [ ] Explicit result states implemented (`OK`, `DUPLICATE`, `ERROR` - no silent failures)
- [ ] Transaction boundaries correct (all-or-nothing semantics)
- [ ] Error handling covers network failures, partial failures, timeouts

---

## Section 3: Testing

### Regression Tests
- [ ] Regression tests added/updated for existing sync behavior
- [ ] Test idempotency: same `client_tx_id` sent twice produces same result
- [ ] Test conflict scenarios

### Offline Scenario Tests
- [ ] Offline scenario tests pass (queue locally, sync when online)
- [ ] Test network timeout handling
- [ ] Test partial sync failure recovery

### Concurrent Sync Tests
- [ ] Concurrent sync tests pass (multiple devices syncing same outlet)
- [ ] Test race conditions in deduplication
- [ ] Test concurrent writes to same resource

---

## Section 4: Documentation

- [ ] ADR updated if sync protocol changes (create new ADR or amend existing)
- [ ] API contracts updated if payload/schema changed
- [ ] Sync flow documented in appropriate ADR
- [ ] Error codes and result states documented

---

## Quick Reference: Sync Result States

Every sync operation MUST return one of these explicit states:

| State | Meaning | Action |
|-------|---------|--------|
| `OK` | Success | Client proceeds |
| `DUPLICATE` | Already processed | Client acknowledges, no re-processing |
| `ERROR` | Failed | Client retries or reports to user |

**Never** return silent success or swallow errors.

---

## Quick Reference: `client_tx_id` Pattern

```typescript
// Batch pre-check: fast path for already-processed transactions
const existing = await kysely
  .selectFrom("pos_transactions")
  .where("client_tx_id", "in", clientTxIds)
  .select(["client_tx_id"])
  .execute();

const alreadyProcessed = new Set(existing.map(r => r.client_tx_id));
const newTxIds = clientTxIds.filter(id => !alreadyProcessed.has(id));
```

---

## References

- [ADR-0009: Kysely Type-Safe Query Builder](../adr/ADR-0009-kysely-type-safe-query-builder.md) — Sync Routes patterns
- Epic 2 Lessons Learned in ADR-0009
- Story 3.6: Sync Protocol Edge Cases (Epic 3 retrospective)

---

**Last Updated:** 2026-03-26
