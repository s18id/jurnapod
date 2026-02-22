# M4 Contract Freeze And Invariant Signoff

Status: approved baseline for M4 signoff

## Scope

This note closes the preflight process blockers by freezing M4 contract assumptions used in implementation.

References:
- `docs/api/m3-master-data-handover.md`
- `docs/api/m4-pr08-implementation-blueprint.md`
- `docs/api/m4-execution-checklist.md`

## Field And Status Matrix

- Internal IDs use numeric/BIGINT model in contracts.
- Offline/idempotency identifier is UUID `client_tx_id`.
- POS lifecycle statuses:
  - local sale: `DRAFT -> COMPLETED`
  - correction path: `VOID/REFUND` as new records (no mutation of completed sale)
- Outbox lifecycle statuses:
  - `PENDING -> SENT|FAILED`
  - retries use attempt token guard; stale attempts do not overwrite newer state.
- Sync push per-item response statuses:
  - `OK | DUPLICATE | ERROR`

## Invariant Signoff

- **Append-only completed sales**: completed sale records are immutable in local flow.
- **Scope binding**: operational rows include `company_id` + `outlet_id` (+ actor context where relevant).
- **Idempotency**: sync dedupe key is `client_tx_id` (server and outbox behavior aligned).
- **Snapshot integrity**: sale item snapshots persist historical values independent from later product cache changes.

## PR Slicing Confirmation

- PR-08: Dexie schema + offline utilities + outbox foundation.
- PR-09: minimal UI flows + runtime sync/pull integration + status badge.

## Test Matrix (Implementation Evidence)

- Unit/local integration:
  - sale transition and atomic completion,
  - outbox dedupe and stale-attempt guard,
  - sync-pull versioning + scoped cache/config.
- API integration:
  - sync-push idempotency (`OK` first, `DUPLICATE` replay),
  - outlet access denial paths.
- Automated QA layer:
  - Playwright E2E smoke,
  - Lighthouse automated check runner.
- Manual-only gate:
  - PWA installability/offline shell evidence runbook.
