<!-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
Ownership: Ahmad Faruk (Signal18 ID) -->

# M6 Release Conditions Checklist (Post-Audit)

## Title and scope
Practical checklist used to close M6 release conditions, now finalized at **PASS** with release recommendation **GO**.

Scope in this file is limited to unresolved items only:
1. Historical POS backfill + reconciliation.
2. DB-level journal line integrity constraints.
3. Active-mode concurrent race proof for exactly-once journals.
4. Optional audit payload hardening.

## Current status snapshot
- Verdict: **PASS**.
- Release recommendation: **GO**.
- Already resolved (out of scope here): active posting path, rollback behavior, SALES_TAX emission, CARD deterministic policy, migrations `0006`/`0007`, integration coverage for tax/card/unbalanced/rollback/replay.
- Progress update (this snapshot): Conditions 1-4 are complete with repository evidence for scope `company_id=1`, `outlet_id=1`; cross-function approvals (DBA, QA, Accounting) are recorded.

## Must-do conditions

### 1) Backfill + reconciliation for historical `COMPLETED` POS without journals

- [x] Prepare idempotent backfill tooling and reconciliation runbook.
  - Owner role: Backend + DBA
  - Evidence references: `packages/db/scripts/backfill-pos-journals.mjs`, `docs/db/pos-journal-backfill-reconciliation.md`, `packages/db/package.json` (`db:backfill:pos-journals` script)
  - Done criteria: script supports dry-run/execute modes, bounded scope flags, idempotent duplicate handling, and reconciliation counters.

- [x] Execute idempotent backfill for historical gaps in target environment.
  - Owner role: Backend + DBA
  - Affected paths: `packages/db/scripts/backfill-pos-journals.mjs`, `docs/db/pos-journal-backfill-reconciliation.md`, `apps/api/src/lib/sync-push-posting.ts` (doc identity parity check only if needed)
  - Done criteria: dry-run report approved; execute mode inserts missing journals only; rerun produces zero additional inserts.
  - Verification command/query: `npm run db:backfill:pos-journals -- --dry-run --company-id=<COMPANY_ID>`; then `npm run db:backfill:pos-journals -- --execute --company-id=<COMPANY_ID>`; then verify with `npm run db:reconcile:pos-journals -- --company-id=<COMPANY_ID>` (expect `reconcile.status=PASS` for completed scope).
  - Copy-paste command template (replace placeholders before run):
    ```bash
    RUN_TS="$(date -u +%Y%m%dT%H%M%SZ)"
    EVIDENCE_DIR="docs/checklists/evidence/m6-pos-backfill"
    COMPANY_ID=<COMPANY_ID>
    OUTLET_ID=<OUTLET_ID_OR_EMPTY>
    LIMIT=<LIMIT_OR_EMPTY>

    OUTLET_SLUG="all"
    if [ -n "$OUTLET_ID" ]; then OUTLET_SLUG="$OUTLET_ID"; fi
    RUN_PREFIX="${RUN_TS}-company-${COMPANY_ID}-outlet-${OUTLET_SLUG}"

    SCOPE_ARGS="--company-id=${COMPANY_ID}"
    if [ -n "$OUTLET_ID" ]; then SCOPE_ARGS="$SCOPE_ARGS --outlet-id=${OUTLET_ID}"; fi
    if [ -n "$LIMIT" ]; then SCOPE_ARGS="$SCOPE_ARGS --limit=${LIMIT}"; fi

    mkdir -p "$EVIDENCE_DIR"
    npm run db:backfill:pos-journals -- --dry-run $SCOPE_ARGS | tee "$EVIDENCE_DIR/${RUN_PREFIX}-dry-run.log"
    npm run db:backfill:pos-journals -- --execute $SCOPE_ARGS | tee "$EVIDENCE_DIR/${RUN_PREFIX}-execute.log"
    npm run db:backfill:pos-journals -- --execute $SCOPE_ARGS | tee "$EVIDENCE_DIR/${RUN_PREFIX}-execute-rerun.log"
    npm run db:reconcile:pos-journals -- $SCOPE_ARGS | tee "$EVIDENCE_DIR/${RUN_PREFIX}-reconciliation.log"
    ```
  - Verification result (2026-02-22, scope `company_id=1`, `outlet_id=1`):
    - Dry-run: `missing_candidates=2`, `reconcile_before.missing_completed_pos=2`, `reconcile_before.unbalanced_pos_sale_batches=0`, `reconcile_before.orphan_pos_sale_batches=0`
    - Execute (first run): `execute.inserted=2`, `execute.failed=0`, `reconcile_after.missing_completed_pos=0`, `reconcile_after.unbalanced_pos_sale_batches=0`, `reconcile_after.orphan_pos_sale_batches=0`
    - Execute (rerun same scope): `execute.inserted=0`, `execute.failed=0`
  - Risk if skipped: historical ledger incompleteness; finance cannot fully trust GL for prior POS periods.

