# Date/Time Standardization Policy

## Status

Accepted

## Effective Date

2026-04-28

## Purpose

This document is the single source of truth for date/time semantics in Jurnapod. All contributors and agents MUST follow this policy for schema design, business logic, query boundaries, and cross-package contracts.

---

## A. Storage Semantics

**Business event instants** are point-in-time business occurrences — such as a sale, a reservation booking, a journal posting, or a payment — that require unambiguous timestamp authority for audit, reconciliation, and reporting. They MUST be stored as epoch milliseconds (`BIGINT`) and MUST NOT be derived from local runtime clocks without explicit timezone resolution.

All timestamp and date columns MUST follow the canonical suffix mapping below.

| Suffix | Format | Example | Usage |
|--------|--------|---------|-------|
| `*_ts` | `BIGINT` (epoch ms) | `1712304000000` | Canonical storage for business-critical timestamps |
| `*_at` | `DATETIME(3)` or `VARCHAR` ISO | `2026-04-15T10:00:00.000Z` | Legacy/migration compatibility; UTC ISO string MAY be used at API boundaries during migration |
| `*_date` | `DATE` (`YYYY-MM-DD`) | `2026-04-15` | Business-local calendar date with no time component |
| `created_at` | `TIMESTAMP`/`DATETIME` | System audit timestamp | Record creation metadata; always UTC |

### Storage rules

1. Business event instants MUST use `*_ts` as canonical persisted source of truth.
2. `*_at` columns MAY exist for compatibility and migration. New business-critical write paths MUST NOT treat `*_at` as the canonical source when `*_ts` exists.
3. `*_date` MUST represent a tenant business calendar date, not a UTC date projection.
4. `created_at` and `updated_at` MUST represent UTC system audit timestamps.
5. Mixed storage types MAY exist during migration phases; when both forms exist, read/write authority MUST be explicitly documented per field in module docs or ADRs.

---

## B. Internal Representation

### Canonical internal type

**Epoch milliseconds (`TimestampMs` — `number`)** is the canonical internal representation for all business event instants.

- Business logic MUST operate on epoch milliseconds internally.
- Conversions to/from ISO strings or display forms MUST occur only at API boundaries or representational contexts.
- API routes and sync interfaces MAY accept or return ISO datetime strings during migration; the internal business logic MUST normalize received ISO strings to epoch ms immediately at the boundary.

### API boundary normalization rule

When an API route or sync handler receives an ISO datetime string:
1. The boundary validation layer MUST normalize it to epoch milliseconds before passing to business logic.
2. Business logic MUST NOT receive or emit ISO strings as canonical values.

---

## C. Timezone Resolution Policy

### Explicit timezone path

Business timezone operations MUST use explicit timezone input when the caller has timezone context.

### Missing timezone fallback

When timezone input is missing, the implementation MUST define a deterministic fallback policy and apply it consistently. The fallback policy MUST be one of:
- **UTC** — when the domain or context does not require tenant-specific business hours, or
- **Company default timezone** — when tenant-specific business hours are required.

The chosen fallback MUST be documented in the relevant module documentation or ADR and MUST NOT change silently at runtime.

### Out-of-context resolution

When no outlet or company context is available for timezone resolution, the fallback policy for the domain MUST be applied. UTC MUST NOT be used as a silent fallback for business date operations unless UTC is the explicitly documented fallback for that domain.

### Reference authority

- Existing module reference: `resolveTimezone(...)` in `packages/modules/reservations/src/time/timezone.ts`
- Canonical shared helper target: `resolveBusinessTimezone(outletTz, companyTz)` in `@jurnapod/shared`

---

## D. Canonical Boundary Rules

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

`<= endOfDay` style queries MAY exist only in legacy paths during migration and MUST be converted to the half-open form.

### 3) End-of-business-day boundary

`23:59:59.999` in the resolved business timezone is the **representational compatibility boundary** and MUST NOT be used as the canonical query boundary. It exists for human-readable display and for compatibility with external systems that require end-of-day string representation.

