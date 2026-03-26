# Story 7.7 Completion Notes: Export & Settings Route Test Coverage

## Summary
Created HTTP Integration Tests for Export and Settings routes to achieve comprehensive route test coverage.

## Files Created

### 1. `apps/api/tests/integration/export.integration.test.mjs`
- **Test count:** 7 tests
- **Tests implemented:**
  1. CSV items export returns correct content-type
  2. XLSX items export returns Excel file
  3. Items export with type filter applies filters
  4. Prices export returns company-wide prices
  5. Items columns endpoint returns column definitions
  6. Export without Authorization header returns 401
  7. Export with invalid entity type returns 400

### 2. `apps/api/tests/integration/settings.integration.test.mjs`
- **Test count:** 5 tests
- **Tests organized by category:**
  
  **Settings Config Tests:**
  - GET config returns settings for outlet
  - PATCH config updates settings and returns new values
  
  **Settings Pages Tests:**
  - Pages CRUD and publish (covers GET, POST, PATCH, publish)
  
  **Settings Modules Tests:**
  - Modules list and update (PUT/GET /api/settings/modules)
  
  **Settings Module Roles Tests:**
  - Module roles CRUD (PUT/DELETE via /api/settings/modules/module-roles/:roleId/:module)

## Test Execution Evidence

```
# Export tests: 7/7 passed
npm run test:single apps/api/tests/integration/export.integration.test.mjs
# Result: pass 7, fail 0

# Settings tests: 5/5 passed  
npm run test:single apps/api/tests/integration/settings.integration.test.mjs
# Result: pass 5, fail 0

# Total: 12 tests passing
```

## Acceptance Criteria

- [x] **AC1:** Export route integration tests cover CSV/XLSX formats, filters, columns endpoint, auth, and error cases
- [x] **AC2:** Settings route integration tests cover config, pages, modules, and module-roles endpoints

## Technical Notes

### Bug Found
During testing, discovered a bug in `apps/api/src/routes/export.ts` in the `fetchPricesForExport` function:
- **Location:** Line 274
- **Issue:** Extra `values.push(params.outletId)` causes incorrect parameter binding
- **Impact:** When `outlet_id` is provided, the 4th placeholder (`i.company_id = ?`) incorrectly receives `outletId` instead of `companyId`
- **Workaround:** Test uses company-wide prices export (no outlet_id filter) until the production bug is fixed

### Pattern Followed
Tests follow the existing integration test pattern:
- Uses `setupIntegrationTests` from `integration-harness.mjs`
- Uses `loadEnvIfPresent()` at top
- Uses 180000ms timeout per test
- Proper cleanup in finally blocks

## Total Integration Tests Added: 12
