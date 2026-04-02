// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * ESLint Configuration for @jurnapod/modules-platform
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
  // Apply to all source files
  files: ["src/**/*.ts", "src/**/*.tsx"],
  
  // Ignore build artifacts
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
              "[ADR-0014] packages/** must never import from apps/** (or API aliases/paths).",
          },
        ],
        paths: [
          {
            name: "@jurnapod/modules-sales",
            message:
              "[ADR-0014] Domain packages must not import @jurnapod/modules-sales.",
          },
          {
            name: "@jurnapod/pos-sync",
            message:
              "[ADR-0014] Domain packages must not import @jurnapod/pos-sync (transport/sync runtime). Keep domain logic transport-agnostic.",
          },
          {
            name: "@jurnapod/backoffice-sync",
            message:
              "[ADR-0014] Domain packages must not import @jurnapod/backoffice-sync (transport/sync runtime). Keep domain logic transport-agnostic.",
          },
          {
            name: "@jurnapod/sync-core",
            message:
              "[ADR-0014] Domain packages must not import @jurnapod/sync-core (sync infrastructure). Only sync packages should depend on sync-core.",
          },
        ],
      },
    ],
  },
};

export default config;
