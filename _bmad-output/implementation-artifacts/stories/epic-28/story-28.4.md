# story-28.4: API route flip + library cleanup

## Description

Flip the `PATCH/POST/DELETE /sales/payments` route to delegate to `modules-sales` PaymentService instead of the API-local `payment-service.ts`. Delete the heavy API payment library files after successful flip.

## Context

After stories 28.1–28.3:
- `modules-sales` exports `PaymentService` / `createPaymentService` ✅
- Module payment service has full parity ✅
- `PaymentPostingHook` is injectable ✅
- API adapter implements the hook ✅

Story 28.4 flips the route to use the module service and deletes the API-local implementation.

## Route current state

`apps/api/src/routes/sales/payments.ts` (380 LOC) currently:
1. Authenticates request
2. Parses + validates Zod input
3. Calls `PaymentService` from `apps/api/src/lib/payments/payment-service.ts`
4. Maps response to HTTP format
5. Handles errors

## Route target state

Route should:
1. Authenticate request (keep)
2. Parse + validate Zod input (keep or migrate to shared schema)
3. Call `modules-sales` PaymentService via thin API adapter (change)
4. Map response to HTTP format (keep)
5. Handle errors (keep)

The thin API adapter (`apps/api/src/lib/modules-sales/`) should:
- Implement `SalesDbExecutor` (DB access)
- Implement `AccessScopeChecker` (permissions)
- Implement `PaymentPostingHook` (journal posting)
- Compose `createPaymentService` with these dependencies

## Deletion candidates

After successful flip, delete:
- `apps/api/src/lib/payments/payment-service.ts` (763 LOC)
- `apps/api/src/lib/payments/payment-allocation.ts` (208 LOC)
- `apps/api/src/lib/payments/types.ts` (if only used by deleted files)
- `apps/api/src/lib/payments/index.ts` (if only re-exports deleted files)

Keep:
- `apps/api/src/lib/payments/` as thin compatibility facade if there are unknown internal consumers (assess after attempted deletion)
- `apps/api/src/routes/sales/payments.ts` (flipped, not deleted)

## Approach

1. Create/update thin API adapter for PaymentService in `apps/api/src/lib/modules-sales/`
2. Update route to import from `modules-sales` via adapter instead of `../lib/payments/`
3. Run payment tests to verify behavior is identical
4. Attempt deletion of API-local payment files
5. Fix any broken imports found

## Acceptance Criteria

- [ ] Route imports PaymentService from `modules-sales` via adapter
- [ ] `apps/api/src/lib/payments/payment-service.ts` deleted
- [ ] `apps/api/src/lib/payments/payment-allocation.ts` deleted
- [ ] All existing payment tests pass (idempotency, allocation, shortfall, overpayment, permissions, tenant scoping)
- [ ] No broken imports remain in the codebase after deletion
- [ ] `npm run typecheck -w @jurnapod/api`
- [ ] `npm run build -w @jurnapod/api`

## Files to Modify

```
apps/api/src/routes/sales/payments.ts             # flip to module service
apps/api/src/lib/modules-sales/                   # PaymentService adapter implementation
apps/api/src/lib/payments/payment-service.ts    # DELETE
apps/api/src/lib/payments/payment-allocation.ts  # DELETE
apps/api/src/lib/payments/types.ts               # DELETE (if orphaned)
apps/api/src/lib/payments/index.ts               # DELETE or keep as thin facade
```

## Dependency

- story-28.3 (posting hook must be wired before route flip)

## Implementation Notes

### Adapter composition
The API adapter needs to compose `createPaymentService` with:
- `SalesDbExecutor` — use existing `ApiSalesDbExecutor` implementation
- `AccessScopeChecker` — use existing `ApiAccessScopeChecker` implementation
- `PaymentPostingHook` — implement using `sales-posting.ts`
- `companyId` — resolved from route context (JWT or request)

### Shared schema migration (optional)
The route may use local Zod schemas for payment input. As part of the flip, consider migrating to shared schemas from `@jurnapod/shared`. This is a **P2 cleanup**, not a blocker — the flip succeeds regardless.

### Unknown consumers
After deleting the API payment files, run `npm run typecheck -w @jurnapod/api`. If type errors occur in unrelated files, those files were importing from the deleted paths — fix their imports.

## Validation Commands

```bash
npm run typecheck -w @jurnapod/modules-sales
npm run typecheck -w @jurnapod/api
npm run build -w @jurnapod/api
npm run test -- --testPathPattern="payments" -w @jurnapod/api
```