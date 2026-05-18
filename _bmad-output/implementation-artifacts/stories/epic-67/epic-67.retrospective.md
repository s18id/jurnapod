# Epic 67 Retrospective — Backoffice Catalog Operations: Items, Prices, Import/Export Redesign

**Epic:** 67  
**Status:** done  
**Date:** 2026-05-18  
**Facilitator:** bmad-review

---

## Step 0 — Validation Gate

| Gate | Result | Evidence |
|------|--------|----------|
| Sprint status validation | ✅ PASS | `npx tsx scripts/validate-sprint-status.ts` returned healthy status after `epic-67: done` |
| Story completion authority | ✅ PASS | Stories 67-1 through 67-5 each have reviewer GO and owner sign-off |
| Completion reports | ✅ PASS | `story-67-3.completion.md` through `story-67-5.completion.md` exist |
| Scope freeze | ✅ PASS | `apps/pos` remained untouched during Epic 67 implementation |
| P0/P1 unresolved count | ✅ PASS | 0 unresolved P0/P1 findings at epic close |

---

## 1) Epic Objective and Outcome Summary

### Objective

Deliver data-dense item and pricing management with bulk import/export redesigned to align with the backend's API model. Consume shared EntityTable, FilterBar, DetailDrawer, and ScopeBadge primitives from Epic 65.

### Outcome

**All 5 stories completed, signed off, and verified.**

- **67-1 Catalog Table Configurations** — EntityTable/FilterBar/DetailDrawer integration for catalog surfaces
- **67-2 Items List and Detail** — Items management with search, filter, sort, pagination, outlet scope
- **67-3 Pricing Management** — Default vs outlet override visibility with visual distinction, deterministic ordering
- **67-4 Import Workflow Redesign** — Staged upload → map → validate → apply with sessionStorage recovery and error CSV
- **67-5 Export Workflow Redesign** — Scope selection → synchronous streaming download with progress, CSV/XLSX support

### Delivery Metrics

| Metric | Value |
|--------|-------|
| Stories completed | 5/5 (100%) |
| Unit tests added | 30 (9 pricing + 8 import + 13 export) |
| P0 findings resolved | 0 |
| P1 findings resolved | 1 (export large-file memory buffering) |
| P2 findings resolved | 6 (progress display, test coverage, date clearing, group checkbox, permission gates, mobile layout) |
| Review cycles required | 2 (67-5 required NO-GO → fix → GO-WITH-FOLLOWUPS) |

---

## 2) Story Completion Table

| # | Story | Tests | Key Outcomes | Risk |
|---|-------|-------|-------------|------|
| 67.1 | Catalog Table Configurations | — | EntityTable/FilterBar/DetailDrawer integrated for catalog; column chooser, pagination, sort | Low |
| 67.2 | Items List and Detail | — | Server-side paginated items list; detail drawer with pricing and outlet overrides | Low |
| 67.3 | Pricing Management | 9 | Default vs outlet override visual distinction; deterministic all-outlets column ordering; override-only scope filter; explicit "Overrides Only" label | Medium |
| 67.4 | Import Workflow Redesign | 8 | Staged upload → map → validate → apply; sessionStorage recovery; permission gates; error CSV download; byte-level progress | High |
| 67.5 | Export Workflow Redesign | 13 | Synchronous streaming export; dynamic column selection with grouping; CSV/XLSX format; File System Access API direct-to-disk fallback; mobile-responsive dialog | Medium |

---

## 3) What Went Well

1. **Price resolution extracted to pure functions** — `features/prices/price-resolution.ts` contains pure, testable logic for resolving effective prices (default vs override). Nine unit tests cover all combinations: default-only, override-present, missing-default, all-outlets ordering. No React hooks or DB dependencies in the core logic.

2. **Export simplified from async job+SSE to synchronous streaming** — The epic spec originally required "async job → SSE progress → download" (FR67-8, FR67-9). During implementation, we discovered the backend export endpoints support synchronous streaming (`apiStreamingRequest`). The implementation was simplified to: scope selection → immediate streaming download with byte progress. This eliminated unnecessary async job infrastructure, SSE reconnection logic, and polling fallbacks. The KISS principle was explicitly applied.

