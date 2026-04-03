// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";
import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import jurnapodTestRules from "../../eslint-plugin-jurnapod-test-rules.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const config = [
  {
    ignores: ["dist/**", "node_modules/**"],
  },
  // Base TypeScript config
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: __dirname,
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
      "jurnapod-test-rules": jurnapodTestRules,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      // Production code rules
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
  // Test file specific rules
  {
    files: ["src/**/*.test.ts"],
    plugins: {
      "jurnapod-test-rules": jurnapodTestRules,
    },
    rules: {
      // Enforce library functions over raw SQL/hardcoded IDs
      "jurnapod-test-rules/no-hardcoded-ids": "error",
      "jurnapod-test-rules/no-raw-sql-insert-items": "error",
    },
  },
  // Route file specific rules - enforce thin routes
  {
    files: ["src/routes/**/*.ts"],
    ignores: ["src/routes/**/*.test.ts"],
    plugins: {
      "jurnapod-test-rules": jurnapodTestRules,
    },
    rules: {
      // Enforce route thinness: no business logic in routes
      "jurnapod-test-rules/no-route-business-logic": "error",
    },
  },
];

export default config;
