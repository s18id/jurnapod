# Epic 29: Fixed Assets / Depreciation Extraction

**Status:** 🔄 In Progress
**Date:** 2026-04-04
**Stories:** 7 total
**Sprint Plan:** `_bmad-output/planning-artifacts/epic-29-sprint-plan.md`

---

## Executive Summary

Epic 29 extracts the fixed-assets and depreciation subdomain from API-local libs into `modules-accounting`. The existing code at `apps/api/src/lib/fixed-assets/` (648 LOC), `apps/api/src/lib/depreciation.ts` (704 LOC), and `apps/api/src/lib/fixed-assets-lifecycle.ts` (1868 LOC) contains heavy domain logic. The target is thin API route adapters delegating to module services.

**Key Goals:**
- `modules-accounting` becomes canonical owner of fixed-assets + depreciation domain logic
- API route `accounts.ts` becomes thin adapter (auth + Zod + response mapping)
- All 18 fixed-asset endpoints have behavioral parity after flip
- Journal posting remains atomic within the same DB transaction
- Delete heavy API-local implementation files after successful flip

---

## Goals & Non-Goals

### Goals
- Extract fixed-asset category/asset CRUD into `modules-accounting/src/fixed-assets/`
- Extract depreciation plan/run service into `modules-accounting/src/fixed-assets/`
- Extract lifecycle service (acquire/transfer/impair/dispose/void/ledger/book) into `modules-accounting`
- Define injectable ports for cross-cutting concerns (AccessScopeChecker, FiscalYearGuard)
- Flip all 18 fixed-asset endpoints to thin API adapters
- Delete `apps/api/src/lib/fixed-assets/`, `depreciation.ts`, `fixed-assets-lifecycle.ts`
- Full behavioral parity: idempotency, void semantics, journal posting, tenant/outlet scoping

### Non-Goals
- No new package creation — extend `modules-accounting`
- No schema changes
- No POS app changes
- No Temporal hardening (keep datetime behavior as-is for parity)
- No breaking changes to existing endpoint contracts

---

## Architecture

### Current State (problematic)

```
apps/api/src/routes/accounts.ts           # 1338 LOC - 18 fixed-asset endpoints (route does too much)
apps/api/src/lib/fixed-assets/index.ts   # 648 LOC - categories + assets CRUD
apps/api/src/lib/depreciation.ts         # 704 LOC - plan/run orchestration
apps/api/src/lib/fixed-assets-lifecycle.ts # 1868 LOC - acquire/transfer/impair/dispose/void/ledger/book
packages/modules/accounting/src/posting/depreciation.ts  # already exists - posting hook
packages/shared/src/schemas/fixed-assets.ts  # already exists - schemas
packages/shared/src/schemas/depreciation.ts   # already exists - schemas
```

### Target State

```
apps/api/src/routes/accounts.ts           # thin adapter (auth + Zod + response mapping)
packages/modules/accounting/src/fixed-assets/  # NEW - category/asset CRUD + depreciation + lifecycle
packages/modules/accounting/src/interfaces/     # add FixedAssetPorts
packages/modules/accounting/src/posting/depreciation.ts  # already exists
```

### Dependency Direction

```
modules-accounting (fixed-assets) → modules-accounting (posting: journals)
modules-accounting (fixed-assets) → modules-platform (tenant/outlet scoping)
modules-accounting (fixed-assets) → modules-accounting (fiscal-year guard)
```

---

## Database Schema (already in place)

| Table | Role |
|-------|------|
| `fixed_asset_categories` | Asset category master |
| `fixed_assets` | Asset master |
| `fixed_asset_books` | Per-asset book values (current book value tracking) |
| `fixed_asset_events` | Lifecycle event log (acquire/transfer/impair/dispose/void) |
| `fixed_asset_disposals` | Disposal details (gain/loss) |
| `asset_depreciation_plans` | Depreciation plan per asset |
| `asset_depreciation_runs` | Depreciation run execution per period |

