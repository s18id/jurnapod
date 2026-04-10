# Story 38.3: Company Service Audit Transaction Boundary Fix

**Status:** done

## Story

As an **engineer**,
I want `AuditService` to use the same database connection as the enclosing transaction,
So that audit log writes don't compete for locks on a separate connection while the business logic transaction is holding row locks.

## Context

`CompanyService.updateCompany` (and `deactivateCompany`, `reactivateCompany`) created `AuditService` with `this.db` (the main connection pool singleton) **outside** the `withTransactionRetry` callback, then called `auditService.logUpdate(...)` **inside** the callback:

```typescript
// BEFORE (broken)
async updateCompany(params): Promise<CompanyResponse> {
    const auditService = new AuditService(this.db); // ← main pool connection
    return await withTransactionRetry(this.db, async (trx) => {
      // Company UPDATE holds row locks in transaction trx
      await auditService.logUpdate(...); // ← separate connection → lock contention
    });
}
```

This caused the audit write to compete for locks on a different connection while the company transaction held row locks — leading to cascading lock waits and 60s timeouts in tests and under load.

`createCompany` was already correct (created `AuditService` with `trx` inside the callback).

## Acceptance Criteria

**AC1: AuditService uses same connection as business logic**
**Given** a company update that triggers audit logging
**When** `updateCompany` is called
**Then** `AuditService` is instantiated with `trx` (the transaction from `withTransactionRetry`), not `this.db`

**AC2: All three company write operations are fixed**
**Given** calls to `updateCompany`, `deactivateCompany`, or `reactivateCompany`
**When** each triggers audit logging
**Then** `AuditService` uses the same `trx` connection as the business logic for that operation

**AC3: No regression in company create (already correct)**
**Given** `createCompany` is called
**When** it triggers audit logging
**Then** `AuditService` is instantiated with `trx` (existing correct behavior preserved)

## Tasks

- [x] Move `const auditService = new AuditService(trx)` inside the `withTransactionRetry` callback for `updateCompany`
- [x] Move `const auditService = new AuditService(trx)` inside the `withTransactionRetry` callback for `deactivateCompany`
- [x] Move `const auditService = new AuditService(trx)` inside the `withTransactionRetry` callback for `reactivateCompany`
- [x] Run `npm run typecheck -w @jurnapod/modules-platform`
- [x] Run `npm run test:single -w @jurnapod/api -- "__test__/integration/companies/update.test.ts"` — 8/8 pass

## Files Modified

| File | Change |
|------|--------|
| `packages/modules/platform/src/companies/services/company-service.ts` | Move `new AuditService(trx)` inside `withTransactionRetry` callback for `updateCompany`, `deactivateCompany`, `reactivateCompany` |

## Root Cause

The bug was a classic **transaction scope escape**: a resource (DB connection) was acquired outside a retry loop and used inside it. The `withTransactionRetry` creates a fresh transaction per attempt — the `trx` handle is only valid inside the callback. Using `this.db` inside the callback means the audit write uses a different connection from the pool, outside the retry-controlled transaction boundaries.

## Completion Evidence

- `npm run test:single -w @jurnapod/api -- "__test__/integration/companies/update.test.ts"` — 8/8 pass ✅
- `npm run typecheck -w @jurnapod/modules-platform` ✅
- Previously failing tests `"validates company code uniqueness on update"` and `"returns 200 when non-SUPER_ADMIN updates company (module permission granted)"` now pass without timeout
