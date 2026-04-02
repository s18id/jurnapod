# story-23.3.1: modules-sales bootstrap + ACL interface seam

## Description
Bootstrap the modules-sales package with service interfaces and define the AccessScopeChecker injection boundary to prevent direct auth imports.

## Acceptance Criteria

- [ ] `modules-sales` defines service interfaces and `AccessScopeChecker` injection boundary
- [ ] No direct `@/lib/auth` import inside `modules-sales`
- [ ] One pilot flow (e.g., order creation orchestration skeleton) compiles via injected ACL

## Files to Modify

- `packages/modules/sales/src/interfaces/access-scope-checker.ts` (create)
- `packages/modules/sales/src/services/*` (create skeleton)
- `apps/api/src/lib/orders/*` (inject adapter)

## Dependencies

- story-23.0.3 (Package scaffolds must exist)
- story-23.2.3 (Accounting adapters should be thinned)

## Estimated Effort

3 hours

## Priority

P1

## Validation Commands

```bash
cd /home/ahmad/jurnapod
npm run typecheck -w @jurnapod/modules-sales
npm run typecheck -w @jurnapod/api
```

## Notes

The ACL interface seam is critical to prevent circular dependencies. Domain packages must not import API auth code directly.
