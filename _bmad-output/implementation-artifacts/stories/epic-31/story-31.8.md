# Story 31.8: Full Validation Gate + Cleanup `lib/modules-*`

## Story Summary

| Field | Value |
|-------|-------|
| Story | story-31.8 |
| Title | Full Validation Gate + Cleanup `lib/modules-*` |
| Status | pending |
| Type | Cleanup |
| Sprint | 2 of 2 |
| Priority | P1 |
| Estimate | 6h |

---

## Story

As a Platform Engineer,
I want the dead code in `apps/api/src/lib/modules-accounting/` and `lib/modules-sales/` deleted after route flipping,
So that the API lib is clean and no stale code accumulates.

---

## Background

After all extraction and route thinning, these directories should be empty/deleted:
- `apps/api/src/lib/modules-accounting/` — extracted to `@jurnapod/modules-accounting`
- `apps/api/src/lib/modules-sales/` — extracted to `@jurnapod/modules-sales`

Also check for: `lib/cash-bank.ts` (should be thin adapter), `lib/depreciation-posting.ts` (should be thin adapter), `lib/reconciliation-service.ts` (should be thin adapter).

---

## Acceptance Criteria

1. `apps/api/src/lib/modules-accounting/` deleted
2. `apps/api/src/lib/modules-sales/` deleted
3. All remaining `lib/*.ts` files are thin adapters or infrastructure (not domain logic)
4. `npm run typecheck --workspaces --if-present` passes
5. `npm run build --workspaces --if-present` passes
6. No package importing `apps/api/**` (lint check)
7. API critical test suites pass (auth, sync, posting)

---

## Technical Notes

### Files to Delete (after verification)

```
apps/api/src/lib/modules-accounting/
apps/api/src/lib/modules-sales/
```

### Files to Verify Are Thin Adapters

| File | Expected State |
|------|---------------|
| `cash-bank.ts` | Thin re-export to `@jurnapod/modules-treasury` |
| `depreciation-posting.ts` | Thin adapter to `@jurnapod/modules-accounting` |
| `reconciliation-service.ts` | Thin adapter to `@jurnapod/modules-accounting` |
| `sales-posting.ts` | Thin adapter to `@jurnapod/modules-accounting` |
| `stock.ts` | Thin adapter to `@jurnapod/modules-inventory` |

### Enforcement

```typescript
// .eslintrc or tsconfig rules
// packages/** may not import apps/api/**
```

---

## Tasks

- [ ] Verify all routes use package services (not lib directly)
- [ ] Delete `lib/modules-accounting/`
- [ ] Delete `lib/modules-sales/`
- [ ] Verify remaining lib files are thin adapters
- [ ] Run `npm run typecheck --workspaces --if-present`
- [ ] Run `npm run build --workspaces --if-present`
- [ ] Run lint check for import boundaries
- [ ] Run API critical test suites

---

## Validation

```bash
npm run typecheck --workspaces --if-present
npm run build --workspaces --if-present
npm run lint  # if import boundary rules exist
```

---

## Dependencies

- Story 31.3 (Reservations consolidation)
- Story 31.4 (Route thinning: users, companies)
- Story 31.7 (Route thinning: accounts, inventory, reports)
