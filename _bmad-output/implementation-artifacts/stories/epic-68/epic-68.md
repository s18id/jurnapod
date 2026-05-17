# Epic 68: Async Workflows — Operations, SSE, Notifications, Audit

**Status:** planned (queued — requires explicit backoffice unfreeze before execution)
**Sprint/Timebox:** Weeks 7–8 (of Backoffice Frontend Program)
**Theme:** First-class async job monitoring with SSE-driven real-time progress, three-layer notification system (toast, inbox, banner), comprehensive audit surface, and layered dashboards (Global Admin Overview, Domain Dashboard, My Work panel).
**Primary Modules:** `apps/backoffice`, `packages/shared`
**Predecessor:** Epic 65 (Foundation) — requires shell, router, typed API client, TanStack Query
**Exit Gate:** AsyncJobDrawer shows full job lifecycle; operations center allows filter-by-status and retry; notification system delivers toast/inbox/banner; audit explorer links to entity detail; dashboards render with real data; all tests pass.

---

## 1) Charter

### 1.1 Program Alignment

Epic 68 delivers the operational visibility and user feedback layer that transforms the backoffice from a simple CRUD UI into an operator console. The asynchronous job infrastructure (SSE progress, operation records, retry) was identified as the single most important workflow to standardize in the research report, because the backend already provides end-to-end support for it but the current frontend does not fully leverage it.

### 1.2 What We Know

- The backend has purpose-built operation tracking: `/api/operations/*` with progress endpoints, SSE support on `/ws`, and `/api/sync/*` with status
- The repo already has a sync notification component and reconnecting WebSocket (`reconnecting-websocket`)
- The backend exposes `/api/audit/*` with period-transition audit APIs
- Health endpoints exist: `/api/health/live`, `/api/health/ready`
- The repo already has admin dashboard routes and built-in HTML dashboards
- The existing backoffice has route-level lazy loading and Dexie caches for frequently reused master data

### 1.3 Non-Goals

- No new backend operation/audit endpoints
- No real-time collaboration features (multi-user editing)
- No push notifications via service worker (WebSocket-based only)
- No advanced analytics or saved dashboard configurations
- No sales, dine-in, customer admin, or POS support domain screens — deferred to a future approved backoffice domain program

---

## 2) Requirements Inventory

### Functional Requirements

| FR | Statement | Story |
|----|-----------|-------|
| FR68-1 | The backoffice MUST provide an AsyncJobDrawer component that shows job lifecycle: queued, validating, running, partially failed, completed, downloadable | 68-1 |
| FR68-2 | Async job progress MUST be driven by SSE or polling with visual progress bar and status messages | 68-1 |
| FR68-3 | The backoffice MUST provide an operations/job center page with: list view, filter by status, retry action, detail view | 68-2 |
| FR68-4 | The backoffice MUST provide a three-layer notification system: ephemeral toast (auto-dismiss), persistent inbox (click to view), blocking banner (requires acknowledgement) | 68-3 |
| FR68-5 | Notification states MUST be deep-linkable (click notification → navigate to relevant entity/operation) | 68-3 |
| FR68-6 | The backoffice MUST provide an audit timeline view with: entity-scoped change history, before/after diff, actor info, timestamp | 68-4 |
| FR68-7 | The backoffice MUST provide a layered dashboard: Global Admin Overview (health, failed jobs, sync status), Domain Dashboards (per-module), My Work panel (drafts, pending approvals, recent jobs) | 68-5 |
| FR68-8 | WebSocket/SSE connectivity for the static SPA deployment MUST be verified before SSE-dependent UI work starts | 68-0 |

### Non-Functional Requirements

| NFR | Statement | Validation |
|-----|-----------|------------|
| NFR68-1 | SSE connection MUST be resilient: auto-reconnect on disconnect, exponential backoff | Integration test |
| NFR68-2 | Notification inbox MUST persist across page reloads (localStorage or TanStack Query cache) | Manual verification |
| NFR68-3 | Operations center MUST paginate; default page size of 20 | Load test |
| NFR68-4 | Audit timeline MUST use half-open interval filtering (col >= start AND col < nextDay) | Unit test |

