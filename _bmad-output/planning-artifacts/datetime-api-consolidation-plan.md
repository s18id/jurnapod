# Datetime API Consolidation Plan

## Motivation

The current `packages/shared/src/schemas/datetime.ts` exports **~26 functions** across 5 formats with no canonical trunk. Multiple paths exist to reach the same format. ~10 functions have zero or near-zero consumers.

Consumer scan results:
- `toRfc3339` / `toRfc3339Required`: **147 calls, ~55 files** (the core workhorse)
- `normalizeDate`: 9 files
- `nowUTC`: 8 files
- `toMysqlDateTime`: 7 files
- `toDateOnly`: 7 files
- `toUtcInstant`: 6 files
- `toEpochMs` / `fromEpochMs`: 5 files each
- `toMysqlDateTimeFromDateLike`: 5 files
- `isValidTimeZone`: 5 files
- `resolveBusinessTimezone`: 5 files
- ~10 functions: 0 real consumers (thin wrappers or app concerns)

## Contract Standardization

**Canonical internal + API format: UTC ISO Z string** (e.g., `"2026-03-16T10:30:00.000Z"`).

### Strict Rules (P0 — no exceptions)

1. **API input: Z only** — `z.string().datetime()` with **NO** `{offset: true}`. Reject offset input at validation with a clear error. All routes use one schema — no per-route variation.

2. **API output: Z only** — already the case everywhere via `toRfc3339`/`toRfc3339Required`. Formalize as invariant.

3. **Business logic: Z only** — all internal values are Z strings. Conversions happen only at two DB boundary points.

4. **DB boundary (BIGINT `*_ts`)**: `fromUtcIso.epochMs(zStr)` at **write** (Z→epoch ms), `toUtcIso.epochMs(ms)` at **read** (epoch ms→Z).

5. **DB boundary (DATETIME `*_at`)**: `fromUtcIso.mysql(zStr)` at **write** (Z→MySQL), `toUtcIso.dateLike(dbValue)` at **read** (Date/MySQL→Z).

## Actual Conversion Flow

```
API INPUT (Z only — strict validation)
  "2026-03-16T17:30:00Z"                          ← z.string().datetime() accepts
  "2026-03-16T17:30:00+07:00"                     ← REJECTED (validation error)
  "2026-03-16" (YYYY-MM-DD)                       ← DateOnlySchema, business date

       ↓ Zod validation (one rule: Z only)

  Always Z string                                 ← business logic layer

       ↓                                          ← TWO conversion points only

  DATETIME column:                                BIGINT column:
    fromUtcIso.mysql(zString)                       fromUtcIso.epochMs(zString)
    toUtcIso.dateLike(mysqlStr)                     toUtcIso.epochMs(ms)

       ↑                                          ← TWO conversion points only

  Always Z string                                 ← business logic layer

       ↓ response serialization

API OUTPUT (Z only)
  "2026-03-16T17:30:00Z"                          ← toRfc3339 / toRfc3339Required
```

---

## Complete Route Inventory (22 route files)

### Datetime validation patterns per route

| Route File | Pattern | Inconsistent? | Fix |
|-----------|---------|:-------------:|-----|
| `routes/reports.ts` | `{ offset: true }` — **only route allowing offset** | **YES** | Change to `UtcIsoSchema` |
| `routes/sales/payments.ts` | `z.string().datetime()` (Z only) | No | Use `UtcIsoSchema` import |
| `routes/audit.ts` | `z.string().datetime()` (Z only) | No | Use `UtcIsoSchema` import |
| `routes/features.ts` | `z.string().datetime()` (Z only) | No | Use `UtcIsoSchema` import |
| `routes/purchasing/purchase-orders.ts` | **Local `safeDate()`** | **YES** | Replace with `toUtcIso.dateLike(x)` |
| `routes/purchasing/purchase-invoices.ts` | **Raw `new Date()` for list query** | **YES** | Add Zod validation or use canonical |
| `routes/purchasing/goods-receipts.ts` | **Raw URL params to service** | **YES** | Add Zod validation |
| `routes/purchasing/exchange-rates.ts` | Inline YYYY-MM-DD regex | No (business date) | Use `DateOnlySchema` import |
| `routes/purchasing/reports/ap-aging.ts` | Inline YYYY-MM-DD regex | No (business date) | Use `DateOnlySchema` import |
| `routes/accounts.ts` | Inline YYYY-MM-DD regex | No (business date) | Use `DateOnlySchema` import |
| `routes/sales/orders.ts` | `z.string().date()` inline | No (business date) | Use `DateOnlySchema` import |
| `routes/cash-bank-transactions.ts` | `z.string().optional()` — **no datetime validation** | **YES** | Add `DateOnlySchema` or remove |
| `routes/sales/invoices.ts` | Via shared schema | No | No change |
| `routes/sales/credit-notes.ts` | Via shared schema | No | No change |
| `routes/purchasing/purchase-credits.ts` | Via shared schema | No | No change |
| `routes/purchasing/ap-payments.ts` | Via shared schema | No | No change |
| `routes/purchasing/supplier-statements.ts` | Via shared schema | No | No change |
| `routes/purchasing/reports/ap-reconciliation.ts` | Via shared schema | No | No change |
| `routes/accounting/reports/ar-reconciliation.ts` | Via shared schema | No | No change |
| `routes/journals.ts` | Via shared handler lib | No | No change |
| `routes/accounting/ap-exceptions.ts` | Generated inline | No | No change |
| `routes/companies.ts` | No datetime input | N/A | No change |

### Inconsistencies to fix (9 routes + schemas)

1. **`reports.ts`** — change `{ offset: true }` → `UtcIsoSchema` (strict Z only)
2. **`purchase-orders.ts`** — replace local `safeDate()` with `toUtcIso.dateLike(x)`
3. **`purchase-invoices.ts`** — replace raw `new Date(dateStr)` with canonical validation
4. **`goods-receipts.ts`** — add datetime validation at route boundary
5. **`cash-bank-transactions.ts`** — `z.string().optional()` has no format enforcement; add or remove field
6. **`pos-sync.ts`** (shared schema) — change `{ offset: true }` → `UtcIsoSchema`
7. **`sync-core/src/types/index.ts`** — change `z.string().datetime()` → `UtcIsoSchema` import
8. **`reservations.ts`** (shared schema) — change 10 fields `{ offset: true }` → `UtcIsoSchema`
9. **`reservation-groups.ts`** (shared schema) — change 9 fields `{ offset: true }` → `UtcIsoSchema`

