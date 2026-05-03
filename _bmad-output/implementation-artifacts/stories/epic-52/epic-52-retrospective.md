# Epic 52 Retrospective — Datetime Standardization + Idempotency Hardening

**Date:** 2026-05-02
**Epic:** 52 — Datetime Standardization + Idempotency Hardening
**Status:** ✅ Complete
**Theme:** Drift prevention — stabilize datetime API and idempotency contracts

---

## Story Summary

| Story | Title | Status |
|-------|-------|--------|
| 52.1 | Datetime Utility Surface Consolidation | done |
| 52.2 | Reservation Legacy Fallback Removal | done |
| 52.3 | POS Timestamp Alignment | done |
| 52.4 | Fiscal Close Idempotency Hardening | done |
| 52.5 | AP Idempotency Key Standardization | done |
| 52.6 | Sync Contract Standardization | done |
| 52.7 | Sync Idempotency: Duplicate vs Error | done |
| 52.8 | AP Payment Journal Atomicity | done |
| 52.9 | Observability Idempotency Metrics | done |
| 52.10 | Integration Test Gate | done |

---

## What Went Well

**1. Audit-first approach established clear canonical boundaries (Story 52-1)**
Layer-by-layer audit across 6 code layers identified all datetime reimplementations; established `packages/shared/src/schemas/datetime.ts` as single source of truth. Found and fixed `toDbDateTime` using `new Date()` parsing in 2 locations (silently accepting invalid dates like Feb 30 → March 2). 89 unit tests validate canonical surface (67 shared + 22 reservations). Evidence: story-52-1.md lines 49–94.

**2. DB-atomic idempotency patterns applied consistently across all domains**
`INSERT...ON DUPLICATE KEY UPDATE` used for fiscal close (story 52-4), all 5 AP document types (story 52-5), and POS sync (story 52-3). Composite unique constraints with `company_id` prevent cross-tenant collisions. Evidence: story-52-4 AC-2 "single retried transaction"; story-52-5 migration 0198 + unique indexes; story-52-3 composite unique constraint on `(company_id, outlet_id, client_tx_id)`.

**3. Hard cutover without permanent dual-read fallback (Story 52-2)**
`reservation_at` removed from all write paths; migration 0196 backfills and enforces NOT NULL on canonical `_ts` columns. Timezone resolution order enforced: `outlet.timezone` → `company.timezone` (no UTC fallback). Overlap rule `start < next_end` validated. Evidence: story-52-2.md lines 39–47, migration 0196.

**4. Canonical sync contract enforced with zero alias fields (Story 52-6)**
`CONFLICT` removed from `TableSyncPushStatusSchema`; `ERROR` is canonical conflict status. `since_version`/`data_version` cursors confirmed in all sync handlers. `sync_data_version`/`sync_tier_version` alias fields verified absent in runtime payloads (only archival schema type names remain in Kysely types). Evidence: story-52-6.md lines 50–62, validation results lines 96–102.

**5. 3-retry ceiling + SKIPPED audit trail for duplicate detection (Story 52-7)**
Standardized SCREAMING_SNAKE_CASE error codes (`COMPANY_ID_MISMATCH`, `OUTLET_ID_MISMATCH`, etc.). `MAX_RETRY_ATTEMPTS=3` ceiling added to outbox drainer; terminal FAILED state after exhaustion. `audit_logs.result='SKIPPED'` inserted on all 3 duplicate detection paths. Evidence: story-52-7.md lines 54–69, validation results lines 108–113.

**6. DRY refactors reduced duplication across AP services (Story 52-5)**
Extracted `decimal-scale4.ts` and `purchase-invoice-open-amount.ts` helpers; reused across AP Payment, Purchase Credit, and Purchase Invoice services. Evidence: story-52-5.md lines 118, 150–152, DRY validation lines 188–195.

**7. Tenant-isolated observability extending existing collectors (Story 52-9)**
`company_id` label added to `SyncMetricsCollector` (fixing Story 30.7 tenant isolation gap). Alert rules for duplicate rate (>5%) and error rate (>1%) added to `AlertEvaluationService`. `SyncIdempotencyMetricsCollector` gained per-tenant aggregation + latency percentiles. 303 unit tests pass (71 sync-core + 232 API). Evidence: story-52-9.md lines 80–130, validation lines 215–218.

