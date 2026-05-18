# Story 67-5: Export Workflow Redesign — Completion Report

**Status:** DONE ✅  
**Owner Sign-off:** Ahmad (2026-05-18)  
**Reviewer Decision:** GO-WITH-FOLLOWUPS (Round 2)  

---

## Acceptance Criteria Evidence

### AC-1: Export dialog inherits current scope (search, type, status, outlet)
✅ **Implemented**
- `ExportDialog` accepts `initialFilters` prop that propagates from parent page context.
- `buildExportScopeChips()` renders all active filters as clearable badges with `key: value` labels.
- Scope chips include: Search, Type, Group, Status, Outlet, View Mode, Scope, Date From/To.
- Clearing a chip calls `clearScopeFilter(key)` which nullifies the filter and re-renders.
- Verified by test: `renders inherited item filter scope as clearable chips`.

### AC-2: Column selection with grouping and ordering
✅ **Implemented**
- `ColumnSelector` component groups columns by category (Basic Info, Classification, Pricing, Status, Timestamps, etc.).
- Groups are collapsible via `UnstyledButton` with chevron icon.
- Each group header has a tri-state checkbox (checked / indeterminate / unchecked) that toggles all columns in the group.
- `event.stopPropagation()` prevents checkbox clicks from triggering group expand/collapse.
- Column reordering mode allows moving selected columns up/down via `ActionIcon` buttons.
- `enforceAtLeastOneColumn()` ensures at least one column remains selected at all times.
- Session storage persists selected columns per entity type via `saveColumns()` / `loadSavedColumns()`.

### AC-3: Progress display with byte count
✅ **Implemented**
- `getProgressDisplay()` returns determinate progress (percentage + bytes) when `Content-Length` is available.
- Returns indeterminate progress (`animated` + `striped` `Progress` bar) when length is unknown.
- Displays formatted bytes (B / KiB / MiB) via `formatBytes()`.
- `readStreamingBlob()` reads the `ReadableStream` in chunks and reports incremental progress.

### AC-4: CSV and XLSX format support
✅ **Implemented**
- `FormatSelector` component allows toggling between CSV and XLSX.
- MIME types mapped: `text/csv;charset=utf-8` (CSV), `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` (XLSX).
- Large dataset warning shown for XLSX exports >50,000 rows recommending CSV.
- Export filename includes timestamp and entity type with correct extension.

### AC-5: Permission gate on inventory.items.READ
✅ **Implemented**
- `canShowInventoryExport()` checks `inventory.items` READ permission via `resolveEffectivePermissions()` + `actionGates()`.
- Export button visibility gated by permission mask.
- Negative test uses `mask=0` user — correctly denied.

### AC-6: Mobile-responsive layout
✅ **Implemented**
- `useMediaQuery("(max-width: 48em)")` detects mobile viewport.
- `getExportDialogLayout()` returns: `fullScreen: true`, `contentWrap: "wrap"`, `dividerOrientation: "horizontal"`, `actionsGrow: true` for mobile.
- Desktop uses `fullScreen: false`, `contentWrap: "nowrap"`, `dividerOrientation: "vertical"`.
- Actions use `grow={isMobile}` for stacked buttons on small screens.

---

## Files Modified / Created

### New Files
| File | Purpose |
|------|---------|
| `apps/backoffice/src/hooks/use-export.ts` | Core export hook with streaming, column management, retry |
| `apps/backoffice/src/hooks/use-export-columns.ts` | TanStack Query hook for dynamic export columns |
| `apps/backoffice/src/components/export-dialog.tsx` | Main export dialog component |
| `apps/backoffice/src/components/export-dialog-helpers.ts` | Scope chips, progress display, layout, warnings |
| `apps/backoffice/src/components/column-selector.tsx` | Grouped column selector with tri-state checkboxes |
| `apps/backoffice/src/components/format-selector.tsx` | CSV/XLSX format toggle |
| `apps/backoffice/src/lib/export-permissions.ts` | Permission gate for export visibility |
| `apps/backoffice/__test__/unit/export/export-dialog.test.ts` | Dialog behavior tests (6 tests) |
| `apps/backoffice/__test__/unit/export/download-progress.test.ts` | Download/streaming tests (5 tests) |
| `apps/backoffice/__test__/unit/export/use-export-columns.test.ts` | Column API tests (2 tests) |

### Modified Files
| File | Change |
|------|--------|
| `apps/backoffice/src/lib/api-client.ts` | `apiStreamingRequest()` for streaming blob downloads |

---

## Review History

### Round 1 — NO-GO
**Findings:**
1. **P1**: Large exports buffered entire response in memory before save — no streaming.
2. **P2**: Indeterminate progress not visually rendered.
3. **P2**: Tests covered only helper functions, no dialog/retry/permission tests.
4. **P2**: Date scope chip clear did not clear local date picker state.
5. **P3**: Group checkbox click triggered expand/collapse.

### Round 2 — Fixes Applied
1. **P1 Fixed**: Added optional File System Access API `showSaveFilePicker()` direct-to-disk streaming when available. Blob fallback preserved with explicit `Alert` warning for large/unknown-length exports.
2. **P2 Fixed**: `Progress` bar now uses `animated={indeterminate || streaming}` + `striped={indeterminate}` for unknown-length downloads.
3. **P2 Fixed**: Expanded test suite from 0 dialog tests to 13 total (2 column API + 6 dialog + 5 download). All pass.
4. **P2 Fixed**: `clearScopeFilter` / `clearAllScopeFilters` explicitly reset `dateFrom`/`dateTo` local state.
5. **P3 Fixed**: `event.stopPropagation()` on checkbox `onClick` and `onChange` handlers.

### Round 2 Verification — GO-WITH-FOLLOWUPS
- 13/13 tests passed ✅
- Lint passed (0 errors) ✅
- Typecheck passed ✅
- Build passed ✅

---

## Deferrable Follow-ups (P2)

| Item | Description | Priority |
|------|-------------|----------|
| F-1 | Attempt File System Access API direct-to-file for **all** large exports (not just unknown-length) when API is available | P2 |
| F-2 | Add rendered component interaction tests for `ExportDialog` (full mount with `@testing-library/react`) | P2 |
| F-3 | Add API real-DB integration tests for export endpoints (`/export/items`, `/export/prices`) | P2 |
| F-4 | Browser-level validation of large export with/without File System Access API | P2 |

---

## Sprint Status

- `67-3-pricing-management`: **done**
- `67-4-import-workflow-redesign`: **done**
- `67-5-export-workflow-redesign`: **done** ✅

All three stories in Epic 67 are now complete.