---

## Complete Package Inventory

### `@jurnapod/modules-accounting`

| File | Current | New |
|------|---------|-----|
| `src/posting/sync-push.ts` | `toMysqlDateTimeFromDateLike(x)` | `fromUtcIso.mysql(toUtcIso.dateLike(x))` |
| `src/posting/depreciation.ts` | `toMysqlDateTimeFromDateLike(x)` | `fromUtcIso.mysql(toUtcIso.dateLike(x))` |
| `src/posting/sales.ts` | `toMysqlDateTimeFromDateLike(x)` (×4) | `fromUtcIso.mysql(toUtcIso.dateLike(x))` |
| `src/fixed-assets/services/lifecycle-service.ts` | `toDateOnly(nowUTC())` (×4) | `fromUtcIso.dateOnly(nowUTC())` |
| `src/fiscal-year/service.ts` | `toRfc3339Required(x)`, `toDateOnly(nowUTC())` | `toUtcIso.dateLike(x)`, `fromUtcIso.dateOnly(nowUTC())` |
| `src/reconciliation/index.ts` | `nowUTC()` | Keep (standalone) |
| `src/reconciliation/dashboard-service.ts` | `resolveBusinessTimezone()`, `epochMsToPeriodBoundaries()`, `businessDateFromEpochMs()` | Keep `resolveBusinessTimezone`. Move `epochMsToPeriodBoundaries()` to this package. `businessDateFromEpochMs()` → compose |
| `src/reconciliation/subledger/cash-provider.ts` | `resolveBusinessTimezone()`, `epochMsToPeriodBoundaries()` | Keep `resolveBusinessTimezone`. Move `epochMsToPeriodBoundaries()` here |
| `src/reconciliation/subledger/receivables-provider.ts` | `resolveBusinessTimezone()`, `businessDateFromEpochMs()`, `asOfDateToUtcRange()` | Keep `resolveBusinessTimezone`. Compose `businessDateFromEpochMs()`. Use `toUtcIso.asOfDateRange()` |
| `src/reconciliation/subledger/ar-reconciliation-service.ts` | `normalizeDate()`, `isValidTimeZone()` | `toUtcIso.businessDate()`, keep `isValidTimeZone` |
| `src/trial-balance/service.ts` | `resolveBusinessTimezone()`, `epochMsToPeriodBoundaries()` | Keep `resolveBusinessTimezone`. Move `epochMsToPeriodBoundaries()` here |
| `src/journals-service.ts` | `toRfc3339Required(x)` | `toUtcIso.dateLike(x)` |

### `@jurnapod/modules-inventory`

| File | Current | New |
|------|---------|-----|
| `src/services/item-group-service.ts` | `toRfc3339Required(x)` | `toUtcIso.dateLike(x)` |
| `src/services/item-price-service.ts` | `toRfc3339Required(x)` | `toUtcIso.dateLike(x)` |
| `src/services/supplies-service.ts` | `toRfc3339Required(x)` | `toUtcIso.dateLike(x)` |
| `src/services/item-variant-service.ts` | `toRfc3339Required(x)` | `toUtcIso.dateLike(x)` |
| `src/services/recipe-service.ts` | `toRfc3339Required(x)` | `toUtcIso.dateLike(x)` |
| `src/services/item-service.ts` | `toRfc3339Required(x)` | `toUtcIso.dateLike(x)` |

### `@jurnapod/modules-platform`

| File | Current | New |
|------|---------|-----|
| `src/users/services/user-service.ts` | `toRfc3339Required(x)` | `toUtcIso.dateLike(x)` |
| `src/companies/services/company-service.ts` | `toRfc3339(x)`, `toRfc3339Required(x)` | `toUtcIso.dateLike(x, { nullable: true })`, `toUtcIso.dateLike(x)` |
| `src/customers/services/customer-service.ts` | `toRfc3339Required(x)` | `toUtcIso.dateLike(x)` |
| `src/users/services/role-service.ts` | `toRfc3339Required(x)` | `toUtcIso.dateLike(x)` |
| `src/audit/period-transition.ts` | `toRfc3339Required(x)` | `toUtcIso.dateLike(x)` |
| `src/audit/query.ts` | `toRfc3339Required(x)` | `toUtcIso.dateLike(x)` |

### `@jurnapod/modules-purchasing`

| File | Current | New |
|------|---------|-----|
| `src/services/ap-aging-report-service.ts` | `toRfc3339Required(x)` | `toUtcIso.dateLike(x)` |
| `src/services/ap-reconciliation-snapshot-service.ts` | `toRfc3339Required(x)` | `toUtcIso.dateLike(x)` |
| `src/services/ap-reconciliation-service.ts` | `normalizeDate()`, `isValidTimeZone()` | `toUtcIso.businessDate()`, keep `isValidTimeZone` |
| `src/services/ap-reconciliation-drilldown-service.ts` | `normalizeDate()` | `toUtcIso.businessDate()` |

### `@jurnapod/modules-reporting`

| File | Current | New |
|------|---------|-----|
| `src/reports/helpers.ts` | `toDateTimeRangeWithTimezone()`, `normalizeDate()`, `toMysqlDateTime()`, `toUtcInstant()`, `nowUTC()` | `toUtcIso.dateRange()`, `toUtcIso.businessDate()`, `fromUtcIso.mysql()`, `toUtcIso.dateLike()`, keep `nowUTC` |
| `src/reports/services.ts` | `normalizeDate()`, `toMysqlDateTime()`, `nowUTC()`, `toDateOnly()` | `toUtcIso.businessDate()`, `fromUtcIso.mysql()`, keep `nowUTC`, `fromUtcIso.dateOnly()` |

### `@jurnapod/modules-reservations`

