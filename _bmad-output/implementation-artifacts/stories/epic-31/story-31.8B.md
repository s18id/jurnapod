# Story 31.8B: Deletion Verification + Dead Code Cleanup

## Story Summary

| Field | Value |
|-------|-------|
| Story | story-31.8B |
| Title | Deletion Verification + Dead Code Cleanup |
| Status | **PARTIAL - BLOCKED** |
| Type | Cleanup |
| Sprint | 3 of 3 |
| Priority | P1 |
| Estimate | 10h (deferred) |

---

## Story

As a Platform Engineer,
I want `lib/modules-accounting/` and `lib/modules-sales/` deleted after verification,
So that the API lib is clean and no stale code accumulates.

---

## Background

After 31.8A proves no runtime or test dependencies exist, this story performs the actual deletion and validates that nothing breaks.

**CURRENT STATUS: BLOCKED** - Many files still import from these directories:
- 20+ files import from `modules-accounting`
- 11+ files import from `modules-sales`

Deletion cannot proceed until Epic 36 (Import/Export) is completed.

---

## Acceptance Criteria (PARTIAL)

1. ~~Zero references to `apps/api/src/lib/modules-accounting/**` verified~~ **BLOCKED**
2. ~~Zero references to `apps/api/src/lib/modules-sales/**` verified~~ **BLOCKED**
3. ~~`apps/api/src/lib/modules-accounting/` deleted~~ **DEFERRED**
4. ~~`apps/api/src/lib/modules-sales/` deleted~~ **DEFERRED**
5. ✅ Import boundary enforcement verified (done in 31.8A)
6. ✅ No packages import from `apps/api/**`

---

## Current Import Map

### `lib/modules-accounting/` - 20+ importing files:
```
apps/api/src/lib/depreciation-posting.ts
apps/api/src/lib/stock.ts
apps/api/src/lib/accounting-services.ts
apps/api/src/lib/journals.ts
apps/api/src/lib/treasury-adapter.ts
apps/api/src/lib/account-types.ts
apps/api/src/lib/sales-posting.ts
apps/api/src/lib/accounts.ts
apps/api/src/routes/accounts.ts
...and more
```

### `lib/modules-sales/` - 11+ importing files:
```
apps/api/src/lib/sales-posting.ts
apps/api/src/lib/credit-notes/credit-note-service.ts
apps/api/src/routes/sales/invoices.ts
apps/api/src/routes/sales/payments.ts
apps/api/src/routes/sales/orders.ts
...and more
```

---

## Deferral Note

Deletion is deferred to **Epic 36** (Import/Export Infrastructure) or a future cleanup epic. These directories contain thin adapter code that still has active consumers in the API. The adapters themselves are NOT business logic - they are thin wrappers. The issue is that Epic 36 will likely refactor some of these imports, making deletion easier at that time.

---

## Dependencies

- ~~Story 31.5 (Import/Export extraction)~~ - Moved to Epic 36
- Story 31.6 (Notifications consolidation) - ✅ Done
- Story 31.8A (Adapter migration prep + boundary enforcement) - ✅ Done (boundaries verified)
