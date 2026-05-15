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
5. Inconsistent timezone fallback behavior for business date operations.
6. Mixed storage patterns (`BIGINT` epoch ms, `DATETIME`, and ISO string variants) without explicit conversion authority.

---

## Decision

### Rule 1: Epoch Milliseconds as Canonical Internal Representation

| Layer | Rule |
|-------|------|
| **Internal representation** | Epoch milliseconds (`TimestampMs` — `number`) |
| **Business logic** | Operates on epoch milliseconds only |
| **API input** | MAY accept ISO datetime strings; boundary MUST normalize to epoch ms immediately |
| **API output** | MAY return ISO datetime strings during migration; epoch ms is the canonical internal form |
| **DB write (BIGINT `*_ts`)** | Write epoch milliseconds directly |
| **DB read (BIGINT `*_ts`)** | Read as epoch milliseconds |
| **DB write (DATETIME `*_at`)** | Epoch ms → `YYYY-MM-DD HH:mm:ss` via conversion helper |
| **DB read (DATETIME `*_at`)** | `YYYY-MM-DD HH:mm:ss` → epoch ms via conversion helper |
| **YYYY-MM-DD (business date)** | Separate domain. `DateOnlySchema` — not a UTC instant. |

**Conversion flow:**
```
API INPUT (ISO string allowed during migration)
  ↓ boundary normalization (ISO → epoch ms)
Epoch ms  ←── business logic layer
  ↓ conversion helper at DB write
DB (DATETIME or BIGINT)
  ↑ conversion helper at DB read
Epoch ms  ←── business logic layer
  ↓ conversion at boundary
API OUTPUT (ISO string MAY be returned during migration)
```

### Rule 2: Storage Suffix Convention

| Suffix | Storage | Example |
|--------|---------|---------|
| `*_ts` | `BIGINT` — Unix ms | `reservation_start_ts` |
| `*_at` | `DATETIME` | `created_at`, `posted_at` |
| `*_date` | `DATE` — business date only | `invoice_date` |
| `created_at` | `DATETIME` — audit trail | `created_at` |

Business event instants MUST use `*_ts` as canonical source of truth. `*_at` MAY exist for compatibility only.

### Rule 3: Timezone Resolution — Deterministic Fallback Required

Business timezone resolution MUST follow explicit input:

- **Preferred path:** explicit timezone input.
- **Missing timezone:** the implementation MUST define a deterministic fallback policy (either UTC or company default timezone) and apply it consistently.
- The fallback policy MUST be documented in the relevant module docs or ADR.
- UTC MUST NOT be used as a silent fallback for business date operations unless UTC is the explicitly documented fallback for that domain.

### Rule 4: Boundary Rules — Canonical Half-Open Intervals

| Column type | Query boundary |
|-------------|---------------|
| `DATE` | Inclusive `BETWEEN start AND end` |
| `DATETIME` / `BIGINT` | Half-open interval: `>= startUTC AND < nextDayUTC` |

`23:59:59.999` is a representational compatibility boundary for display/export — it is **not** the canonical query boundary for datetime column filtering.

**Overlap rule:** `a_start < b_end && b_start < a_end` — `end == next start` is **non-overlap**.

### Rule 5: Prohibited Patterns

The following are **forbidden** in business logic paths:

| Pattern | Replacement |
|---------|-------------|
| `new Date()`, `Date.now()` | `Temporal.Instant.now()` or epoch-ms-based helper |
| `.slice(0, 10)` or equivalent on ISO strings for business date extraction | Canonical timezone-aware helper |
| UTC fallback (`?? 'UTC'`) for business flows requiring tenant timezone | Explicit fallback policy (UTC or company default) documented per domain |
| String-concatenated date boundaries | Use half-open interval helpers |
| `UNIX_TIMESTAMP() * 1000` in SQL for business timestamps | Use epoch milliseconds from application layer |
| `getFullYear()/getMonth()/getDate()` on native `Date` for business semantics | Temporal-backed helpers with timezone |

### Rule 6: No Mandatory `toUtcIso`/`fromUtcIso` Dependency

The `toUtcIso`/`fromUtcIso` namespaced API from `@jurnapod/shared` is one valid implementation path but is not the mandatory enforcement mechanism. Internal business logic MUST normalize to epoch milliseconds at boundaries; the choice of helper library is left to the implementation.

`UtcIsoSchema` and the Z-string-first validation approach are not mandated as universal enforcement. ISO string handling at API boundaries MAY use standard Zod `z.string().datetime()` during migration, with normalization to epoch ms at the boundary.

---

## Migration Notes

- API routes and sync handlers MAY continue to accept ISO datetime strings during the migration phase.
- Internal business logic MUST normalize received ISO strings to epoch milliseconds immediately at the boundary before processing.
- Legacy `<= endOfDay` query paths and `*_at`-canonical paths require staged migration toward `*_ts` authority and half-open intervals.
- All domains MUST define and document their deterministic timezone fallback policy.

---

## Consequences

### Positive
- Epoch ms is a language-agnostic canonical type that eliminates Z-string normalization overhead in business logic.
- Business logic becomes simpler: operate on `number`, convert only at boundaries.
- Deterministic timezone fallback removes silent correctness drift from missing configuration.

### Negative / Migration Cost
- Existing code paths that rely on Z-string throughout require boundary normalization.
- Legacy `*_at`-canonical paths and `<= endOfDay` queries require staged migration.
- Module-level documentation MUST specify the deterministic fallback policy per domain.

### Testing Impact
- Integration tests for date boundaries **MUST** validate timezone-specific start/end conversion.
- Tests **MUST** include DST transition cases for applicable IANA zones.
- Tests **MUST** verify overlap logic invariants (`end == next start` is non-overlap).
- API boundary tests **MUST** validate that ISO strings are normalized to epoch ms before reaching business logic.

---

## Compliance

Enforced through architecture governance, code review, and static checks per `docs/policies/date-time-standardization.md` §H.

1. **Code review checklist** MUST include: timezone fallback policy check, boundary rule check, prohibition check for native `Date` in business paths, epoch-ms normalization check at API boundaries.
2. **Lint/static policy** MUST evolve to flag prohibited patterns in business modules.
3. **Architecture stories** MUST implement incremental migration and validation against this ADR and policy.
4. **Exceptions** MUST be documented via ADR with explicit scope, owner, rationale, and migration plan.
