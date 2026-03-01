<!-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
Ownership: Ahmad Faruk (Signal18 ID) -->

# Milestone M6 - Posting to GL Concurrency Checklist

## Title and context
This checklist tracks concurrency and atomicity work for M6: every POS `COMPLETED` transaction posted via `/sync/push` must create balanced GL journals exactly once, even under retries and concurrent requests.

Scope is based on current repository findings in:
- `apps/api/app/api/sync/push/route.ts`
- `apps/api/src/lib/sync-push-posting.ts`
- `packages/core/src/posting.ts`
- `packages/db/migrations/0001_init.sql`
- `apps/api/tests/integration/sync-push.integration.test.mjs`

## Overall readiness status
**GREEN (completed)**

Status note (2026-02-22): this execution checklist is now complete and superseded by the closure tracker in `docs/checklists/m6-release-conditions-checklist.md` and evidence in `docs/checklists/evidence/m6-pos-backfill/`.

## Concurrency model and ordering guarantees
- Per `client_tx_id`, exactly one writer wins via `pos_transactions` unique constraint.
- For new POS `COMPLETED`, one DB transaction must include:
  1. insert POS header/items/payments,
  2. insert `journal_batches` and `journal_lines`,
  3. insert audit,
  4. commit.
- Posting failures are terminal for that transaction (rollback all writes).
- Duplicate/retry requests are deterministic (`OK`, `DUPLICATE`, or idempotency conflict error) with no duplicate journals.
- Keep lock ordering consistent to reduce deadlocks:
  `pos_transactions -> pos child rows -> journal_batches -> journal_lines -> audit_logs`.

## Checklist by phase

Archive note: unchecked boxes below reflect the original planning snapshot before implementation. They are retained for traceability and are non-blocking because final completion is tracked in `docs/checklists/m6-release-conditions-checklist.md`.

### Phase A - DB constraints/migrations

- [ ] Add unique idempotency guard on journal docs: `UNIQUE (company_id, doc_type, doc_id)`.
  - Owner: DBA
  - Affected paths: `packages/db/migrations/0001_init.sql`, new migration `packages/db/migrations/0006_journal_batches_doc_unique.sql`
  - Done definition: migration applies cleanly; second insert with same `(company_id, doc_type, doc_id)` fails with MySQL duplicate-key; existing tests remain green.
  - Risk if skipped: **high**

- [x] Add journal line integrity constraints (`debit >= 0`, `credit >= 0`, and one-sided positive amount per line).
  - Owner: DBA
  - Affected paths: migration `packages/db/migrations/0008_journal_lines_integrity_checks.sql`
  - Done definition: invalid lines rejected by DB; valid inserts unaffected.
  - Risk if skipped: **medium**

- [x] Add `outlet_account_mappings` table for cash/qris/revenue/tax/ar with proper unique keys and FKs.
  - Owner: DBA
  - Affected paths: migration `packages/db/migrations/0007_outlet_account_mappings.sql`
  - Done definition: table exists with FK integrity and unique mapping semantics (`company_id`, `outlet_id`, `mapping_key` or equivalent design).
  - Risk if skipped: **high**

- [x] Add/verify indexes for posting lookup and reconciliation (`company_id,outlet_id,mapping_key`, `doc_type,doc_id`).
  - Owner: DBA
  - Affected paths: `packages/db/migrations/0007_outlet_account_mappings.sql` (plus `0006_journal_batches_doc_unique.sql`)
  - Done definition: `EXPLAIN` uses intended indexes for posting resolver and reconciliation queries.
  - Risk if skipped: **medium**

### Phase B - Atomic posting integration in `/sync/push`

- [ ] Remove swallowed posting errors; posting failures must abort current transaction.
  - Owner: Backend
  - Affected paths: `apps/api/app/api/sync/push/route.ts`, `apps/api/src/lib/sync-push-posting.ts`
  - Done definition: if posting throws, request result is `ERROR` and no POS/journal rows commit for that `client_tx_id`.
  - Risk if skipped: **high**

