# Story 12.7: Table Board UI

Status: review

## Story

As a backoffice user or cashier,
I want a visual table board showing current table states,
so that I can quickly see availability and manage seating.

## Acceptance Criteria

1. **Given** table board is loaded
   **When** outlet is selected
   **Then** tables display with color-coded status (available=green, occupied=red, reserved=yellow)
   **And** each table shows capacity and current guest count
   **And** tables are grouped by zone if configured

2. **Given** visual table board
   **When** table action is invoked from the Actions menu
   **Then** context menu shows available actions based on current state
   **And** actions include: Hold, Seat, Release, View Session

3. **Given** table state changes
   **When** another cashier modifies a table
   **Then** board updates in near real-time (via polling or WebSocket)
   **And** visual indicator shows recently changed tables

4. **Given** table board with many tables
   **When** filters are applied
   **Then** tables can be filtered by status, zone, or capacity
   **And** view can switch between grid and list layouts

## Tasks / Subtasks

- [x] Task 1: Build table-board data layer in backoffice (AC: 1,3,4)
  - [x] Subtask 1.1: Add `useTableBoard` hook in `apps/backoffice/src/hooks/` to fetch `GET /api/dinein/tables/board?outletId=...`
  - [x] Subtask 1.2: Preserve existing API envelope pattern (`{ success, data }`) and parse `data.tables`
  - [x] Subtask 1.3: Add polling-based refresh (5-10s) with proper cleanup on unmount
  - [x] Subtask 1.4: Track `lastUpdatedAt` to show freshness badge/label for near-real-time UX

- [x] Task 2: Implement Table Board UI surface (AC: 1,4)
  - [x] Subtask 2.1: Create `apps/backoffice/src/features/table-board-page.tsx`
  - [x] Subtask 2.2: Reuse `PageCard` + `FilterBar` patterns already used by `outlet-tables-page.tsx` and `reservations-page.tsx`
  - [x] Subtask 2.3: Render table cards grouped by `zone` (fallback group for no-zone tables)
  - [x] Subtask 2.4: Add status colors from occupancy state and show capacity/guest/session metadata
  - [x] Subtask 2.5: Add grid/list toggle and filters (status, zone, capacity range, text search)

- [x] Task 3: Add per-table action menu and workflows (AC: 2)
  - [x] Subtask 3.1: Add action menu per card/row (Hold, Seat, Release, View Session)
  - [x] Subtask 3.2: Wire Hold/Seat/Release to existing dine-in endpoints with `X-Expected-Version` from board payload
  - [x] Subtask 3.3: Handle 409 responses explicitly with current-state feedback and refetch board
  - [x] Subtask 3.4: Wire View Session to existing session detail route flow (`/dinein/sessions/:id` API-backed view behavior)

- [x] Task 4: Integrate route/navigation and role/module access (AC: 1,4)
  - [x] Subtask 4.1: Add `"/table-board"` route to `apps/backoffice/src/app/routes.ts` with pos module guard
  - [x] Subtask 4.2: Add router mapping in `apps/backoffice/src/app/router.tsx`
  - [x] Subtask 4.3: Keep access rules aligned with existing outlet tables/reservations role boundaries

- [x] Task 5: Add focused test coverage for board behavior (AC: 1,2,3,4)
  - [x] Subtask 5.1: Add hook/page tests for rendering/grouping/filtering/view toggle
  - [x] Subtask 5.2: Add action tests for hold/seat/release optimistic-version usage and conflict handling
  - [x] Subtask 5.3: Add polling/timer lifecycle tests to prevent stale intervals and memory leaks
  - [x] Subtask 5.4: Add route-access tests for role/module gating and forbidden state

