# story-29.2: Scaffold fixed-assets subdomain in modules-accounting

## Description

Create the module directory structure, interfaces, and export surface for the fixed-assets subdomain inside `modules-accounting`. No business logic yet — only scaffolding that compiles.

## Context

After story 29.1 decisions are locked, story 29.2 creates the physical module structure. This is the physical foundation — directory layout, interface definitions, and initial exports that subsequent stories populate with logic.

## Target Structure

```
packages/modules/accounting/src/
├── fixed-assets/
│   ├── index.ts                    # exports all fixed-assets public types/services
│   ├── interfaces/
│   │   ├── index.ts
│   │   ├── fixed-asset-ports.ts    # AccessScopeChecker, FiscalYearGuard ports
│   │   └── types.ts                # FixedAssetCategory, FixedAsset, DepreciationPlan, LifecycleEvent types
│   ├── services/
│   │   ├── index.ts
│   │   ├── category-service.ts     # placeholder — logic in 29.3
│   │   ├── asset-service.ts       # placeholder — logic in 29.3
│   │   ├── depreciation-service.ts # placeholder — logic in 29.4
│   │   └── lifecycle-service.ts    # placeholder — logic in 29.5
│   └── repositories/
│       ├── index.ts
│       └── fixed-asset-repo.ts     # DB access for all fixed-asset tables
```

## Approach

1. Create directory structure
2. Define `FixedAssetCategory`, `FixedAsset`, `DepreciationPlan`, `LifecycleEvent` types (derive from existing DB schema + shared schemas)
3. Define `FixedAssetPorts` interface: `AccessScopeChecker`, `FiscalYearGuard`
4. Create placeholder service functions that throw "not implemented"
5. Export everything from `fixed-assets/index.ts`
6. Verify `modules-accounting` still typechecks and builds

## Acceptance Criteria

- [ ] `packages/modules/accounting/src/fixed-assets/` directory created
- [ ] `FixedAssetCategory`, `FixedAsset`, `DepreciationPlan`, `LifecycleEvent` types defined
- [ ] `FixedAssetPorts` interface defined with `AccessScopeChecker` and `FiscalYearGuard`
- [ ] All placeholder services compile (even if they throw)
- [ ] `packages/modules/accounting/src/fixed-assets/index.ts` exports everything
- [ ] `packages/modules/accounting/src/index.ts` re-exports fixed-assets
- [ ] `npm run typecheck -w @jurnapod/modules-accounting`
- [ ] `npm run build -w @jurnapod/modules-accounting`
- [ ] No reverse imports from `apps/api` into `modules-accounting`

## Files to Create

```
packages/modules/accounting/src/fixed-assets/
├── index.ts
├── interfaces/
│   ├── index.ts
│   ├── fixed-asset-ports.ts
│   └── types.ts
├── services/
│   ├── index.ts
│   ├── category-service.ts
│   ├── asset-service.ts
│   ├── depreciation-service.ts
│   └── lifecycle-service.ts
└── repositories/
    ├── index.ts
    └── fixed-asset-repo.ts
```

## Dependency

- story-29.1 (decisions must be frozen before scaffolding)

## Validation Commands

```bash
npm run typecheck -w @jurnapod/modules-accounting
npm run build -w @jurnapod/modules-accounting
```

## Status

**Status:** review