| File | Current | New |
|------|---------|-----|
| `src/reservation-groups/service.ts` | `toMysqlDateTime()`, `toMysqlDateTimeFromDateLike()` | `fromUtcIso.mysql(toUtcIso.dateLike(x))` |
| `src/outlet-tables/service.ts` | `toRfc3339Required(x)` | `toUtcIso.dateLike(x)` |
| `src/time/timestamp.ts` | Local `toUnixMs()`, `fromUnixMs()`, `toUtcInstants()`, `fromUtcInstants()` | Replace local implementations with `toUtcIso.epochMs()`, `fromUtcIso.epochMs()` |
| `src/time/timezone.ts` | `isValidTimeZone()` from shared | Keep (standalone) |

### `@jurnapod/modules-sales`

| File | Current | New |
|------|---------|-----|
| `src/services/payment-service.ts` | `toMysqlDateTime()`, `toMysqlDateTimeFromDateLike()` | `fromUtcIso.mysql()`, `fromUtcIso.mysql(toUtcIso.dateLike(x))` |

### `@jurnapod/pos-sync`

| File | Current | New |
|------|---------|-----|
| `src/push/index.ts` | `toMysqlDateTime()`, `toUtcInstant()`, `toEpochMs()` | `fromUtcIso.mysql()`, `toUtcIso.dateLike()`, `fromUtcIso.epochMs()` |

### `@jurnapod/sync-core`

| File | Current | New |
|------|---------|-----|
| `src/data/reservation-queries.ts` | `toRfc3339Required(x)` | `toUtcIso.dateLike(x)` |
| `src/data/table-queries.ts` | `toRfc3339Required(x)` | `toUtcIso.dateLike(x)` |
| `src/data/variant-queries.ts` | `toRfc3339Required(x)` | `toUtcIso.dateLike(x)` |
| `src/data/item-queries.ts` | `toRfc3339Required(x)` | `toUtcIso.dateLike(x)` |

### `packages/shared/src/schemas/pos-sync.ts`

| Field | Current | New |
|-------|---------|-----|
| `opened_at`, `closed_at`, `event_at`, `updated_at` | `z.string().datetime({ offset: true })` | `UtcIsoSchema` |

---

## Edge Cases

### 1. Reservations: BIGINT epoch ms (`reservation_start_ts`, `reservation_end_ts`)
The reservations module stores timestamps as BIGINT epoch ms. The local `time/timestamp.ts` file has its own `toUnixMs`/`fromUnixMs` implementations. These must be replaced with `toUtcIso.epochMs()` / `fromUtcIso.epochMs()` so all reservation code uses the canonical Z string internally.

### 2. Posting layer: `toMysqlDateTimeFromDateLike`
The accounting posting layer (sales, sync-push, depreciation) uses `toMysqlDateTimeFromDateLike()` which does lax `new Date()` parsing. These 5 callers need the 2-hop rewrite: `fromUtcIso.mysql(toUtcIso.dateLike(x))`.

### 3. YYYY-MM-DD business dates
`DateOnlySchema` (YYYY-MM-DD) is a separate domain — it represents a calendar day in business timezone, NOT a UTC instant. Routes using `DateOnlySchema` (exchange-rates, ap-aging, accounts, orders) are correct as-is. No change needed to their contract.

### 4. No raw `new Date()` in routes
Routes `purchase-invoices.ts`, `goods-receipts.ts` pass raw URL params directly to services without Zod datetime validation. This MUST be fixed to validate at the route boundary.

### 5. POS offline sync
`pos-sync.ts` schemas currently accept `{ offset: true }`. Changing to Z-only means POS clients MUST send Z strings. Since POS is offline-first, the change takes effect on next sync cycle.

### 6. Deployment order (breaking change)
POS offline clients send offset strings. The server change (rejecting offset) MUST NOT be deployed before POS app update is rolled out:
1. Deploy POS app update (send Z only)
2. Wait for rollout
3. Deploy server change (reject offset)

### 7. Performance of hot path
`toUtcIso.dateLike()` replaces `toRfc3339` + `toRfc3339Required` (147 calls). Each call does one `new Date()` + one `.toISOString()`. Zero performance regression — this is the exact same work as the current functions. No optimization needed.

---

## Raw `.toISOString()` Patterns

Beyond the shared function renames, **55 files** contain raw `.toISOString()` calls that bypass the canonical functions entirely. These produce correct Z strings but sidestep the `toUtcIso`/`fromUtcIso` API.

### Pattern definitions

| Pattern | Code | Canonical replacement |
|---------|------|-----------------------|
| **A** | `new Date().toISOString()` | `nowUTC()` |
| **B** | `value.toISOString()` or `new Date(x).toISOString()` (Date→Z) | `toUtcIso.dateLike(value)` or `toUtcIso.dateLike(new Date(x))` |
| **C** | `.toISOString().slice(0,10)` or `.split("T")[0]` (Date→YYYY-MM-DD) | `fromUtcIso.dateOnly(toUtcIso.dateLike(value))` |
| **D** | `.toISOString().slice(0,19).replace("T"," ")` (Date→MySQL) | `fromUtcIso.mysql(toUtcIso.dateLike(value))` |

### File inventory by pattern

**Pattern A — `new Date().toISOString()` → `nowUTC()` (10 files)**

| File | Occurrences |
|------|:-----------:|
| `apps/api/src/routes/health.ts` | Multiple |
| `apps/api/src/routes/sync/health.ts` | Multiple |
| `apps/api/src/routes/reports.ts` (lines 598, 684) | 2 |
| `apps/api/src/routes/accounting/ap-exceptions.ts` (line 185) | 1 |
| `apps/api/src/routes/cash-bank-transactions.ts` (line 148) | 1 |
| `apps/api/src/routes/purchasing/reports/ap-aging.ts` (lines 60, 93) | 2 |
| `apps/api/src/routes/import.ts` (line 1098) | 1 |
| `apps/api/src/routes/export.ts` (line 175) | 1 |
| `apps/api/src/middleware/telemetry.ts` (lines 165, 301) | 2 |
| `apps/api/src/lib/progress/progress-store.ts` (line 323) | 1 |
| `apps/api/src/lib/numbering.ts` (line 216) | 1 |
| `apps/api/src/lib/report-telemetry.ts` (line 88) | 1 |
| `packages/modules/reporting/src/interfaces/index.ts` (line 102) | 1 |
| `packages/modules/inventory-costing/src/index.ts` (line 679) | 1 |

**Pattern B — `value.toISOString()` / `new Date(x).toISOString()` → `toUtcIso.dateLike(x)` (30 files)**

