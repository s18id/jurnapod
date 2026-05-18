# Story 68-1: AsyncJobDrawer Component — Lifecycle, SSE Progress, Completion

Status: backlog

> ⚠️ **Sprint-Status Append-Only Rule (E45-A1 / E46-A1) — MANDATORY:**
> If this story modifies `_bmad-output/implementation-artifacts/sprint-status.yaml`:
> - **REQUIRED**: Run `npx tsx scripts/update-sprint-status.ts --epic 68 --story 68-1 --title async-job-drawer --status done` (the canonical utility)
> - **REQUIRED**: After editing, run `npx tsx scripts/validate-sprint-status.ts` to confirm file integrity
> - **NEVER** replace the entire file — always append only
> - **NEVER** use `replaceAll` on epic section markers
> - If accidentally overwritten: `git checkout HEAD -- _bmad-output/implementation-artifacts/sprint-status.yaml`
> - **Retrospective workflow will check this before closing the epic** (E46-A4)

## Story

As a **company admin or operator**,  
I want **a drawer panel that shows the full lifecycle of an async job with real-time progress**,  
So that **I can monitor long-running operations (imports, exports, sync) without leaving my current page**.

## Context

The backoffice needs a reusable component that displays async job progress. This component will be triggered from multiple surfaces: the operations center (Story 68-2), import/export workflows (Epic 67), and notification deep-links (Story 68-3). The component MUST be transport-agnostic: it consumes progress via SSE when available, polling when SSE is unavailable, and XHR callbacks for synchronous streaming operations.

**Critical dependency:** Story 68-0 (Backend Operations Contract Verification). The AsyncJobDrawer MUST be built against the verified contract documented in `story-68-0-contract.md`. Story 68-0 found that backend operation progress currently exposes persisted progress rows with `running`, `completed`, `failed`, and `cancelled` statuses only; no generic operation detail, queued/validating/partially_failed state, retry endpoint, cancel endpoint, steps, results, retryable flag, or cancellable flag exists.

**Mandatory ACL pre-work:** This story MUST introduce or verify a dedicated `platform.operations` ACL resource before operation details are exposed. Frontend operation affordances MUST use `platform.operations` resource checks; backend operations endpoints remain authoritative.

**Dependencies:** Story 68-0 (contract verified), Epic 65 (typed API client, Mantine shell)

**Risk:** High — SSE integration requires careful error handling and fallback logic.

---

## Test Scenario Review Checkpoint (MANDATORY — E54-A1)

### Pre-Implementation Checklist

- [ ] **Happy paths identified:** Job queued → running → completed with download; job partially failed with error CSV
- [ ] **Error paths identified:** SSE disconnect; polling failure; job fully failed; unauthorized access; operation not found
- [ ] **Edge cases identified:** Job completes before drawer opens; reconnect storm; very long job (>10 minutes); job cancelled by another user
- [ ] **Test fixture needs identified:** Mock operation objects for each status; mock SSE events; mock polling responses
- [ ] **Integration test scope defined:** Unit tests for component state machine; integration tests for API client + drawer interaction
- [ ] **Negative auth test role selected:** `CASHIER` for operations detail (may lack READ on `platform.operations`)

### Review Outcome

| Scenario | Type | Coverage Plan |
|----------|------|--------------|
| Drawer opens for queued job | Happy | Unit |
| Progress updates via SSE | Happy | Unit (mock EventSource) |
| Progress updates via polling fallback | Happy | Unit (mock fetch) |
| Job completes, download links appear | Happy | Unit |
| Job partially fails, error count shown | Happy | Unit |
| Job fully fails, retry button shown | Error | Unit |
| SSE disconnects, falls back to polling | Error | Unit |
| Operation not found (404) | Error | Unit |
| Drawer closed mid-job, reopened later | Edge | Unit |
| CASHIER denied access (403) | Error | Integration |

**Sign-off:** Test scenarios reviewed and approved before implementation begins.

---

## Cross-Module Error Boundary Verification (MANDATORY — E58-A1)

### Pre-Implementation Checklist

- [ ] Producer error classes: `OperationNotFoundError`, `SSEConnectionError`, `PollingError` from backend or API client
- [ ] Consumer catch paths: Drawer shows error state; does not crash shell
- [ ] Fallback handling: Generic "Failed to load job" with close button
- [ ] Error response mapping: 404 → operation not found; 403 → permission denied; 500 → server error

### Verified Error Paths

| Producer Error | Consumer Handling | Fallback |
|----------------|-------------------|----------|
| Operation not found | Drawer shows "Job not found" with refresh | Close drawer |
| SSE disconnect | Switch to polling; show "Reconnecting..." indicator | Polling fallback |
| Polling failure | Show "Unable to update progress" with retry | Manual refresh button |
| Permission denied | Drawer shows "Access denied" | Close drawer |

