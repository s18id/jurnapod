# Backoffice E2E Testing Setup Summary

## Overview
Successfully set up Playwright E2E testing infrastructure for the Backoffice application, following the same patterns as the POS app.

## Test Results
✅ **All 9 E2E tests passing!**

### Passing Tests
1. ✅ Backoffice Authentication - shows login page when not authenticated
2. ✅ Backoffice Authentication - app loads when already authenticated  
3. ✅ Backoffice Authentication - successful login redirects to app
4. ✅ Backoffice Authentication - login with invalid credentials shows error
5. ✅ Backoffice Smoke Test - backoffice app loads
6. ✅ Users Page - loads users page with DataTable
7. ✅ Users Page - users page has filter bar
8. ✅ Users Page - search filters users in DataTable
9. ✅ Users Page - DataTable pagination works

## Key Fixes

### Login Flow Test
**Problem**: After form submission, app didn't transition to authenticated state.

**Root Cause**: 
1. Playwright route mocking uses first matching route - calling `mockUserMe(false)` then `mockUserMe(true)` didn't work
2. Login response format was incorrect - needed `access_token` not `token`

**Solution**: Use stateful mock with flag to track login state:
```typescript
let loginAttempted = false;
await page.route("**/api/users/me", async (route) => {
  if (!loginAttempted) {
    // Return 401 before login
    await route.fulfill({ status: 401, ... });
  } else {
    // Return authenticated user after login
    await route.fulfill({ status: 200, data: MOCK_USER });
  }
});

await page.route("**/api/auth/login", async (route) => {
  loginAttempted = true; // Set flag
  await route.fulfill({
    data: {
      access_token: "test-access-token", // Correct format
      token_type: "Bearer",
      expires_in: 3600
    }
  });
});
```

## Approach Used

### Authentication Pattern (Same as POS)
Instead of using cookies, we use `page.addInitScript()` to inject a test token:

```typescript
await page.addInitScript(() => {
  (window as any).__E2E_ACCESS_TOKEN__ = "test-access-token";
});
```

The session module checks for this token:

```typescript
export function getStoredAccessToken(): string | null {
  // Check for E2E test token first
  if (typeof window !== "undefined" && (window as any).__E2E_ACCESS_TOKEN__) {
    return (window as any).__E2E_ACCESS_TOKEN__;
  }
  return inMemoryAccessToken;
}
```

### API Mocking
Created comprehensive mock helpers for:
- `/api/health`
- `/api/users/me`
- `/api/companies`
- `/api/outlets`
- `/api/roles`
- `/api/settings/modules`
- `/api/users` (with proper user structure including global_roles and outlet_role_assignments)

### Test Organization
- `e2e/mock-helpers.ts` - Centralized API mocking functions
- `e2e/selectors.ts` - Shared test selectors
- `e2e/auth.spec.ts` - Authentication flow tests
- `e2e/smoke.spec.ts` - Basic app smoke test
- `e2e/users-page.spec.ts` - Users page with DataTable integration tests

## Component Testing Status

### Blocked: Playwright Component Tests
- **Issue**: Duplicate identifier errors when loading Vite config
- **Error**: `SyntaxError: Identifier 'MantineProvider' has already been declared`
- **Root Cause**: Vite PWA plugin interference with Playwright CT server
- **Workaround Created**: Separate `vite.ct.config.ts` without PWA plugin
- **Status**: Still timing out and showing module loading issues

### Alternative Considered
- Use Vitest with HappyDOM for component testing instead
- Would avoid Vite config compatibility issues
- More aligned with Node.js test runner already used in backoffice

## Files Created/Modified

### Created
- `apps/backoffice/playwright.config.ts` - E2E test config
- `apps/backoffice/playwright.ct.config.ts` - Component test config (blocked)
- `apps/backoffice/vite.ct.config.ts` - Simplified Vite config for CT
- `apps/backoffice/e2e/selectors.ts` - Shared test selectors
- `apps/backoffice/e2e/smoke.spec.ts` - Smoke test
- `apps/backoffice/e2e/auth.spec.ts` - Authentication tests
- `apps/backoffice/e2e/users-page.spec.ts` - Users page tests
- `apps/backoffice/e2e/mock-helpers.ts` - API mocking utilities
- `apps/backoffice/components/DataTable.spec.tsx` - Component tests (blocked)

### Modified
- `apps/backoffice/package.json` - Added Playwright dependencies and scripts
- `apps/backoffice/src/lib/session.ts` - Added E2E token check in `getStoredAccessToken()`
- `apps/backoffice/src/components/ui/DataTable/DataTable.tsx` - Added missing data-testid attributes

## Next Steps

### High Priority
1. ✅ ~~Fix login flow test~~ - **COMPLETED**
2. **Add more E2E tests** - For other Epic 10 components (PageHeader, FilterBar) in context of actual pages
3. **Decide on component testing strategy** - Playwright CT vs Vitest with HappyDOM

### Medium Priority
4. **Add E2E tests for other pages** - Items, Outlets, Roles, etc.
5. **Add accessibility tests** - Using @axe-core/playwright for a11y validation
6. **Add visual regression tests** - Using Playwright's screenshot comparison

### Low Priority
7. **Performance testing** - Add tests to validate page load times
8. **Mobile viewport testing** - Test responsive behavior

## Running Tests

```bash
# Run all E2E tests
npm run qa:e2e -w @jurnapod/backoffice

# Run specific test
npm run qa:e2e -w @jurnapod/backoffice -- --grep "loads users page"

# Run in headed mode (see browser)
npm run qa:e2e:headed -w @jurnapod/backoffice

# Component tests (currently blocked)
npm run qa:ct -w @jurnapod/backoffice
```

## Lessons Learned

1. **Follow existing patterns** - Using POS authentication approach simplified setup significantly
2. **Mock comprehensively** - Need to mock all endpoints the app calls during bootstrap (health, users/me, companies, outlets, roles, modules)
3. **Use hash routing** - Backoffice uses hash-based routing (`/#/users`), must include `#` in navigation
4. **Handle strict mode violations** - Use `.first()` or more specific selectors when elements appear multiple times
5. **Vite PWA plugin issues** - Can interfere with Playwright CT, need separate configs

## References
- POS E2E Tests: `apps/pos/e2e/`
- Playwright Docs: https://playwright.dev/
- Epic 10 Spec: `_bmad-output/implementation-artifacts/epics/epic-10/epic-spec.md`
