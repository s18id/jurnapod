# ADR-0025: Date/Time Standardization Policy

**Date:** 2026-04-28
**Status:** Accepted
**References:**
- Canonical summary: `_bmad-output/planning-artifacts/datetime-standardization-summary.md`
- Full plan: `_bmad-output/planning-artifacts/datetime-api-consolidation-plan.md`
- Policy doc: `docs/policies/date-time-standardization.md`

---

## Context

Jurnapod has accumulated inconsistent date/time handling across modules and query paths. The inconsistency has produced recurring correctness bugs in reporting windows, cut-off rules, and timezone-sensitive business flows.

Observed issues include:

1. Native `Date` usage in business logic despite existing policy and Temporal availability.
2. Multiple end-of-day boundary patterns (`23:59:59`, `23:59:59.999`, and string-concatenated `T23:59:59.999Z`).
3. No single timezone resolution authority across modules.
4. Divergent semantics for `asOfDate` and `cutOffDate`.
5. Inconsistent UTC fallback behavior where business timezone resolution is required.
6. Mixed storage patterns (`BIGINT` epoch ms, `DATETIME`, and ISO string variants) without explicit conversion authority.

---

## Decision

### Rule 1: Z Only Everywhere — No Offset

| Layer | Rule |
|-------|------|
| **API input** | `z.string().datetime()` — Z only, reject offset. No `{offset: true}` anywhere. |
| **Business logic** | Z string only (`"2026-03-16T10:30:00.000Z"`) |
| **API output** | Z only (already the case) |
| **DB write (DATETIME)** | `fromUtcIso.mysql(zStr)` — Z → `YYYY-MM-DD HH:mm:ss` |
| **DB read (DATETIME)** | `toUtcIso.dateLike(dbVal)` — Date/MySQL → Z |
| **DB write (BIGINT)** | `fromUtcIso.epochMs(zStr)` — Z → epoch ms |
| **DB read (BIGINT)** | `toUtcIso.epochMs(ms)` — epoch ms → Z |
| **YYYY-MM-DD (business date)** | Separate domain. `DateOnlySchema` stays as-is — not a UTC instant. |

**Conversion flow:**
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

### Rule 2: Namespaced API

All date/time conversions use the namespace API from `@jurnapod/shared`. Import path: `packages/shared/src/schemas/datetime.ts`.

**`toUtcIso`** — produce Z string:

| Method | Signature | Replaces |
|--------|-----------|----------|
| `.dateLike(value, opts?)` | `(Date\|string, {nullable?}) => string\|null` | `toRfc3339`, `toRfc3339Required`, `toUtcInstant` |
| `.epochMs(ms)` | `(number) => string` | `fromEpochMs` |
| `.businessDate(date, tz, boundary)` | `(string, string, 'start'\|'end') => string` | `normalizeDate` |
| `.asOfDateRange(date, tz)` | `(string, string) => {startUTC, nextDayUTC}` | `asOfDateToUtcRange` |
| `.dateRange(from, to, tz)` | `(string, string, string) => {fromStartUTC, toEndUTC}` | `toDateTimeRangeWithTimezone` |

**`fromUtcIso`** — consume Z string:

| Method | Signature | Replaces |
|--------|-----------|----------|
| `.epochMs(iso)` | `(string) => number` | `toEpochMs` |
| `.mysql(iso)` | `(string) => string` | `toMysqlDateTime` |
| `.businessDate(iso, tz)` | `(string, string) => string` | `toBusinessDate` |
| `.localDisplay(iso, tz, opts?)` | `(string, string, {includeTime?}) => string` | `fromUtcInstant` + `formatForDisplay` |
| `.dateOnly(iso)` | `(string) => string` | `toDateOnly` |

**Standalone helpers** (no namespace needed):

| Export | Signature | Purpose |
|--------|-----------|---------|
| `nowUTC()` | `() => string` | Current time as Z string |
| `isValidTimeZone(tz)` | `(string) => boolean` | IANA validation |
| `resolveBusinessTimezone(outlet?, company?)` | `(string?, string?) => string` | outlet→company→error |
| `resolveEventTime({at?, ts?, date?, ...})` | `(object) => string` | Flexible router |
| `UtcIsoSchema` | `z.string().datetime()` | Strict Z-only, no offset |

### Rule 3: Timezone Resolution Order

Business timezone resolution uses dual-mode order:

- **With outlet context** (outlet-scoped operation): `outlet.timezone → company.timezone → error`
- **Without outlet context** (company-level operation): `company.timezone → error`

