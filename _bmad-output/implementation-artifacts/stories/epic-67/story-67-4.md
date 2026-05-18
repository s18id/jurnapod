# Story 67-4: Import Workflow Redesign — Upload → Map → Validate → Apply → Complete

Status: done

> ⚠️ **Sprint-Status Append-Only Rule (E45-A1 / E46-A1) — MANDATORY:**
> If this story modifies `_bmad-output/implementation-artifacts/sprint-status.yaml`:
> - **REQUIRED**: Run `npx tsx scripts/update-sprint-status.ts --epic 67 --story 67-4 --status done` (the canonical utility)
> - **REQUIRED**: After editing, run `npx tsx scripts/validate-sprint-status.ts` to confirm file integrity
> - **NEVER** replace the entire file — always append only
> - **NEVER** use `replaceAll` on epic section markers
> - If accidentally overwritten: `git checkout HEAD -- _bmad-output/implementation-artifacts/sprint-status.yaml`
> - **Retrospective workflow will check this before closing the epic** (E46-A4)

## Story

As a **company admin or inventory manager**,  
I want **to import items and prices via a staged workflow with preview, validation, and error handling**,  
So that **bulk data imports are safe, verifiable, and recoverable**.

## Context

The existing import flow in `items-page.tsx` and `prices-page.tsx` uses `ImportWizard` which loops row-by-row against `/inventory/items`. This is slow, error-prone, and doesn't leverage the backend's staged batch API.

The backend already exposes staged import endpoints:
- `POST /import/:entityType/upload` — Upload and parse file
- `POST /import/:entityType/validate` — Validate mapped data  
- `POST /import/:entityType/apply` — Apply validated import
- `GET /import/:entityType/template` — Download template

This story redesigns the import UI to use these staged endpoints, providing a safe, reviewable workflow.

**Dependencies:** Story 67-1 (EntityTable for validation report), Epic 65 (typed API client)

**Risk:** High — workflow has many stages and must align precisely with backend API contracts.

---

## Test Scenario Review Checkpoint (MANDATORY — E54-A1)

### Pre-Implementation Checklist

- [ ] **Happy paths identified:** Upload CSV → map columns → validate → apply with progress → view results → download errors
- [ ] **Error paths identified:** Invalid file type; parse errors; validation failures; network errors during any step; session expiry
- [ ] **Edge cases identified:** Empty CSV; CSV with only headers; very large CSV (>10K rows); special characters in data; multiline fields; different encodings
- [ ] **Test fixture needs identified:** Sample CSV files (valid, invalid, with errors); mock import sessions
- [ ] **Integration test scope defined:** End-to-end import flow with real backend; unit tests for each step component
- [ ] **Negative auth test role selected:** `CASHIER` for import apply (CASHIER lacks CREATE on inventory)

### Review Outcome

| Scenario | Type | Coverage Plan |
|----------|------|--------------|
| Upload valid CSV, preview first 5 rows | Happy | Unit |
| Map CSV columns to system fields | Happy | Unit |
| Validation passes, apply creates items | Happy | Integration (real DB) |
| Validation fails, report shows row-level errors | Error | Integration |
| Apply runs synchronously with XHR progress, shows result summary | Happy | Integration |
| Apply completes, client-side error CSV downloaded from result.errors | Happy | Unit |
| Network error during upload, retry without re-upload | Error | Unit |
| Invalid file type rejected | Error | Unit |
| Session expires mid-workflow | Error | Integration |
| CASHIER cannot apply import (403) | Error | Integration |

**Sign-off:** Test scenarios reviewed and approved before implementation begins.

---

## Cross-Module Error Boundary Verification (MANDATORY — E58-A1)

### Pre-Implementation Checklist

- [ ] Producer error classes: `ImportParseError`, `ImportValidationError`, `ImportSessionError` from backend
- [ ] Consumer catch paths: Step-specific error display; retry logic per step
- [ ] Fallback handling: Generic "Import failed" with step context
- [ ] Error response mapping: 400 → validation/parse error; 404 → session expired; 409 → duplicate data

### Verified Error Paths

