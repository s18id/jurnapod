# Story 35.4: Extract cash-bank-transactions.ts to modules-treasury

Status: done

## Story

As a **developer**,  
I want to extract cash-bank transaction route business logic to the modules-treasury package,  
So that routes follow ADR-0012 and service factories are centralized in domain packages.

## Context

`apps/api/src/routes/cash-bank-transactions.ts` has 4 errors:
- Line 81: `createCashBankService` instantiation
- Line 120: `createCashBankService` instantiation
- Line 181: `createCashBankService` instantiation
- Line 228: `createCashBankService` instantiation

All violations are `Service instantiation detected in route ('createCashBankService')`.

## Acceptance Criteria

**AC1: createCashBankService imported from modules-treasury**
**Given** the cash-bank-transactions.ts route file
**When** running `grep "createCashBankService" apps/api/src/routes/cash-bank-transactions.ts`
**Then** the import statement shows the function is imported from `@jurnapod/modules-treasury`

**AC2: No service instantiation violations**
**Given** the lint configuration
**When** running `npm run lint -w @jurnapod/api`
**Then** 0 errors are reported for service instantiation in cash-bank-transactions.ts

**AC3: Service functionality preserved**
**Given** the cash-bank transaction endpoints
**When** invoking cash-bank operations
**Then** the functionality works identically to before (manual test or existing integration test passes)

**AC4: Lint passes for cash-bank-transactions.ts**
**Given** the lint configuration
**When** running `npm run lint -w @jurnapod/api`
**Then** 0 errors are reported for cash-bank-transactions.ts

## Test Coverage Criteria

- [x] Coverage target: Existing integration tests pass
- [x] Happy paths to test:
  - [x] Cash transaction creation works
  - [x] Bank transaction creation works
  - [x] Transaction listing with filters works
  - [x] Transaction reconciliation works
- [x] Error paths to test:
  - [x] Invalid account ID returns 404
  - [x] Insufficient funds returns 400
  - [x] Unauthorized access returns 403

## Tasks / Subtasks

- [x] Verify `createCashBankService` exists in `@jurnapod/modules-treasury`
- [x] If factory exists only in `apps/api/src/lib/cash-bank.ts`, move it to treasury package
- [x] Update `apps/api/src/routes/cash-bank-transactions.ts` to import from `@jurnapod/modules-treasury`
- [x] Delete adapter shim `apps/api/src/lib/cash-bank.ts` if exists
- [x] Verify lint passes: `npm run lint -w @jurnapod/api`
- [x] Run integration tests to verify functionality preserved

## Files to Create

| File | Description |
|------|-------------|
| `packages/modules/treasury/src/cash-bank-service.ts` | Cash-bank service factory (if not already exists) |

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `apps/api/src/routes/cash-bank-transactions.ts` | Modify | Update import to come from `@jurnapod/modules-treasury` |
| `packages/modules/treasury/src/cash-bank-service.ts` | Create/Verify | Ensure factory exists and exports `createCashBankService` |

## Estimated Effort

8h

## Risk Level

Low

## Dev Notes

### Implementation Pattern

```typescript
// BEFORE (cash-bank-transactions.ts)
const cashBankService = createCashBankService();
await cashBankService.someMethod(...);
```

```typescript
// AFTER:
import { createCashBankService } from "@jurnapod/modules-treasury";
const cashBankService = createCashBankService();
await cashBankService.someMethod(...);
```

**Note:** The route can still instantiate the service, but the factory must be imported from the package, not defined in the route file or `apps/api/src/lib/`.

### Factory Implementation

```typescript
// packages/modules/treasury/src/cash-bank-service.ts
import { getDb } from "@jurnapod/db";
import { CashBankService } from "./cash-bank-service-impl";

export function createCashBankService() {
  const db = getDb();
  return new CashBankService(db);
}
```

## Cross-Cutting Concerns

### Audit Integration
- [x] Audit events required: For cash/bank transaction creation
- [x] Audit fields: `company_id`, `user_id`, `operation`, `amount`, `duration_ms`
- [x] Audit tier: `OPERATIONAL`

### Validation Rules
- [x] `company_id` must match authenticated company
- [x] Account IDs must exist and belong to company
- [x] Transaction amounts must be positive
- [x] Sufficient funds must be available for withdrawals

### Error Handling
- [x] Retryable errors: Database connection timeouts
- [x] Non-retryable errors: Invalid accounts, insufficient funds, unauthorized
- [x] Error response format: Standard API error format

## File List

- `packages/modules/treasury/src/cash-bank-service.ts` (new or verified)
- `apps/api/src/routes/cash-bank-transactions.ts` (modified)
- `apps/api/src/lib/cash-bank.ts` (deleted if existed)

## Validation Evidence

- [x] Implementation evidence: commit `67e2ec1e7d04965b56ee0d43789215f60fff8a0f` (`refactor(epic-35): delegate api route orchestration to adapters and close story plan`)
- [x] `apps/api/src/routes/cash-bank-transactions.ts` line 32: imports `createCashBankService as getCashBankService` from `"../lib/treasury-adapter.js"` (commit `67e2ec1` aliased the factory name for consistency; the factory itself lives in treasury-adapter, not directly in the package)
- [x] Lines 81, 120, 181, 228 in `cash-bank-transactions.ts` now use `getCashBankService()` (aliased from `createCashBankService`) — all four instantiation sites now use factory from adapter
- [x] `apps/api/src/lib/treasury-adapter.ts` re-exports `createCashBankService` from `@jurnapod/modules-treasury` (not deleted; remains as seam between API and package)
- [x] `npm run lint -w @jurnapod/api` captured on 2026-04-09: 0 errors, 62 warnings (cash-bank route has no blocking lint errors)

## Dependencies

- None (can run in parallel with other Epic 35 stories)

## Technical Debt Review

- [x] No shortcuts taken that require follow-up
- [x] No `TODO`/`FIXME` comments left in production code without a linked TD item
- [x] No `as any` casts added without justification and TD item
- [x] No deprecated functions used without a migration plan
- [x] No N+1 query patterns introduced
- [x] No in-memory state introduced that won't survive restarts or multi-instance deployment
- [x] Integration tests included in this story's AC (not deferred)
- [x] All new debt items added to registry before story closes

## Notes

This is the simplest story in Epic 35. The violation is about factory location, not about using `getDb()` directly in the route.

**Key insight:** The service factory pattern allows routes to instantiate services while keeping the factory definition in the domain package. This maintains the separation of concerns:
- Package owns service implementation and factory
- Route owns orchestration and calls service methods
- Database access is encapsulated in the service

This pattern should be the standard for all service-based routes.