| File | Occurrences |
|------|:-----------:|
| `packages/modules/purchasing/src/services/ap-payment-service.ts` | ~12 (response mapper) |
| `packages/modules/purchasing/src/services/purchase-invoice-service.ts` | ~14 (response mapper) |
| `packages/modules/purchasing/src/services/purchase-credit-service.ts` | ~16 (response mapper) |
| `packages/modules/purchasing/src/services/goods-receipt-service.ts` | 4 |
| `packages/modules/purchasing/src/services/supplier-statement-service.ts` | 4 |
| `packages/modules/purchasing/src/services/supplier-service.ts` | 1 |
| `packages/modules/purchasing/src/services/exchange-rate-service.ts` | 2 |
| `packages/modules/purchasing/src/services/ap-reconciliation-snapshot-service.ts` | 2 |
| `packages/modules/purchasing/src/services/supplier-contact-service.ts` | 1 |
| `packages/modules/purchasing/src/types/purchase-order.ts` | 1 |
| `packages/modules/inventory/src/services/stock-service.ts` | 2 |
| `packages/modules/inventory/src/services/item-price-service.ts` (line 637) | 1 |
| `packages/modules/inventory-costing/src/index.ts` (line 591) | 1 |
| `packages/modules/reservations/src/reservations/utils.ts` | 1 |
| `packages/modules/reservations/src/reservations/status.ts` | 2 |
| `packages/modules/reservations/src/table-sync/service.ts` | 4 |
| `packages/modules/reservations/src/table-occupancy/service.ts` | 1 |
| `packages/modules/reporting/src/reports/helpers.ts` | 2 |
| `packages/modules/accounting/src/account-types-service.ts` | 2 |
| `packages/modules/accounting/src/accounts-service.ts` | 2 |
| `packages/modules/accounting/src/fixed-assets/services/depreciation-service.ts` | 2 |
| `packages/modules/accounting/src/fixed-assets/services/lifecycle-service.ts` | 2 |
| `apps/api/src/routes/dinein.ts` | ~10 (session response) |
| `apps/api/src/routes/progress.ts` | ~10 (progress response) |
| `apps/api/src/routes/sync/check-duplicate.ts` | 2 |
| `apps/api/src/routes/purchasing/exchange-rates.ts` | 1 |
| `apps/api/src/routes/purchasing/goods-receipts.ts` | 4 |
| `apps/api/src/lib/table-occupancy.ts` | 1 |
| `apps/api/src/lib/email-tokens.ts` | 1 |
| `apps/api/src/lib/reservations/status.ts` | 1 |
| `apps/api/src/lib/treasury-adapter.ts` | 2 |
| `apps/api/src/lib/taxes.ts` | 2 |
| `apps/api/src/lib/features.ts` | 4 |
| `apps/api/src/lib/item-images.ts` | 2 |
| `apps/api/src/lib/accounting/ap-exceptions.ts` | ~10 |
| `apps/api/src/lib/purchasing/supplier.ts` | 1 |
| `apps/api/src/lib/purchasing/supplier-contact.ts` | 1 |

**Pattern C — `.toISOString().slice(0,10)` / `.split("T")[0]` → `fromUtcIso.dateOnly(toUtcIso.dateLike(x))` (20 files)**

| File | Occurrences |
|------|:-----------:|
| `packages/modules/sales/src/services/invoice-service.ts` | 1 |
| `packages/modules/sales/src/services/order-service.ts` | 2 |
| `packages/modules/purchasing/src/services/ap-aging-report-service.ts` | 1 |
| `packages/modules/purchasing/src/types/purchase-invoice.ts` | 1 |
| `packages/modules/accounting/src/fiscal-year/service.ts` | 2 (local `formatDateOnlyFromUnknown`) |
| `packages/modules/accounting/src/journals-service.ts` | 2 |
| `packages/modules/accounting/src/fixed-assets/services/depreciation-service.ts` | 2 |
| `packages/modules/accounting/src/fixed-assets/services/lifecycle-service.ts` | 1 |
| `packages/modules/reporting/src/reports/helpers.ts` | 2 |
| `apps/api/src/routes/reports.ts` (lines 598, 684) | 2 |
| `apps/api/src/routes/accounting/ap-exceptions.ts` (line 185) | 1 |
| `apps/api/src/routes/cash-bank-transactions.ts` (line 148) | 1 |
| `apps/api/src/routes/purchasing/reports/ap-aging.ts` (lines 60, 93) | 2 |
| `apps/api/src/routes/export.ts` (line 175) | 1 |
| `apps/api/src/lib/modules-sales/sales-db.ts` | 1 |
| `apps/api/src/lib/pricing/variant-price-resolver.ts` | 1 |
| `apps/api/src/lib/fiscal-years.ts` | 2 |
| `apps/api/src/lib/purchasing/ap-payment.ts` | 3 |
| `apps/api/src/lib/purchasing/purchase-invoice.ts` | 3 |
| `apps/api/src/lib/purchasing/purchase-credit.ts` | 3 |
| `apps/api/src/lib/report-context.ts` | 2 |
| `apps/api/src/lib/treasury-adapter.ts` | 1 |
| `apps/api/src/lib/shared/common-utils.ts` | 2 (local `formatDateOnlyFromUnknown`) |
| `apps/api/src/lib/accounting/ap-exceptions.ts` | 2 |

**Pattern D — `.toISOString().slice(0,19).replace("T"," ")` → `fromUtcIso.mysql(toUtcIso.dateLike(x))` (3 files)**

| File | Occurrences |
|------|:-----------:|
| `apps/api/src/lib/export/streaming.ts` | 1 |
| `apps/api/src/lib/accounting/ap-exceptions.ts` | 3 |
| `apps/api/src/lib/accounting/ap-exceptions.ts` | Also uses raw slice + replace for MySQL format |

### Test fixture files (raw `.toISOString()` — Phase 5 follow-up)

| File | Pattern |
|------|---------|
| `apps/api/src/lib/test-fixtures.ts` (lines 1647-1906) | Pattern C for Date→YYYY-MM-DD in fixture responses |
| `packages/modules/accounting/src/test-fixtures/fiscal-year-fixtures.ts` | Pattern C |
| `packages/modules/accounting/src/test-fixtures/fiscal-period-fixtures.ts` | Pattern C |