| Producer Error | Consumer Handling | Fallback |
|----------------|-------------------|----------|
| Parse error (malformed CSV) | Upload step shows error with row number | Generic "Failed to parse file" |
| Validation error (invalid SKU) | Validation report shows row-level errors | Generic "Validation failed" |
| Session expired | User prompted to restart import | Generic "Session expired" |
| Apply conflict (duplicate SKU) | Apply step shows summary with conflict count | Generic "Some rows failed" |

---

## Acceptance Criteria

### AC1: Upload step
**Given** the import workflow is initiated  
**When** a valid CSV or XLSX file is selected  
**Then** `POST /import/items/upload` (or `/import/prices/upload`) is called  
**And** a preview of the first 5 rows is displayed  
**And** file type validation rejects non-CSV/XLSX files with a clear error

### AC2: Column map step
**Given** the upload completes successfully  
**When** the column map step loads  
**Then** detected CSV columns are shown with mapping dropdowns to system fields  
**And** unmapped columns show a warning  
**And** required fields (e.g., SKU, Name for items) are marked as required  
**And** the user can proceed only when all required fields are mapped

### AC3: Validate step
**Given** column mapping is complete  
**When** the user proceeds to validate  
**Then** `POST /import/items/validate` is called with the mapping  
**And** validation results are displayed:
- Valid rows count
- Invalid rows count  
- Row-level errors grouped by error category (e.g., "Missing SKU", "Invalid price", "Duplicate SKU")
- EntityTable shows validation report with sortable/filterable error rows

### AC4: Validation report
**Given** validation fails for some rows  
**When** the validation report is displayed  
**Then** each error row shows: row number, field values, error messages  
**And** errors are grouped by category with counts  
**And** the user can download the error CSV  
**And** the user can fix mapping issues and re-validate

### AC5: Apply step
**Given** validation passes (or user accepts warnings)  
**When** the user proceeds to apply  
**Then** a confirmation dialog shows affected counts: created, updated, skipped, failed  
**And** the user must confirm before proceeding  
**And** `POST /import/items/apply` is called

### AC6: Apply progress and completion
**Given** apply is confirmed  
**When** `POST /import/items/apply` is called via `applyWithProgress`  
**Then** XHR upload/download progress callbacks display a live progress bar (percentage and row count)  
**And** on completion, the result summary shows created/updated/skipped/failed counts inline  
**And** if `canResume` is true in the response, a "Resume from checkpoint" option is offered  
**And** a "Download Errors" button generates a client-side CSV from `result.errors` when `failed > 0`

### AC7: Session semantics and persistence
**Given** a network error occurs during any step  
**When** the error is displayed  
**Then** the user sees a "Retry" button  
**And** retry resumes from the current step without re-uploading the file  
**And** session TTL is respected (warn if < 60s remaining)  

**Given** a page refresh occurs during the import workflow (P1-2 Fix)  
**When** the page reloads  
**Then** the session ID is recovered from `sessionStorage`  
**And** the user resumes at the current step (Upload, Map, Validate, or Apply)  
**And** if the session has expired server-side, the user is prompted to restart

### AC8: Error CSV download
**Given** the import completes with some failed rows  
**When** the user clicks "Download Errors"  
**Then** a CSV file is generated client-side from `result.errors` and downloaded  
**And** the CSV includes row number, original field values, and error message columns  
**And** if validation errors exist (pre-apply), a separate validation-error CSV is generated from `validationResult.errors`

### AC9: Template download
**Given** the user wants to start an import  
**When** they click "Download Template"  
**Then** `GET /import/items/template` is called  
**And** a CSV template downloads with correct headers and sample row

### AC10: Permission gating
**Given** a user with `requireAccess({ module: 'inventory', resource: 'items', permission: 'CREATE' })` returning true  
**Then** the import workflow is accessible  

**Given** a user with `requireAccess({ module: 'inventory', resource: 'items', permission: 'CREATE' })` returning false  
**Then** the import workflow is hidden or disabled

### AC11: Mobile viewport (P2-10 Fix)
**Given** a mobile viewport (width <= 48em)  
**When** the import workflow loads  
**Then** each step renders in full-screen mode  
**And** file upload uses native file picker (not drag-and-drop zone)  
**And** column mapping shows one mapping row at a time with swipe navigation  
**And** validation report shows summary counts with "View details" expander  
**And** apply confirmation is a full-screen modal with clear CTA

