# Epic 32 Service Migration: API lib → Packages

## Objective

Move Epic 32 services from `apps/api/src/lib/` to proper packages per ADR-0014.

## Target Locations

| Service | From | To |
|---------|------|-----|
| ReconciliationDashboardService | `apps/api/src/lib/reconciliation-dashboard.ts` | `modules-accounting/src/reconciliation/dashboard-service.ts` |
| TrialBalanceService | `apps/api/src/lib/trial-balance-service.ts` | `modules-accounting/src/trial-balance/service.ts` |
| PeriodTransitionAudit | `apps/api/src/lib/period-transition-audit.ts` | `modules-platform/src/audit/period-transition.ts` |

## DB Access Pattern

- Packages use `@jurnapod/db` directly (NOT `apps/api/src/lib/db`)
- Services receive `db: KyselySchema` via constructor injection
- API passes db instance when calling package services

## Migration Steps (Per Service)

1. Create new file in package
2. Change import: `../lib/db.js` → `@jurnapod/db`
3. Export from package's `index.ts`
4. Update API route to import from package
5. Delete old file (adapter shim)
6. Run typecheck + build

## Conflict Prevention

**Dev 1 handles:**
- ReconciliationDashboardService migration ✅ DONE
- TrialBalanceService migration ✅ DONE
- Both modify `modules-accounting` and `apps/api/src/routes/admin-dashboards.ts`

**Dev 2 handles:**
- PeriodTransitionAudit migration ✅ DONE
- Modifies `modules-platform` and `apps/api/src/routes/audit.ts`

## Dev 1 Completion Notes

### ReconciliationDashboardService ✅
- Created: `packages/modules/accounting/src/reconciliation/dashboard-service.ts`
- Updated: `packages/modules/accounting/src/reconciliation/index.ts` (added re-exports)
- Updated: `packages/modules/accounting/src/index.ts` (already had reconciliation export)
- Updated: `packages/modules/accounting/package.json` (added export path)
- Updated: `apps/api/src/routes/admin-dashboards.ts` (import from package)
- Deleted: `apps/api/src/lib/reconciliation-dashboard.ts`
- Deleted: `apps/api/src/lib/reconciliation-dashboard.test.ts`
- Renamed `GlImbalanceResult` to avoid conflict with journals-service

### TrialBalanceService ✅
- Created: `packages/modules/accounting/src/trial-balance/service.ts`
- Created: `packages/modules/accounting/src/trial-balance/index.ts`
- Updated: `packages/modules/accounting/src/index.ts` (added trial-balance export)
- Updated: `packages/modules/accounting/package.json` (added export path)
- Updated: `apps/api/src/routes/admin-dashboards.ts` (import from package)
- Deleted: `apps/api/src/lib/trial-balance-service.ts`
- Deleted: `apps/api/src/lib/trial-balance-service.test.ts`
- Renamed `GlImbalanceResult` to `TrialBalanceGlImbalanceResult` to avoid conflict

## Dev 2 Completion Notes

### PeriodTransitionAudit ✅
- Created: `packages/modules/platform/src/audit/period-transition.ts`
- Updated: `packages/modules/platform/src/audit/index.ts` (added export)
- Updated: `packages/modules/platform/package.json` (added export path `./audit/period-transition`)
- Updated: `apps/api/src/routes/audit.ts` (import from package)
- Updated: `apps/api/tests/integration/period-transition-audit.integration.test.mjs` (use new service class)
- Deleted: `apps/api/src/lib/period-transition-audit.ts`
- Converted standalone functions to class-based `PeriodTransitionAuditService` with constructor injection

## Validation

After all migrations:
- `npm run typecheck -w @jurnapod/api` passes ✅
- `npm run typecheck -w @jurnapod/modules-accounting` passes ✅
- `npm run typecheck -w @jurnapod/modules-platform` passes ✅
- `npm run build -w @jurnapod/api` passes ✅
