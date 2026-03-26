# Story 4.1: Extract Shared Master-Data Utilities

Status: done

## Story

As a **Jurnapod developer**,  
I want **shared utilities extracted from domain modules into a common location**,  
So that **code duplication is eliminated and maintenance is simplified**.

## Context

Epic 3 extracted 5 domain modules from the master-data monolith. Each module independently implemented identical utilities:
- `withTransaction` - database transaction wrapper
- `isMysqlError` - MySQL error type guard
- `mysqlDuplicateErrorCode` / `mysqlForeignKeyErrorCode` - error code constants
- `ensureUserHasOutletAccess` - shared validation helper
- Audit logging helpers

This ~80% duplication creates maintenance burden. This story consolidates these into a shared location.

## Acceptance Criteria

**AC1: Identify Duplicated Utilities**
**Given** the five domain modules (item-groups, items, item-prices, supplies, fixed-assets)
**When** reviewing their internal implementations
**Then** identify all duplicated utilities: `withTransaction`, `isMysqlError`, `mysqlDuplicateErrorCode`, `mysqlForeignKeyErrorCode`, `ensureUserHasOutletAccess`, audit logging helpers

**AC2: Create Shared Utilities Module**
**Given** the identified duplicated utilities
**When** creating `lib/shared/master-data-utils.ts`
**Then** all utilities are consolidated in one location
**And** proper TypeScript types are exported
**And** the module is imported by all 5 domain modules

**AC3: Update Domain Modules**
**Given** the new shared utilities module
**When** updating item-groups, items, item-prices, supplies, and fixed-assets
**Then** each module imports from the shared location
**And** internal duplicate implementations are removed

**AC4: Preserve Existing Behavior**
**Given** the refactored domain modules
**When** running the test suite
**Then** all 714 API unit tests pass
**And** type checking passes with zero errors
**And** no functional changes are introduced

## Test Coverage Criteria

- Coverage target: full regression safety via shared-utility refactor validation
- Happy paths to test:
  - shared utilities compile and import from all 5 domain modules
  - all existing domain behaviors remain unchanged
- Error paths to test:
  - duplicate-key detection still maps to the same conflict errors
  - foreign-key failures still map to the same reference errors
  - transaction rollback behavior remains intact on thrown errors

## Tasks / Subtasks

- [x] Audit all 5 domain modules for duplicated utilities
- [x] Create `lib/shared/master-data-utils.ts` with consolidated utilities
- [x] Update `lib/item-groups/index.ts` to use shared utilities
- [x] Update `lib/items/index.ts` to use shared utilities
- [x] Update `lib/item-prices/index.ts` to use shared utilities
- [x] Update `lib/supplies/index.ts` to use shared utilities
- [x] Update `lib/fixed-assets/index.ts` to use shared utilities
- [x] Run full validation (typecheck, lint, tests)

## Files to Create

| File | Description |
|------|-------------|
| `apps/api/src/lib/shared/master-data-utils.ts` | Consolidated shared utilities |

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `apps/api/src/lib/item-groups/index.ts` | Modify | Import from shared utilities |
| `apps/api/src/lib/items/index.ts` | Modify | Import from shared utilities |
| `apps/api/src/lib/item-prices/index.ts` | Modify | Import from shared utilities |
| `apps/api/src/lib/supplies/index.ts` | Modify | Import from shared utilities |
| `apps/api/src/lib/fixed-assets/index.ts` | Modify | Import from shared utilities |

## Estimated Effort

1 day

## Risk Level

Low (refactoring only, no functional changes)

## Dev Notes

- Utilities to extract:
  - `withTransaction<T>(pool: Pool, fn: (conn: PoolConnection) => Promise<T>): Promise<T>`
  - `isMysqlError(err: unknown): err is { code: string; message: string }`
  - `mysqlDuplicateErrorCode = 'ER_DUP_ENTRY'`
  - `mysqlForeignKeyErrorCode = 'ER_NO_REFERENCED_ROW'`
  - `ensureUserHasOutletAccess(pool: Pool, userId: string, outletId: string): Promise<void>`
  - Audit logging helpers (if duplicated)

- `master-data-errors.ts` already exists as shared error classes - ensure alignment
- Keep error code constants as constants (not enums) for tree-shaking

## File List

- `apps/api/src/lib/shared/master-data-utils.ts` (new)
- `apps/api/src/lib/item-groups/index.ts`
- `apps/api/src/lib/items/index.ts`
- `apps/api/src/lib/item-prices/index.ts`
- `apps/api/src/lib/supplies/index.ts`
- `apps/api/src/lib/fixed-assets/index.ts`

## Validation Evidence

- ✅ `timeout 180s npm run typecheck -w @jurnapod/api` passes
- ✅ `timeout 180s npm run lint -w @jurnapod/api` passes
- ✅ `timeout 300s npm run test:unit -w @jurnapod/api` (762 tests) passes
- ✅ Zero functional changes verified by test suite

## Dependencies

- Epic 3 must be complete (all domain modules extracted)

## Notes

- This addresses P1 action from Epic 3 retrospective
- No breaking changes to public APIs
- Internal refactoring only

## Dev Agent Record

### Implementation Notes

**Consolidated Utilities in `master-data-utils.ts`:**
- `mysqlDuplicateErrorCode = 1062` - MySQL duplicate entry error code constant
- `mysqlForeignKeyErrorCode = 1452` - MySQL foreign key error code constant
- `isMysqlError(error: unknown): error is { errno?: number }` - Type guard for MySQL errors
- `withTransaction<T>(operation: (connection: PoolConnection) => Promise<T>): Promise<T>` - Transaction wrapper
- `recordMasterDataAuditLog(executor, input)` - Generic audit log recorder
- `ensureUserHasOutletAccess(executor, userId, companyId, outletId)` - User outlet access validation

**Module-Specific Functions NOT Consolidated:**
- `ensureCompanyItemGroupExists` - Only in item-groups and items
- `ensureCompanyItemExists` - Only in item-prices
- `ensureCompanyOutletExists` - Only in item-prices and fixed-assets
- `ensureCompanyAccountExists` - Only in items and fixed-assets
- `ensureCompanyFixedAssetCategoryExists` - Only in fixed-assets

These are module-specific entity existence checks that remain in their respective modules.

**Test Results:**
- TypeScript type check: ✅ Passed
- ESLint: ✅ Passed (0 warnings)
- Unit tests: ✅ 762 tests passed (exceeded 714 requirement)

### Completion Notes

Successfully consolidated duplicated utilities from 5 domain modules into `apps/api/src/lib/shared/master-data-utils.ts`. All local implementations of `withTransaction`, `isMysqlError`, error code constants, and audit logging helpers were replaced with imports from the shared module. The `ensureUserHasOutletAccess` function was also consolidated from item-prices and fixed-assets. Follow-up review notes were addressed by tightening the MySQL error guard and clarifying that `recordMasterDataAuditLog` is success-only. All 762 tests pass confirming no functional changes were introduced.
