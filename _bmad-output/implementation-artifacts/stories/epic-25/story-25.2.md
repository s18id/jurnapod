# story-25.2: Extract domain model, types, errors, helpers to treasury

## Description

Extract the domain model from `apps/api/src/lib/cash-bank.ts` into the new `@jurnapod/modules-treasury` package. This includes types, error classes, and pure helper functions that have no external dependencies.

## Acceptance Criteria

- [x] Domain types extracted to `packages/modules/treasury/src/types.ts`:
  - [x] `CashBankType` ("MUTATION" | "TOP_UP" | "WITHDRAWAL" | "FOREX")
  - [x] `CashBankStatus` ("DRAFT" | "POSTED" | "VOID")
  - [x] `CashBankTransaction` (full transaction type)
  - [x] `AccountClass` ("CASH" | "BANK")
  - [x] `AccountInfo` (for account validation)
- [x] Error classes extracted to `packages/modules/treasury/src/errors.ts`:
  - [x] `CashBankValidationError`
  - [x] `CashBankStatusError`
  - [x] `CashBankNotFoundError`
  - [x] `CashBankForbiddenError`
- [x] Pure helper functions extracted to `packages/modules/treasury/src/helpers.ts`:
  - [x] `toMinorUnits(value: number): number`
  - [x] `normalizeMoney(value: number): number`
  - [x] `isCashBankTypeName(typeName: string | null): boolean`
  - [x] `classifyCashBankAccount(typeName: string | null): AccountClass | null`
  - [x] `validateDirectionByTransactionType(...)`
- [x] Re-export all from `packages/modules/treasury/src/index.ts`
- [x] Package builds successfully
- [x] All types compile without errors
- [x] No runtime logic changes (pure extraction)

## Status

**DONE** - Approved by bmad-agent-review

## Files to Modify

### New Files in Treasury Package

```
packages/modules/treasury/src/
├── index.ts          (re-exports)
├── types.ts          (domain types)
├── errors.ts         (error classes)
└── helpers.ts        (pure helper functions)
```

### Source Reference

From `apps/api/src/lib/cash-bank.ts`, extract:

**Lines 12-76:** Types and interfaces
```typescript
export type CashBankType = "MUTATION" | "TOP_UP" | "WITHDRAWAL" | "FOREX";
export type CashBankStatus = "DRAFT" | "POSTED" | "VOID";
// ... CashBankTransaction type
```

**Lines 78-81:** Error classes
```typescript
export class CashBankValidationError extends Error {}
export class CashBankStatusError extends Error {}
export class CashBankNotFoundError extends Error {}
export class CashBankForbiddenError extends Error {}
```

**Lines 90-170:** Helper functions
```typescript
const MONEY_SCALE = 100;
function toMinorUnits(value: number): number { ... }
function normalizeMoney(value: number): number { ... }
function isCashBankTypeName(typeName: string | null): boolean { ... }
function classifyCashBankAccount(typeName: string | null): AccountClass | null { ... }
function validateDirectionByTransactionType(...): void { ... }
```

## Dependencies

- Story 25.1: Package scaffold must be complete

## Estimated Effort

2 hours

## Priority

P1

## Implementation Notes

### types.ts structure

```typescript
// Re-use shared schemas where possible
import type { CashBankTransaction as SharedCashBankTransaction } from "@jurnapod/shared";

export type CashBankType = "MUTATION" | "TOP_UP" | "WITHDRAWAL" | "FOREX";
export type CashBankStatus = "DRAFT" | "POSTED" | "VOID";
export type AccountClass = "CASH" | "BANK";

// Treasury-specific type extensions
export interface CashBankTransaction extends SharedCashBankTransaction {
  // Any treasury-specific extensions
}

export interface AccountInfo {
  id: number;
  company_id: number;
  name: string;
  type_name: string | null;
}

export interface CreateCashBankInput {
  outlet_id?: number | null;
  transaction_type: CashBankType;
  transaction_date: string;
  reference?: string;
  description: string;
  source_account_id: number;
  destination_account_id: number;
  amount: number;
  currency_code?: string;
  exchange_rate?: number;
  base_amount?: number;
  fx_account_id?: number | null;
}

export interface CashBankListFilters {
  outletId?: number;
  transactionType?: CashBankType;
  status?: CashBankStatus;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  offset?: number;
}
```

### errors.ts structure

