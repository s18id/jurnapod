// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * ESLint Configuration for @jurnapod/modules-treasury
 *
 * Boundary rules enforce ADR-0014 package boundary policy:
 * 1. packages/** must never import from apps/**
 * 2. Domain packages must not import API route/middleware/auth helpers
 * 3. Sync transport packages must not be imported by domain packages
 *
 * @see /docs/adr/ADR-0014-package-boundary-policy.md
 */

import { dirname } from "path";
import { fileURLToPath } from "url";
import tsParser from "@typescript-eslint/parser";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const config = {
  // ESLint for this workspace runs from package root
  files: ["src/**/*.ts", "src/**/*.tsx"],

  ignores: ["dist/**", "node_modules/**", "*.config.*"],

  languageOptions: {
    parser: tsParser,
    parserOptions: {
      project: "./tsconfig.json",
      tsconfigRootDir: __dirname,
    },
  },

  rules: {
    "no-restricted-imports": [
      "error",
      {
        // IMPORTANT: no-restricted-imports requires patterns in a single options object
        patterns: [
          {
            group: [
              "apps/*",
              "apps/**",
              "@/lib",
              "@/lib/*",
              "@/lib/**",
              "apps/api/src/lib/*",
              "apps/api/src/lib/**",
              "apps/api/src/routes/*",
              "apps/api/src/routes/**",
              "apps/api/src/middleware/*",
              "apps/api/src/middleware/**",
              "apps/api/src/services/*",
              "apps/api/src/services/**",
            ],
            message:
              "[ADR-0014] packages/** must never import from apps/** (or API aliases/paths).",
          },
        ],
        paths: [
          {
            name: "@jurnapod/pos-sync",
            message:
              "[ADR-0014] Domain packages must not import @jurnapod/pos-sync.",
          },
          {
            name: "@jurnapod/backoffice-sync",
            message:
              "[ADR-0014] Domain packages must not import @jurnapod/backoffice-sync.",
          },
          {
            name: "@jurnapod/sync-core",
            message:
              "[ADR-0014] Domain packages must not import @jurnapod/sync-core.",
          },
        ],
      },
    ],
  },
};

export default config;
