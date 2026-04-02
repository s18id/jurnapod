# story-23.3.11: Extract report query/services

## Description
Move report query and service logic from the API to the modules-reporting package while maintaining existing response contracts.

## Acceptance Criteria

- [x] Report query and service logic moved to reporting package
- [x] API report routes remain boundary-only with same response contracts
- [x] Financial report tests continue to reconcile with GL logic

## Files to Modify

- `packages/modules/reporting/src/reports/*` (create)
- `apps/api/src/lib/reports.ts` (adapter/removal)
- `apps/api/src/routes/reports/*` (wiring updates)

## Dependencies

- story-23.3.10 (Reporting bootstrap must be complete)

## Estimated Effort

4 hours

## Priority

P1

## Validation Commands

```bash
cd /home/ahmad/jurnapod
npm run test:unit:single -w @jurnapod/api src/routes/reports/*.test.ts
npm run test:unit:critical -w @jurnapod/api
```

## Notes

Financial reports must reconcile with GL. Ensure all existing report tests pass and GL tie-outs remain correct.

## Tasks/Subtasks

- [x] Create `packages/modules/reporting/src/reports/types.ts` with all type definitions
- [x] Create `packages/modules/reporting/src/reports/helpers.ts` with query helper functions
- [x] Create `packages/modules/reporting/src/reports/services.ts` with all report service implementations
- [x] Create `packages/modules/reporting/src/reports/db.ts` for database connection management
- [x] Create `packages/modules/reporting/src/reports/index.ts` as the module entry point
- [x] Update `packages/modules/reporting/src/index.ts` to export from reports sub-module
- [x] Update `packages/modules/reporting/package.json` to add `/reports` export
- [x] Update `apps/api/src/lib/reports.ts` to be a thin adapter re-exporting from modules-reporting
- [x] Verify all report tests pass

## Dev Agent Record

### Implementation Plan
- Extracted report query/service logic from `apps/api/src/lib/reports.ts` to `packages/modules/reporting/src/reports/`
- Created proper type system for filters, row types, and response types
- Created helper functions for common query building patterns
- Created `db.ts` for database connection management following the pattern used in other modules (inventory)
- Used `withTransaction` helper from `@jurnapod/db` for transaction support
- API routes remain unchanged; they import from `@/lib/reports` which is now a thin adapter

### Completion Notes
Successfully extracted report query/services from API to modules-reporting package.

**Files Created:**
- `packages/modules/reporting/src/reports/types.ts` - Type definitions for filters, row types, and response types
- `packages/modules/reporting/src/reports/helpers.ts` - Query helper functions (toNumber, buildOutletPredicate, etc.)
- `packages/modules/reporting/src/reports/services.ts` - All report service implementations
- `packages/modules/reporting/src/reports/db.ts` - Database connection management
- `packages/modules/reporting/src/reports/index.ts` - Module entry point

**Files Modified:**
- `packages/modules/reporting/src/index.ts` - Added export from reports sub-module
- `packages/modules/reporting/package.json` - Added `/reports` export map
- `apps/api/src/lib/reports.ts` - Converted to thin adapter re-exporting from modules-reporting

**Test Results:**
- All 24 report tests passed (Trial Balance: 5, P&L: 4, POS Transactions: 5, Journal Batches: 4, Daily Sales: 2, Date Filtering: 2, Company Scoping: 2)
- API builds successfully with no TypeScript errors

## File List

- packages/modules/reporting/src/reports/types.ts (created)
- packages/modules/reporting/src/reports/helpers.ts (created)
- packages/modules/reporting/src/reports/services.ts (created)
- packages/modules/reporting/src/reports/db.ts (created)
- packages/modules/reporting/src/reports/index.ts (created)
- packages/modules/reporting/src/index.ts (modified)
- packages/modules/reporting/package.json (modified)
- apps/api/src/lib/reports.ts (modified)

## Change Log

- 2026-04-02: Extract report query/services to modules-reporting package. All report services moved, API adapter created, all tests passing.

## Status

REVIEW