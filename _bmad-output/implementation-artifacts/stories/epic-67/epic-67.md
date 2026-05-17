# Epic 67: Catalog Operations — Items, Prices, Import/Export Redesign

**Status:** planned (queued — requires explicit backoffice unfreeze before execution)
**Sprint/Timebox:** Weeks 5–6 (of Backoffice Frontend Program)
**Theme:** Data-dense item and pricing management with bulk import/export redesigned to align with the backend's staged batch API model. This epic consumes the shared EntityTable, FilterBar, DetailDrawer, and ScopeBadge primitives from Epic 65.
**Primary Modules:** `apps/backoffice`, `packages/modules/inventory`
**Predecessor:** Epic 65 (Foundation) — requires typed API client, shell, router, TanStack Query
**Exit Gate:** Items and prices list/detail fully functional with outlet-override visibility; import workflow follows upload → map → validate → apply → track; export uses async job model; EntityTable and FilterBar primitives documented and reusable; all tests pass.

---

## 1) Charter

### 1.1 Program Alignment

Epic 67 delivers the highest-leverage backoffice throughput surfaces identified in the research report: inventory catalog management and bulk data operations. The shared data-grid primitives from Epic 65 become the standard pattern for catalog list/detail views and later domain screens.

### 1.2 What We Know

- The backend already exposes `/api/inventory/items`, `/api/inventory/item-prices`, and staged import/export endpoints (`/api/import/*`, `/api/export/*`)
- Epic 65 provides the shared EntityTable/FilterBar/DetailDrawer primitives built on TanStack Table 8.x
- The existing import flow still loops row-by-row against `/inventory/items` — this MUST be redesigned to use the staged batch API
- The backend has operation progress endpoints with SSE support
- Pricing has outlet-level overrides: `item_prices.outlet_id` — the UI MUST make "default vs outlet override" a visible state space

### 1.3 Non-Goals

- No changes to backend import/export logic (frontend aligns to existing API)
- No new pricing features (bulk repricing, price lists — these are future scope)
- No recipe/BOM management UI in this epic (deferred)
- No inventory stock movement screens (may be addressed in future epic)
- No sales, dine-in, customer admin, or POS support domain screens — deferred to a future approved backoffice domain program

---

## 2) Requirements Inventory

### Functional Requirements

| FR | Statement | Story |
|----|-----------|-------|
| FR67-1 | Catalog pages MUST consume the shared EntityTable, FilterBar, DetailDrawer, and ScopeBadge primitives from Epic 65 without inline duplicate table/drawer/filter implementations | 67-1 |
| FR67-2 | Catalog table configurations MUST define columns, filters, saved views, bulk actions, and detail drawer content for items and prices | 67-1 |
| FR67-3 | Catalog workflows MUST preserve loading, empty, error, and permission-denied states through the shared primitives | 67-1 |
| FR67-4 | The items list/detail MUST show: search, filter (by type, status, outlet), pagination, column chooser, scope badge | 67-2 |
| FR67-5 | The items detail view MUST show: general info, pricing (default + outlet overrides), status | 67-2 |
| FR67-6 | The pricing view MUST visually distinguish default prices from outlet-specific overrides | 67-3 |
| FR67-7 | The import workflow MUST follow: upload file → preview columns → server-side validation → validation report → apply → server-tracked job → downloadable error CSV | 67-4 |
| FR67-8 | The export workflow MUST follow: select scope → submit async job → SSE progress → download result | 67-5 |
| FR67-9 | Every expensive operation (import, export) MUST route users to an operation record with live progress | 67-4, 67-5 |

### Non-Functional Requirements

| NFR | Statement | Validation |
|-----|-----------|------------|
| NFR67-1 | EntityTable MUST render 100 rows without noticeable lag (> 30fps) | Performance test |
| NFR67-2 | FilterBar MUST NOT fire a network request on every keystroke — debounce of 300ms minimum | Code review |
| NFR67-3 | Import validation report MUST display row-level errors grouped by category | Manual verification |
| NFR67-4 | Export download MUST preserve UTF-8 encoding and CSV format | File inspection |

---

## 3) Story Breakdown

### Story 67-1 — Catalog table configurations and primitive integration

**Status:** planned
**Type:** feature foundation
**Risk:** Medium
**Dependencies:** Epic 65 (EntityTable, FilterBar, DetailDrawer, ScopeBadge, TanStack Query, typed API client)

Configure and harden catalog usage of the shared admin primitives:
- Item and price table column definitions
- Catalog filters and saved views
- Bulk action toolbar definitions
- DetailDrawer content mapping for item and price rows
- Permission-denied and scope-sensitive states
- Catalog-specific examples in component usage docs

