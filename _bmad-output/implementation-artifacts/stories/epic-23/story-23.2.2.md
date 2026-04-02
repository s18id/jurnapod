# story-23.2.2: Move reconciliation service to accounting package

## Description
Move reconciliation logic from the API to the modules-accounting package, maintaining GL source-of-truth semantics.

## Acceptance Criteria

- [ ] Reconciliation logic hosted in accounting package
- [ ] API invokes reconciliation through package interface only
- [ ] Reconciliation outputs still tie to GL source-of-truth semantics

## Files to Modify

- `packages/modules/accounting/src/reconciliation/*` (create)
- `apps/api/src/lib/reconciliation-service.ts` (adapter/removal)

## Dependencies

- story-23.2.1 (Posting engines extraction should be complete)

## Estimated Effort

3 hours

## Priority

P1

## Validation Commands

```bash
cd /home/ahmad/jurnapod
npm run typecheck -w @jurnapod/modules-accounting
npm run test:unit:single -w @jurnapod/api src/lib/reconciliation-service.test.ts
```

## Notes

Ensure reconciliation logic maintains proper GL tie-outs. This is financial-critical code.
