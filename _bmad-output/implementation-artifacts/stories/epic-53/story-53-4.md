# Story 53-4: API Lib + Sync Packages + Cross-cutting Touch-ups

## Story Metadata

| Field | Value |
|-------|-------|
| Story ID | 53-4 |
| Epic | Epic 53: Datetime API Consolidation Execution |
| Title | API Lib + Sync Packages + Cross-cutting Touch-ups |
| Status | backlog |
| Risk | P1 |
| Owner | dev |
| QA Gate | yes |
| Dependencies | Story 53-1 (Core API Surface) |

## Story

As a **developer**,  
I want all `apps/api/src/lib/*` files, `packages/pos-sync`, `packages/sync-core`, and all cross-cutting special cases to use the `toUtcIso`/`fromUtcIso` namespaced API,  
So that the entire consumer surface is migrated ahead of deprecated wrapper removal.

## Context

Stories 53-2 and 53-3 migrated the module packages. This story covers the remaining consumer surface:

- `apps/api/src/lib/*` — 15+ files with direct imports from `@jurnapod/shared`
- `apps/api/src/routes/*` — 15+ files with raw `.toISOString()` patterns
- `packages/pos-sync` — sync push timestamp handling
- `packages/sync-core` — query files with date serialization
- Cross-cutting touch-ups: nullable callers, posting layer helpers, local format helpers, `purchase-orders.ts` `safeDate()`, `ar-reconciliation-service.ts` method collision

## Acceptance Criteria

- [ ] **AC1: All `apps/api/src/lib/*` files use new API** — no old function calls remain
- [ ] **AC2: All `apps/api/src/routes/*` files use new API** — raw `.toISOString()` patterns replaced
- [ ] **AC3: `packages/pos-sync` uses new API** — function renames complete
- [ ] **AC4: `packages/sync-core` uses new API** — function renames complete
- [ ] **AC5: Nullable `toRfc3339(` callers (4 files)** updated with `{ nullable: true }` option
- [ ] **AC6: `purchase-orders.ts` `safeDate()`** replaced with `toUtcIso.dateLike(x)`
- [ ] **AC7: `ar-reconciliation-service.ts` method body** fixed — method signature kept, internal calls renamed
- [ ] **AC8: Local format helpers** `formatDateOnlyFromUnknown` (2 files) replaced
- [ ] **AC9: Import dedup** completed — no `toUtcIso,toUtcIso` or missing imports
- [ ] **AC10: Build passes** — `npm run build -w @jurnapod/api && npm run typecheck -w @jurnapod/api`

## Bulk Migration Targets

### `apps/api/src/lib/` — Direct imports (function renames)

| # | File | Current | New |
|---|------|---------|-----|
| 1 | `lib/companies.ts` | `toRfc3339(x)`, `toRfc3339Required(x)` | `toUtcIso.dateLike(x, { nullable: true })`, `toUtcIso.dateLike(x)` |
| 2 | `lib/users.ts` | `toRfc3339Required(x)` | `toUtcIso.dateLike(x)` |
| 3 | `lib/outlets.ts` | `toRfc3339Required(x)` | `toUtcIso.dateLike(x)` |
| 4 | `lib/items/index.ts` | `toRfc3339Required(x)` | `toUtcIso.dateLike(x)` |
| 5 | `lib/item-prices/index.ts` | `toRfc3339Required(x)` | `toUtcIso.dateLike(x)` |
| 6 | `lib/item-groups/index.ts` | `toRfc3339Required(x)` | `toUtcIso.dateLike(x)` |
| 7 | `lib/settings.ts` | `toRfc3339Required(x)` | `toUtcIso.dateLike(x)` |
| 8 | `lib/static-pages.ts` | `toRfc3339(x)`, `toRfc3339Required(x)` | `toUtcIso.dateLike(x, { nullable: true })`, `toUtcIso.dateLike(x)` |
| 9 | `lib/static-pages-admin.ts` | `toRfc3339(x)`, `toRfc3339Required(x)` | `toUtcIso.dateLike(x, { nullable: true })`, `toUtcIso.dateLike(x)` |
| 10 | `lib/modules-sales/sales-db.ts` | `toDateTimeRangeWithTimezone` via date-helpers | Via date-helpers re-export (automatic) |
| 11 | `lib/sales-posting.ts` | `toDateOnly` dynamic import via date-helpers | Via date-helpers re-export (automatic) |

### `apps/api/src/` — Raw `.toISOString()` Pattern A (→ `nowUTC()`)