---

## API Surface (18 endpoints)

### Fixed Asset Categories (4 endpoints)
| Method | Path | Operation |
|--------|------|-----------|
| GET | `/accounts/fixed-asset-categories` | List categories |
| POST | `/accounts/fixed-asset-categories` | Create category |
| GET | `/accounts/fixed-asset-categories/:id` | Get category |
| PATCH | `/accounts/fixed-asset-categories/:id` | Update category |
| DELETE | `/accounts/fixed-asset-categories/:id` | Delete category |

### Fixed Assets (4 endpoints)
| Method | Path | Operation |
|--------|------|-----------|
| GET | `/accounts/fixed-assets` | List assets |
| POST | `/accounts/fixed-assets` | Create asset |
| GET | `/accounts/fixed-assets/:id` | Get asset |
| PATCH | `/accounts/fixed-assets/:id` | Update asset |
| DELETE | `/accounts/fixed-assets/:id` | Delete asset |

### Depreciation (3 endpoints)
| Method | Path | Operation |
|--------|------|-----------|
| POST | `/accounts/fixed-assets/:id/depreciation-plan` | Create depreciation plan |
| PATCH | `/accounts/fixed-assets/:id/depreciation-plan` | Update depreciation plan |
| POST | `/accounts/depreciation/run` | Execute depreciation run |

### Asset Lifecycle (5 endpoints)
| Method | Path | Operation |
|--------|------|-----------|
| POST | `/accounts/fixed-assets/:id/acquisition` | Record acquisition |
| POST | `/accounts/fixed-assets/:id/transfer` | Transfer to another outlet |
| POST | `/accounts/fixed-assets/:id/impairment` | Record impairment |
| POST | `/accounts/fixed-assets/:id/disposal` | Record disposal (SALE/SCRAP) |
| POST | `/accounts/fixed-assets/events/:id/void` | Void an event |

### Asset Reporting (2 endpoints)
| Method | Path | Operation |
|--------|------|-----------|
| GET | `/accounts/fixed-assets/:id/ledger` | Get asset ledger |
| GET | `/accounts/fixed-assets/:id/book` | Get asset book |

---

## Key Decisions (resolved in Story 29.1)

| # | Decision | Resolution |
|---|----------|------------|
| 1 | Module placement | Extend `modules-accounting/src/fixed-assets/` |
| 2 | Idempotency contract | `idempotency_key` remains optional (current behavior) |
| 3 | Void semantics | All lifecycle events are voidable; void creates reversal journal |
| 4 | Transaction atomicity | Domain write + journal write in same DB transaction |
| 5 | Book/run consistency | `asset_depreciation_runs` and `fixed_asset_books` updated together in same tx |

---

## Success Criteria

- [ ] `modules-accounting` exports FixedAssetCategoryService, FixedAssetService, DepreciationService, LifecycleService
- [ ] All 18 endpoints have full behavioral parity (tested)
- [ ] Journal posting atomic with domain write (same DB transaction)
- [ ] API route is thin adapter only (auth + Zod + response mapping)
- [ ] `apps/api/src/lib/fixed-assets/`, `depreciation.ts`, `fixed-assets-lifecycle.ts` deleted
- [ ] Full validation gate passes (typecheck + build + test)

---

## Stories

| # | Title |
|---|-------|
| [story-29.1](./story-29.1.md) | Scope freeze + parity matrix + boundary contracts |
| [story-29.2](./story-29.2.md) | Scaffold fixed-assets subdomain in modules-accounting |
| [story-29.3](./story-29.3.md) | Extract category + asset CRUD service |
| [story-29.4](./story-29.4.md) | Extract depreciation plan/run service |
| [story-29.5](./story-29.5.md) | Extract lifecycle service (acquire/transfer/impair/dispose/void) |
| [story-29.6](./story-29.6.md) | Flip API routes to thin adapters + delete API libs |
| [story-29.7](./story-29.7.md) | Integration tests + critical financial/idempotency gate |