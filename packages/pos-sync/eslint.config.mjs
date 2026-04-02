// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * ESLint Configuration for @jurnapod/pos-sync
 * 
 * This is a sync transport package. Boundary rules enforce ADR-0014:
 * - Domain packages must NOT import from sync transport packages
 * - Sync packages CAN import domain modules (@jurnapod/modules-accounting, @jurnapod/modules-platform, etc.)
 * - Sync packages must NOT import from apps/**
 * - Sync packages should NOT import from other sync transport packages
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
              "[ADR-0014] packages/** must never import from apps/** (or API aliases/paths). Sync transport must not depend on HTTP transport layer.",
          },
        ],
        paths: [
          {
            name: "@jurnapod/backoffice-sync",
            message:
              "[ADR-0014] Sync transport packages should not import from other sync transport packages. Keep sync transports independent.",
          },
        ],
      },
    ],
  },
};

export default config;
