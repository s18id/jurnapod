# AGENTS.md

## Scope
Offline-first cashier app rules for local persistence, outbox behavior, sync safety, and finalized transaction flows.

## Review guidelines

### Priority
- Treat any regression that can lose offline data, corrupt outbox state, or duplicate synced transactions as P1.
- Treat any change that weakens cashier reliability under intermittent connectivity as high risk.

### Offline-first guarantees
- POS must write transactions to local storage first.
- Flag changes that make the UI depend on network availability before recording a sale.
- Verify the app remains usable while offline or on unstable connections.

### Outbox and sync
- Review outbox transitions carefully.
- Flag any change that can strand records between pending, sent, failed, retried, or acknowledged states.
- Verify repeated sends do not create duplicate server-side effects.
- Verify sync status remains visible and understandable in the UI.

### Finalized transaction rules
- Flag any flow that edits finalized transactions directly instead of using `VOID` or `REFUND`.
- Verify historical line-item snapshots remain preserved where required, including item name and price snapshots.

### Outlet-specific behavior
- Verify cached master data stays scoped to the current outlet.
- Flag any change that can mix prices, taxes, settings, or items across outlets.

### UX and correctness
- Prefer safe workflows over clever shortcuts.
- Flag ambiguous UI states around sync conflicts, duplicate submissions, or partial failure.
- Preserve operator trust: a cashier should be able to tell whether a transaction is recorded locally, pending sync, or fully synced.

### Testing expectations
- Expect tests when changing:
  - IndexedDB or local persistence logic
  - outbox behavior
  - sync retries
  - refund / void flows
  - outlet-specific cache behavior

---

## Database Testing Policy (MANDATORY)

**NO MOCK DB for DB-backed business logic tests.** Use real DB via `.env`.

Any DB mock found in DB-backed tests is a P0 risk and must be treated as a blocker.

Mocking database interactions for code that reads/writes SQL tables creates a **false sense of security** and introduces **severe production risk**:

- Mocks don't catch SQL syntax errors, schema mismatches, or constraint violations
- Mocks hide transaction isolation issues that only manifest under real concurrency
- Mocks mask performance problems that only appear with real data volumes
- Integration tests with real DB catch these issues early, before production

**What may still be mocked:**
- External HTTP services
- Message queues
- File system operations
- Time (use `vi.useFakeTimers()`)

**Non-DB logic** (pure computation) may use unit tests without database.