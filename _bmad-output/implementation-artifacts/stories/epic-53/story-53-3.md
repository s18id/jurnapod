# Story 53-3: Platform + Purchasing + Other Module Migration

## Story Metadata

| Field | Value |
|-------|-------|
| Story ID | 53-3 |
| Epic | Epic 53: Datetime API Consolidation Execution |
| Title | Platform + Purchasing + Reporting + Reservations + Sales Module Migration |
| Status | backlog |
| Risk | P1 |
| Owner | dev |
| QA Gate | yes |
| Dependencies | Story 53-1 (Core API Surface) |

## Story

As a **developer**,  
I want all `@jurnapod/modules-platform`, `@jurnapod/modules-purchasing`, `@jurnapod/modules-reporting`, `@jurnapod/modules-reservations`, and `@jurnapod/modules-sales` source files to use the new `toUtcIso`/`fromUtcIso` namespaced API,  
So that all datetime conversions in these packages follow the canonical trunk.

## Context

Story 53-1 established the new namespaced API. This story migrates the remaining 5 module packages to use the new API directly, covering function renames, import fixups, raw `.toISOString()` pattern cleanups, and local datetime helper replacements (especially the reservations `time/timestamp.ts` local helpers).

## Acceptance Criteria

- [ ] **AC1: All `modules-platform` files use new API** — no old function calls remain
- [ ] **AC2: All `modules-purchasing` files use new API** — no old function calls remain
- [ ] **AC3: All `modules-reporting` files use new API** — no old function calls remain
- [ ] **AC4: All `modules-reservations` files use new API** — no old function calls remain, including `time/timestamp.ts` local helpers replaced with `toUtcIso.epochMs()`/`fromUtcIso.epochMs()`
- [ ] **AC5: All `modules-sales` files use new API** — no old function calls remain
- [ ] **AC6: All raw `.toISOString()` patterns** in these packages replaced with canonical equivalents
- [ ] **AC7: Per-package build passes** — each module package builds and passes unit tests

## Bulk Migration Targets

### `@jurnapod/modules-platform`

| # | File | Current | New |
|---|------|---------|-----|
| 1 | `src/users/services/user-service.ts` | `toRfc3339Required(x)` | `toUtcIso.dateLike(x)` |
| 2 | `src/companies/services/company-service.ts` | `toRfc3339(x)`, `toRfc3339Required(x)` | `toUtcIso.dateLike(x, { nullable: true })`, `toUtcIso.dateLike(x)` |
| 3 | `src/customers/services/customer-service.ts` | `toRfc3339Required(x)` | `toUtcIso.dateLike(x)` |
| 4 | `src/users/services/role-service.ts` | `toRfc3339Required(x)` | `toUtcIso.dateLike(x)` |
| 5 | `src/audit/period-transition.ts` | `toRfc3339Required(x)` | `toUtcIso.dateLike(x)` |
| 6 | `src/audit/query.ts` | `toRfc3339Required(x)` | `toUtcIso.dateLike(x)` |

### `@jurnapod/modules-purchasing` — Function renames

| # | File | Current | New |
|---|------|---------|-----|
| 7 | `src/services/ap-aging-report-service.ts` | `toRfc3339Required(x)` | `toUtcIso.dateLike(x)` |
| 8 | `src/services/ap-reconciliation-snapshot-service.ts` | `toRfc3339Required(x)` | `toUtcIso.dateLike(x)` |
| 9 | `src/services/ap-reconciliation-service.ts` | `normalizeDate()`, `isValidTimeZone()` | `toUtcIso.businessDate()`, keep `isValidTimeZone` |
| 10 | `src/services/ap-reconciliation-drilldown-service.ts` | `normalizeDate()` | `toUtcIso.businessDate()` |

### `@jurnapod/modules-purchasing` — Raw `.toISOString()` (Pattern B)

| # | File | Occurrences |
|---|------|-------------|
| 11 | `src/services/ap-payment-service.ts` | ~12 calls in response mapper |
| 12 | `src/services/purchase-invoice-service.ts` | ~14 calls in response mapper |
| 13 | `src/services/purchase-credit-service.ts` | ~16 calls in response mapper |
| 14 | `src/services/goods-receipt-service.ts` | 4 calls |
| 15 | `src/services/supplier-statement-service.ts` | 4 calls |
| 16 | `src/services/supplier-service.ts` | 1 call |
| 17 | `src/services/exchange-rate-service.ts` | 2 calls |
| 18 | `src/services/ap-reconciliation-snapshot-service.ts` | 2 calls |
| 19 | `src/services/supplier-contact-service.ts` | 1 call |
| 20 | `src/types/purchase-order.ts` | 1 call (Pattern B) |
| 21 | `src/types/purchase-invoice.ts` | 1 call (Pattern C) |
| 22 | `src/services/ap-aging-report-service.ts` | 1 call (Pattern C) |

### `@jurnapod/modules-reporting`

