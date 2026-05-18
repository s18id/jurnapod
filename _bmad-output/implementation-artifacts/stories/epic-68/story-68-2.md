# Story 68-2: Operations/Job Center — List, Filter, Detail

Status: review

> ⚠️ **Sprint-Status Append-Only Rule (E45-A1 / E46-A1) — MANDATORY:**
> If this story modifies `_bmad-output/implementation-artifacts/sprint-status.yaml`:
> - **REQUIRED**: Run `npx tsx scripts/update-sprint-status.ts --epic 68 --story 68-2 --title operations-center --status done` (the canonical utility)
> - **REQUIRED**: After editing, run `npx tsx scripts/validate-sprint-status.ts` to confirm file integrity
> - **NEVER** replace the entire file — always append only
> - **NEVER** use `replaceAll` on epic section markers
> - If accidentally overwritten: `git checkout HEAD -- _bmad-output/implementation-artifacts/sprint-status.yaml`
> - **Retrospective workflow will check this before closing the epic** (E46-A4)

## Story

As a **company admin or operator**,  
I want **a centralized operations center where I can view async jobs, filter by supported fields, and inspect details**,  
So that **I can manage and troubleshoot background operations from a single place**.

## Context

The operations center is the primary surface for async job visibility. It consumes the AsyncJobDrawer (Story 68-1) for detail views and provides list/filter capabilities via the EntityTable primitive from Epic 65. The page MUST auto-refresh for running jobs and MUST NOT expose generic retry or cancel actions unless backend endpoints are added in a future story.

**Critical dependency:** Story 68-0 (contract verification) determines which operation types exist, which support retry/cancel, and how list/filter endpoints behave. Story 68-1 (AsyncJobDrawer) provides the detail view.

**Story 68-0 contract impact:** The operations list currently supports `status`, `type`, `limit`, and `offset`. It does not support `page`, creator filters, date range filters, generic retry, generic cancel, `createdBy`, `downloadUrl`, steps, or operation detail route fields.

**Dependencies:** Story 68-0 (contract verified), Story 68-1 (AsyncJobDrawer), Epic 65 (EntityTable, typed API client, TanStack Query)

**Risk:** Medium — primarily UI composition with known primitives.

---

## Test Scenario Review Checkpoint (MANDATORY — E54-A1)

### Pre-Implementation Checklist

- [ ] **Happy paths identified:** Operations list loads; filter by status/type; click row opens drawer; unsupported retry/cancel controls remain hidden
- [ ] **Error paths identified:** API failure loading list; permission denied; operation row removed before drawer opens
- [ ] **Edge cases identified:** Empty list; very long list (>1000 jobs); job transitions while viewing; selected operation removed before drawer opens
- [ ] **Test fixture needs identified:** Mock operation list data for each status; mock filter responses
- [ ] **Integration test scope defined:** Unit tests for list/filter UI; integration tests for API + drawer interaction
- [ ] **Negative auth test role selected:** `CASHIER` for operations list (may lack READ on `platform.operations`)

### Review Outcome

| Scenario | Type | Coverage Plan |
|----------|------|--------------|
| List all operations for company | Happy | Integration |
| Filter by status=failed | Happy | Unit |
| Filter by type=import | Happy | Unit |
| Unsupported date range hidden | Edge | Unit |
| Click row opens AsyncJobDrawer | Happy | Unit |
| Generic retry action hidden | Edge | Unit |
| Generic cancel action hidden | Edge | Unit |
| Auto-refresh for running jobs | Happy | Unit |
| Jobs badge shows count | Happy | Unit |
| Empty list shows empty state | Edge | Unit |
| Permission denied (403) | Error | Integration |

**Sign-off:** Test scenarios reviewed and approved before implementation begins.

---

## Cross-Module Error Boundary Verification (MANDATORY — E58-A1)

### Pre-Implementation Checklist

