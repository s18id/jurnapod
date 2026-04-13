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
    include: ["__test__/unit/lib-api-client.test.ts"],
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