---

## 3) Story Breakdown

### Story 68-0 — WebSocket/SSE connectivity verification for static SPA deployment

**Status:** planned
**Type:** spike / deployment verification
**Risk:** High
**Dependencies:** Epic 65 (auth/session baseline), staging static deployment access

Verify the transport layer required by operations progress and notification delivery before building SSE-dependent UI. The spike MUST test Nginx proxy behavior, CORS, cookies/auth, reconnect behavior, and polling fallback.

**Acceptance Criteria:**
- Static backoffice deployment can connect to the operations progress endpoint with authenticated session context.
- WebSocket or SSE transport works through Nginx/proxy configuration in staging.
- CORS and credentials behavior is documented for the selected transport.
- Polling fallback endpoint and interval are documented for unsupported transports.
- Any required deployment configuration changes are assigned to Epic 70-4 or the rollout runbook.

---

### Story 68-1 — AsyncJobDrawer component: lifecycle, SSE progress, completion

**Status:** planned
**Type:** foundation (reusable component)
**Risk:** High (SSE integration requires careful error handling)
**Dependencies:** Epic 65 (typed API client for operations endpoints)

Build the AsyncJobDrawer component:
- Displays job lifecycle states: `queued` → `validating` → `running` → `completed` (or `partially_failed` / `failed`)
- Visual: Mantine Stepper or custom timeline component with status icons and progress bar
- SSE-driven progress: connect to `/api/operations/:id/progress` (or WebSocket), update progress bar and status messages in real-time
- Fallback to polling (`GET /api/operations/:id`) if SSE/WebSocket not available
- Completion state: show created/updated/skipped/failed counts; provide download links for outputs and error CSVs
- Error state: show error message and retry button if the job supports retry
- The drawer is a Mantine Drawer that can be opened from anywhere via a context/hook

**Acceptance Criteria:**
- Given a submitted import job, the AsyncJobDrawer opens and shows "queued" state
- Given the job transitions to "running", the progress bar updates with percentage and message
- Given SSE disconnects, the drawer falls back to polling within 5 seconds
- Given the job completes successfully, the drawer shows "completed" with download links
- Given the job partially fails, the drawer shows "partially failed" with error count and download link for error CSV
- Given the job fully fails, the drawer shows failure reason and retry button
- Unit tests verify: state machine transitions, SSE message parsing, polling fallback timing

---

### Story 68-2 — Operations/job center: list, filter, retry, detail

**Status:** planned
**Type:** feature
**Risk:** Medium
**Dependencies:** 68-1 (AsyncJobDrawer), Epic 65 (typed API client for `/api/operations/*`)

Implement the operations center:
- List page using the shared EntityTable from Epic 65: columns for job type, status, progress, created by, created at, completed at
- FilterBar: status (queued, running, completed, failed), type (import, export, sync, etc.), date range, creator
- Row click opens AsyncJobDrawer for detail view
- Retry action: re-submit failed jobs with the same parameters
- Cancel action: cancel queued/running jobs if the backend supports it
- Jobs badge in shell header (from Epic 65) shows count of running+failed jobs and links to this page
- TanStack Query with automatic polling for running jobs (refetch every 10 seconds)

**Acceptance Criteria:**
- Given the operations page, all jobs for the current company are listed with current status
- Given a filter is applied (e.g., status=failed), only matching jobs are shown
- Given a failed job, the retry button re-submits it and opens the AsyncJobDrawer
- Given a running job, the page auto-refreshes status every 10 seconds
- Given the jobs badge shows 3 failed jobs, clicking it navigates to the operations page filtered by status=failed
- Given a completed job, the detail shows completion timestamp and download links

---

### Story 68-3 — Notification system: toast, inbox, banner

**Status:** planned
**Type:** foundation (reusable)
**Risk:** Medium
**Dependencies:** Epic 65 (shell, auth session)