| # | File | Occurrences |
|---|------|-------------|
| 12 | `routes/health.ts` | Multiple |
| 13 | `routes/sync/health.ts` | Multiple |
| 14 | `routes/reports.ts` (lines 598, 684) | 2 |
| 15 | `routes/accounting/ap-exceptions.ts` (line 185) | 1 |
| 16 | `routes/cash-bank-transactions.ts` (line 148) | 1 |
| 17 | `routes/purchasing/reports/ap-aging.ts` (lines 60, 93) | 2 |
| 18 | `routes/import.ts` (line 1098) | 1 |
| 19 | `routes/export.ts` (line 175) | 1 |
| 20 | `middleware/telemetry.ts` (lines 165, 301) | 2 |
| 21 | `lib/progress/progress-store.ts` (line 323) | 1 |
| 22 | `lib/numbering.ts` (line 216) | 1 |
| 23 | `lib/report-telemetry.ts` (line 88) | 1 |

### `apps/api/src/` — Raw `.toISOString()` Pattern B (→ `toUtcIso.dateLike(x)`)

| # | File | Occurrences |
|---|------|-------------|
| 24 | `routes/dinein.ts` | ~10 (session response) |
| 25 | `routes/progress.ts` | ~10 (progress response) |
| 26 | `routes/sync/check-duplicate.ts` | 2 |
| 27 | `routes/purchasing/exchange-rates.ts` | 1 |
| 28 | `routes/purchasing/goods-receipts.ts` | 4 |
| 29 | `lib/table-occupancy.ts` | 1 |
| 30 | `lib/email-tokens.ts` | 1 |
| 31 | `lib/reservations/status.ts` | 1 |
| 32 | `lib/treasury-adapter.ts` | 2 |
| 33 | `lib/taxes.ts` | 2 |
| 34 | `lib/features.ts` | 4 |
| 35 | `lib/item-images.ts` | 2 |
| 36 | `lib/accounting/ap-exceptions.ts` | ~10 |
| 37 | `lib/purchasing/supplier.ts` | 1 |
| 38 | `lib/purchasing/supplier-contact.ts` | 1 |

### `apps/api/src/` — Raw `.toISOString()` Pattern C (→ `fromUtcIso.dateOnly(toUtcIso.dateLike(x))`)

| # | File | Occurrences |
|---|------|-------------|
| 39 | `routes/reports.ts` (lines 598, 684) | 2 |
| 40 | `routes/accounting/ap-exceptions.ts` (line 185) | 1 |
| 41 | `routes/cash-bank-transactions.ts` (line 148) | 1 |
| 42 | `routes/purchasing/reports/ap-aging.ts` (lines 60, 93) | 2 |
| 43 | `routes/export.ts` (line 175) | 1 |
| 44 | `lib/modules-sales/sales-db.ts` | 1 |
| 45 | `lib/pricing/variant-price-resolver.ts` | 1 |
| 46 | `lib/fiscal-years.ts` | 2 |
| 47 | `lib/purchasing/ap-payment.ts` | 3 |
| 48 | `lib/purchasing/purchase-invoice.ts` | 3 |
| 49 | `lib/purchasing/purchase-credit.ts` | 3 |
| 50 | `lib/report-context.ts` | 2 |
| 51 | `lib/treasury-adapter.ts` | 1 |
| 52 | `lib/shared/common-utils.ts` | 2 (local `formatDateOnlyFromUnknown`) |
| 53 | `lib/accounting/ap-exceptions.ts` | 2 |

### `apps/api/src/` — Raw `.toISOString()` Pattern D (→ `fromUtcIso.mysql(toUtcIso.dateLike(x))`)

| # | File | Occurrences |
|---|------|-------------|
| 54 | `lib/export/streaming.ts` | 1 |
| 55 | `lib/accounting/ap-exceptions.ts` | 3 |

### Sync packages

| # | File | Current | New |
|---|------|---------|-----|
| 56 | `packages/pos-sync/src/push/index.ts` | `toMysqlDateTime()`, `toUtcInstant()`, `toEpochMs()` | `fromUtcIso.mysql()`, `toUtcIso.dateLike()`, `fromUtcIso.epochMs()` |
| 57 | `packages/sync-core/src/data/reservation-queries.ts` | `toRfc3339Required(x)` | `toUtcIso.dateLike(x)` |
| 58 | `packages/sync-core/src/data/table-queries.ts` | `toRfc3339Required(x)` | `toUtcIso.dateLike(x)` |
| 59 | `packages/sync-core/src/data/variant-queries.ts` | `toRfc3339Required(x)` | `toUtcIso.dateLike(x)` |
| 60 | `packages/sync-core/src/data/item-queries.ts` | `toRfc3339Required(x)` | `toUtcIso.dateLike(x)` |

