# Pre-Reorganization Tool Standardization Checklist

> **Epic 34 Retrospective Action**: Establish tool configuration standards before any file-structure reorganization to prevent mid-epic migrations and broken workflows.

---

## Purpose

Before reorganizing files (moving tests, splitting packages, extracting modules), all tool configurations must be aligned. Skipping this checklist caused `vitest` runner migrations and `import` path breakage during Epic 34.

---

## 1. Test Infrastructure

### 1.1 Test Directory Structure

- [ ] All packages use canonical `__test__/unit/` and `__test__/integration/` structure
- [ ] No tests remain in `src/routes/` or other non-test directories
- [ ] No duplicate test files in both old and new locations

### 1.2 Test Runner

- [ ] All packages use **vitest** as the test runner (not `node --test`)
- [ ] Root `vitest.config.ts` exists and is referenced by all workspaces
- [ ] `globals: true` is set in all vitest configs

### 1.3 Vitest Config Standards

Every `vitest.config.ts` must include:

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    extensions: ['.js', '.ts', '.tsx'],
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['__test__/**/*.test.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
    teardownTimeout: 10000,
  },
});
```

**For `apps/api`** (use `@/` aliases):
```typescript
import path from 'node:path';
// ... above config ...
  resolve: {
    extensions: ['.js', '.ts', '.tsx'],
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@/lib": path.resolve(__dirname, "src/lib"),
    },
  },
