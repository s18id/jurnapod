# story-23.2.3: Thin API accounting adapters to composition-only

## Description
Refactor API accounting adapters to be thin composition/IO boundary layers only, removing any business logic duplication.

## Acceptance Criteria

- [x] API `accounts/account-types/journals` libs perform composition/IO boundary only
- [x] Service construction duplication removed from API
- [x] Public API behavior unchanged (status codes, envelopes, validations)

## Files to Modify

- `apps/api/src/lib/accounts.ts` (refactor to adapter)
- `apps/api/src/lib/account-types.ts` (refactor to adapter)
- `apps/api/src/lib/journals.ts` (refactor to adapter)
- Related route files in `apps/api/src/routes/**` (minimal wiring updates)

## Files Created

- `apps/api/src/lib/accounting-services.ts` (shared service factory)

## Dependencies

- story-23.2.2 (Reconciliation service extraction should be complete)

## Estimated Effort

3 hours

## Priority

P2

## Validation Commands

```bash
cd /home/ahmad/jurnapod
npm run test:unit:critical -w @jurnapod/api
npm run test:unit:single -w @jurnapod/api src/routes/accounts/*.test.ts
```

## Notes

The API routes should only handle HTTP concerns (validation, auth, response formatting). All business logic should delegate to the accounting package.

## Implementation Summary

### Changes Made

1. **Created `lib/accounting-services.ts`**: A shared factory that centralizes:
   - `AuditServiceAdapter` class (was duplicated in all 3 lib files)
   - Singleton service creation functions for `AccountsService`, `AccountTypesService`, and `JournalsService`
   - All services share the same DB client and audit service for transaction consistency

2. **Refactored `lib/accounts.ts`**: Now a thin adapter (~50 lines vs ~180 lines) that:
   - Imports service factory from `accounting-services.ts`
   - Exports thin wrapper functions that delegate to the service
   - Re-exports error classes from accounting module

3. **Refactored `lib/account-types.ts`**: Same pattern (~40 lines vs ~160 lines)

4. **Refactored `lib/journals.ts`**: Same pattern (~30 lines vs ~85 lines)

### What Was Removed (Duplication)

- `AuditServiceAdapter` class (was defined 3 times)
- `createAccountsService()` function
- `createAccountTypesService()` function
- `createJournalsService()` function
- Inline audit adapter in journals.ts

### Verification

- TypeScript compilation: ✅ Pass
- Build: ✅ Pass
- Lint: Pre-existing errors in server.ts (not related to changes)
- Unit tests: ✅ 1619 tests pass
- Critical tests: ✅ 214 tests pass
- Accounts route tests: ✅ 19 tests pass
- Journals route tests: ✅ 15 tests pass

### Public API Behavior

All public function signatures remain unchanged:
- Routes continue to import from same lib files
- Error classes re-exported from same location
- Response formats unchanged

## Status

**REVIEW** - Implementation complete, ready for review
