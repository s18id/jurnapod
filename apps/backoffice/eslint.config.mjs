// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Backoffice ESLint Configuration
 * 
 * This config extends the Epic 10 component adoption rules.
 * See eslint.config.epic10.mjs for detailed component rules.
 */

import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";
import epic10Rules from "./eslint.config.epic10.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  // Ignore patterns
  {
    ignores: ["dist/**", "node_modules/**", "*.config.*", "e2e/**", "playwright/.cache/**"]
  },

  // Extend Epic 10 component adoption rules
  ...epic10Rules,

  // TypeScript rules
  ...compat.config({
    extends: ["plugin:@typescript-eslint/recommended"],
    parser: "@typescript-eslint/parser",
    plugins: ["@typescript-eslint"],
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/explicit-module-boundary-types": "off",
    },
  }),

  // React rules
  ...compat.config({
    extends: ["plugin:react/recommended", "plugin:react-hooks/recommended"],
    plugins: ["react", "react-hooks"],
    settings: {
      react: {
        version: "detect",
      },
    },
    rules: {
      "react/prop-types": "off",
      "react/react-in-jsx-scope": "off",
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "off",
      "react-hooks/incompatible-library": "off",
    },
  }),

  // JSX A11y rules
  ...compat.config({
    extends: ["plugin:jsx-a11y/recommended"],
    plugins: ["jsx-a11y"],
    rules: {
      "jsx-a11y/aria-proptypes": "error",
      "jsx-a11y/aria-unsupported-elements": "error",
      "jsx-a11y/click-events-have-key-events": "off",
      "jsx-a11y/no-static-element-interactions": "off",
      "jsx-a11y/no-noninteractive-tabindex": "off",
    },
  }),

  // Import rules
  ...compat.config({
    extends: ["plugin:import/recommended"],
    plugins: ["import"],
    rules: {
      "import/order": "off",
      "import/named": "off",
      "import/no-named-as-default": "off",
      "import/no-unresolved": "off", // TypeScript handles this
    },
  }),
];

export default eslintConfig;
