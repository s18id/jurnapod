# Story 67-5: Export Workflow Redesign — Scope → Stream → Download

Status: review

> ⚠️ **Sprint-Status Append-Only Rule (E45-A1 / E46-A1) — MANDATORY:**
> If this story modifies `_bmad-output/implementation-artifacts/sprint-status.yaml`:
> - **REQUIRED**: Run `npx tsx scripts/update-sprint-status.ts --epic 67 --story 67-5 --status done` (the canonical utility)
> - **REQUIRED**: After editing, run `npx tsx scripts/validate-sprint-status.ts` to confirm file integrity
> - **NEVER** replace the entire file — always append only
> - **NEVER** use `replaceAll` on epic section markers
> - If accidentally overwritten: `git checkout HEAD -- _bmad-output/implementation-artifacts/sprint-status.yaml`
> - **Retrospective workflow will check this before closing the epic** (E46-A4)

## Story

As a **company admin or inventory manager**,  
I want **to export items and prices with filter scope inheritance, dynamic column selection, and reliable streaming download**,  
So that **I can extract large datasets without browser timeouts or memory issues**.

## Context

The existing export functionality in `items-page.tsx` and `prices-page.tsx` uses `ExportDialog` with `useExportDialog` to trigger downloads. The backend export endpoint is **synchronous** — `POST /export/:entityType` streams the file directly (CSV/XLSX) using `apiStreamingRequest`. For datasets larger than 10,000 rows, the backend uses streaming response mode to reduce memory pressure.

This story redesigns the export workflow to:
- Inherit scope and filters from the current EntityTable state
- Fetch available columns dynamically from `GET /export/:entityType/columns`
- Show download progress during the streaming response
- Handle errors with retry
- Support mobile viewport layouts

**Backend contract reality:**
- `POST /export/:entityType` returns `Response` with `Content-Disposition: attachment` (file blob), NOT `{ operationId }`
- `GET /export/:entityType/columns` returns `{ columns: ExportColumn[], defaultColumns: string[] }`
- No operation record is created for exports; `GET /api/operations/:id/progress` is NOT applicable
- The `apiStreamingRequest` client already handles streaming download and `Content-Disposition` filename extraction

**Dependencies:** Story 67-1 (EntityTable for scope selection), Epic 65 (typed API client)

---

## Test Scenario Review Checkpoint (MANDATORY — E54-A1)

### Pre-Implementation Checklist

- [ ] **Happy paths identified:** Select scope → execute export → streaming download with byte progress; multiple concurrent exports
- [ ] **Error paths identified:** Export fails; network timeout; large dataset timeout; permission denied; no data to export
- [ ] **Edge cases identified:** Export with zero rows; export with all columns; export with filter matching nothing; very large export (>50K rows)
- [ ] **Test fixture needs identified:** Items and prices data for export; mock streaming response
- [ ] **Integration test scope defined:** API integration tests for export endpoints belong in `apps/api`; backoffice unit tests for scope selection and progress UI
- [ ] **Negative auth test role selected:** `CASHIER` for export (CASHIER has READ on inventory)

### Review Outcome

| Scenario | Type | Coverage Plan |
|----------|------|--------------|
| Export items with current filter scope | Happy | Backoffice unit + API integration |
| Download progress bar updates during stream | Happy | Backoffice unit (mock stream) |
| Export completes, file downloads | Happy | Backoffice unit |
| Export fails, error shown with retry | Error | Backoffice unit |
| Network timeout during large export | Error | Backoffice unit |
| Export with zero rows shows warning | Edge | Backoffice unit |
| Multiple concurrent exports in separate tabs | Edge | Backoffice unit |
| CASHIER can export (READ permission) | Happy | API integration |

**Sign-off:** Test scenarios reviewed and approved before implementation begins.

---

## Cross-Module Error Boundary Verification (MANDATORY — E58-A1)

### Pre-Implementation Checklist

