# Epic 32 Story Coordination

## Stories Status

| Story | Status | Owner |
|-------|--------|-------|
| 32.1 Fiscal Year Close | ✅ Done | Committed |
| 32.2 Reconciliation Dashboard | ✅ Done | Committed |
| 32.3 Trial Balance Validation | in_progress | |
| 32.4 Period Transition Audit | ✅ Done | Committed |
| 32.5 Roll Forward Workspace | backlog | depends on 32.3, 32.4 |

## Phase 1: Stories 32.3 and 32.4 (Parallel)

**Dev 1: Story 32.3**
- Files: `apps/api/src/lib/trial-balance-service.ts`, `apps/api/src/routes/admin-dashboards.ts`
- Also reads: `packages/modules/accounting/src/reconciliation/`, `packages/telemetry/`

**Dev 2: Story 32.4**
- Files: `apps/api/src/lib/period-transition-audit.ts`, `apps/api/src/routes/audit.ts`
- Also reads: `packages/modules/platform/audit/`, `packages/modules/accounting/`

## Phase 2: Story 32.5 (After 32.3, 32.4)

**Dev 1 or 2: Story 32.5**
- Depends on: 32.1, 32.2, 32.3, 32.4
- Files: `apps/api/src/routes/admin-dashboards.ts`, `apps/api/src/lib/period-close-workspace.ts`

## Conflict Prevention

- 32.3 and 32.4 must NOT modify each other's files
- 32.5 reads from all prior stories' outputs
- 32.5 must NOT modify fiscal-years.ts or reconciliation-dashboard.ts

## Sync Point

After 32.3 and 32.4 complete, sync before starting 32.5.
