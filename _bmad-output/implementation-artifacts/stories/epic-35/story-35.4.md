# Story 35.4: Extract cash-bank-transactions.ts to modules-treasury

## Story Details

| Field | Value |
|-------|-------|
| **Epic** | Epic 35 |
| **Status** | pending |
| **Estimate** | 8h |
| **Priority** | P1 |
| **Dependencies** | None |

## Context

`apps/api/src/routes/cash-bank-transactions.ts` has 4 errors:
- Line 81: `createCashBankService` instantiation
- Line 120: `createCashBankService` instantiation
- Line 181: `createCashBankService` instantiation
- Line 228: `createCashBankService` instantiation

All violations are `Service instantiation detected in route ('createCashBankService')`.

## Problem

The route is instantiating `createCashBankService` directly in route handlers:

```typescript
// BEFORE (cash-bank-transactions.ts)
const cashBankService = createCashBankService();
await cashBankService.someMethod(...);
```

## Solution

Move `createCashBankService` factory to `@jurnapod/modules-treasury` and have route import from there.

## Implementation

### Step 1: Check if createCashBankService exists

```bash
grep -rn "createCashBankService" packages/modules/treasury/
```

If it exists in the package, ensure the route imports from there.

If it exists only in `apps/api/src/lib/cash-bank.ts`, move the factory to the treasury package.

### Step 2: Update cash-bank-transactions.ts

**Before (line 81):**
```typescript
const cashBankService = createCashBankService();
```

**After:**
```typescript
import { createCashBankService } from "@jurnapod/modules-treasury";
const cashBankService = createCashBankService();
```

**Note:** The route can still instantiate the service, but the factory must be imported from the package, not defined in the route file or `apps/api/src/lib/`.

### Step 3: Verify no getDb() calls remain

If the service factory calls `getDb()` internally (which it should), that's fine. The violation is about the factory being defined in the wrong place, not about using `getDb()`.

## Files to Modify

| File | Change |
|------|--------|
| `apps/api/src/routes/cash-bank-transactions.ts` | Update import to come from `@jurnapod/modules-treasury` |
| `packages/modules/treasury/src/cash-bank-service.ts` | Create or verify factory exists |

## Acceptance Criteria

| # | Criteria | Verification |
|---|----------|--------------|
| 1 | `createCashBankService` imported from `@jurnapod/modules-treasury` | `grep "createCashBankService" apps/api/src/routes/cash-bank-transactions.ts` shows import from package |
| 2 | No service instantiation violations | Lint passes (0 errors for this rule) |
| 3 | Service still works | Manual test or existing integration test |
| 4 | `npm run lint -w @jurnapod/api` passes | 0 errors for cash-bank-transactions.ts |