- The canonical query strategy for datetime columns is `< nextDayUTC` (half-open interval per D.2), which avoids storage precision differences between `DATETIME`, `DATETIME(3)`, and `BIGINT` epoch columns.
- `23:59:59` without milliseconds MUST NOT be used for canonical end-of-day boundaries.
- Hand-constructed strings such as `` `${date}T23:59:59.999Z` `` MUST NOT be composed directly from date strings for business-day logic.
- Canonical timezone-aware helpers MUST be used for end-of-day boundary strings in representational contexts.

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

## E. As-Of Date and Cut-Off Date Semantics

### Canonical query terms

For datetime column filtering, consumers MUST use the **half-open range** form:

- `asOfRangeUTC` / `cutOffRangeUTC`: the canonical query execution terms, expressed as `{startUTC, nextDayUTC}`.
  - Query: `col >= startUTC AND col < nextDayUTC`
  - Computation authority: canonical helper returning `{startUTC, nextDayUTC}` where `dateStr` is `asOfDate` or `cutOffDate`.
  - Interim migration composition MAY use existing helpers, but implementations MUST keep the query contract `>= startUTC AND < nextDayUTC`.

### Compatibility alias terms

The following terms exist for compatibility and migration alignment only and MUST NOT be used as the primary query strategy:

- `asOfDateUtcEnd`: compatibility alias — UTC instant for end-of-day of `asOfDate`, computed via canonical helper.
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

## F. Conversion Rules

### Boundary conversions

| Direction | Canonical Utility | Notes |
|-----------|-------------------|-------|
| Business date → UTC half-open range | Canonical helper (`asOfDateToUtcRange` or equivalent) | Returns `{startUTC, nextDayUTC}` for half-open queries |
| Business date → UTC boundary | Canonical helper for start/end | Produces normalized boundary strings |
| Epoch ms → business date | Canonical helper using Temporal | Temporal.Instant.fromEpochMilliseconds followed by timezone-aware extraction |
| UTC instant → business date | Canonical helper using Temporal | Timezone-aware date extraction |
| Epoch ms → period boundaries | Canonical helper | Derives start/end UTC instants for the business period |

### Validation helpers

| Purpose | Helper |
|---------|--------|
| Validate ISO datetime input | `isValidDateTime()` or Zod `z.string().datetime()` |
| Validate business date (`YYYY-MM-DD`) | `DateOnlySchema` / `isValidDate()` |
| Validate timezone | `isValidTimeZone()` |

---

## G. Prohibited Patterns

The following patterns are prohibited in business date/time logic:

1. `new Date()` in business logic  
   **Why:** uses runtime/system-local assumptions and bypasses tenant timezone resolution.

2. `Date.now()` for business timestamps  
   **Why:** non-deterministic clock access without explicit Temporal policy and timezone semantics.

3. **Manual string slicing** (`.slice(0, 10)`, `.substr(0, 10)`, or equivalent) on ISO strings **to extract or construct business date values** in business logic.  
   **Why:** strips timezone context and can produce incorrect business dates near offset boundaries.  
   **Allowed only inside** canonical shared helpers that perform timezone-aware normalization first.

4. `` `${dateStr} 23:59:59` `` string concatenation for cutoff logic  
   **Why:** bypasses timezone normalization and millisecond precision rules.

5. `UNIX_TIMESTAMP() * 1000` in SQL for business timestamps  
   **Why:** depends on server/session timezone and causes environment-dependent behavior.

6. Silent UTC fallback (`?? 'UTC'`) for business date operations when the domain requires a tenant timezone.  
   **Why:** masks missing tenant timezone configuration and produces silent correctness drift.  
   **Note:** UTC MAY be used as the documented fallback for domains or contexts where tenant-specific business hours do not apply.

7. `getFullYear()/getMonth()/getDate()` on native `Date` for business semantics  
   **Why:** returns values in runtime locale/timezone, not tenant timezone.

8. `new Date(dateStr).getTime()` on `YYYY-MM-DD` strings  
   **Why:** parsing semantics are runtime-dependent and ambiguous for business-local dates.

---

## H. Compliance and Enforcement

1. Code review for date/time changes MUST explicitly verify compliance with this policy.
2. New date/time utilities MUST be added to `@jurnapod/shared` and documented here before broad adoption.
3. Story-level acceptance criteria for date/time stories MUST reference this policy directly.
4. Any exception MUST be documented in a dedicated ADR and include:
   - scope,
   - rationale,
   - owner,
   - deprecation or migration plan.