---

## Technical Notes

### Files to Modify
- `apps/backoffice/src/features/items-page.tsx` — Replace `ImportWizard` modal with `StagedImportWorkflow`; remove inline `importConfig`
- `apps/backoffice/src/features/prices-page.tsx` — Same as items-page for prices entity
- `apps/backoffice/src/features/item-import-page.tsx` — Replace `ImportWizard` with `StagedImportWorkflow`
- `apps/backoffice/src/features/price-import-page.tsx` — Replace `ImportWizard` with `StagedImportWorkflow`
- `apps/backoffice/src/hooks/use-import.ts` — Extend `useImportWizard` with `sessionStorage` persistence, session validation on mount, and `fileHash` tracking

### Files to Create
- `apps/backoffice/src/features/import/staged-import-workflow.tsx` — Main workflow container orchestrating `useImportWizard` and step components
- `apps/backoffice/src/features/import/upload-step.tsx` — File upload, preview, and file-type validation
- `apps/backoffice/src/features/import/map-step.tsx` — Column mapping with required-field enforcement
- `apps/backoffice/src/features/import/validate-step.tsx` — Validation report with EntityTable integration
- `apps/backoffice/src/features/import/apply-step.tsx` — Confirmation dialog and synchronous apply with progress
- `apps/backoffice/src/features/import/error-csv-generator.ts` — Client-side CSV generation from `ApplyResult.errors` and `ValidationResult.errors`
- `apps/backoffice/src/__test__/unit/features/import/staged-import-workflow.test.tsx` — Workflow state machine tests
- `apps/backoffice/src/__test__/unit/features/import/upload-step.test.tsx` — Upload step unit tests
- `apps/backoffice/src/__test__/unit/features/import/apply-step.test.tsx` — Apply step unit tests

### Existing Files to Reuse (Do Not Duplicate)
- `apps/backoffice/src/hooks/use-import.ts` — Already provides `useUpload`, `useValidate`, `useApply`, `useGetTemplate`, and combined `useImportWizard`
- `apps/backoffice/src/components/import-column-mapper.tsx` — Already provides column mapping UI
- `apps/backoffice/src/components/import-validation-preview.tsx` — Already provides validation preview with client-side error CSV download
- `apps/backoffice/src/components/import-progress.tsx` — Already provides apply progress display
- `apps/backoffice/src/components/import-step-badges.tsx` — Already provides step indicator badges
- `apps/backoffice/src/lib/api-client.ts` — Already provides `uploadWithProgress`, `applyWithProgress`, `apiRequest`, `apiStreamingRequest`

### API Contracts (Verified Against Backend)
- `POST /import/:entityType/upload` — FormData with `file`; returns `{ uploadId, filename, rowCount, columns, sampleData, parseErrors? }`. Permission: `inventory.items.CREATE`.
- `POST /import/:entityType/validate` — Body: `{ uploadId, mappings: ColumnMapping[] }`; returns `{ totalRows, validRows, errorRows, errors: ValidationError[], validRowIndices, errorRowIndices }`. Permission: `inventory.items.CREATE`. Returns 404 if session expired.
- `POST /import/:entityType/apply` — Body: `{ uploadId, mappings, fileHash? }`; returns synchronous `ApplyResult` (`{ success, failed, created, updated, batchesCompleted, batchesFailed, rowsProcessed, failedAtBatch, rowsCommitted, canResume, resumed, skippedBatches, skippedRows, errors }`). Permission: `inventory.items.CREATE`. Returns 410 if session expiring imminently. Returns 409 if `fileHash` mismatch.
- `GET /import/:entityType/template` — Returns CSV file download. Permission: `inventory.items.READ`.

**Critical:** The `apply` endpoint is **synchronous** and does NOT create an operation record. Progress is tracked via `applyWithProgress` XHR callbacks, NOT SSE. There is NO `/operations/:id` route for import completion.

### State Machine
```
Upload → Map → Validate → Apply → Complete
  ↓       ↓        ↓         ↓
Error   Error   Error/Warn Error
  ↓       ↓        ↓         ↓
Retry   Retry   Re-map    Retry
```