- [ ] Producer error classes: `ExportError`, `DatabaseError` from backend
- [ ] Consumer catch paths: Progress UI shows error; download button disabled on failure
- [ ] Fallback handling: Generic "Export failed" with retry
- [ ] Error response mapping: 400 → invalid scope/columns; 401 → unauthorized; 500 → export generation failed

### Verified Error Paths

| Producer Error | Consumer Handling | Fallback |
|----------------|-------------------|----------|
| Invalid scope/filter | Scope selection shows validation error | Generic "Invalid selection" |
| Export generation failed | Progress shows "Failed" with error message | Generic "Export failed" |
| Network error during stream | Shows "Download interrupted" with retry | Generic "Export failed" |

---

## Acceptance Criteria

### AC1: Scope selection
**Given** the export workflow is initiated from items or prices page  
**When** the export dialog opens  
**Then** it shows: entity type (items/prices), filter criteria (inherited from current EntityTable state), column selection (all available columns checked by default)  
**And** estimated record count is displayed (P3-14: from `GET /api/inventory/items` or `GET /api/inventory/item-prices` with `limit=0` or `count_only=true` if supported; otherwise omit count)  
**And** format selection is available (CSV, XLSX)

### AC2: Filter scope inheritance
**Given** the user has filtered the items list to "Type = PRODUCT, Status = Active"  
**When** they initiate export  
**Then** the export scope pre-populates with those filters  
**And** the user can modify or clear filters before export

### AC3: Column selection
**Given** the export dialog  
**When** viewing column selection  
**Then** all available columns are listed with checkboxes  
**And** all columns are checked by default  
**And** at least one column must remain checked  
**And** `GET /export/:entityType/columns` provides the column list

### AC4: Export execution
**Given** scope and columns are selected  
**When** the user confirms export  
**Then** `POST /export/:entityType` is called with: format, columns, filters  
**And** the dialog shows "Preparing export..." with an indeterminate progress indicator  
**And** when the response stream begins, a download progress bar shows bytes received  
**And** on completion the file is saved via browser download

### AC5: Download progress tracking
**Given** an export is in progress  
**When** the streaming response delivers bytes  
**Then** a progress bar updates in real-time based on `Content-Length` (if available) or shows indeterminate progress  
**And** status messages show current activity ("Downloading...")  
**And** bytes received and total size are displayed when `Content-Length` is present

### AC6: Network retry
**Given** an export request fails due to network error  
**When** the error is detected  
**Then** an error message is displayed with a "Retry" button  
**And** retrying resubmits the same export request with identical parameters  
**And** the user can modify scope before retrying

### AC7: Completion and download
**Given** the export stream completes successfully  
**When** all bytes are received  
**Then** the browser triggers file download automatically  
**And** the file is saved in the selected format (CSV/XLSX)  
**And** the file name is extracted from the `Content-Disposition` header (format: `jurnapod-{entityType}-{timestamp}.{ext}`)  
**And** UTF-8 encoding is preserved for CSV

### AC8: Error handling
**Given** the export request fails  
**When** failure is detected (HTTP error or network failure)  
**Then** an error message is displayed with details  
**And** a "Retry" button allows resubmission with the same scope  
**And** the user can modify scope before retrying

### AC9: Multiple concurrent exports
**Given** multiple export dialogs are open in separate tabs or windows  
**When** exports execute simultaneously  
**Then** each download proceeds independently  
**And** browser handles concurrent streaming downloads without interference

### AC10: Permission gating
**Given** a user with `requireAccess({ module: 'inventory', resource: 'items', permission: 'READ' })` returning true  
**Then** the export workflow is accessible  

**Given** a user with `requireAccess({ module: 'inventory', resource: 'items', permission: 'READ' })` returning false  
**Then** the export workflow is hidden or disabled

### AC11: Mobile viewport (P2-10 Fix)
**Given** a mobile viewport (width <= 48em)  
**When** the export workflow loads  
**Then** scope selection renders as a full-screen modal  
**And** column selection uses a checklist with "Select All / None" toggle  
**And** progress tracking shows a compact inline progress bar  
**And** download button is prominent and full-width

