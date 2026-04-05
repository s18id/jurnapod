# Story 31.7b: Route Thinning - Reports Routes

## Story Summary

| Field | Value |
|-------|-------|
| Story | story-31.7b |
| Title | Route Thinning - Reports Routes |
| Status | pending |
| Type | Route Thinning |
| Priority | P1 |
| Estimate | 8h |

---

## Story

As an API Developer,
I want `routes/reports.ts` to be a thin HTTP adapter,
So that all business logic lives in `@jurnapod/modules-reporting` and routes are consistently thin.

---

## Background

`routes/reports.ts` (~900 lines, 9 endpoints) still contains:
- Query execution already delegates to `@jurnapod/modules-reporting` (via `@/lib/reports` adapter)
- Route-level orchestration (date range resolution, outlet scope, timezone)
- Repeated telemetry wrappers
- Per-endpoint schema + response shape mapping

Goal: Extract shared "report context builder" to reduce orchestration duplication.

---

## Acceptance Criteria

1. Extract shared report context builder helper (date range, outlet scope, timezone, cashier-only)
2. Route handlers become thin endpoint declarations + schema + output mapping
3. Routes contain only HTTP concerns (validation, auth, response)
4. Routes do not import `getDbPool`, `pool.execute`, or SQL helpers
5. `npm run typecheck -w @jurnapod/api` passes
6. `npm run build -w @jurnapod/api` passes

---

## Tasks

- [ ] Audit `routes/reports.ts` for shared orchestration patterns
- [ ] Extract report context builder helper
- [ ] Refactor routes to use context builder
- [ ] Consolidate telemetry wrappers
- [ ] Run typecheck + build

---

## Validation

```bash
npm run typecheck -w @jurnapod/api
npm run build -w @jurnapod/api
```

---

## Dependencies

- None (can run in parallel with 31.7a and 31.7c)