```

**For `packages/*`** (use relative imports — no aliases needed):
```typescript
// No alias section — use relative imports within package
```

---

## 2. Import Path Conventions

### 2.1 API App (`apps/api/src/`)

- [ ] All imports use `@/` aliases (`@/lib/db`, `@/services/pos`)
- [ ] No `../../lib/` or `../services/` relative paths in route/service files
- [ ] No cross-package relative imports (use `@jurnapod/package-name`)

### 2.2 Package Internals (`packages/*/src/`)

- [ ] Internal imports use relative paths (`../db`, `./service`)
- [ ] No `@/` aliases (packages don't have the API app's alias config)
- [ ] Cross-package imports use `@jurnapod/package-name`

### 2.3 Cross-Package Imports

- [ ] Packages import from other packages via `@jurnapod/*` only
- [ ] No relative path crossing package boundaries (e.g., `../../modules/accounting`)

---

## 3. Database Testing Patterns

### 3.1 Fixture Standards

- [ ] Test fixtures created via library functions (`createTestCompanyMinimal()`, etc.)
- [ ] No hardcoded IDs like `company_id: 1` or `userId: 0`
- [ ] All fixtures satisfy FK constraints (valid `user_id`, `company_id`, etc.)
- [ ] No sentinel values in test data

### 3.2 Database Cleanup Hooks

- [ ] Integration tests use `afterAll` (not `afterEach`) for shared pool cleanup
- [ ] `db.destroy()` or `closeTestDb()` called in `afterAll`
- [ ] `resetFixtureRegistry()` called before or in `afterAll`
- [ ] No `afterEach` pool destruction (causes shared-pool failures)

### 3.3 FK-Safe Test Data

| ❌ Wrong | ✅ Correct |
|---------|-----------|
| `userId: 0` | `userId: createdUser.id` (from fixture) |
| `company_id: 1` | `companyId: company.id` (from fixture) |
| `item_id: 999` (hardcoded) | `item_id: item.id` (from fixture) |

---

## 4. Lint and Type Safety

### 4.1 ESLint Rules

- [ ] All custom ESLint rules have unit tests (TRUE POSITIVES + TRUE NEGATIVES)
- [ ] No new rules added without corresponding test coverage
- [ ] `no-route-business-logic` rule is tested with SQL-shape regex (not substring matching)

### 4.2 TypeScript

- [ ] `npm run typecheck -w @jurnapod/api` passes before any file move
- [ ] No `any` types introduced in moved files without justification
- [ ] Import path changes reflected in tsconfig paths (if using path aliases)

---

## 5. CI Gate Pre-Checks

Before marking any reorganization story **Done**, verify:

- [ ] `npm run test -w @jurnapod/api -- --run` passes (all unit + integration)
- [ ] `npm run typecheck -w @jurnapod/api` passes
- [ ] `npm run lint -w @jurnapod/api` passes
- [ ] No new `console.log`, `// TODO`, or commented-out code introduced
- [ ] All imports in moved files are verified (not just "looks correct")

---

## 6. File Move Protocol

When moving files:

1. **Before move**: Run import audit on source file
2. **During move**: Update all import paths to match new location
3. **After move**: Run typecheck + tests before marking complete
4. **Do NOT**: Move files and defer import fixes to a "follow-up task"

---

## Checklist Template (Copy Before Use)

```markdown
## Pre-Reorganization Tool Check

### Test Infrastructure
- [ ] Test runner: vitest with globals: true
- [ ] Test directory: __test__/unit|integration
- [ ] Timeouts: 30000/30000/10000

### Import Paths
- [ ] API uses @/ aliases
- [ ] Packages use relative imports
- [ ] No broken imports after move

### Database Testing
- [ ] FK-safe fixtures (no sentinel IDs)
- [ ] afterAll cleanup with db.destroy()
- [ ] resetFixtureRegistry() called

### CI Pre-Checks
- [ ] typecheck passes
- [ ] lint passes
- [ ] all tests pass
```

---

## 7. Import Path Update Script

When moving code between directories, use the automated import path update script to convert relative imports to `@/` aliases.

### 7.1 Script Location

```
scripts/update-import-paths.ts
```

### 7.2 Usage

```bash
# Basic usage - convert relative imports in target dir that point to source dir
tsx scripts/update-import-paths.ts --source <source-dir> --target <target-dir>

# Dry-run - preview changes without applying
tsx scripts/update-import-paths.ts --source apps/api/src --target apps/api/src/routes --dry-run

# Force - skip confirmation prompt (for CI automation)
tsx scripts/update-import-paths.ts --source lib --target services --force
```

### 7.3 Options

| Option | Description |
|--------|-------------|
| `--source` | Source directory that relative imports resolve to (required) |
| `--target` | Target directory to scan and update (required) |
| `--dry-run` | Show diff without applying changes |
| `--force` | Skip confirmation prompt (for CI automation) |
| `--help` | Show help message |

### 7.4 Examples

```bash
# Convert relative imports in routes to @/ aliases
tsx scripts/update-import-paths.ts --source apps/api/src --target apps/api/src/routes

# Preview changes in services directory
tsx scripts/update-import-paths.ts --source lib --target services --dry-run

# Apply changes with confirmation
tsx scripts/update-import-paths.ts --source lib --target services

# Force apply without confirmation (CI mode)
tsx scripts/update-import-paths.ts --source lib --target services --force
```

### 7.5 What It Does

1. Scans all `.ts` and `.tsx` files in the target directory
2. Identifies relative imports that resolve to the source directory
3. Converts them to `@/` aliases (e.g., `../../../../lib/db` → `@/lib/db`)
4. Preserves external package imports (`@jurnapod/*`, `node_modules`)
5. Outputs a diff showing all changes before applying
6. Creates `.bak` backup files before modifying

### 7.6 Idempotency

The script is idempotent — safe to re-run on already-converted files:
- Already-converted files are detected and skipped
- No changes are made to files that already use `@/` aliases
- Re-running produces "No changes needed" message

### 7.7 Common Workflow

1. **Before moving files**: Run with `--dry-run` to check what would be converted
2. **After moving files**: Run without `--dry-run` to apply conversions
3. **For verification**: Run `--dry-run` again to confirm all imports are converted

---

## References

- [Canonical Test Directory Structure](https://github.com/jurnapod/jurnapod/blob/main/AGENTS.md#canonical-test-directory-structure)
- [DB Cleanup Hook Patterns](./cleanup-patterns.md)
- [Database Fixture Standards](./fixture-standards.md)
- [Vitest Config Templates](../templates/vitest-config-api.md)

---

## 8. Lint Rule Unit Test Template

When adding a new custom ESLint rule, unit tests are **mandatory** (see §4.1). Use the template below.

### 8.1 Test File Location

```
__test__/unit/rules/<rule-name>.test.ts
```

For example: `apps/api/__test__/unit/rules/no-floating-decimal.test.ts`

### 8.2 Dependencies

Install the required packages:

```bash
npm install -D @typescript-eslint/rule-tester @typescript-eslint/parser @typescript-eslint/eslint-plugin
```

### 8.3 Canonical Test Template

```typescript
/**
 * Unit tests for <rule-name> rule.
 *
 * Copy-paste ready — replace <rule-name> and adjust valid/invalid cases.
 */

import { RuleTester } from '@typescript-eslint/rule-tester';
import rule, { RULE_NAME } from './<rule-name>';

const rootPath = '/home/jurnapod/apps/api/src';

const ruleTester = new RuleTester({
  languageOptions: {
    parserOptions: {
      project: './tsconfig.json',
      tsconfigRootDir: rootPath,
    },
  },
});

