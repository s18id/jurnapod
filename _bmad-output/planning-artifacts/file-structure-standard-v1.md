# File Structure Standard v1 — Jurnapod Architecture Program

> **Version:** 1.0 (Epic 48)  
> **Effective:** 2026-04-21  
> **Scope:** Active scope enforcement; deferred scope as policy guidance only  
> **Status:** Canonical — enforcement via Story 48.9 CI ratchet

---

## Scope Definitions

### Active Scope (Enforced Now)

| Scope | Enforcement |
|-------|-------------|
| `apps/api/src/**` | **Enforced** — CI ratchet gate (Story 48.9) |
| `packages/auth/src/**` | **Enforced** |
| `packages/db/src/**` | **Enforced** |
| `packages/shared/src/**` | **Enforced** |
| `packages/sync-core/src/**` | **Enforced** |
| `packages/pos-sync/src/**` | **Enforced** |
| `packages/modules/accounting/src/**` | **Enforced** |
| `packages/modules/platform/src/**` | **Enforced** |
| `packages/modules/sales/src/**` | **Enforced** |
| `packages/modules/inventory/src/**` | **Enforced** |
| `packages/modules/inventory-costing/src/**` | **Enforced** |
| `packages/modules/treasury/src/**` | **Enforced** |
| `packages/modules/reservations/src/**` | **Enforced** |
| `packages/modules/reporting/src/**` | **Enforced** |
| `packages/notifications/src/**` | **Enforced** |
| `packages/telemetry/src/**` | **Enforced** |

### Deferred Scope (Policy Now, Enforcement Later)

| Scope | Deferment Reason |
|-------|------------------|
| `apps/backoffice/**` | Temporary scope freeze per architecture program |
| `apps/pos/**` | Temporary scope freeze per architecture program |
| `packages/backoffice-sync/**` | Dependent on backoffice unfreeze |
| `packages/offline-db/**` | Dependent on POS unfreeze |

> **Note:** Rules in this document apply as policy guidance to deferred scope. CI enforcement (Story 48.9) will ignore violations in deferred scope until the freeze lifts.

---

## Rule Notation

- `required` — file/directory MUST exist or follow this pattern
- `forbidden` — file/directory MUST NOT exist
- `preferred` — strongly recommended but not enforced

---

## Section 1: `apps/api/src` Structure Rules

### API-001: Route Files (FS-API-001)
**Rule:** `required`  
**Pattern:** `routes/{resource}.ts` or `routes/{module}/{resource}.ts`  
**Description:** Route handlers must be placed in the `routes/` directory. Single-resource routes use flat files (`accounts.ts`). Multi-resource or namespaced routes use subdirectory grouping (`purchasing/purchase-orders.ts`).

**Examples:**
```
✅ apps/api/src/routes/accounts.ts
✅ apps/api/src/routes/purchasing/purchase-orders.ts
✅ apps/api/src/routes/sales/invoices.ts
❌ apps/api/src/lib/accounts-route.ts  (wrong directory)
```

### API-002: Library Files (FS-API-002)
**Rule:** `required`  
**Pattern:** `lib/{module}/{file}.ts` or `lib/{file}.ts`  
**Description:** Business logic, adapters, and service composition must be placed in `lib/`. Module-specific code uses subdirectory grouping.

**Examples:**
```
✅ apps/api/src/lib/accounting/posting.ts
✅ apps/api/src/lib/auth-guard.ts
✅ apps/api/src/lib/settings-modules.ts
❌ apps/api/src/routes/helpers/posting.ts  (library code belongs in lib/)
```

### API-003: Middleware Files (FS-API-003)
**Rule:** `required`  
**Pattern:** `middleware/{name}.ts`  
**Description:** Express middleware files must be placed in `middleware/` directory.

**Examples:**
```
✅ apps/api/src/middleware/telemetry.ts
✅ apps/api/src/middleware/stock.ts
❌ apps/api/src/lib/middleware/auth.ts  (wrong directory)
```

### API-004: Startup Files (FS-API-004)
**Rule:** `required`  
**Pattern:** `startup/{name}.ts`  
**Description:** Application initialization and startup logic must be placed in `startup/`.

**Examples:**
```
✅ apps/api/src/startup/validate-permissions.ts
❌ apps/api/src/lib/startup.ts  (wrong directory)
```

### API-005: Scripts Directory (FS-API-005)
**Rule:** `required`  
**Pattern:** `scripts/{name}.ts`  
**Description:** Standalone operational scripts (migrations, fixes, one-off jobs) must be placed in `scripts/`. These are not part of the application entry point.

**Examples:**
```
✅ apps/api/src/scripts/fix-duplicate-role-assignments.ts
❌ apps/api/src/routes/script.ts  (wrong directory)
```

### API-006: Types Directory (FS-API-006)
**Rule:** `preferred`  
**Pattern:** `types/{name}.d.ts` or `types/{name}.ts`  
**Description:** Type declarations and shared type definitions may be placed in `types/`.