- [x] Deliver reconciliation artifact and sign-off for in-scope companies/outlets.
  - Owner role: DBA + QA + Accounting
  - Affected paths: `docs/checklists/` (sign-off section/update), `docs/db/` (reconciliation SQL playbook)
  - Done criteria: report covers missing journals, unbalanced batches, and orphan journal references; known exceptions documented and approved.
  - Verification command/query: `npm run db:reconcile:pos-journals -- --company-id=<COMPANY_ID> [--outlet-id=<OUTLET_ID>]` with `reconcile.status=PASS` and all reconcile counters at zero.
  - Copy-paste reconciliation capture template (replace placeholders before run):
    ```bash
    RUN_TS="$(date -u +%Y%m%dT%H%M%SZ)"
    EVIDENCE_DIR="docs/checklists/evidence/m6-pos-backfill"
    COMPANY_ID=<COMPANY_ID>
    OUTLET_ID=<OUTLET_ID_OR_EMPTY>

    OUTLET_SLUG="all"
    if [ -n "$OUTLET_ID" ]; then OUTLET_SLUG="$OUTLET_ID"; fi
    RUN_PREFIX="${RUN_TS}-company-${COMPANY_ID}-outlet-${OUTLET_SLUG}"

    SCOPE_ARGS="--company-id=${COMPANY_ID}"
    if [ -n "$OUTLET_ID" ]; then
      SCOPE_ARGS="$SCOPE_ARGS --outlet-id=${OUTLET_ID}"
    fi

    mkdir -p "$EVIDENCE_DIR"
    npm run db:reconcile:pos-journals -- $SCOPE_ARGS | tee "$EVIDENCE_DIR/${RUN_PREFIX}-reconciliation.log"
    ```
  - Verification result (2026-02-22, scope `company_id=1`, `outlet_id=1`): `reconcile.status=PASS`, `reconcile.missing_after=0`, `reconcile.unbalanced_batches=0`, `reconcile.orphan_batches=0`.
  - Evidence artifacts:
    - `docs/checklists/evidence/m6-pos-backfill/20260222T000000Z-company-1-outlet-1-backfill-run.md`
    - `docs/checklists/evidence/m6-pos-backfill/20260222T000000Z-company-1-outlet-1-dry-run.log`
    - `docs/checklists/evidence/m6-pos-backfill/20260222T000000Z-company-1-outlet-1-execute.log`
    - `docs/checklists/evidence/m6-pos-backfill/20260222T000000Z-company-1-outlet-1-execute-rerun.log`
    - `docs/checklists/evidence/m6-pos-backfill/20260222T000000Z-company-1-outlet-1-reconciliation.log`
    - `docs/checklists/evidence/m6-pos-backfill/20260222T000000Z-company-1-outlet-1-reconciliation.md`
    - `docs/checklists/evidence/m6-pos-backfill/20260222T000000Z-company-1-outlet-1-remediation-note.md`
  - Sign-off status: complete (DBA, QA, Accounting recorded in evidence files).
  - Risk if skipped: unresolved data-quality debt blocks confident M6 closeout.

#### Condition 1 evidence capture sheet (fill this block per scope)

Use templates in `docs/checklists/evidence/m6-pos-backfill/` to keep run artifacts consistent:
- `README.md` (artifact naming and required files)
- `backfill-run-template.md` (dry-run/execute/rerun counters + approvals)
- `reconciliation-template.md` (reconciliation command outputs + pass/fail interpretation)

```text
Run date (UTC):
Environment:
Scope: company_id= ; outlet_id= ; limit=

Dry-run counters:
- missing_candidates=
- reconcile_before.missing_completed_pos=
- reconcile_before.unbalanced_pos_sale_batches=
- reconcile_before.orphan_pos_sale_batches=

Execute counters (first run):
- execute.inserted=
- execute.skipped_exists=
- execute.skipped_race_duplicate=
- execute.skipped_not_completed=
- execute.failed=
- reconcile_after.missing_completed_pos=
- reconcile_after.unbalanced_pos_sale_batches=
- reconcile_after.orphan_pos_sale_batches=

Execute counters (rerun same scope):
- execute.inserted=0 (required)
- execute.failed=0 (required)

Artifacts:
- dry run log:
- execute log:
- rerun log:
- reconciliation log:

Approvals:
- DBA: name/date/signature
- QA: name/date/signature
- Accounting: name/date/signature
```