- [ ] Producer error classes: `OperationNotFoundError`, `OperationsListError`
- [ ] Consumer catch paths: List shows error banner; drawer shows operation-not-found state if selected operation disappears
- [ ] Fallback handling: Generic "Operation failed" with operation ID
- [ ] Error response mapping: 400 → invalid list filter; 403 → permission denied; 404 → operation not found in drawer

### Verified Error Paths

| Producer Error | Consumer Handling | Fallback |
|----------------|-------------------|----------|
| Operation not found | Remove row from list; show "Job removed" | Refresh list |

---

## Acceptance Criteria

### AC1: Operations list
**Given** the operations center page  
**When** it loads  
**Then** all operations for the current company are listed  
**And** columns show: operation ID, job type, status, progress, started at, updated at, completed at  
**And** the list uses EntityTable from Epic 65 with server-side pagination (default page size: 20)

### AC2: Filter bar
**Given** the operations center page  
**When** filters are applied  
**Then** the list updates to show only matching operations  
**And** supported filters are:
- Status: `running`, `completed`, `failed`, `cancelled`
- Type: per contract document: `import`, `export`, `batch_update`
- Pagination: `limit` and `offset`
- Date range and creator filters are not required unless backend support is added

### AC3: Row click opens detail drawer
**Given** the operations list  
**When** a row is clicked  
**Then** the AsyncJobDrawer (Story 68-1) opens for that operation  
**And** the drawer shows the full operation lifecycle and progress

### AC4: Retry action absence
**Given** the current backend contract has no generic retry endpoint  
**When** the operations center renders failed operations  
**Then** no generic retry button is shown  
**And** operation-specific client resubmit actions MAY be linked only when the originating workflow provides them

### AC5: Cancel action absence
**Given** the current backend contract has no generic cancel endpoint  
**When** the operations center renders running operations  
**Then** no generic server-side cancel button is shown  
**And** the UI MAY display `cancelled` status for operations cancelled by backend/store mechanisms

### AC6: Auto-refresh for running jobs
**Given** the operations center page  
**When** there are operations in `running` status  
**Then** TanStack Query automatically refetches the list every 10 seconds  
**And** the refetch stops when no non-terminal operations remain

### AC7: Jobs badge in shell header
**Given** the shell header (from Epic 65)  
**When** there are running or failed operations  
**Then** a badge shows the count of `running + failed` operations  
**And** clicking the badge navigates to the operations center  
**And** if there are failed operations, the operations center is pre-filtered by `status=failed`

### AC8: Empty state
**Given** no operations exist for the current company  
**When** the operations center loads  
**Then** an empty state is displayed with message "No operations yet"  
**And** a link to trigger an import or export is shown (if user has permission)

### AC9: Permission gating
**Given** a user with `requireAccess({ module: 'platform', resource: 'operations', permission: 'READ' })` returning true  
**Then** the operations center is accessible  
**And** generic retry/cancel actions are not visible unless backend endpoints are added and permissions are defined

**Given** a user without `platform.operations.READ`  
**Then** the page shows "Access denied"

---

## Technical Notes

### Files to Create
- `apps/backoffice/src/features/operations/operations-center.tsx` — Main operations center page
- `apps/backoffice/src/features/operations/operations-filter-bar.tsx` — Filter bar component
- `apps/backoffice/src/hooks/use-operations-list.ts` — TanStack Query hook for operations list
- No generic retry/cancel hooks are created unless backend endpoints are added
- `apps/backoffice/__test__/unit/features/operations-center.test.tsx` — List, filter, drawer trigger tests
- `apps/backoffice/__test__/unit/features/operations-filter-bar.test.tsx` — Filter behavior tests

### Files to Modify
- `apps/backoffice/src/app/routes.ts` — Add `/operations` route
- `apps/backoffice/src/app/layout.tsx` — Add jobs badge to the app shell/header area
- `apps/backoffice/src/components/data-grid/EntityTable.tsx` — Ensure it supports operation row actions

### API Contracts (MUST reference story-68-0-contract.md)
- `GET /api/operations` — List operations with pagination and filters
- No generic retry/cancel endpoint exists in the Story 68-0 contract

