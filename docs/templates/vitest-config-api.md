# Vitest Config Template — API App

> For `apps/api/` — uses `@/` path aliases.

```typescript
import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    extensions: ['.js', '.ts', '.tsx'],
    alias: {
      // Root src alias
      "@": path.resolve(__dirname, "src"),
      // Common sub-path aliases
      "@/lib": path.resolve(__dirname, "src/lib"),
      "@/services": path.resolve(__dirname, "src/services"),
      "@/routes": path.resolve(__dirname, "src/routes"),
      "@/middleware": path.resolve(__dirname, "src/middleware"),
      "@/types": path.resolve(__dirname, "src/types"),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['__test__/**/*.test.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
    teardownTimeout: 10000,
    // Coverage optional — enable if needed
    // coverage: {
    //   reporter: ['text', 'json', 'html'],
    //   include: ['src/**/*.ts'],
    //   exclude: ['src/**/*.d.ts'],
    // },
  },
});
```

## Key Points

- **`globals: true`** — Supplies `describe`, `it`, `expect`, `vi`, etc. globally
- **`environment: 'node'`** — Use `node` for API tests; use `node` with `@jurnapod/db` for DB-integrated tests
- **Timeouts** — `testTimeout: 30000` (30s per test), `hookTimeout: 30000` (30s for beforeAll/beforeEach), `teardownTimeout: 10000` (10s for cleanup)
- **Aliases** — `@/` resolves to `src/`, enabling `import { db } from '@/lib/db'` instead of `../../lib/db`

## Dependencies

Ensure these are installed in `apps/api/`:

```json
{
  "devDependencies": {
    "vitest": "^2.0.0"
  }
}
```

## Loading Root `.env` in Tests

If your tests need environment variables from the root `.env`:

Create `scripts/test/load-root-env.mjs`:

```javascript
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load from project root .env
const envPath = resolve(__dirname, '../../.env');
try {
  const envContent = readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const [key, ...valueParts] = line.split('=');
    if (key && valueParts.length > 0) {
      process.env[key.trim()] = valueParts.join('=').trim();
    }
  }
} catch {
  // .env may not exist in all environments
}
```

Then import in your `vitest.config.ts`:

```typescript
import '../../scripts/test/load-root-env.mjs';
```

## Using with TypeScript path aliases

If you also use `tsconfig.json` paths:

```json
// apps/api/tsconfig.json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./src/*"],
      "@/lib/*": ["./src/lib/*"]
    }
  }
}
```

Keep the `vitest.config.ts` `resolve.alias` in sync with `tsconfig.json` paths.