3. **Import session recovery with sessionStorage** — The staged import workflow persists upload session ID and current step in `sessionStorage`. Users can refresh the page or close the browser and resume without re-uploading. Recovery normalizes to a safe step (mapping) rather than resuming into blocked states.

4. **Component reuse across import and export** — `ColumnSelector` (grouped checkboxes with tri-state group headers) is reused between import column mapping and export column selection. `ExportDialog` and `ImportWizard` both consume the same permission gate (`canShowInventoryExport`). This DRY pattern reduced duplicate code.

5. **Reviewer NO-GO caught real issues before sign-off** — Story 67-5's initial review identified a P1 memory risk (large exports buffered entirely in browser memory) and multiple P2 UX issues (indeterminate progress, date clearing, group checkbox behavior). All were resolved in Round 2. The adversarial review process prevented these from reaching production.

6. **All permission gates use canonical `inventory.items` resource** — Export visibility, import access, and pricing management all gate on `inventory.items.READ/CREATE/UPDATE/DELETE` via `resolveEffectivePermissions()` + `actionGates()`. No legacy module-only permissions or hardcoded role checks.

---

## 4) What Didn't Go Well — Root Cause Analysis

### 4.1 Backend contract mismatch: async job vs synchronous streaming (67-5)

**Symptom:** The epic spec (FR67-8, FR67-9) and story AC explicitly required "async job → SSE progress → download." The initial implementation followed this model. During review, we discovered the backend `/export/*` endpoints return synchronous streaming responses, not async job IDs. The first review round (NO-GO) flagged that the async job model was over-engineered for the actual API contract.

**Root cause:** The epic spec was written against an assumed backend capability (async export jobs with SSE) that does not match the actual implementation. The backend supports synchronous streaming with `Content-Length` or chunked transfer. No precondition verified the export endpoint contract before story specification.

**Mitigation:** Story 67-5 was redesigned to use synchronous streaming with `apiStreamingRequest()`. Progress is derived from `ReadableStream` chunk counts or `Content-Length` headers. File System Access API (`showSaveFilePicker`) provides optional direct-to-disk streaming for large exports.

**Lesson:** Before writing story specs for bulk operations, verify the backend endpoint contract with a technical spike or API inspection. Do not assume async job / SSE patterns exist without evidence.

### 4.2 Review cycle overhead (67-5)

**Symptom:** Story 67-5 required two full review cycles: initial NO-GO with 1 P1 + 3 P2 + 1 P3 findings, followed by fix implementation and targeted re-review.

**Root cause:** The first-pass implementation focused on helper functions and basic dialog structure but did not address: (a) large-export memory behavior, (b) indeterminate progress UX, (c) test coverage for dialog behavior, (d) date picker state clearing. These were implementation gaps, not spec ambiguities.

**Mitigation:** All findings were resolved in Round 2. Test suite expanded from 0 to 13 tests. Memory risk mitigated with File System Access API fallback + explicit warning.

**Lesson:** For workflow stories with multiple states (preparing → streaming → complete → error), verify each state renders correctly before requesting review. Do not rely solely on helper function tests for workflow stories.

### 4.3 Epic 66 action items not addressed

**Symptom:** Epic 66 retro generated two P2 action items (dedicated `platform.audit` ACL resource; OpenAPI query parameter alignment). Neither was addressed during Epic 67.

**Root cause:** Epic 67 scope (catalog operations) does not touch audit or generic query parameter contracts. Action items were correctly deferred but should have been explicitly carried forward with updated deadlines.

**Lesson:** Retro action items that are not in-scope for the next epic must be explicitly re-assigned to a future epic or backlog with owner and deadline. Silent deferral creates orphan action items.

---

## 5) Epic 66 Action Item Follow-Through

| # | Action Item | Owner | Deadline | Status | Evidence |
|---|-------------|-------|----------|--------|----------|
| E66-A1 | Introduce dedicated `platform.audit` ACL resource | Architecture team | Epic 67 kickoff | 📋 **DEFERRED** | Out of scope for Epic 67 (catalog operations). No audit functionality was modified. Must be addressed when audit-related epic is approved. |
| E66-A2 | Align generated OpenAPI query parameter types with runtime Zod validation for generic audit list filters | API platform team | Epic 67 pre-close | 📋 **DEFERRED** | Out of scope for Epic 67. No audit query parameters were modified. |