### Local format helpers to replace

| File | Local function | Replace with |
|------|---------------|-------------|
| `modules/accounting/fiscal-year/service.ts` (line 130) | `formatDateOnlyFromUnknown(value)` | `fromUtcIso.dateOnly(toUtcIso.dateLike(value))` |
| `apps/api/src/lib/shared/common-utils.ts` (line 198) | `formatDateOnlyFromUnknown(value)` | `fromUtcIso.dateOnly(toUtcIso.dateLike(value))` |

---

## Test Coverage

### Current unit tests (`packages/shared/__test__/unit/datetime.test.ts`)

| Function tested | Current test coverage | After migration |
|----------------|---------------------|-----------------|
| `resolveBusinessTimezone` | 11 tests (null, undefined, empty, invalid, trimming) | Keep — rename not needed. 64 lines, 11 assertions. |
| `asOfDateToUtcRange` | 8 tests (basic, DST spring/fall, invalid date, overflow, invalid tz) | Rename to `toUtcIso.asOfDateRange` |
| `businessDateFromEpochMs` | 8 tests (basic, UTC, positive/negative offset, NaN/Infinity, invalid tz) | Compose — tests can inline `fromUtcIso.businessDate(toUtcIso.epochMs(ms), tz)` |
| `epochMsToPeriodBoundaries` | 7 tests (ordering, UTC, month boundary, Jakarta, NY DST, NaN, invalid tz) | Move to `@jurnapod/modules-accounting` — tests move with it |
| `isValidTimeZone` | 1 test (not shown in file above but in `describe`) | Keep — standalone |
| `normalizeDate` | Not tested directly in this file | Rename to `toUtcIso.businessDate` — add tests |
| `fromEpochMs` | Not tested directly in this file | Rename to `toUtcIso.epochMs` — add tests |

### Current integration tests (`apps/api/__test__/`)

Datetime assertions found across ~15 test files, all checking `toBeDefined()` / `toBeTruthy()` on `*_at` fields. No tests assert `Z$` format on API responses. Key files:

| Test file | What it asserts |
|-----------|----------------|
| `unit/date-helpers/normalize.test.ts` | Exact Z format: `.toBe('2024-03-15T10:30:00.000Z')` for `toRfc3339` and `toRfc3339Required` |
| `integration/audit/list.test.ts` | Sends `from_date`/`to_date` as Z strings |
| `integration/reports/journals.test.ts` | Sends `as_of` as Z string |
| `integration/cash-bank/post.test.ts` | `posted_at` is `toBeDefined()` |
| `integration/purchasing/ap-payments.test.ts` | `posted_at`, `voided_at` are `toBeDefined()` |
| `integration/sales/payment-fx-ack.test.ts` | Sends `new Date().toISOString()` as input |
| `integration/reservations/canonical-ts-cutover.test.ts` | Sends `reservationTime.toISOString()` as input |

### Test migration plan

| Test file | Action |
|-----------|--------|
| `packages/shared/__test__/unit/datetime.test.ts` | Rename function calls to new namespaced API. Keep `resolveBusinessTimezone` as-is. `epochMsToPeriodBoundaries` tests → move to accounting module. Add tests for `toUtcIso.dateLike()`, `fromUtcIso.epochMs()`, `fromUtcIso.mysql()`, `fromUtcIso.dateOnly()`, `fromUtcIso.businessDate()`, `toUtcIso.businessDate()`, `fromUtcIso.localDisplay()` |
| `apps/api/__test__/unit/date-helpers/normalize.test.ts` | Update `toRfc3339` → `toUtcIso.dateLike`. Assertions unchanged (still expect `Z$`). |
| All integration tests | No change needed — they send `.toISOString()` (Z) already and only check `toBeDefined()` on response. |

### Test gap: no format assertions on API responses

Integration tests currently only check `toBeDefined()` on datetime response fields. A follow-up improvement would be to assert `Z$` on response bodies. Not required for this consolidation.

---

## Design

Two namespaces representing the conversion trunk:

```
toUtcIso           "I want our canonical Z string. Here's what I have:"
fromUtcIso         "I have our canonical Z string. Here's what I want:"
```

## Proposed API Surface

### Standalone (unchanged — fundamental)

| Export | Signature | Notes |
|--------|-----------|-------|
| `nowUTC` | `() => string` | Current time as Z string |
| `isValidTimeZone` | `(tz: string) => boolean` | IANA validation |
| `resolveBusinessTimezone` | `(outlet?: string, company?: string) => string` | Outlet→company→error |
| `resolveEventTime` | `({at?, ts?, date?, ...}) => string` | Flexible router |

### `toUtcIso` namespace (produce Z string)

| Method | Signature | Replaces | Consumers |
|--------|-----------|----------|-----------|
| `.dateLike(value, opts?)` | `(value: Date\|string, opts?: {nullable?: boolean}) => string\|null` | `toRfc3339`, `toRfc3339Required`, `toUtcInstant` | **147 calls, ~55 files** |
| `.epochMs(ms)` | `(ms: number) => string` | `fromEpochMs` | 5 files |
| `.businessDate(date, tz, boundary)` | `(date: string, tz: string, boundary: 'start'\|'end') => string` | `normalizeDate` | 9 files |
| `.asOfDateRange(date, tz)` | `(date: string, tz: string) => {startUTC, nextDayUTC}` | `asOfDateToUtcRange` | 3 files |
| `.dateRange(dateFrom, dateTo, tz)` | `(from: string, to: string, tz: string) => {fromStartUTC, toEndUTC}` | `toDateTimeRangeWithTimezone` | 4 files |

### `fromUtcIso` namespace (consume Z string)

| Method | Signature | Replaces | Consumers |
|--------|-----------|----------|-----------|
| `.epochMs(iso)` | `(s: string) => number` | `toEpochMs` | 5 files |
| `.mysql(iso)` | `(s: string) => string` | `toMysqlDateTime` | 7 files |
| `.businessDate(iso, tz)` | `(s: string, tz: string) => string` | `toBusinessDate` | 4 files |
| `.localDisplay(iso, tz, opts?)` | `(s: string, tz: string, opts?: {includeTime?: boolean}) => string` | `fromUtcInstant` + `formatForDisplay` | 2 + 0 files |
| `.dateOnly(iso)` | `(s: string) => string` | `toDateOnly` | 7 files |