---

## Acceptance Criteria

### AC0: `platform.operations` ACL resource
**Given** operation records expose cross-workflow system activity  
**When** AsyncJobDrawer implementation begins  
**Then** a dedicated `platform.operations` ACL resource exists or is introduced  
**And** operation detail/progress endpoints enforce `requireAccess({ module: 'platform', resource: 'operations', permission: 'READ' })`  
**And** retry actions require `UPDATE` permission  
**And** cancel actions require `DELETE` permission  
**And** AGENTS.md canonical ACL documentation is updated if the resource is introduced in this story

### AC1: Drawer trigger and context
**Given** any page in the backoffice  
**When** an async job is initiated or the user clicks a job reference  
**Then** the AsyncJobDrawer opens as a Mantine Drawer  
**And** it is accessible via a React context/hook (`useAsyncJobDrawer`)  
**And** it displays the operation ID, type, and current status

### AC2: Job lifecycle display
**Given** the drawer is open  
**When** the operation status changes  
**Then** the drawer shows the backend-supported lifecycle states: `running` → `completed` (or `failed` / `cancelled`)  
**And** a visual stepper (Mantine Stepper or custom timeline) highlights the current state  
**And** each state has an icon and descriptive label

### AC3: SSE-driven progress
**Given** the backend supports SSE for the operation type (per `story-68-0-contract.md`)  
**When** an SSE connection is established to `/api/operations/:id/progress`  
**Then** the progress bar updates in real-time with percentage and status message  
**And** native `EventSource` is used only after staging proves cookie-authenticated SSE works  
**And** a bearer-capable fetch stream is used if native `EventSource` cannot authenticate  
**And** `/ws` is not used for sensitive operation progress while the P0 `/ws` auth fallback remains unresolved  
**And** reconnect behavior is implemented as a UI policy because the backend does not emit SSE `retry:` settings

### AC4: Polling fallback
**Given** SSE is unavailable or fails  
**When** the drawer detects SSE failure  
**Then** it falls back to polling `GET /api/operations/:id` within 5 seconds  
**And** the poll interval follows the contract document (default: 5 seconds for running jobs)  
**And** polling stops automatically when the operation reaches a terminal state

### AC5: Completion state
**Given** the operation completes successfully  
**When** the terminal state is reached  
**Then** the drawer shows "completed" with:
- Total and completed counts from the progress response
- Details from the opaque `details` object if present
- Timestamp of completion

### AC6: Failure state details
**Given** the operation fails  
**When** the `failed` state is reached  
**Then** the drawer shows failure details from the `details` object when provided  
**And** no generic error CSV, partial-failure count, or result summary is required unless the backend contract adds it

### AC7: Full failure state
**Given** the operation fully fails  
**When** the `failed` state is reached  
**Then** the drawer shows the failure reason  
**And** no generic backend retry button is shown because `/api/operations/:id/retry` does not exist  
**And** operation-specific client resubmit actions MAY be provided only by the originating workflow

### AC8: Cancelled state
**Given** the operation is cancelled  
**When** the `cancelled` state is reached  
**Then** the drawer shows "cancelled" with timestamp  
**And** no generic retry button is shown

### AC9: Drawer close and reopen
**Given** the drawer is closed while a job is running  
**When** the drawer is reopened for the same job  
**Then** it resumes showing the current status  
**And** it re-establishes SSE or polling as needed

### AC10: Permission gating
**Given** a user with `requireAccess({ module: 'platform', resource: 'operations', permission: 'READ' })` returning true  
**Then** the drawer loads operation details  

**Given** a user with `requireAccess({ module: 'platform', resource: 'operations', permission: 'READ' })` returning false  
**Then** the drawer shows "Access denied"

---

## Technical Notes

### Files to Create
- `apps/backoffice/src/components/async-job-drawer.tsx` — Main drawer component
- `apps/backoffice/src/hooks/use-async-job-drawer.ts` — Context + hook for opening/managing the drawer
- `apps/backoffice/src/hooks/use-operation-progress.ts` — Hook managing SSE + polling fallback logic
- `apps/backoffice/src/components/operation-stepper.tsx` — Visual stepper for lifecycle states
- `apps/backoffice/__test__/unit/components/async-job-drawer.test.tsx` — Drawer state machine tests
- `apps/backoffice/__test__/unit/hooks/use-operation-progress.test.ts` — SSE/polling logic tests

### Files to Modify
- `apps/backoffice/src/app/layout.tsx` — Add AsyncJobDrawer provider and drawer mount point to the app layout
- `apps/backoffice/src/app/router.tsx` — Ensure drawer context is available across routed pages
- `AGENTS.md` — Add `platform.operations` to canonical ACL resource documentation if introduced in this story

