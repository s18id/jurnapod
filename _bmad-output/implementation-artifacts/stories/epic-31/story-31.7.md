# Story 31.7: Route Thinning Enforcement (accounts, inventory, reports)

## Story Summary

| Field | Value |
|-------|-------|
| Story | story-31.7 |
| Title | Route Thinning Enforcement (accounts, inventory, reports) |
| Status | **SUPERSEDED** - Split into 31.7a, 31.7b, 31.7c |
| Type | Route Thinning |
| Sprint | 2 of 3 |
| Priority | P1 |
| Estimate | 14h |

---

## Story

As an API Developer,
I want `routes/accounts.ts`, `routes/inventory.ts`, and `routes/reports.ts` to be thin HTTP adapters,
So that all business logic lives in packages and routes are consistently thin across the API.

---

## Background

This route-thinning lane is mostly independent from Import/Export and Notifications extraction. Remaining thick routes must be thinned:
- `routes/accounts.ts` (1,362 lines) — fiscal year endpoints, fixed asset endpoints
- `routes/inventory.ts` (1,079 lines) — direct DB queries for items, prices, groups
- `routes/reports.ts` (900 lines) — report execution logic

**Correction:** Fiscal-year endpoints currently live in `routes/accounts.ts` (`/accounts/fiscal-years`), not in a separate `routes/fiscal-years.ts` file.

---

## Acceptance Criteria

1. `routes/accounts.ts` delegates to `@jurnapod/modules-accounting` (or `modules-platform` for fiscal years)
2. `routes/inventory.ts` delegates to `@jurnapod/modules-inventory`
3. `routes/reports.ts` delegates to `@jurnapod/modules-reporting`
4. Routes contain only HTTP concerns (validation, auth, response)
5. Routes do not import `getDbPool`, `pool.execute`, or SQL helpers
6. Import-boundary lint rules enforced: `packages/**` cannot import `apps/api/**`
7. `npm run typecheck -w @jurnapod/api` passes
8. `npm run build -w @jurnapod/api` passes

---

## Tasks

- [ ] Audit `routes/accounts.ts` for business logic
- [ ] Audit `routes/inventory.ts` for business logic
- [ ] Audit `routes/reports.ts` for business logic
- [ ] Refactor each route to delegate to respective package
- [ ] Remove SQL/helpers from routes
- [ ] Verify fiscal-year handlers in `routes/accounts.ts` delegate to package service contracts
- [ ] Run workspace lint boundary check
- [ ] Run typecheck + build
- [ ] Integration tests for each route group

---

## Validation

```bash
npm run lint --workspaces --if-present
npm run typecheck -w @jurnapod/api
npm run build -w @jurnapod/api
```

---

## Dependencies

- None (can run in parallel with 31.5 and 31.6)
