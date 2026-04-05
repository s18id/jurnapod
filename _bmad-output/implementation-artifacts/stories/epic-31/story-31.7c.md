# Story 31.7c: Route Thinning - Accounts Routes

## Story Summary

| Field | Value |
|-------|-------|
| Story | story-31.7c |
| Title | Route Thinning - Accounts Routes |
| Status | **SUPERSEDED** - Moved to Epic 34 (story-34.1) |
| Type | Route Thinning |
| Priority | P1 |
| Estimate | 10h |

---

## Story

As an API Developer,
I want `routes/accounts.ts` to be a thin HTTP adapter,
So that all business logic lives in packages and routes are consistently thin.

---

## Background

`routes/accounts.ts` (~1,362 lines, 28 endpoints) contains:
- Fiscal year endpoints (currently backed by API lib, not module package)
- Fixed asset endpoints (CategoryService, AssetService, DepreciationService, LifecycleService)
- Repeated error mapping (code → HTTP)
- Route-side transforms (`periodKey` construction, `new Date(...)` conversions)

**Key Decision Needed:** Fiscal-year endpoints currently live in `apps/api/src/lib/fiscal-years.ts`. Decide:
- Option A: Extract fiscal-year service to `@jurnapod/modules-accounting` or `@jurnapod/modules-platform`
- Option B: Document as technical debt with explicit deferral (e.g., Epic 38)

---

## Acceptance Criteria

1. Standardize repeated error mapping into reusable mappers
2. Move route-side transforms into service boundary
3. Fiscal-year endpoints: either extract to package OR document boundary with ADR
4. Routes contain only HTTP concerns (validation, auth, response)
5. Routes do not import `getDbPool`, `pool.execute`, or SQL helpers
6. `npm run typecheck -w @jurnapod/api` passes
7. `npm run build -w @jurnapod/api` passes

---

## Tasks

- [ ] Audit `routes/accounts.ts` for repeated patterns
- [ ] Extract error mapper helper
- [ ] Move date transforms to service boundary
- [ ] Decide fiscal-year boundary (extract OR defer with ADR)
- [ ] Refactor fixed asset endpoints to use adapters only
- [ ] Run typecheck + build

---

## Validation

```bash
npm run typecheck -w @jurnapod/api
npm run build -w @jurnapod/api
```

---

## Dependencies

- None (can run in parallel with 31.7a and 31.7b)