### Auto-Refresh Logic
```typescript
const { data } = useQuery({
  queryKey: ['operations', filters],
  queryFn: () => fetchOperations(filters),
  refetchInterval: (data) => {
    const hasActive = data?.items.some(
      op => ['running'].includes(op.status)
    );
    return hasActive ? 10000 : false;
  },
});
```

---

## Risk Register

| Risk ID | Severity | Description | Mitigation |
|---------|----------|-------------|------------|
| R68-2-001 | P1 | Backend operations list endpoint does not support all filter params | Use client-side filtering as fallback; document gap |
| R68-2-002 | P1 | Retry/cancel endpoints do not exist | Hide generic retry/cancel buttons; document limitation |
| R68-2-003 | P2 | Auto-refresh causes UI flicker | Use TanStack Query `placeholderData` to maintain previous data during refetch |
| R68-2-004 | P2 | Large operation lists slow to load | Server-side pagination with default page size 20; virtual scrolling if needed |

---

## Story Points
**8 points** (medium-high — list/filter composition, auto-refresh, shell badge integration)

---

## Tasks / Subtasks

### Phase 1: List and filter
1. **Create `useOperationsList` hook** — TanStack Query with pagination, filters
2. **Create operations center page** — EntityTable + FilterBar composition
3. **Implement filter bar** — Status and type filters only

### Phase 2: Actions
4. **Document retry/cancel absence** — Hide generic controls and expose no unsupported action
5. **Implement row actions** — Drawer open and supported navigation only
6. **Implement auto-refresh** — Refetch interval based on active job count

### Phase 3: Shell integration
7. **Add jobs badge** — Shell header badge with count + deep link
8. **Add route** — `/operations` route with lazy loading

### Phase 4: Testing
9. **Unit tests for list/filter** — Filter behavior, pagination, empty state
10. **Unit tests for actions** — Drawer opening, retry/cancel absence, permission gating
11. **Integration tests** — Real API list authorization remains covered by Story 68-1 AC0 operations route tests

---

## Definition of Done

- [ ] All acceptance criteria implemented with evidence
- [ ] Unit tests for operations list, filter, and actions pass
- [ ] Tests verify unsupported generic retry/cancel controls are hidden
- [ ] Auto-refresh behavior verified (running jobs refetch every 10s)
- [ ] Jobs badge links correctly to filtered operations center
- [ ] Permission gating verified with CASHIER negative tests
- [ ] `npm run typecheck -w @jurnapod/backoffice` passes
- [ ] `npm run build -w @jurnapod/backoffice` passes
- [ ] Code review completed with no blockers
- [ ] Story completion report created (`story-68-2.completion.md`) with reviewer GO and owner sign-off

---

## Dependencies

- **Story 68-0** — Backend contract verified
- **Story 68-1** — AsyncJobDrawer component complete
- **Story 68-1** — `platform.operations` ACL resource complete or verified
- **Epic 65** — EntityTable, FilterBar, typed API client, TanStack Query, shell

## Validation Evidence

```bash
# Pre-flight
npm run lint -w @jurnapod/backoffice
npm run typecheck -w @jurnapod/backoffice
npm run build -w @jurnapod/backoffice

# Unit tests
npm run test:single -w @jurnapod/backoffice -- __test__/unit/features/operations-center.test.tsx
npm run test:single -w @jurnapod/backoffice -- __test__/unit/features/operations-filter-bar.test.tsx

# Sprint status
npx tsx scripts/validate-sprint-status.ts --epic 68
```

---

_Last Updated: 2026-05-19 (implementation in review)

---

## Dev Agent Record

### Implementation Plan

