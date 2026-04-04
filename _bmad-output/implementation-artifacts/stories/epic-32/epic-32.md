# Epic 32: Financial Period Close & Reconciliation Workspace

**Status:** backlog
**Date:** 2026-04-04
**Stories:** 5 total (1 sprint)
**Sprint Plan:** `_bmad-output/planning-artifacts/epic-32-sprint-plan.md`

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
modules-accounting (reconciliation)
  ├── journals-service (journals — already extracted)
  └── fiscal-year-service (fiscal years)

modules-platform (tenant/outlet scoping)

apps/api/
  ├── routes/reports.ts → reconciliation workspace
  ├── routes/accounts.ts (`/accounts/fiscal-years/*`) → period close procedures
  └── routes/admin-dashboards.ts → multi-period reconciliation
```

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

- [ ] Fiscal year close procedure works end-to-end
- [ ] Multi-period reconciliation dashboard shows GL vs subledger
- [ ] Trial balance validates without GL imbalance
- [ ] Period transition audit trail records who/when/what
- [ ] Roll-forward workspace accessible via built-in dashboard
- [ ] All Epic 30 observability metrics wired into reconciliation views
- [ ] `npm run typecheck -w @jurnapod/api` passes
- [ ] `npm run build -w @jurnapod/api` passes

---

## Stories

| # | Title | Status |
|---|-------|--------|
| [story-32.1](./story-32.1.md) | Fiscal year close procedure | pending |
| [story-32.2](./story-32.2.md) | Multi-period reconciliation dashboard | pending |
| [story-32.3](./story-32.3.md) | Trial balance validation with variance reporting | pending |
| [story-32.4](./story-32.4.md) | Period transition audit trail | pending |
| [story-32.5](./story-32.5.md) | Roll-forward workspace UI | pending |