- [x] Task 6: Align API/shared contracts required by table-board integration (AC: 1,2,3)
  - [x] Subtask 6.1: Add and map operational `status_id` constants in shared contract exports for outlet-table workflows
  - [x] Subtask 6.2: Ensure outlet-table create/update/deactivate flows keep runtime occupancy in sync with operational status transitions
  - [x] Subtask 6.3: Keep route methods and conflict responses consistent with optimistic-version behavior used by board actions

## Dev Notes

### Story Foundation and Business Context

- Story 12.7 is the first UI consumer of the table occupancy + session + sync stack delivered by Stories 12.1-12.6.
- This screen is operationally critical and must reflect canonical state from server APIs, not local ad-hoc cache mutations.
- The board is an operator cockpit: speed matters, but auditability and concurrency correctness matter more.
- [Source: _bmad-output/planning-artifacts/epics-split/epic-12-table-reservation-pos-sync.md#Story-12.7-Table-Board-UI]

### Dependencies on Previous Stories (Do Not Rebuild)

- Story 12.3 already provides `GET /api/dinein/tables/board` and hold/seat/release endpoints.
- Story 12.5 already provides session lifecycle and view-session context (`ACTIVE -> LOCKED_FOR_PAYMENT -> CLOSED`).
- Story 12.6 already hardens multi-cashier sync and optimistic conflict handling; UI must surface conflict outcomes cleanly.
- Reuse existing hooks/components (`useOutletsFull`, `PageCard`, `FilterBar`, `DataTable`) and avoid duplicating fetch helpers.
- [Source: _bmad-output/implementation-artifacts/stories/epic-12/story-12.3.md]
- [Source: _bmad-output/implementation-artifacts/stories/epic-12/story-12.5.md]
- [Source: _bmad-output/implementation-artifacts/stories/epic-12/story-12.6.md]

### Technical Requirements (Mandatory)

1. **Read canonical board state from API**
   - Use `GET /api/dinein/tables/board?outletId=...` response as single source of truth.
   - Preserve current contract keys (`tableId`, `tableCode`, `occupancyStatusId`, `availableNow`, `version`, etc.).
2. **Optimistic concurrency on actions**
   - Hold/Seat/Release calls must include expected version header/body exactly as existing endpoints require.
   - On `409`, show conflict feedback and refresh board immediately.
3. **Tenant/outlet isolation and auth boundaries**
   - Do not allow cross-outlet actions from board UI state.
   - Respect route role/module guards from app routing.
4. **No contract drift**
   - If board payload typing is formalized in backoffice, keep compatibility with existing API route output.
   - Do not silently rename fields in UI data layer without adapter mapping.
5. **No fake real-time claims**
   - Implement polling explicitly (configurable interval) and label it as live refresh.
   - Do not imply WebSocket behavior unless actually implemented.

### Architecture Compliance Guardrails

- Keep page composition aligned with existing backoffice patterns:
  - top-level `PageCard` with title/actions
  - `FilterBar` for outlet/status/search controls
  - explicit loading/error/empty states via Mantine components
- Route registration must be consistent across:
  - `apps/backoffice/src/app/routes.ts`
  - `apps/backoffice/src/app/router.tsx`
- Reuse API client wrapper (`apiRequest`) and session token flow from existing hooks.
- Do not add new backend endpoints for this story unless an AC cannot be met with existing APIs.
- [Source: apps/backoffice/src/features/outlet-tables-page.tsx]
- [Source: apps/backoffice/src/features/reservations-page.tsx]
- [Source: apps/backoffice/src/app/routes.ts]
- [Source: apps/backoffice/src/app/router.tsx]

### Library and Framework Requirements

- Frontend runtime: React 18 + Mantine in existing backoffice app.
- Use current hook style (`useState`/`useEffect`/`useMemo`/`useCallback`) and `apiRequest` from `lib/api-client`.
- Keep API behavior compatible with Hono backend route outputs.
- Keep mysql2/zod compatibility constraints unchanged; this is UI-first scope.
- Latest references:
  - Hono docs emphasize thin route/middleware composition (already in project pattern).
  - mysql2 docs emphasize prepared/execute and pooled usage (backend constraints remain unchanged).
  - Zod latest is v4 upstream, but repo architecture baseline remains Zod 3.x conventions; do not introduce upgrade churn in this story.
- [Source: https://hono.dev/docs/]
- [Source: https://sidorares.github.io/node-mysql2/docs]
- [Source: https://www.npmjs.com/package/zod]

### File Structure Requirements

- Primary files to create/modify:
  - `apps/backoffice/src/features/table-board-page.tsx`
  - `apps/backoffice/src/hooks/use-table-board.ts`
  - `apps/backoffice/src/app/routes.ts`
  - `apps/backoffice/src/app/router.tsx`
- Optional support files (only if needed):
  - `apps/backoffice/src/features/table-board-page.test.tsx`
  - `apps/backoffice/src/hooks/use-table-board.test.ts`
- Reuse existing files/patterns before creating new shared components.

### Testing Requirements

- Add focused coverage for:
  - board grouping by zone and status color mapping
  - filters + grid/list mode behavior
  - polling refresh and cleanup (no dangling intervals)
  - hold/seat/release action flows with conflict handling
  - route/module/role gating
- Preserve integration fixture policy: API-driven setup for business entities where endpoints exist.
- For API-facing tests that touch DB pools, ensure cleanup hooks remain present in API test files.
- [Source: docs/project-context.md#Testing-Standards]
- [Source: AGENTS.md#Test-cleanup-CRITICAL]

### Previous Story Intelligence (12.6)

- Keep deterministic outcomes and explicit conflict semantics; do not hide conflict states in UI.
- Keep response-shape handling exact (`successResponse` envelope vs direct details on conflict paths).
- Preserve retry-safe behavior assumptions from sync layer when surfacing action feedback.
- Keep story/dev records synchronized with real changed files and validation evidence.
- [Source: _bmad-output/implementation-artifacts/stories/epic-12/story-12.6.md#Review-Follow-ups-AI]
- [Source: _bmad-output/implementation-artifacts/stories/epic-12/story-12.6.md#Completion-Notes-List]

### Git Intelligence Summary

- Recent commits show consistent delivery pattern for Epic 12:
  - implement backend domain/service first
  - add route integration tests and concurrency tests
  - update docs + sprint/story artifacts together
- For 12.7, keep same consistency on backoffice side:
  - feature page + hook + route wiring + targeted tests + artifact updates.
- [Source: git log -5 --oneline]
- [Source: git log -5 --name-only]

### Project Structure Notes

- Existing story documents for Epic 12 are under `_bmad-output/implementation-artifacts/stories/epic-12/`, but this workflow default output is implementation-artifacts root by story key.
- Backoffice currently already exposes related pages:
  - `/outlet-tables`
  - `/reservations`
- Table board should be additive and integrated into current hash-route navigation flow.

### References

- `_bmad-output/planning-artifacts/epics-split/epic-12-table-reservation-pos-sync.md`
- `_bmad-output/planning-artifacts/table-reservation-pos-sync-architecture.md`
- `_bmad-output/planning-artifacts/architecture.md`
- `_bmad-output/planning-artifacts/prd.md`
- `docs/project-context.md`
- `apps/backoffice/src/features/outlet-tables-page.tsx`
- `apps/backoffice/src/features/reservations-page.tsx`
- `apps/backoffice/src/hooks/use-outlet-tables.ts`
- `apps/backoffice/src/hooks/use-reservations.ts`
- `apps/backoffice/src/app/routes.ts`
- `apps/backoffice/src/app/router.tsx`
- `apps/api/app/api/dinein/tables/board/route.ts`
- `_bmad-output/implementation-artifacts/stories/epic-12/story-12.6.md`

## Dev Agent Record

### Agent Model Used

openai/gpt-5.3-codex

### Debug Log References

- Create-story workflow executed with explicit target `12.7`
- Input discovery completed for epics, PRD, architecture, UX artifacts, project context, previous story, and recent git history
- Existing backoffice and dine-in API implementation paths analyzed for reuse-first implementation guidance
- Updated sprint status to `in-progress` and implemented story tasks sequentially (Task 1 -> Task 5)
- Red-green-refactor applied via new failing tests first for hook, page helpers, and route access; then implementation and refactor
- Full validation run executed from repo root: backoffice tests, typecheck, lint

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.
- Implemented `useTableBoard` data hook with API envelope parsing, 8-second polling, cleanup, last-updated tracking, and recent-change detection
- Implemented `TableBoardPage` with zone grouping, status color semantics, grid/list toggle, filters (status/zone/capacity/search), and freshness indicator
- Added table action menu (Hold/Seat/Release/View Session) with optimistic version headers and explicit conflict refresh behavior
- Added route integration for `/table-board` with POS module gating and role boundaries aligned to reservations/outlet-tables policies
- Added focused tests: hook helpers + polling cleanup, page filtering/grouping/action helper logic, and route/module/role access checks
- Expanded action-flow tests for hold/seat/release to assert endpoint path, `X-Expected-Version` header, payload shape, conflict normalization, and guaranteed board refetch on both success/error
- Follow-up fixes from BMAD code review:
  - aligned `/table-board` route access with story actor scope by allowing `CASHIER`
  - improved table-board test evidence for numeric payload coercion and status mapping normalization
  - renamed backoffice deactivation helper to `deactivateOutletTable` (kept compatibility alias)
  - synchronized runtime occupancy updates with outlet table operational status transitions (`AVAILABLE`/`UNAVAILABLE`)
- Fixed pre-existing backoffice typecheck issue in `outlet-tables-page.tsx` by narrowing editable table status to operational states only
- Fixed backoffice lint configuration baseline by replacing invalid `next/core-web-vitals` extension with flat config ignores to restore lint execution
- Working tree includes uncommitted iterative review/fix changes across API, shared contracts, and backoffice while story remains in `review` for final merge gate.
- Validation evidence:
  - `npm run test -w @jurnapod/backoffice` (108/108 pass)
  - `npm run typecheck -w @jurnapod/backoffice` (pass)
  - `npm run lint -w @jurnapod/backoffice` (pass)

### File List

- `_bmad-output/implementation-artifacts/12-7-table-board-ui.md`
- `apps/backoffice/src/hooks/use-table-board.ts`
- `apps/backoffice/src/hooks/use-table-board.test.ts`
- `apps/backoffice/src/features/table-board-page.tsx`
- `apps/backoffice/src/features/table-board-page.test.ts`
- `apps/backoffice/src/app/routes.ts`
- `apps/backoffice/src/app/router.tsx`
- `apps/backoffice/src/app/routes.test.ts`
- `apps/backoffice/src/tests/all.test.ts`
- `apps/backoffice/src/features/outlet-tables-page.tsx`
- `apps/backoffice/src/hooks/use-outlet-tables.ts`
- `apps/backoffice/eslint.config.mjs`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `apps/backoffice/src/app/layout.tsx`
- `apps/api/src/lib/outlet-tables.ts`
- `apps/api/src/lib/outlet-tables.test.ts`
- `apps/api/src/lib/reservations.ts`
- `apps/api/src/lib/table-occupancy.ts`
- `apps/api/app/api/outlets/[outletId]/tables/route.ts`
- `apps/api/app/api/outlets/[outletId]/tables/bulk/route.ts`
- `apps/api/app/api/outlets/[outletId]/tables/[tableId]/route.ts`
- `packages/shared/src/constants/table-states.ts`
- `packages/shared/src/schemas/outlet-tables.ts`

## Change Log

- 2026-03-19: Implemented Story 12.7 table board UI end-to-end (data hook, page, actions, route integration, and tests) and passed backoffice validation suite.
