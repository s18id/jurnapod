# Milestone M4 Execution Checklist

Status: working checklist

Tech baseline: POS client is **Vite + React + PWA** (offline-first behavior is mandatory).

Scope references:
- `docs/api/m3-master-data-handover.md`
- `docs/api/m4-pr08-implementation-blueprint.md`

Core decisions locked:
- Internal PK/FK use BIGINT (numeric IDs in contracts).
- UUID is reserved for offline/idempotency identifiers.
- Required UUID for M4: `client_tx_id`.

## Preflight (Contract Lock) — Estimate: S

- [x] **BLOCKER** Freeze M4 contract (pull payload, local statuses, outbox statuses, ID rules).
  - Owner: FE + API lead
  - Done criteria: one approved note links the two scope references and includes field/status matrix.
  - Evidence: `docs/api/m4-contract-freeze-signoff.md`.
  - Dependency: none

- [x] **BLOCKER** Confirm append-only and scope invariants in implementation notes.
  - Owner: FE
  - Done criteria: PR template/checklist states: completed sale cannot be edited; all rows must carry `company_id` + `outlet_id` + actor context.
  - Evidence: `docs/api/m4-contract-freeze-signoff.md` (invariant signoff section).
  - Dependency: contract freeze

- [x] Lock PR slicing (`PR-08` foundation first, `PR-09` UI second).
  - Owner: FE lead
  - Done criteria: two separate PR plans with clear file boundaries and acceptance mapping.
  - Evidence: `docs/api/m4-pr08-implementation-blueprint.md`, `docs/api/m4-contract-freeze-signoff.md`.
  - Dependency: contract freeze

- [x] Define test matrix before coding.
  - Owner: QA + FE
  - Done criteria: each acceptance criterion has at least one automated and one manual verification case.
  - Evidence: `docs/api/m4-contract-freeze-signoff.md`, `docs/api/m4-pwa-baseline-manual-qa-runbook.md`, `docs/api/m4-automated-qa-evidence.md`.
  - Dependency: contract freeze

## PR-08 (Dexie + Utilities) — Estimate: M

- [x] **BLOCKER** Implement Dexie tables and indexes per blueprint.
  - Owner: FE
  - Done criteria: tables exist (`products_cache`, `sales`, `sale_items`, `payments`, `outbox_jobs`) and unique dedupe on `outbox_jobs.dedupe_key` is enforced.
  - Dependency: preflight complete

- [x] **BLOCKER** Implement `createSaleDraft`.
  - Owner: FE
  - Done criteria: creates scoped `DRAFT` sale only; rejects missing scope fields; no outbox side effects.
  - Dependency: Dexie schema

- [x] **BLOCKER** Implement atomic `completeSale` transaction.
  - Owner: FE
  - Done criteria: only `DRAFT -> COMPLETED`; writes snapshots + payments + one pending outbox job; generates `client_tx_id` exactly once.
  - Dependency: draft utility + schema

- [x] **BLOCKER** Implement `enqueueOutboxJob` idempotency.
  - Owner: FE
  - Done criteria: dedupe key is `client_tx_id`; duplicate enqueue returns existing job (no duplicate insert).
  - Dependency: complete sale flow

- [x] Enforce snapshot integrity and outlet cache guard.
  - Owner: FE
  - Done criteria: completion fails clearly if required product snapshot not found for selected outlet.
  - Dependency: `products_cache` integration

- [x] Add PR-08 tests.
  - Owner: FE + QA
  - Done criteria: green tests for atomic writes, dedupe, persistence after reload, snapshot immutability.
  - Dependency: utilities complete

## Concurrency Guards (apply during PR-08/PR-09) — Estimate: M

- [x] **BLOCKER** Enforce single transaction boundary for `completeSale`.
  - Owner: FE
  - Done criteria: sale header update + snapshot lines + payments + outbox enqueue happen in one Dexie RW transaction, with no network call inside transaction.
  - Dependency: PR-08 utility implementation

