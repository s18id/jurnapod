# story-23.3.2: Extract orders/invoices to modules-sales

## Description
Move core order and invoice business logic from the API to the modules-sales package, establishing the sales domain boundary.

## Acceptance Criteria

- [ ] Core order + invoice business logic moved to `modules-sales`
- [ ] API route/libs remain HTTP adapters with Zod/auth/response only
- [ ] Posting integration uses accounting package interfaces (no reverse dependency)

## Files to Modify

- `packages/modules/sales/src/orders/*` (create)
- `packages/modules/sales/src/invoices/*` (create)
- `apps/api/src/lib/orders/*` (adapter/removal)
- `apps/api/src/lib/invoices/*` (adapter/removal)

## Dependencies

- story-23.3.1 (Sales package bootstrap must be complete)

## Estimated Effort

4 hours

## Priority

P1

## Validation Commands

```bash
cd /home/ahmad/jurnapod
npm run test:unit:sales -w @jurnapod/api
npm run typecheck -w @jurnapod/modules-sales
```

## Notes

Ensure no circular dependency is created with modules-accounting. Sales should use accounting interfaces, not concrete implementations.
