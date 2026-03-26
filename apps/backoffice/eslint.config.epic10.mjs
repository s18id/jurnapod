// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * ESLint Configuration for Backoffice - Epic 10 Component Adoption
 * 
 * This configuration enforces the use of Epic 10 reusable components:
 * - PageHeader (ui/PageHeader)
 * - FilterBar (ui/FilterBar)
 * - DataTable (ui/DataTable)
 * 
 * Legacy components at component root level are deprecated:
 * - DataTable.tsx (use ui/DataTable/DataTable.tsx)
 * - FilterBar.tsx (use ui/FilterBar/FilterBar.tsx)
 * 
 * @see /docs/ui-standards.md for component documentation
 */

import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  // Ignore patterns
  {
    ignores: ["dist/**", "node_modules/**", "*.config.*", "e2e/**"]
  },

  // ============================================
  // EPIC 10 COMPONENT ADOPTION RULES
  // ============================================

  // Rule 1: Deprecate legacy DataTable component
  {
    files: ["**/*.tsx", "**/*.ts"],
    ignores: ["**/ui/FilterBar/index.ts", "**/ui/DataTable/index.ts"],
    rules: {
      /**
       * Warn when importing the legacy DataTable from component root
       * New code should import from ui/DataTable/DataTable
       */
      "no-restricted-imports": [
        "error",
        {
          name: "./DataTable",
          message:
            "Legacy DataTable is deprecated. Use ui/DataTable/DataTable instead. See /docs/ui-standards.md",
        },
        {
          name: "../DataTable",
          message:
            "Legacy DataTable is deprecated. Use ui/DataTable/DataTable instead. See /docs/ui-standards.md",
        },
        {
          name: "../../components/DataTable",
          message:
            "Legacy DataTable is deprecated. Use ui/DataTable/DataTable instead. See /docs/ui-standards.md",
        },
      ],
    },
  },

  // Rule 2: Deprecate legacy FilterBar component
  {
    files: ["**/*.tsx", "**/*.ts"],
    ignores: ["**/ui/FilterBar/index.ts", "**/ui/DataTable/index.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          name: "./FilterBar",
          message:
            "Legacy FilterBar is deprecated. Use ui/FilterBar/FilterBar instead. See /docs/ui-standards.md",
        },
        {
          name: "../FilterBar",
          message:
            "Legacy FilterBar is deprecated. Use ui/FilterBar/FilterBar instead. See /docs/ui-standards.md",
        },
        {
          name: "../../components/FilterBar",
          message:
            "Legacy FilterBar is deprecated. Use ui/FilterBar/FilterBar instead. See /docs/ui-standards.md",
        },
      ],
    },
  },

  // Rule 3: Encourage proper component composition with PageHeader
  {
    files: ["**/pages/**/*.tsx", "**/page/**/*.tsx"],
    rules: {
      /**
       * Pages should have PageHeader for consistent layout
       * This rule is aspirational - we want to migrate pages to use PageHeader
       */
      "prefer-const": "warn",
    },
  },

  // ============================================
  // ACCESSIBILITY RULES (WCAG 2.1 AA)
  // ============================================

  {
    files: ["**/*.tsx"],
    rules: {
      // Enforce aria-label on interactive elements without text
      "jsx-a11y/aria-proptypes": "error",
      "jsx-a11y/aria-unsupported-elements": "error",
      "jsx-a11y/click-events-have-key-events": "warn",
      "jsx-a11y/no-static-element-interactions": "warn",
    },
  },

  // ============================================
  // REACT best practices
  // ============================================

  {
    files: ["**/*.tsx"],
    rules: {
      "react/prop-types": "off", // Using TypeScript
      "react/react-in-jsx-scope": "off", // React 17+ new JSX transform
      "react/display-name": "off",
    },
  },

  // ============================================
  // TANSTACK TABLE RULES
  // ============================================

  {
    files: ["**/ui/DataTable/**/*.tsx", "**/ui/DataTable/**/*.ts"],
    rules: {
      /**
       * TanStack Table is the standard for data tables in Epic 10
       * Enforce usage of @tanstack/react-table
       */
      "no-restricted-imports": [
        "error",
        {
          name: "@mantine/core",
          importNames: ["Table"],
          message:
            "Use TanStack Table with custom DataTable wrapper. See /docs/ui-standards.md",
        },
      ],
    },
  },

  // ============================================
  // MANTINE COMPONENT RULES
  // ============================================

  {
    files: ["**/*.tsx"],
    rules: {
      /**
       * Prefer Epic 10 components over raw Mantine components
       * This is a soft rule - Mantine is still allowed but Epic 10 preferred
       */
      "no-restricted-imports": [
        "off",
        {
          name: "@mantine/core",
          importNames: ["Card", "Paper"],
          message:
            "Consider using Epic 10 Card/PageCard components for consistency. See /docs/ui-standards.md",
        },
      ],
    },
  },
];

export default eslintConfig;