---

## Technical Notes

### Files to Modify
- `apps/backoffice/src/features/items-page.tsx` — Pass current EntityTable filter state to ExportDialog; preserve all non-export features
- `apps/backoffice/src/features/prices-page.tsx` — Pass current filter state to ExportDialog; preserve all non-export features
- `apps/backoffice/src/components/export-dialog.tsx` — Redesign with scope display, dynamic columns, download progress, retry
- `apps/backoffice/src/hooks/use-export.ts` — Add `useExportColumns` fetch from API, improve stream progress tracking, add retry

### Files to Create
- `apps/backoffice/src/hooks/use-export-columns.ts` — TanStack Query hook for `GET /export/:entityType/columns`
- `apps/backoffice/__test__/unit/export/export-dialog.test.tsx` — Export dialog scope, column selection, progress, error, retry
- `apps/backoffice/__test__/unit/export/use-export-columns.test.tsx` — Column fetch hook tests

### Files NOT to Create (backend contract does not support)
- ❌ `use-sse-progress.ts` — No SSE for exports; `POST /export/:entityType` returns file directly
- ❌ `export-workflow.tsx` — ExportDialog is sufficient; no async job container needed
- ❌ `export-history.tsx` — No operation records exist for exports
- ❌ `use-export-job.ts` — No job lifecycle; export is synchronous streaming

### API Contracts (Verified against `apps/api/src/routes/export.ts`)
- `GET /export/:entityType/columns` — Returns `{ success: true, data: { entityType, columns: [{ key, header, fieldType }], defaultColumns: string[] } }`
- `POST /export/:entityType` — Query params: `format`, `columns`, `search`, `type`, `group_id`, `is_active`, `outlet_id`, `view_mode`, `scope_filter`, `date_from`, `date_to`. Returns `Response` with `Content-Type` and `Content-Disposition: attachment; filename="..."` (file blob). **Does NOT return `{ operationId }`.**
- **Auth:** `requireAccess({ module: 'inventory', resource: 'items', permission: 'read' })`
- **Streaming threshold:** Backend switches to `ReadableStream` for CSV when `rowCount > 10,000`
- **Excel limit:** Hard limit of 50,000 rows; backend returns 400 if exceeded

### Download Progress Implementation
```typescript
// Track streaming download progress via ReadableStream
async function trackDownloadProgress(
  response: Response,
  onProgress: (received: number, total: number | null) => void
): Promise<Blob> {
  const reader = response.body?.getReader();
  const contentLength = response.headers.get("content-length");
  const total = contentLength ? parseInt(contentLength, 10) : null;
  let received = 0;
  const chunks: Uint8Array[] = [];

  while (true) {
    const { done, value } = await reader!.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    onProgress(received, total);
  }

  return new Blob(chunks);
}
```

### P2-9 Resolution Note
The epic adversarial review approved a 10-second SSE reconnection timeout. **This is moot for exports** because exports use synchronous streaming, not SSE. The 10-second value remains canonical for any future SSE-enabled workflows (e.g., import apply progress).

---

## Risk Register

| Risk ID | Severity | Description | Mitigation |
|---------|----------|-------------|------------|
| R67-5-001 | P1 | Large exports may timeout or exceed browser memory | Backend uses streaming for CSV >10K rows; frontend streams download without buffering entire file |
| R67-5-002 | P2 | Network interruption during large download | Retry button resubmits identical request; user can modify filters before retry |
| R67-5-003 | P2 | Export file encoding issues (UTF-8 BOM, special chars) | Validate encoding in tests; use backend-provided Content-Type |
| R67-5-004 | P3 | Multiple concurrent exports may clutter the UI | Each export is independent; browser handles concurrent downloads |
| R67-5-005 | P2 | API base URL misconfiguration | Use `getApiBaseUrl()` from `apps/backoffice/src/lib/api-base-url.ts` (P2-8 Fix) |