**Examples:**
```
✅ apps/api/src/types/xlsx-stream-reader.d.ts
✅ apps/api/src/types/shared.ts
```

### API-007: Nested Route Subdirectories (FS-API-007)
**Rule:** `required`  
**Pattern:** `routes/{module}/index.ts` for subdirectory barrel  
**Description:** If a route subdirectory exists, it must contain an `index.ts` barrel file that re-exports the sub-routes.

**Examples:**
```
✅ apps/api/src/routes/purchasing/index.ts
✅ apps/api/src/routes/sync/index.ts
```

### API-008: Test File Placement (FS-API-008)
**Rule:** `required`  
**Pattern:** `__test__/unit/{path}` or `__test__/integration/{path}`  
**Description:** Tests must be placed in the canonical `__test__/unit` or `__test__/integration` directory at the project root or package root, not alongside source files.

**Examples:**
```
✅ apps/api/__test__/integration/routes/accounts.test.ts
✅ packages/db/__test__/unit/pool.test.ts
❌ apps/api/src/routes/accounts.test.ts  (test alongside source — forbidden)
```

---

## Section 2: `packages/*` Structure Rules

### PKG-001: Package Source Root (FS-PKG-001)
**Rule:** `required`  
**Pattern:** `packages/{name}/src/index.ts`  
**Description:** Each package must have a root `src/index.ts` that serves as the public API entry point. All public exports must be re-exported from this file.

**Examples:**
```
✅ packages/auth/src/index.ts
✅ packages/db/src/index.ts
❌ packages/auth/src/lib/index.ts  (wrong path — must be directly under src/)
```

### PKG-002: Flat Source Organization (FS-PKG-002)
**Rule:** `preferred`  
**Pattern:** `packages/{name}/src/{camelCase}.ts`  
**Description:** Packages should prefer flat organization under `src/`. Deeply nested subdirectories (more than 2 levels) are discouraged unless required by domain complexity.

**Examples:**
```
✅ packages/db/src/pool.ts
✅ packages/db/src/kysely/schema.ts
❌ packages/db/src/internal/core/pool.ts  (too deeply nested without justification)
```

### PKG-003: Test Directory (FS-PKG-003)
**Rule:** `required`  
**Pattern:** `packages/{name}/__test__/unit/` or `packages/{name}/__test__/integration/`  
**Description:** Tests must be in the canonical `__test__/` directory at the package root, not inside `src/`.

**Examples:**
```
✅ packages/auth/__test__/unit/tokens.test.ts
❌ packages/auth/src/tokens.test.ts  (test inside src/ — forbidden)
```

---

## Section 3: `packages/modules/*` Structure Rules

### MOD-001: Module Source Root (FS-MOD-001)
**Rule:** `required`  
**Pattern:** `packages/modules/{name}/src/index.ts`  
**Description:** Each domain module must have a root `src/index.ts` barrel file.

**Examples:**
```
✅ packages/modules/accounting/src/index.ts
✅ packages/modules/sales/src/index.ts
❌ packages/modules/accounting/index.ts  (missing src/)
```

### MOD-002: Domain Subdirectories (FS-MOD-002)
**Rule:** `preferred`  
**Pattern:** `packages/modules/{name}/src/{domain-area}/`  
**Description:** Domain modules may use subdirectories to group related domain concepts (e.g., `fiscal-year/`, `posting/`, `reconciliation/`).

**Examples:**
```
✅ packages/modules/accounting/src/fiscal-year/
✅ packages/modules/accounting/src/posting/
```

### MOD-003: Test File Placement (FS-MOD-003)
**Rule:** `required`  
**Pattern:** `packages/modules/{name}/__test__/unit/` or `packages/modules/{name}/__test__/integration/`  
**Description:** Tests must be in the canonical `__test__/` directory at the package root, not inside `src/`.

---

## Section 4: Naming Conventions

### NC-001: Route Files (FS-NC-001)
**Rule:** `required`  
**Pattern:** kebab-case  
**Description:** Route filenames must use kebab-case (lowercase with hyphens).

**Examples:**
```
✅ accounts.ts, purchase-orders.ts, bank-transactions.ts
❌ accountsRoutes.ts, purchaseOrders.ts, BankTransactions.ts
```

### NC-002: Library and Service Files (FS-NC-002)
**Rule:** `preferred`  
**Pattern:** camelCase or kebab-case  
**Description:** Library utility files and service files may use camelCase or kebab-case.

**Examples:**
```
✅ auth-guard.ts, pool.ts, date-helpers.ts
✅ syncModules.ts, fiscalYears.ts
```

### NC-003: Type and Interface Files (FS-NC-003)
**Rule:** `preferred`  
**Pattern:** PascalCase or kebab-case  
**Description:** Type declaration files and service files may use PascalCase (matching the type name) or kebab-case.

