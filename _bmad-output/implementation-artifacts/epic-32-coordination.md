# Epic 32 Story Coordination

## Active Stories

| Story | Owner | Files Owned |
|-------|-------|-------------|
| 32.1 | Dev 1 | `apps/api/src/routes/accounts.ts`, `apps/api/src/lib/fiscal-years.ts` |
| 32.2 | Dev 2 | `apps/api/src/routes/admin-dashboards.ts`, `apps/api/src/lib/reconciliation-dashboard.ts` |

## Conflict Prevention

**Dev 1 (32.1)** MUST NOT modify:
- `apps/api/src/routes/admin-dashboards.ts`
- `apps/api/src/lib/reconciliation-dashboard.ts`

**Dev 2 (32.2)** MUST NOT modify:
- `apps/api/src/routes/accounts.ts`
- `apps/api/src/lib/fiscal-years.ts` (except adding new functions)

## Shared Dependencies (read-only for both)

- `packages/modules/accounting/src/reconciliation/subledger/` (both read)
- `packages/modules/accounting/src/journals-service.ts` (both read)
- `packages/modules/accounting/src/fixed-assets/interfaces/fixed-asset-ports.ts` (both read)

## Sync Point

After both stories complete, merge via standard git workflow.