- [x] **BLOCKER** Enforce deterministic transition failure for concurrent completion.
  - Owner: FE
  - Done criteria: concurrent completion on same `sale_id` results in exactly one success and one typed failure (`SALE_COMPLETION_IN_PROGRESS` or invalid transition).
  - Dependency: complete sale implementation

- [x] **BLOCKER** Enforce outbox idempotency via unique dedupe and collision recovery.
  - Owner: FE
  - Done criteria: `dedupe_key = client_tx_id` unique index exists; enqueue collision path catches constraint and returns existing job.
  - Dependency: outbox table + enqueue implementation

- [x] **BLOCKER** Protect outbox status updates from stale responses.
  - Owner: FE
  - Done criteria: status updates require current attempt token/counter; stale attempt is ignored; `SENT` is never downgraded.
  - Dependency: outbox status update helper

- [x] Add UI in-flight guard on Complete action.
  - Owner: FE
  - Done criteria: complete button locks per `sale_id` while request is in progress to prevent double-submit race.
  - Dependency: PR-09 UI wiring

- [x] Add multi-tab sync-drainer guard (leader lock).
  - Owner: FE
  - Done criteria: only one tab drains outbox at a time (Web Locks API preferred; fallback documented).
  - Dependency: outbox worker wiring (can be post-PR-09 if worker deferred)

## PR-09 (Minimal POS UI) — Estimate: M

- [x] **BLOCKER** Wire local-first checkout UI.
  - Owner: FE
  - Done criteria: cashier can complete sale in offline mode; records persist in IndexedDB without network.
  - Dependency: PR-08 merged

- [x] **BLOCKER** Implement runtime sync badge (`Offline` / `Pending` / `Synced`).
  - Owner: FE
  - Done criteria: badge reflects network and outbox state consistently.
  - Dependency: PR-08 data model

- [x] Enforce outlet-scoped product list/search and cache prerequisites.
  - Owner: FE
  - Done criteria: if offline cache for selected outlet is missing, checkout is blocked with explicit message.
  - Dependency: master-data cache read path

- [x] Add manual sync-pull ingestion action per active outlet.
  - Owner: FE
  - Done criteria: UI can trigger `/api/sync/pull` ingestion into local `products_cache`, and persisted `data_version` is tracked per company/outlet.
  - Dependency: sync-pull client + local sync metadata table

- [x] Reconcile stale product cache rows and persist pulled config per scope.
  - Owner: FE
  - Done criteria: newer sync-pull deactivates stale product rows not in latest payload, and stores scoped `tax` + `payment_methods` with matching `data_version`.
  - Dependency: sync-pull ingestion transaction + scoped config store

- [x] Enforce scoped payment-method config in runtime checkout.
  - Owner: FE
  - Done criteria: checkout payment selector uses scoped `payment_methods`; missing config falls back to `CASH` with tax `0`/exclusive defaults; invalid selected method auto-corrects and cannot complete.
  - Dependency: scoped config read path in runtime refresh

- [x] Add leader-protected outbox drainer plumbing with sender mapping.
  - Owner: FE
  - Done criteria: runtime drain cycle runs under leader lock, handles `OK|DUPLICATE` as `SENT`, and marks retryable/non-retryable failures as `FAILED` with backoff.
  - Dependency: outbox sender/drainer modules

- [x] Prevent outbox drainer starvation across outlet scopes.
  - Owner: FE
  - Done criteria: runtime drain trigger considers due jobs across DB scopes, not only active outlet pending badge count.
  - Dependency: runtime global due-outbox detector

- [x] Complete real `/api/sync/push` transport integration end-to-end.
  - Owner: FE + API
  - Done criteria: authenticated sender uses server contract and maps per-transaction response reliably in real network flow.
  - Automated evidence: `apps/api/app/api/sync/push/route.ts`, `apps/api/tests/integration/sync-push.integration.test.mjs`, `apps/pos/src/offline/outbox-sender.ts`, `apps/pos/src/main.tsx` (tokenized login + authorized sync pull/push wiring).
  - Dependency: API `/sync/push` readiness

- [x] Keep completed sales immutable in UI.
  - Owner: FE
  - Done criteria: no edit affordance after completion; only future correction entry points.
  - Dependency: lifecycle enforcement in utilities

