# Epic 32: Financial Period Close & Reconciliation Workspace

**Status:** done
**Date:** 2026-04-05
**Stories:** 5 total (1 sprint)
**Sprint Plan:** `_bmad-output/planning-artifacts/epic-32-sprint-plan.md`
**Commits:** `b9305ca` → `dc05502` (7 commits)

---

## Executive Summary

Epic 32 operationalizes period-end financial workflows for the Jurnapod ERP. Using the observability foundation from Epic 30 (SLOs, GL imbalance detection, dashboards), this epic adds the tooling for accountants to perform period close, multi-period reconciliation, and trial balance validation. The reconciliation service already exists as a thin adapter (53 lines in `reconciliation-service.ts`) — this epic builds the workspace and procedures around it.

**Key Goals:**
- Fiscal year close procedure with audit trail
- Multi-period reconciliation dashboard using Epic 30 metrics
- Trial balance validation with variance reporting
- Period transition audit trail for compliance
- Roll-forward workspace UI for interactive period close

---

## Goals & Non-Goals

### Goals
- Fiscal year close: lock periods, generate closing entries, enforce closing sequence
- Multi-period reconciliation: GL vs subledger comparison view
- Trial balance validation: pre-close checks with variance reporting
- Period transition audit: who/what/when for compliance
- Roll-forward workspace: interactive CLI/TUI for period close workflow
- Integrate with Epic 30 GL imbalance detection (`gl_imbalance_detected_total`)

### Non-Goals
- No automatic journal entry generation for closing (manual approval required)
- No multi-company consolidation
- No tax filing integration
- No depreciation auto-run (already in Epic 29)

---

## Architecture

### Dependency Direction

```
modules-accounting/
  ├── reconciliation/     → ReconciliationDashboardService
  ├── trial-balance/      → TrialBalanceService
  └── fiscal-year/        → FiscalYearService (extracted in dc05502)
modules-platform/
  └── audit/              → PeriodTransitionAuditService

apps/api/
  ├── routes/admin-dashboards/ → reconciliation + trial balance endpoints
  ├── routes/accounts.ts       → fiscal year close endpoints
  ├── routes/audit.ts          → period transition audit endpoints
  └── lib/
      ├── fiscal-years.ts       → thin adapter to modules-accounting/fiscal-year
      └── period-close-workspace.ts → composition service (package consumers only)
```

### Package Boundary Resolution

During Epic 32, an ADR-0014 boundary violation was discovered: `fiscal-years.ts` (1317 lines of domain logic) was placed in `apps/api/src/lib/` instead of `modules-accounting`. Resolved in commit `dc05502` by extracting to `packages/modules/accounting/src/fiscal-year/`. See `_bmad-output/implementation-artifacts/epic-32-service-migration.md` for full details.

### Hard Implementation Gate (Mandatory)

Epic 32 cannot start until Epic 31 adapter contracts are proven in production-like validation:

1. Story 31.7 complete (accounts/inventory/reports route thinning)
2. Story 31.8A complete (adapter migration prep + boundary checks)
3. CI import-boundary lint enforcement active (no `packages/** -> apps/api/**`)

This gate prevents Epic 32 from building period-close workflows on unstable or partially detached route surfaces.

### Key Integration Points

- `@jurnapod/modules-accounting` — reconciliation, journals, fiscal years
- `packages/telemetry/src/runtime/dashboard-snapshot.ts` — Epic 30 dashboard metrics
- `packages/telemetry/src/runtime/alert-manager.ts` — Epic 30 alerting
- `config/slos.yaml` — Epic 30 SLO thresholds
- `config/alerts.yaml` — Epic 30 alert rules

---

## Success Criteria

- [x] Fiscal year close procedure works end-to-end
- [x] Multi-period reconciliation dashboard shows GL vs subledger
- [x] Trial balance validates without GL imbalance
- [x] Period transition audit trail records who/when/what
- [x] Roll-forward workspace accessible via built-in dashboard
- [x] All Epic 30 observability metrics wired into reconciliation views
- [x] `npm run typecheck -w @jurnapod/api` passes
- [x] `npm run build -w @jurnapod/api` passes
- [x] ADR-0014 boundary compliance verified (fiscal-year extraction in dc05502)
- [x] P0 idempotency bug fixed (closeRequestId return value)
- [x] Error code consistency across all fiscal-year error classes

---

## Stories

| # | Title | Status | Commit |
|---|-------|--------|--------|
| [story-32.1](./story-32.1.md) | Fiscal year close procedure | ✅ done | f3990b8 |
| [story-32.2](./story-32.2.md) | Multi-period reconciliation dashboard | ✅ done | f3990b8 |
| [story-32.3](./story-32.3.md) | Trial balance validation with variance reporting | ✅ done | 2b5891e |
| [story-32.4](./story-32.4.md) | Period transition audit trail | ✅ done | 2b5891e |
| [story-32.5](./story-32.5.md) | Roll-forward workspace UI | ✅ done | 5f2b4b2 |

## Post-Implementation Fixes

| Fix | Severity | Description | Commit |
|-----|----------|-------------|--------|
| Net income calculation | P1 | Math.abs() bug in closing entries | 8c2e1cc |
| Audit trail chicken-and-egg | P1 | Workspace checkAuditTrail returned "passed" for IN_PROGRESS with no audit | 8c2e1cc |
| Idempotency race condition | P1 | closeFiscalYearWithTransaction read-then-write in separate transactions | 8c2e1cc |
| GL imbalance tenant scoping | P1 | checkGlImbalanceByBatchId missing companyId filter | 8c2e1cc |
| Account type validation | P2 | sanitizeAccountTypes() defense-in-depth whitelist | 8c2e1cc |
| Outlet scope validation | P2 | assertOutletBelongsToCompany() in cash-provider | 8c2e1cc |
| Fiscal-year extraction | ADR-0014 | Domain logic moved from API lib to modules-accounting | dc05502 |
| closeRequestId return value | P0 | executeCloseWithLocking returned timestamp instead of caller ID | dc05502 |
| Error code consistency | P1 | Added machine-readable codes to all fiscal-year error classes | dc05502 |
| Adapter singleton risk | P1 | Replaced lazy singleton with per-call factory in API adapter | dc05502 |