**Note:** Apply is synchronous. Progress is shown via XHR callbacks during the request. On completion, the result is displayed inline. There is no separate "Track" step or operation record page for imports.

### Session Management (P1-2 Fix)
- `uploadId` stored in **sessionStorage** under key `jurnapod.import.{entityType}.uploadId` (survives page refresh, not browser close)
- On workflow mount: read `uploadId` from sessionStorage; call a lightweight validation or re-use the stored mapping to resume at the correct step
- Session TTL: 30 minutes (backend `SESSION_TTL_MS`)
- Warn user if session expires in < 60 seconds (backend returns 410 for imminent expiry)
- On session expiry: clear sessionStorage, show "Session expired" message, prompt to restart
- Store `fileHash` in sessionStorage alongside `uploadId` for resume integrity verification

---

## Tasks / Subtasks

> **Sequencing rule:** The existing row-by-row `ImportWizard` in `items-page.tsx` and `prices-page.tsx` MUST remain functional until the staged workflow is validated end-to-end. Do NOT remove old imports until Task 7 is complete.

### Phase 1: Foundation (preserve existing functionality)
1. **Verify backend contracts** — Run real requests against `POST /import/:entityType/{upload,validate,apply}` and `GET /import/:entityType/template` to confirm response shapes. Document any deviation from this story's API Contracts section.
2. **Extend `useImportWizard` hook** — Add `sessionStorage` read/write for `uploadId`, current step, and `fileHash`. On mount, recover session and call `GET` validation endpoint (or a lightweight session-exists check) to confirm session is still valid.
3. **Create `StagedImportWorkflow` container** — A new component in `apps/backoffice/src/features/import/` that orchestrates `useImportWizard`, `import-column-mapper`, `import-validation-preview`, and `import-progress`. It MUST NOT modify existing `ImportWizard`.

### Phase 2: Step components (new code only)
4. **Upload step** — File picker with `.csv`/`.xlsx` validation, drag-and-drop (desktop), native picker (mobile). Uses `useUpload` hook. Shows first 5 rows preview.
5. **Map step** — Column mapping UI. Reuse or extend `import-column-mapper.tsx`. Required field enforcement. Proceed blocked until all required fields mapped.
6. **Validate step** — Uses `useValidate` hook. Displays `ValidationResult` with valid/invalid counts. Reuse or extend `import-validation-preview.tsx` for error grouping and client-side error CSV download.
7. **Apply step** — Confirmation dialog with counts. Uses `useApply` with `applyWithProgress` XHR callback for progress display. On completion, show `ApplyResult` summary inline (not routed to `/operations/:id`). Client-side error CSV generation from `result.errors`.

### Phase 3: Integration (switchover)
8. **Wire `items-page.tsx`** — Replace `ImportWizard` modal content with `StagedImportWorkflow`. Remove inline `importConfig` object; the staged workflow uses backend field definitions from `GET /import/items/template`.
9. **Wire `prices-page.tsx`** — Same as above for prices entity type.
10. **Wire `item-import-page.tsx` and `price-import-page.tsx`** — Replace `ImportWizard` with `StagedImportWorkflow` so dedicated import routes also use staged flow.

### Phase 4: Hardening
11. **Permission gating** — Verify `permissionGates.CREATE` (items) or `permissionGates.UPDATE` (prices) before rendering import trigger. Negative test with `CASHIER` role.
12. **Mobile viewport** — Full-screen step layout, swipe navigation for mapping, summary expanders for validation. Use `useMediaQuery('(max-width: 48em)')`.
13. **Session resume edge cases** — Page refresh mid-apply: show progress recovery or prompt restart. Session expiry mid-workflow: clear `sessionStorage` and show restart prompt.

### Phase 5: Cleanup (only after validation)
14. **Remove old `ImportWizard` from items/prices pages** — Delete inline `importConfig` objects and `ImportWizard` imports once staged flow passes integration tests.
15. **Deprecate old utilities** — Mark `items-import-utils.ts`, `item-prices-import-utils.ts`, `item-groups-import-utils.ts`, `supplies-import-utils.ts` for deletion in a future cleanup story if they are no longer referenced.

