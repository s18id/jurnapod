# Story 34.2: Define Canonical Structure

## Overview

**Story:** Story 34.2: Define Canonical Structure  
**Epic:** Epic 34: Test Reorganization & Assessment  
**Estimate:** 4h  
**Priority:** P1

## Goal

Establish `__test__/unit/` and `__test__/integration/` as the standard test directory structure across all packages, and update configuration files to support this structure.

## Acceptance Criteria

1. Standard directory structure defined:
   ```
   __test__/
   ├── unit/           # True unit tests (no DB, mocked deps)
   └── integration/    # Tests with real DB, HTTP, external deps
   ```

2. Vitest configs updated to include new paths:
   - `packages/sync-core/vitest.config.ts`
   - `packages/pos-sync/vitest.config.ts`
   - `packages/backoffice-sync/vitest.config.ts`
   - `packages/notifications/vitest.config.ts`
   - `packages/modules/platform/vitest.config.ts`

3. API package.json scripts updated:
   ```json
   {
     "test:unit": "node --import ... \"__test__/unit/**/*.test.ts\"",
     "test:integration": "node --import ... \"__test__/integration/**/*.test.ts\"",
     "test": "npm run test:unit && npm run test:integration"
   }
   ```

4. Directory structure created where tests don't exist yet

## Configuration Changes

### Vitest Config Pattern

```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: [
      '__test__/unit/**/*.test.ts',
      '__test__/integration/**/*.test.ts'
    ],
    testTimeout: 30000,
    hookTimeout: 30000,
    teardownTimeout: 10000,
  },
});
```

### API Test Scripts

Current pattern:
```json
"test:unit": "node --import ... \"src/**/*.test.ts\""
```

Target pattern:
```json
"test:unit": "node --import ... \"__test__/unit/**/*.test.ts\"",
"test:integration": "node --import ... \"__test__/integration/**/*.test.ts\""
```

## Deliverables

1. Updated vitest.config.ts files (5 packages)
2. Updated package.json scripts (API + packages with vitest)
3. Created `__test__/unit/` and `test__/integration/` directories

## Dependencies

- Story 34.1 (audit provides inventory)

## Notes

- Do not move any tests yet - just set up the structure
- Existing test locations remain until Stories 34.3, 34.5
