# story-23.0.2.completion.md: Add import-boundary lint constraints

## Story Information
- **Story ID:** ADB-0.2
- **Epic:** Epic 23
- **Phase:** 0 (Pre-flight)
- **Priority:** P1
- **Estimate:** 3h
- **Title:** Add import-boundary lint constraints

## Implementation Summary

Implemented ESLint `no-restricted-imports` rules to enforce the package boundary policy defined in ADR-0014. Created package-level ESLint flat configs in all 11 packages with boundary enforcement rules.

## Files Modified/Created

### ESLint Configurations (11 packages)
1. `packages/modules/accounting/eslint.config.mjs` - NEW
2. `packages/modules/platform/eslint.config.mjs` - NEW
3. `packages/auth/eslint.config.mjs` - NEW
4. `packages/db/eslint.config.mjs` - NEW
5. `packages/shared/eslint.config.mjs` - NEW
6. `packages/telemetry/eslint.config.mjs` - NEW
7. `packages/notifications/eslint.config.mjs` - NEW
8. `packages/offline-db/eslint.config.mjs` - NEW
9. `packages/pos-sync/eslint.config.mjs` - NEW
10. `packages/backoffice-sync/eslint.config.mjs` - NEW
11. `packages/sync-core/eslint.config.mjs` - NEW

### Package.json Updates
- `package.json` - Added ESLint devDependencies
- Updated `lint` scripts in all 11 packages

## Rules Added

### Boundary Rules (no-restricted-imports)

Each package-level ESLint config includes the following restrictions:

1. **Ban `apps/**` imports from `packages/**`**
   - Message: "[ADR-0014] packages/** must never import from apps/**. Domain logic must not depend on HTTP transport layer."

2. **Ban API helper paths**
   - `@/lib/*` - API helpers alias
   - `apps/api/src/lib/*` - API lib paths
   - `apps/api/src/routes/*` - API routes
   - `apps/api/src/middleware/*` - Hono middleware
   - `apps/api/src/services/*` - API services

3. **Ban @jurnapod/modules-accounting → @jurnapod/modules-sales**
   - Message: "[ADR-0014] @jurnapod/modules-accounting must not import @jurnapod/modules-sales."

4. **Ban sync transport packages from domain packages**
   - `@jurnapod/pos-sync`
   - `@jurnapod/backoffice-sync`
   - `@jurnapod/sync-core`

5. **Sync transport cross-restrictions**
   - pos-sync cannot import backoffice-sync (and vice versa)
   - sync-core cannot import from pos-sync or backoffice-sync

## Current Violations Found

**No violations found.** All packages pass lint with zero boundary violations.

This means the existing codebase already complies with the ADR-0014 boundary policy.

## Known Violations Requiring Future Cleanup

None identified - all existing code is boundary-compliant.

## Validation Evidence

```bash
# Accounting module
npm run lint -w @jurnapod/modules-accounting  # PASS (0 errors, 0 warnings)

# Platform module  
npm run lint -w @jurnapod/modules-platform    # PASS (0 errors, 0 warnings)

# Auth package
npm run lint -w @jurnapod/auth                # PASS (0 errors, 3 warnings - unused eslint-disable directives)

# DB package
npm run lint -w @jurnapod/db                  # PASS (0 errors, 0 warnings)

# Shared package
npm run lint -w @jurnapod/shared              # PASS (0 errors, 0 warnings)

# Telemetry package
npm run lint -w @jurnapod/telemetry           # PASS (0 errors, 0 warnings)

# Notifications package
npm run lint -w @jurnapod/notifications       # PASS (0 errors, 0 warnings)

# Offline-db package
npm run lint -w @jurnapod/offline-db          # PASS (0 errors, 0 warnings)

# Sync-core package
npm run lint -w @jurnapod/sync-core           # PASS (0 errors, 0 warnings)

# POS-sync package
npm run lint -w @jurnapod/pos-sync            # PASS (0 errors, 0 warnings)

# Backoffice-sync package
npm run lint -w @jurnapod/backoffice-sync     # PASS (0 errors, 0 warnings)
```

## Notes

- Rules use "warn" level to discover violations without blocking builds
- The auth package has 3 warnings about unused `eslint-disable-next-line @typescript-eslint/no-explicit-any` directives - these are pre-existing and not related to boundary enforcement
- All boundary rules are scoped to their respective packages via ESLint's `files` pattern
- The rules will catch any future violations when imports are added

## Follow-up Work

- Later stories will fix any violations discovered (currently none exist)
- Consider adding CI gate to fail on boundary violations (ADR-0014 Section: CI gates)
- Consider implementing TypeScript project references for additional boundary enforcement
