# Vitest Config Template — Package

> For `packages/*/` — adds `@/` and `@jurnapod/*` path alias support so tests can use the same import conventions as production code.

```typescript
import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Resolve aliases relative to this vitest.config.ts location
// Adjust '../' depth based on package structure (standard: packages/<name>/)
const packageRoot = path.resolve(__dirname, '../');

export default defineConfig({
  resolve: {
    extensions: ['.js', '.ts', '.tsx'],
    alias: {
      // Package-local imports: @/ maps to <packageRoot>/src
      // e.g., import { db } from '@/lib/db' → packages/<name>/src/lib/db
      '@/': path.join(packageRoot, 'src'),

      // Cross-package imports: @jurnapod/* maps to repo packages
      // e.g., import { db } from '@jurnapod/db' → packages/db/src
      '@jurnapod/shared': path.resolve(__dirname, '../../packages/shared/src'),
      '@jurnapod/db': path.resolve(__dirname, '../../packages/db/src'),
      '@jurnapod/auth': path.resolve(__dirname, '../../packages/auth/src'),
      '@jurnapod/modules-accounting': path.resolve(__dirname, '../../packages/modules/accounting/src'),
      '@jurnapod/modules-inventory': path.resolve(__dirname, '../../packages/modules/inventory/src'),
      '@jurnapod/modules-inventory-costing': path.resolve(__dirname, '../../packages/modules/inventory-costing/src'),
      '@jurnapod/modules-platform': path.resolve(__dirname, '../../packages/modules/platform/src'),
      '@jurnapod/modules-sales': path.resolve(__dirname, '../../packages/modules/sales/src'),
      '@jurnapod/modules-treasury': path.resolve(__dirname, '../../packages/modules/treasury/src'),
      '@jurnapod/modules-reservations': path.resolve(__dirname, '../../packages/modules/reservations/src'),
      '@jurnapod/modules-reporting': path.resolve(__dirname, '../../packages/modules/reporting/src'),
      '@jurnapod/pos-sync': path.resolve(__dirname, '../../packages/pos-sync/src'),
      '@jurnapod/backoffice-sync': path.resolve(__dirname, '../../packages/backoffice-sync/src'),
      '@jurnapod/sync-core': path.resolve(__dirname, '../../packages/sync-core/src'),
      '@jurnapod/notifications': path.resolve(__dirname, '../../packages/notifications/src'),
      '@jurnapod/telemetry': path.resolve(__dirname, '../../packages/telemetry/src'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['__test__/**/*.test.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
    teardownTimeout: 10000,
  },
});
```

## Key Points

- **`globals: true`** — Supplies `describe`, `it`, `expect`, `vi`, etc. globally
- **`environment: 'node'`** — Packages typically test pure logic or use `@jurnapod/db` for DB tests
- **`@/` alias** — Maps to `<packageRoot>/src`; enables package-local imports like `@/lib/db`
- **`@jurnapod/*` aliases** — Maps to other packages' `src` directories for cross-package imports
- **Timeouts** — Standard 30s/30s/10s configuration

## Adapting the Alias Paths

The `../../packages/` depth assumes the standard structure:

```
repo-root/
└── packages/
    └── <package-name>/           ← your package
        └── vitest.config.ts       ← this file (at depth 2)
```

If your package is nested differently (e.g., `packages/modules/<name>/`), adjust the `../../` path segments accordingly:

| Package Location | Path to `packages/` |
|------------------|---------------------|
| `packages/<name>/` | `../../packages/` |
| `packages/modules/<name>/` | `../../../packages/` |
| `apps/<name>/` | `../../packages/` |

## Package Internal Imports

```typescript
// packages/modules/accounting/src/journal/service.ts
import { db } from '../../../../packages/db/src';  // ❌ Wrong — crosses package boundary via relative
import { db } from '@jurnapod/db';                  // ✅ Correct — explicit package reference
```

## When Package Needs DB Access

If your package tests need a real database, use the helpers from `@jurnapod/db`:

```typescript
import { getTestKysely, closeTestKysely } from '@jurnapod/db/test/helpers';

describe('MyService', () => {
  const db = getTestKysely();

  afterAll(async () => {
    await closeTestKysely(db);
  });

  it('should work with real DB', async () => {
    const result = await db.selectFrom('companies').selectAll().execute();
    expect(result.length).toBeGreaterThan(0);
  });
});
```

## When Package Tests Need Fixtures

If your package tests need company/user/item fixtures, import from `@jurnapod/shared/test`:

```typescript
// packages/modules/sales/__test__/integration/order-service.test.ts
import { createTestCompanyMinimal } from '@jurnapod/shared/test/fixtures';
```

## Minimal `package.json` Test Setup

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:unit": "vitest run __test__/unit",
    "test:integration": "vitest run __test__/integration"
  },
  "devDependencies": {
    "vitest": "^2.0.0"
  }
}
```

## Shared Test Helpers Location

| Package | Test Helpers |
|---------|-------------|
| `@jurnapod/db` | `packages/db/test/helpers.ts` |
| `@jurnapod/shared` | `packages/shared/test/fixtures.ts` |
| `@jurnapod/auth` | `packages/auth/__test__/` |

## Adding Workspace Test Scripts to Root `package.json`

If you want to run all tests from root:

```json
{
  "scripts": {
    "test": "npm run test -ws --if-present",
    "test:unit": "npm run test:unit -ws --if-present",
    "test:integration": "npm run test:integration -ws --if-present"
  }
}
```