### Cross-cutting special cases

| # | File | Issue | Fix |
|---|------|-------|-----|
| 61 | `routes/purchasing/purchase-orders.ts` | Local `safeDate()` function | Replace with `toUtcIso.dateLike(x)` |
| 62 | `modules/accounting/reconciliation/subledger/ar-reconciliation-service.ts` | Phase 2 sed corrupts method def `private normalizeDate(...)` | Keep method name, rename ONLY body calls |
| 63 | `lib/companies.ts` — nullable | `toRfc3339(row.deleted_at)` | `toUtcIso.dateLike(row.deleted_at, { nullable: true })` |
| 64 | `lib/static-pages.ts` — nullable | `toRfc3339(row.published_at)` | `toUtcIso.dateLike(row.published_at, { nullable: true })` |
| 65 | `lib/static-pages-admin.ts` — nullable (×2) | `toRfc3339(row.published_at)` (×2) | `toUtcIso.dateLike(row.published_at, { nullable: true })` |
| 66 | `lib/shared/common-utils.ts` | Local `formatDateOnlyFromUnknown` | `fromUtcIso.dateOnly(toUtcIso.dateLike(value))` |
| 67 | `modules/accounting/fiscal-year/service.ts` (already in 53-2) | Local `formatDateOnlyFromUnknown` | `fromUtcIso.dateOnly(toUtcIso.dateLike(value))` |
| 68 | All files with imports | Import dedup after sed | Clean `toUtcIso,toUtcIso` → `toUtcIso`; verify `toUtcIso, fromUtcIso` |

## Tasks/Subtasks

- [ ] 4.1 Rename function calls in `apps/api/src/lib/*` (files 1-11) + fix imports
- [ ] 4.2 Fix Pattern A: Replace `new Date().toISOString()` with `nowUTC()` (files 12-23)
- [ ] 4.3 Fix Pattern B: Replace `value.toISOString()` with `toUtcIso.dateLike(value)` (files 24-38)
- [ ] 4.4 Fix Pattern C: Replace `.slice(0,10)` with `fromUtcIso.dateOnly(toUtcIso.dateLike(x))` (files 39-53)
- [ ] 4.5 Fix Pattern D: Replace `.slice(0,19).replace("T"," ")` with `fromUtcIso.mysql(toUtcIso.dateLike(x))` (files 54-55)
- [ ] 4.6 Migrate `packages/pos-sync` and `packages/sync-core` (files 56-60)
- [ ] 4.7 Handle cross-cutting special cases (files 61-67)
- [ ] 4.8 Import dedup pass: grep for `toUtcIso,toUtcIso` and fix; verify no missing imports
- [ ] 4.9 Build + verify: `npm run build -w @jurnapod/api && npm run typecheck -w @jurnapod/api && npm run test:unit -w @jurnapod/api`

## Dev Notes

- **Nullable callers are critical:** If `dateLike(x)` is called without `{ nullable: true }` on a nullable value, it throws. The 4 known nullable callers in the plan are:
  - `company-service.ts`: `row.deleted_at` (can be null)
  - `lib/companies.ts`: `row.deleted_at` (can be null)
  - `lib/static-pages.ts`: `row.published_at` (can be null)
  - `lib/static-pages-admin.ts`: `row.published_at` (×2, can be null)
- **`purchase-orders.ts` `safeDate()`:** This is a local function that does `new Date(x).toISOString()`. Replace calls with `toUtcIso.dateLike(x)` and remove the function definition.
- **`ar-reconciliation-service.ts` method:** The Phase 2 sed `normalizeDate(` → `toUtcIso.businessDate(` would corrupt the method definition `private normalizeDate(...)`. Fix manually: keep the method name, only rename the imported function call inside the method body.
- **Import dedup:** After sed renames, a file that imported `toRfc3339Required` and `toDateOnly` might end up with `toUtcIso, fromUtcIso, toUtcIso`. Dedup to `toUtcIso, fromUtcIso`.
- **`date-helpers.ts` re-export:** Files importing from `date-helpers` (apps/api) get the new names automatically since date-helpers re-exports everything. Files importing directly from `@jurnapod/shared` (packages) need explicit import updates.

## Validation Evidence

```bash
npm run build -w @jurnapod/api
npm run typecheck -w @jurnapod/api
npm run test:unit -w @jurnapod/api
npm run build -w @jurnapod/pos-sync
npm run build -w @jurnapod/sync-core
```

## Dependencies

Story 53-1 (Core API Surface + Route Validation)
