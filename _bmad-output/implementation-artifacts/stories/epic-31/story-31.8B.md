# Story 31.8B: Deletion Verification + Dead Code Cleanup

## Story Summary

| Field | Value |
|-------|-------|
| Story | story-31.8B |
| Title | Deletion Verification + Dead Code Cleanup |
| Status | pending |
| Type | Cleanup |
| Sprint | 3 of 3 |
| Priority | P1 |
| Estimate | 10h |

---

## Story

As a Platform Engineer,
I want `lib/modules-accounting/` and `lib/modules-sales/` deleted after verification,
So that the API lib is clean and no stale code accumulates.

---

## Background

After 31.8A proves no runtime or test dependencies exist, this story performs the actual deletion and validates that nothing breaks.

---

## Acceptance Criteria

1. Zero references to `apps/api/src/lib/modules-accounting/**` verified
2. Zero references to `apps/api/src/lib/modules-sales/**` verified
3. `apps/api/src/lib/modules-accounting/` deleted
4. `apps/api/src/lib/modules-sales/` deleted
5. All remaining `apps/api/src/lib/*.ts` files are thin adapters or infrastructure (no domain re-growth)
6. `npm run build --workspaces --if-present` passes after deletion
7. API critical suites pass (auth, sync, posting)

---

## Technical Notes

### Files to Delete

```
apps/api/src/lib/modules-accounting/
apps/api/src/lib/modules-sales/
```

### Verification Strategy

Before deletion, run:
```bash
# Should return no results
rg "from ['\"]@jurnapod/api" packages/**/src/
rg "from ['\"]\.\./lib/modules-accounting" apps/api/src/
rg "from ['\"]\.\./lib/modules-sales" apps/api/src/
```

---

## Tasks

- [ ] Verify zero references to both legacy module directories
- [ ] Delete `lib/modules-accounting/`
- [ ] Delete `lib/modules-sales/`
- [ ] Verify remaining `lib/*.ts` files are thin adapters/infrastructure
- [ ] Run `npm run build --workspaces --if-present`
- [ ] Run API critical test suites

---

## Validation

```bash
npm run build --workspaces --if-present
```

---

## Dependencies

- Story 31.5 (Import/Export extraction)
- Story 31.6 (Notifications consolidation)
- Story 31.8A (Adapter migration prep + boundary enforcement)
