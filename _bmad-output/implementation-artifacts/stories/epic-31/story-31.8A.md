# Story 31.8A: Adapter Migration Prep + Import Boundary Enforcement

## Story Summary

| Field | Value |
|-------|-------|
| Story | story-31.8A |
| Title | Adapter Migration Prep + Import Boundary Enforcement |
| Status | pending |
| Type | Cleanup |
| Sprint | 3 of 3 |
| Priority | P1 |
| Estimate | 8h |

---

## Story

As a Platform Engineer,
I want import boundary enforcement enabled and all adapter references verified,
So that deleting `lib/modules-*` won't break anything.

---

## Background

Deletion of `lib/modules-accounting/` and `lib/modules-sales/` must be gated by proof that adapters and tests no longer reference them. This story enables hard import boundary enforcement and inventories all remaining references.

---

## Acceptance Criteria

1. Inventory of all references to `apps/api/src/lib/modules-accounting/**` and `lib/modules-sales/**` completed
2. Route/service call-sites migrated to package contracts or explicit thin adapters
3. Import boundary lint rule enabled (`import/no-restricted-paths`) to block `packages/** -> apps/api/**`
4. `npm run lint --workspaces --if-present` passes with boundary enforcement active
5. `npm run typecheck --workspaces --if-present` passes

---

## Technical Notes

### Boundary Enforcement

```js
"import/no-restricted-paths": [
  "error",
  {
    "zones": [
      {
        "target": "./packages",
        "from": "./apps/api",
        "message": "packages/** must not import from apps/api/**"
      }
    ]
  }
]
```

### Files to Verify Are Thin Adapters

| File | Expected State |
|------|---------------|
| `cash-bank.ts` | Thin re-export to `@jurnapod/modules-treasury` |
| `depreciation-posting.ts` | Thin adapter to `@jurnapod/modules-accounting` |
| `reconciliation-service.ts` | Thin adapter to `@jurnapod/modules-accounting` |
| `sales-posting.ts` | Thin adapter to `@jurnapod/modules-accounting` |
| `stock.ts` | Thin adapter to `@jurnapod/modules-inventory` |

---

## Tasks

- [ ] Map all import/use sites for `lib/modules-accounting` and `lib/modules-sales`
- [ ] Migrate unresolved call-sites to package adapters/contracts
- [ ] Enable import boundary lint rule and make CI fail on violations
- [ ] Run `npm run lint --workspaces --if-present`
- [ ] Run `npm run typecheck --workspaces --if-present`

---

## Validation

```bash
npm run lint --workspaces --if-present
npm run typecheck --workspaces --if-present
```

---

## Dependencies

- Story 31.3 (Reservations consolidation)
- Story 31.4 (Route thinning: users, companies)
- Story 31.7 (Route thinning: accounts, inventory, reports)
