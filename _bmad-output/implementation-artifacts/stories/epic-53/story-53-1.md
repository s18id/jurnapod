# Story 53-1: Core API Surface + Route Validation

## Story Metadata

| Field | Value |
|-------|-------|
| Story ID | 53-1 |
| Epic | Epic 53: Datetime API Consolidation Execution |
| Title | Core API Surface + Route Validation |
| Status | backlog |
| Risk | P1 |
| Owner | dev |
| QA Gate | yes |
| Dependencies | None |

## Story

As a **developer**,  
I want `packages/shared/src/schemas/datetime.ts` to expose a namespaced `toUtcIso`/`fromUtcIso` API with strict `UtcIsoSchema`,  
So that all datetime conversions follow a discoverable, direction-indicating trunk and routes consistently reject offset datetime input.

## Context

Story 52-1 audited all datetime usage and produced the consolidation plan. This story executes **Phase 0 + Phase 1** of the plan:

- **Phase 0:** Fix 8 route/schema files that use `{offset: true}` or lack datetime validation
- **Phase 1:** Rewrite `datetime.ts` with new namespaced API (`toUtcIso`, `fromUtcIso`), `UtcIsoSchema`, and keep old exports as deprecated wrappers. Update `date-helpers.ts` re-exports.

The new API maintains full backward compatibility via deprecated wrappers — consumers continue to work during the transition period.

## Acceptance Criteria

- [ ] **AC1: Core rewrite** — `packages/shared/src/schemas/datetime.ts` exports:
  - `UtcIsoSchema = z.string().datetime()` (strict Z only, no offset)
  - `toUtcIso` namespace with `.dateLike()`, `.epochMs()`, `.businessDate()`, `.asOfDateRange()`, `.dateRange()`
  - `fromUtcIso` namespace with `.epochMs()`, `.mysql()`, `.businessDate()`, `.localDisplay()`, `.dateOnly()`
  - All old exports kept as deprecated wrappers calling new API
  - `RfcDateTimeSchema` kept as deprecated alias for `UtcIsoSchema`
- [ ] **AC2: date-helpers re-export** — `apps/api/src/lib/date-helpers.ts` re-exports both old and new API
- [ ] **AC3: Route validation** — 8 route/schema files updated to use `UtcIsoSchema`:
  - `routes/reports.ts`: 3 fields `{offset: true}` → `UtcIsoSchema`
  - `schemas/pos-sync.ts`: 12 fields `{offset: true}` → `UtcIsoSchema`
  - `schemas/reservations.ts`: 10 fields `{offset: true}` → `UtcIsoSchema`
  - `schemas/reservation-groups.ts`: 9 fields `{offset: true}` → `UtcIsoSchema`
  - `routes/purchasing/purchase-invoices.ts`: add `UtcIsoSchema` for date filter
  - `routes/purchasing/goods-receipts.ts`: add `UtcIsoSchema` for date params
  - `routes/cash-bank-transactions.ts`: validate or remove untyped `z.string().optional()`
  - `sync-core/src/types/index.ts`: use `UtcIsoSchema` import
- [ ] **AC4: Build passes** — `npm run build -w @jurnapod/shared`, `npm run typecheck -w @jurnapod/shared`, `npm run test:unit -w @jurnapod/shared` all pass
- [ ] **AC5: All old tests pass** — existing 67 datetime unit tests continue to pass (deprecated wrappers maintain backward compat)

## Bulk Migration Targets

### Core files

| # | File | Action |
|---|------|--------|
| 1 | `packages/shared/src/schemas/datetime.ts` | Rewrite: add `toUtcIso`/`fromUtcIso` namespaces, `UtcIsoSchema`, deprecated wrappers |
| 2 | `apps/api/src/lib/date-helpers.ts` | Update: add re-exports for new API, keep old re-exports |

### Route/Schema validation fixes

| # | File | Fields | Current | New |
|---|------|--------|---------|-----|
| 1 | `apps/api/src/routes/reports.ts` | `as_of` (×3) | `{ offset: true }` | `UtcIsoSchema` |
| 2 | `packages/shared/src/schemas/pos-sync.ts` | `trx_at`, `opened_at`, `closed_at`, etc. (×12) | `{ offset: true }` | `UtcIsoSchema` |
| 3 | `packages/shared/src/schemas/reservations.ts` | `reservation_at`, `created_at`, etc. (×10) | `{ offset: true }` | `UtcIsoSchema` |
| 4 | `packages/shared/src/schemas/reservation-groups.ts` | `reservation_at`, `created_at`, etc. (×9) | `{ offset: true }` | `UtcIsoSchema` |
| 5 | `apps/api/src/routes/purchasing/purchase-invoices.ts` | date filter | raw `new Date()` | `UtcIsoSchema` |
| 6 | `apps/api/src/routes/purchasing/goods-receipts.ts` | date params | raw URL params | `UtcIsoSchema` |
| 7 | `apps/api/src/routes/cash-bank-transactions.ts` | `transaction_date` | `z.string().optional()` | Validate or remove |
| 8 | `packages/sync-core/src/types/index.ts` | `timestamp` (×2) | `z.string().datetime()` | `UtcIsoSchema` |