- [ ] Replace shadow/no-op posting hook with active posting in the same transaction connection.
  - Owner: Backend
  - Affected paths: `apps/api/src/lib/sync-push-posting.ts`, optional helper `apps/api/src/lib/posting-repository.ts`, `packages/core/src/posting.ts`
  - Done definition: accepted `COMPLETED` creates exactly one `journal_batches` row and corresponding `journal_lines` in same commit as POS rows.
  - Risk if skipped: **high**

- [ ] Enforce strict debit-credit balance before commit.
  - Owner: Backend
  - Affected paths: `apps/api/src/lib/sync-push-posting.ts`, `packages/core/src/posting.ts`, `packages/shared/src/schemas/posting.ts`
  - Done definition: any imbalance is rejected with rollback and deterministic error.
  - Risk if skipped: **high**

- [ ] Resolve posting accounts from `outlet_account_mappings` (remove hardcoded account IDs in active path).
  - Owner: Backend
  - Affected paths: `packages/modules/pos/src/index.ts`, `apps/api/src/lib/sync-push-posting.ts`
  - Done definition: cash/qris/revenue/tax/ar accounts come from mapping rows by company/outlet; missing mapping fails fast with rollback.
  - Risk if skipped: **high**

- [ ] Preserve single outer transaction ownership (no nested begin/commit in hook).
  - Owner: Backend
  - Affected paths: `apps/api/app/api/sync/push/route.ts`, `apps/api/src/lib/sync-push-posting.ts`
  - Done definition: one transaction per pushed transaction item, verified by tests and code review.
  - Risk if skipped: **medium**

### Phase C - Idempotency and duplicate semantics

- [ ] Standardize journal identity as `doc_type='POS_SALE'` and `doc_id=pos_transactions.id`.
  - Owner: Backend
  - Affected paths: `apps/api/src/lib/sync-push-posting.ts`
  - Done definition: replay and concurrency cannot produce second journal batch because of unique key + deterministic identity.
  - Risk if skipped: **high**

- [ ] Keep deterministic duplicate outcomes:
  - same hash -> `DUPLICATE`
  - different hash same `client_tx_id` -> idempotency conflict (`ERROR` + explicit reason)
  - Owner: Backend
  - Affected paths: `apps/api/app/api/sync/push/route.ts`, `docs/api/` sync contract docs
  - Done definition: response matrix documented and asserted in tests.
  - Risk if skipped: **high**

- [ ] Classify deadlock/lock-timeout as retryable, with zero partial side effects.
  - Owner: Backend
  - Affected paths: `apps/api/app/api/sync/push/route.ts`
  - Done definition: forced lock/deadlock tests show retryable error semantics and no committed partial POS/GL rows.
  - Risk if skipped: **high**

- [ ] Enrich audit payload for posting outcomes (`posting_mode`, `journal_batch_id`, `balance_ok`, failure reason).
  - Owner: Backend
  - Affected paths: `apps/api/app/api/sync/push/route.ts`
  - Done definition: audit rows can be used to diagnose replay/posting outcomes without log scraping.
  - Risk if skipped: **medium**

### Phase D - Concurrency test coverage

- [ ] Add integration test: concurrent identical payload + same `client_tx_id` -> one `OK`, one `DUPLICATE`, exactly one journal batch.
  - Owner: QA
  - Affected paths: `apps/api/tests/integration/sync-push.integration.test.mjs`
  - Done definition: stable row-count assertions for POS and GL tables across repeated runs.
  - Risk if skipped: **high**

- [ ] Add integration test: concurrent different payloads same `client_tx_id` -> one `OK`, one idempotency conflict, one journal batch only.
  - Owner: QA
  - Affected paths: `apps/api/tests/integration/sync-push.integration.test.mjs`
  - Done definition: deterministic result pair and exactly-once side effects.
  - Risk if skipped: **high**

