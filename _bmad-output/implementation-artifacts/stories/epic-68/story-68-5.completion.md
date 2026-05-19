# Story 68-5 Completion Report

**Story:** Layered Dashboards — Global Admin, Domain, My Work
**Epic:** 68
**Status:** DONE
**Date:** 2026-05-19
**Reviewer:** bmad-review (self)
**Implementation Agent:** bmad-master

---

## Acceptance Criteria Evidence

### AC1: Global Admin Overview
- ✅ System Health card uses `GET /api/health?detailed=true` with API, DB, import, export, sync indicators
- ✅ Failed Jobs card uses `GET /api/operations?status=failed&limit=5&offset=0` with link to operations center
- ✅ Pending Exceptions card aggregates AP exceptions and sync errors; reconciliation mismatch source shown as API-gap
- ✅ Quick Links card links to operations center, audit explorer, settings — permission-gated
- ✅ Each card has loading, empty, error, and API-gap states
- ✅ Data auto-refreshes every 60s (configurable); per-card defaults: failed jobs 30s, domain summaries 300s

### AC2: Empty system state
- ✅ Failed jobs card shows "All systems operational" when count is 0
- ✅ Health card shows green indicators when healthy
- ✅ Exceptions card shows "No known pending exceptions" when count is 0

### AC3: Health error state
- ✅ Health card shows red status indicator on error
- ✅ Displays error message or "Service unavailable"
- ✅ Retry button allows manual refresh

### AC4: Domain Dashboards
- ✅ Inventory Summary shows total items and low stock alerts; recent stock movements render API-gap state
- ✅ Accounting Summary shows open/closed fiscal years and journal entry count; pending reconciliations render API-gap state
- ✅ Purchasing Summary shows overdue invoices and open purchase orders; pending approvals render API-gap state
- ✅ Each summary card links to relevant domain page
- ✅ Inventory stock data is scoped to selected outlet (required `outlet_id`)

### AC5: My Work panel
- ✅ Recent Jobs shows company recent operations (labelled as company-scoped)
- ✅ Pending Approvals renders API-gap state (no approvals workflow exists)
- ✅ Saved Drafts counts browser drafts scoped by company and user
- ✅ Validation Failures renders API-gap state

### AC6: Permission-based visibility
- ✅ Cards hidden based on resource-level permissions (platform.operations.READ, inventory.items.READ, accounting.reports.ANALYZE, purchasing.reports.ANALYZE)
- ✅ No permission error shown for hidden cards
- ✅ My Work panel visible to authenticated users; domain cards hidden without permission

### AC7: Auto-refresh
- ✅ Default 60s interval with user-configurable options (30s, 60s, 5m)
- ✅ Respects `document.visibilityState` (pauses when tab hidden)
- ✅ Last updated timestamp visible

### AC8: Old dashboard deprecation
- ✅ `/admin/dashboard/*` serves deprecation notice with link to `/#/dashboard`
- ✅ Backoffice hash redirect maps `#/admin/dashboard/*` to `/dashboard`

### AC9: Permission gating
- ✅ Cards hidden (not disabled) when permission is missing
- ✅ No permission error rendered for hidden cards

---

## Review Result

**Independent architecture/correctness review:** GO

**Initial review findings (all resolved):**
- P1: Old HTML dashboards now show deprecation notice/link
- P1: Reconciliation counts no longer fabricated from AP exceptions; rendered as API-gap state
- P1: Inventory summary now requires `outlet_id`, validates it, ACL-checks it, filters by outlet
- P2: Per-card refresh intervals implemented (failed jobs 30s, domain summaries 300s)
- P2: Missing health subsystems render `unknown`, not `healthy`
- P2: Tests updated for API-gap behavior and outlet validation

**Remaining follow-up:**
- P3: Legacy admin dashboard handlers/sub-router mounts are unreachable after deprecation catch-all. Remove in cleanup story after deprecation is finalized.

---

## Validation Evidence

```bash
# API
npm run typecheck -w @jurnapod/api                          # PASS
npm run build -w @jurnapod/api                              # PASS

# Backoffice
npm run lint -w @jurnapod/backoffice                        # PASS
npm run typecheck -w @jurnapod/backoffice                   # PASS
npm run build -w @jurnapod/backoffice                       # PASS

# Tests
npm run test:single -w @jurnapod/backoffice -- __test__/unit/features/dashboards.test.tsx
# PASS: 1 file, 6 tests

npm run test:single -w @jurnapod/api -- __test__/integration/dashboard/dashboard-summary.test.ts
# PASS: 1 file, 9 tests

# Sprint status
npx tsx scripts/validate-sprint-status.ts --epic 68
# PASS / GO
```

---

## Files Changed

### Created
- `apps/api/src/routes/dashboard.ts`
- `apps/api/src/lib/dashboard/dashboard-summaries.ts`
- `apps/api/__test__/integration/dashboard/dashboard-summary.test.ts`
- `apps/backoffice/src/features/dashboards/global-admin-overview.tsx`
- `apps/backoffice/src/features/dashboards/domain-dashboard.tsx`
- `apps/backoffice/src/features/dashboards/my-work-panel.tsx`
- `apps/backoffice/src/features/dashboards/dashboard-card.tsx`
- `apps/backoffice/src/hooks/use-dashboard-data.ts`
- `apps/backoffice/src/hooks/use-health-status.ts`
- `apps/backoffice/__test__/unit/features/dashboards.test.tsx`

### Modified
- `apps/api/src/app.ts`
- `apps/api/src/routes/admin-dashboards/index.ts`
- `apps/backoffice/src/app/routes.ts`
- `apps/backoffice/src/app/router.tsx`
- `apps/backoffice/src/app/router/hash-redirect.ts`
- `apps/backoffice/src/app/router/routes.tsx`
- `_bmad-output/implementation-artifacts/stories/epic-68/story-68-5.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`

---

## Technical Debt / Follow-ups

| Item | Severity | Owner | Notes |
|------|----------|-------|-------|
| Remove unreachable legacy admin dashboard handlers after deprecation is finalized | P3 | Deferred | Sub-router mounts and `/financial` handler are unreachable after deprecation catch-all. Safe to remove once deprecation behavior is accepted. |

---

_Signed off by: bmad-review (reviewer)_
_Date: 2026-05-19_
