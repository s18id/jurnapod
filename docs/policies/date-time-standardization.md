# Date/Time Standardization Policy

## Status

Accepted

## Effective Date

2026-04-28

## Purpose

This document is the single source of truth for date/time semantics in Jurnapod. All contributors and agents MUST follow this policy for schema design, business logic, query boundaries, and cross-package contracts.

---

## A. Storage Semantics

**Business event instants** are point-in-time business occurrences — such as a sale, a reservation booking, a journal posting, or a payment — that require unambiguous timestamp authority for audit, reconciliation, and reporting. They MUST be stored as epoch milliseconds and MUST NOT be derived from local runtime clocks or UTC projections without explicit timezone resolution.

All timestamp and date columns MUST follow the canonical suffix mapping below.

| Suffix | Format | Example | Usage |
|--------|--------|---------|-------|
| `*_ts` | `BIGINT` (epoch ms) | `1712304000000` | Canonical storage for business-critical timestamps |
| `*_at` | `DATETIME(3)` or `VARCHAR` ISO | `2026-04-15T10:00:00.000Z` | Legacy/migration compatibility; UTC ISO string is preferred at API boundaries |
| `*_date` | `DATE` (`YYYY-MM-DD`) | `2026-04-15` | Business-local calendar date with no time component |
| `created_at` | `TIMESTAMP`/`DATETIME` | System audit timestamp | Record creation metadata; always UTC |

### Storage rules

1. Business event instants MUST use `*_ts` as canonical persisted source of truth.
2. `*_at` columns MAY exist for compatibility and migration. New business-critical write paths MUST NOT treat `*_at` as the canonical source when `*_ts` exists.
3. `*_date` MUST represent a tenant business calendar date, not a UTC date projection.
4. `created_at` and `updated_at` MUST represent UTC system audit timestamps.
5. Mixed storage types MAY exist during migration phases; when both forms exist, read/write authority MUST be explicitly documented per field in module docs or ADRs.

---

## B. Timezone Resolution Policy

### Dual-mode resolution

Timezone resolution operates in two valid context modes. Callers MUST use the mode matching the available scope and MUST NOT synthesize outlet context when operating at company level.

**With outlet context** (outlet-scoped operation):
`outlet.timezone → company.timezone → error`

**Without outlet context** (company-level operation):
`company.timezone → error`

### Canonical resolution order (with outlet context)

When outlet context is available, business timezone resolution MUST follow this order exactly:

1. `outlet.timezone`
2. `company.timezone`
3. Error (throw)

### Resolution rules

1. Business date operations MUST resolve a valid IANA timezone before conversion or comparison.
2. UTC MUST NOT be used as a fallback for business date operations.
3. UTC MAY be used for:
   - system audit timestamps (`created_at`, `updated_at`), and
   - comparison zone semantics for already-UTC timestamp columns.
4. Timezone resolution helpers MUST NOT silently default to UTC or any other timezone.
5. Invalid timezone values MUST fail fast with explicit errors.

### Reference authority

- Existing module reference: `resolveTimezone(...)` in `packages/modules/reservations/src/time/timezone.ts`
- Canonical shared helper target (Story 52-2): `resolveBusinessTimezone(outletTz, companyTz)` in `@jurnapod/shared`

---

## C. Canonical Boundary Rules

### 1) Date-only columns (`DATE`)

Date-only boundaries MUST use inclusive comparisons:

```sql
col BETWEEN 'YYYY-MM-DD' AND 'YYYY-MM-DD'
```

### 2) Datetime columns (`DATETIME`, `DATETIME(3)`, `BIGINT` epoch)

Datetime filtering MUST use half-open intervals. Consumers of datetime columns MUST compute `{startUTC, nextDayUTC}` from the target business date and query:

```sql
col >= startUTC AND col < nextDayUTC
```

`<= endOfDay` style queries MAY exist only in legacy paths during migration and MUST be converted to the half-open form in Story 52 migration work.