Implement the three-layer notification system:
1. **Ephemeral toast** (Mantine Notifications): for transient success/error messages. Auto-dismiss after configurable duration (default 5s). Stackable.
2. **Persistent inbox**: a notification center accessible from the shell header (bell icon with unread count badge). Stores notifications with title, message, timestamp, type (info/warning/error/success), deep-link target, read/unread status. Persisted in TanStack Query cache or localStorage.
3. **Blocking banner**: for critical system states (session expiry, backend down, sync failure). Renders as a full-width colored banner at the top of the shell. Requires explicit acknowledgement or resolution to dismiss.

Notification sources are WebSocket/SSE events from the existing runtime transport when available, with polling fallback from operations/audit/health endpoints. All three layers support deep-linking: clicking a notification navigates to the relevant entity, operation, or audit entry.

**Acceptance Criteria:**
- Given a successful import, a toast notification appears and auto-dismisses after 5 seconds
- Given a failed job, a persistent notification appears in the inbox with unread badge on the bell icon
- Given a notification is clicked, the app navigates to the appropriate deep-link target
- Given the backend is unreachable, a blocking banner appears: "Backend connection lost — retrying..."
- Given the user acknowledges a blocking banner, it dismisses (if the condition is resolved)
- Given the notification inbox has unread items, the bell icon shows the count
- Given a notification is marked as read, the count decrements
- Given a notification is received through WebSocket/SSE, it is normalized into the same inbox shape as polling fallback notifications
- Given a notification references an audit-logged action, clicking it navigates to the audit explorer filtered by object type and object ID
- Unit tests verify: notification creation, read/unread toggle, deep-link generation, banner show/dismiss logic

---

### Story 68-4 — Audit timeline view

**Status:** planned
**Type:** feature
**Risk:** Medium
**Dependencies:** 66-5 (audit log explorer patterns), Epic 65 (typed API client for audit endpoints)

Implement an entity-scoped audit timeline:
- Accessible from any entity detail page via an "Audit Trail" tab or button
- Shows a vertical timeline of changes for that specific entity
- Each entry: actor name, action type badge (CREATE/UPDATE/DELETE/VOID/REFUND), timestamp, before/after diff (JSON diff or formatted comparison)
- Filter by action type and date range within the entity scope
- Deep-link: `/audit?objectType=item&objectId=42`
- The timeline component is reusable (AuditTimeline) and can be embedded in any detail page

**Acceptance Criteria:**
- Given an entity with 5 audit entries, the timeline renders with all entries in reverse chronological order
- Given an UPDATE entry, the before/after section shows the changed fields with old and new values
- Given the user is viewing a journal entry, the "Audit Trail" button navigates to the audit timeline filtered for that journal
- Given no audit entries exist, the timeline shows an empty state
- Given a filter is applied (e.g., action=DELETE), only matching entries are shown
- Unit tests verify: timeline rendering, diff formatting, filter behavior

---

### Story 68-5 — Layered dashboards: Global Admin, Domain, My Work

**Status:** planned
**Type:** feature
**Risk:** High (integrates multiple data sources)
**Dependencies:** 68-2 (operations center), 68-3 (notifications), Epic 65 (shell, tanstack query), must know what data the backend health/status endpoints return

Implement the layered dashboard system:
1. **Global Admin Overview** (default landing page): health check status (API, DB, sync), failed jobs count, pending AP exceptions, system alerts, quick links to audit and operations
2. **Domain Dashboards** (per-module tabs): inventory summary (total items, low stock alerts), accounting summary (pending reconciliations, fiscal period status), purchasing summary (pending approvals, overdue invoices)
3. **My Work panel**: user's recent jobs, pending approvals (if approver role), saved drafts, unresolved validation failures
4. Each dashboard card is a Mantine Paper/SimpleGrid with loading, empty, and error states
5. Auto-refresh interval (configurable, default 60s) for live data
6. Existing built-in HTML dashboard URLs are redirected to the new dashboard or explicitly deprecated with an operator-facing notice

**Acceptance Criteria:**
- Given the Global Admin Overview, the dashboard shows live health status, failed jobs count, and pending exceptions
- Given no failed jobs, the failed jobs card shows "0" or "All systems operational"
- Given the API health endpoint returns an error, the health card shows a red status with error message
- Given a user with the ACCOUNTANT role, the My Work panel shows pending reconciliation tasks
- Given a user with the ADMIN role, the My Work panel shows recent operations and audits
- Given the dashboard auto-refresh is enabled, data updates without full page reload
- Each card has proper loading (skeleton), empty, and error states
- Given a user opens an old built-in HTML dashboard URL, they are redirected to the new dashboard or shown an explicit deprecation notice

