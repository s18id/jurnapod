# Datetime Standardization — Summary

## Contract (Z Only Everywhere)

| Layer | Rule |
|-------|------|
| **API input** | `z.string().datetime()` — Z only, reject offset. No `{offset: true}` anywhere. |
| **Business logic** | Z string only (`"2026-03-16T10:30:00.000Z"`) |
| **API output** | Z only (already the case) |
| **DB write (DATETIME)** | `fromUtcIso.mysql(zStr)` — Z → YYYY-MM-DD HH:mm:ss |
| **DB read (DATETIME)** | `toUtcIso.dateLike(dbVal)` — Date/MySQL → Z |
| **DB write (BIGINT)** | `fromUtcIso.epochMs(zStr)` — Z → epoch ms |
| **DB read (BIGINT)** | `toUtcIso.epochMs(ms)` — epoch ms → Z |
| **YYYY-MM-DD (business date)** | Separate domain (not a UTC instant). `DateOnlySchema` stays as-is. |

## Conversion Flow

```
API INPUT (Z only)
  ↓ Z validation
Always Z string  ←── business logic layer
  ↓ fromUtcIso.mysql() / fromUtcIso.epochMs()
DB (DATETIME or BIGINT)
  ↑ toUtcIso.dateLike() / toUtcIso.epochMs()
Always Z string  ←── business logic layer
  ↓ response serialization
API OUTPUT (Z only)
```

## New API Surface

### Standalone (unchanged)
- `nowUTC()` — current time as Z string
- `isValidTimeZone(tz)` — IANA validation
- `resolveBusinessTimezone(outlet?, company?)` — outlet→company→error
- `resolveEventTime({at?, ts?, date?, ...})` — flexible router

### `toUtcIso` (produce Z string)
| Method | Signature | Replaces |
|--------|-----------|----------|
| `.dateLike(value, opts?)` | `(Date\|string, {nullable?}) => string\|null` | `toRfc3339`, `toRfc3339Required`, `toUtcInstant` |
| `.epochMs(ms)` | `(number) => string` | `fromEpochMs` |
| `.businessDate(date, tz, boundary)` | `(string, string, 'start'\|'end') => string` | `normalizeDate` |
| `.asOfDateRange(date, tz)` | `(string, string) => {startUTC, nextDayUTC}` | `asOfDateToUtcRange` |
| `.dateRange(from, to, tz)` | `(string, string, string) => {fromStartUTC, toEndUTC}` | `toDateTimeRangeWithTimezone` |

### `fromUtcIso` (consume Z string)
| Method | Signature | Replaces |
|--------|-----------|----------|
| `.epochMs(iso)` | `(string) => number` | `toEpochMs` |
| `.mysql(iso)` | `(string) => string` | `toMysqlDateTime` |
| `.businessDate(iso, tz)` | `(string, string) => string` | `toBusinessDate` |
| `.localDisplay(iso, tz, opts?)` | `(string, string, {includeTime?}) => string` | `fromUtcInstant` + `formatForDisplay` |
| `.dateOnly(iso)` | `(string) => string` | `toDateOnly` |

### New Zod Schema
- `UtcIsoSchema = z.string().datetime()` (no offset) — replaces `RfcDateTimeSchema`

### Dropped (12 functions)
`toRfc3339`, `toRfc3339Required`, `toUtcInstant`, `toMysqlDateTimeFromDateLike`, `addDays`, `compareDates`, `isInFiscalYear`, `resolveEventTimeDetails`, `isValidDateTime` (private), `isValidDate` (private), `businessDateFromEpochMs`, `epochMsToPeriodBoundaries` (move to accounting), `formatForDisplay`, `RfcDateTimeSchema`

## Files Affected (~100+)

### Route schema fixes (8 files — Phase 0)
`routes/reports.ts`, `schemas/pos-sync.ts`, `schemas/reservations.ts`, `schemas/reservation-groups.ts`, `routes/purchase-invoices.ts`, `routes/goods-receipts.ts`, `routes/cash-bank-transactions.ts`, `sync-core/src/types/index.ts`

### Core rename sed (~55 files — Phase 2)
All files using `toRfc3339Required`, `normalizeDate`, `toEpochMs`, `fromEpochMs`, `toMysqlDateTime`, `toDateOnly`, `fromUtcInstant`, `formatForDisplay`, `asOfDateToUtcRange`, `toDateTimeRangeWithTimezone`

### Manual touch-ups (Phase 3)
- 5 `toMysqlDateTimeFromDateLike` callers (posting layer)
- `reservations/time/timestamp.ts` local helpers
- 3 posting layer local helpers (`cogs.ts`, `sync-push.ts`, `sales.ts`)
- `purchase-orders.ts` local `safeDate()`
- 4 nullable `toRfc3339(` callers (need `{nullable: true}`)
- `ar-reconciliation-service.ts` normalizeDate method collision
- Pattern A (~14 files, `new Date().toISOString()` → `nowUTC()`)
- Pattern B (~30 files, `value.toISOString()` → `toUtcIso.dateLike(x)`)
- Pattern C (~20 files, `.slice(0,10)` → `fromUtcIso.dateOnly(...)`)
- Pattern D (~3 files, MySQL slice → `fromUtcIso.mysql(...)`)
- 2 local format helpers (`fiscal-year/service.ts`, `common-utils.ts`)
- 2 test files

## Implementation Phases

| Phase | What | How |
|-------|------|-----|
| **0** | Route/schema `{offset: true}` cleanup | Manual edit (8 files) |
| **1** | Core `datetime.ts` + `date-helpers.ts` rewrite | Manual (add namespace, keep deprecated wrappers) |
| **2a** | Function call sed rename | Batch sed (~55 files, uses `(` suffix to avoid import corruption) |
| **2b** | Import fixup script | Add `toUtcIso`/`fromUtcIso` to imports, remove old names |
| **3** | Manual touch-ups | 14 steps |
| **4** | Cleanup | Build, test, remove deprecated wrappers |

## Key Risks

| Risk | Mitigation |
|------|-----------|
| `normalizeDate(` sed corrupts method definition (1 file) | Phase 3 manual fix |
| `toRfc3339(` nullable callers (4 files) need `{nullable: true}` | Phase 3 manual review |
| Imports missing after function rename sed | Phase 2b import fixup script |
| POS offline clients send offset | Deploy POS app update BEFORE server |

## Reference
Full plan: `_bmad-output/planning-artifacts/datetime-api-consolidation-plan.md`

## Decisions Made

1. **UTC ISO Z string** is the canonical internal + API format. No RFC 3339 offset strings.
2. **Namespaced API** (`toUtcIso`/`fromUtcIso`) for discoverability — the namespace tells you the direction.
3. **Old functions kept as deprecated wrappers** during transition, removed in Phase 4.
4. **`epochMsToPeriodBoundaries`** moves to `@jurnapod/modules-accounting` (accounting domain concern).
5. **`nowUTC()`** stays standalone — it's the most-used function and doesn't benefit from namespacing.