### API Contracts (MUST reference story-68-0-contract.md)
- `GET /api/operations/:id` — Operation detail (polling fallback)
- SSE `/api/operations/:id/progress` — Real-time progress (if supported)
- Retry is not available as a generic operations endpoint in the Story 68-0 contract

### State Machine
```
running → completed
   ↓
cancelled
   ↓
failed
```

### SSE Implementation
```typescript
const eventSource = new EventSource(
  `${getApiBaseUrl()}/operations/${id}/progress`,
  { withCredentials: true }
);
eventSource.onmessage = (event) => {
  const progress = JSON.parse(event.data);
  updateProgress(progress);
};
eventSource.onerror = () => {
  // Fallback to polling after max reconnect attempts
  startPolling(id);
};
```

### Polling Fallback
```typescript
const startPolling = (id: string) => {
  const interval = setInterval(async () => {
    const operation = await apiRequest<OperationDetail>(`/operations/${id}`);
    updateProgress(operation);
    if (isTerminalState(operation.status)) {
      clearInterval(interval);
    }
  }, POLL_INTERVAL_MS);
};
```

---

## Risk Register

| Risk ID | Severity | Description | Mitigation |
|---------|----------|-------------|------------|
| R68-1-001 | P1 | SSE runtime auth/proxy behavior remains unverified | Design drawer for polling-first; enable SSE only when staging evidence exists |
| R68-1-002 | P1 | `platform.operations` ACL resource does not exist | Introduce dedicated `platform.operations` resource in this story before exposing operation details |
| R68-1-003 | P2 | Reconnect storm causes notification/progress duplication | Debounce reconnect; deduplicate events by operation status + timestamp |
| R68-1-004 | P2 | Drawer opened for completed job shows stale data | Always fetch latest state on open; don't rely on cached state |

---

## Story Points
**8 points** (high complexity — SSE + polling dual transport, state machine, error handling)

---

## Tasks / Subtasks

### Phase 1: Foundation
1. **Review story-68-0-contract.md** — Confirm which operation types use SSE vs polling vs synchronous
2. **Create `useAsyncJobDrawer` context** — Global drawer state (open/closed, operationId)
3. **Create `AsyncJobDrawer` shell** — Mantine Drawer with header, body, footer

### Phase 2: Progress transport
4. **Create `useOperationProgress` hook** — SSE connect + polling fallback logic
5. **Implement SSE path** — EventSource with reconnect, error handling
6. **Implement polling fallback** — Interval-based fetching with cleanup

### Phase 3: Visual states
7. **Create `OperationStepper` component** — Stepper showing lifecycle states
8. **Implement completed state** — Total/completed counts, details object if present
9. **Implement failed state** — Error details from `details` if present, no generic retry endpoint
11. **Implement cancelled state** — Timestamp, no retry

### Phase 4: Integration
12. **Wire into shell** — Add provider to app root
13. **Trigger from operations center** — Story 68-2 will consume this
14. **Trigger from notifications** — Story 68-3 will consume this

### Phase 5: Testing
15. **Unit tests for state machine** — All status transitions
16. **Unit tests for SSE logic** — Mock EventSource, reconnect, fallback
17. **Unit tests for polling logic** — Interval timing, cleanup, terminal state stop
18. **Permission tests** — Denied state rendering

---

## Definition of Done

- [ ] All acceptance criteria implemented with evidence
- [ ] `platform.operations` ACL resource exists or verified, with backend operations routes using explicit resource-level permissions
- [ ] Unit tests for AsyncJobDrawer state machine pass
- [ ] Unit tests for SSE message parsing and polling fallback timing pass
- [ ] Tests verify no generic retry/cancel controls render when backend endpoints are absent
- [ ] Drawer opens from any page via `useAsyncJobDrawer` hook
- [ ] Permission gating verified with CASHIER negative tests
- [ ] `npm run typecheck -w @jurnapod/backoffice` passes
- [ ] `npm run build -w @jurnapod/backoffice` passes
- [ ] Code review completed with no blockers
- [ ] Story completion report created (`story-68-1.completion.md`) with reviewer GO and owner sign-off

---

## Dependencies

- **Story 68-0** — Backend Operations Contract Verification MUST be complete and approved
- **Epic 65** — Typed API client, Mantine shell, auth session
- `story-68-0-contract.md` — MUST be referenced in implementation

## Validation Evidence

```bash
# Pre-flight
npm run lint -w @jurnapod/backoffice
npm run typecheck -w @jurnapod/backoffice
npm run build -w @jurnapod/backoffice

# Unit tests
npm run test:single -w @jurnapod/backoffice -- __test__/unit/components/async-job-drawer.test.tsx
npm run test:single -w @jurnapod/backoffice -- __test__/unit/hooks/use-operation-progress.test.ts

# Sprint status
npx tsx scripts/validate-sprint-status.ts --epic 68
```

---

_Last Updated: 2026-05-18 (prepared by bmad-sm)
