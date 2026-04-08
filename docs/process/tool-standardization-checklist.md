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

## References

- [Canonical Test Directory Structure](https://github.com/jurnapod/jurnapod/blob/main/AGENTS.md#canonical-test-directory-structure)
- [DB Cleanup Hook Patterns](./cleanup-patterns.md)
- [Database Fixture Standards](./fixture-standards.md)
- [Vitest Config Templates](../templates/vitest-config-api.md)
