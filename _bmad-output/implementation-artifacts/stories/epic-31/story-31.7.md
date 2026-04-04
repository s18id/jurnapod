# Story 31.7: Route Thinning Enforcement (accounts, inventory, reports)

## Story Summary

| Field | Value |
|-------|-------|
| Story | story-31.7 |
| Title | Route Thinning Enforcement (accounts, inventory, reports) |
| Status | pending |
| Type | Route Thinning |
| Sprint | 2 of 2 |
| Priority | P2 |
| Estimate | 6h |

---

## Story

As an API Developer,
I want `routes/accounts.ts`, `routes/inventory.ts`, and `routes/reports.ts` to be thin HTTP adapters,
So that all business logic lives in packages and routes are consistently thin across the API.

---

## Background

After Stories 31.5 and 31.6, remaining thick routes must be thinned:
- `routes/accounts.ts` (1,362 lines) — fiscal year endpoints, fixed asset endpoints
- `routes/inventory.ts` (1,079 lines) — direct DB queries for items, prices, groups
- `routes/reports.ts` (900 lines) — report execution logic

---

## Acceptance Criteria

1. `routes/accounts.ts` delegates to `@jurnapod/modules-accounting` (or `modules-platform` for fiscal years)
2. `routes/inventory.ts` delegates to `@jurnapod/modules-inventory`
3. `routes/reports.ts` delegates to `@jurnapod/modules-reporting`
4. Routes contain only HTTP concerns (validation, auth, response)
5. Routes do not import `getDbPool`, `pool.execute`, or SQL helpers
6. `npm run typecheck -w @jurnapod/api` passes
7. `npm run build -w @jurnapod/api` passes

---

## Tasks

- [ ] Audit `routes/accounts.ts` for business logic
- [ ] Audit `routes/inventory.ts` for business logic
- [ ] Audit `routes/reports.ts` for business logic
- [ ] Refactor each route to delegate to respective package
- [ ] Remove SQL/helpers from routes
- [ ] Run typecheck + build
- [ ] Integration tests for each route group

---

## Validation

```bash
npm run typecheck -w @jurnapod/api
npm run build -w @jurnapod/api
```

---

## Dependencies

- Story 31.5 (Import/Export extraction) — can proceed in parallel
- Story 31.6 (Notifications consolidation) — can proceed in parallel