- Implement Operations Center against Story 68-0 verified backend contract: `/operations` with `limit`, `offset`, optional `status`, and optional `type`.
- Use backend-supported statuses only: `running`, `completed`, `failed`, `cancelled`.
- Use backend-supported types only: `import`, `export`, `batch_update`.
- Wire row/detail actions to Story 68-1 `AsyncJobDrawer` and do not expose unsupported generic retry/cancel controls.
- Add shell operations badge based on `running + failed` operation counts, with failed-state deep link to `#/operations?status=failed`.
- Require explicit backend-provided `platform.operations.READ` for route navigation, page access, badge queries, and Operations Center rendering.

### Completion Notes

- Added `useOperationsList` TanStack Query hook with canonical `/operations` path, offset pagination, response validation, and 10-second refetch policy only while running operations exist.
- Added Operations Center page using EntityTable, filter bar, offset pagination mapping, empty state, permission-denied state, and row click / details button opening AsyncJobDrawer.
- Added Operations filter bar with status/type filters only; date range and creator filters remain absent because backend support does not exist.
- Added `/operations` route with explicit `platform.operations.READ` route metadata and explicit-permission navigation filtering.
- Added shell operations badge state for running/failed operation counts and footer badge deep-link behavior.
- Added DataTable row activation support for operation row clicks.
- Added focused unit tests for list params, filters, empty state, permission gating, no retry/cancel controls, badge helpers, and auto-refresh policy.
- Review fix: explicit-permission routes now bypass legacy role prefilter and require backend-provided permission entries for Operations route visibility/access.
- Review fix: failed-count badge query refreshes while running operations exist so running-to-failed transitions update the badge and failed deep link.
- Review fix: empty-state import link now deep-links to `#/items/import`.

### Validation Evidence

- `npm run test:single -w @jurnapod/backoffice -- __test__/unit/features/operations-center.test.tsx` — passed; 8 tests passed.
- `npm run test:single -w @jurnapod/backoffice -- __test__/unit/features/operations-filter-bar.test.tsx` — passed; 3 tests passed.
- `npm run test:single -w @jurnapod/backoffice -- __test__/unit/app-router-guards-permissions.test.ts` — passed; 77 tests passed.
- `npm run lint -w @jurnapod/backoffice` — passed.
- `npm run typecheck -w @jurnapod/backoffice` — passed.
- `npm run build -w @jurnapod/backoffice` — passed; existing Vite chunk-size/dynamic-import warnings only.
- `npx tsx scripts/validate-sprint-status.ts` — passed.

### Review Result

- Architecture review: GO.
- Prior NO-GO findings resolved:
  - P1: `/operations` now uses explicit `platform.operations.READ` via `requiresExplicitPermission` and backend-provided `user.permissions` only.
  - P2: failed-count badge query refreshes while running operations exist, so running-to-failed transitions update the badge and failed deep link.
  - P3: empty-state import link now points to `#/items/import`.
- Final severity findings: P0 none, P1 none, P2 none, P3 none.

### File List

- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `_bmad-output/implementation-artifacts/stories/epic-68/story-68-2.md`
- `apps/backoffice/__test__/unit/features/operations-center.test.tsx`
- `apps/backoffice/__test__/unit/features/operations-filter-bar.test.tsx`
- `apps/backoffice/src/app/layout.tsx`
- `apps/backoffice/src/app/router.tsx`
- `apps/backoffice/src/app/routes.ts`
- `apps/backoffice/src/app/shell/index.ts`
- `apps/backoffice/src/app/shell/shell-context.tsx`
- `apps/backoffice/src/app/shell/use-nav-filtering.ts`
- `apps/backoffice/src/components/async-job-drawer.tsx`
- `apps/backoffice/src/components/ui/DataTable/DataTable.tsx`
- `apps/backoffice/src/components/ui/DataTable/types.ts`
- `apps/backoffice/src/features/operations/operations-center.tsx`
- `apps/backoffice/src/features/operations/operations-filter-bar.tsx`
- `apps/backoffice/src/hooks/use-operations-list.ts`
- `apps/backoffice/src/lib/operations-permissions.ts`
- `apps/backoffice/vitest.config.ts`

### Change Log

- 2026-05-19: Implemented Story 68-2 Operations Center UI/client scope and moved story to review.