---

## 6) Risk/Findings Resolution Summary

| ID | Severity | Description | Disposition |
|----|----------|-------------|-------------|
| R67-001 | P1 | Catalog table configurations with many columns may be slow to render | ✅ MITIGATED — EntityTable column virtualization not needed; 15-column pricing table renders without lag |
| R67-002 | P1 | Import workflow steps require precise backend contract alignment | ✅ FIXED — Staged import endpoints verified; upload/map/validate/apply flow matches backend |
| R67-003 | P1 | SSE progress may not be available for all import/export flows | ✅ CLOSED — Export does not use SSE; uses synchronous streaming. Import uses synchronous apply (no SSE). |
| R67-004 | P2 | CSV parsing edge cases | ✅ MITIGATED — PapaParse used for client-side parsing; server validates encoding |
| R67-005 | P2 | Export scope with large datasets may time out | ✅ MITIGATED — File System Access API provides direct-to-disk streaming; Blob fallback shows explicit warning |
| F67-001 | P1 | Export buffered entire response in memory (Blob fallback) | ✅ FIXED — `streamResponseToFile()` uses `showSaveFilePicker` when available; warning shown for Blob fallback |
| F67-002 | P2 | Indeterminate progress not rendered | ✅ FIXED — `Progress` bar uses `animated` + `striped` for unknown-length streams |
| F67-003 | P2 | Tests covered helpers only | ✅ FIXED — Expanded to 13 tests covering dialog behavior, download progress, permissions, retry |
| F67-004 | P2 | Date scope chip clear didn't clear date picker | ✅ FIXED — `clearScopeFilter` / `clearAllScopeFilters` reset local `dateFrom`/`dateTo` state |
| F67-005 | P3 | Group checkbox triggered expand/collapse | ✅ FIXED — `event.stopPropagation()` on checkbox handlers |

---

## 7) Sprint 67 SOLID/DRY/KISS Gate

### Kickoff Baseline (2026-05-16)

| Principle | Score | Evidence |
|-----------|-------|----------|
| SOLID | Pass | Pricing resolution extracted to pure functions; hooks focused (useExport, useExportDialog, useExportColumns) |
| DRY | Pass | ColumnSelector reused across import/export; export helpers pure and shared |
| KISS | Unknown | Spec assumed async job+SSE complexity; actual API supports simpler synchronous streaming |

### Pre-Close Re-Score (2026-05-18)

#### SOLID
- **SRP:** Pass — `useExport` manages configuration state; `useExportDialog` manages dialog execution; `price-resolution.ts` manages price logic. No cross-responsibility leakage.
- **OCP:** Pass — Export format support (CSV/XLSX) extended via configuration, not modification. New formats addable without changing download logic.
- **LSP:** Pass — No subtype replacement in this epic; components composed via props/hooks.
- **ISP:** Pass — `ExportColumn` interface is focused (key, header, group, fieldType). No monolithic export config interface.
- **DIP:** Pass — Dialog components depend on hook interfaces, not concrete implementations.

#### DRY
- **Business logic dedup:** Pass — `buildExportScopeChips`, `getProgressDisplay`, `formatBytes` extracted to shared helpers. Price resolution logic in single pure function file.
- **Component dedup:** Pass — `ColumnSelector` used by both import and export workflows. `FormatSelector` reusable.
- **Permission dedup:** Pass — `canShowInventoryExport()` gates all inventory export surfaces via canonical ACL.
- **Fixture dedup:** N/A — No new DB-backed tests in Epic 67 (all unit tests with mocked API).

#### KISS
- **No over-engineering:** Pass — Export simplified from async job+SSE to synchronous streaming. Direct-to-file via File System Access API is optional, not mandatory.
- **Readable over clever:** Pass — Progress display uses explicit phase enum (`"preparing" | "streaming" | "complete" | "error"`). No nested ternary state machines.
- **Small interfaces:** Pass — `ExportConfig` has 4 fields; `ExportFilters` has 9 optional fields. No interface bloat.
- **Flat over nested:** Pass — No inheritance patterns; hooks compose via function calls.
- **Deferred complexity:** Pass — File System Access API is feature-detected, not polyfilled. Blob fallback handles unsupported browsers.

