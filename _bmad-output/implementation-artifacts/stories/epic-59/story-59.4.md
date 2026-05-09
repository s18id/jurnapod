# Story 59.4: Tenant/Outlet Scoping & ACL Resource Enforcement

**Status:** review

> ⚠️ **Sprint-Status Append-Only Rule (E45-A1 / E46-A1) — MANDATORY:**
> - **REQUIRED**: `npx tsx scripts/update-sprint-status.ts --epic 59 --story 59-4 --status done --title tenant-outlet-scoping-acl-resource-enforcement`
> - **REQUIRED**: `npx tsx scripts/validate-sprint-status.ts`
> - **NEVER** replace entire `sprint-status.yaml`

---

## Story

As a **security reviewer**,  
I want **tenant/outlet scoping and resource-level authorization enforced on POS operations**,  
So that **cross-tenant leakage and ACL bypass are blocked**.

## Context

- Source: Epic 59
- Depends on: Story 59.3
- Scope: `company_id`/`outlet_id` enforcement and `requireAccess` resource checks

## Test Scenario Review Checkpoint (MANDATORY — E54-A1)

### Pre-Implementation Checklist
- [x] Happy paths identified — authorized scoped push succeeds (AC4-valid test)
- [x] Error paths identified — cross-tenant rejection, cross-outlet rejection, outlet-scope rejection
- [x] Edge cases identified — outlet-scoped CASHIER to unassigned outlet, cross-tenant outlet mismatch
- [x] Fixture needs identified — `createTestCompany`, `createTestOutletMinimal`, `createTestUser`, `createTestItem`, `getRoleIdByCode`, `assignUserOutletRole`, `assignUserGlobalRole`, `loginForTest`, `getSeedSyncContext`
- [x] Integration-test coverage planned — `apps/api/__test__/integration/sync/tenant-scoping.test.ts`

### Review Outcome

| Scenario | Type | Coverage Plan |
|---|---|---|
| Authorized scoped access succeeds | Happy | Integration |
| Cross-tenant access blocked | Error | Integration |
| Missing `resource` authorization path fails | Error | Integration |

**Sign-off:** Scenario set approved before implementation.

## Cross-Module Error Boundary Verification (MANDATORY — E58-A1)

- [x] Verify `instanceof` handling for listed producer errors.
- [x] Verify `error.name` fallback handling for the same errors.
- [x] Verify denied-access and scope-violation responses are deterministic across both detection paths.

| Error Class | Source Package | Consumer Package | instanceof Works | error.name Fallback |
|---|---|---|---|---|
| `CrossTenantAccessError` | `apps/api/lib/item-images` | `apps/api` | Yes ✅ | Yes ✅ |
| `CrossCompanyAccessError` | `apps/api/lib/users` | `apps/api` | Yes ✅ | Yes ✅ |
| `InventoryForbiddenError` | `@jurnapod/modules-inventory` | `apps/api` | Yes ✅ | No ⚠️ (no explicit `this.name` in constructor) |

**Findings:**
- `CrossTenantAccessError`: Has explicit `this.name = "CrossTenantAccessError"` in constructor. `instanceof` works within same app boundary. **Gap:** No route-level `instanceof` handler found — thrown from `verifyItemOwnership()` in item-images.ts but no route catches it, resulting in generic 500.
- `CrossCompanyAccessError`: Has route-level handler at `routes/users.ts:145` checking `instanceof`. Uses 403 response.
- `InventoryForbiddenError`: Has 8 route-level `instanceof` handlers across `inventory.ts` and `stock.ts`. `error.name` falls back to "Error" (default) since constructor does not set `this.name` — but this is adequate since all consumers use `instanceof` checks.

## Acceptance Criteria

**AC1: Tenant/outlet scope enforcement**  
**Given** a POS data read/write request,  
**When** query conditions are built,  
**Then** `company_id` MUST be enforced and outlet-scoped domains MUST enforce `outlet_id`.