---

## Story Points
**5 points** (medium complexity — enhance existing ExportDialog with dynamic columns, scope inheritance, download progress, retry)

---

## Tasks / Subtasks

### Phase 1: Preserve existing behavior
1. **Audit existing ExportDialog** — Document current props, state, and hook interface
2. **Verify no regression** — Ensure existing `useExportDialog` synchronous download still works
3. **Add feature flag** (optional) — Gate new scope/column fetch behind `enableEnhancedExport` to allow incremental rollout

### Phase 2: Dynamic columns
4. **Create `useExportColumns` hook** — TanStack Query hook calling `GET /export/:entityType/columns`
5. **Update `ExportDialog`** — Replace hardcoded `ITEM_EXPORT_COLUMNS` / `PRICE_EXPORT_COLUMNS` with fetched columns
6. **Cache column preferences** — Use `sessionStorage` key `jurnapod-export-columns-{entityType}` (existing pattern)

### Phase 3: Scope inheritance
7. **Pass filter state from items-page** — Map `ItemListState.filters` to `ExportFilters`
8. **Pass filter state from prices-page** — Map `FilterBar` state to `ExportFilters`
9. **Display inherited scope** — Show active filters in ExportDialog as read-only chips with "Clear" option

### Phase 4: Download progress and retry
10. **Enhance `useExportDialog`** — Track `ReadableStream` bytes received; compute percentage when `Content-Length` present
11. **Add retry logic** — Store last export config; retry button re-executes with same params
12. **Error states** — Distinguish HTTP 400 (validation) from network error from 500 (server)

### Phase 5: Mobile and polish
13. **Mobile viewport** — Full-screen modal on `width <= 48em`; compact progress; full-width download button
14. **Zero-row warning** — Show warning when estimated row count is 0 before allowing export
15. **Accessibility** — Focus trap in modal; keyboard navigation for column checklist

---

## Dev Notes / Technical Constraints

### Existing Assets to Reuse
- `ExportDialog` (`apps/backoffice/src/components/export-dialog.tsx`) — Current modal with column selector, format selector, date range. **Preserve all existing behavior.**
- `useExportDialog` (`apps/backoffice/src/hooks/use-export.ts`) — Already handles streaming download via `apiStreamingRequest`, `Content-Disposition` parsing, and blob download. **Enhance, do not replace.**
- `ColumnSelector` (`apps/backoffice/src/components/column-selector.tsx`) — Reuse for column checklist.
- `FormatSelector` (`apps/backoffice/src/components/format-selector.tsx`) — Reuse for CSV/XLSX toggle.
- `apiStreamingRequest` (`apps/backoffice/src/lib/api-client.ts`) — Already resolves token and calls `getApiBaseUrl()`.
- `getApiBaseUrl()` (`apps/backoffice/src/lib/api-base-url.ts`) — Returns `VITE_API_BASE_URL` with `/api` suffix, or `/api` fallback.

### Permission Gate
- Export MUST check `actionGates(effectivePermissions, "inventory", "items", ["READ"])` before showing export button.
- `CASHIER` role has READ on inventory per canonical ACL matrix — this is correct for positive tests.
- Negative auth tests MUST use a custom low-privilege role without `inventory.items.READ`.

### API_BASE_URL / EventSource Rules
- **No EventSource for exports** — exports are synchronous streaming via `fetch`/`apiStreamingRequest`.
- All API calls MUST use `getApiBaseUrl()` prefix: `${getApiBaseUrl()}/export/${entityType}`.
- **Never** hardcode `/api/export/...` as a relative path without `getApiBaseUrl()`.

### Polling Fallback Lifecycle
- **Not applicable to exports** — there is no operation to poll. The only "fallback" is the Retry button on network error.
- For future import apply progress (which MAY use SSE), the canonical P2-9 resolution is: allow EventSource native reconnect for 10 seconds before starting polling.

