# Sprint Plan: Epic 34

> **Epic:** Test Reorganization & Assessment  
> **Duration:** 1 sprint (~40h)  
> **Goal:** Reorganize tests into `__test__/unit|integration` structure, assess and deduplicate overlapping tests, ensuring API has minimal true unit tests.

---

## Package-First Design Checkpoint

N/A - This is a reorganization epic, no new domain logic being added.

---

## Hard Prerequisite Gate

- [x] Epic 33 complete (Permission System Consolidation)

---

## Dependency Graph

```
Story 34.1 (Audit)
        ↓
Story 34.2 (Structure)
        ↓
    ┌───┴───┐
    ↓       ↓
Story 34.3  Story 34.5
(API)       (Packages)
    ↓       ↓
    ↓       ↓
Story 34.4  Story 34.6
(Dedup)     (Scripts)
    ↓       ↓
    └───┬───┘
        ↓
Story 34.7
(Validation)
```

---

## Sprint Breakdown

### Week 1

#### Story 34.1: Audit All Test Files
- **Estimate:** 4h
- **Priority:** P1
- **Dependencies:** None
- **Focus:**
  - Catalog all 150 test files across packages
  - Classify as unit vs integration
  - Create test inventory matrix
  - Identify duplicate coverage

#### Story 34.2: Define Canonical Structure
- **Estimate:** 4h
- **Priority:** P1
- **Dependencies:** 34.1
- **Focus:**
  - Create `__test__/unit/` and `__test__/integration/` directories
  - Update vitest configs (sync-core, pos-sync, backoffice-sync, notifications, modules/platform)
  - Update API package.json scripts

#### Story 34.3: API Test Classification & Reorganization
- **Estimate:** 8h
- **Priority:** P1
- **Dependencies:** 34.2
- **Focus:**
  - Move 42 integration tests to `__test__/integration/`
  - Move ~5-10 unit tests to `__test__/unit/`
  - Move ~65 DB-backed tests to `__test__/integration/`
  - Update import paths

#### Story 34.5: Package Test Reorganization
- **Estimate:** 8h
- **Priority:** P1
- **Dependencies:** 34.2
- **Focus:**
  - Apply structure to all packages (auth, modules/*, notifications, sync-core, telemetry, backoffice)
  - Move tests from `src/`, `tests/`, `__tests__/` to `__test__/`

### Week 2

#### Story 34.4: API Selective Deduplication
- **Estimate:** 8h
- **Priority:** P2
- **Dependencies:** 34.3
- **Focus:**
  - Analyze overlapping test pairs
  - Delete ~15-20 redundant tests
  - Keep both levels for critical logic (COGS, cost tracking)
  - Verify coverage remains

#### Story 34.6: Validate & Update Scripts
- **Estimate:** 4h
- **Priority:** P1
- **Dependencies:** 34.3, 34.5
- **Focus:**
  - Update all package.json test scripts
  - Add vitest configs to packages without them
  - Verify scripts work

#### Story 34.7: Full Validation Gate
- **Estimate:** 4h
- **Priority:** P1
- **Dependencies:** 34.6
- **Focus:**
  - Run typecheck across all workspaces
  - Run tests across all workspaces
  - Fix any broken imports or paths

---

## Expected Outcomes

| Metric | Before | After |
|--------|--------|-------|
| Test directories | Mixed (src/, tests/, __tests__/) | `__test__/unit/`, `__test__/integration/` |
| API unit tests | ~75 co-located | ~5-10 (pure logic only) |
| API integration tests | 42 | ~100+ |
| Redundant tests | ~15-20 | 0 |
| e2e tests | Unchanged | Unchanged |

---

## Architecture Notes

### Unit vs Integration Classification

**Unit Test** (`__test__/unit/`):
- No real database access
- All dependencies mocked
- Tests pure function logic

**Integration Test** (`__test__/integration/`):
- Real database access
- HTTP server calls
- File system operations
- External services

### e2e Tests (Out of Scope)

e2e tests remain in `apps/{app}/e2e/`:
- `apps/backoffice/e2e/`
- `apps/pos/e2e/`

---

## Key Risks & Decisions

| # | Risk | Decision |
|---|------|----------|
| 1 | Tests fail after move | Story 34.7 is buffer for fixes |
| 2 | Over-deduplication | Keep both levels for COGS, cost tracking |
| 3 | Package without vitest | Create vitest.config.ts in Story 34.6 |

---

## Validation Commands

### API
```bash
npm run test:unit -w @jurnapod/api
npm run test:integration -w @jurnapod/api
```

### Packages
```bash
npm run test -w @jurnapod/sync-core
npm run test -w @jurnapod/pos-sync
npm run test -w @jurnapod/auth
npm run test -w @jurnapod/modules/accounting
npm run test -w @jurnapod/modules/platform
npm run test -w @jurnapod/modules/reservations
npm run test -w @jurnapod/modules/treasury
npm run test -w @jurnapod/notifications
npm run test -w @jurnapod/telemetry
```

### Full Workspace
```bash
npm run typecheck -ws --if-present
npm run test -ws --if-present
```

---

## References

- Epic specification: `_bmad-output/implementation-artifacts/stories/epic-34/epic-34.md`
- Test inventory: `_bmad-output/implementation-artifacts/stories/epic-34/test-inventory.md`
- Sprint plan template: `_bmad-output/planning-artifacts/sprint-plan-template.md`
