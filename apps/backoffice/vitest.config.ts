import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
  test: {
    globals: true,
    environment: "node",
    // Only include vitest-compatible test files.
    // Node.js built-in test runner files (using `node:test`) are run via `npm run test`.
    include: [
      "__test__/unit/lib-api-client.test.ts",
      "__test__/unit/alias-validation.test.ts",
      "__test__/unit/lib-typed-api.test.ts",
      "__test__/unit/lib-auth.test.ts",
      "__test__/unit/lib-cache-hooks.test.ts",
      "__test__/unit/app-router-guards.test.ts",
      "__test__/unit/app-shell-model.test.ts",
      "__test__/unit/components-data-grid.test.ts",
      "__test__/unit/components/data-grid/*.test.tsx",
      "__test__/unit/app-router-bridge.test.ts",
      "__test__/unit/app-shell-layout.test.ts",
      "__test__/unit/permission-bits.test.ts",
      "__test__/unit/permission-matrix.test.ts",
      "__test__/unit/features/users.test.ts",
      "__test__/unit/features/audit.test.ts",
      "__test__/unit/features/companies-outlets.test.ts",
      "__test__/unit/features/inventory/*.test.ts",
      "__test__/unit/features/inventory/*.test.tsx",
      "__test__/unit/features/import/*.test.ts",
      "__test__/unit/features/import/*.test.tsx",
      "__test__/unit/export/*.test.ts",
      "__test__/unit/features/prices/*.test.ts",
      "__test__/unit/features/prices/*.test.tsx",
      "__test__/unit/components/*.test.tsx",
      "__test__/unit/hooks/*.test.ts",
      "__test__/unit/app-router-guards-permissions.test.ts",
    ],
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