### New Zod Schema

| Export | Definition | Replaces |
|--------|-----------|----------|
| `UtcIsoSchema` | `z.string().datetime()` (no offset) | `RfcDateTimeSchema` (keep as deprecated alias) |

### Dropped

| Function | Reason | Migration |
|----------|--------|-----------|
| `toRfc3339` | Renamed | `toUtcIso.dateLike(x)` |
| `toRfc3339Required` | Merged into dateLike | `toUtcIso.dateLike(x)` (throws by default) |
| `toUtcInstant` | Merged into dateLike | `toUtcIso.dateLike(x)` |
| `toMysqlDateTimeFromDateLike` | Lenient escape hatch | `fromUtcIso.mysql(toUtcIso.dateLike(x))` |
| `addDays` | 0 real consumers | Inline `new Date(s).setUTCDate(...)` |
| `compareDates` | 0 real consumers | `fromUtcIso.epochMs(a) - fromUtcIso.epochMs(b)` |
| `isInFiscalYear` | 0 real consumers | Compose epoch ms |
| `resolveEventTimeDetails` | 0 real consumers | Compose `resolveEventTime` + `toUtcIso.businessDate` |
| `isValidDateTime` | Internal only | Make private |
| `isValidDate` | Internal only | Make private |
| `businessDateFromEpochMs` | Thin wrapper | `fromUtcIso.businessDate(toUtcIso.epochMs(ms), tz)` |
| `epochMsToPeriodBoundaries` | Domain (accounting) | Move to `@jurnapod/modules-accounting` |
| `formatForDisplay` | App concern | `fromUtcIso.localDisplay(s, tz, { includeTime })` |
| `RfcDateTimeSchema` | Offset-allowing | Use `UtcIsoSchema` instead |

## Consumer Rewrite Map

### Function renames

| Current pattern | New pattern |
|----------------|-------------|
| `toRfc3339(value)` | `toUtcIso.dateLike(value)` |
| `toRfc3339Required(value)` | `toUtcIso.dateLike(value)` |
| `toUtcInstant(input)` | `toUtcIso.dateLike(input)` |
| `toEpochMs(str)` | `fromUtcIso.epochMs(str)` |
| `fromEpochMs(n)` | `toUtcIso.epochMs(n)` |
| `toMysqlDateTime(str)` | `fromUtcIso.mysql(str)` |
| `toMysqlDateTimeFromDateLike(x)` | `fromUtcIso.mysql(toUtcIso.dateLike(x))` |
| `normalizeDate(d, tz, b)` | `toUtcIso.businessDate(d, tz, b)` |
| `toBusinessDate(s, tz)` | `fromUtcIso.businessDate(s, tz)` |
| `toDateOnly(s)` | `fromUtcIso.dateOnly(s)` |
| `fromUtcInstant(s, tz)` | `fromUtcIso.localDisplay(s, tz)` |
| `formatForDisplay(s, tz, t?)` | `fromUtcIso.localDisplay(s, tz, { includeTime: t })` |
| `asOfDateToUtcRange(d, tz)` | `toUtcIso.asOfDateRange(d, tz)` |
| `toDateTimeRangeWithTimezone(f, t, tz)` | `toUtcIso.dateRange(f, t, tz)` |

### API lib files (direct imports from `@jurnapod/shared`)

| File | Current | New |
|------|---------|-----|
| `lib/companies.ts` | `toRfc3339(x)`, `toRfc3339Required(x)` | `toUtcIso.dateLike(x, { nullable: true })`, `toUtcIso.dateLike(x)` |
| `lib/users.ts` | `toRfc3339Required(x)` | `toUtcIso.dateLike(x)` |
| `lib/outlets.ts` | `toRfc3339Required(x)` | `toUtcIso.dateLike(x)` |
| `lib/items/index.ts` | `toRfc3339Required(x)` | `toUtcIso.dateLike(x)` |
| `lib/item-prices/index.ts` | `toRfc3339Required(x)` | `toUtcIso.dateLike(x)` |
| `lib/item-groups/index.ts` | `toRfc3339Required(x)` | `toUtcIso.dateLike(x)` |
| `lib/settings.ts` | `toRfc3339Required(x)` | `toUtcIso.dateLike(x)` |
| `lib/static-pages.ts` | `toRfc3339(x)`, `toRfc3339Required(x)` | `toUtcIso.dateLike(x, { nullable: true })`, `toUtcIso.dateLike(x)` |
| `lib/static-pages-admin.ts` | `toRfc3339(x)`, `toRfc3339Required(x)` | `toUtcIso.dateLike(x, { nullable: true })`, `toUtcIso.dateLike(x)` |
| `lib/reservations/utils.ts` | `toEpochMs`, `fromEpochMs`, `toUtcInstant` via date-helpers | Via date-helpers re-export (automatic) |
| `lib/modules-sales/sales-db.ts` | `toDateTimeRangeWithTimezone` via date-helpers | Via date-helpers re-export (automatic) |
| `lib/sales-posting.ts` | `toDateOnly` dynamic import via date-helpers | Via date-helpers re-export (automatic) |

### Schema renames

| Current | New |
|---------|-----|
| `RfcDateTimeSchema` | `UtcIsoSchema` |
| `z.string().datetime({ offset: true })` | `UtcIsoSchema` or `z.string().datetime()` |
| `reservations.ts` (10 fields) | Change all `z.string().datetime({ offset: true })` → `UtcIsoSchema` |
| `reservation-groups.ts` (9 fields) | Change all `z.string().datetime({ offset: true })` → `UtcIsoSchema` |

### Local patterns to eliminate

| File | Local pattern | Replace with |
|------|--------------|-------------|
| `routes/purchasing/purchase-orders.ts` | `safeDate()` (lines 50-60) | `toUtcIso.dateLike(x)` |
| `modules/reservations/src/time/timestamp.ts` | `toUnixMs()`, `fromUnixMs()` | `fromUtcIso.epochMs(x)`, `toUtcIso.epochMs(x)` |
| `modules/accounting/posting/cogs.ts` | Local `toBusinessDate(Date\|number)` (line 721, used at 653) | `fromUtcIso.dateOnly(toUtcIso.dateLike(x))` |
| `modules/accounting/posting/sync-push.ts` | Local `toDateOnly(string)` (line 496, used at 442) | `fromUtcIso.dateOnly(value)` |
| `modules/accounting/posting/sales.ts` | Local `toDateOnly(string)` (line 386) | `fromUtcIso.dateOnly(value)` |

