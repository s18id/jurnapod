# Story 68-5: Layered Dashboards — Global Admin, Domain, My Work

Status: backlog

> ⚠️ **Sprint-Status Append-Only Rule (E45-A1 / E46-A1) — MANDATORY:**
> If this story modifies `_bmad-output/implementation-artifacts/sprint-status.yaml`:
> - **REQUIRED**: Run `npx tsx scripts/update-sprint-status.ts --epic 68 --story 68-5 --title layered-dashboards --status done` (the canonical utility)
> - **REQUIRED**: After editing, run `npx tsx scripts/validate-sprint-status.ts` to confirm file integrity
> - **NEVER** replace the entire file — always append only
> - **NEVER** use `replaceAll` on epic section markers
> - If accidentally overwritten: `git checkout HEAD -- _bmad-output/implementation-artifacts/sprint-status.yaml`
> - **Retrospective workflow will check this before closing the epic** (E46-A4)

## Story

As a **company admin, domain manager, or operator**,  
I want **layered dashboards that show relevant system health, operational status, and personal tasks**,  
So that **I can quickly assess system state and prioritize my work**.

## Context

The layered dashboard system provides three views tailored to different user needs:

1. **Global Admin Overview** — System-wide health, failed jobs, sync status, pending exceptions. Visibility MUST be permission-based, not role-name based.
2. **Domain Dashboards** — Per-module summaries (inventory, accounting, purchasing). Visibility MUST use canonical resource-level permissions.
3. **My Work panel** — Personal tasks: recent jobs, pending approvals, drafts, validation failures. Visibility MUST be scoped to the authenticated user and company.

This story integrates data from multiple sources: health endpoints, operations center (Story 68-2), notification system (Story 68-3), and domain-specific APIs. It is the **capstone feature** of Epic 68 and MUST wait for 68-2 and 68-3 to be complete. Before implementation, each dashboard data source MUST be verified against existing API contracts. Missing domain summary endpoints MUST be documented as API gaps; cards that require missing endpoints MUST be deferred or backed by existing list endpoints only when those endpoints support count-only or pagination metadata.

**Story 68-0 contract impact:** Operations queries use `limit` and `offset`, not `page`. Operations rows do not include `createdBy`, so My Work recent jobs cannot filter by current user unless a backend field/source is added. `/ws` MUST NOT be used for live dashboard updates while the P0 auth fallback remains unresolved.

**Dependencies:** Story 68-2 (operations center), Story 68-3 (notification system), Epic 65 (shell, TanStack Query)

**Risk:** High — integrates multiple data sources; requires parallel API calls.

---

## Test Scenario Review Checkpoint (MANDATORY — E54-A1)

### Pre-Implementation Checklist

- [ ] **Happy paths identified:** Global Admin shows health, jobs, exceptions; Domain shows module summaries; My Work shows personal tasks
- [ ] **Error paths identified:** Health endpoint failure; API timeout; permission denied for domain data
- [ ] **Edge cases identified:** Empty dashboard (no failed jobs, no pending tasks); all systems operational; very high failure count
- [ ] **Test fixture needs identified:** Mock health responses; mock operation lists; mock domain summaries
- [ ] **Integration test scope defined:** Unit tests for dashboard cards; integration tests for data fetching
- [ ] **Negative auth test role selected:** `CASHIER` or custom low-privilege role for Global Admin (lacks required resource-level permissions)

### Review Outcome

| Scenario | Type | Coverage Plan |
|----------|------|--------------|
| Global Admin shows health status | Happy | Unit |
| Global Admin shows failed jobs count | Happy | Unit |
| Domain Dashboard shows inventory summary | Happy | Unit |
| My Work shows recent jobs | Happy | Unit |
| Auto-refresh updates data | Happy | Unit |
| Empty dashboard shows "All systems operational" | Edge | Unit |
| Health endpoint error shows red status | Error | Unit |
| Permission denied hides admin cards | Error | Unit |
| Old dashboard URL redirects to new dashboard | Happy | Unit |

**Sign-off:** Test scenarios reviewed and approved before implementation begins.

---

## Cross-Module Error Boundary Verification (MANDATORY — E58-A1)

### Pre-Implementation Checklist

- [ ] Producer error classes: `HealthCheckError`, `DashboardDataError`
- [ ] Consumer catch paths: Individual card shows error state; dashboard remains functional
- [ ] Fallback handling: Generic "Unable to load dashboard data" for failed cards
- [ ] Error response mapping: 500 → card error state; 503 → backend unreachable banner

### Verified Error Paths

| Producer Error | Consumer Handling | Fallback |
|----------------|-------------------|----------|
| Health endpoint failure | Health card shows red "Unavailable" | Retry button on card |
| Operations list failure | Jobs card shows error state | Manual refresh button |
| Domain summary failure | Domain card shows error state | Retry or hide card |

---

## Acceptance Criteria