## Verification / QA (Offline + Outbox + PWA) — Estimate: M

- [x] **BLOCKER** Offline transaction QA.
  - Owner: QA
  - Done criteria: create + complete sale while offline, reload app, data and outbox remain intact.
  - Automated evidence: `apps/pos/src/offline/__tests__/sales.test.mjs` (completed sale + outbox survive reopen), `apps/pos/src/offline/__tests__/runtime.test.mjs` (reopen snapshot keeps completed and pending counts for badge state).
  - Dependency: PR-09 flow

- [x] **BLOCKER** Idempotency QA for outbox jobs.
  - Owner: QA + FE
  - Done criteria: repeated completion/enqueue path does not produce duplicate job for same `client_tx_id`.
  - Automated evidence: `apps/pos/src/offline/__tests__/outbox.test.mjs` (concurrent enqueue collision keeps one physical outbox row).
  - Dependency: PR-08 + PR-09 wiring

- [x] **BLOCKER** Concurrency QA for sale completion and enqueue collision.
  - Owner: QA + FE
  - Done criteria: automated tests cover double-complete same sale and concurrent enqueue collision with expected single-winner outcomes.
  - Automated evidence: `apps/pos/src/offline/__tests__/sales.test.mjs` (double complete single winner), `apps/pos/src/offline/__tests__/outbox.test.mjs` (enqueue collision single winner).
  - Dependency: PR-08 tests

- [x] **BLOCKER** Network flapping race QA.
  - Owner: QA + FE
  - Done criteria: delayed failure from older attempt cannot overwrite newer success; final status remains `SENT`.
  - Automated evidence: `apps/pos/src/offline/__tests__/outbox-drainer.test.mjs` (concurrent drain attempts: attempt-2 success persists `SENT`, delayed attempt-1 failure is stale/ignored).
  - Dependency: outbox status attempt-token guard

- [x] Scope isolation QA.
  - Owner: QA
  - Done criteria: no cross-company/cross-outlet leakage in reads and writes.
  - Automated evidence: `apps/api/tests/integration/sync-push.integration.test.mjs` (forbidden outlet access path), `apps/pos/src/offline/sync-pull.ts` + `apps/pos/src/offline/__tests__/sync-pull.test.mjs` (company/outlet-scoped cache writes + per-scope data_version/config).
  - Dependency: seeded scenarios

- [x] Snapshot integrity QA.
  - Owner: QA
  - Done criteria: historical sale lines stay unchanged after product/price cache updates.
  - Automated evidence: `apps/pos/src/offline/__tests__/sales.test.mjs` (sale item snapshots remain immutable after cache change), `apps/pos/src/offline/__tests__/sync-pull.test.mjs` (stale-row reconciliation + version replay non-regression).
  - Dependency: snapshot implementation

- [x] PWA baseline QA.
  - Owner: QA
  - Done criteria: offline app shell works, installability valid, manifest/icons present, runtime badge visible.
  - Runbook: `docs/api/m4-pwa-baseline-manual-qa-runbook.md` (execute manually; attach evidence before closing).
  - Evidence template: `docs/api/m4-pwa-baseline-evidence-log-template.md` (fill per-step pass/fail + screenshot paths; attach to QA ticket).
  - Automated pre-check evidence: `docs/api/m4-automated-qa-evidence.md`.
  - Manual evidence bundle: `docs/api/evidence/m4-pwa/2026-02-22/`.
  - Dependency: PWA assets + UI integration

## Critical Path

1. Contract freeze and invariant sign-off (**BLOCKER**)
2. Dexie schema/indexes with strict dedupe (**BLOCKER**)
3. Atomic completion + idempotent outbox enqueue (**BLOCKER**)
4. Concurrency guards complete (transition lock, dedupe recovery, stale-response protection) (**BLOCKER**)
5. PR-08 automated tests green
6. Local-first checkout UI wiring (**BLOCKER**)
7. Offline/outbox/PWA/concurrency QA gates pass (**BLOCKER**)