```typescript
export class CashBankValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CashBankValidationError";
  }
}

export class CashBankStatusError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CashBankStatusError";
  }
}

export class CashBankNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CashBankNotFoundError";
  }
}

export class CashBankForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CashBankForbiddenError";
  }
}
```

### helpers.ts structure

```typescript
const MONEY_SCALE = 100;

export function toMinorUnits(value: number): number {
  return Math.round(value * MONEY_SCALE);
}

export function normalizeMoney(value: number): number {
  return toMinorUnits(value) / MONEY_SCALE;
}

export function isCashBankTypeName(typeName: string | null): boolean {
  const value = (typeName ?? "").toLowerCase();
  return value.includes("kas") || value.includes("cash") || value.includes("bank");
}

export type AccountClass = "CASH" | "BANK";

export function classifyCashBankAccount(typeName: string | null): AccountClass | null {
  const value = (typeName ?? "").toLowerCase();
  const hasCash = value.includes("kas") || value.includes("cash");
  const hasBank = value.includes("bank");

  if (hasCash && !hasBank) {
    return "CASH";
  }
  if (hasBank && !hasCash) {
    return "BANK";
  }

  return null;
}

export function validateDirectionByTransactionType(
  transactionType: CashBankType,
  sourceTypeName: string | null,
  destinationTypeName: string | null
): void {
  if (transactionType === "TOP_UP") {
    const sourceClass = classifyCashBankAccount(sourceTypeName);
    const destClass = classifyCashBankAccount(destinationTypeName);
    if (sourceClass !== "CASH" || destClass !== "BANK") {
      throw new CashBankValidationError("TOP_UP requires source cash and destination bank accounts");
    }
  } else if (transactionType === "WITHDRAWAL") {
    const sourceClass = classifyCashBankAccount(sourceTypeName);
    const destClass = classifyCashBankAccount(destinationTypeName);
    if (sourceClass !== "BANK" || destClass !== "CASH") {
      throw new CashBankValidationError("WITHDRAWAL requires source bank and destination cash accounts");
    }
  }
}
```

## Validation Commands

```bash
cd /home/ahmad/jurnapod

# Build package
npm run build -w @jurnapod/modules-treasury

# Type check
npm run typecheck -w @jurnapod/modules-treasury

# Verify API still compiles (should still use old lib/cash-bank.ts)
npm run typecheck -w @jurnapod/api
```

## Notes

- This is a pure extraction - no logic changes, just moving code
- Ensure all exported types match the shared schemas where applicable
- The API's `lib/cash-bank.ts` will temporarily duplicate these; that's OK until story 25.4
- Keep the same implementation exactly to minimize risk

---

## Dev Agent Record

**Story:** 25.2 - Extract cash-bank domain model/types/errors/helpers to modules-treasury
**Agent:** bmad-dev
**Date:** 2026-04-03

### Files Created/Modified

**Created:**
- `packages/modules/treasury/src/types.ts` - Domain types (CashBankType, CashBankStatus, CashBankTransaction, AccountClass, AccountInfo, CreateCashBankInput, CashBankListFilters)
- `packages/modules/treasury/src/errors.ts` - Error classes (CashBankValidationError, CashBankStatusError, CashBankNotFoundError, CashBankForbiddenError)
- `packages/modules/treasury/src/helpers.ts` - Pure helper functions (toMinorUnits, normalizeMoney, isCashBankTypeName, classifyCashBankAccount, validateDirectionByTransactionType)

**Modified:**
- `packages/modules/treasury/src/index.ts` - Updated to re-export types, errors, and helpers from new sub-modules

### Validation Evidence

```
$ npm run typecheck -w @jurnapod/modules-treasury
> @jurnapod/modules-treasury@0.1.0 typecheck
> tsc -p tsconfig.json --noEmit
✓ No errors

$ npm run build -w @jurnapod/modules-treasury
> @jurnapod/modules-treasury@0.1.0 build
> tsc -p tsconfig.json
✓ Build succeeded

$ npm run typecheck -w @jurnapod/api
> @jurnapod/api@0.1.0 typecheck
> tsc -p tsconfig.json --noEmit
✓ No errors (API still uses original lib/cash-bank.ts)
```

### Implementation Notes

- Pure extraction with no behavior changes
- Types extend SharedCashBankTransaction from @jurnapod/shared as specified
- Error classes include proper this.name assignment for debugging
- Helpers use MONEY_SCALE=100 constant as in original source
- API lib/cash-bank.ts left unchanged (no re-import from treasury package)