- [ ] Add rollback test: posting failure after POS inserts but before commit -> no POS/journal writes persisted.
  - Owner: QA
  - Affected paths: `apps/api/tests/integration/sync-push.integration.test.mjs`, `apps/api/src/lib/sync-push-posting.ts`
  - Done definition: all involved table counts remain unchanged on failure path.
  - Risk if skipped: **high**

- [ ] Add balance invariant test: unbalanced mapper output must fail and rollback.
  - Owner: QA
  - Affected paths: `apps/api/tests/integration/sync-push.integration.test.mjs`
  - Done definition: API returns deterministic error; no persisted rows.
  - Risk if skipped: **high**

- [ ] Add retryability test for deadlock/lock-timeout including journal tables.
  - Owner: QA
  - Affected paths: `apps/api/tests/integration/sync-push.integration.test.mjs`
  - Done definition: retryable classification proven with zero partial data.
  - Risk if skipped: **medium**

### Phase E - Rollout + backfill/reconciliation

- [ ] Use staged posting mode rollout (`disabled -> shadow -> active`) with explicit env/config contract.
  - Owner: Backend
  - Affected paths: `apps/api/src/lib/sync-push-posting.ts`, `.env.example`, `docs/`
  - Done definition: mode behavior documented; rollout can be toggled safely without schema rollback.
  - Risk if skipped: **high**

- [ ] Build idempotent backfill job for historical `COMPLETED` POS rows missing journals.
  - Owner: Backend + DBA
  - Affected paths: new script `packages/db/scripts/backfill-pos-journals.mjs` (or equivalent), SQL queries on POS and journal tables
  - Done definition: dry-run and execute modes; rerunnable without duplicate journals due to unique doc key.
  - Risk if skipped: **high**

- [ ] Add reconciliation report/query for gaps: missing journal per POS, unbalanced batches, orphans.
  - Owner: DBA + QA
  - Affected paths: `docs/` SQL playbook or `packages/db/scripts/`
  - Done definition: report is clean (or tracked exceptions) before M6 sign-off.
  - Risk if skipped: **high**

- [ ] Update operational runbook for retry storms, deadlocks, idempotency conflicts, and manual replay.
  - Owner: Backend + QA
  - Affected paths: `docs/` (new M6 runbook/checklist reference)
  - Done definition: on-call steps include verification queries and safe replay procedures.
  - Risk if skipped: **medium**

## Blocking dependencies
Archive note: this dependency list is historical context from planning stage and is not an active release gate for M6 anymore.
- DBA approval and migration window for new unique/constraint changes.
- Final finance/accounting mapping rules for cash/qris/revenue/tax/ar at outlet scope.
- Contract agreement for idempotency conflict error representation in `/sync/push` response payload.
- Deterministic `doc_type/doc_id` convention finalized before backfill starts.
- Test environment that can reliably simulate lock-timeout/deadlock scenarios.

## Safe rollout order
1. Apply Phase A migrations in non-prod, then prod (with pre-checks for conflicting historical data).
2. Ship Phase B implementation behind mode flag default `disabled`.
3. Ship Phase C response semantics and docs.
4. Add and enforce Phase D tests in CI as a release gate.
5. Enable `shadow` in non-prod, validate metrics/audit/reconciliation.
6. Enable `active` for limited outlets, monitor error/latency/retry behavior.
7. Run Phase E backfill and reconciliation, then expand rollout globally.

## Exit criteria for milestone M6
- `POST /api/sync/push` commits POS + balanced journals atomically for `COMPLETED` transactions.
- Posting failures are never swallowed; failed posting implies full rollback.
- Concurrency/retry behavior is deterministic and idempotent with exactly-one journal batch per POS document.
- DB constraints enforce journal idempotency and line integrity.
- Reconciliation confirms no unresolved missing-journal or unbalanced-journal gaps for in-scope outlets/companies.
- Integration tests for concurrency, rollback, and balance invariants pass consistently in CI.