### 2) DB-level journal line integrity constraints (debit/credit safety)

- [x] Enforce DB constraints for valid one-sided positive journal lines.
  - Owner role: DBA
  - Affected paths: `packages/db/migrations/0008_journal_lines_integrity_checks.sql`
  - Done criteria: DB rejects negative debit/credit, rejects both-side-positive rows, and rejects both-zero rows; valid rows continue to insert.
  - Verification command/query: apply migration in test DB, then run integration suite and targeted SQL insert probes that must fail for invalid line shapes.
  - Verification result (2026-02-22): `npm run db:migrate` -> `applied 0008_journal_lines_integrity_checks.sql`; constraints present in `packages/db/migrations/0008_journal_lines_integrity_checks.sql`.
  - Risk if skipped: malformed rows can bypass service guards and corrupt journal integrity.

### 3) Active-mode concurrent race tests for exactly-once journal rows

- [x] Add race tests for simultaneous duplicate and conflict pushes in active posting mode.
  - Owner role: QA + Backend
  - Affected paths: `apps/api/tests/integration/sync-push.integration.test.mjs`, `apps/api/app/api/sync/push/route.ts` (only if deterministic response normalization is required)
  - Done criteria: concurrent same-payload same `client_tx_id` yields exactly one successful write path and one duplicate outcome; concurrent different-payload same `client_tx_id` yields one success and one conflict; both scenarios keep exactly one journal batch.
  - Verification command/query: `npm run test:integration -w @jurnapod/api -- tests/integration/sync-push.integration.test.mjs`; plus SQL row-count assertion: `SELECT company_id, doc_type, doc_id, COUNT(*) c FROM journal_batches WHERE doc_type='POS_SALE' GROUP BY company_id, doc_type, doc_id HAVING c > 1;` returns zero rows.
  - Verification result (2026-02-22): command passed with `pass 13`, `fail 0`; concurrent duplicate/conflict assertions with one-batch journal invariant are in `apps/api/tests/integration/sync-push.integration.test.mjs`.
  - Risk if skipped: race conditions may still create duplicate or inconsistent GL outcomes under real retry storms.

## Optional hardening

### 4) Enrich audit payload with posting metadata

- [x] Add posting metadata into sync audit payload (`posting_mode`, `journal_batch_id`, `balance_ok`, `reason`).
  - Owner role: Backend
  - Affected paths: `apps/api/app/api/sync/push/route.ts`
  - Done criteria: every push outcome writes diagnosable posting metadata without log scraping; payload schema remains backward compatible.
  - Verification command/query: run push test matrix and inspect `audit_logs` rows for populated posting fields across `OK`/`DUPLICATE`/`ERROR` outcomes.
  - Verification result update (2026-02-22): accepted, duplicate, and posting-failure audit payloads include `posting_mode`, `journal_batch_id`, `balance_ok`, and `reason` in `apps/api/app/api/sync/push/route.ts`; integration assertions cover metadata in `apps/api/tests/integration/sync-push.integration.test.mjs`.
  - Risk if skipped: slower incident triage; higher dependence on ad-hoc logs.

## Recommended implementation order
1. Close DB integrity constraints (Condition 2) first so all downstream work runs on final invariants.
2. Add and stabilize active-mode race tests (Condition 3) as CI gate.
3. Run backfill dry-run, execute, and reconciliation sign-off (Condition 1).
4. Apply optional audit payload enrichment (Condition 4) if timeline allows.

Rollback checkpoints:
- After step 1: if migration validation fails, stop rollout; keep current schema and patch migration safely.
- After step 2: if race tests are flaky/non-deterministic, block promotion and fix determinism before data backfill.
- After step 3: if reconciliation shows critical unresolved gaps, hold release at GO WITH CONDITIONS.

## Exit criteria (GO WITH CONDITIONS -> GO)
- All must-do checklist items (Conditions 1-3) are checked complete with evidence links/queries.
- No unresolved critical reconciliation findings for in-scope historical `COMPLETED` POS.
- DB enforces journal line integrity at storage layer (not service-only).
- Active-mode concurrency tests prove exactly-once journal persistence under duplicate/conflict simultaneous pushes.
- Release decision note updated from **GO WITH CONDITIONS** to **GO** with owner approvals (DBA, QA, Accounting).