**Acceptance Criteria:**
- Given a list of items, EntityTable renders with the correct columns, pagination controls, and sort indicators
- Given a search term in FilterBar, after 300ms debounce, the table fires a filtered API request
- Given a sortable column header is clicked, the table fires a sorted API request and shows the sort direction
- Given the column chooser, checking/unchecking columns shows/hides them immediately; visibility persists on reload
- Given a row is clicked, DetailDrawer opens and displays the row data in a vertical layout
- Given an empty result set, the table renders a Mantine Empty state
- Given an API error, the table renders a Mantine Alert with error message
- Given row selection, the bulk action toolbar appears with configurable action buttons
- Given the implementation is audited, no inline duplicate data-grid/filter/drawer implementation exists in catalog features
- Unit tests verify: column rendering, sort/filter URL sync, selection state, drawer open/close

---

### Story 67-2 — Items list and detail

**Status:** planned
**Type:** feature
**Risk:** Low
**Dependencies:** 67-1 (EntityTable, FilterBar, DetailDrawer), Epic 65 (typed API client for `/api/inventory/items`)

Implement items management using the primitives from 67-1:
- List: EntityTable with columns for SKU, name, type (PRODUCT/INGREDIENT/RECIPE/SERVICE), scope (default/outlet), status (active/inactive), updated timestamp
- FilterBar: search (name/SKU), type dropdown, status dropdown, outlet selector
- DetailDrawer: item SKU, name, type, status, default price, outlet override count
- Detail page (full navigation): item general info card, pricing section (default + outlet overrides), recipe ingredients (read-only for now), audit trail link
- Create/edit form: name, SKU, type, status, tax category, unit of measure
- TanStack Query caching with invalidation on create/update

**Acceptance Criteria:**
- Given the items page, the EntityTable loads items from `/api/inventory/items` with server-side pagination
- Given the FilterBar, searching by SKU prefix returns filtered results via API
- Given a PRODUCT item, the detail page shows pricing info and default price
- Given an INGREDIENT item, the detail page shows stock tracking status
- Given a new item is created, the list refreshes automatically
- Given an item is deactivated, it shows an "Inactive" status chip

---

### Story 67-3 — Pricing management: default vs outlet override visibility

**Status:** planned
**Type:** feature
**Risk:** Medium
**Dependencies:** 67-2 (items detail), Epic 65 (typed API client for `/api/inventory/item-prices`)

Implement pricing views that make "default vs outlet override" a visible state:
- Price list: shows all items with their default price and outlet-specific overrides in adjacent columns
- Price override editor: inline editing or drawer for setting outlet-specific price for an item
- Visual distinction: default price shown in normal weight; outlet override shown with a "pinned" icon and different background
- ScopeBadge indicates whether viewing default prices or outlet-specific prices
- TanStack Query caching with invalidation on price update

**Acceptance Criteria:**
- Given an item with a default price of 10000 and an outlet override of 12000, the list shows both values with visual distinction
- Given the outlet scope is changed to "Main", only prices scoped to Main and default prices are shown
- Given a price override is set, the list updates without full page reload
- Given a price override is removed (reverting to default), the override column shows "—" or "Default"
- Unit tests verify: outlet override resolution logic, visual state mapping

---

### Story 67-4 — Import workflow redesign: upload → map → validate → apply → track

**Status:** planned
**Type:** feature
**Risk:** High (workflow has many stages; must align precisely with backend API)
**Dependencies:** 67-1 (EntityTable for validation report display), Epic 65 (typed API client for import endpoints)

Implement the staged import workflow matching the backend's batch API:
1. **Upload step:** file selector with type validation (.csv, .xlsx), drag-and-drop zone
2. **Column map step:** preview first N rows, allow user to map CSV columns to system fields, show unmapped columns warning
3. **Validate step:** calls server-side validation endpoint, displays validation report in an EntityTable with row-level errors grouped by category
4. **Apply step:** confirmation dialog showing affected counts (created/updated/skipped/failed); submits async job
5. **Job tracking step:** routes user to the operation record with live SSE progress; shows created/updated/skipped/failed counts on completion
6. **Download errors step:** link to download error CSV for rows that failed validation

**Acceptance Criteria:**
- Given a valid CSV file, the upload step shows a preview of the first 5 rows
- Given an upload completes, the column map step shows detected columns with mapping dropdowns
- Given validation fails, the validation report shows grouped errors with row numbers and field-level messages
- Given validation passes, the apply step shows a confirmation with affected row counts
- Given apply is confirmed, an async job is submitted and the user is routed to the operation record
- Given the job completes, the user can download an error CSV for failed rows
- Given a network error during any step, the user sees an error message and can retry without re-uploading (session semantics)

---

### Story 67-5 — Export workflow redesign: scope → job → SSE → download

**Status:** planned
**Type:** feature
**Risk:** Medium
**Dependencies:** 67-1 (EntityTable for scope selection), Epic 65 (typed API client for export endpoints)