describe('<rule-name>', () => {
  describe('TRUE POSITIVES — should be flagged', () => {
    it('flags <description of violation>', () => {
      ruleTester.run(RULE_NAME, rule, {
        valid: [],
        invalid: [
          {
            code: '<code that triggers the rule>',
            errors: [{ messageId: '<messageId>' }],
          },
        ],
      });
    });
  });

  describe('TRUE NEGATIVES — should NOT be flagged', () => {
    it('does NOT flag <description of valid case>', () => {
      ruleTester.run(RULE_NAME, rule, {
        valid: [
          {
            code: '<valid code>',
          },
        ],
        invalid: [],
      });
    });
  });
});
```

### 8.4 Worked Example: no-floating-decimal

The `no-floating-decimal` rule flags numbers like `.45` (should be `0.45`).

**Rule implementation** (`no-floating-decimal.ts`):

```typescript
import { Rule } from '@typescript-eslint/utils/dist/ts-eslint';
import { StringLiteral, NumericLiteral } from 'estree';

export const RULE_NAME = 'no-floating-decimal';

export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow话 numbers with a leading decimal point',
      recommended: 'error',
    },
    messages: {
      noFloatingDecimal: 'Remove the leading decimal point. Use 0.number instead.',
    },
    schema: [],
  },
  create(context) {
    return {
      NumericLiteral(node: NumericLiteral) {
        // Check if the raw value starts with '.' (floating decimal without leading 0)
        if (node.raw.startsWith('.')) {
          context.report({
            node,
            messageId: 'noFloatingDecimal',
          });
        }
      },
    };
  },
} satisfies Rule.Module;
```

**Test file** (`__test__/unit/rules/no-floating-decimal.test.ts`):

```typescript
import { RuleTester } from '@typescript-eslint/rule-tester';
import rule, { RULE_NAME } from './no-floating-decimal';

const rootPath = '/home/jurnapod/apps/api/src';

const ruleTester = new RuleTester({
  languageOptions: {
    parserOptions: {
      project: './tsconfig.json',
      tsconfigRootDir: rootPath,
    },
  },
});

describe('no-floating-decimal', () => {
  describe('TRUE POSITIVES — should be flagged', () => {
    it('flags .45 (missing leading zero)', () => {
      ruleTester.run(RULE_NAME, rule, {
        valid: [],
        invalid: [
          {
            code: 'const price = .45;',
            errors: [{ messageId: 'noFloatingDecimal' }],
          },
        ],
      });
    });

    it('flags .123 in object property', () => {
      ruleTester.run(RULE_NAME, rule, {
        valid: [],
        invalid: [
          {
            code: 'const obj = { value: .123 };',
            errors: [{ messageId: 'noFloatingDecimal' }],
          },
        ],
      });
    });
  });

  describe('TRUE NEGATIVES — should NOT be flagged', () => {
    it('does NOT flag 0.45 (correct format)', () => {
      ruleTester.run(RULE_NAME, rule, {
        valid: [
          {
            code: 'const price = 0.45;',
          },
        ],
        invalid: [],
      });
    });

    it('does NOT flag 1.0 (integer with decimal)', () => {
      ruleTester.run(RULE_NAME, rule, {
        valid: [
          {
            code: 'const total = 1.0;',
          },
        ],
        invalid: [],
      });
    });
  });
});
```

### 8.5 Testing Rule Meta Schema

Verify the rule's `meta` properties are correct:

```typescript
describe('meta', () => {
  it('has correct messageId', () => {
    // Access meta from the rule module
    const { meta } = rule;
    expect(meta.messages).toHaveProperty('noFloatingDecimal');
  });

  it('has no required schema params', () => {
    const { meta } = rule;
    expect(meta.schema).toHaveLength(0);
  });

  it('type is "problem"', () => {
    const { meta } = rule;
    expect(meta.type).toBe('problem');
  });
});
```

### 8.6 Integration: Running the Tests

```bash
# Run only the lint rule tests
npm test -- --run __test__/unit/rules/

# Run with coverage
npm run test:unit -- --run --coverage __test__/unit/rules/
```

### 8.7 Checklist for New Rules

- [ ] Rule implementation in `eslint-rules/<rule-name>.ts`
- [ ] Unit tests in `__test__/unit/rules/<rule-name>.test.ts`
- [ ] TRUE POSITIVES: at least 2 cases that should trigger the rule
- [ ] TRUE NEGATIVES: at least 2 cases that should NOT trigger the rule
- [ ] Meta schema tested (messages, type, schema)
- [ ] Rule added to `eslint.config.mjs` plugin config
- [ ] `npm run lint -w @jurnapod/api` passes
- [ ] `npm run test -- --run __test__/unit/rules/<rule-name>.test.ts` passes
