# Epic 29 Sprint Plan

## Overview

**Epic:** Fixed Assets / Depreciation Extraction
**Duration:** 2–3 sprints
**Goal:** Make `modules-accounting` the canonical owner of fixed-assets + depreciation domain logic; API becomes thin adapter delegating to module services.

## Dependency Direction

```
modules-accounting (fixed-assets) → modules-accounting (posting: journals)
modules-accounting (fixed-assets) → modules-platform (tenant/outlet scoping)
apps/api routes → modules-accounting (fixed-assets services)
```

## Story Dependencies

```
29.1 (scope + decisions)
  └── 29.2 (scaffold module)
        ├── 29.3 (category + asset CRUD)
        └── 29.4 (depreciation plan/run) ── parallel with 29.3
              └── 29.5 (lifecycle service) ── sequential after 29.3+29.4
                    └── 29.6 (route flip + delete libs)
                          └── 29.7 (validation gate)
```

## Sprint Breakdown

### Sprint 1: Foundation + Core Services (Stories 29.1–29.5)

#### Story 29.1: Scope freeze + parity matrix + boundary contracts
- **Estimate:** 2h
- **Priority:** P1
- **Dependencies:** None
- **Focus:** Read all source files, produce decision log and parity matrix

#### Story 29.2: Scaffold fixed-assets subdomain in modules-accounting
- **Estimate:** 2h
- **Priority:** P1
- **Dependencies:** 29.1
- **Focus:** Create directory structure, interface definitions, placeholder services

#### Story 29.3: Extract category + asset CRUD service
- **Estimate:** 4h
- **Priority:** P1
- **Dependencies:** 29.2
- **Focus:** Implement CategoryService + AssetService with full parity (648 LOC source)

#### Story 29.4: Extract depreciation plan/run service
- **Estimate:** 4h
- **Priority:** P1
- **Dependencies:** 29.2 (after scaffold)
- **Focus:** Implement DepreciationService with plan/run + journal posting (704 LOC source)

#### Story 29.5: Extract lifecycle service (acquire/transfer/impair/dispose/void)
- **Estimate:** 6h
- **Priority:** P1
- **Dependencies:** 29.3 + 29.4
- **Focus:** Implement LifecycleService for all 7 lifecycle operations (1868 LOC source — largest story)

### Sprint 2: Route Flip + Validation (Stories 29.6–29.7)

#### Story 29.6: Flip API routes to thin adapters + delete API libs
- **Estimate:** 3h
- **Priority:** P1
- **Dependencies:** 29.5
- **Focus:** Flip 18 endpoints, delete 3 heavy API-local files (3220 LOC total)

#### Story 29.7: Integration tests + critical financial/idempotency gate
- **Estimate:** 4h
- **Priority:** P1
- **Dependencies:** 29.6
- **Focus:** Full workspace typecheck + build + test gate, add missing coverage

## Files Changed Summary

| Story | File | Change |
|-------|------|--------|
| 29.1 | `_bmad-output/implementation-artifacts/stories/epic-29/story-29.1.completion.md` | NEW - decision log + parity matrix |
| 29.2 | `packages/modules/accounting/src/fixed-assets/` | NEW - full directory structure |
| 29.3 | `packages/modules/accounting/src/fixed-assets/services/category-service.ts` | NEW |
| 29.3 | `packages/modules/accounting/src/fixed-assets/services/asset-service.ts` | NEW |
| 29.4 | `packages/modules/accounting/src/fixed-assets/services/depreciation-service.ts` | NEW |
| 29.5 | `packages/modules/accounting/src/fixed-assets/services/lifecycle-service.ts` | NEW |
| 29.6 | `apps/api/src/routes/accounts.ts` | flip to module service |
| 29.6 | `apps/api/src/lib/modules-accounting/` | NEW - FixedAssetService adapter |
| 29.6 | `apps/api/src/lib/fixed-assets/index.ts` | DELETE |
| 29.6 | `apps/api/src/lib/depreciation.ts` | DELETE |
| 29.6 | `apps/api/src/lib/fixed-assets-lifecycle.ts` | DELETE |

## Source File Sizes (for scope reference)

| File | LOC | Content |
|------|-----|---------|
| `apps/api/src/lib/fixed-assets/index.ts` | 648 | Categories + assets CRUD |
| `apps/api/src/lib/depreciation.ts` | 704 | Depreciation plan/run |
| `apps/api/src/lib/fixed-assets-lifecycle.ts` | 1868 | Lifecycle events |
| `apps/api/src/routes/accounts.ts` | 1338 | 18 fixed-asset endpoints |
| **Total to extract** | **3220** | |

## Key Risks & Decisions

| # | Risk | Decision |
|---|------|----------|
| 1 | Module placement | Extend `modules-accounting` (not new package) |
| 2 | Idempotency contract | `idempotency_key` remains optional (current behavior) |
| 3 | Void semantics | All lifecycle events voidable; void creates reversal journal in same tx |
| 4 | Transaction atomicity | Domain write + book update + journal write in same DB transaction |
| 5 | Book/run consistency | `asset_depreciation_runs` and `fixed_asset_books` updated together |
| 6 | Test coverage gap | Add missing integration tests for depreciation, disposal, void paths |

## Validation Commands (per story)

### Story 29.1
```bash
npm run typecheck -w @jurnapod/modules-accounting
npm run typecheck -w @jurnapod/api
```

### Story 29.2
```bash
npm run typecheck -w @jurnapod/modules-accounting
npm run build -w @jurnapod/modules-accounting
```

### Story 29.3
```bash
npm run typecheck -w @jurnapod/modules-accounting
npm run build -w @jurnapod/modules-accounting
```

### Story 29.4
```bash
npm run typecheck -w @jurnapod/modules-accounting
npm run build -w @jurnapod/modules-accounting
```

### Story 29.5
```bash
npm run typecheck -w @jurnapod/modules-accounting
npm run build -w @jurnapod/modules-accounting
```

### Story 29.6
```bash
npm run typecheck -w @jurnapod/modules-accounting
npm run typecheck -w @jurnapod/api
npm run build -w @jurnapod/api
npm test -- --testPathPattern="fixed.asset|depreciation|accounts.fixed" -w @jurnapod/api
```

### Story 29.7
```bash
npm run typecheck --workspaces --if-present
npm run build --workspaces --if-present
npm test -w @jurnapod/api
```