Implement the export workflow using the backend's async job model:
- Scope selection: choose entity type (items, prices, etc.), filter criteria (same FilterBar from EntityTable), select columns to include
- Job submission: confirmation dialog with estimated record count; submits async job via `/api/export/*`
- Progress tracking: SSE-driven progress bar with status messages ("Processing page 1 of 10...")
- Completion: download link for the exported file (CSV, XLSX), timestamp visibility
- Error handling: if export fails, show error message and retry button

**Acceptance Criteria:**
- Given an export is initiated for "Items", the scope selection shows filter criteria matching the current EntityTable state
- Given the export job is submitted, the user is shown an SSE progress bar that updates in real-time
- Given SSE disconnects, export progress falls back to polling within 5 seconds
- Given the export completes, the user can download the file directly
- Given the export fails, the user sees the error and can retry with the same scope
- Given multiple export jobs, each has its own progress tracking and completion state

---

## 4) Epic Risk Register

| Risk ID | Severity | Description | Mitigation |
|---------|----------|-------------|------------|
| R67-001 | P1 | Catalog table configurations with many columns may be slow to render | Use Epic 65 EntityTable column virtualization for tables with 15+ columns; test at 20 columns |
| R67-002 | P1 | Import workflow steps require precise backend contract alignment | Verify each import endpoint request/response shape before building UI; flag discrepancies |
| R67-003 | P1 | SSE progress may not be available for all import/export flows | Fall back to polling with `GET /api/operations/:id/progress` |
| R67-004 | P2 | CSV parsing edge cases (encoding, delimiter, multiline fields) may cause upload failures | Use a robust CSV parser (PapaParse); validate encoding on the client before upload |
| R67-005 | P2 | Export scope with large datasets may time out | Backend already has streaming export support; frontend MUST handle streaming response |

---

## 5) Preconditions

| # | Precondition | Enforcement | Status |
|---|--------------|-------------|--------|
| 1 | Epic 65 (Foundation) complete | sprint-status.yaml | ❌ (HOLDING) |
| 2 | Backoffice unfreeze authorized | Written authorization | ❌ (HOLDING) |
| 3 | Typed API client covers inventory items, prices, import, export, operations endpoints | 65-2 completion | ❌ (HOLDING) |
| 4 | TanStack Query cache hooks from Epic 65 available | 65-6 completion | ❌ (HOLDING) |
| 5 | Import/export backend endpoints verified working (POST `/api/import/upload`, POST `/api/import/validate`, POST `/api/import/apply`, POST `/api/export/*`, GET `/api/operations/:id/progress`) | Technical spike | ❌ (must verify) |

---

## 6) Exit Gate

1. **Build Gate:** `npm run build` and `npm run typecheck` pass
2. **EntityTable Gate:** Reusable component with server-side ops, column chooser, row selection, bulk actions all functional
3. **Items Gate:** Items list/detail with search, filter, sort, pagination, outlet scope functional
4. **Pricing Gate:** Default vs outlet override visual distinction clear; override editor functional
5. **Import Gate:** Upload → map → validate → apply → track → download errors all functional with backend integration
6. **Export Gate:** Scope → submit → SSE progress → download all functional
7. **Component Documentation Gate:** EntityTable, FilterBar, DetailDrawer documented with usage examples
8. **Test Gate:** Unit tests for all new components and workflows pass; e2e smoke test for import happy path passes
9. **SOLID/DRY/KISS Gate:** Full rescore passes at pre-close

---

## 7) Validation Commands

```bash
# Pre-flight
npm run lint -w @jurnapod/backoffice
npm run typecheck -w @jurnapod/backoffice
npm run build -w @jurnapod/backoffice

# Primitive tests
npm run test:single -w @jurnapod/backoffice -- __test__/unit/components/entity-table.test.ts
npm run test:single -w @jurnapod/backoffice -- __test__/unit/components/filter-bar.test.ts
npm run test:single -w @jurnapod/backoffice -- __test__/unit/components/detail-drawer.test.ts

# Items tests
npm run test:single -w @jurnapod/backoffice -- __test__/unit/features/items.test.ts

# Pricing tests
npm run test:single -w @jurnapod/backoffice -- __test__/unit/features/pricing.test.ts

# Import workflow tests
npm run test:single -w @jurnapod/backoffice -- __test__/unit/features/import-workflow.test.ts

# Export workflow tests
npm run test:single -w @jurnapod/backoffice -- __test__/unit/features/export-workflow.test.ts

# Playwright CT tests for EntityTable
npm run qa:ct -w @jurnapod/backoffice -- --grep "EntityTable|FilterBar|DetailDrawer"

# E2E smoke test for import
npm run qa:e2e -w @jurnapod/backoffice -- --grep "import|export|inventory"

# Sprint status
npx tsx scripts/validate-sprint-status.ts --epic 67
```

---

_Last Updated: 2026-05-17_
