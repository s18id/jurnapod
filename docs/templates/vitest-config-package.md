# Vitest Config Template — Package

> For `packages/*/` — uses **relative imports**, no `@/` aliases.

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    extensions: ['.js', '.ts', '.tsx'],
    // NO alias section — packages use relative imports
    // e.g., import { db } from '../db';
    // NOT: import { db } from '@/lib/db';
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
- **No aliases** — Packages must use relative imports (`../db`, `./service`). This avoids coupling to the API app's alias configuration.
- **Timeouts** — Standard 30s/30s/10s configuration

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