---

## 4) Epic Risk Register

| Risk ID | Severity | Description | Mitigation |
|---------|----------|-------------|------------|
| R68-001 | P1 | SSE endpoint may not support the subject entity type (import, export, sync) | Verify SSE coverage before implementation; fall back to polling for unsupported types |
| R68-002 | P1 | Notification inbox storage may exceed localStorage limits | Use TanStack Query cache with in-memory store; persist only unread state to localStorage |
| R68-003 | P2 | Dashboard data may require multiple parallel API calls, slowing initial load | Batch API calls with TanStack Query's `useQueries`; show skeleton states |
| R68-004 | P2 | WebSocket reconnection may cause notification storms | Debounce reconnection; batch notifications on reconnect |
| R68-005 | P2 | Audit timeline for high-activity entities (e.g., popular items) may be slow to load | Server-side pagination on audit entries; default page size of 25 |

---

## 5) Preconditions

| # | Precondition | Enforcement | Status |
|---|--------------|-------------|--------|
| 1 | Epic 65 (Foundation) complete | sprint-status.yaml | ❌ (HOLDING) |
| 2 | Backoffice unfreeze authorized | Written authorization | ❌ (HOLDING) |
| 3 | Typed API client covers health, operations, audit, WebSocket endpoints | 65-2 completion | ❌ (HOLDING) |
| 4 | SSE/WebSocket connectivity verified from backoffice static deployment | Story 68-0 | ❌ (must verify CORS + proxy config) |
| 5 | TanStack Query available with suspense/loading patterns | 65-6 completion | ❌ (HOLDING) |
| 6 | EntityTable primitive from Epic 65 available | 65-7 completion | ❌ (HOLDING) |

---

## 6) Exit Gate

1. **Build Gate:** `npm run build` and `npm run typecheck` pass
2. **Job Drawer Gate:** AsyncJobDrawer with full lifecycle, SSE progress, polling fallback, retry, download links all functional
3. **Operations Center Gate:** List, filter, retry, detail all functional; jobs badge links correctly
4. **Notification Gate:** Toast, inbox with unread count, blocking banner all functional; deep-linking works
5. **Audit Timeline Gate:** Entity-scoped timeline with before/after diff, action filter, deep-link all functional
6. **Dashboard Gate:** Global Admin, Domain, My Work all render with real data; auto-refresh functional
7. **Test Gate:** Unit tests for AsyncJobDrawer state machine, notification system, audit timeline, dashboard cards all pass
8. **SOLID/DRY/KISS Gate:** Full rescore passes at pre-close

---

## 7) Validation Commands

```bash
# Pre-flight
npm run lint -w @jurnapod/backoffice
npm run typecheck -w @jurnapod/backoffice
npm run build -w @jurnapod/backoffice

# AsyncJobDrawer tests
npm run test:single -w @jurnapod/backoffice -- __test__/unit/components/async-job-drawer.test.ts

# Operations center tests
npm run test:single -w @jurnapod/backoffice -- __test__/unit/features/operations-center.test.ts

# Notification system tests
npm run test:single -w @jurnapod/backoffice -- __test__/unit/components/notification-system.test.ts

# Audit timeline tests
npm run test:single -w @jurnapod/backoffice -- __test__/unit/components/audit-timeline.test.ts

# Dashboard tests
npm run test:single -w @jurnapod/backoffice -- __test__/unit/features/dashboards.test.ts

# Playwright CT tests for reusable components
npm run qa:ct -w @jurnapod/backoffice -- --grep "AsyncJobDrawer|Notification|AuditTimeline|Dashboard"

# E2E smoke tests
npm run qa:e2e -w @jurnapod/backoffice -- --grep "operations|notifications|audit|dashboard"

# Sprint status
npx tsx scripts/validate-sprint-status.ts --epic 68
```

---

_Last Updated: 2026-05-17_