### 3) End-of-business-day boundary

`23:59:59.999` in the resolved business timezone is the **representational compatibility boundary**, not the preferred query boundary. It exists for human-readable display and for compatibility with external systems that require end-of-day string representation.

- The preferred query strategy for datetime columns is `< nextDayUTC` (half-open interval per C.2), which avoids storage precision differences between `DATETIME`, `DATETIME(3)`, and `BIGINT` epoch columns.
- `23:59:59` without milliseconds MUST NOT be used for canonical end-of-day boundaries.
- Hand-constructed strings such as `` `${date}T23:59:59.999Z` `` MUST NOT be composed directly from date strings for business-day logic.
- `normalizeDate(dateStr, timezone, "end")` output is the canonical and required form for end-of-day boundary strings in representational contexts.

### 4) Overlap rule

Interval overlap MUST use:

```text
a_start < b_end && b_start < a_end
```

`end == next start` MUST be treated as non-overlap.

### 5) Index safety rule

Queries MUST NOT wrap indexed timestamp columns in SQL functions.

- Allowed: apply timezone/date functions to constants before query execution.
- Forbidden: `WHERE DATE(indexed_col) = ...` when `indexed_col` is indexed.

---

## D. As-Of Date and Cut-Off Date Semantics

### Canonical query terms

For datetime column filtering, consumers MUST use the **half-open range** form:

- `asOfRangeUTC` / `cutOffRangeUTC`: the canonical query execution terms, expressed as `{startUTC, nextDayUTC}`.
  - Query: `col >= startUTC AND col < nextDayUTC`
  - Computation authority: `asOfDateToUtcRange(dateStr, timezone)` (Story 52-2) returning `{startUTC, nextDayUTC}` where `dateStr` is `asOfDate` or `cutOffDate`.
  - Interim migration composition MAY use existing helpers, but implementations MUST keep the query contract `>= startUTC AND < nextDayUTC`.

### Compatibility alias terms

The following terms exist for compatibility and migration alignment only and MUST NOT be used as the primary query strategy:

- `asOfDateUtcEnd`: compatibility alias — UTC instant for end-of-day of `asOfDate`, computed via `normalizeDate(asOfDate, timezone, "end")`.
- `cutOffUtcEnd`: compatibility alias — computed with the same logic as `asOfDateUtcEnd`.

### Date-only terms

1. `asOfDate` MUST be a `YYYY-MM-DD` business calendar date in the tenant's resolved timezone.
2. `asOfEpochMs` MUST be the epoch millisecond value representing the current instant (Temporal-based equivalent of current time).
3. `cutOffDate` MUST use the same semantic shape as `asOfDate` (`YYYY-MM-DD` business boundary date).

### Usage rules

1. APIs accepting `asOfDate` or `cutOffDate` MUST validate `YYYY-MM-DD` format and reject invalid dates.
2. Business inclusion/exclusion decisions tied to cutoff boundaries MUST use the canonical half-open range (`>= startUTC, < nextDayUTC`).
3. Direct UTC-midnight interpretation of `asOfDate` or `cutOffDate` MUST NOT be used unless an ADR explicitly defines UTC-calendar semantics for that domain.

---

## E. Conversion Authority

The table below defines mandatory conversion authority by direction.

