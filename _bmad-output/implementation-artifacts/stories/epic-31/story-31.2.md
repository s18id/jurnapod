# Story 31.2: Extract Companies/Provisioning to `modules-platform`

## Story Summary

| Field | Value |
|-------|-------|
| Story | story-31.2 |
| Title | Extract Companies/Provisioning to `modules-platform` |
| Status | pending |
| Type | Extraction |
| Sprint | 1 of 2 |
| Priority | P1 |
| Estimate | 6h |

---

## Story

As a Platform Engineer,
I want the Company lifecycle and provisioning logic to live in `@jurnapod/modules-platform`,
So that module definitions, role definitions, and company onboarding are centrally managed and reusable.

---

## Background

`apps/api/src/lib/companies.ts` (1,128 lines) contains:
- Company CRUD with soft delete
- MODULE_DEFINITIONS (10 modules) — hardcoded constants
- ROLE_DEFINITIONS (6 roles) — hardcoded constants
- MODULE_ROLE_DEFAULTS (94 entries) — permission matrix
- SETTINGS_DEFINITIONS (11 settings) — env-backed defaults
- Company provisioning with default outlet creation
- Settings/module initialization on company create

These are foundational platform constants that should live in the platform package.

---

## Acceptance Criteria

1. `apps/api/src/lib/companies.ts` refactored into `packages/modules/platform/src/companies/`
2. MODULE_DEFINITIONS, ROLE_DEFINITIONS, SETTINGS_DEFINITIONS exported from package
3. CompanyService with provisioning (create + defaults + outlets)
4. API routes thin adapters delegating to package
5. No `packages/modules/platform` importing from `apps/api/**`
6. `npm run typecheck -w @jurnapod/modules-platform` passes
7. `npm run typecheck -w @jurnapod/api` passes

---

## Technical Notes

### Target Structure

```
packages/modules/platform/src/companies/
  index.ts              # Public exports
  interfaces/
  services/
    company-service.ts  # CRUD + provisioning
    settings-service.ts # Settings management
  constants/
    module-definitions.ts  # MODULE_DEFINITIONS
    role-definitions.ts    # ROLE_DEFINITIONS
    settings-definitions.ts  # SETTINGS_DEFINITIONS
    permission-matrix.ts    # MODULE_ROLE_DEFAULTS
  types/
  contracts/
```

### Key Constants to Move

```typescript
// MODULE_DEFINITIONS (10 modules)
export const MODULE_DEFINITIONS = [...]; // inventory, sales, accounting, etc.

// ROLE_DEFINITIONS (6 roles)
export const ROLE_DEFINITIONS = [...]; // OWNER, ADMIN, MANAGER, etc.

// MODULE_ROLE_DEFAULTS (94 entries)
export const MODULE_ROLE_DEFAULTS = [...]; // role × module permission matrix
```

### Architecture Rules

- No package imports from `apps/api/**`
- Company provisioning creates default outlet — tenant isolation enforced
- NO MOCK DB for DB-backed business logic tests
- Constants are pure data — no business logic in constants files

---

## Tasks

- [ ] Read `apps/api/src/lib/companies.ts` fully
- [ ] Create `packages/modules/platform/src/companies/` directory structure
- [ ] Move MODULE_DEFINITIONS, ROLE_DEFINITIONS, MODULE_ROLE_DEFAULTS, SETTINGS_DEFINITIONS
- [ ] Implement CompanyService with provisioning logic
- [ ] Update API routes to delegate to package
- [ ] Add integration tests with real DB
- [ ] Run typecheck and fix errors

---

## Validation

```bash
npm run typecheck -w @jurnapod/modules-platform
npm run typecheck -w @jurnapod/api
```