UTC fallback is **forbidden** for business date operations.

### Rule 4: Boundary Rules — Canonical Half-Open Intervals

| Column type | Query boundary |
|-------------|---------------|
| `DATE` | Inclusive `BETWEEN start AND end` |
| `DATETIME` / `BIGINT` | Half-open interval: `>= startUTC AND < nextDayUTC` |

`23:59:59.999` is a representational compatibility boundary for display/export — it is **not** the preferred query boundary for datetime column filtering.

**Overlap rule:** `a_start < b_end && b_start < a_end` — `end == next start` is **non-overlap**.

### Rule 5: Prohibited Patterns

The following are **forbidden** in business logic paths:

| Pattern | Replacement |
|---------|-------------|
| `new Date()`, `Date.now()` | `nowUTC()` or `toUtcIso.dateLike()` |
| `value.toISOString()` | `toUtcIso.dateLike(x)` |
| `.slice(0,10)` on ISO strings | `fromUtcIso.dateOnly(...)` |
| MySQL date slice (`LEFT(col, 10)`) | `fromUtcIso.mysql(...)` |
| UTC fallback (`?? 'UTC'`) in business flows | `resolveBusinessTimezone()` |
| String-concatenated date boundaries | Use half-open interval helpers |
| `normalizeDate(` (ambiguous) | `toUtcIso.businessDate()` |
| `RfcDateTimeSchema` | `UtcIsoSchema` |

### Rule 6: Storage Suffix Convention

| Suffix | Storage | Example |
|--------|---------|---------|
| `*_ts` | `BIGINT` — Unix ms | `reservation_start_ts` |
| `*_at` | `DATETIME` | `created_at`, `posted_at` |
| `*_date` | `DATE` — business date only | `invoice_date` |
| `created_at` | `DATETIME` — audit trail | `created_at` |

---

## Migration Phases

| Phase | What | How |
|-------|------|-----|
| **0** | Route/schema `{offset: true}` cleanup | Manual edit (8 files) |
| **1** | Core `datetime.ts` + `date-helpers.ts` rewrite | Manual (add namespace, keep deprecated wrappers) |
| **2a** | Function call sed rename | Batch sed (~55 files) |
| **2b** | Import fixup script | Add `toUtcIso`/`fromUtcIso` to imports, remove old names |
| **3** | Manual touch-ups | 14 steps |
| **4** | Cleanup | Build, test, remove deprecated wrappers |

---

## Key Risks and Mitigations

| Risk | Mitigation |
|------|-----------|
| `normalizeDate(` sed corrupts method definition (1 file) | Phase 3 manual fix |
| `toRfc3339(` nullable callers (4 files) need `{nullable: true}` | Phase 3 manual review |
| Imports missing after function rename sed | Phase 2b import fixup script |
| POS offline clients send offset | Deploy POS app update BEFORE server |

---

## Consequences

### Positive
- Date/time behavior becomes deterministic across modules.
- Tenant business-day calculations become consistent for all IANA timezones.
- Query boundary bugs and off-by-one-day regressions are reduced.
- New work has a single reference for schema and conversion decisions.

### Negative / Migration Cost
- Existing code paths using native `Date` in business logic require migration.
- Some queries using function-wrapped indexed columns require refactor to constant-side conversion.
- Legacy `<= endOfDay` query paths and `*_at`-canonical paths require staged migration toward `*_ts` authority and half-open intervals.
- Story-level and module-level cleanup work is required across accounting, purchasing, reporting, sales, and reservations.

### Testing Impact
- Integration tests for date boundaries **MUST** validate timezone-specific start/end conversion.
- Tests **MUST** include DST transition cases for applicable IANA zones.
- Tests **MUST** verify overlap logic invariants (`end == next start` is non-overlap).
- API boundary tests **MUST** validate strict `YYYY-MM-DD` and RFC3339 input rules.

---

## Compliance

Enforced through architecture governance, code review, and static checks per `docs/policies/date-time-standardization.md` §Compliance and Enforcement.

1. **Code review checklist** MUST include: timezone resolution order check, boundary rule check, prohibition check for native `Date` and UTC fallback in business paths, conversion helper authority check.
2. **Lint/static policy** MUST evolve to flag prohibited patterns in business modules.
3. **Architecture stories in Epic 52** MUST implement incremental migration and validation against this ADR and policy.
4. **Exceptions** MUST be documented via ADR with explicit scope, owner, rationale, and migration plan.