| Direction | Canonical Utility | Notes |
|----------|-------------------|-------|
| Validate RFC3339 datetime input | `isValidDateTime()` (`@jurnapod/shared`) | Rejects invalid rollovers and malformed offsets |
| Validate business date (`YYYY-MM-DD`) | `DateOnlySchema` / `isValidDate()` (`@jurnapod/shared`) | Use for `asOfDate`, `cutOffDate`, range params |
| Validate timezone | `isValidTimeZone()` (`@jurnapod/shared`) | IANA validation only |
| Resolve business timezone (dual-mode) | `resolveBusinessTimezone(outletTz, companyTz)` (`@jurnapod/shared`, Story 52-2) | MUST implement dual-mode resolution and MUST throw on unresolved/invalid |
| Business date + timezone → UTC half-open range | `asOfDateToUtcRange(dateStr, timezone)` (`@jurnapod/shared`, Story 52-2) | Canonical `{startUTC, nextDayUTC}` computation for datetime filters (`dateStr` = `asOfDate` or `cutOffDate`) |
| Business date + timezone → UTC boundary | `normalizeDate(dateStr, timezone, "start"|"end")` (`@jurnapod/shared`) | Canonical start/end business day conversion |
| UTC instant → business date | `toBusinessDate(utcAt, timezone)` (`@jurnapod/shared`) | Derive local business calendar date |
| Epoch ms → business date | `businessDateFromEpochMs(epochMs, timezone)` (`@jurnapod/shared`, Story 52-2) | Derive local business calendar date from canonical storage; interim composition: `toBusinessDate(fromEpochMs(epochMs), timezone)` |
| Epoch ms → period boundaries | `epochMsToPeriodBoundaries(epochMs, timezone)` (`@jurnapod/shared`, Story 52-2) | Derive start/end UTC instants for the business period containing the given epoch ms |
| UTC instant ↔ epoch ms | `toEpochMs()` / `fromEpochMs()` (`@jurnapod/shared`) | Canonical `*_ts` conversion |
| RFC3339 with offset → UTC instant | `toUtcInstant()` (`@jurnapod/shared`) | Canonical normalization |
| UTC instant → zoned ISO display form | `fromUtcInstant()` (`@jurnapod/shared`) | For display/serialization contexts |
| Temporal current instant | `Temporal.Now.instant()` (`@js-temporal/polyfill`) | Use in business logic in place of native Date |

### Authority rules

1. New business logic MUST use Temporal-backed and shared utilities for conversion and boundary math.
2. Native `Date` conversion helpers MAY remain in legacy compatibility paths during migration, but new policy-compliant paths MUST use canonical helpers.
3. Module-specific helpers MUST delegate to shared canonical helpers when shared equivalents exist.

---

## F. Prohibited Patterns

The following patterns are prohibited in business date/time logic:

1. `new Date()` in business logic  
   **Why:** uses runtime/system-local assumptions and bypasses tenant timezone resolution.

2. `Date.now()` for business timestamps  
   **Why:** non-deterministic clock access without explicit Temporal policy and timezone semantics.

3. Manual `.slice(0, 10)` on ISO strings for date extraction in business logic  
   **Why:** strips timezone context and can produce incorrect business dates near offset boundaries.  
   **Allowed only inside** canonical shared helpers that perform timezone-aware normalization first; all other raw/manual usage is prohibited.

4. `` `${dateStr} 23:59:59` `` string concatenation for cutoff logic  
   **Why:** bypasses timezone normalization and millisecond precision rules.

5. `UNIX_TIMESTAMP() * 1000` in SQL for business timestamps  
   **Why:** depends on server/session timezone and causes environment-dependent behavior.

6. UTC fallback (`?? 'UTC'`) for business date operations  
   **Why:** masks missing tenant timezone configuration and produces silent correctness drift.

7. `getFullYear()/getMonth()/getDate()` on native `Date` for business semantics  
   **Why:** returns values in runtime locale/timezone, not tenant timezone.

8. `new Date(dateStr).getTime()` on `YYYY-MM-DD` strings  
   **Why:** parsing semantics are runtime-dependent and ambiguous for business-local dates.

---

## Compliance and Enforcement

1. Code review for date/time changes MUST explicitly verify compliance with this policy.
2. New date/time utilities MUST be added to `@jurnapod/shared` and documented here before broad adoption.
3. Story-level acceptance criteria for date/time stories MUST reference this policy directly.
4. Any exception MUST be documented in a dedicated ADR and include:
   - scope,
   - rationale,
   - owner,
   - deprecation or migration plan.