| # | File | Current | New |
|---|------|---------|-----|
| 23 | `src/reports/helpers.ts` | `toDateTimeRangeWithTimezone()`, `normalizeDate()`, `toMysqlDateTime()`, `toUtcInstant()`, `nowUTC()` | `toUtcIso.dateRange()`, `toUtcIso.businessDate()`, `fromUtcIso.mysql()`, `toUtcIso.dateLike()`, keep `nowUTC` |
| 24 | `src/reports/services.ts` | `normalizeDate()`, `toMysqlDateTime()`, `nowUTC()`, `toDateOnly()` | `toUtcIso.businessDate()`, `fromUtcIso.mysql()`, keep `nowUTC`, `fromUtcIso.dateOnly()` |
| 25 | `src/interfaces/index.ts` | Pattern A: `new Date().toISOString()` | `nowUTC()` |

### `@jurnapod/modules-reservations` — Function renames

| # | File | Current | New |
|---|------|---------|-----|
| 26 | `src/reservation-groups/service.ts` | `toMysqlDateTime()`, `toMysqlDateTimeFromDateLike()` | `fromUtcIso.mysql(toUtcIso.dateLike(x))` |
| 27 | `src/outlet-tables/service.ts` | `toRfc3339Required(x)` | `toUtcIso.dateLike(x)` |

### `@jurnapod/modules-reservations` — Local timestamp helpers

| # | File | Current | New |
|---|------|---------|-----|
| 28 | `src/time/timestamp.ts` | Local `toUnixMs()`, `fromUnixMs()`, `toUtcInstants()`, `fromUtcInstants()` | Replace with `fromUtcIso.epochMs(x)`, `toUtcIso.epochMs(x)`, `toUtcIso.dateLike(x)` |

### `@jurnapod/modules-reservations` — Raw `.toISOString()` (Pattern B)

| # | File | Occurrences |
|---|------|-------------|
| 29 | `src/reservations/utils.ts` | 1 call |
| 30 | `src/reservations/status.ts` | 2 calls |
| 31 | `src/table-sync/service.ts` | 4 calls |
| 32 | `src/table-occupancy/service.ts` | 1 call |

### `@jurnapod/modules-sales`

| # | File | Current | New |
|---|------|---------|-----|
| 33 | `src/services/payment-service.ts` | `toMysqlDateTime()`, `toMysqlDateTimeFromDateLike()` | `fromUtcIso.mysql()`, `fromUtcIso.mysql(toUtcIso.dateLike(x))` |
| 34 | `src/services/invoice-service.ts` | Pattern C: `.slice(0,10)` | `fromUtcIso.dateOnly(toUtcIso.dateLike(x))` |
| 35 | `src/services/order-service.ts` | Pattern C: `.slice(0,10)` (×2) | `fromUtcIso.dateOnly(toUtcIso.dateLike(x))` |

## Tasks/Subtasks

- [ ] 3.1 Migrate `modules-platform` (files 1-6) — function renames + import fixups
- [ ] 3.2 Build + test: `npm run build -w @jurnapod/modules-platform`
- [ ] 3.3 Migrate `modules-purchasing` (files 7-22) — function renames + raw `.toISOString()` + import fixups
- [ ] 3.4 Build + test: `npm run build -w @jurnapod/modules-purchasing`
- [ ] 3.5 Migrate `modules-reporting` (files 23-25) — function renames + import fixups
- [ ] 3.6 Build: `npm run build -w @jurnapod/modules-reporting`
- [ ] 3.7 Migrate `modules-reservations` (files 26-32) — function renames + local `timestamp.ts` helpers + raw `.toISOString()` + import fixups
- [ ] 3.8 Build + test: `npm run build -w @jurnapod/modules-reservations && npm run test:unit -w @jurnapod/modules-reservations`
- [ ] 3.9 Migrate `modules-sales` (files 33-35) — function renames + raw `.toISOString()` + import fixups
- [ ] 3.10 Build + test: `npm run build -w @jurnapod/modules-sales`
- [ ] 3.11 Verify API still builds: `npm run build -w @jurnapod/api`

## Dev Notes

- **Reservations `timestamp.ts`**: This file currently has local `toUnixMs()`, `fromUnixMs()`, etc. Replace with direct calls to `fromUtcIso.epochMs()` and `toUtcIso.epochMs()`. These are NOT thin wrappers — they are the actual implementations. The canonical shared functions handle Temporal.Instant validation correctly, so the local implementations become unnecessary.
- **Purchasing response mappers**: Files 11-13 (ap-payment, purchase-invoice, purchase-credit services) have ~12-16 `.toISOString()` calls each in response mapping functions. These are all Pattern B → `toUtcIso.dateLike(value)`. Consider using a batch sed within the package.
- **Import fixup**: After renaming, each file needs `toUtcIso` and/or `fromUtcIso` added to its import from `@jurnapod/shared`. Remove old function names from imports.
- **`company-service.ts` nullable**: `toRfc3339(row.deleted_at)` → `toUtcIso.dateLike(row.deleted_at, { nullable: true })` — this is a nullable caller, must pass `{ nullable: true }`.

## Validation Evidence

```bash
# Per package (run after each sub-task)
npm run build -w @jurnapod/modules-platform
npm run build -w @jurnapod/modules-purchasing
npm run build -w @jurnapod/modules-reporting
npm run build -w @jurnapod/modules-reservations
npm run test:unit -w @jurnapod/modules-reservations
npm run build -w @jurnapod/modules-sales

# Full API build (at end)
npm run build -w @jurnapod/api
npm run typecheck -w @jurnapod/api
```

## Dependencies

Story 53-1 (Core API Surface + Route Validation)