---

## Risk Register

| Risk ID | Severity | Description | Mitigation |
|---------|----------|-------------|------------|
| R67-4-001 | P1 | Backend import API contract may differ from documentation | **Verified 2026-05-18:** `apply` returns synchronous `ApplyResult`, NOT `{ operationId }`. `useApply` with `applyWithProgress` XHR callback is the canonical progress path. Dev agent MUST re-verify before coding. |
| R67-4-002 | P1 | Large file uploads may timeout or exceed memory | Use `uploadWithProgress` (already exists in `api-client.ts`); show progress bar for upload. Backend limit is 50MB. |
| R67-4-003 | P2 | CSV parsing edge cases (encoding, delimiter, multiline) | Backend parser (`parseFileSync`) handles this; frontend validates file extension only. |
| R67-4-004 | P2 | No async job / SSE for import apply | **Accepted:** Apply is synchronous with XHR progress. No SSE fallback needed for import. Export (Story 67-5) uses SSE. |
| R67-4-005 | P2 | Existing import utilities (`items-import-utils.ts`, etc.) may conflict | Remove or deprecate old utilities after new workflow is validated (Task 15). |
| R67-4-006 | P2 | Session lost on page refresh | Store `uploadId` in `sessionStorage`, recover on mount (Task 2). Backend sessions have 30-minute TTL with checkpoint resume. |
| R67-4-007 | P2 | Old `ImportWizard` still referenced by standalone import pages | Task 10 updates `item-import-page.tsx` and `price-import-page.tsx` to use staged flow. |

---

## Dev Notes / Technical Constraints

### Permission Gate
- The import workflow MUST check `permissionGates.CREATE` (items) or `permissionGates.UPDATE` (prices) before rendering the import trigger button
- The backend `POST /import/:entityType/upload` and `POST /import/:entityType/validate` and `POST /import/:entityType/apply` endpoints all enforce `requireAccess({ module: 'inventory', resource: 'items', permission: 'CREATE' })`
- Negative auth tests MUST use `CASHIER` role (lacks CREATE on inventory.items) per AGENTS.md

### sessionStorage Resume Semantics
- Key: `jurnapod.import.{entityType}.uploadId`
- Additional key: `jurnapod.import.{entityType}.fileHash` (for integrity verification on resume)
- Additional key: `jurnapod.import.{entityType}.step` (current step name for UI recovery)
- On workflow mount: read keys → if `uploadId` exists, validate by calling `POST /import/{entityType}/validate` with the stored mapping, or show "Resume import?" prompt
- On apply success or explicit cancel: clear all import-related sessionStorage keys
- On session 404 or 410 from backend: clear sessionStorage and show "Session expired — restart required"

### SSE → Polling Fallback
- **Not applicable for import apply.** The `apply` endpoint is synchronous; progress comes from `applyWithProgress` XHR callbacks.
- Story 67-5 (Export) uses SSE/polling. Do NOT mix import and export progress mechanisms.

### Mobile Behavior
- Use `useMediaQuery('(max-width: 48em)')` for mobile detection
- Mobile upload: use native `<input type="file">` instead of drag-and-drop zone
- Mobile mapping: show one mapping row at a time with Previous/Next buttons (not swipe — keep it simple)
- Mobile validation: summary counts with "View details" expander (Mantine `Collapse`)
- Mobile apply confirmation: full-screen modal with single primary CTA

### Backend Contract Assumptions to Verify Before Coding
1. Confirm `POST /import/:entityType/upload` response shape: `{ uploadId, filename, rowCount, columns, sampleData }`
2. Confirm `POST /import/:entityType/validate` accepts `{ uploadId, mappings: Array<{sourceColumn, targetField}> }`
3. Confirm `POST /import/:entityType/apply` accepts `{ uploadId, mappings, fileHash? }` and returns `ApplyResult` (not `{ operationId }`)
4. Confirm `GET /import/:entityType/template` returns CSV with `Content-Disposition: attachment`
5. Confirm backend session TTL is 30 minutes and checkpoint resume works across page refreshes

