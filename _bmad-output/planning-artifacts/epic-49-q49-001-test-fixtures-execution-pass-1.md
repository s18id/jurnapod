# Q49-001 Execution Pass 1 — Test Fixtures Boundary Extraction

> **Queue Item:** Q49-001 (from `epic-49-api-lib-boundary-migration-queue.md`)  
> **Epic/Sprint:** Epic 49 / Story 49.1 intake  
> **Owner:** @bmad-dev  
> **Approver:** @bmad-architect  
> **Status:** rebaselined-for-epic-50-ownership-model  
> **Retro Link:** E48-A2 completed on 2026-04-22 (Epic 48 retrospective action item)

---

## Objective

Extract fixtures from `apps/api/src/lib/test-fixtures.ts` into **owner packages**, while preserving existing-consumer paths.

Extraction destination MUST follow ownership boundaries:

- `@jurnapod/db/test-fixtures` MUST contain DB-generic fixtures only (primitives/assertions)
- Domain fixtures MUST live in domain owner packages
- API fixture file MUST remain a transitional re-export during migration

---

## Ownership Decision (Supersedes Prior DB-First Assumption)

The original Q49-001 draft emphasized moving portable fixtures to `@jurnapod/db/test-fixtures`. That approach is superseded for Epic 50 execution.

### Mandatory Ownership Matrix

| Fixture Domain | Owner Package | Rule |
|---|---|---|
| DB primitives/assertions | `@jurnapod/db/test-fixtures` | MUST remain domain-agnostic |
| Company/Outlet | `@jurnapod/modules-platform` | MUST NOT be implemented in `@jurnapod/db` |
| Fiscal/AP-accounting | `@jurnapod/modules-accounting` | MUST follow accounting invariants |
| Supplier/Purchasing | `@jurnapod/modules-purchasing` | MUST be owned by purchasing package |
| API login/token/http fixtures | `apps/api/src/lib/test-fixtures.ts` | MAY remain API-runtime only |

`@jurnapod/db` MUST NOT import from `@jurnapod/modules-*`.

---

## Scope for Pass 1

### In Scope

- Define fixture split by owner package (not DB-first)
- Create `@jurnapod/modules-purchasing` package scaffold with `src/test-fixtures/*`
- Extract first owner-package fixture groups:
  - platform: company/outlet fixtures
  - accounting: fiscal/AP-accounting fixtures
  - purchasing: supplier/purchasing fixtures
- Keep API wrapper as transitional re-export (existing test imports continue working)
- Flip consumer shim (`apps/api/__test__/fixtures/index.ts`) to import moved symbols from owner packages

### Out of Scope (Pass 2+)

- Full extraction of inventory/item adapter-dependent fixtures
- Full replacement of auth/login HTTP fixtures
- Deep refactor of every helper in one PR

---

## File Plan

### Keep/extend in `packages/db`

- `packages/db/src/test-fixtures/index.ts` (generic exports only)
- `packages/db/src/test-fixtures/primitives.ts`
- `packages/db/src/test-fixtures/constants.ts`
- `packages/db/src/test-fixtures/immutability.ts`

### Create in `packages/modules/platform`

- `packages/modules/platform/src/test-fixtures/index.ts`
- `packages/modules/platform/src/test-fixtures/types.ts`
- `packages/modules/platform/src/test-fixtures/company.ts`
- `packages/modules/platform/src/test-fixtures/outlet.ts`

### Create in `packages/modules/accounting`

- `packages/modules/accounting/src/test-fixtures/index.ts`
- `packages/modules/accounting/src/test-fixtures/types.ts`
- `packages/modules/accounting/src/test-fixtures/fiscal.ts`
- `packages/modules/accounting/src/test-fixtures/ap-settings.ts`

### Create in `packages/modules/purchasing`

