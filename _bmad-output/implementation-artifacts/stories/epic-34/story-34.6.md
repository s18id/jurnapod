# Story 34.6: Validate & Update Scripts

## Overview

**Story:** Story 34.6: Validate & Update Scripts  
**Epic:** Epic 34: Test Reorganization & Assessment  
**Estimate:** 4h  
**Priority:** P1

## Goal

Update all package.json test scripts to work with the new `__test__/unit` and `__test__/integration` structure.

## Acceptance Criteria

1. All packages have updated test scripts
2. `npm run test` runs both unit and integration tests
3. Separate scripts for `npm run test:unit` and `npm run test:integration`
4. All scripts are functional (verified by running)

## Package Script Updates

### apps/api

Current:
```json
{
  "test": "npm run test:unit",
  "test:unit": "node --import ... \"src/**/*.test.ts\"",
  "test:integration": "node --import ... \"tests/integration/*.integration.test.mjs\""
}
```

Target:
```json
{
  "test": "npm run test:unit && npm run test:integration",
  "test:unit": "node --import ... \"__test__/unit/**/*.test.ts\"",
  "test:integration": "node --import ... \"__test__/integration/**/*.test.ts\""
}
```

### packages/auth

Add vitest.config.ts if not present, then:
```json
{
  "test": "npm run test:unit && npm run test:integration",
  "test:unit": "vitest run __test__/unit",
  "test:integration": "vitest run __test__/integration"
}
```

### packages/pos-sync

Already has unit/integration naming in files:
- `persist-push-batch.unit.test.ts` → `__test__/unit/`
- `persist-push-batch.integration.test.ts` → `__test__/integration/`

Update vitest config to use `__test__/**/*.test.ts`

### packages/modules/*

Standardize all module packages:
```json
{
  "test": "vitest run",
  "test:unit": "vitest run __test__/unit",
  "test:integration": "vitest run __test__/integration"
}
```

### packages/notifications

```json
{
  "test": "vitest run",
  "test:unit": "vitest run __test__/unit",
  "test:integration": "vitest run __test__/integration"
}
```

## Packages That Need New Scripts

| Package | Current | Target |
|---------|---------|--------|
| `packages/modules/accounting` | Only runs `src/posting.test.ts` | Full vitest with `__test__/` |
| `packages/modules/reservations` | No test script | Add vitest with `__test__/` |
| `packages/modules/treasury` | No test script | Add vitest with `__test__/` |
| `packages/backoffice-sync` | No test script | Add vitest with `__test__/` |
| `packages/telemetry` | No test script | Add vitest with `__test__/` |

## Deliverables

1. Updated `apps/api/package.json`
2. Updated `packages/auth/package.json`
3. Updated `packages/pos-sync/package.json` + vitest.config.ts
4. Updated all `packages/modules/*/package.json`
5. Updated `packages/notifications/package.json`
6. Created vitest.config.ts for packages without one

## Dependencies

- Story 34.3 (API tests reorganized)
- Story 34.5 (package tests reorganized)

## Notes

- Verify scripts work by running `npm run test -w @jurnapod/{pkg}` for each
- Some packages may need `tsx` or other dependencies for running tests
- Check existing vitest configs for correct environment settings