### Operation / Download Assumptions
- `POST /export/:entityType` returns `Response` with file blob, NOT JSON.
- Filename is extracted from `Content-Disposition` header.
- `Content-Length` MAY be present for progress calculation; if absent, show indeterminate progress.
- Backend returns 400 for Excel >50K rows; frontend MUST show this error before attempting download.

### Mobile Behavior
- On viewports `width <= 48em`, `ExportDialog` MUST render as a full-screen modal (Mantine `Modal` with `fullScreen` prop).
- Column selection MUST use `ScrollArea` with `Select All / None` toggle.
- Progress MUST show as compact inline bar (Mantine `Progress` with `size="sm"`).
- Download trigger is automatic on stream completion; no separate download button needed.

### Database / Backend Scope Boundary
- **NO backend changes permitted** — this story is backoffice-only.
- Any backend contract gaps (e.g., missing `count_only=true` on list endpoints) MUST be documented as deferred, not fixed in this story.
- If `GET /export/:entityType/columns` returns columns that differ from hardcoded frontoffice definitions, use the API response as source of truth.

---

## Testing Notes

### Backoffice Unit Tests (no real DB)
Location: `apps/backoffice/__test__/unit/export/`

| Test File | Scope |
|-----------|-------|
| `export-dialog.test.tsx` | Scope inheritance, column selection, format toggle, error display, retry button, mobile viewport |
| `use-export-columns.test.tsx` | TanStack Query hook: loading, success, error, caching |
| `download-progress.test.tsx` | Mock `ReadableStream` progress calculation |

**Mocks allowed:**
- `fetch` / `apiStreamingRequest` responses (external HTTP)
- `sessionStorage` / `localStorage`
- `URL.createObjectURL` / `document.createElement('a')` (download trigger)

**Mocks NOT allowed:**
- Database (P0 blocker per AGENTS.md)

### API Integration Tests (real DB)
Location: `apps/api/__test__/integration/`

| Test File | Scope |
|-----------|-------|
| `export/items-export.test.ts` | `POST /export/items` with filters, columns, format; verify `Content-Disposition`; verify 400 for Excel >50K rows |
| `export/prices-export.test.ts` | `POST /export/prices` with outlet filter, date range |
| `export/export-columns.test.ts` | `GET /export/items/columns` and `GET /export/prices/columns` return correct schema |

**Fixture requirements:**
- Use `createTestCompany()`, `createTestItem()`, `createTestOutlet()` from `apps/api/src/lib/test-fixtures.ts`
- Use `setupUserPermission()` with `roleCode: "CASHIER"` for positive auth tests
- Use custom test role without `inventory.items.READ` for negative auth tests
- **NEVER** delete `module_roles` rows by `role_id` alone (P0 blocker)

### Validation Commands
```bash
# Backoffice pre-flight
npm run typecheck -w @jurnapod/backoffice
npm run build -w @jurnapod/backoffice

# Backoffice unit tests
npm run test:single -w @jurnapod/backoffice -- __test__/unit/export/export-dialog.test.tsx
npm run test:single -w @jurnapod/backoffice -- __test__/unit/export/use-export-columns.test.tsx

# API integration tests
npm run test:single -w @jurnapod/api -- __test__/integration/export/items-export.test.ts
npm run test:single -w @jurnapod/api -- __test__/integration/export/prices-export.test.ts
```

---

## Definition of Done

- [ ] All acceptance criteria implemented with evidence
- [ ] API integration tests for export endpoints pass (real DB, `apps/api`)
- [ ] Backoffice unit tests for export dialog, column fetch, and download progress pass
- [ ] Error path tests for export failure and retry
- [ ] Permission gating verified
- [ ] Mobile viewport behavior verified
- [ ] `npm run typecheck -w @jurnapod/backoffice` passes
- [ ] `npm run build -w @jurnapod/backoffice` passes
- [ ] Code review completed with no blockers
- [ ] Story completion report created (`story-67.5.completion.md`) with reviewer GO and owner sign-off

---

_Last Updated: 2026-05-18_