### AC1: Global Admin Overview
**Given** a user with the required resource-level permissions for system health, operations, audit, and configuration visibility  
**When** the default landing page loads  
**Then** the Global Admin Overview dashboard is displayed with cards for:
- **System Health:** API status, DB status, sync status (green/yellow/red indicators)
- **Failed Jobs:** Count of failed operations; click navigates to operations center filtered by `status=failed`
- **Pending Exceptions:** Count of pending AP exceptions, reconciliation mismatches, sync errors
- **Quick Links:** Links to operations center, audit explorer, settings

**And** each card has loading (skeleton), empty, and error states  
**And** data auto-refreshes every 60 seconds (configurable)

### AC2: Empty system state
**Given** no failed jobs, no pending exceptions, all systems healthy  
**When** the Global Admin Overview loads  
**Then** the failed jobs card shows "0" or "All systems operational"  
**And** the health card shows all green indicators  
**And** the exceptions card shows "No pending exceptions"

### AC3: Health error state
**Given** the API health endpoint returns an error (e.g., 503)  
**When** the health card renders  
**Then** it shows a red status indicator  
**And** it displays the error message or "Service unavailable"  
**And** a "Retry" button allows manual refresh

### AC4: Domain Dashboards
**Given** a user navigates to a domain dashboard  
**When** the dashboard loads  
**Then** it shows module-specific summaries:
- **Inventory:** Total items, low stock alerts, recent stock movements
- **Accounting:** Pending reconciliations, fiscal period status, journal entry count
- **Purchasing:** Pending approvals, overdue invoices, open purchase orders

**And** each summary card links to the relevant domain page  
**And** data is scoped to the current company and outlet

### AC5: My Work panel
**Given** any authenticated user  
**When** the My Work panel loads  
**Then** it shows personalized tasks:
- **Recent Jobs:** Recent operations available from the operations center; user-specific filtering is deferred unless backend adds `createdBy` or an equivalent source
- **Pending Approvals:** Documents awaiting approval (if user has approver role)
- **Saved Drafts:** Unsaved form drafts (from localStorage or Dexie)
- **Unresolved Validation Failures:** Import/validation errors requiring attention

**And** each task is clickable and navigates to the relevant page

### AC6: Permission-based visibility
**Given** a user with accounting analytical permissions  
**When** the dashboard loads  
**Then** the My Work panel shows pending reconciliation tasks  
**And** the Global Admin Overview shows limited cards (health, jobs) but not sensitive configuration

**Given** a user with platform administrative permissions  
**When** the dashboard loads  
**Then** the My Work panel shows recent operations and audits  
**And** the Global Admin Overview shows all cards

**Given** a user without Global Admin or Domain Dashboard permissions  
**When** the dashboard loads  
**Then** only the My Work panel is visible (recent jobs only)  
**And** Global Admin and Domain Dashboards are hidden

### AC7: Auto-refresh
**Given** the dashboard is visible  
**When** auto-refresh is enabled (default: on, interval: 60s)  
**Then** data updates without full page reload  
**And** a timestamp shows "Last updated: {time}"  
**And** the user can disable auto-refresh or change the interval

### AC8: Old dashboard deprecation
**Given** a user opens an old built-in HTML dashboard URL  
**When** the route is accessed  
**Then** they are redirected to the new dashboard  
**Or** an explicit deprecation notice is shown with a link to the new dashboard

### AC9: Permission gating
**Given** a user without permission to view a specific dashboard card  
**When** the dashboard renders  
**Then** the card is hidden (not disabled)  
**And** no permission error is shown for hidden cards

---

## Technical Notes

### Files to Create
- `apps/backoffice/src/features/dashboards/global-admin-overview.tsx` — Global Admin dashboard
- `apps/backoffice/src/features/dashboards/domain-dashboard.tsx` — Domain dashboard container
- `apps/backoffice/src/features/dashboards/my-work-panel.tsx` — My Work panel
- `apps/backoffice/src/features/dashboards/dashboard-card.tsx` — Reusable card component (skeleton, empty, error states)
- `apps/backoffice/src/hooks/use-dashboard-data.ts` — Parallel data fetching with `useQueries`
- `apps/backoffice/src/hooks/use-health-status.ts` — Health endpoint polling
- `apps/backoffice/__test__/unit/features/dashboards.test.tsx` — Dashboard rendering tests

### Files to Modify
- `apps/backoffice/src/app/routes.ts` — Add `/dashboard` as default route; add redirect from old dashboard URLs
- `apps/backoffice/src/app/router.tsx` — Default landing page route handling

### Data Sources

| Card | Source Endpoint | Refresh Interval |
|------|-----------------|-----------------|
| System Health | `GET /api/health/live`, `GET /api/health/ready` | 60s |
| Failed Jobs | `GET /api/operations?status=failed&limit=5` | 30s |
| Pending Exceptions | `GET /api/purchasing/exceptions?status=pending` | 60s |
| Inventory Summary | `GET /api/inventory/summary` | 300s |
| Accounting Summary | `GET /api/accounting/summary` | 300s |
| Purchasing Summary | `GET /api/purchasing/summary` | 300s |
| My Work — Recent Jobs | `GET /api/operations?limit=5&offset=0` | 60s |
| My Work — Pending Approvals | `GET /api/approvals?status=pending&assignee=me` | 120s |