---

## Implementation Phases

### Phase 0 — Schema validation cleanup (routes + schemas)

Files to fix before the rename, so route validation is consistent first:

| File | Fields | Current | New |
|------|--------|---------|-----|
| `routes/reports.ts` | `as_of` (×3) | `{ offset: true }` | `UtcIsoSchema` |
| `schemas/pos-sync.ts` | `trx_at`, `opened_at`, `closed_at`, etc. (×12) | `{ offset: true }` | `UtcIsoSchema` |
| `schemas/reservations.ts` | `reservation_at`, `created_at`, `updated_at`, etc. (×10) | `{ offset: true }` | `UtcIsoSchema` |
| `schemas/reservation-groups.ts` | `reservation_at`, `created_at`, `updated_at` (×9) | `{ offset: true }` | `UtcIsoSchema` |
| `routes/purchasing/purchase-invoices.ts` | date filter | raw `new Date()` | Add `UtcIsoSchema` |
| `routes/purchasing/goods-receipts.ts` | date filter | raw URL params | Add `UtcIsoSchema` |
| `routes/cash-bank-transactions.ts` | `transaction_date` | `z.string().optional()` | Validate or remove |
| `sync-core/src/types/index.ts` | `timestamp` (×2) | `z.string().datetime()` | `UtcIsoSchema` |

### Phase 1 — Core (`datetime.ts` + `date-helpers.ts`)

1. Rewrite `packages/shared/src/schemas/datetime.ts`:
   - Add `UtcIsoSchema = z.string().datetime()` (stricter — no offset)
   - Add `toUtcIso` namespace object
   - Add `fromUtcIso` namespace object
   - Keep all old exports as thin wrappers calling the new API (backward-compat during transition)
   - Keep `RfcDateTimeSchema` as a deprecated alias for `UtcIsoSchema`
2. Update `apps/api/src/lib/date-helpers.ts` — re-export both old and new
3. **Build and verify** — everything still compiles

### Phase 2 — Mechanical renames (~55 consumer files)

Batch `sed` replacements on **all `.ts` files in `packages/` and `apps/`** (excluding node_modules, dist, and datetime.ts itself):

**Step 2a — Function call renames:**

| Pattern | Replacement | Notes |
|---------|-------------|-------|
| `toRfc3339Required(` | `toUtcIso.dateLike(` | Only function calls (has `(`). Safe: does NOT match import lines. |
| `toUtcInstant(` | `toUtcIso.dateLike(` | |
| `normalizeDate(` | `toUtcIso.businessDate(` | ⚠️ Will also match method definitions. See note below. |
| `toEpochMs(` | `fromUtcIso.epochMs(` | |
| `fromEpochMs(` | `toUtcIso.epochMs(` | |
| `toMysqlDateTime(` | `fromUtcIso.mysql(` | |
| `toBusinessDate(` | `fromUtcIso.businessDate(` | |
| `toDateOnly(` | `fromUtcIso.dateOnly(` | |
| `fromUtcInstant(` | `fromUtcIso.localDisplay(` | |
| `formatForDisplay(` | `fromUtcIso.localDisplay(` | |
| `asOfDateToUtcRange(` | `toUtcIso.asOfDateRange(` | |
| `toDateTimeRangeWithTimezone(` | `toUtcIso.dateRange(` | |
| `RfcDateTimeSchema` | `UtcIsoSchema` | |

⚠️ **`toRfc3339(` function calls are NOT renamed in this sed pass.** The string `toRfc3339` appears in both function calls (`toRfc3339(x)`) and the deprecated wrapper definition (`export function toRfc3339`). Doing a blind sed would corrupt the wrapper. Instead:
- `toRfc3339Required` sed covers ~90% of callers (all non-nullable uses)
- The remaining `toRfc3339(` nullable callers (4 files) are handled manually in Phase 3

⚠️ **`normalizeDate(` sed will match METHOD DEFINITIONS too** — `private normalizeDate(...)` would incorrectly become `private toUtcIso.businessDate(...)`. One file affected:
- `modules/accounting/reconciliation/subledger/ar-reconciliation-service.ts` (line 293)
- This file is handled manually in Phase 3

**Step 2b — Import fixup (add `toUtcIso`/`fromUtcIso` where missing):**

After function call renames, many files will use `toUtcIso.dateLike(...)` or `fromUtcIso.epochMs(...)` without having `toUtcIso` or `fromUtcIso` in their imports. The Phase 2 sed used `toRfc3339Required(` (with paren), so import lines were NOT affected. Run a script to fix imports:

```typescript
// For each file with toUtcIso.dateLike( calls:
//   If import from @jurnapod/shared exists:
//     Has toRfc3339Required? → Replace with toUtcIso
//     Has toRfc3339 but NOT toRfc3339Required? → Replace with toUtcIso
//     Has both toRfc3339 and toRfc3339Required? → Replace both with single toUtcIso
//     Has neither? → Add toUtcIso to the import
//   If import from @jurnapod/shared does NOT exist:
//     Add import { toUtcIso } from "@jurnapod/shared"
//
// For each file with fromUtcIso.epochMs( or fromUtcIso.mysql( calls:
//   Same logic but for fromUtcIso instead of toUtcIso
//
// Dedup: if file ends up with import { toUtcIso, fromUtcIso } from "..."
//   both are needed — keep both
```

### Phase 3 — Manual touch-ups

1. **5 `toMysqlDateTimeFromDateLike` callers** → `fromUtcIso.mysql(toUtcIso.dateLike(x))`
2. **`modules/reservations/src/time/timestamp.ts`** local helpers → replace with `toUtcIso.epochMs()` / `fromUtcIso.epochMs()`
3. **3 posting layer local helpers**:
   - `cogs.ts:721` local `toBusinessDate` → `fromUtcIso.dateOnly(toUtcIso.dateLike(x))`
   - `sync-push.ts:496` local `toDateOnly` → `fromUtcIso.dateOnly(value)` (line 442 usage too)
   - `sales.ts:386` local `toDateOnly` → `fromUtcIso.dateOnly(value)`