#### Risk Gate
| Gate | Status |
|------|--------|
| Unresolved P0 count | 0 |
| Unresolved P1 count | 0 |
| Verdict | ✅ **GO** |

---

## 8) Action Items (MAX 2 — E46-A2)

### Action Item 1
**Verify backend bulk operation endpoint contracts before story specification**
**Owner:** Architecture (bmad-architect)
**Deadline:** Epic 68 kickoff
**Success criterion:** For any story involving import/export/bulk operations, a technical spike or API inspection document confirms the endpoint contract (sync vs async, streaming vs buffered, SSE vs polling) before AC are written. No story may assume async job / SSE without explicit backend evidence.

### Action Item 2
**Add rendered component interaction tests for ExportDialog and ImportWizard**
**Owner:** QA (bmad-qa)
**Deadline:** Epic 68 pre-close
**Success criterion:** `@testing-library/react` tests exist for `ExportDialog` and `ImportWizard` that verify: dialog open/close, column selection/deselection, format toggle, progress state rendering, error retry, and permission-denied state. All tests pass in CI.

### Backlog Note

The following candidates were identified but **not committed** (exceeds 2-item cap per E46-A2):

- **Add API real-DB integration tests for export endpoints (`/export/items`, `/export/prices`)** — Currently only unit-tested with mocked API. Owner: bmad-dev. Priority: P2.
- **Add browser-level validation of large export with/without File System Access API** — Manual or automated browser test for 10,000+ row export. Owner: bmad-qa. Priority: P2.
- **Address Epic 66 action items (E66-A1, E66-A2)** — `platform.audit` ACL resource and OpenAPI alignment remain deferred. Owner: Architecture. Priority: P2.

---

## 9) Epic 68 Preparation

### Next Epic Overview

Epic 68 scope is **not yet defined** in the active sprint backlog. The Architecture-First freeze remains in effect for `apps/backoffice` and `apps/pos`. The next approved epic will be determined by the program steering committee.

### Critical Carry-Forwards

| # | Item | Owner | Priority | Rationale |
|---|------|-------|----------|-----------|
| 1 | Verify backend contract before spec writing | Architecture | P1 | Prevents another 67-5 style contract mismatch |
| 2 | Rendered component tests for dialog workflows | QA | P2 | Closes test gap identified in 67-5 review |
| 3 | Epic 66 deferred action items (`platform.audit`, OpenAPI alignment) | Architecture | P2 | Orphan action items from prior epic |

### Pre-Flight Gate Checklist (for next epic)

```bash
npm run lint -w @jurnapod/backoffice          # Must pass with 0 errors
npm run typecheck -w @jurnapod/backoffice      # Must pass
npm run build -w @jurnapod/backoffice          # Must pass
npx tsx scripts/validate-sprint-status.ts      # Must exit 0
```

---

## 10) Team Acknowledgements

| Role | Agent | Contribution |
|------|-------|-------------|
| Developer | bmad-dev | Story implementation for 67-3, 67-4, 67-5 |
| Reviewer | bmad-review | Adversarial code review with NO-GO → GO-WITH-FOLLOWUPS for 67-5 |
| Story Owner | Ahmad | Sign-off on all 5 stories |

---

## 11) Sign-Off

### Epic 66 Action Item Follow-Through Summary

| # | Action Item | Deadline | Status | Notes |
|---|-------------|----------|--------|-------|
| E66-A1 | `platform.audit` ACL resource | Epic 67 kickoff | 📋 DEFERRED | Out of scope for catalog operations |
| E66-A2 | OpenAPI query parameter alignment | Epic 67 pre-close | 📋 DEFERRED | Out of scope for catalog operations |

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Facilitator | bmad-review | 2026-05-18 | ✅ |
| Story Owner | Ahmad | 2026-05-18 | ✅ |

---

_Last Updated: 2026-05-18T21:45:00Z_
_Retrospective Status: ✅ complete_