### Parallel Data Fetching
```typescript
const queries = useQueries({
  queries: [
    { queryKey: ['health'], queryFn: fetchHealth, refetchInterval: 60000 },
    { queryKey: ['failedJobs'], queryFn: fetchFailedJobs, refetchInterval: 30000 },
    { queryKey: ['inventorySummary'], queryFn: fetchInventorySummary, refetchInterval: 300000 },
  ],
});
```

### Card States
```typescript
type DashboardCardState = 
  | { status: 'loading' }
  | { status: 'empty', message: string }
  | { status: 'error', message: string, retry: () => void }
  | { status: 'success', data: unknown };
```

---

## Risk Register

| Risk ID | Severity | Description | Mitigation |
|---------|----------|-------------|------------|
| R68-5-001 | P1 | Dashboard requires multiple parallel API calls, slowing initial load | Use `useQueries` for parallel fetching; show skeleton states immediately |
| R68-5-002 | P1 | Health endpoints do not exist or return unexpected shapes | Verify endpoints in Story 68-0; mock if unavailable |
| R68-5-003 | P1 | Domain summary endpoints do not exist | Verify before implementation; use existing list endpoints only when they support count-only or pagination metadata; otherwise defer affected cards with API-gap evidence |
| R68-5-006 | P1 | Dashboard visibility uses role names instead of resource-level ACL | Use canonical resource-level permissions for every card and navigation affordance |
| R68-5-004 | P2 | Auto-refresh causes excessive API load | Configurable intervals; disable for inactive tabs (`document.visibilityState`) |
| R68-5-005 | P2 | Old dashboard URLs are numerous or unknown | Map known URLs; add catch-all redirect rule |

---

## Story Points
**8 points** (high — multiple data sources, role-based visibility, auto-refresh, card states)

---

## Tasks / Subtasks

### Phase 1: Foundation
1. **Create `DashboardCard` primitive** — Skeleton, empty, error, success states
2. **Create `useDashboardData` hook** — Parallel fetching with `useQueries`
3. **Create `useHealthStatus` hook** — Health endpoint with polling

### Phase 2: Global Admin Overview
4. **Implement health card** — API, DB, sync status indicators
5. **Implement failed jobs card** — Count + link to operations center
6. **Implement pending exceptions card** — Count + link to relevant domain
7. **Implement quick links card** — Navigation shortcuts

### Phase 3: Domain Dashboards
8. **Implement inventory summary card** — Total items, low stock alerts
9. **Implement accounting summary card** — Pending reconciliations, fiscal status
10. **Implement purchasing summary card** — Pending approvals, overdue invoices

### Phase 4: My Work panel
11. **Implement recent jobs card** — User's recent operations
12. **Implement pending approvals card** — Documents awaiting approval
13. **Implement drafts card** — Saved form drafts
14. **Implement validation failures card** — Import/validation errors

### Phase 5: Integration
15. **Add route** — `/dashboard` as default landing page
16. **Add redirect** — Old built-in HTML dashboard URLs redirect to new dashboard
17. **Implement auto-refresh** — Configurable intervals; respect tab visibility
18. **Implement role-based visibility** — Hide cards based on permissions

### Phase 6: Testing
19. **Unit tests for dashboard cards** — Loading, empty, error, success states
20. **Unit tests for role-based visibility** — Cards hidden/shown per role
21. **Unit tests for auto-refresh** — Interval behavior, tab visibility

---

## Definition of Done

- [ ] All acceptance criteria implemented with evidence
- [ ] Unit tests for all dashboard cards pass
- [ ] Role-based visibility verified for OWNER, ADMIN, ACCOUNTANT, CASHIER
- [ ] Auto-refresh behavior verified (60s default, respects tab visibility)
- [ ] Old dashboard URLs redirect to new dashboard
- [ ] Each card has proper loading, empty, and error states
- [ ] `npm run typecheck -w @jurnapod/backoffice` passes
- [ ] `npm run build -w @jurnapod/backoffice` passes
- [ ] Code review completed with no blockers
- [ ] Story completion report created (`story-68-5.completion.md`) with reviewer GO and owner sign-off

---

## Dependencies

- **Story 68-2** — Operations center (for failed jobs count, recent jobs)
- **Story 68-3** — Notification system (for validation failures, alerts)
- **Story 68-0** — Backend contract verified (for health endpoint shapes)
- **Epic 65** — Shell, TanStack Query, typed API client, router

## Validation Evidence

```bash
# Pre-flight
npm run lint -w @jurnapod/backoffice
npm run typecheck -w @jurnapod/backoffice
npm run build -w @jurnapod/backoffice

# Unit tests
npm run test:single -w @jurnapod/backoffice -- __test__/unit/features/dashboards.test.tsx

# Sprint status
npx tsx scripts/validate-sprint-status.ts --epic 68
```

---

_Last Updated: 2026-05-18 (prepared by bmad-sm)