## Tasks/Subtasks

- [ ] 1.1 Rewrite `datetime.ts` — add `UtcIsoSchema`, `toUtcIso` namespace, `fromUtcIso` namespace
- [ ] 1.2 Add deprecated wrapper aliases for all old exports in `datetime.ts`
- [ ] 1.3 Update `date-helpers.ts` — add `toUtcIso`/`fromUtcIso`/`UtcIsoSchema` to re-exports
- [ ] 1.4 Fix `routes/reports.ts` — change 3 `{offset: true}` to `UtcIsoSchema`
- [ ] 1.5 Fix `schemas/pos-sync.ts` — change all `{offset: true}` to `UtcIsoSchema`
- [ ] 1.6 Fix `schemas/reservations.ts` — change all `{offset: true}` to `UtcIsoSchema`
- [ ] 1.7 Fix `schemas/reservation-groups.ts` — change all `{offset: true}` to `UtcIsoSchema`
- [ ] 1.8 Fix `routes/purchasing/purchase-invoices.ts` — add `UtcIsoSchema` validation
- [ ] 1.9 Fix `routes/purchasing/goods-receipts.ts` — add `UtcIsoSchema` validation
- [ ] 1.10 Fix `routes/cash-bank-transactions.ts` — validate or remove untyped field
- [ ] 1.11 Fix `sync-core/src/types/index.ts` — use `UtcIsoSchema` import
- [ ] 1.12 Run build + unit tests to verify: `npm run build -w @jurnapod/shared && npm run typecheck -w @jurnapod/shared && npm run test:unit -w @jurnapod/shared`

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `packages/shared/src/schemas/datetime.ts` | Rewrite | Add namespaced API + deprecated wrappers |
| `apps/api/src/lib/date-helpers.ts` | Modify | Add new re-exports |
| `apps/api/src/routes/reports.ts` | Modify | Fix offset validation |
| `packages/shared/src/schemas/pos-sync.ts` | Modify | Fix offset validation |
| `packages/shared/src/schemas/reservations.ts` | Modify | Fix offset validation |
| `packages/shared/src/schemas/reservation-groups.ts` | Modify | Fix offset validation |
| `apps/api/src/routes/purchasing/purchase-invoices.ts` | Modify | Add datetime validation |
| `apps/api/src/routes/purchasing/goods-receipts.ts` | Modify | Add datetime validation |
| `apps/api/src/routes/cash-bank-transactions.ts` | Modify | Fix validation |
| `packages/sync-core/src/types/index.ts` | Modify | Use `UtcIsoSchema` |

## Estimated Effort

1 day

## Risk Level

P1 — Core surface change; backward compat via deprecated wrappers mitigates breaking consumers. Route validation changes are breaking for offset senders (documented risk).

## Dev Notes

- **API design:** `toUtcIso` means "produce a Z string from X"; `fromUtcIso` means "consume a Z string to produce X"
- **`toUtcIso.dateLike(value, opts?)`** replaces all of: `toRfc3339`, `toRfc3339Required`, `toUtcInstant` — uses `{nullable: true}` option for nullable input
- **`fromUtcIso.mysql(iso)`** replaces `toMysqlDateTime` — strict Z input only
- **`fromUtcIso.dateOnly(iso)`** replaces `toDateOnly` — extracts YYYY-MM-DD from Z string
- **Keep all old exports as thin wrappers** — e.g., `export function toRfc3339(value) { return toUtcIso.dateLike(value); }`
- **`UtcIsoSchema`** is `z.string().datetime()` — stricter than `RfcDateTimeSchema` which was `z.string().datetime({ offset: true })`
- **POS deployment order:** POS clients sending offset must be updated before server change. Document as known risk — do NOT block this story.
- Reference implementation detail for `toUtcIso.dateLike`:
  ```typescript
  export const toUtcIso = {
    dateLike(value: string | Date | null | undefined, opts?: { nullable?: boolean }): string | null {
      if ((value === null || value === undefined) && opts?.nullable) return null;
      if (value === null || value === undefined) throw new Error('Invalid datetime: null/undefined');
      const date = typeof value === 'string' ? new Date(value) : value;
      if (isNaN(date.getTime())) throw new Error(`Invalid datetime: ${value}`);
      return date.toISOString();
    },
    // ...
  };
  ```

## Cross-Cutting Concerns

### Validation Rules
- `UtcIsoSchema` rejects `{offset: true}` — any route accepting offset datetime will now return 400

### Error Handling
- Invalid datetime → throw (same behavior as current `toRfc3339Required`)

## Validation Evidence

```bash
npm run build -w @jurnapod/shared
npm run typecheck -w @jurnapod/shared
npm run test:unit -w @jurnapod/shared
npm run build -w @jurnapod/api
npm run typecheck -w @jurnapod/api
```

Expected: all pass; deprecated wrappers maintain backward compatibility.

## Dependencies

None — this is the foundation story for Epic 53.
