# story-28.1: Contract & permission alignment

## Description

Establish correct export surface and permission mapping for the payment boundary extraction. This story ensures `modules-sales` exports `PaymentService`/`createPaymentService` and that permission checks are correctly wired before any route flip happens.

## Context

Currently:
- `packages/modules/sales/src/index.ts` does **not** export `PaymentService` or `createPaymentService`
- The payment service exists at `packages/modules/sales/src/services/payment-service.ts` (686 LOC) but is internal
- API route `payments.ts` checks `payments:update`, `payments:post`, `payments:delete` permissions
- The API access-scope checker (`apps/api/src/lib/modules-sales/access-scope-checker.ts`) has incomplete payment permission mappings

This story is the foundation for all other Epic 28 stories.

## Acceptance Criteria

- [x] `modules-sales/src/index.ts` exports `PaymentService`, `createPaymentService`, and `PaymentServiceDeps`
- [x] `modules-sales/src/services/index.ts` re-exports payment service
- [x] `apps/api/src/lib/modules-sales/access-scope-checker.ts` correctly maps `payments:update`, `payments:post` (and `payments:create`, `payments:read` if missing)
- [x] Note: `payments:delete` does not exist in `SalesPermissions` enum — no DELETE_PAYMENT constant exists; this is documented as expected (payment void uses `payments:update`/status transition, not a delete permission)
- [x] API route `payments.ts` does NOT break after these exports are added (route still uses API payment service — this story doesn't flip the route yet)
- [x] `npm run typecheck -w @jurnapod/modules-sales`
- [x] `npm run typecheck -w @jurnapod/api`

## Files Modified

```
packages/modules/sales/src/index.ts                    # added PaymentService exports
packages/modules/sales/src/services/index.ts           # added payment service re-export
apps/api/src/lib/modules-sales/access-scope-checker.ts  # added payments:update and payments:post mappings
```

## Validation Results

- ✅ `npm run typecheck -w @jurnapod/modules-sales` — passed
- ✅ `npm run typecheck -w @jurnapod/api` — passed
- ✅ `npm run test:unit:routes -w @jurnapod/api` — 664 tests passed

## Change Log

- **2026-04-03**: Added `PaymentService`, `createPaymentService`, and `PaymentServiceDeps` exports to `modules-sales/src/index.ts`
- **2026-04-03**: Re-exported payment service from `modules-sales/src/services/index.ts`
- **2026-04-03**: Added `payments:update` and `payments:post` permission mappings in `access-scope-checker.ts` (note: `payments:delete` does not exist in `SalesPermissions` enum — only `payments:create`, `payments:read`, `payments:update`, `payments:post`)

## Status

**Status:** done

## Files to Modify

```
packages/modules/sales/src/index.ts                    # add payment service exports
packages/modules/sales/src/services/index.ts           # ensure payment service is re-exported
apps/api/src/lib/modules-sales/access-scope-checker.ts  # fix payment permission mappings
apps/api/src/routes/sales/payments.ts                  # verify imports still compile
```

## Dependency

- None — story 28.1 is the foundation

## Implementation Notes

### PaymentServiceDeps interface (check if it exists)
The `modules-sales` payment service likely needs a deps interface similar to `InvoiceServiceDeps`. Verify `PaymentServiceDeps` exists and includes:
- `db: SalesDbExecutor`
- `accessScopeChecker: AccessScopeChecker`
- `companyId: number` (for tenant scoping)

### Permission mapping
The API access-scope checker currently maps:
- `payments:read` → `sales:payments:read` ✅ (was already present)
- `payments:update` → mapped ✅
- `payments:post` → mapped ✅
- `payments:delete` → **NOT DEFINED** — `SalesPermissions` enum has no `DELETE_PAYMENT` constant; payment voiding uses status transition (PATCH /payments/:id) with `payments:update` scope, not delete. This is the expected design.

### No route flip yet
This story only adds exports and fixes permissions. The API route still uses `apps/api/src/lib/payments/payment-service.ts`. Route flip happens in story 28.4.

## Validation Commands

```bash
npm run typecheck -w @jurnapod/modules-sales
npm run typecheck -w @jurnapod/api
npm run test -- --testPathPattern="payments" -w @jurnapod/api  # ensure existing payment tests still pass
```