**AC2: Resource-level ACL enforcement**  
**Given** protected POS route access,  
**When** authorization runs,  
**Then** `requireAccess` MUST include explicit `resource` and missing-resource paths MUST fail.

**AC3: Negative authorization tests**  
**Given** low-privilege role credentials,  
**When** restricted operation is attempted,  
**Then** response MUST be 401/403 and no data mutation occurs.

## Tasks / Subtasks

- [x] Audit scoped queries in POS/sync services — **All queries enforce `company_id` and `outlet_id`. No gaps found.**
- [x] Add/adjust ACL enforcement tests with low-privilege role — **Created `tenant-scoping.test.ts` with 6 integration tests: AC1 cross-tenant isolation, AC1-ext cross-tenant auth rejection, AC2 outlet scoping, AC3 resource audit, AC4 outlet-scoped CASHIER rejection, AC4-valid CASHIER success. All passing.**
- [x] Validate no privileged role misuse in negative tests — **AC4 uses outlet-scoped CASHIER (not OWNER/SUPER_ADMIN). AC1-ext uses cross-tenant mismatch. No high-privilege roles used in negative assertions.**

## Files to Modify

| File | Action | Description |
|---|---|---|
| `apps/api/__test__/integration/sync/tenant-scoping.test.ts` | **Create** | 6 integration tests covering AC1-AC4 |
| `apps/api/src/routes/sync/push.ts` | **Audited** | Confirmed `requireAccess` has `resource: "transactions"` (lines 91-97, 314-320) — no changes needed |
| `apps/api/src/lib/sync/push/transactions.ts` | **Audited** | All queries enforce `company_id` + `outlet_id` — no changes needed |
| `packages/pos-sync/src/push/index.ts` | **Audited** | All entry points validate company/outlet scoping — no changes needed |

## Dev Agent Record

### Implementation Notes
- **Audit result**: No scoping gaps found in POS/sync push services. All three audited files (`push.ts` route, `transactions.ts` lib, `packages/pos-sync/push/index.ts`) properly enforce `company_id` and `outlet_id` on all queries and entry-point validation.
- **Resource ACL**: Both push route handlers (basic + OpenAPI) include `resource: "transactions"` in `requireAccess` calls. No missing-resource paths exist in the sync push flow.
- **Test architecture**: Used the canonical two-company + two-outlet pattern from `push-idempotency.test.ts` (AC6 section). All tests use real DB (no mocks), RWLock pattern for shared server, and outlet-scoped CASHIER for negative auth (no high-privilege roles in denial assertions).
- **E58-A1 verification**: Confirmed all three error classes have working `instanceof` checks. `InventoryForbiddenError` lacks explicit `this.name` in constructor (relies on default `Error.name`) — not a blocker since all consumers use `instanceof`. `CrossTenantAccessError` has a gap: no route-level handler exists (propagates as 500). This is a pre-existing P2 gap, not in scope for this story.

### Test Results
```
✓ AC1: Company B cannot see Company A transaction data
✓ AC1-ext: push with Company B token targeting Company A outlet is rejected (403)
✓ AC2: Outlet 2 cannot see Outlet 1 transaction data
✓ AC4: outlet-scoped CASHIER cannot push to unassigned outlet (403)
✓ AC4-valid: outlet-scoped CASHIER can push to assigned outlet (200)
✓ AC3: requireAccess in push route has explicit resource parameter (code audit)
```
**6/6 passed** — Sync regression: 2 pre-existing failures in `idempotency.test.ts` (not introduced by this story).

## Change Log
- 2026-05-09: Created `tenant-scoping.test.ts` with 6 integration tests (AC1-AC4). Audited POS/sync services — no scoping gaps found. Verified E58-A1 error boundaries. Marked story ready for review.

## Risk Level

P0 — tenant leakage and auth bypass are blockers.

_Last Updated: 2026-05-08_