### Asset Reuse Checklist
Before creating any new component, verify these existing assets:
- [ ] `use-import.ts` — Has `useUpload`, `useValidate`, `useApply`, `useGetTemplate`, `useImportWizard`
- [ ] `import-column-mapper.tsx` — Column mapping UI with auto-detection
- [ ] `import-validation-preview.tsx` — Validation preview with error grouping and CSV download
- [ ] `import-progress.tsx` — Progress ring and result summary for apply
- [ ] `import-step-badges.tsx` — Step indicator

---

## Testing Notes

### Unit Tests (Frontend Only — No DB)
Unit tests for pure UI logic, hooks state machines, and client-side CSV generation:
- `__test__/unit/features/import/staged-import-workflow.test.tsx` — Step transitions, sessionStorage read/write, reset behavior
- `__test__/unit/features/import/upload-step.test.tsx` — File type validation, preview rendering, drag-and-drop vs native picker
- `__test__/unit/features/import/apply-step.test.tsx` — Confirmation dialog, progress display, result summary, client-side CSV generation
- `__test__/unit/features/import/error-csv-generator.test.ts` — CSV formatting, escaping, header correctness

**Test runner:** `npm run test:unit -w @jurnapod/backoffice`

### API Integration Tests (Real DB Required)
The backend import endpoints MUST be tested with real DB. These tests belong in the API package, NOT the backoffice package:
- `apps/api/__test__/integration/import/upload.test.ts` — Upload parsing, session creation, file type rejection
- `apps/api/__test__/integration/import/validate.test.ts` — Validation logic, FK batch checks, error grouping
- `apps/api/__test__/integration/import/apply.test.ts` — Batch apply, checkpoint resume, file hash verification, permission denial with CASHIER

**Test runner:** `npm run test:single -w @jurnapod/api -- __test__/integration/import/{file}.test.ts`

### Backoffice E2E Tests
- Use Playwright for full user journey: upload → map → validate → apply → view results
- Test mobile viewport (≤48em) for each step
- Test session recovery after page refresh

**Test runner:** `npm run qa:e2e -w @jurnapod/backoffice -- --grep "import"`

### Validation Commands
```bash
# Pre-flight (run before any commit)
npm run lint -w @jurnapod/backoffice
npm run typecheck -w @jurnapod/backoffice
npm run build -w @jurnapod/backoffice

# Unit tests
npm run test:unit -w @jurnapod/backoffice

# API integration tests (real DB)
npm run test:single -w @jurnapod/api -- __test__/integration/import/upload.test.ts
npm run test:single -w @jurnapod/api -- __test__/integration/import/validate.test.ts
npm run test:single -w @jurnapod/api -- __test__/integration/import/apply.test.ts

# E2E
npm run qa:e2e -w @jurnapod/backoffice -- --grep "import"
```

**Important:** Per AGENTS.md Database Testing Policy, any DB-backed test MUST use a real database. Mock DB for business logic tests is a P0 blocker. The backoffice package does not run DB-backed tests; those live in `apps/api/__test__/integration/`.

---

## Story Points
**13 points** (high complexity — multi-step workflow with precise backend alignment)

---

## Definition of Done

- [ ] All acceptance criteria implemented with evidence
- [ ] API integration tests for upload/validate/apply endpoints pass with real DB (`apps/api/__test__/integration/import/`)
- [ ] Backoffice unit tests for each workflow step pass (`apps/backoffice/__test__/unit/features/import/`)
- [ ] Error path tests for each step (validation failure, network error, session expiry)
- [ ] XHR progress callback verified during apply (no SSE — import apply is synchronous)
- [ ] Permission gating verified with CASHIER negative tests (403 on upload/validate/apply)
- [ ] Client-side error CSV generation verified
- [ ] Session recovery after page refresh verified
- [ ] Mobile viewport behavior verified (full-screen steps, native file picker)
- [ ] `npm run typecheck -w @jurnapod/backoffice` passes
- [ ] `npm run build -w @jurnapod/backoffice` passes
- [ ] Code review completed with no blockers
- [ ] Story completion report created (`story-67-4.completion.md`) with reviewer GO and owner sign-off

---

_Last Updated: 2026-05-18 (prepared by @bmad-sm)_
