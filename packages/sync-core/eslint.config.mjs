// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * ESLint Configuration for @jurnapod/sync-core
 * 
 * This is sync infrastructure (not a transport package). Boundary rules enforce ADR-0014:
 * - Domain packages must NOT import from sync-core (sync infrastructure is for sync packages only)
 * - pos-sync and backoffice-sync (sync transports) CAN import sync-core
 * - sync-core must NOT import from pos-sync or backoffice-sync
 * - sync-core must NOT import from apps/**
 * 
 * @see /docs/adr/ADR-0014-package-boundary-policy.md
 */

import { dirname } from "path";
import { fileURLToPath } from "url";
import tsParser from "@typescript-eslint/parser";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const config = {
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
      "warn",
      {
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
              "[ADR-0014] packages/** must never import from apps/** (or API aliases/paths). Sync infrastructure must not depend on HTTP transport layer.",
          },
        ],
        paths: [
          {
            name: "@jurnapod/pos-sync",
            message:
              "[ADR-0014] @jurnapod/sync-core must not import from @jurnapod/pos-sync. Sync infrastructure should not depend on specific transport implementations.",
          },
          {
            name: "@jurnapod/backoffice-sync",
            message:
              "[ADR-0014] @jurnapod/sync-core must not import from @jurnapod/backoffice-sync. Sync infrastructure should not depend on specific transport implementations.",
          },
        ],
      },
    ],
  },
};

export default config;