4. **`purchase-orders.ts`** local `safeDate()` → `toUtcIso.dateLike(x)` (blocked until after Phase 1)
5. **Nullable `toRfc3339(` callers (4 files)** — review and add `{ nullable: true }`:
   - `company-service.ts` — `toRfc3339(row.deleted_at)` → `toUtcIso.dateLike(row.deleted_at, { nullable: true })`
   - `lib/companies.ts` — `toRfc3339(row.deleted_at)` → `toUtcIso.dateLike(row.deleted_at, { nullable: true })`
   - `lib/static-pages.ts` — `toRfc3339(row.published_at)` → `toUtcIso.dateLike(row.published_at, { nullable: true })`
   - `lib/static-pages-admin.ts` — `toRfc3339(row.published_at)` ×2 → `toUtcIso.dateLike(row.published_at, { nullable: true })`
6. **Import dedup after Phase 2b import fixup** — the import fixup script replaces old function names with `toUtcIso`. If a file had both `toRfc3339` and `toRfc3339Required`, the fixup replaces both with `toUtcIso`, potentially creating `toUtcIso, toUtcIso`. Clean to single `toUtcIso`. Also check for `toUtcIso, fromUtcIso` case (both needed — keep both).
7. **`ar-reconciliation-service.ts` normalizeDate method** — Phase 2 sed will corrupt the method definition `private normalizeDate(...)` into `private toUtcIso.businessDate(...)`. Fix manually: keep the method name as-is, only rename the imported call inside the method body.
8. **Raw `.toISOString()` Pattern A** → `nowUTC()` (~14 files: health routes, telemetry, report timestamps, import/export, numbering)
9. **Raw `.toISOString()` Pattern B** → `toUtcIso.dateLike(x)` (~30 files: all response mappers in purchasing services, reservation sync, dinein routes, progress routes, accounting ap-exceptions, lib files)
10. **Raw `.toISOString()` Pattern C** → `fromUtcIso.dateOnly(toUtcIso.dateLike(x))` (~20 files: fiscal-year, journals, ap-aging, ap-payment, purchase-invoice, purchase-credit, common-utils, report-context, variant-price-resolver, etc.)
11. **Raw `.toISOString()` Pattern D** → `fromUtcIso.mysql(toUtcIso.dateLike(x))` (~3 files: export/streaming, ap-exceptions)
12. **Local format helpers**:
    - `fiscal-year/service.ts` `formatDateOnlyFromUnknown` → `fromUtcIso.dateOnly(toUtcIso.dateLike(x))`
    - `shared/common-utils.ts` `formatDateOnlyFromUnknown` → `fromUtcIso.dateOnly(toUtcIso.dateLike(x))`
13. **`datetime.test.ts`** — update tests for new API
14. **`date-helpers/normalize.test.ts`** — update `toRfc3339` → `toUtcIso.dateLike`

### Phase 4 — Cleanup

1. **Build all packages + API**, fix any type errors
2. **Run full API test suite**
3. **Remove deprecated wrappers** from `datetime.ts` once all consumers migrated
4. **Update `date-helpers.ts`** to only re-export new API

### Phase 5 — Follow-up (optional)

- Add `Z$` format assertions to integration tests for datetime response fields
- Consolidate 5 module-local `DateOnlySchema` copies into imports from `@jurnapod/shared`

---

## Risk Assessment

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Phase 2 sed `toRfc3339Required(` uses open-paren — safe from import corruption | None | ✅ Pattern requires `(` suffix, so import lines are never matched |
| Phase 2 sed creates `toUtcIso,toUtcIso` import duplications | Medium | Phase 3 Step 6: dedup script or manual cleanup |
| `toRfc3339(` nullable callers missed — code returns `string\|null` but new API throws | Medium | Phase 3 Step 5: 4 known files reviewed manually (company-service, companies.ts, static-pages, static-pages-admin) |
| Import missing `toUtcIso` after function rename sed — code won't compile | High | Phase 2 Step 2b: add import fixup script. Files without imports updated will fail build. |
| `toUtcIso.dateLike(` sed catches calls inside `toUtcIso` namespace definition | Low | Only 1 file (datetime.ts). Fix manually. |
| `toRfc3339` old wrapper function overlaps with new namespace name | Medium | Old export is a function. New is an object. Phase 1 wrapper avoids compile break. |
| Route schema change from `{offset: true}` to strict breaks existing API clients | Medium | Intentionally strict. Documented as breaking change. |
| POS sync clients send offset | Medium | Deployment order: POS app first, then server. |
| `dateFrom`/`dateTo` param rename collision (`.dateRange(from, to, tz)`) | Low | Search all callers before rename. |

## Count Summary

| Category | Files affected |
|----------|---------------|
| `datetime.ts` + `date-helpers.ts` | 2 |
| Route + schema validation fixes (Phase 0) | 8 (reports, pos-sync, reservations, reservation-groups, purchase-invoices, goods-receipts, cash-bank, sync-core) |
| Core rename via sed (Phase 2) | ~55 |
| `toMysqlDateTimeFromDateLike` manual | 5 |
| Local datetime helpers in posting layer (cogs, sync-push, sales) | 3 |
| Reservations `time/timestamp.ts` local helpers | 1 |
| API lib files (direct imports) | 9 |
| Raw `.toISOString()` Pattern A (+ `nowUTC()` cleanup) | ~14 |
| Raw `.toISOString()` Pattern B (+ `toUtcIso.dateLike()` cleanup) | ~30 |
| Raw `.toISOString()` Pattern C (+ `fromUtcIso.dateOnly()` cleanup) | ~20 |
| Raw `.toISOString()` Pattern D (+ `fromUtcIso.mysql()` cleanup) | ~3 |
| Local format helpers (`fiscal-year/service.ts`, `common-utils.ts`) | 2 |
| Unit test updates (datetime.test.ts + normalize.test.ts) | 2 |
| **Total (deduplicated unique files)** | **~100+** |

**Total files touched:** ~100+. **Implementation time:** ~2-3 hours.