- `packages/modules/purchasing/package.json`
- `packages/modules/purchasing/tsconfig.json`
- `packages/modules/purchasing/AGENTS.md`
- `packages/modules/purchasing/src/index.ts`
- `packages/modules/purchasing/src/test-fixtures/index.ts`
- `packages/modules/purchasing/src/test-fixtures/types.ts`
- `packages/modules/purchasing/src/test-fixtures/supplier.ts`
- `packages/modules/purchasing/src/test-fixtures/purchasing-accounts.ts`
- `packages/modules/purchasing/src/test-fixtures/purchasing-settings.ts`

### Update in `apps/api`

- `apps/api/src/lib/test-fixtures.ts` (transitional re-export delegates to owner packages)
- `apps/api/__test__/fixtures/index.ts` (consumer flip to owner packages)

---

## Execution Steps

### Step 0 — Pre-flight Ownership Gate

- [ ] Freeze signature continuity list from API fixture exports
- [ ] Confirm owner mapping for each extracted symbol
- [ ] Confirm no `@jurnapod/db -> @jurnapod/modules-*` dependency path

### Step 1 — Owner package scaffolds

- [ ] Create platform/accounting fixture module scaffolds
- [ ] Create `@jurnapod/modules-purchasing` scaffold

### Step 2 — Move first owner fixture groups

- [ ] Move company/outlet fixtures to platform package
- [ ] Move fiscal/AP-accounting fixtures to accounting package
- [ ] Move supplier/purchasing fixtures to purchasing package

### Step 3 — API wrapper transitional re-export layer

- [ ] Keep API-runtime helpers local (HTTP/login/token)
- [ ] Re-export owner-package fixtures from API wrapper
- [ ] Preserve existing function signatures

### Step 4 — Consumer flip

- [ ] Update `apps/api/__test__/fixtures/index.ts` to source moved symbols from owner packages
- [ ] Keep unresolved API-only symbols via wrapper

### Step 5 — Validation

- [ ] Build owner packages + db package
- [ ] Typecheck API
- [ ] Run representative integration suites
- [ ] Run fixture-flow lint

---

## Validation Commands

```bash
# Build gates
npm run build -w @jurnapod/modules-platform
npm run build -w @jurnapod/modules-accounting
npm run build -w @jurnapod/modules-purchasing
npm run build -w @jurnapod/db

# API type safety after wrapper + consumer flip
npm run typecheck -w @jurnapod/api

# Core fixture-driven suites
npm run test:single -- __test__/integration/accounting/fiscal-year-close.test.ts -w @jurnapod/api
npm run test:single -- __test__/integration/purchasing/ap-reconciliation.test.ts -w @jurnapod/api

# Policy gate
npm run lint:fixture-flow -w @jurnapod/api
```

---

## Risks & Mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| Domain fixtures placed in `@jurnapod/db` | P0 | Enforce ownership matrix; block merge if violated |
| Circular dependency (`db` importing modules) | P1 | Add dependency check in review; db package remains module-free |
| Export/signature break for existing tests | P1 | Preserve wrapper continuity and function signatures |
| Over-scoping into full extraction | P2 | Pass 1 scope freeze; defer deep refactors |

---

## Done Criteria (Pass 1)

- [ ] Ownership model enforced (`db` generic only; domain fixtures in owner packages)
- [ ] `@jurnapod/modules-purchasing` scaffold exists and builds
- [ ] API wrapper remains a functional transitional re-export
- [ ] At least one consumer path flipped to owner-package fixtures
- [ ] Build/typecheck/test/lint evidence attached
- [ ] Remaining extraction tasks logged as Pass 2 queue items

---

## Companion Artifacts

- `_bmad-output/planning-artifacts/epic-49-api-lib-boundary-migration-queue.md`
- `_bmad-output/planning-artifacts/epic-49-1-execution-checklist.md`
- `_bmad-output/implementation-artifacts/stories/epic-49/story-49.1.md`
- `_bmad-output/implementation-artifacts/stories/epic-50/story-50.2.md`
