# Epic 47: AP Reconciliation & Period Close Controls

**Status:** done
**Theme:** Financial Domain — AP Reconciliation & Period Close
**Started:** 2026-04-19
**Completed:** 2026-04-20

## Context

Epic 47 establishes robust reconciliation between the Accounts Payable subledger and the General Ledger control accounts, with period-close guardrails, supplier-statement matching, and a complete audit trail for financial compliance.

This epic builds on the AP transactional skeleton from Epic 46 and the period-close framework from Epic 32. A Wave 0 readiness gate was conducted before story execution — 10 P0/P1 risks were caught and resolved (fiscal_periods migration gap, FX semantics enforcement, tenant ownership validation, fail-closed behavior, etc.).

**Key Design Decisions:**
- Cutoff semantics: company-local business date (`as_of_date` local midnight)
- GL reconciliation source: configured AP control account set (not hardcoded single account)
- Closed period policy: blocked by default, explicit high-privilege audited override path only
- Supplier statement ingestion: manual entry MVP (no file import)
- Status/state columns: use `TINYINT` for any new schema

## Goals

1. Deliver AP↔GL reconciliation with variance attribution and drilldown
2. Implement period close guardrails that block AP transactions in closed periods
3. Provide immutable reconciliation snapshots with versioned audit trail

## Stories

| Story | Title | Status | Est | Actual |
|-------|-------|--------|-----|--------|
| 47.1 | AP↔GL Reconciliation Summary | done | 3h | 3h |
| 47.2 | Reconciliation Drilldown & Variance Attribution | done | 4h | 4h |
| 47.3 | Supplier Statement Matching (Manual MVP) | done | 3h | 3h |
| 47.4 | AP Exception Worklist | done | 3h | 3h |
| 47.5 | Period Close Guardrails for AP | done | 4h | 4h |
| 47.6 | Reconciliation Snapshot & Audit Trail | done | 4h | 4h |

## Success Criteria

- [x] AP↔GL reconciliation summary dashboard with configurable account set
- [x] Variance drilldown with attribution (timing differences, posting errors, missing transactions, rounding)
- [x] Supplier statement matching (manual entry MVP)
- [x] AP exception worklist with assignment/resolution workflow
- [x] Period close guardrails with high-privilege override and audit trail
- [x] Immutable reconciliation snapshots with versioned audit trail
- [x] 188/188 integration tests passing
- [x] 7 P0/P1 catches in review — all resolved before merge
- [x] Zero data loss, zero production incidents

## Dependencies

- Epic 32 (Financial Period Close) — fiscal_periods table, period close state
- Epic 46 (Purchasing / AP) — AP subledger, supplier entities, GL posting adapter
- Epic 39 (ACL) — `purchasing.reports`, `accounting.reports` resource-level permissions

## Risks

| Risk | Mitigation |
|------|------------|
| fiscal_periods dependency not yet implemented | Wave 0 gate caught gap; migration 0186 landed before Epic 47 |
| FX semantics enforcement at reconciliation boundary | Wave 0 analysis; FX assertions added to integration tests |
| Tenant ownership validation on snapshots | Explicit tenant_id check added in Wave 0 review |
| Concurrent period-close race condition (guardrail check vs mutation commit) | P2 documented; non-blocking for Epic 47 close |

## Notes

- Wave 0 gate was initially FAIL but returned GO (conditional) after pre-story fixes
- `fiscal_periods` table was a hard dependency discovered in Wave 0 (not in Epic 46 scope)
- Snapshot immutability enforced at DB level with triggers (no UPDATE/DELETE)
- Optimistic locking verified in tests for concurrent state transitions
- P2 deferred items: PDF export, audit trail attribution, timezone normalization in snapshots, CSV export scalability

## Retrospective

See: [Epic 47 Retrospective](./epic-47-retrospective.md)
