# Story 59.4 Completion Report — Tenant/Outlet Scoping & ACL Resource Enforcement

## Story
- **Epic:** 59
- **Story:** 59.4
- **Title:** Tenant/Outlet Scoping & ACL Resource Enforcement

## Outcome
Audited POS/sync services for `company_id`/`outlet_id` enforcement and verified `requireAccess` includes explicit `resource` parameter on all POS routes. Added 6 integration tests proving cross-tenant leakage is blocked and outlet isolation works correctly.

## Acceptance Criteria Evidence

| AC | Requirement | Evidence | Status |
|---|---|---|---|
| AC1 | Tenant scope enforcement | `tenant-scoping.test.ts` — Company B user cannot see Company A's transactions; all queries enforce `company_id` | ✅ PASS |
| AC2 | Outlet scope enforcement | `tenant-scoping.test.ts` — Outlet 2 user cannot see Outlet 1's data; outlet-scoped domains enforce `outlet_id` | ✅ PASS |
| AC3 | Negative authorization tests | Low-privilege role (CASHIER) restricted operations return 403; no data mutation occurs | ✅ PASS |

## Commands and Results

```bash
npm run test:single -w @jurnapod/api -- __test__/integration/sync/tenant-scoping.test.ts
```

Result: **6/6 tests pass**

## E58-A1 Cross-Module Error Boundary

| Error Class | instanceof | error.name Fallback |
|---|---|---|
| `CrossTenantAccessError` | ✅ | ✅ |
| `CrossCompanyAccessError` | ✅ | ✅ |
| `InventoryForbiddenError` | ✅ | N/A |

## Files Modified

| File | Change |
|---|---|
| `apps/api/__test__/integration/sync/tenant-scoping.test.ts` | **NEW** — 6 integration tests |
| `apps/api/src/routes/sync/push.ts` | Confirmed `requireAccess` includes `resource: "transactions"` |

## Review Gate
- No cross-tenant data leakage detected
- ACL resource enforcement verified on all POS routes

_Last Updated: 2026-05-09_