**Examples:**
```
✅ types/user.ts, types/xlsx-stream-reader.d.ts
✅ SomeType.ts (if filename matches type name)
```

### NC-004: Test Files (FS-NC-004)
**Rule:** `required`  
**Pattern:** `{name}.test.ts` or `{name}.spec.ts`  
**Description:** Test files must be named with `.test.ts` or `.spec.ts` suffix to be picked up by the vitest test runner.

**Examples:**
```
✅ accounts.test.ts, fiscal-years.test.ts
❌ accounts.tests.ts, test_accounts.ts
```

### NC-005: Index Barrel Files (FS-NC-005)
**Rule:** `required`  
**Pattern:** `index.ts` only  
**Description:** Barrel files must be named exactly `index.ts`. No other filename is permitted for barrel/re-export files.

**Examples:**
```
✅ routes/purchasing/index.ts, src/index.ts
❌ routes/purchasing/index.tsx, routes/index.js
```

---

## Section 5: Forbidden Patterns

### FORBIDDEN-001: Source Files Outside `src/` (FS-FORBIDDEN-001)
**Rule:** `forbidden`  
**Description:** TypeScript source files (`*.ts`, `*.tsx`) must not exist outside a `src/` directory within packages or apps.

**Examples:**
```
❌ packages/auth/auth.ts  (must be packages/auth/src/auth.ts)
❌ packages/db/pool.ts  (must be packages/db/src/pool.ts)
```

### FORBIDDEN-002: Tests Alongside Source (FS-FORBIDDEN-002)
**Rule:** `forbidden`  
**Description:** Test files must not be placed alongside source files. They must use the canonical `__test__/` directory structure.

**Examples:**
```
❌ packages/auth/src/tokens.test.ts
❌ apps/api/src/routes/accounts.test.ts
```

### FORBIDDEN-003: `.bak` and Temporary Files in Source Tree (FS-FORBIDDEN-003)
**Rule:** `forbidden`  
**Description:** Backup files (`.bak`, `.tmp`, `.orig`) must not exist in source directories.

**Examples:**
```
❌ apps/api/src/routes/companies.ts.bak2
❌ packages/auth/src/tokens.ts.bak
```

### FORBIDDEN-004: Deep Nested Lib in Routes (FS-FORBIDDEN-004)
**Rule:** `forbidden`  
**Description:** Library business logic must not be placed inside `routes/`. Route handlers should delegate to `lib/` or service packages.

**Examples:**
```
❌ apps/api/src/routes/lib/posting.ts
❌ apps/api/src/routes/helpers/accounting.ts
```

---

## Section 6: Rule ID Index

| Rule ID | Name | Scope | Enforced |
|---------|------|-------|----------|
| FS-API-001 | Route files in routes/ | apps/api | ✅ |
| FS-API-002 | Library files in lib/ | apps/api | ✅ |
| FS-API-003 | Middleware in middleware/ | apps/api | ✅ |
| FS-API-004 | Startup in startup/ | apps/api | ✅ |
| FS-API-005 | Scripts in scripts/ | apps/api | ✅ |
| FS-API-006 | Types in types/ | apps/api | Preferred |
| FS-API-007 | Route subdirectory barrel | apps/api | ✅ |
| FS-API-008 | Test file placement | apps/api | ✅ |
| FS-PKG-001 | Package src/index.ts | packages/* | ✅ |
| FS-PKG-002 | Flat source organization | packages/* | Preferred |
| FS-PKG-003 | Test directory | packages/* | ✅ |
| FS-MOD-001 | Module src/index.ts | packages/modules/* | ✅ |
| FS-MOD-002 | Domain subdirectories | packages/modules/* | Preferred |
| FS-MOD-003 | Test file placement | packages/modules/* | ✅ |
| FS-NC-001 | Route file naming (kebab) | all | ✅ |
| FS-NC-002 | Library naming (camel/kebab) | all | Preferred |
| FS-NC-003 | Type file naming | all | Preferred |
| FS-NC-004 | Test file naming (.test.ts) | all | ✅ |
| FS-NC-005 | Barrel naming (index.ts) | all | ✅ |
| FS-FORBIDDEN-001 | Source outside src/ | all | ✅ |
| FS-FORBIDDEN-002 | Tests alongside source | all | ✅ |
| FS-FORBIDDEN-003 | Backup files in source | all | ✅ |
| FS-FORBIDDEN-004 | Lib inside routes/ | apps/api | ✅ |

---

## Companion Artifacts

| Artifact | Path |
|----------|------|
| Gap register | `_bmad-output/planning-artifacts/file-structure-gap-register-epic-48.md` |
| Baseline JSON | `_bmad-output/planning-artifacts/file-structure-baseline.json` |
| Validation script | `scripts/validate-structure-conformance.ts` |
| Story | `_bmad-output/implementation-artifacts/stories/epic-48/story-48.7.md` |
