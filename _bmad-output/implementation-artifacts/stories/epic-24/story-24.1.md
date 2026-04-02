# story-24.1: Create `@jurnapod/modules-inventory-costing` package scaffold

## Description

Create the package structure for the new inventory-costing module that will hold cost-tracking logic extracted from the API.

## Acceptance Criteria

- [ ] New package `packages/modules/inventory-costing/` created
- [ ] `package.json` with name `@jurnapod/modules-inventory-costing`, version `0.1.0`
- [ ] `tsconfig.json` extending root base config
- [ ] `eslint.config.mjs` with ADR-0014 boundary rules
- [ ] `src/index.ts` with initial exports
- [ ] `CostLayer` and `DeductionResult` types defined
- [ ] Package compiles without errors

## Files to Create

- `packages/modules/inventory-costing/package.json`
- `packages/modules/inventory-costing/tsconfig.json`
- `packages/modules/inventory-costing/eslint.config.mjs`
- `packages/modules/inventory-costing/src/index.ts`
- `packages/modules/inventory-costing/src/types/costing.ts`

## Implementation

1. Create the directory structure following `modules-accounting` as a template
2. Add boundary rules in ESLint config (no apps/** imports, no sync packages)
3. Define initial type exports:
   - `CostLayer` - represents a cost transaction layer
   - `DeductionResult` - result of a stock deduction with cost
   - `CostMethod` - enum for costing methods (AVERAGE, SUM)

## Validation

```bash
npm run typecheck -w @jurnapod/modules-inventory-costing
npm run build -w @jurnapod/modules-inventory-costing
```

## Notes

This package should have NO dependency on:
- `apps/api` (forbidden by ADR-0014)
- `modules-accounting` (to avoid cycles)
- Sync transport packages (`pos-sync`, `backoffice-sync`)

It should only depend on:
- `@jurnapod/db`
- `@jurnapod/shared`