**8. Deterministic integration gate proving zero duplicate financial effects (Story 52-10)**
5 idempotency scenarios audited; 2 gaps filled (sync push enhanced assertions, sales credit note void new test). 3× consecutive green runs (50 tests × 3 = 150 green), avg 19s/run. Evidence: story-52-10.md lines 38–65, validation lines 127, 136.

---

## What Could Improve

**1. Pre-existing lint debt in `apps/api` (17 errors, 157 warnings)**
All pre-existing, none in modified files. Story 52-1 dev notes (line 119) flag this but correctly note it is outside epic scope. Evidence: story-52-1.md line 119, story-52-10.md line 134.

**2. ESLint `no-datetime-reimplementation` rule deferred to follow-up story**
Identified in story 52-1 task 1.5 as P3; correctly deferred to a dedicated rule-authoring story. However, without it there is no automated enforcement against future datetime utility drift. Evidence: story-52-1.md line 44, line 101, line 158.

**3. Task 9.11 (integration test for `/metrics` endpoint) deferred**
Unit test coverage exists (16 tests for SyncMetricsCollector, story 52-9); full integration test not created. Not a blocker for epic close but reduces confidence in end-to-end wiring. Evidence: story-52-9.md lines 122, 175–179.

**4. Pre-existing architectural gap in `postAPPayment` transaction (story 52-8)**
If connection is lost between journal_lines INSERT and ap_payments UPDATE, payment remains DRAFT with orphaned journal batch. Not introduced by this epic; compensating control or saga pattern would be needed for full resilience. Evidence: story-52-8.md lines 163–166.

**5. No table-sync integration test harness exists**
Gap identified in story 52-6 review finding and confirmed in story 52-7. Conflict path (CONFLICT→ERROR canonicalization) cannot be integration-tested without this harness. Pre-existing gap, not introduced by epic. Evidence: story-52-6.md line 200 (Review finding defer); story-52-7.md line 180.

**6. PO/GRN concurrent replay test coverage not added**
Story 52-5 added concurrent duplicate-key tests for PI and Purchase Credit; PO and GRN concurrent coverage expanded as backlog. Evidence: story-52-5.md lines 213–214, line 218.

---

## Action Items (Max 2)

1. **Author `no-datetime-reimplementation` ESLint rule** — Owner: TBD — Deadline: Next epic with lint/quality focus — Success criterion: Rule detects any new `toEpochMs`/`fromEpochMs`/`toUtcInstant`/`fromUtcInstant`/`resolveEventTime` reimplementation outside `packages/shared/src/schemas/datetime.ts`; prevents datetime utility drift. Evidence: story-52-1.md line 44, line 101, line 158 (deferred P3).

2. **Create table-sync integration test harness** — Owner: TBD — Deadline: Next epic involving reservations/table-sync — Success criterion: Harness can integration-test conflict detection path (CONFLICT→ERROR canonicalization); eliminates pre-existing gap noted in stories 52-6 and 52-7. Evidence: story-52-6.md line 200 (Review finding defer); story-52-7.md line 180 ("no table-sync integration test harness exists (pre-existing)").

---

## Deferred Items

- **ESLint rule `no-datetime-reimplementation`** (P3, story 52-1 task 1.5; story 52-1 dev notes line 101)
- **Integration test for `/metrics` endpoint** (story 52-9 task 9.11; story 52-9 dev notes lines 175–179)
- **Concurrent PO/GRN replay test coverage** (story 52-5 review finding; story 52-5 dev notes line 218 — lower-priority backlog)
- **Table-sync integration test harness** (story 52-6 review finding; story 52-7 line 180 — pre-existing infrastructure gap)
- **Payment DRAFT + orphaned journal batch architectural risk** (story 52-8 dev notes lines 163–166 — pre-existing, not introduced by epic)
- **Pre-existing lint errors in `apps/api`** (17 errors, 157 warnings — story 52-1 line 119; outside epic scope)

---

*Epic 52 retrospective complete. All 10 stories done. 3× green integration gate achieved. Datetime API and idempotency contracts stabilized.*